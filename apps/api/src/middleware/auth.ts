/**
 * Hono auth middleware — reads session from KV, loads user from D1.
 * Does NOT reject unauthenticated requests; routes opt-in via requireUser().
 */

import type { Context, Next } from "hono";
import { getAccessSession, parseCookies } from "../lib/kv-sessions";
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

/** Middleware: attach `user` to context if a valid session exists. */
export async function authMiddleware(c: Context<AppContext>, next: Next) {
  const token = extractAccessToken(c);

  if (token && c.env.SESSIONS) {
    const userId = await getAccessSession(c.env.SESSIONS, token);
    if (userId) {
      const user = await c.get("store").getUserById(userId);
      if (user) {
        c.set("user", user as AuthUser);
      }
    }
  }

  await next();
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
