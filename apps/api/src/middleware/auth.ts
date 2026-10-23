/**
 * Hono auth middleware — reads session from KV, loads user from D1.
 * Does NOT reject unauthenticated requests; routes opt-in via requireUser().
 */

import type { Context, Next } from "hono";
import {
  buildAccessCookie,
  createAccessSession,
  getAccessSession,
  getRefreshSession,
  parseCookies,
} from "../lib/kv-sessions";
import type { AppContext } from "../types";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  wallet_balance_cents: number;
}

/** Extract the bearer/cookie access token from a request, if present. */
export function extractAccessToken(c: Context<AppContext>): string | undefined {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  const cookies = parseCookies(c.req.header("Cookie"));
  return cookies["wta_access_token"];
}

/**
 * Middleware: attach `user` to context if a valid session exists.
 *
 * SILENT RENEWAL
 * The access token lives 15 minutes and nothing in the app ever called
 * /api/auth/refresh, so a quarter of an hour after signing in every request
 * was a 401. On a league night that meant the scorer's queued taps were
 * refused and dropped while the screen went on showing them. Now, when the
 * access token is missing or expired but the 7-day refresh cookie is valid,
 * this mints a new access token on the spot and sets its cookie on the
 * response, so a session lasts as long as its refresh token, as intended.
 */
export async function authMiddleware(c: Context<AppContext>, next: Next) {
  const kv = c.env.SESSIONS;
  const token = extractAccessToken(c);
  let userId: string | null = null;

  if (token && kv) userId = await getAccessSession(kv, token);

  let renewed: string | null = null;
  if (!userId && kv) {
    const refresh = parseCookies(c.req.header("Cookie"))["wta_refresh_token"];
    if (refresh) {
      userId = await getRefreshSession(kv, refresh);
      if (userId) renewed = await createAccessSession(kv, userId).catch(() => null);
    }
  }

  if (userId) {
    const user = await c.get("store").getUserById(userId);
    if (user) {
      c.set("user", user as AuthUser);
    } else {
      renewed = null;
    }
  }

  await next();

  // After the route, so a route that sets its own cookies (login, logout,
  // refresh) is not overridden: only when it set none.
  if (renewed && !c.res.headers.has("Set-Cookie")) {
    try {
      c.res.headers.append("Set-Cookie", buildAccessCookie(renewed));
    } catch {
      // A response with immutable headers: the next request renews again.
    }
  }
}

/** Helper: get user from context, or null (route returns 401). */
export function requireUser(c: Context<AppContext>): AuthUser | null {
  return c.get("user") ?? null;
}

/** Helper: get user only if they hold the admin role. */
export function requireAdmin(c: Context<AppContext>): AuthUser | null {
  const user = c.get("user");
  if (!user || user.role !== "admin") return null;
  return user;
}

/** Serialize user for API responses (hide password hash and internals). */
export function serializeUser(user: AuthUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    walletBalance: (user.wallet_balance_cents / 100).toFixed(2),
  };
}
