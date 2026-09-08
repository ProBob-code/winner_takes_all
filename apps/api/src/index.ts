import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import type { AppContext, Env } from "./types";
import { D1Store, InsufficientFundsError, type TournamentRecord } from "./lib/d1-store";
import {
  createSessionTokens,
  getRefreshSession,
  deleteRefreshSession,
  deleteAccessSession,
  buildSessionCookies,
  buildLogoutCookies,
  parseCookies,
} from "./lib/kv-sessions";
import { hashPassword, verifyPassword, createId, sha256Hex, timingSafeEqual } from "./lib/crypto";
import { createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature } from "./lib/razorpay";
import {
  signBroadcastToken,
  verifyBroadcastToken,
  realtimeConfig,
  callRealtime,
  putFeed,
  listFeeds,
  deleteFeed,
  BROADCAST_TOKEN_TTL_SECONDS,
  type StreamFeed,
  type RealtimeConfig,
} from "./lib/realtime";
import { authMiddleware, requireUser, requireAdmin, serializeUser, extractAccessToken } from "./middleware/auth";
import { centsToMoney } from "./lib/money";
import { checkRateLimit, clientKey } from "./lib/rate-limit";
import * as Engine from "./lib/tournament-engine";
import {
  ValidationError,
  parseBody,
  signupSchema,
  loginSchema,
  createOrderSchema,
  verifyPaymentSchema,
  transferSchema,
  createTournamentSchema,
  joinTournamentSchema,
  submitScoreSchema,
  addTeamSchema,
  engineScoreSchema,
  highlightSchema,
  reorderSchema,
  upsertArenaSchema,
  broadcastTokenSchema,
  streamSessionSchema,
  streamTracksSchema,
  streamRenegotiateSchema,
  streamCloseSchema,
  registerFeedSchema,
} from "./lib/validation";

const app = new Hono<AppContext>();

const DEFAULT_ORIGINS = ["https://winner-takes-all.pages.dev", "http://localhost:3000"];

function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : DEFAULT_ORIGINS;
}

// Inject store
app.use("/api/*", async (c, next) => {
  c.set("store", new D1Store(c.env.DB));
  await next();
});

// CORS
app.use("/api/*", async (c, next) => {
  const handler = cors({
    origin: allowedOrigins(c.env),
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });
  return handler(c, next);
});

// CSRF defense: cookies are SameSite=None, so reject browser-originated
// mutations from origins we don't recognize. Requests without an Origin
// header (curl, server-to-server) pass through — they can't ride a victim's
// browser cookies. The Razorpay webhook is signature-verified instead.
app.use("/api/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  if (c.req.path === "/api/payments/webhook") return next();

  const origin = c.req.header("Origin");
  if (origin && !allowedOrigins(c.env).includes(origin)) {
    return c.json({ ok: false, message: "Origin not allowed" }, 403);
  }
  return next();
});

// Attach user (if any) to every request
app.use("/api/*", authMiddleware);

// Centralized error handling: safe messages out, details to logs.
app.onError((err, c) => {
  if (err instanceof ValidationError) {
    return c.json({ ok: false, message: err.message }, 400);
  }
  if (err instanceof InsufficientFundsError) {
    return c.json({ ok: false, message: err.message }, 400);
  }
  console.error(`Unhandled error on ${c.req.method} ${c.req.path}:`, err);
  return c.json({ ok: false, message: "Internal server error" }, 500);
});

async function readJson(c: Context<AppContext>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

async function rateLimit(
  c: Context<AppContext>,
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<Response | null> {
  const key = `${bucket}:${clientKey(c.req.raw)}`;
  const result = await checkRateLimit(c.env.SESSIONS, key, limit, windowSeconds);
  if (!result.allowed) {
    return c.json({ ok: false, message: "Too many requests, please try again later" }, 429);
  }
  return null;
}

/** Public representation of a tournament — never leaks the join password. */
function serializeTournament(t: TournamentRecord) {
  return {
    id: t.id,
    name: t.name,
    entryFee: centsToMoney(t.entry_fee_cents),
    prizePool: centsToMoney(t.prize_pool_cents),
    maxPlayers: t.max_players,
    joinedPlayers: t.participant_ids.length,
    status: t.status,
    bracketType: t.bracket_type,
    bracketState: t.bracket_state,
    teamSize: t.team_size,
    tournamentType: t.tournament_type,
    hostId: t.host_id,
    winnerId: t.winner_id,
    hasPassword: !!t.password,
  };
}

// --- Health ---
app.get("/api/health", (c) => c.json({ ok: true, service: "api", timestamp: new Date().toISOString() }));

// --- Auth ---
app.post("/api/auth/signup", async (c) => {
  const limited = await rateLimit(c, "signup", 10, 300);
  if (limited) return limited;

  const store = c.get("store");
  const body = parseBody(signupSchema, await readJson(c));

  const existing = await store.getUserByEmail(body.email);
  if (existing) {
    return c.json({ ok: false, message: "An account already exists for this email" }, 409);
  }

  const hashed = await hashPassword(body.password);
  const user = await store.createUserWithBonus(body.name, body.email, hashed, 100000); // ₹1000 signup bonus

  const tokens = await createSessionTokens(c.env.SESSIONS, user.id);
  const [access, refresh] = buildSessionCookies(tokens);
  c.header("Set-Cookie", access, { append: true });
  c.header("Set-Cookie", refresh, { append: true });

  return c.json({ ok: true, user: serializeUser(user) }, 201);
});

app.post("/api/auth/login", async (c) => {
  const limited = await rateLimit(c, "login", 10, 300);
  if (limited) return limited;

  const store = c.get("store");
  const body = parseBody(loginSchema, await readJson(c));

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
    if (typeof body?.refreshToken === "string") refreshToken = body.refreshToken;
  } catch { /* body optional */ }

  if (!refreshToken) {
    refreshToken = parseCookies(c.req.header("Cookie"))["wta_refresh_token"];
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
  // Revoke server-side sessions, not just cookies.
  const accessToken = extractAccessToken(c);
  const refreshToken = parseCookies(c.req.header("Cookie"))["wta_refresh_token"];
  await Promise.all([
    accessToken ? deleteAccessSession(c.env.SESSIONS, accessToken) : Promise.resolve(),
    refreshToken ? deleteRefreshSession(c.env.SESSIONS, refreshToken) : Promise.resolve(),
  ]);

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

  return c.json({
    ok: true,
    user: {
      ...serializeUser(user),
      stats: { ...stats, winRate, tournamentWins: stats.tournament_wins },
    },
  });
});

// --- Payments ---
app.post("/api/payments/create-order", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const limited = await rateLimit(c, `order:${user.id}`, 10, 60);
  if (limited) return limited;

  const body = parseBody(createOrderSchema, await readJson(c));
  const amountCents = Math.round(body.amount * 100);

  if (!c.env.RAZORPAY_KEY_ID || !c.env.RAZORPAY_KEY_SECRET) {
    console.error("Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in worker environment");
    return c.json({ ok: false, message: "Payment gateway is not configured on the server" }, 500);
  }

  const store = c.get("store");

  // Idempotency: if the client retries with the same key, return the same order.
  if (body.idempotencyKey) {
    const existing = await store.getPaymentByIdempotencyKey(body.idempotencyKey);
    if (existing && existing.user_id === user.id && existing.status === "pending" && existing.provider_order_id) {
      return c.json({
        ok: true,
        razorpayOrderId: existing.provider_order_id,
        amount: existing.amount_cents,
        currency: existing.currency,
        keyId: c.env.RAZORPAY_KEY_ID,
      });
    }
  }

  try {
    const order = await createRazorpayOrder(
      c.env.RAZORPAY_KEY_ID,
      c.env.RAZORPAY_KEY_SECRET,
      amountCents,
      "INR",
      { userId: user.id }
    );

    await store.createPayment({
      userId: user.id,
      amountCents,
      providerOrderId: order.id,
      idempotencyKey: body.idempotencyKey ?? createId("idempotency"),
    });

    return c.json({
      ok: true,
      razorpayOrderId: order.id,
      amount: amountCents,
      currency: "INR",
      keyId: c.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("Razorpay order creation error:", err instanceof Error ? err.message : err);
    return c.json({ ok: false, message: "Payment gateway error, please try again" }, 502);
  }
});

app.post("/api/payments/verify", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const body = parseBody(verifyPaymentSchema, await readJson(c));

  const isValid = await verifyPaymentSignature(
    c.env.RAZORPAY_KEY_SECRET ?? "",
    body.razorpayOrderId,
    body.razorpayPaymentId,
    body.razorpaySignature
  );
  if (!isValid) return c.json({ ok: false, message: "Invalid payment signature" }, 400);

  const store = c.get("store");
  const payment = await store.getPaymentByOrderId(body.razorpayOrderId);
  if (!payment) return c.json({ ok: false, message: "Payment not found" }, 404);

  // The payment must belong to the caller — verifying someone else's order
  // must never credit your own wallet.
  if (payment.user_id !== user.id) {
    return c.json({ ok: false, message: "Payment does not belong to this account" }, 403);
  }

  // If webhook already processed it, report success without double-crediting.
  if (payment.status === "success") return c.json({ ok: true, already_processed: true });
  if (payment.status !== "pending") return c.json({ ok: false, message: "Payment already processed" }, 400);

  // Only the single caller that wins the pending→success transition credits
  // the wallet; a concurrent webhook sees `claimed === false`.
  const claimed = await store.markPaymentSuccess(payment.id, body.razorpayPaymentId);
  if (!claimed) return c.json({ ok: true, already_processed: true });

  await store.creditWallet(payment.user_id, payment.amount_cents, "wallet_topup", payment.id, "deposit", payment.id);
  return c.json({ ok: true });
});

app.post("/api/payments/webhook", async (c) => {
  const signature = c.req.header("X-Razorpay-Signature");
  if (!signature) return c.json({ ok: false, message: "Missing signature" }, 400);

  const rawBody = await c.req.arrayBuffer();
  // Fail closed: without a configured webhook secret no webhook is accepted.
  const isValid = await verifyWebhookSignature(c.env.RAZORPAY_WEBHOOK_SECRET ?? "", rawBody, signature);
  if (!isValid) return c.json({ ok: false, message: "Invalid signature" }, 400);

  const body = JSON.parse(new TextDecoder().decode(rawBody));

  if (body.event === "payment.captured") {
    const payload = body.payload?.payment?.entity;
    const orderId = payload?.order_id;
    const paymentId = payload?.id;
    if (!orderId || !paymentId) return c.json({ ok: false, message: "Malformed payload" }, 400);

    const store = c.get("store");
    const payment = await store.getPaymentByOrderId(orderId);

    if (payment) {
      const claimed = await store.markPaymentSuccess(payment.id, paymentId);
      if (claimed) {
        await store.creditWallet(payment.user_id, payment.amount_cents, "wallet_topup", payment.id, "deposit", payment.id);
      }
    }
  }

  return c.json({ ok: true });
});

// --- Tournaments ---
app.get("/api/tournaments", async (c) => {
  const store = c.get("store");
  const tournaments = await store.listTournaments();
  return c.json({ ok: true, tournaments: tournaments.map(serializeTournament) });
});

app.get("/api/tournaments/:id", async (c) => {
  const store = c.get("store");
  const tournament = await store.getTournament(c.req.param("id"));
  if (!tournament) {
    return c.json({ ok: false, message: "Tournament not found" }, 404);
  }
  return c.json({ ok: true, tournament: serializeTournament(tournament) });
});

app.post("/api/tournaments/create", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const body = parseBody(createTournamentSchema, await readJson(c));

  const tournament = await store.createTournament({
    name: body.name,
    entryFeeCents: Math.round(body.entryFee * 100),
    maxPlayers: body.maxPlayers,
    hostId: user.id,
    teamSize: body.teamSize,
    tournamentType: body.tournamentType,
    bracketType: body.bracketType,
    password: body.password ?? null,
  });

  return c.json({ ok: true, tournament: serializeTournament(tournament) });
});

app.post("/api/tournaments/:id/join", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const tournamentId = c.req.param("id");
  const body = parseBody(joinTournamentSchema, await readJson(c).catch(() => ({})));

  const tournament = await store.getTournament(tournamentId);
  if (!tournament) return c.json({ ok: false, message: "Tournament not found" }, 404);

  if (tournament.password && !timingSafeEqual(tournament.password, body.password ?? "")) {
    return c.json({ ok: false, message: "Incorrect tournament password" }, 403);
  }

  try {
    const result = await store.joinTournament(user.id, tournamentId);
    return c.json({
      ok: true,
      tournament: serializeTournament(result.tournament),
      wallet: { balance: centsToMoney(result.user.wallet_balance_cents) },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to join tournament";
    return c.json({ ok: false, message }, 409);
  }
});

app.get("/api/tournaments/:id/participants", async (c) => {
  const store = c.get("store");
  const tournamentId = c.req.param("id");
  const tournament = await store.getTournament(tournamentId);
  if (!tournament) return c.json({ ok: false, message: "Tournament not found" }, 404);

  const participants = await store.getParticipants(tournamentId);
  return c.json({
    ok: true,
    participants: participants.map((p) => ({
      userId: p.user_id,
      name: p.user_name,
      teamId: p.team_id,
      teamName: p.team_name,
      status: p.status,
      seed: p.seed,
      wins: p.wins,
      losses: p.losses,
    })),
  });
});

app.get("/api/tournaments/:id/bracket", async (c) => {
  const store = c.get("store");
  const tournamentId = c.req.param("id");
  const tournament = await store.getTournament(tournamentId);
  if (!tournament) return c.json({ ok: false, message: "Tournament not found" }, 404);

  const matches = await store.listMatchesByTournament(tournamentId);
  return c.json({
    ok: true,
    bracketType: tournament.bracket_type,
    bracketState: tournament.bracket_state,
    matches: matches.map((m) => ({
      id: m.id,
      round: m.round,
      matchOrder: m.match_order,
      player1Id: m.player1_id,
      player2Id: m.player2_id,
      winnerId: m.winner_id,
      status: m.status,
      player1Score: m.player1_score,
      player2Score: m.player2_score,
      scoresApproved: m.scores_approved,
    })),
  });
});

// --- Matches (bracket play) ---

app.get("/api/matches/:id", async (c) => {
  const store = c.get("store");
  const match = await store.getMatch(c.req.param("id"));
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);
  return c.json({ ok: true, match });
});

app.post("/api/matches/:id/submit-score", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const match = await store.getMatch(c.req.param("id"));
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);
  if (match.scores_approved) return c.json({ ok: false, message: "Scores already approved" }, 400);

  const tournament = await store.getTournament(match.tournament_id);
  const isHost = tournament?.host_id === user.id || user.role === "admin";
  const isPlayer = match.player1_id === user.id || match.player2_id === user.id;
  if (!isHost && !isPlayer) {
    return c.json({ ok: false, message: "Only match players or the host can submit scores" }, 403);
  }

  const body = parseBody(submitScoreSchema, await readJson(c));

  if ("score" in body) {
    // A player reports their own score.
    if (!isPlayer) return c.json({ ok: false, message: "Only match players can self-report a score" }, 403);
    const field = match.player1_id === user.id ? "player1_submitted_score" : "player2_submitted_score";
    await store.updateMatch(match.id, { [field]: body.score });
  } else {
    // The host (or tracker) reports the full result.
    if (!isHost) return c.json({ ok: false, message: "Only the host can submit the full result" }, 403);
    if (body.winnerId && body.winnerId !== match.player1_id && body.winnerId !== match.player2_id) {
      return c.json({ ok: false, message: "winnerId must be one of the match players" }, 400);
    }
    await store.updateMatch(match.id, {
      player1_submitted_score: body.player1Score,
      player2_submitted_score: body.player2Score,
      ...(body.winnerId ? { winner_id: body.winnerId } : {}),
    });
  }

  return c.json({ ok: true });
});

app.post("/api/matches/:id/approve-scores", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const match = await store.getMatch(c.req.param("id"));
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);
  if (match.scores_approved) return c.json({ ok: false, message: "Scores already approved" }, 400);

  const tournament = await store.getTournament(match.tournament_id);
  if (tournament?.host_id !== user.id && user.role !== "admin") {
    return c.json({ ok: false, message: "Only the tournament host can approve scores" }, 403);
  }

  const p1 = match.player1_submitted_score ?? match.player1_score;
  const p2 = match.player2_submitted_score ?? match.player2_score;
  const winnerId = match.winner_id ?? (p1 === p2 ? null : p1 > p2 ? match.player1_id : match.player2_id);

  await store.updateMatch(match.id, {
    player1_score: p1,
    player2_score: p2,
    winner_id: winnerId,
    scores_approved: 1,
    status: "completed",
    completed_at: new Date().toISOString(),
  });

  return c.json({ ok: true });
});

// --- Wallet ---
app.get("/api/wallet", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const entries = await store.listWalletEntries(user.id);

  const transactions = entries.map((e) => ({
    id: e.id,
    type: e.type,
    amount: centsToMoney(e.amount_cents),
    createdAt: e.created_at,
    referenceType: e.reference_type,
    referenceId: e.reference_id,
  }));

  return c.json({
    ok: true,
    wallet: {
      balance: centsToMoney(user.wallet_balance_cents),
      transactions,
    },
  });
});

app.post("/api/wallet/transfer", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const limited = await rateLimit(c, `transfer:${user.id}`, 20, 60);
  if (limited) return limited;

  const body = parseBody(transferSchema, await readJson(c));
  const amountCents = Math.round(body.amount * 100);

  if (body.recipientId === user.id) {
    return c.json({ ok: false, message: "You cannot transfer credits to yourself" }, 400);
  }

  const store = c.get("store");
  try {
    const updatedUser = await store.transferCredits(user.id, body.recipientId, amountCents);
    return c.json({
      ok: true,
      message: "Transfer successful",
      newBalance: centsToMoney(updatedUser.wallet_balance_cents),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transfer failed";
    return c.json({ ok: false, message }, 400);
  }
});

// --- Notifications ---
app.get("/api/notifications", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const [notifications, unreadCount] = await Promise.all([
    store.listNotifications(user.id),
    store.countUnreadNotifications(user.id),
  ]);

  return c.json({ ok: true, notifications, unreadCount });
});

app.post("/api/notifications/:id/read", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const updated = await store.markNotificationRead(c.req.param("id"), user.id);
  if (!updated) return c.json({ ok: false, message: "Notification not found" }, 404);
  return c.json({ ok: true });
});

// --- Leaderboard ---
app.get("/api/leaderboard/global", async (c) => {
  const store = c.get("store");
  const rows = await store.getGlobalLeaderboard();

  const entries = rows.map((r) => ({
    userId: r.user_id,
    displayName: r.name,
    wins: r.wins,
    losses: r.losses,
    tournamentWins: r.tournament_wins,
    earnings: centsToMoney(r.earnings_cents),
  }));

  return c.json({ ok: true, entries });
});

// --- Admin ---
app.get("/api/admin/overview", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ ok: false, message: "Admin access required" }, 403);

  const store = c.get("store");
  const tournaments = await store.listTournaments();

  return c.json({
    ok: true,
    totalTournaments: tournaments.length,
    activeTournaments: tournaments.filter((t) => t.status === "open" || t.status === "in_progress").length,
    completedTournaments: tournaments.filter((t) => t.status === "completed").length,
    tournaments: tournaments.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      joinedPlayers: t.participant_ids.length,
      maxPlayers: t.max_players,
    })),
  });
});

// --- Tournament Engine ---

/** Load a tournament and confirm the caller may manage it (host or admin). */
async function requireTournamentManager(
  c: Context<AppContext>,
  tournamentId: string
): Promise<{ tournament: TournamentRecord } | { error: Response }> {
  const user = requireUser(c);
  if (!user) return { error: c.json({ ok: false, message: "Authentication required" }, 401) };

  const tournament = await c.get("store").getTournament(tournamentId);
  if (!tournament) return { error: c.json({ ok: false, message: "Tournament not found" }, 404) };

  if (tournament.host_id !== user.id && user.role !== "admin") {
    return { error: c.json({ ok: false, message: "Only the tournament host can manage matches" }, 403) };
  }
  return { tournament };
}

app.get("/api/engine/tournaments/:id/state", async (c) => {
  const store = c.get("store");
  const tournamentId = c.req.param("id");

  const [teams, matches, tournament] = await Promise.all([
    store.getEngineTeams(tournamentId),
    store.getEngineMatches(tournamentId),
    store.getTournament(tournamentId),
  ]);

  if (!tournament) return c.json({ ok: false, message: "Tournament not found" }, 404);

  return c.json({
    ok: true,
    phase: tournament.status as Engine.TournamentPhase,
    teams,
    matches,
  });
});

app.post("/api/engine/tournaments/:id/add-team", async (c) => {
  const tournamentId = c.req.param("id");
  const access = await requireTournamentManager(c, tournamentId);
  if ("error" in access) return access.error;
  const { tournament } = access;

  const store = c.get("store");
  const body = parseBody(addTeamSchema, await readJson(c).catch(() => ({})));

  if (tournament.status !== "GROUP" && tournament.status !== "open") {
    return c.json({ ok: false, message: "Can only add teams during GROUP or SETUP phase" }, 400);
  }

  const team = await store.createEngineTeam(
    tournamentId,
    body.name || `Team ${Math.floor(Math.random() * 1000)}`
  );

  // Run a generation pass so the newcomer gets matched if anyone is waiting.
  const [allTeams, matchups, matches] = await Promise.all([
    store.getEngineTeams(tournamentId),
    store.getEngineMatchups(tournamentId),
    store.getEngineMatches(tournamentId),
  ]);

  if (matches.length > 0) {
    const limit = tournament.max_matches_per_team || 2;
    const { matches: nextMatches } = Engine.generateNextMatches(allTeams, matchups, "GROUP", limit);

    const relevantMatches = nextMatches.filter((m) => m.team_a_id === team.id || m.team_b_id === team.id);
    for (const nm of relevantMatches) {
      const match = await store.createEngineMatch(tournamentId, nm);
      await store.createEngineMatchup(tournamentId, match.team_a_id, match.team_b_id, match.id);
    }
  }

  return c.json({ ok: true, team });
});

app.post("/api/engine/tournaments/:id/start", async (c) => {
  const tournamentId = c.req.param("id");
  const access = await requireTournamentManager(c, tournamentId);
  if ("error" in access) return access.error;

  await c.get("store").updateTournamentStatus(tournamentId, "GROUP");
  return c.json({ ok: true });
});

app.post("/api/engine/tournaments/:id/generate", async (c) => {
  const tournamentId = c.req.param("id");
  const access = await requireTournamentManager(c, tournamentId);
  if ("error" in access) return access.error;
  const { tournament } = access;

  const store = c.get("store");
  const [teams, matchups, matches] = await Promise.all([
    store.getEngineTeams(tournamentId),
    store.getEngineMatchups(tournamentId),
    store.getEngineMatches(tournamentId),
  ]);

  if (matches.some((m) => m.status === "LIVE")) {
    return c.json({ ok: false, message: "Cannot generate matches while a match is LIVE" }, 400);
  }

  const limit = tournament.max_matches_per_team || 2;
  const { matches: nextMatches, byeTeamId } = Engine.generateNextMatches(teams, matchups, "GROUP", limit);

  for (const mData of nextMatches) {
    const match = await store.createEngineMatch(tournamentId, mData);
    await store.createEngineMatchup(tournamentId, match.team_a_id, match.team_b_id, match.id);
  }

  if (byeTeamId) {
    const team = teams.find((t) => t.id === byeTeamId);
    if (team) {
      await store.updateEngineTeam(byeTeamId, {
        matches_played: team.matches_played + 1,
        group_points: team.group_points + 1,
        bye_assigned: true,
      });
    }
  }

  return c.json({ ok: true, matchesCreated: nextMatches.length, byeAssigned: !!byeTeamId });
});

app.post("/api/engine/matches/:id/start", async (c) => {
  const store = c.get("store");
  const match = await store.getEngineMatch(c.req.param("id"));
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  const access = await requireTournamentManager(c, match.tournament_id);
  if ("error" in access) return access.error;

  const allMatches = await store.getEngineMatches(match.tournament_id);
  if (allMatches.some((m) => m.status === "LIVE")) {
    return c.json({ ok: false, message: "Another match is already LIVE" }, 400);
  }

  await store.updateEngineMatch(match.id, {
    status: "LIVE",
    start_time: Math.floor(Date.now() / 1000),
  });

  return c.json({ ok: true });
});

app.post("/api/engine/matches/:id/extra-time", async (c) => {
  const store = c.get("store");
  const match = await store.getEngineMatch(c.req.param("id"));
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  const access = await requireTournamentManager(c, match.tournament_id);
  if ("error" in access) return access.error;

  await store.updateEngineMatch(match.id, { duration: match.duration + 60 });
  return c.json({ ok: true });
});

app.post("/api/engine/tournaments/:id/reorder", async (c) => {
  const tournamentId = c.req.param("id");
  const access = await requireTournamentManager(c, tournamentId);
  if ("error" in access) return access.error;

  const store = c.get("store");
  const body = parseBody(reorderSchema, await readJson(c));

  // Only reorder matches that belong to this tournament.
  const matches = await store.getEngineMatches(tournamentId);
  const owned = new Set(matches.map((m) => m.id));

  for (let i = 0; i < body.matchIds.length; i++) {
    if (owned.has(body.matchIds[i])) {
      await store.updateEngineMatch(body.matchIds[i], { match_order: i });
    }
  }

  return c.json({ ok: true });
});

app.post("/api/engine/matches/:id/highlight", async (c) => {
  const store = c.get("store");
  const match = await store.getEngineMatch(c.req.param("id"));
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  const access = await requireTournamentManager(c, match.tournament_id);
  if ("error" in access) return access.error;

  const body = parseBody(highlightSchema, await readJson(c));
  await store.updateEngineMatch(match.id, { active_team_id: body.teamId });
  return c.json({ ok: true });
});

app.post("/api/engine/matches/:id/score", async (c) => {
  const store = c.get("store");
  let match = await store.getEngineMatch(c.req.param("id"));
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  const access = await requireTournamentManager(c, match.tournament_id);
  if ("error" in access) return access.error;

  const body = parseBody(engineScoreSchema, await readJson(c));
  if (body.teamId !== match.team_a_id && body.teamId !== match.team_b_id) {
    return c.json({ ok: false, message: "teamId is not part of this match" }, 400);
  }

  // Check timer first, then apply the score event.
  const { updatedMatch: timedMatch, matchEnded: timerEnded } = Engine.checkTimer(match, Math.floor(Date.now() / 1000));
  match = timedMatch;

  const { updatedMatch: finalMatch, matchEnded: scoreEnded } = Engine.processScoreUpdate(match, body.teamId, body.type);

  await store.updateEngineMatch(finalMatch.id, {
    score_team_a: finalMatch.score_team_a,
    score_team_b: finalMatch.score_team_b,
    balls_potted_a: finalMatch.balls_potted_a,
    balls_potted_b: finalMatch.balls_potted_b,
    black_potted_a: finalMatch.black_potted_a,
    black_potted_b: finalMatch.black_potted_b,
    status: finalMatch.status,
    winner_id: finalMatch.winner_id,
    sudden_death: finalMatch.sudden_death,
    ended_by: scoreEnded ? "SCORE" : timerEnded ? "TIME" : null,
  });

  if (timerEnded || scoreEnded) {
    // Finalize team stats.
    const teams = await store.getEngineTeams(finalMatch.tournament_id);
    const teamA = teams.find((t) => t.id === finalMatch.team_a_id);
    const teamB = teams.find((t) => t.id === finalMatch.team_b_id);

    if (teamA) {
      await store.updateEngineTeam(teamA.id, {
        matches_played: teamA.matches_played + 1,
        total_score: teamA.total_score + finalMatch.score_team_a,
        group_points: teamA.group_points + (finalMatch.winner_id === teamA.id ? 1 : 0),
      });
    }
    if (teamB) {
      await store.updateEngineTeam(teamB.id, {
        matches_played: teamB.matches_played + 1,
        total_score: teamB.total_score + finalMatch.score_team_b,
        group_points: teamB.group_points + (finalMatch.winner_id === teamB.id ? 1 : 0),
      });
    }
  }

  return c.json({ ok: true, match: finalMatch });
});

// --- Public Arenas ---

app.get("/api/public-arenas", async (c) => {
  const arenas = await c.get("store").listArenas();
  const viewer = c.get("user");
  return c.json({
    ok: true,
    arenas: arenas.map((a) => ({
      id: a.id,
      name: a.name,
      state: a.state,
      isLocked: !!a.pin,
      updatedAt: a.updated_at,
      // Lets the UI offer broadcasting only to whoever can actually mint a
      // broadcast token for this arena.
      isOwner: !!viewer && (a.owner_id === viewer.id || viewer.role === "admin"),
    })),
  });
});

app.post("/api/public-arenas", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const limited = await rateLimit(c, `arena:${user.id}`, 30, 60);
  if (limited) return limited;

  const store = c.get("store");
  const body = parseBody(upsertArenaSchema, await readJson(c));

  const existing = await store.getArena(body.id);

  if (existing) {
    // Locked arenas may only be updated by the owner or with the correct PIN.
    if (existing.pin) {
      const suppliedHash = body.pin ? await sha256Hex(body.pin) : "";
      const pinMatches =
        !!body.pin &&
        (timingSafeEqual(existing.pin, suppliedHash) ||
          // Legacy rows stored the PIN in plaintext.
          timingSafeEqual(existing.pin, body.pin));
      const isOwner = existing.owner_id === user.id || user.role === "admin";
      if (!pinMatches && !isOwner) {
        return c.json({ ok: false, message: "Invalid PIN. This arena is locked." }, 403);
      }
    }
  }

  const newPinHash = body.pin ? await sha256Hex(body.pin) : existing?.pin ?? null;

  try {
    await store.upsertArena({
      id: body.id,
      name: body.name,
      state: body.state,
      pin: newPinHash,
      ownerId: existing?.owner_id ?? user.id,
    });
  } catch (err) {
    // A database created before owner_id/updated_at existed fails here with
    // "no such column". Surfacing that beats a generic 500, because the fix is
    // a migration the operator has to run by hand.
    const detail = err instanceof Error ? err.message : String(err);
    if (/no such column/i.test(detail)) {
      return c.json(
        {
          ok: false,
          message:
            "Arena storage is out of date and is missing a column. Run migrations/0004_arena_columns.sql against the D1 database.",
          detail,
        },
        500
      );
    }
    throw err;
  }

  return c.json({ ok: true, id: body.id });
});

app.get("/api/public-arenas/:id", async (c) => {
  const arena = await c.get("store").getArena(c.req.param("id"));
  if (!arena) return c.json({ ok: false, message: "Arena not found" }, 404);

  const viewer = c.get("user");
  return c.json({
    ok: true,
    arena: {
      id: arena.id,
      name: arena.name,
      state: arena.state,
      isLocked: !!arena.pin,
      isOwner: !!viewer && (arena.owner_id === viewer.id || viewer.role === "admin"),
    },
  });
});

// --- Live Match Streaming (Cloudflare Realtime SFU) ---
//
// Media is relayed by the SFU and never recorded. This Worker only signs
// broadcast grants, proxies SDP so the app secret stays server-side, and keeps
// a short-lived list of who is currently streaming.

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Returns the SFU config, or the 503 to send when streaming is not set up.
 * Returning a union rather than a pair keeps the caller's narrowing simple:
 * `if (x instanceof Response) return x;`
 */
function requireRealtime(c: Context<AppContext>): RealtimeConfig | Response {
  const config = realtimeConfig(c.env);
  if (!config) {
    return c.json(
      { ok: false, message: "Live streaming is not configured on this deployment." },
      503
    );
  }
  return config;
}

/** Host mints the QR payload for one match. Owner or arena PIN only. */
app.post("/api/stream/broadcast-token", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const secret = c.env.BROADCAST_TOKEN_SECRET;
  if (!secret) {
    return c.json({ ok: false, message: "Live streaming is not configured on this deployment." }, 503);
  }

  const limited = await rateLimit(c, `broadcast-token:${user.id}`, 60, 60);
  if (limited) return limited;

  const body = parseBody(broadcastTokenSchema, await readJson(c));
  const arena = await c.get("store").getArena(body.arenaId);
  if (!arena) return c.json({ ok: false, message: "Arena not found" }, 404);

  const isOwner = arena.owner_id === user.id || user.role === "admin";
  if (!isOwner) {
    // Non-owners must present the arena PIN, matching the arena update rules.
    const suppliedHash = body.pin ? await sha256Hex(body.pin) : "";
    const pinMatches =
      !!body.pin &&
      (timingSafeEqual(arena.pin ?? "", suppliedHash) || timingSafeEqual(arena.pin ?? "", body.pin));
    if (!arena.pin || !pinMatches) {
      return c.json({ ok: false, message: "Only the arena host can start a broadcast." }, 403);
    }
  }

  const exp = nowSeconds() + BROADCAST_TOKEN_TTL_SECONDS;
  const token = await signBroadcastToken(secret, {
    arenaId: body.arenaId,
    matchId: body.matchId,
    exp,
  });

  const origin = c.env.PUBLIC_APP_ORIGIN || allowedOrigins(c.env)[0];
  const url = `${origin}/broadcast/${encodeURIComponent(body.arenaId)}/${encodeURIComponent(
    body.matchId
  )}?t=${encodeURIComponent(token)}`;

  return c.json({ ok: true, token, url, expiresAt: exp });
});

/** Open a WebRTC session against the SFU. */
app.post("/api/stream/session", async (c) => {
  const config = requireRealtime(c);
  if (config instanceof Response) return config;

  const limited = await rateLimit(c, "stream-session", 60, 60);
  if (limited) return limited;

  const body = parseBody(streamSessionSchema, await readJson(c));
  const result = await callRealtime(config, "/sessions/new", {
    method: "POST",
    // Omitted entirely when the caller has no SDP to offer; the SFU rejects an
    // empty JSON object here.
    body: body.sessionDescription ? { sessionDescription: body.sessionDescription } : undefined,
  });

  if (result.status >= 400) {
    return c.json(
      {
        ok: false,
        message: `Could not open a streaming session — the media server returned ${result.status}.`,
        detail: result.body,
      },
      502
    );
  }
  return c.json({ ok: true, ...result.body });
});

/** Publish local tracks or subscribe to remote ones. */
app.post("/api/stream/tracks", async (c) => {
  const config = requireRealtime(c);
  if (config instanceof Response) return config;

  const limited = await rateLimit(c, "stream-tracks", 120, 60);
  if (limited) return limited;

  const body = parseBody(streamTracksSchema, await readJson(c));
  const payload: Record<string, unknown> = { tracks: body.tracks };
  if (body.sessionDescription) payload.sessionDescription = body.sessionDescription;

  const result = await callRealtime(config, `/sessions/${encodeURIComponent(body.sessionId)}/tracks/new`, {
    method: "POST",
    body: payload,
  });

  if (result.status >= 400) {
    return c.json(
      {
        ok: false,
        message: `Could not update tracks — the media server returned ${result.status}.`,
        detail: result.body,
      },
      502
    );
  }
  return c.json({ ok: true, ...result.body });
});

app.put("/api/stream/renegotiate", async (c) => {
  const config = requireRealtime(c);
  if (config instanceof Response) return config;

  const body = parseBody(streamRenegotiateSchema, await readJson(c));
  const result = await callRealtime(
    config,
    `/sessions/${encodeURIComponent(body.sessionId)}/renegotiate`,
    { method: "PUT", body: { sessionDescription: body.sessionDescription } }
  );

  if (result.status >= 400) {
    return c.json(
      {
        ok: false,
        message: `Renegotiation failed — the media server returned ${result.status}.`,
        detail: result.body,
      },
      502
    );
  }
  return c.json({ ok: true, ...result.body });
});

/**
 * Release published tracks at the SFU. Closing the PeerConnection already
 * stops media, but the documented lifecycle closes tracks explicitly, and
 * doing so releases the session's resources immediately rather than when the
 * SFU notices the peer is gone.
 *
 * Best effort by design: teardown must never be blocked by a cleanup call.
 */
app.post("/api/stream/tracks/close", async (c) => {
  const config = requireRealtime(c);
  if (config instanceof Response) return config;

  const body = parseBody(streamCloseSchema, await readJson(c));
  const result = await callRealtime(
    config,
    `/sessions/${encodeURIComponent(body.sessionId)}/tracks/close`,
    {
      method: "PUT",
      // force skips the renegotiation round trip; the peer is going away.
      body: { tracks: body.trackNames.map((trackName) => ({ trackName })), force: true },
    }
  );

  // A failure here is not actionable for the client, which is already leaving.
  return c.json({ ok: true, closed: result.status < 400, status: result.status });
});

/**
 * Register or heartbeat a feed. The KV entry carries a short TTL, so a
 * broadcaster that stops heartbeating disappears without any cleanup job.
 */
app.post("/api/stream/feeds", async (c) => {
  const secret = c.env.BROADCAST_TOKEN_SECRET;
  if (!secret) return c.json({ ok: false, message: "Live streaming is not configured." }, 503);

  const body = parseBody(registerFeedSchema, await readJson(c));

  // Rate limiting costs a KV write of its own, which would double the cost of
  // every heartbeat. Registrations create new feeds and are worth guarding;
  // heartbeats carry an existing feedId, are already gated by a signed token,
  // and only refresh a TTL, so they skip it.
  if (!body.feedId) {
    const limited = await rateLimit(c, "stream-feed", 60, 60);
    if (limited) return limited;
  }
  const claims = await verifyBroadcastToken(secret, body.token, nowSeconds());
  if (!claims) {
    return c.json({ ok: false, message: "This broadcast link is invalid or has expired." }, 403);
  }

  const feed: StreamFeed = {
    feedId: body.feedId || createId("feed"),
    arenaId: claims.arenaId,
    matchId: claims.matchId,
    sessionId: body.sessionId,
    trackNames: body.trackNames,
    label: body.label,
    startedAt: nowSeconds(),
  };

  await putFeed(c.env.SESSIONS, feed);
  return c.json({ ok: true, feed });
});

/** Viewers poll this to see which camera angles are live right now. */
app.get("/api/stream/feeds", async (c) => {
  const arenaId = c.req.query("arenaId");
  const matchId = c.req.query("matchId");
  if (!arenaId || !matchId) {
    return c.json({ ok: false, message: "arenaId and matchId are required" }, 400);
  }

  const feeds = await listFeeds(c.env.SESSIONS, arenaId, matchId);
  return c.json({ ok: true, feeds });
});

app.post("/api/stream/feeds/end", async (c) => {
  const secret = c.env.BROADCAST_TOKEN_SECRET;
  if (!secret) return c.json({ ok: false, message: "Live streaming is not configured." }, 503);

  const body = parseBody(registerFeedSchema, await readJson(c));
  const claims = await verifyBroadcastToken(secret, body.token, nowSeconds());
  if (!claims || !body.feedId) {
    return c.json({ ok: false, message: "This broadcast link is invalid or has expired." }, 403);
  }

  await deleteFeed(c.env.SESSIONS, claims.arenaId, claims.matchId, body.feedId);
  return c.json({ ok: true });
});

// --- Fallback ---

app.all("*", (c) => c.json({ ok: false, message: "Not Found" }, 404));

export default app;
