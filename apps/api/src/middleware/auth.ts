/**
 * Hono auth middleware — reads session from KV, loads user from D1.
 * Does NOT reject unauthenticated requests; routes opt-in via requireUser().
 */

import type { Context, Next } from "hono";
import {
  buildAccessCookie,
  createAccessSession,
  getAccessSessionInfo,
  getRefreshSessionInfo,
  parseCookies,
  type SessionVia,
} from "../lib/kv-sessions";
import { decideAdmin, effectiveRole, isOwnerEmail, ownerEmailFrom } from "../lib/admin-access";
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
  let via: SessionVia | null = null;

  if (token && kv) {
    const info = await getAccessSessionInfo(kv, token);
    if (info) ({ userId, via } = info);
  }

  let renewed: string | null = null;
  if (!userId && kv) {
    const refresh = parseCookies(c.req.header("Cookie"))["wta_refresh_token"];
    if (refresh) {
      const info = await getRefreshSessionInfo(kv, refresh);
      if (info) {
        ({ userId, via } = info);
        // The renewed token keeps the way the session was signed in, so a
        // Google session stays a Google session for the console.
        renewed = await createAccessSession(kv, info.userId, info.via).catch(() => null);
      }
    }
  }

  if (userId) {
    const user = (await c.get("store").getUserById(userId)) as AuthUser | null;
    if (user) {
      // Admin is decided here, once, for every route: the owner by email, anyone
      // else only with a grant row from the owner, and either only on a Google
      // session. A stored role of 'admin' without that reads as 'player'.
      const ownerEmail = ownerEmailFrom(c.env.ADMIN_OWNER_EMAIL);
      let hasGrant = false;
      if (user.role === "admin" && !isOwnerEmail(user.email, ownerEmail)) {
        hasGrant = await hasAdminGrant(c.env.DB, user.id);
      }
      const decision = decideAdmin({ email: user.email, via, ownerEmail, hasGrant });
      c.set("user", { ...user, role: effectiveRole(user.role, decision) });
      c.set("authVia", via ?? "password");
      c.set("admin", decision);
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

/** Whether the owner has granted this account admin. False if the table is missing. */
async function hasAdminGrant(db: D1Database | undefined, userId: string): Promise<boolean> {
  if (!db) return false;
  try {
    const row = await db.prepare(`SELECT 1 AS ok FROM admin_grants WHERE user_id = ?`).bind(userId).first<any>();
    return !!row;
  } catch {
    return false;
  }
}

/** Helper: get user from context, or null (route returns 401). */
export function requireUser(c: Context<AppContext>): AuthUser | null {
  return c.get("user") ?? null;
}

/** Helper: get user only if they hold the admin role. */
export function requireAdmin(c: Context<AppContext>): AuthUser | null {
  const user = c.get("user");
  if (!user || !c.get("admin")?.isAdmin) return null;
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
