/**
 * Hono auth middleware — reads session from KV, loads user from D1.
 * Does NOT reject unauthenticated requests; routes opt-in via requireUser().
 */

import type { Context, Next } from "hono";
import { getAccessSession, parseCookies } from "../lib/kv-sessions";
import { D1Store } from "../lib/d1-store";
import type { Env } from "../types";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  wallet_balance_cents: number;
}

/** Middleware: attach `user` to context if valid session exists. */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const store = new D1Store(c.env.DB);
  c.set("store", store);

  // Try Bearer token first, then cookie
  const authHeader = c.req.header("Authorization");
  let token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    const cookieHeader = c.req.header("Cookie");
    const cookies = parseCookies(cookieHeader);
    token = cookies["wta_access_token"];
  }

  if (token && c.env.SESSIONS) {
    const userId = await getAccessSession(c.env.SESSIONS, token);
    if (userId) {
      const user = await store.getUserById(userId);
      if (user) {
        c.set("user", user as AuthUser);
      }
    }
  }

  await next();
}

/** Helper: get user from context or return 401. */
export function requireUser(c: Context): AuthUser | null {
  const user = c.get("user") as AuthUser | undefined;
  if (!user) {
    return null;
  }
  return user;
}

/** Serialize user for API responses (hide password hash). */
export function serializeUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    walletBalance: (user.wallet_balance_cents / 100).toFixed(2),
  };
}
