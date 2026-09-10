/**
 * Live match streaming via Cloudflare Realtime (SFU).
 *
 * Media never touches this Worker and is never recorded: broadcasters publish
 * straight to the SFU and viewers subscribe from it. All this module holds is
 * short-lived *metadata* (which session/track belongs to which match) in KV
 * with a TTL, so feeds disappear on their own when a phone stops heartbeating.
 */

import { hmacSha256, timingSafeEqual } from "./crypto";

/** Broadcast links die quickly; a match-long link that leaks is a liability. */
export const BROADCAST_TOKEN_TTL_SECONDS = 3 * 60 * 60;

/**
 * A feed is dropped this long after its last heartbeat.
 *
 * Every heartbeat is a KV write, and the free tier allows 1000 writes a day,
 * so this window is deliberately generous: it trades a few minutes of a dead
 * feed lingering in the list for an order of magnitude fewer writes. The
 * viewer side already drops a feed whose media stops arriving.
 */
export const FEED_TTL_SECONDS = 300;

export type BroadcastClaims = {
  arenaId: string;
  matchId: string;
  /** Unix seconds. */
  exp: number;
};

export type StreamFeed = {
  feedId: string;
  arenaId: string;
  matchId: string;
  sessionId: string;
  trackNames: string[];
  /** Viewer-facing name, e.g. "Behind the goal". */
  label: string;
  /** Who put this camera on air. */
  broadcasterName?: string;
  startedAt: number;
};

/**
 * Tokens travel inside a QR code, so every byte counts: the whole broadcast
 * URL has to stay inside the QR encoder's capacity. A JSON+base64 envelope
 * with a full hex HMAC pushed it to 213 bytes, exactly the limit, which made
 * the code fail to render for any slightly longer arena or match id.
 *
 * Format: `<arenaId>.<matchId>.<exp>.<sig>`. Match ids are generated with
 * Math.random() and therefore *do* contain dots, so the parts are read
 * positionally from both ends rather than by splitting into a fixed count:
 * arena id first, signature and expiry last, match id whatever lies between.
 * Arena ids are restricted to letters, digits, - and _, so the first segment
 * is never ambiguous.
 *
 * The signature is HMAC-SHA256 truncated to 128 bits, which is ample for a
 * capability that expires in hours and is the standard HMAC-SHA256-128
 * construction.
 */
const SIGNATURE_HEX_CHARS = 32;

function claimsMessage(arenaId: string, matchId: string, exp: number): string {
  return `${arenaId}.${matchId}.${exp}`;
}

/**
 * Mint a signed token authorising exactly one match's broadcast.
 * The QR encodes this, so only people the host physically showed the code to
 * can publish, and the grant expires with the match.
 */
export async function signBroadcastToken(
  secret: string,
  claims: BroadcastClaims
): Promise<string> {
  const message = claimsMessage(claims.arenaId, claims.matchId, claims.exp);
  const signature = (await hmacSha256(secret, message)).slice(0, SIGNATURE_HEX_CHARS);
  return `${message}.${signature}`;
}

/** Returns the claims when the token is authentic and unexpired, else null. */
export async function verifyBroadcastToken(
  secret: string,
  token: string,
  nowSeconds: number
): Promise<BroadcastClaims | null> {
  const parts = token.split(".");
  // At least arenaId, one match-id segment, exp and sig. A match id containing
  // dots simply yields more segments in the middle.
  if (parts.length < 4) return null;

  const arenaId = parts[0];
  const signature = parts[parts.length - 1];
  const expRaw = parts[parts.length - 2];
  const matchId = parts.slice(1, -2).join(".");
  if (!arenaId || !matchId) return null;

  const exp = Number(expRaw);
  if (!Number.isInteger(exp)) return null;

  const expected = (await hmacSha256(secret, claimsMessage(arenaId, matchId, exp))).slice(
    0,
    SIGNATURE_HEX_CHARS
  );
  if (!timingSafeEqual(expected, signature)) return null;

  if (exp <= nowSeconds) return null;
  return { arenaId, matchId, exp };
}

// --- Cloudflare Realtime SFU ---

/**
 * Default SFU origin. Kept configurable because the host is deployment
 * specific — override with the REALTIME_API_BASE var rather than editing code.
 */
export const DEFAULT_REALTIME_API_BASE = "https://rtc.live.cloudflare.com/v1";

export type RealtimeConfig = {
  appId: string;
  appSecret: string;
  apiBase: string;
};

export function realtimeConfig(env: {
  REALTIME_APP_ID?: string;
  REALTIME_APP_SECRET?: string;
  REALTIME_API_BASE?: string;
}): RealtimeConfig | null {
  if (!env.REALTIME_APP_ID || !env.REALTIME_APP_SECRET) return null;
  return {
    appId: env.REALTIME_APP_ID,
    appSecret: env.REALTIME_APP_SECRET,
    apiBase: env.REALTIME_API_BASE || DEFAULT_REALTIME_API_BASE,
  };
}

/**
 * Proxy a call to the SFU. The app secret stays server-side; the browser only
 * ever exchanges SDP through this Worker.
 */
export async function callRealtime(
  config: RealtimeConfig,
  path: string,
  init: { method: "GET" | "POST" | "PUT"; body?: unknown }
): Promise<{ status: number; body: any }> {
  const url = `${config.apiBase}/apps/${config.appId}${path}`;

  // Send no body — and no JSON content type — when there is nothing to send.
  // sessions/new takes no payload, and posting an empty object with a JSON
  // content type makes the SFU answer 400.
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.appSecret}`,
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

// --- Short broadcast codes ---
//
// The QR carries the URL, and a shorter URL is a smaller, far more scannable
// symbol: the full signed link is a 49x49 version 8 code, while a short code
// fits in roughly 29x29. The code is a lookup key for the real token, stored
// with the same lifetime as the token itself, and is written once per QR
// rather than on any repeating cadence.

const BROADCAST_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1

/** Length is a trade: short enough to read off a screen and type, long
 *  enough that guessing is hopeless. Six characters of this 32-symbol
 *  alphabet is about a billion combinations, and codes expire with the
 *  broadcast grant they stand for. */
export const BROADCAST_CODE_LENGTH = 6;

/**
 * How long a displayed code stays redeemable.
 *
 * The host's screen rotates the code every minute, so a code only has to
 * outlive the rotation that replaced it — long enough for someone mid-way
 * through typing, short enough that a photograph of the screen is useless
 * soon after. The broadcast token it stands for keeps its own longer life, so
 * rotation never interrupts a camera already on air.
 */
export const BROADCAST_CODE_TTL_SECONDS = 150;

export function createBroadcastCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(BROADCAST_CODE_LENGTH));
  return Array.from(bytes, (b) => BROADCAST_CODE_ALPHABET[b % BROADCAST_CODE_ALPHABET.length]).join("");
}

/** Accept what someone typed: any case, with spaces or dashes ignored. */
export function normaliseBroadcastCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export type BroadcastCodeRecord = {
  arenaId: string;
  matchId: string;
  token: string;
};

function codeStub(ns: DurableObjectNamespace, code: string) {
  return ns.get(ns.idFromName(`code:${code}`));
}

export async function putBroadcastCode(
  ns: DurableObjectNamespace,
  code: string,
  record: BroadcastCodeRecord,
  ttlSeconds: number
): Promise<void> {
  await codeStub(ns, code).fetch("https://match-feeds/code/put", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ record, ttlSeconds }),
  });
}

export async function getBroadcastCode(
  ns: DurableObjectNamespace,
  code: string
): Promise<BroadcastCodeRecord | null> {
  const res = await codeStub(ns, code).fetch("https://match-feeds/code/get");
  const data: any = await res.json();
  return data?.ok ? (data.record as BroadcastCodeRecord) : null;
}

/**
 * Rate limit without touching KV. Counters live in the Durable Object's
 * memory, so limiting a streaming request costs no write at all.
 */
export async function checkStreamRateLimit(
  ns: DurableObjectNamespace,
  clientKey: string,
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const stub = ns.get(ns.idFromName(`rate:${clientKey}`));
  const res = await stub.fetch("https://match-feeds/rate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, limit, windowSeconds }),
  });
  const data: any = await res.json();
  return data?.allowed !== false;
}

// --- Feed registry (Durable Object, one per match) ---
//
// Heartbeats and viewer polling are far too frequent for KV's daily write
// budget, so this state lives in a Durable Object instead. Nothing stored here
// is media; it is only the session and track ids a viewer needs to subscribe.

function matchFeedsStub(ns: DurableObjectNamespace, arenaId: string, matchId: string) {
  return ns.get(ns.idFromName(`${arenaId}:${matchId}`));
}

async function callFeeds(
  ns: DurableObjectNamespace,
  arenaId: string,
  matchId: string,
  path: string,
  init?: { method: "GET" | "POST"; body?: unknown }
): Promise<any> {
  const stub = matchFeedsStub(ns, arenaId, matchId);
  const res = await stub.fetch(`https://match-feeds${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return res.json();
}

export async function putFeed(ns: DurableObjectNamespace, feed: StreamFeed): Promise<void> {
  await callFeeds(ns, feed.arenaId, feed.matchId, "/put", { method: "POST", body: feed });
}

export async function listFeeds(
  ns: DurableObjectNamespace,
  arenaId: string,
  matchId: string
): Promise<StreamFeed[]> {
  const data = await callFeeds(ns, arenaId, matchId, "/list");
  return data?.ok ? (data.feeds as StreamFeed[]) : [];
}

export async function deleteFeed(
  ns: DurableObjectNamespace,
  arenaId: string,
  matchId: string,
  feedId: string
): Promise<void> {
  await callFeeds(ns, arenaId, matchId, "/delete", { method: "POST", body: { feedId } });
}
