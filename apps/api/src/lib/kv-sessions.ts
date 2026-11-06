/**
 * KV-based session store for Cloudflare Workers.
 * Access tokens: 15 min TTL
 * Refresh tokens: 7 days TTL
 */

import { createSessionToken } from "./crypto";

const ACCESS_TTL = 15 * 60; // seconds
const REFRESH_TTL = 7 * 24 * 60 * 60; // seconds

/**
 * How a session was signed in. The admin console accepts only "google": its
 * owner is named by a Google account, and a password can be guessed or reset
 * where a Google sign-in cannot. Sessions from before this field existed read
 * as "password", so an admin has to sign in with Google once more.
 */
export type SessionVia = "google" | "password";

interface SessionData {
  userId: string;
  createdAt: string;
  via?: SessionVia;
}

export interface SessionInfo {
  userId: string;
  via: SessionVia;
}

function readSession(raw: string | null): SessionInfo | null {
  if (!raw) return null;
  try {
    const data: SessionData = JSON.parse(raw);
    if (!data?.userId) return null;
    return { userId: data.userId, via: data.via === "google" ? "google" : "password" };
  } catch {
    return null;
  }
}

/** Look up an access token, with how its session was signed in. */
export async function getAccessSessionInfo(kv: KVNamespace, token: string): Promise<SessionInfo | null> {
  return readSession(await kv.get(`access:${token}`));
}

/** Look up a refresh token, with how its session was signed in. */
export async function getRefreshSessionInfo(kv: KVNamespace, token: string): Promise<SessionInfo | null> {
  return readSession(await kv.get(`refresh:${token}`));
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/** Create access + refresh session tokens and store them in KV. */
export async function createSessionTokens(
  kv: KVNamespace,
  userId: string,
  via: SessionVia = "password"
): Promise<SessionTokens> {
  const accessToken = createSessionToken();
  const refreshToken = createSessionToken();
  const now = new Date().toISOString();

  const data: SessionData = { userId, createdAt: now, via };

  await Promise.all([
    kv.put(`access:${accessToken}`, JSON.stringify(data), {
      expirationTtl: ACCESS_TTL,
    }),
    kv.put(`refresh:${refreshToken}`, JSON.stringify(data), {
      expirationTtl: REFRESH_TTL,
    }),
  ]);

  return { accessToken, refreshToken };
}

/** Look up an access token. Returns userId or null. */
export async function getAccessSession(
  kv: KVNamespace,
  token: string
): Promise<string | null> {
  const raw = await kv.get(`access:${token}`);
  if (!raw) return null;
  try {
    const data: SessionData = JSON.parse(raw);
    return data.userId;
  } catch {
    return null;
  }
}

/** Look up a refresh token. Returns userId or null. */
export async function getRefreshSession(
  kv: KVNamespace,
  token: string
): Promise<string | null> {
  const raw = await kv.get(`refresh:${token}`);
  if (!raw) return null;
  try {
    const data: SessionData = JSON.parse(raw);
    return data.userId;
  } catch {
    return null;
  }
}

/** Delete a refresh token (after rotation). */
export async function deleteRefreshSession(
  kv: KVNamespace,
  token: string
): Promise<void> {
  await kv.delete(`refresh:${token}`);
}

/** Delete an access token (on logout, so the session is revoked server-side). */
export async function deleteAccessSession(
  kv: KVNamespace,
  token: string
): Promise<void> {
  await kv.delete(`access:${token}`);
}

/**
 * A new access token for a user who still holds a valid refresh token.
 *
 * For the middleware's silent renewal: the refresh token is left as it is,
 * because a page fires several requests at once and rotating it on each would
 * leave all but one holding a revoked token. One KV write per user per
 * ACCESS_TTL, at most a few when requests race.
 */
export async function createAccessSession(
  kv: KVNamespace,
  userId: string,
  via: SessionVia = "password"
): Promise<string> {
  const accessToken = createSessionToken();
  const data: SessionData = { userId, createdAt: new Date().toISOString(), via };
  await kv.put(`access:${accessToken}`, JSON.stringify(data), { expirationTtl: ACCESS_TTL });
  return accessToken;
}

/** The Set-Cookie header for an access token on its own. */
export function buildAccessCookie(accessToken: string): string {
  return [
    `wta_access_token=${encodeURIComponent(accessToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=None",
    "Secure",
    `Max-Age=${ACCESS_TTL}`,
  ].join("; ");
}

/** Build Set-Cookie headers for session cookies. */
export function buildSessionCookies(
  tokens: SessionTokens
): [string, string] {
  const accessCookie = [
    `wta_access_token=${encodeURIComponent(tokens.accessToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=None",
    "Secure",
    `Max-Age=${ACCESS_TTL}`,
  ].join("; ");

  const refreshCookie = [
    `wta_refresh_token=${encodeURIComponent(tokens.refreshToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=None",
    "Secure",
    `Max-Age=${REFRESH_TTL}`,
  ].join("; ");

  return [accessCookie, refreshCookie];
}

/** Parse a cookie header string into a key-value map. */
export function parseCookies(
  header: string | undefined | null
): Record<string, string> {
  if (!header) return {};
  return header
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const sep = part.indexOf("=");
      if (sep === -1) return acc;
      acc[part.slice(0, sep)] = decodeURIComponent(part.slice(sep + 1));
      return acc;
    }, {});
}
/** Build Set-Cookie headers to clear session cookies. */
export function buildLogoutCookies(): [string, string] {
  const access = [
    "wta_access_token=deleted",
    "Path=/",
    "HttpOnly",
    "SameSite=None",
    "Secure",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].join("; ");

  const refresh = [
    "wta_refresh_token=deleted",
    "Path=/",
    "HttpOnly",
    "SameSite=None",
    "Secure",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].join("; ");

  return [access, refresh];
}
