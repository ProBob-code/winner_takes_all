/** Cloudflare Worker environment bindings. */

import type { D1Store } from "./lib/d1-store";
import type { AuthUser } from "./middleware/auth";

export interface Env {
  // D1 Database
  DB: D1Database;

  // KV Namespace for sessions + rate limiting
  SESSIONS: KVNamespace;

  // Per-match live camera feed registry. Deliberately not KV: heartbeats are
  // frequent and would exhaust the daily KV write budget.
  MATCH_FEEDS: DurableObjectNamespace;

  // Secrets (set via `wrangler secret put`, never in wrangler.toml [vars])
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  /** Cloudflare Realtime SFU credentials for live match streaming. */
  REALTIME_APP_ID?: string;
  REALTIME_APP_SECRET?: string;
  /** Signs the short-lived broadcast tokens carried by match QR codes. */
  BROADCAST_TOKEN_SECRET?: string;

  // Non-secret config
  /**
   * Whether this deployment may take stakes: entry fees, top-ups, pooled pots
   * and the rake on them.
   *
   * Default OFF. India's Promotion and Regulation of Online Gaming Act 2025,
   * in force since 1 May 2026, prohibits games played for a stake whether they
   * turn on skill or on chance, so a deployment that has not deliberately
   * turned this on must not take money from a player.
   *
   * It deliberately does NOT close the withdrawal path. Stopping money coming
   * in and stopping it going back out are different decisions: balances taken
   * before the switch still belong to the people who deposited them, and they
   * have to be able to get them back. See `windDownOnly()`.
   */
  STAKES_ENABLED?: string;
  /**
   * Whether this deployment may sell a venue subscription.
   *
   * Separate from STAKES_ENABLED on purpose. A venue paying for tournament
   * software is a business-to-business sale of software; a player paying to
   * enter a game is a stake. The Online Gaming Act 2025 prohibits the second
   * and says nothing about the first, so gating venue billing on the stakes
   * switch would shut off the one revenue line that is lawful. Also
   * default-off: a deployment with no Razorpay keys should not offer a
   * subscription it cannot take. See lib/billing.ts.
   */
  BILLING_ENABLED?: string;
  /**
   * Signs the subscription webhooks. Usually the same secret as
   * RAZORPAY_WEBHOOK_SECRET; kept separate so a deployment can rotate the
   * billing webhook without touching anything else.
   */
  RAZORPAY_SUBSCRIPTION_WEBHOOK_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  REALTIME_API_BASE?: string;
  /** Origin used to build the scannable broadcast URL. */
  PUBLIC_APP_ORIGIN?: string;
}

/** Hono context variables shared across middleware and routes. */
export interface AppVariables {
  store: D1Store;
  user?: AuthUser;
}

export type AppContext = { Bindings: Env; Variables: AppVariables };
