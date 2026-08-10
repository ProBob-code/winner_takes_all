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

  // Non-secret config
  ALLOWED_ORIGINS?: string;
}

/** Hono context variables shared across middleware and routes. */
export interface AppVariables {
  store: D1Store;
  user?: AuthUser;
}

export type AppContext = { Bindings: Env; Variables: AppVariables };
