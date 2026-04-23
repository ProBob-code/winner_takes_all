/**
 * Main Hono API for Cloudflare Workers.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { D1Store } from "./lib/d1-store";
import {
  createSessionTokens,
  getAccessSession,
  getRefreshSession,
  buildSessionCookies,
  parseCookies,
} from "./lib/kv-sessions";
import { hashPassword, verifyPassword, hmacSha256Bytes } from "./lib/crypto";
import { generateBracket, advanceWinner } from "./lib/bracket";
import { createRazorpayOrder, verifyPaymentSignature } from "./lib/razorpay";

const app = new Hono<{ Bindings: Env; Variables: { userId: string; store: D1Store } }>();

app.use("*", cors({
  origin: "*", // Adjust for prod
  credentials: true,
}));

// Setup context + auth middleware
app.use("*", async (c, next) => {
  c.set("store", new D1Store(c.env.DB));

  const cookies = parseCookies(c.req.header("Cookie"));
  const token = cookies.wta_access_token;
  if (token) {
    const userId = await getAccessSession(c.env.SESSIONS, token);
    if (userId) c.set("userId", userId);
  }

  await next();
});

const requireAuth = async (c: any, next: any) => {
  if (!c.get("userId")) return c.json({ error: "Unauthorized" }, 401);
  await next();
};

// ── Health ──

app.get("/api/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// ── Auth ──

app.post("/api/auth/signup", async (c) => {
  const { name, email, password } = await c.req.json();
  if (!name || !email || !password) return c.json({ error: "Missing fields" }, 400);

  const store = c.get("store");
  const existing = await store.getUserByEmail(email);
  if (existing) return c.json({ error: "Email exists" }, 400);

  const phash = await hashPassword(password);
  const user = await store.createUserWithBonus(name, email, phash, 5000); // 50 INR bonus

  const tokens = await createSessionTokens(c.env.SESSIONS, user.id);
  const [ac, rc] = buildSessionCookies(tokens);

  c.header("Set-Cookie", ac, { append: true });
  c.header("Set-Cookie", rc, { append: true });

  const { password_hash, ...u } = user;
  return c.json(u, 201);
});

app.post("/api/auth/login", async (c) => {
  const { email, password } = await c.req.json();
  const store = c.get("store");
  const user = await store.getUserByEmail(email);

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const tokens = await createSessionTokens(c.env.SESSIONS, user.id);
  const [ac, rc] = buildSessionCookies(tokens);

  c.header("Set-Cookie", ac, { append: true });
  c.header("Set-Cookie", rc, { append: true });

  const { password_hash, ...u } = user;
  return c.json(u);
});

app.get("/api/user/profile", requireAuth, async (c) => {
  const user = await c.get("store").getUserById(c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  const { password_hash, ...u } = user;
  return c.json(u);
});

// ── Wallet ──

app.get("/api/wallet/entries", requireAuth, async (c) => {
  return c.json(await c.get("store").listWalletEntries(c.get("userId")));
});

app.post("/api/wallet/transfer", requireAuth, async (c) => {
  const { recipientId, amountCents } = await c.req.json();
  try {
    const user = await c.get("store").transferCredits(c.get("userId"), recipientId, amountCents);
    const { password_hash, ...u } = user;
    return c.json(u);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// ── Tournaments ──

app.get("/api/tournaments", async (c) => c.json(await c.get("store").listTournaments()));

app.post("/api/tournaments", requireAuth, async (c) => {
  const data = await c.req.json();
  data.hostId = c.get("userId");
  return c.json(await c.get("store").createTournament(data), 201);
});

app.get("/api/tournaments/:id", async (c) => {
  const t = await c.get("store").getTournament(c.req.param("id"));
  return t ? c.json(t) : c.json({ error: "Not found" }, 404);
});

app.get("/api/tournaments/:id/participants", async (c) => {
  return c.json(await c.get("store").getParticipants(c.req.param("id")));
});

app.post("/api/tournaments/:id/join", requireAuth, async (c) => {
  const { teamId } = await c.req.json().catch(() => ({ teamId: null }));
  try {
    const res = await c.get("store").joinTournament(c.get("userId"), c.req.param("id"), teamId);
    return c.json(res);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.post("/api/tournaments/:id/bracket/generate", requireAuth, async (c) => {
  const store = c.get("store");
  const tid = c.req.param("id");
  const parts = await store.getParticipants(tid);
  try {
    const state = await generateBracket(store, tid, parts.map(p => p.user_id));
    await store.updateTournamentStatus(tid, "in_progress", { started_at: new Date().toISOString() });
    return c.json(state);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// ── Matches ──

app.get("/api/tournaments/:tid/matches", async (c) => {
  return c.json(await c.get("store").listMatchesByTournament(c.req.param("tid")));
});

app.get("/api/matches/:id", async (c) => {
  const m = await c.get("store").getMatch(c.req.param("id"));
  return m ? c.json(m) : c.json({ error: "Not found" }, 404);
});

app.post("/api/matches/:id/submit-score", requireAuth, async (c) => {
  const { score } = await c.req.json();
  const store = c.get("store");
  const match = await store.getMatch(c.req.param("id"));
  if (!match) return c.json({ error: "Not found" }, 404);

  const uid = c.get("userId");
  const updates: any = {};
  if (match.player1_id === uid) updates.player1_submitted_score = score;
  else if (match.player2_id === uid) updates.player2_submitted_score = score;
  else return c.json({ error: "Not in match" }, 403);

  await store.updateMatch(match.id, updates);
  return c.json({ success: true });
});

app.post("/api/matches/:id/approve-scores", requireAuth, async (c) => {
  const store = c.get("store");
  const match = await store.getMatch(c.req.param("id"));
  if (!match) return c.json({ error: "Not found" }, 404);
  
  if (match.player1_submitted_score == null || match.player2_submitted_score == null) {
    return c.json({ error: "Scores missing" }, 400);
  }

  const winner = match.player1_submitted_score >= match.player2_submitted_score
    ? match.player1_id : match.player2_id;

  await store.updateMatch(match.id, {
    player1_score: match.player1_submitted_score,
    player2_score: match.player2_submitted_score,
    scores_approved: 1,
    winner_id: winner,
    status: "completed",
    completed_at: new Date().toISOString(),
  });

  if (winner) {
    await advanceWinner(store, match.tournament_id, match.id, winner);
  }

  return c.json({ success: true, winner_id: winner });
});

// ── Payments ──

app.post("/api/payments/create-order", requireAuth, async (c) => {
  const { amountCents } = await c.req.json();
  const store = c.get("store");

  const payment = await store.createPayment({
    userId: c.get("userId"),
    amountCents,
    idempotencyKey: createId("idemp"),
  });

  const order = await createRazorpayOrder(
    c.env.RAZORPAY_KEY_ID,
    c.env.RAZORPAY_KEY_SECRET,
    amountCents,
    "INR",
    { paymentId: payment.id }
  );

  await store.updatePayment(payment.id, { provider_order_id: order.id });
  return c.json({ orderId: order.id, amountCents });
});

app.post("/api/payments/verify", requireAuth, async (c) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await c.req.json();
  const store = c.get("store");

  const isValid = await verifyPaymentSignature(
    c.env.RAZORPAY_KEY_SECRET, razorpay_order_id, razorpay_payment_id, razorpay_signature
  );

  if (!isValid) return c.json({ error: "Invalid signature" }, 400);

  const payment = await store.getPaymentByOrderId(razorpay_order_id);
  if (!payment) return c.json({ error: "Payment not found" }, 404);

  if (payment.status !== "completed") {
    await store.updatePayment(payment.id, {
      status: "completed", provider_payment_id: razorpay_payment_id, provider_signature: razorpay_signature,
    });
    await store.creditWallet(payment.user_id, payment.amount_cents, "wallet_topup", payment.id, "deposit", payment.id);
  }

  return c.json({ success: true });
});

// ── Webhooks ──

app.post("/api/webhooks/razorpay", async (c) => {
  const bodyBuf = await c.req.arrayBuffer();
  const sig = c.req.header("x-razorpay-signature");

  if (!sig || !c.env.RAZORPAY_WEBHOOK_SECRET) return c.text("OK");

  const expected = await hmacSha256Bytes(c.env.RAZORPAY_WEBHOOK_SECRET, bodyBuf);
  if (expected !== sig) return c.json({ error: "Invalid signature" }, 400);

  return c.text("OK");
});

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);

    // Route WebSocket upgrades to Durable Object
    if (url.pathname.startsWith("/ws/match/")) {
      const matchId = url.pathname.split("/").pop();
      const id = env.GAME_ROOMS.idFromName(matchId!);
      const obj = env.GAME_ROOMS.get(id);
      url.searchParams.set("matchId", matchId!);
      return obj.fetch(new Request(url.toString(), req));
    }

    return app.fetch(req, env, ctx);
  }
};

export { GameRoom } from "./durable-objects/game-room";
