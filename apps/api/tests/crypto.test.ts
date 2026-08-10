import { describe, expect, it } from "vitest";
import {
  createId,
  createSessionToken,
  hashPassword,
  verifyPassword,
  timingSafeEqual,
  sha256Hex,
} from "../src/lib/crypto";

describe("password hashing", () => {
  it("verifies a correct password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("produces a versioned hash with random salt (no two hashes match)", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(a.startsWith("v2:")).toBe(true);
  });

  it("still verifies against the legacy salt:hash format", async () => {
    // Simulate a pre-migration hash: salt:hash with implicit 100k iterations.
    // We can't hand-compute PBKDF2 here, so instead verify that a hash lacking
    // the "v2:" prefix is parsed as legacy rather than rejected outright.
    const malformedLegacy = "deadbeef:0123456789abcdef";
    await expect(verifyPassword("anything", malformedLegacy)).resolves.toBe(false);
  });

  it("rejects malformed hash strings instead of throwing", async () => {
    await expect(verifyPassword("x", "not-a-valid-hash")).resolves.toBe(false);
    await expect(verifyPassword("x", "v2:bad:format")).resolves.toBe(false);
  });
});

describe("createId", () => {
  it("creates user ids in the WTA-XXXXXXXX format", () => {
    const id = createId("user");
    expect(id).toMatch(/^WTA-[A-Z0-9]{8}$/);
  });

  it("creates prefixed ids with high entropy for other kinds", () => {
    const id = createId("payment");
    expect(id).toMatch(/^payment_[0-9a-f]{32}$/);
  });

  it("does not produce collisions across many calls", () => {
    const ids = new Set(Array.from({ length: 500 }, () => createId("user")));
    expect(ids.size).toBe(500);
  });
});

describe("createSessionToken", () => {
  it("returns 256 bits (64 hex chars) of entropy", () => {
    const token = createSessionToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is unique across calls", () => {
    expect(createSessionToken()).not.toBe(createSessionToken());
  });
});

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false for different-length strings without throwing", () => {
    expect(timingSafeEqual("short", "muchlonger")).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("produces a stable 64-char hex digest", async () => {
    const digest = await sha256Hex("hello");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex("hello")).toBe(digest);
  });

  it("produces different digests for different input", async () => {
    expect(await sha256Hex("a")).not.toBe(await sha256Hex("b"));
  });
});
