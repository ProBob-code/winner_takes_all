/**
 * A durable write queue for scoring, so a dropped connection cannot cost a
 * frame.
 *
 * WHY THIS EXISTS
 * Two of the twenty buyers on the panel refused the product outright over
 * "what happens when the internet drops mid-tournament", and both named
 * reputational damage rather than money as the cost: the owner looks
 * incompetent in front of forty regulars. A bar's wifi is the least reliable
 * part of this product and the one we do not control.
 *
 * WHAT IT GUARANTEES
 * 1. A tap is never lost. It is written to IndexedDB before the request is
 *    attempted, so it survives the request failing, the tab being closed, the
 *    phone locking, and the browser being killed.
 * 2. A tap is never applied twice. Each carries an `eventId` the server claims
 *    exactly once, so replaying the queue after a flaky connection cannot
 *    count a second ball. See the API's claimScoreEvent.
 * 3. Order is preserved. Entries are replayed in the sequence they were made,
 *    one at a time, because two taps against the same frame are not
 *    commutative — a BLACK after seven balls wins the rack and a BLACK before
 *    them loses it.
 *
 * WHAT IT DOES NOT DO
 * It does not pretend the tournament can be run entirely offline. Drawing a
 * knockout round, settling a final and paying a prize all need the server.
 * What it protects is the one thing that cannot wait: putting a score on the
 * board while the frame is being played.
 */

import { backendFetch } from "./backend";

const DB_NAME = "wta-outbox";
const DB_VERSION = 1;
const STORE = "writes";
/** Where the queue lives when IndexedDB is unavailable. */
const FALLBACK_KEY = "wta-outbox-fallback";

export interface OutboxEntry {
  /** Monotonic, assigned on write. Replay order. */
  seq: number;
  /** The id the server de-duplicates on. */
  eventId: string;
  path: string;
  body: unknown;
  createdAt: number;
  tries: number;
  lastError?: string;
  /** What this entry was, for the pending list a human reads. */
  label?: string;
}

export interface OutboxStatus {
  pending: number;
  /** Mid-flush right now. */
  sending: boolean;
  online: boolean;
  /** Why the last attempt failed, if it did. Cleared by a success. */
  lastError: string | null;
  /** When the queue was last fully drained. */
  drainedAt: number | null;
}

type Listener = (status: OutboxStatus) => void;

/**
 * A tap's id.
 *
 * `crypto.randomUUID` is not available in every browser this has to run in —
 * notably older Safari, which is a real share of the phones behind a bar — so
 * there is a fallback built from getRandomValues, and a last resort built from
 * the clock. The id only has to be unique, not unguessable.
 */
export function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    /* fall through */
  }
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// ── Storage ─────────────────────────────────────────────────────────────────
//
// IndexedDB where it works, localStorage where it does not. A private window,
// blocked site data or a browser in a weird state can refuse either, and the
// queue degrades to memory rather than throwing: a tap held only in memory is
// worse than one held on disk, and far better than one rejected outright.

let dbPromise: Promise<IDBDatabase | null> | null = null;
let memoryQueue: OutboxEntry[] = [];
let memoryOnly = false;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "seq", autoIncrement: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      // A browser that never answers must not hang the first score tap.
      setTimeout(() => resolve(request.readyState === "done" ? request.result ?? null : null), 2000);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function readFallback(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

function writeFallback(entries: OutboxEntry[]): boolean {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

async function putEntry(entry: Omit<OutboxEntry, "seq">): Promise<OutboxEntry> {
  const db = await openDb();
  if (db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const request = tx.objectStore(STORE).add(entry);
      request.onsuccess = () => resolve({ ...entry, seq: Number(request.result) });
      request.onerror = () => reject(request.error);
    });
  }

  // Sequence numbers have to keep climbing across reloads, or a replayed queue
  // comes back in the wrong order.
  const existing = readFallback();
  const seq = (existing[existing.length - 1]?.seq ?? 0) + 1;
  const row = { ...entry, seq };
  const stored = writeFallback([...existing, row]);
  if (!stored) {
    memoryOnly = true;
    memoryQueue = [...memoryQueue, row];
  }
  return row;
}

async function allEntries(): Promise<OutboxEntry[]> {
  if (memoryOnly) return [...memoryQueue].sort((a, b) => a.seq - b.seq);

  const db = await openDb();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () =>
        resolve((request.result as OutboxEntry[]).sort((a, b) => a.seq - b.seq));
      request.onerror = () => resolve([]);
    });
  }
  return readFallback().sort((a, b) => a.seq - b.seq);
}

async function dropEntry(seq: number): Promise<void> {
  if (memoryOnly) {
    memoryQueue = memoryQueue.filter((e) => e.seq !== seq);
    return;
  }
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(seq);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    return;
  }
  writeFallback(readFallback().filter((e) => e.seq !== seq));
}

async function updateEntry(entry: OutboxEntry): Promise<void> {
  if (memoryOnly) {
    memoryQueue = memoryQueue.map((e) => (e.seq === entry.seq ? entry : e));
    return;
  }
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    return;
  }
  writeFallback(readFallback().map((e) => (e.seq === entry.seq ? entry : e)));
}

// ── Status ──────────────────────────────────────────────────────────────────

const listeners = new Set<Listener>();

let status: OutboxStatus = {
  pending: 0,
  sending: false,
  online: true,
  lastError: null,
  drainedAt: null,
};

function publish(patch: Partial<OutboxStatus>) {
  status = { ...status, ...patch };
  for (const listener of listeners) {
    try {
      listener(status);
    } catch {
      /* a broken subscriber must not stop the queue */
    }
  }
}

export function getOutboxStatus(): OutboxStatus {
  return status;
}

export function subscribeToOutbox(listener: Listener): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

async function refreshPending(): Promise<number> {
  const pending = (await allEntries()).length;
  publish({ pending });
  return pending;
}

// ── Sending ─────────────────────────────────────────────────────────────────

/**
 * Whether a failed attempt is worth repeating.
 *
 * A 4xx means the server understood and refused: replaying it will be refused
 * again, so it is dropped rather than left to block everything behind it. The
 * exceptions are the two that mean "not now": 408 and 429. Anything else — a
 * 5xx, a timeout, a thrown fetch — is the network or the server having a bad
 * moment, and is retried.
 */
function isPermanentFailure(statusCode: number): boolean {
  // 401 is a lapsed sign-in, not a refused score: signing in again makes the
  // same request good. It used to count as permanent, so a session that ran
  // out mid-night silently threw away every tap made after it.
  if (statusCode === 401 || statusCode === 408 || statusCode === 429) return false;
  return statusCode >= 400 && statusCode < 500;
}

let flushing: Promise<void> | null = null;

/**
 * Send everything queued, oldest first, stopping at the first entry that
 * cannot go through.
 *
 * Stopping rather than skipping is deliberate. Two taps against one frame are
 * not interchangeable, so an entry that cannot be sent holds the ones behind
 * it until it can.
 */
export function flushOutbox(): Promise<void> {
  if (flushing) return flushing;

  flushing = (async () => {
    publish({ sending: true });
    try {
      const entries = await allEntries();
      if (entries.length === 0) {
        publish({ pending: 0, lastError: null, drainedAt: Date.now() });
        return;
      }

      for (const entry of entries) {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          publish({ online: false });
          return;
        }

        let response: Response;
        try {
          response = await backendFetch(entry.path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry.body),
          });
        } catch {
          // The network. Leave the entry where it is and stop; the retry will
          // pick it up from here, in order.
          await updateEntry({
            ...entry,
            tries: entry.tries + 1,
            lastError: "Could not reach the server",
          });
          publish({
            online: false,
            lastError: "Waiting for a connection. Scores are saved on this device.",
          });
          return;
        }

        if (response.ok) {
          await dropEntry(entry.seq);
          publish({ online: true, lastError: null });
          continue;
        }

        if (isPermanentFailure(response.status)) {
          // The server refused it and always will. Dropping it is the only way
          // the rest of the queue ever moves; the error is kept so a host is
          // told rather than left wondering.
          let message = `The server rejected a score (HTTP ${response.status}).`;
          try {
            const payload: any = await response.json();
            if (payload?.message) message = payload.message;
          } catch {
            /* no JSON body */
          }
          await dropEntry(entry.seq);
          publish({ lastError: message });
          continue;
        }

        await updateEntry({
          ...entry,
          tries: entry.tries + 1,
          lastError: `HTTP ${response.status}`,
        });
        publish({
          lastError:
            response.status === 401
              ? "Your sign-in has lapsed. Sign in again on this phone and the scores waiting here will be sent."
              : "The server is not answering. Scores are saved on this device.",
        });
        return;
      }

      const left = await refreshPending();
      if (left === 0) publish({ lastError: null, drainedAt: Date.now() });
    } finally {
      publish({ sending: false });
      await refreshPending();
      flushing = null;
    }
  })();

  return flushing;
}

/**
 * Queue one write and try to send it immediately.
 *
 * Returns as soon as it is safely on disk, not when the server has it. That is
 * the whole point: a score tap must not wait on a bar's wifi.
 */
export async function enqueueWrite(args: {
  path: string;
  body: Record<string, unknown>;
  eventId?: string;
  label?: string;
}): Promise<{ eventId: string; queued: number }> {
  const eventId = args.eventId ?? newEventId();

  await putEntry({
    eventId,
    path: args.path,
    // The id travels in the body, which is what the server claims on.
    body: { ...args.body, eventId },
    createdAt: Date.now(),
    tries: 0,
    label: args.label,
  });

  const queued = await refreshPending();
  // Deliberately not awaited: the caller gets control back at once.
  void flushOutbox();
  return { eventId, queued };
}

/** What is still waiting, for a host who wants to see it. */
export async function pendingWrites(): Promise<OutboxEntry[]> {
  return allEntries();
}

/**
 * Throw the queue away.
 *
 * Only ever offered to a host looking at a queue that cannot drain — a
 * tournament deleted from under it, say. It loses scores, so the UI that calls
 * this says so first.
 */
export async function discardOutbox(): Promise<void> {
  const entries = await allEntries();
  for (const entry of entries) await dropEntry(entry.seq);
  memoryQueue = [];
  publish({ pending: 0, lastError: null });
}

// ── Keeping it moving ───────────────────────────────────────────────────────

let started = false;

/**
 * Start replaying in the background.
 *
 * Three triggers, because no one of them is reliable: the `online` event is
 * not fired by every browser in every case, a phone coming out of a locked
 * pocket fires `visibilitychange` instead, and a connection that is nominally
 * up but not working needs the timer. Idempotent, so every component that
 * cares can call it.
 */
export function startOutbox(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  publish({ online: navigator.onLine !== false });

  window.addEventListener("online", () => {
    publish({ online: true });
    void flushOutbox();
  });
  window.addEventListener("offline", () => publish({ online: false }));

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushOutbox();
  });

  // Fifteen seconds: often enough that a host watching the screen sees the
  // queue drain on its own, rare enough to cost nothing.
  window.setInterval(() => {
    if (status.pending > 0) void flushOutbox();
  }, 15_000);

  void flushOutbox();
}
