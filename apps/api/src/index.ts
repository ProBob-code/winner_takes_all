import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { D1Store } from "./lib/d1-store";
import {
  createSessionTokens,
  getRefreshSession,
  deleteRefreshSession,
  buildSessionCookies,
  buildLogoutCookies,
} from "./lib/kv-sessions";
import { hashPassword, verifyPassword, createId } from "./lib/crypto";
import { createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature } from "./lib/razorpay";
import { authMiddleware, requireUser, serializeUser } from "./middleware/auth";
import { centsToMoney, moneyToCents } from "./lib/money";



const app = new Hono<{ Bindings: Env; Variables: { store: D1Store; user?: any } }>();

// Inject D1Store
app.use("/api/*", async (c, next) => {
  c.set("store", new D1Store(c.env.DB));
  await next();
});

// Enable CORS
app.use(
  "/api/*",
  cors({
    origin: ["https://winner-takes-all.pages.dev", "http://localhost:3000"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Apply auth middleware to all /api/ routes
app.use("/api/*", authMiddleware);

// --- Health / Test ---
app.get("/api/health", (c) => c.json({ ok: true, service: "api", timestamp: new Date().toISOString() }));
app.get("/api/test", (c) => c.json({ message: "API working (Hono + D1)" }));

// --- Auth ---
app.post("/api/auth/signup", async (c) => {
  const store = c.get("store");
  const body = await c.req.json();
  
  if (!body.email || !body.password || !body.name) {
    return c.json({ ok: false, message: "Missing required fields" }, 400);
  }

  const existing = await store.getUserByEmail(body.email);
  if (existing) {
    return c.json({ ok: false, message: "An account already exists for this email" }, 409);
  }

  const hashed = await hashPassword(body.password);
  const user = await store.createUserWithBonus(body.name, body.email, hashed, 100000); // 1000 Rs bonus

  const tokens = await createSessionTokens(c.env.SESSIONS, user.id);
  const [access, refresh] = buildSessionCookies(tokens);
  c.header("Set-Cookie", access, { append: true });
  c.header("Set-Cookie", refresh, { append: true });

  return c.json({ ok: true, user: serializeUser(user) }, 201);
});

app.post("/api/auth/login", async (c) => {
  const store = c.get("store");
  const body = await c.req.json();

  if (!body.email || !body.password) {
    return c.json({ ok: false, message: "Missing required fields" }, 400);
  }

  const user = await store.getUserByEmail(body.email);
  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    return c.json({ ok: false, message: "Invalid email or password" }, 401);
  }

  const tokens = await createSessionTokens(c.env.SESSIONS, user.id);
  const [access, refresh] = buildSessionCookies(tokens);
  c.header("Set-Cookie", access, { append: true });
  c.header("Set-Cookie", refresh, { append: true });

  return c.json({ ok: true, user: serializeUser(user) });
});

app.post("/api/auth/refresh", async (c) => {
  // Try body or cookie
  let refreshToken: string | undefined;
  
  try {
    const body = await c.req.json();
    refreshToken = body.refreshToken;
  } catch {}

  if (!refreshToken) {
    const cookies = c.req.header("Cookie");
    if (cookies) {
      const match = cookies.match(/wta_refresh_token=([^;]+)/);
      if (match) refreshToken = decodeURIComponent(match[1]);
    }
  }

  if (!refreshToken) {
    return c.json({ ok: false, message: "Missing refresh token" }, 401);
  }

  const userId = await getRefreshSession(c.env.SESSIONS, refreshToken);
  if (!userId) {
    return c.json({ ok: false, message: "Invalid or expired refresh token" }, 401);
  }

  const store = c.get("store");
  const user = await store.getUserById(userId);
  if (!user) {
    return c.json({ ok: false, message: "User not found" }, 404);
  }

  await deleteRefreshSession(c.env.SESSIONS, refreshToken);

  const tokens = await createSessionTokens(c.env.SESSIONS, user.id);
  const [access, refresh] = buildSessionCookies(tokens);
  c.header("Set-Cookie", access, { append: true });
  c.header("Set-Cookie", refresh, { append: true });

  return c.json({ ok: true, user: serializeUser(user) });
});

app.post("/api/auth/logout", async (c) => {
  const [access, refresh] = buildLogoutCookies();
  c.header("Set-Cookie", access, { append: true });
  c.header("Set-Cookie", refresh, { append: true });
  return c.json({ ok: true, message: "Logged out successfully" });
});


app.get("/api/user/profile", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);
  
  const store = c.get("store");
  const stats = await store.getUserMatchStats(user.id);
  const totalMatches = stats.wins + stats.losses;
  const winRate = totalMatches > 0 ? Math.round((stats.wins / totalMatches) * 100) : 0;
  
  const serialized: any = serializeUser(user);
  serialized.stats = {
    ...stats,
    winRate,
    tournamentWins: stats.tournament_wins
  };

  return c.json({ ok: true, user: serialized });
});

// --- Payments ---
app.post("/api/payments/create-order", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);
  const body = await c.req.json();
  if (!body.amount) return c.json({ ok: false, message: "Amount required" }, 400);

  const amountCents = Math.round(Number(body.amount) * 100);
  if (isNaN(amountCents) || amountCents <= 0) return c.json({ ok: false, message: "Invalid amount" }, 400);
  
  if (!c.env.RAZORPAY_KEY_ID || !c.env.RAZORPAY_KEY_SECRET) {
    console.error("Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in worker environment");
    return c.json({ ok: false, message: "Payment gateway is not configured on the server" }, 500);
  }
  
  try {
    const order = await createRazorpayOrder(
      c.env.RAZORPAY_KEY_ID, 
      c.env.RAZORPAY_KEY_SECRET, 
      amountCents, 
      "INR", 
      { userId: user.id }
    );
    
    const store = c.get("store");
    await store.createPayment({
      userId: user.id,
      amountCents,
      providerOrderId: order.id,
      idempotencyKey: createId("idempotency"),
    });

    return c.json({
      ok: true,
      razorpayOrderId: order.id,
      amount: amountCents,
      currency: "INR",
      keyId: c.env.RAZORPAY_KEY_ID
    });
  } catch (err: any) {
    console.error("Razorpay order creation error:", err.message);
    return c.json({ ok: false, message: `Payment gateway error: ${err.message}` }, 500);
  }
});

app.post("/api/payments/verify", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);
  const body = await c.req.json();
  
  if (!body.razorpayOrderId || !body.razorpayPaymentId || !body.razorpaySignature) {
    return c.json({ ok: false, message: "Missing payment parameters" }, 400);
  }

  const isValid = await verifyPaymentSignature(
    c.env.RAZORPAY_KEY_SECRET, 
    body.razorpayOrderId, 
    body.razorpayPaymentId, 
    body.razorpaySignature
  );
  
  if (!isValid) return c.json({ ok: false, message: "Invalid payment signature" }, 400);

  const store = c.get("store");
  const payment = await store.getPaymentByOrderId(body.razorpayOrderId);
  
  if (!payment) return c.json({ ok: false, message: "Payment not found" }, 404);
  
  // If webhook already processed it, return success to the frontend
  if (payment.status === "success") return c.json({ ok: true, already_processed: true });
  
  if (payment.status !== "pending") return c.json({ ok: false, message: "Payment already processed" }, 400);

  // Mark success and add funds to wallet
  await store.updatePayment(payment.id, { status: "success", provider_payment_id: body.razorpayPaymentId });
  await store.creditWallet(user.id, payment.amount_cents, "wallet_topup", payment.id);

  return c.json({ ok: true });
});

app.post("/api/payments/webhook", async (c) => {
  const signature = c.req.header("X-Razorpay-Signature");
  if (!signature) return c.json({ ok: false, message: "Missing signature" }, 400);

  const rawBody = await c.req.arrayBuffer();
  const webhookSecret = c.env.RAZORPAY_WEBHOOK_SECRET || "";
  
  const isValid = await verifyWebhookSignature(webhookSecret, rawBody, signature);
  if (!isValid) return c.json({ ok: false, message: "Invalid signature" }, 400);

  const body = JSON.parse(new TextDecoder().decode(rawBody));
  console.log("Razorpay Webhook Event:", body.event);

  if (body.event === "payment.captured") {
    const payload = body.payload.payment.entity;
    const orderId = payload.order_id;
    const paymentId = payload.id;

    const store = c.get("store");
    const payment = await store.getPaymentByOrderId(orderId);
    
    if (payment && payment.status === "pending") {
      // Mark success and add funds to wallet
      await store.updatePayment(payment.id, { status: "success", provider_payment_id: paymentId });
      await store.creditWallet(payment.user_id, payment.amount_cents, "wallet_topup", payment.id);
      console.log(`Successfully processed payment via webhook for user ${payment.user_id}`);
    }
  }

  return c.json({ ok: true });
});

// --- Tournaments ---
app.get("/api/tournaments", async (c) => {
  const store = c.get("store");
  const tournaments = await store.listTournaments();
  
  const formatted = tournaments.map((t) => ({
    id: t.id,
    name: t.name,
    entryFee: centsToMoney(t.entry_fee_cents),
    maxPlayers: t.max_players,
    joinedPlayers: t.participant_ids.length,
    status: t.status,
  }));

  return c.json({ ok: true, tournaments: formatted });
});

app.get("/api/tournaments/:id", async (c) => {
  const store = c.get("store");
  const tournamentId = c.req.param("id");
  const tournament = await store.getTournament(tournamentId);

  if (!tournament) {
    return c.json({ ok: false, message: "Tournament not found" }, 404);
  }

  return c.json({
    ok: true,
    tournament: {
      id: tournament.id,
      name: tournament.name,
      entryFee: centsToMoney(tournament.entry_fee_cents),
      prizePool: centsToMoney(tournament.prize_pool_cents),
      maxPlayers: tournament.max_players,
      joinedPlayers: tournament.participant_ids.length,
      status: tournament.status,
      bracketType: tournament.bracket_type,
      bracketState: tournament.bracket_state,
    },
  });
});

app.post("/api/tournaments/create", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);
  
  const store = c.get("store");
  const body = await c.req.json();

  const entryFeeCents = body.entryFee ? body.entryFee * 100 : 0; // assuming input was dollars/credits, simplified

  const tournament = await store.createTournament({
    name: body.name || "Custom Tournament",
    entryFeeCents,
    maxPlayers: body.maxPlayers || 8,
    hostId: user.id,
    teamSize: body.teamSize || 1,
    tournamentType: body.tournamentType || "online",
    bracketType: body.bracketType || "single_elimination",
    password: body.password || null
  });

  return c.json({ ok: true, tournament });
});

app.post("/api/tournaments/:id/join", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);
  
  const store = c.get("store");
  const tournamentId = c.req.param("id");

  try {
    const result = await store.joinTournament(user.id, tournamentId);
    return c.json({
      ok: true,
      tournament: {
        id: result.tournament.id,
        name: result.tournament.name,
        joinedPlayers: result.tournament.participant_ids.length,
        status: result.tournament.status
      },
      wallet: {
        balance: centsToMoney(result.user.wallet_balance_cents)
      }
    });
  } catch (e: any) {
    return c.json({ ok: false, message: e.message }, 409);
  }
});

// --- Wallet ---
app.get("/api/wallet", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const entries = await store.listWalletEntries(user.id);
  
  const transactions = entries.map(e => ({
    id: e.id,
    type: e.type,
    amount: centsToMoney(e.amount_cents),
    createdAt: e.created_at,
    referenceType: e.reference_type,
    referenceId: e.reference_id
  }));

  return c.json({
    ok: true,
    wallet: {
      balance: centsToMoney(user.wallet_balance_cents),
      transactions
    }
  });
});

app.post("/api/wallet/transfer", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const body = await c.req.json();
  const { recipientId, amount } = body;

  if (!recipientId || !amount) {
    return c.json({ ok: false, message: "Recipient and amount are required" }, 400);
  }

  const amountCents = Math.round(Number(amount) * 100);
  if (isNaN(amountCents) || amountCents <= 0) {
    return c.json({ ok: false, message: "Invalid amount" }, 400);
  }

  if (recipientId === user.id) {
    return c.json({ ok: false, message: "You cannot transfer credits to yourself" }, 400);
  }

  const store = c.get("store");
  try {
    const updatedUser = await store.transferCredits(user.id, recipientId, amountCents);
    return c.json({
      ok: true,
      message: "Transfer successful",
      newBalance: centsToMoney(updatedUser.wallet_balance_cents)
    });
  } catch (err: any) {
    return c.json({ ok: false, message: err.message }, 400);
  }
});


// --- Leaderboard ---
app.get("/api/leaderboard/global", async (c) => {
  const store = c.get("store");
  const users = await store.listUsers();
  
  const entries = users.map((u) => ({
    userId: u.id,
    displayName: u.name,
    wins: 0, // In a real app we'd aggregate these with getUserMatchStats
    losses: 0,
    earnings: {
      amount: "0.00",
      currency: "USD"
    }
  }));

  return c.json({ ok: true, entries });
});

// --- Admin (Stubbed for UI demo) ---
app.get("/api/admin/overview", async (c) => {
  // In a real app we'd enforce admin role
  const store = c.get("store");
  const tournaments = await store.listTournaments();
  
  return c.json({
    ok: true,
    totalTournaments: tournaments.length,
    activeTournaments: tournaments.filter(t => t.status === "open" || t.status === "in_progress").length,
    completedTournaments: tournaments.filter(t => t.status === "completed").length,
    totalMatches: 0,
    activeMatches: 0,
    pendingApprovals: [],
    tournaments: tournaments.map(t => ({
      id: t.id,
      name: t.name,
      status: t.status,
      joinedPlayers: t.participant_ids.length,
      maxPlayers: t.max_players
    }))
  });
});

// Unmatched routes
app.all("*", (c) => {
  return c.json({ ok: false, message: "Not Found" }, 404);
});

export default app;
