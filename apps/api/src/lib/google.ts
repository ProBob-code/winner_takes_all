/**
 * Sign in with Google: checking the ID token Google's button hands the page.
 *
 * The browser sends us the token as it came from Google; nothing in it is
 * trusted until its RS256 signature checks out against one of Google's
 * published keys, it was issued for this site's client ID, by Google, and it
 * has not expired. Only then do we read the email, and only a verified one.
 */

export const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
/** Clock drift allowed between Google and the Worker, in seconds. */
const SKEW_SECONDS = 60;

export interface GoogleJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

export interface GoogleIdentity {
  /** Google's stable account ID. */
  sub: string;
  email: string;
  name: string | null;
}

export class GoogleTokenError extends Error {}

function base64UrlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodePart(part: string): any {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
  } catch {
    throw new GoogleTokenError("Malformed token");
  }
}

// Google rotates its keys every few weeks and serves them with a long cache
// lifetime; one fetch per isolate is plenty, with a refetch when a token
// names a key we have not seen.
let cachedKeys: { keys: GoogleJwk[]; at: number } | null = null;
const KEYS_TTL_MS = 60 * 60 * 1000;

export async function fetchGoogleKeys(force = false): Promise<GoogleJwk[]> {
  if (!force && cachedKeys && Date.now() - cachedKeys.at < KEYS_TTL_MS) return cachedKeys.keys;
  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error(`Google keys: ${res.status}`);
  const body = (await res.json()) as { keys: GoogleJwk[] };
  cachedKeys = { keys: body.keys ?? [], at: Date.now() };
  return cachedKeys.keys;
}

/**
 * Check a Google ID token and return who it belongs to.
 * `getKeys(force)` is injectable so tests can sign with their own key.
 */
export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  getKeys: (force: boolean) => Promise<GoogleJwk[]> = fetchGoogleKeys,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<GoogleIdentity> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new GoogleTokenError("Malformed token");
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new GoogleTokenError("Unexpected token type");

  let jwk = (await getKeys(false)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await getKeys(true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new GoogleTokenError("Unknown signing key");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw new GoogleTokenError("Bad signature");

  if (!ISSUERS.has(payload.iss)) throw new GoogleTokenError("Wrong issuer");
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(clientId)) throw new GoogleTokenError("Token is for another site");
  if (typeof payload.exp !== "number" || payload.exp + SKEW_SECONDS < nowSeconds) throw new GoogleTokenError("Token expired");
  if (typeof payload.iat === "number" && payload.iat - SKEW_SECONDS > nowSeconds) throw new GoogleTokenError("Token from the future");
  if (typeof payload.sub !== "string" || !payload.sub) throw new GoogleTokenError("No account ID");
  // An unverified address could be anyone's, and we match accounts by email.
  if (payload.email_verified !== true && payload.email_verified !== "true") throw new GoogleTokenError("Email not verified");
  if (typeof payload.email !== "string" || !payload.email.includes("@")) throw new GoogleTokenError("No email");

  const name = typeof payload.name === "string" && payload.name.trim().length >= 2 ? payload.name.trim().slice(0, 50) : null;
  return { sub: payload.sub, email: payload.email.trim().toLowerCase(), name };
}
