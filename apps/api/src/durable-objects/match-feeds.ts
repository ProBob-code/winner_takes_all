/**
 * Coordination state for live streaming. Nothing here is media: the SFU
 * carries every stream, and this only records what a viewer needs in order to
 * subscribe, plus the short codes and request counters the flow depends on.
 *
 * Everything streaming touches lives here rather than in KV. Broadcaster
 * heartbeats, viewer polling and per-request rate limiting are all
 * high-frequency, and KV's free tier allows 1000 writes a day — a single match
 * exhausted it. Durable Objects have no equivalent per-day write budget.
 *
 * One instance serves each of three roles, addressed by name:
 *   feeds:<arenaId>:<matchId>  the cameras streaming one match
 *   code:<code>                one short broadcast code
 *   rate:<clientKey>           request counters for one client
 *
 * The class keeps its original name because renaming it would require a
 * Durable Object migration, which is not worth the deployment risk.
 */

export type StoredFeed = {
  feedId: string;
  arenaId: string;
  matchId: string;
  sessionId: string;
  trackNames: string[];
  label: string;
  broadcasterName?: string;
  startedAt: number;
  /** Unix seconds of the last heartbeat; drives expiry. */
  lastSeen: number;
};

/** A feed is considered gone this long after its last heartbeat. */
const FEED_STALE_SECONDS = 90;

export class MatchFeeds {
  private state: DurableObjectState;

  /**
   * Rate-limit counters, deliberately in memory rather than storage: they are
   * worthless a minute later, and keeping them out of storage means limiting a
   * request costs no write at all. Eviction resets them, which is acceptable
   * for a limit whose purpose is blunting abuse rather than exact accounting.
   */
  private buckets = new Map<string, { windowId: number; count: number }>();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }

  /** Read all feeds, dropping any whose heartbeat has lapsed. */
  private async liveFeeds(): Promise<StoredFeed[]> {
    const stored = await this.state.storage.list<StoredFeed>({ prefix: "feed:" });
    const cutoff = this.now() - FEED_STALE_SECONDS;

    const live: StoredFeed[] = [];
    const expired: string[] = [];

    for (const [key, feed] of stored) {
      if (feed.lastSeen >= cutoff) live.push(feed);
      else expired.push(key);
    }

    // Expiry is lazy: nothing needs a timer, and a match nobody looks at costs
    // nothing until someone does.
    if (expired.length) await this.state.storage.delete(expired);

    return live.sort((a, b) => a.startedAt - b.startedAt);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    // --- Camera feeds for one match ---

    if (request.method === "GET" && url.pathname === "/list") {
      return json({ ok: true, feeds: await this.liveFeeds() });
    }

    if (request.method === "POST" && url.pathname === "/put") {
      const incoming = (await request.json()) as Omit<StoredFeed, "lastSeen" | "startedAt"> &
        Partial<Pick<StoredFeed, "startedAt">>;

      const key = `feed:${incoming.feedId}`;
      const existing = await this.state.storage.get<StoredFeed>(key);

      const feed: StoredFeed = {
        ...incoming,
        // Keep the original start time across heartbeats so ordering is stable.
        startedAt: existing?.startedAt ?? incoming.startedAt ?? this.now(),
        lastSeen: this.now(),
      };

      await this.state.storage.put(key, feed);
      return json({ ok: true, feed });
    }

    if (request.method === "POST" && url.pathname === "/delete") {
      const { feedId } = (await request.json()) as { feedId: string };
      await this.state.storage.delete(`feed:${feedId}`);
      return json({ ok: true });
    }

    // --- Short broadcast codes ---

    if (request.method === "POST" && url.pathname === "/code/put") {
      const { record, ttlSeconds } = (await request.json()) as {
        record: unknown;
        ttlSeconds: number;
      };
      await this.state.storage.put("code", {
        record,
        expiresAt: this.now() + Math.max(ttlSeconds, 60),
      });
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/code/get") {
      const stored = await this.state.storage.get<{ record: unknown; expiresAt: number }>("code");
      if (!stored || stored.expiresAt <= this.now()) {
        if (stored) await this.state.storage.delete("code");
        return json({ ok: false });
      }
      return json({ ok: true, record: stored.record });
    }

    // --- Rate limiting ---

    if (request.method === "POST" && url.pathname === "/rate") {
      const { bucket, limit, windowSeconds } = (await request.json()) as {
        bucket: string;
        limit: number;
        windowSeconds: number;
      };

      const windowId = Math.floor(Date.now() / 1000 / windowSeconds);
      const current = this.buckets.get(bucket);

      if (!current || current.windowId !== windowId) {
        this.buckets.set(bucket, { windowId, count: 1 });
        return json({ ok: true, allowed: true });
      }
      if (current.count >= limit) {
        return json({ ok: true, allowed: false });
      }
      current.count += 1;
      return json({ ok: true, allowed: true });
    }

    return json({ ok: false, message: "Not found" }, 404);
  }
}
