import { beforeAll, describe, expect, it } from "vitest";
import { verifyGoogleIdToken, GoogleTokenError, type GoogleJwk } from "../src/lib/google";

const CLIENT = "123-abc.apps.googleusercontent.com";
const NOW = 1_800_000_000;

let pair: CryptoKeyPair;
let jwk: GoogleJwk;
const keys = async () => [jwk];

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (obj: unknown) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

async function sign(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", kid: "k1", typ: "JWT" }, key = pair.privateKey) {
  const body = `${enc(header)}.${enc(payload)}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}

const good = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: CLIENT,
  sub: "1098",
  email: "Ava.Chen@Gmail.com",
  email_verified: true,
  name: "Ava Chen",
  iat: NOW - 10,
  exp: NOW + 3600,
  ...over,
});

beforeAll(async () => {
  pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  jwk = { kid: "k1", kty: "RSA", n: pub.n!, e: pub.e!, alg: "RS256" };
});

describe("verifyGoogleIdToken", () => {
  it("accepts a genuine token and lower-cases the email", async () => {
    const who = await verifyGoogleIdToken(await sign(good()), CLIENT, keys, NOW);
    expect(who).toEqual({ sub: "1098", email: "ava.chen@gmail.com", name: "Ava Chen" });
  });

  it("rejects a token for another site", async () => {
    await expect(verifyGoogleIdToken(await sign(good({ aud: "other" })), CLIENT, keys, NOW)).rejects.toThrow(GoogleTokenError);
  });

  it("rejects a token from anyone but Google", async () => {
    await expect(verifyGoogleIdToken(await sign(good({ iss: "https://evil.example" })), CLIENT, keys, NOW)).rejects.toThrow("Wrong issuer");
  });

  it("rejects an expired token", async () => {
    await expect(verifyGoogleIdToken(await sign(good({ exp: NOW - 120 })), CLIENT, keys, NOW)).rejects.toThrow("Token expired");
  });

  it("rejects an unverified email", async () => {
    await expect(verifyGoogleIdToken(await sign(good({ email_verified: false })), CLIENT, keys, NOW)).rejects.toThrow("Email not verified");
  });

  it("rejects a payload changed after signing", async () => {
    const [h, , s] = (await sign(good())).split(".");
    const forged = `${h}.${enc(good({ email: "victim@gmail.com" }))}.${s}`;
    await expect(verifyGoogleIdToken(forged, CLIENT, keys, NOW)).rejects.toThrow("Bad signature");
  });

  it("rejects a token signed by some other key", async () => {
    const other = (await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    )) as CryptoKeyPair;
    await expect(verifyGoogleIdToken(await sign(good(), undefined, other.privateKey), CLIENT, keys, NOW)).rejects.toThrow("Bad signature");
  });

  it("rejects 'alg: none' and unknown keys", async () => {
    const none = `${enc({ alg: "none", kid: "k1" })}.${enc(good())}.`;
    await expect(verifyGoogleIdToken(none, CLIENT, keys, NOW)).rejects.toThrow("Unexpected token type");
    await expect(verifyGoogleIdToken(await sign(good(), { alg: "RS256", kid: "nope" }), CLIENT, keys, NOW)).rejects.toThrow("Unknown signing key");
  });

  it("refetches the keys once when Google has rotated them", async () => {
    let calls = 0;
    const rotating = async (force: boolean) => { calls++; return force ? [jwk] : []; };
    await expect(verifyGoogleIdToken(await sign(good()), CLIENT, rotating, NOW)).resolves.toMatchObject({ sub: "1098" });
    expect(calls).toBe(2);
  });

  it("rejects garbage", async () => {
    await expect(verifyGoogleIdToken("not.a.jwt", CLIENT, keys, NOW)).rejects.toThrow(GoogleTokenError);
    await expect(verifyGoogleIdToken("abc", CLIENT, keys, NOW)).rejects.toThrow(GoogleTokenError);
  });
});
