/** Cloudflare Worker environment bindings. */

export interface Env {
  // D1 Database
  DB: D1Database;

  // KV Namespace for sessions
  SESSIONS: KVNamespace;

  // Durable Object for game rooms
  GAME_ROOMS: DurableObjectNamespace;

  // Vars
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
}
