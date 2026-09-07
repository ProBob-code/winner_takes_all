/** Cloudflare Worker environment bindings. */

import type { D1Store } from "./lib/d1-store";
import type { AuthUser } from "./middleware/auth";

export interface Env {
  // D1 Database
  DB: D1Database;

  // KV Namespace for sessions + rate limiting
  SESSIONS: KVNamespace;

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
