/** Cloudflare Worker environment bindings. */

export interface Env {
  // D1 Database
  DB: D1Database;

  // KV Namespace for sessions
  SESSIONS: KVNamespace;



  // Vars
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
}
