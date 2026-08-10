/**
 * Fixed-window rate limiter backed by KV.
 *
 * KV is eventually consistent, so this is a soft limit — good enough to blunt
 * credential stuffing and endpoint abuse. For hard guarantees, front the
 * worker with Cloudflare WAF rate-limiting rules.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const windowId = Math.floor(Date.now() / 1000 / windowSeconds);
  const kvKey = `rl:${key}:${windowId}`;

  const raw = await kv.get(kvKey);
  const count = raw ? parseInt(raw, 10) || 0 : 0;

  if (count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  // Not atomic (KV has no increment), but each write extends the count and
  // the window key expires on its own. Good enough for abuse-blunting.
  await kv.put(kvKey, String(count + 1), {
    // KV minimum TTL is 60s.
    expirationTtl: Math.max(windowSeconds * 2, 60),
  });

  return { allowed: true, remaining: limit - count - 1 };
}

/** Extract the best-available client identifier for rate limiting. */
export function clientKey(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
