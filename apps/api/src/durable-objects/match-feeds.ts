/**
 * Live camera feeds for one match.
 *
 * Feed presence is high-frequency, short-lived coordination state: every
 * broadcaster refreshes its entry on a heartbeat, and every viewer polls the
 * list. That is the wrong shape for KV, whose free tier allows 1000 writes a
 * day — a single match with a few cameras exhausted it. Durable Object storage
 * has no such per-day write budget and gives a single consistent view per
 * match, so heartbeats can be frequent and precise again.
 *
 * One instance per arena+match. Nothing here touches media: the SFU carries
 * every stream and this only records which session and tracks to subscribe to.
 */

export type StoredFeed = {
  feedId: string;
  arenaId: string;
  matchId: string;
  sessionId: string;
  trackNames: string[];
  label: string;
  startedAt: number;
  /** Unix seconds of the last heartbeat; drives expiry. */
  lastSeen: number;
};

/** A feed is considered gone this long after its last heartbeat. */
const FEED_STALE_SECONDS = 300;

export class MatchFeeds {
  private state: DurableObjectState;

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

    return json({ ok: false, message: "Not found" }, 404);
  }
}
