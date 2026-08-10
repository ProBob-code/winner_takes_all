/**
 * Web Crypto based password hashing and token generation.
 * Uses PBKDF2-SHA256 — async-only (Workers requirement).
 *
 * Password hash format is versioned:
 *   v2:<iterations>:<salt>:<derivedKeyHex>   (current)
 *   <salt>:<derivedKeyHex>                   (legacy, 100k iterations)
 * verifyPassword accepts both so existing accounts keep working.
 */

// Workers free tier has a 10ms CPU budget per request; native PBKDF2 at 100k
// iterations fits. Raise this once the worker runs on a paid plan.
const PBKDF2_ITERATIONS = 100_000;

/** Generate a random hex string of `bytes` length. */
export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create a prefixed ID like `payment_a1b2…` (128-bit random part).
 * User IDs are short human-friendly codes (`WTA-XXXXXXXX`), generated
 * without modulo bias.
 */
export function createId(prefix: string): string {
  if (prefix === "user") {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let suffix = "";
    while (suffix.length < 8) {
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      for (const b of buf) {
        // Rejection sampling: only accept bytes that map uniformly.
        if (b < 252 && suffix.length < 8) suffix += chars[b % chars.length];
      }
    }
    return `WTA-${suffix}`;
  }
  return `${prefix}_${randomHex(16)}`;
}

/** Generate an opaque session token with 256 bits of entropy. */
export function createSessionToken(): string {
  return randomHex(32);
}

async function deriveHex(
  password: string,
  salt: string,
  iterations: number
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(derived))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hash a password. Returns `v2:<iterations>:<salt>:<hash>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomHex(16);
  const hex = await deriveHex(password, salt, PBKDF2_ITERATIONS);
  return `v2:${PBKDF2_ITERATIONS}:${salt}:${hex}`;
}

/** Verify a password against a stored hash (current or legacy format). */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  let salt: string;
  let existingHash: string;
  let iterations: number;

  if (storedHash.startsWith("v2:")) {
    const parts = storedHash.split(":");
    if (parts.length !== 4) return false;
    iterations = Number(parts[1]);
    salt = parts[2];
    existingHash = parts[3];
    if (!Number.isInteger(iterations) || iterations < 1) return false;
  } else {
    // Legacy `salt:hash` format
    const sepIdx = storedHash.indexOf(":");
    if (sepIdx === -1) return false;
    salt = storedHash.slice(0, sepIdx);
    existingHash = storedHash.slice(sepIdx + 1);
    iterations = 100_000;
  }

  const candidateHex = await deriveHex(password, salt, iterations);
  return timingSafeEqual(candidateHex, existingHash);
}

/** Constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** SHA-256 hex digest — used for low-sensitivity codes like arena PINs. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
