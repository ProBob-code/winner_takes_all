import { describe, expect, it } from "vitest";
import { checkRateLimit, clientKey } from "../src/lib/rate-limit";

/** Minimal in-memory stand-in for the KV surface checkRateLimit relies on. */
function fakeKV() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  } as unknown as KVNamespace;
}

describe("checkRateLimit", () => {
  it("allows requests under the limit", async () => {
    const kv = fakeKV();
    const first = await checkRateLimit(kv, "login:1.2.3.4", 3, 60);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);
  });

  it("blocks once the limit is reached", async () => {
    const kv = fakeKV();
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(kv, "login:1.2.3.4", 3, 60);
    }
    const blocked = await checkRateLimit(kv, "login:1.2.3.4", 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("tracks separate buckets independently", async () => {
    const kv = fakeKV();
    await checkRateLimit(kv, "login:1.2.3.4", 1, 60);
    const otherIp = await checkRateLimit(kv, "login:5.6.7.8", 1, 60);
    expect(otherIp.allowed).toBe(true);
  });
});

describe("clientKey", () => {
  it("prefers CF-Connecting-IP", () => {
    const req = new Request("https://example.com", {
      headers: { "CF-Connecting-IP": "1.1.1.1", "X-Forwarded-For": "2.2.2.2" },
    });
    expect(clientKey(req)).toBe("1.1.1.1");
  });

  it("falls back to the first X-Forwarded-For entry", () => {
    const req = new Request("https://example.com", {
      headers: { "X-Forwarded-For": "3.3.3.3, 4.4.4.4" },
    });
    expect(clientKey(req)).toBe("3.3.3.3");
  });

  it("falls back to 'unknown' when no IP header is present", () => {
    const req = new Request("https://example.com");
    expect(clientKey(req)).toBe("unknown");
  });
});
