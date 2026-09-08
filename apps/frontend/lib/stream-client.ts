/**
 * WebRTC client for live match streaming.
 *
 * All SDP goes through our Worker, which forwards it to the Cloudflare Realtime
 * SFU — the app secret never reaches the browser. Nothing is recorded: the
 * broadcaster holds a PeerConnection for as long as the match runs and the feed
 * disappears from the registry as soon as heartbeats stop.
 */

import { getApiUrl, readJsonResponse } from "./api-config";

export type StreamFeed = {
  feedId: string;
  arenaId: string;
  matchId: string;
  sessionId: string;
  trackNames: string[];
  label: string;
  startedAt: number;
};

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || getApiUrl();
}

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: path === "/api/stream/renegotiate" ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await readJsonResponse(res);
  if (!res.ok || data.ok === false) {
    // The media server's own explanation is the useful part when a call is
    // rejected; without it the message says only that something failed.
    const upstream =
      data.detail && typeof data.detail === "object"
        ? (data.detail.errorDescription || data.detail.error || JSON.stringify(data.detail))
        : data.detail;
    const base = data.message || `Request to ${path} failed (${res.status})`;
    throw new Error(upstream ? `${base} ${String(upstream).slice(0, 300)}` : base);
  }
  return data;
}

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: "max-bundle" });
}

/**
 * ICE candidates are gathered before the offer leaves the browser, because the
 * SFU's HTTP API takes one complete SDP rather than trickled candidates.
 */
function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 4000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    pc.addEventListener("icegatheringstatechange", check);
    // Don't block the whole publish on a slow/blocked candidate.
    const timer = setTimeout(done, timeoutMs);
  });
}

export type PublishResult = {
  sessionId: string;
  trackNames: string[];
};

/** Publish local camera/mic tracks and return the ids viewers subscribe to. */
export async function publishStream(
  pc: RTCPeerConnection,
  stream: MediaStream
): Promise<PublishResult> {
  const trackNames: string[] = [];
  for (const track of stream.getTracks()) {
    pc.addTransceiver(track, { direction: "sendonly", streams: [stream] });
    trackNames.push(track.kind);
  }

  const session = await post("/api/stream/session", {});
  const sessionId: string = session.sessionId;

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);

  const localSdp = pc.localDescription!;
  const transceivers = pc.getTransceivers().filter((t) => t.sender.track);

  const result = await post("/api/stream/tracks", {
    sessionId,
    sessionDescription: { sdp: localSdp.sdp, type: "offer" },
    tracks: transceivers.map((t) => ({
      location: "local" as const,
      trackName: t.sender.track!.kind,
      mid: t.mid ?? undefined,
    })),
  });

  if (result.sessionDescription) {
    await pc.setRemoteDescription(result.sessionDescription);
  }

  const published: string[] = (result.tracks || []).map((t: any) => t.trackName).filter(Boolean);
  return { sessionId, trackNames: published.length ? published : trackNames };
}

/** Subscribe to another session's tracks; resolves once media is attached. */
export async function subscribeToFeed(
  pc: RTCPeerConnection,
  feed: StreamFeed
): Promise<MediaStream> {
  const remoteStream = new MediaStream();

  const streamReady = new Promise<MediaStream>((resolve) => {
    let resolved = false;
    pc.ontrack = (event) => {
      remoteStream.addTrack(event.track);
      if (!resolved) {
        resolved = true;
        resolve(remoteStream);
      }
    };
  });

  const session = await post("/api/stream/session", {});
  const sessionId: string = session.sessionId;

  const result = await post("/api/stream/tracks", {
    sessionId,
    tracks: feed.trackNames.map((trackName) => ({
      location: "remote" as const,
      trackName,
      sessionId: feed.sessionId,
    })),
  });

  // Subscribing yields a server offer that we must answer.
  if (result.sessionDescription) {
    await pc.setRemoteDescription(result.sessionDescription);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGathering(pc);

    await post("/api/stream/renegotiate", {
      sessionId,
      sessionDescription: { sdp: pc.localDescription!.sdp, type: "answer" },
    });
  }

  return streamReady;
}

export async function registerFeed(input: {
  token: string;
  sessionId: string;
  trackNames: string[];
  label: string;
  feedId?: string;
}): Promise<StreamFeed> {
  const data = await post("/api/stream/feeds", input);
  return data.feed as StreamFeed;
}

export async function endFeed(input: {
  token: string;
  sessionId: string;
  trackNames: string[];
  label: string;
  feedId: string;
}): Promise<void> {
  await post("/api/stream/feeds/end", input);
}

/**
 * Release published tracks at the SFU. Never throws: this runs during
 * teardown, often while the page is going away, and a failure changes
 * nothing the caller can act on.
 */
export async function closeTracks(sessionId: string, trackNames: string[]): Promise<void> {
  try {
    await post("/api/stream/tracks/close", { sessionId, trackNames });
  } catch {
    /* best effort */
  }
}

/**
 * Fire-and-forget cleanup for a page that is being closed. Normal fetches are
 * cancelled when the document unloads, so the feed would linger until its TTL;
 * sendBeacon is delivered by the browser after the page is gone.
 */
export function beaconEndFeed(input: {
  token: string;
  sessionId: string;
  trackNames: string[];
  label: string;
  feedId: string;
}): void {
  try {
    const body = new Blob([JSON.stringify(input)], { type: "application/json" });
    navigator.sendBeacon?.(`${apiBase()}/api/stream/feeds/end`, body);
  } catch {
    /* best effort */
  }
}

/**
 * Recover a connection whose ICE has failed — switching between wifi and
 * mobile data mid-match is routine at a ground, and without a restart the
 * stream simply stops with no visible cause.
 */
export async function restartIce(pc: RTCPeerConnection, sessionId: string): Promise<void> {
  const offer = await pc.createOffer({ iceRestart: true });
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);

  await post("/api/stream/renegotiate", {
    sessionId,
    sessionDescription: { sdp: pc.localDescription!.sdp, type: "offer" },
  });
}

export async function fetchFeeds(arenaId: string, matchId: string): Promise<StreamFeed[]> {
  const res = await fetch(
    `${apiBase()}/api/stream/feeds?arenaId=${encodeURIComponent(arenaId)}&matchId=${encodeURIComponent(matchId)}`,
    { cache: "no-store", credentials: "include" }
  );
  if (!res.ok) return [];
  try {
    const data = await readJsonResponse(res);
    return data.ok ? (data.feeds as StreamFeed[]) : [];
  } catch {
    // A misconfigured API should not spam the viewer with errors every poll.
    return [];
  }
}

// --- Data usage ---
//
// Cloudflare Realtime bills on egress, so it is worth showing people how much
// their stream is actually moving. These numbers come from the browser's own
// WebRTC counters; nothing is reported to or stored on the server.

export type TransportStats = {
  /** Total bytes moved by this peer connection so far. */
  bytes: number;
  /** Instantaneous rate over the last sampling window. */
  kbps: number;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Poll a peer connection's byte counters. Returns an unsubscribe function.
 * `direction` picks outbound (broadcaster) or inbound (viewer) RTP streams.
 */
export function watchTransportStats(
  pc: RTCPeerConnection,
  direction: "outbound" | "inbound",
  onUpdate: (stats: TransportStats) => void,
  intervalMs = 2000
): () => void {
  const wanted = direction === "outbound" ? "outbound-rtp" : "inbound-rtp";
  const field = direction === "outbound" ? "bytesSent" : "bytesReceived";

  let lastBytes = 0;
  let lastAt = Date.now();
  let stopped = false;

  const sample = async () => {
    if (stopped || pc.connectionState === "closed") return;

    let total = 0;
    try {
      const report = await pc.getStats();
      report.forEach((entry: any) => {
        if (entry.type === wanted && typeof entry[field] === "number") {
          total += entry[field];
        }
      });
    } catch {
      return; // stats are best-effort
    }

    const now = Date.now();
    const elapsed = (now - lastAt) / 1000;
    // Guard the first sample and any clock oddity so we never emit Infinity.
    const kbps = elapsed > 0 && lastBytes > 0 ? ((total - lastBytes) * 8) / 1000 / elapsed : 0;

    lastBytes = total;
    lastAt = now;
    onUpdate({ bytes: total, kbps: Math.max(0, Math.round(kbps)) });
  };

  sample();
  const id = setInterval(sample, intervalMs);

  return () => {
    stopped = true;
    clearInterval(id);
  };
}
