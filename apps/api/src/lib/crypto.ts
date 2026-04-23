/**
 * Web Crypto based password hashing.
 * Uses PBKDF2-SHA256 — async-only (Workers requirement).
 */

/** Generate a random hex string of `bytes` length. */
export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Create a prefixed ID like `user_a1b2c3d4e5f6g7h8`. */
export function createId(prefix: string): string {
  if (prefix === "user") {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const buf = new Uint8Array(6);
    crypto.getRandomValues(buf);
    const suffix = Array.from(buf)
      .map((b) => chars[b % chars.length])
      .join("");
    return `WTA-${suffix}`;
  }
  return `${prefix}_${randomHex(8)}`;
}

/** Hash a password with PBKDF2-SHA256. Returns `salt:derivedKey` in hex. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomHex(16); // 16 bytes = 32 hex chars
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode(salt),
      iterations: 100_000,
    },
    keyMaterial,
    256 // 32 bytes
  );

  const hex = Array.from(new Uint8Array(derived))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${salt}:${hex}`;
}

/** Verify a password against a stored `salt:hash` string. */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const sepIdx = storedHash.indexOf(":");
  if (sepIdx === -1) return false;

  const salt = storedHash.slice(0, sepIdx);
  const existingHash = storedHash.slice(sepIdx + 1);

  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode(salt),
      iterations: 100_000,
    },
    keyMaterial,
    256
  );

  const candidateHex = Array.from(new Uint8Array(derived))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time compare
  if (candidateHex.length !== existingHash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < candidateHex.length; i++) {
    mismatch |= candidateHex.charCodeAt(i) ^ existingHash.charCodeAt(i);
  }
  return mismatch === 0;
}

/** HMAC-SHA256 for Razorpay signature verification. */
export async function hmacSha256(
  key: string,
  message: string
): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC-SHA256 for webhook body (raw bytes). */
export async function hmacSha256Bytes(
  key: string,
  body: ArrayBuffer
): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, body);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
