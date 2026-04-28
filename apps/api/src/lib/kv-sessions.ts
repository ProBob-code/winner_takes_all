/**
 * KV-based session store for Cloudflare Workers.
 * Access tokens: 15 min TTL
 * Refresh tokens: 7 days TTL
 */

import { createId } from "./crypto";

const ACCESS_TTL = 15 * 60; // seconds
const REFRESH_TTL = 7 * 24 * 60 * 60; // seconds

interface SessionData {
  userId: string;
  createdAt: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/** Create access + refresh session tokens and store them in KV. */
export async function createSessionTokens(
  kv: KVNamespace,
  userId: string
): Promise<SessionTokens> {
  const accessToken = createId("access");
  const refreshToken = createId("refresh");
  const now = new Date().toISOString();

  const data: SessionData = { userId, createdAt: now };

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
