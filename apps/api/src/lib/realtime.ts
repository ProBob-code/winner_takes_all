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

/** A feed is dropped this long after its last heartbeat. */
export const FEED_TTL_SECONDS = 90;

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
  startedAt: number;
};

// --- base64url helpers (no padding, URL-safe) ---

function toBase64Url(input: string): string {
  const b64 = btoa(input);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return atob(padded);
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
  const payload = toBase64Url(JSON.stringify(claims));
  const signature = await hmacSha256(secret, payload);
  return `${payload}.${signature}`;
}

/** Returns the claims when the token is authentic and unexpired, else null. */
export async function verifyBroadcastToken(
  secret: string,
  token: string,
  nowSeconds: number
): Promise<BroadcastClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const expected = await hmacSha256(secret, payload);
  if (!timingSafeEqual(expected, signature)) return null;

  let claims: BroadcastClaims;
  try {
    claims = JSON.parse(fromBase64Url(payload));
  } catch {
    return null;
  }

  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) return null;
  if (!claims.arenaId || !claims.matchId) return null;
  return claims;
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
  const res = await fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${config.appSecret}`,
      "Content-Type": "application/json",
    },
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

// --- Ephemeral feed registry (KV, TTL-expiring) ---

const feedKey = (arenaId: string, matchId: string, feedId: string) =>
  `feed:${arenaId}:${matchId}:${feedId}`;

const feedPrefix = (arenaId: string, matchId: string) => `feed:${arenaId}:${matchId}:`;

export async function putFeed(kv: KVNamespace, feed: StreamFeed): Promise<void> {
  await kv.put(feedKey(feed.arenaId, feed.matchId, feed.feedId), JSON.stringify(feed), {
    expirationTtl: FEED_TTL_SECONDS,
  });
}

export async function listFeeds(
  kv: KVNamespace,
  arenaId: string,
  matchId: string
): Promise<StreamFeed[]> {
  const { keys } = await kv.list({ prefix: feedPrefix(arenaId, matchId) });
  const feeds = await Promise.all(
    keys.map(async (k) => {
      const value = await kv.get(k.name);
      if (!value) return null;
      try {
        return JSON.parse(value) as StreamFeed;
      } catch {
        return null;
      }
    })
  );
  return feeds.filter((f): f is StreamFeed => f !== null).sort((a, b) => a.startedAt - b.startedAt);
}

export async function deleteFeed(
  kv: KVNamespace,
  arenaId: string,
  matchId: string,
  feedId: string
): Promise<void> {
  await kv.delete(feedKey(arenaId, matchId, feedId));
}
