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
    throw new Error(data.message || `Request to ${path} failed (${res.status})`);
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
