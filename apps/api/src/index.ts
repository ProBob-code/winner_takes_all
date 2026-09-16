import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import type { AppContext, Env } from "./types";
import { D1Store, InsufficientFundsError, isMissingColumnError, isMissingTableError, type SeriesRecord, type TournamentRecord } from "./lib/d1-store";
import { computeSeasonStandings } from "./lib/season";
import { ensureEngineSchema } from "./lib/engine-schema";
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
  verifyBroadcastSignature,
  realtimeConfig,
  callRealtime,
  putFeed,
  listFeeds,
  deleteFeed,
  BROADCAST_TOKEN_TTL_SECONDS,
  BROADCAST_CODE_TTL_SECONDS,
  createBroadcastCode,
  normaliseBroadcastCode,
  putBroadcastCode,
  getBroadcastCode,
  checkStreamRateLimit,
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
  createSeriesSchema,
  joinTournamentSchema,
  submitScoreSchema,
  addTeamSchema,
  engineScoreSchema,
  highlightSchema,
  reorderSchema,
  extraTimeSchema,
  houseSchema,
  publishArenaSchema,
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

// The engine and series tables were added to schema.sql without a migration,
// so a database provisioned before them never gained them and every route here
// failed with "no such table". Creating what is missing, once per isolate,
// costs a dozen guarded DDL statements and spares an operator having to run a
// migration by hand before the app works at all. Everything it runs is
// additive: see lib/engine-schema.ts.
app.use("/api/engine/*", async (c, next) => {
  try {
    await ensureEngineSchema(c.env.DB);
  } catch (err) {
    // Serving the request is still worth trying; the route's own handler will
    // report a storage problem if one really remains.
    console.error("Could not ensure the engine schema:", err);
  }
  return next();
});

app.use("/api/series/*", async (c, next) => {
  try {
    await ensureEngineSchema(c.env.DB);
  } catch (err) {
    console.error("Could not ensure the engine schema:", err);
  }
  return next();
});

// Attach user (if any) to every request
app.use("/api/*", async (c, next) => {
  // Streaming endpoints are authorised by a signed broadcast token, not a
  // session, so resolving a user would only add a KV read per request. The
  // one exception mints the token and does need the host's identity.
  const path = c.req.path;
  if (path.startsWith("/api/stream/") && path !== "/api/stream/broadcast-token") {
    return next();
  }
  return authMiddleware(c, next);
});

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

/** How a finished tournament's result reads to the app. */
function serializeTournamentResult(result: any) {
  if (!result || !Array.isArray(result.winners)) return null;
  return {
    decidedBy: result.decidedBy,
    decidedAt: result.decidedAt,
    prize: centsToMoney(result.prizeCents ?? 0),
    pot: centsToMoney(result.potCents ?? 0),
    splitWays: result.splitWays ?? result.winners.length,
    winners: result.winners.map((w: any) => ({
      teamId: w.teamId,
      name: w.teamName,
      userId: w.userId ?? null,
      amount: centsToMoney(w.amountCents ?? 0),
      /** A team the host typed in by hand has no wallet to credit. */
      paid: !!w.userId && (w.amountCents ?? 0) > 0,
    })),
  };
}

/** Public representation of a tournament — never leaks the join password. */
function serializeTournament(t: TournamentRecord) {
  return {
    id: t.id,
    name: t.name,
    entryFee: centsToMoney(t.entry_fee_cents),
    prizePool: centsToMoney(t.prize_pool_cents),
    // What the winner actually receives, worked out once here so the page and
    // the payout can never disagree about it.
    winnerTakes: centsToMoney(Engine.prizeAfterFee(t.prize_pool_cents, t.platform_fee_percent)),
    completedAt: t.completed_at,
    /** Set once the tournament has been closed and its pot paid. */
    result: serializeTournamentResult((t.bracket_state as any)?.result),
    maxPlayers: t.max_players,
    joinedPlayers: t.participant_ids.length,
    status: t.status,
    bracketType: t.bracket_type,
    bracketState: t.bracket_state,
    teamSize: t.team_size,
    tournamentType: t.tournament_type,
    sport: t.sport,
    hostId: t.host_id,
    winnerId: t.winner_id,
    hasPassword: !!t.password,
    // The public meaning of holding a password. Callers ask "is this private",
    // not "does it have a password", and the listing already expected this.
    isPrivate: !!t.password,
    platformFeePercent: t.platform_fee_percent,
    // Null unless this tournament is one week of a series.
    seriesId: t.series_id,
    seriesWeek: t.series_week,
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

  // Any remaining database-shape problem should name itself rather than reach
  // the catch-all as "Internal server error", which says nothing actionable.
  let tournament;
  try {
    tournament = await store.createTournament({
      name: body.name,
      entryFeeCents: Math.round(body.entryFee * 100),
      maxPlayers: body.maxPlayers,
      hostId: user.id,
      teamSize: body.teamSize,
      tournamentType: body.tournamentType,
      bracketType: body.bracketType,
      sport: body.sport,
      password: body.password ?? null,
    });
  } catch (err) {
    if (isMissingColumnError(err)) {
      return c.json(
        {
          ok: false,
          message:
            "Tournament storage is out of date and is missing a column. Run the latest file in apps/api/migrations against the D1 database.",
          detail: err instanceof Error ? err.message : String(err),
        },
        500
      );
    }
    throw err;
  }

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

  // A week of a locked series is closed to everyone but the roster. An open
  // series is exactly as open as any other tournament, and entering one of its
  // weeks quietly puts the player on the roster so the season table counts
  // them from that week on.
  if (tournament.series_id) {
    const series = await store.getSeries(tournament.series_id);
    if (series && series.roster_mode === "locked" && !(await store.isSeriesMember(series.id, user.id))) {
      return c.json(
        { ok: false, message: "This week is part of a locked series. Join the series first." },
        403
      );
    }
    if (series) await store.addSeriesMember(series.id, user.id);
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
    /** What it was for, in words — e.g. which tournament a prize came from. */
    description: e.description,
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
  // The table reads hosted tournament play out of the engine tables, which a
  // database provisioned before them does not have.
  await ensureEngineSchema(c.env.DB).catch(() => {});

  const store = c.get("store");
  const rows = await store.getGlobalLeaderboard();

  const entries = rows.map((r) => ({
    userId: r.user_id,
    displayName: r.name,
    /** Matches played, across bracket matches and hosted tournaments alike. */
    played: r.played,
    wins: r.wins,
    losses: r.losses,
    totalScore: r.total_score,
    tournamentWins: r.tournament_wins,
    // A win is worth three, taking a tournament ten.
    points: r.wins * 3 + r.tournament_wins * 10,
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

// --- Weekly series ---

const DAY_MS = 86_400_000;

function serializeSeries(s: SeriesRecord) {
  return {
    id: s.id,
    name: s.name,
    hostId: s.host_id,
    sport: s.sport,
    bracketType: s.bracket_type,
    tournamentType: s.tournament_type,
    entryFee: centsToMoney(s.entry_fee_cents),
    maxPlayers: s.max_players,
    teamSize: s.team_size,
    rosterMode: s.roster_mode,
    cadenceDays: s.cadence_days,
    nextEventAt: s.next_event_at,
    weeksCreated: s.weeks_created,
    status: s.status,
    isPrivate: !!s.password,
  };
}

/**
 * Cut the next week from the series settings.
 *
 * The next date is stepped forward from the date that was due rather than from
 * now, so a season keeps its day of the week. If a season was left alone for a
 * month, stepping repeats until the date is in the future — one late run opens
 * one week, never four at once.
 */
async function openSeriesWeek(store: D1Store, series: SeriesRecord) {
  const week = series.weeks_created + 1;

  const tournament = await store.createTournament({
    name: series.name + " — Week " + week,
    entryFeeCents: series.entry_fee_cents,
    maxPlayers: series.max_players,
    hostId: series.host_id,
    teamSize: series.team_size,
    tournamentType: series.tournament_type,
    bracketType: series.bracket_type,
    sport: series.sport,
    password: series.password,
    seriesId: series.id,
    seriesWeek: week,
  });

  const cadence = Math.max(1, series.cadence_days) * DAY_MS;
  const due = series.next_event_at ? Date.parse(series.next_event_at) : Date.now();
  let next = (Number.isNaN(due) ? Date.now() : due) + cadence;
  while (next <= Date.now()) next += cadence;

  await store.updateSeries(series.id, {
    weeks_created: week,
    next_event_at: new Date(next).toISOString(),
  });

  return tournament;
}

app.get("/api/series", async (c) => {
  const store = c.get("store");
  await ensureEngineSchema(c.env.DB).catch(() => {});
  try {
    const all = await store.listSeries();
    return c.json({ ok: true, series: all.map(serializeSeries) });
  } catch (err) {
    const storageError = engineStorageError(c, err);
    if (storageError) return storageError;
    throw err;
  }
});

app.post("/api/series/create", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const body = parseBody(createSeriesSchema, await readJson(c));

  try {
    const series = await store.createSeries({
      name: body.name,
      hostId: user.id,
      sport: body.sport,
      bracketType: body.bracketType,
      tournamentType: body.tournamentType,
      entryFeeCents: Math.round(body.entryFee * 100),
      maxPlayers: body.maxPlayers,
      teamSize: body.teamSize,
      rosterMode: body.rosterMode,
      cadenceDays: body.cadenceDays,
      firstEventAt: body.firstEventAt ?? new Date().toISOString(),
      password: body.password ?? null,
    });

    // The host runs the season, so they are on its roster from the start.
    await store.addSeriesMember(series.id, user.id);

    return c.json({ ok: true, series: serializeSeries(series) });
  } catch (err) {
    const storageError = engineStorageError(c, err);
    if (storageError) return storageError;
    throw err;
  }
});

app.get("/api/series/:id", async (c) => {
  const store = c.get("store");
  const seriesId = c.req.param("id");

  try {
    const series = await store.getSeries(seriesId);
    if (!series) return c.json({ ok: false, message: "Series not found" }, 404);

    const [weeks, members, teams, progress] = await Promise.all([
      store.getSeriesTournaments(seriesId),
      store.getSeriesMembers(seriesId),
      store.getSeriesEngineTeams(seriesId),
      store.getSeriesMatchProgress(seriesId),
    ]);

    return c.json({
      ok: true,
      series: serializeSeries(series),
      weeks: weeks.map((w) => ({ ...serializeTournament(w), seriesWeek: w.series_week })),
      members,
      standings: computeSeasonStandings(teams, progress),
    });
  } catch (err) {
    const storageError = engineStorageError(c, err);
    if (storageError) return storageError;
    throw err;
  }
});

/**
 * Join the roster. Free, and separate from entering a week: a week still
 * charges its own entry fee when the player enters it, so nobody is ever
 * debited by a season running in the background.
 */
app.post("/api/series/:id/join", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const series = await store.getSeries(c.req.param("id"));
  if (!series) return c.json({ ok: false, message: "Series not found" }, 404);
  if (series.status !== "active") {
    return c.json({ ok: false, message: "This season has ended." }, 409);
  }

  if (series.password) {
    const body = parseBody(joinTournamentSchema, await readJson(c).catch(() => ({})));
    if (!timingSafeEqual(series.password, body.password ?? "")) {
      return c.json({ ok: false, message: "Incorrect series password" }, 403);
    }
  }

  await store.addSeriesMember(series.id, user.id);
  return c.json({ ok: true });
});

/** Open the next week now, rather than waiting for its date. */
app.post("/api/series/:id/weeks", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const series = await store.getSeries(c.req.param("id"));
  if (!series) return c.json({ ok: false, message: "Series not found" }, 404);
  if (series.host_id !== user.id && user.role !== "admin") {
    return c.json({ ok: false, message: "Only the series host can open a week" }, 403);
  }
  if (series.status !== "active") {
    return c.json({ ok: false, message: "This season has ended." }, 409);
  }

  try {
    const tournament = await openSeriesWeek(store, series);
    return c.json({ ok: true, tournament: serializeTournament(tournament) });
  } catch (err) {
    const storageError = engineStorageError(c, err);
    if (storageError) return storageError;
    throw err;
  }
});

/** End the season. Weeks already open are left alone to finish. */
app.post("/api/series/:id/end", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const series = await store.getSeries(c.req.param("id"));
  if (!series) return c.json({ ok: false, message: "Series not found" }, 404);
  if (series.host_id !== user.id && user.role !== "admin") {
    return c.json({ ok: false, message: "Only the series host can end the season" }, 403);
  }

  await store.updateSeries(series.id, { status: "ended", next_event_at: null });
  return c.json({ ok: true });
});

/**
 * Delete a tournament, refunding everyone who paid to enter it.
 *
 * Only the host who created it, or an admin. The delete dialog has always
 * promised that "all participants will be instantly refunded", so that promise
 * is kept here: every entry fee goes back to the wallet it came from before
 * anything is removed, and the refund is written as its own transaction so the
 * fee and its return both stay on the record.
 *
 * A completed tournament is never deleted. Its prize has already been paid,
 * and refunding entries after the fact would create money that does not exist.
 */
app.delete("/api/tournaments/:id", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const tournamentId = c.req.param("id");

  const tournament = await store.getTournament(tournamentId);
  if (!tournament) return c.json({ ok: false, message: "Tournament not found" }, 404);

  if (tournament.host_id !== user.id && user.role !== "admin") {
    return c.json({ ok: false, message: "Only the host who created this tournament can delete it" }, 403);
  }

  if (tournament.status === "completed") {
    return c.json(
      { ok: false, message: "A finished tournament cannot be deleted; its prize has already been paid." },
      409
    );
  }

  const participants = await store.getParticipants(tournamentId);
  const fee = tournament.entry_fee_cents;

  let refunded = 0;
  if (fee > 0) {
    for (const p of participants) {
      await store.creditWallet(p.user_id, fee, "tournament_refund", tournamentId, "entry_fee_refund");
      refunded++;
    }
  }

  await store.deleteTournament(tournamentId);

  // A published tournament has a spectator arena that would otherwise stay on
  // Live Screening, with its cameras running, after the tournament is gone.
  try {
    const arena = await store.getArena(engineArenaId(tournamentId));
    if (arena && (arena.state as any)?.isStarted) {
      await store.upsertArena({
        id: arena.id,
        name: arena.name,
        state: { ...(arena.state as object), isStarted: false },
        pin: arena.pin,
        ownerId: arena.owner_id,
      });
    }
  } catch (err) {
    console.error("Could not take a deleted tournament's arena off air:", err);
  }

  return c.json({ ok: true, refunded, refundedAmount: centsToMoney(refunded * fee) });
});

/**
 * Delete a series. Only the host who created it, or an admin.
 *
 * The weeks survive as ordinary tournaments. People paid to enter them and
 * played them, so a season being wound up must not take that with it — the
 * weeks are simply no longer part of a season.
 */
app.delete("/api/series/:id", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const seriesId = c.req.param("id");

  try {
    const series = await store.getSeries(seriesId);
    if (!series) return c.json({ ok: false, message: "Series not found" }, 404);

    if (series.host_id !== user.id && user.role !== "admin") {
      return c.json({ ok: false, message: "Only the host who created this series can delete it" }, 403);
    }

    const weeks = await store.getSeriesTournaments(seriesId);
    await store.deleteSeries(seriesId);

    return c.json({ ok: true, weeksKept: weeks.length });
  } catch (err) {
    const storageError = engineStorageError(c, err);
    if (storageError) return storageError;
    throw err;
  }
});

// --- Tournament Engine ---

/**
 * The engine tables can be absent entirely on a database provisioned before
 * they were added to schema.sql. Answering "Internal server error" there sends
 * an operator hunting through logs for a problem whose fix is one migration,
 * so name it instead.
 */
function engineStorageError(c: Context<AppContext>, err: unknown): Response | null {
  if (!isMissingTableError(err) && !isMissingColumnError(err)) return null;
  return c.json(
    {
      ok: false,
      message:
        "Tournament engine storage is missing. Run migrations/0006_engine_tables.sql against the D1 database.",
      detail: err instanceof Error ? err.message : String(err),
    },
    503
  );
}

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

type EngineTeamRow = Awaited<ReturnType<D1Store["getEngineTeams"]>>[number];
type EngineMatchRow = Awaited<ReturnType<D1Store["getEngineMatches"]>>[number];

function engineSport(tournament: TournamentRecord): Engine.Sport {
  return tournament.sport === "FOOTBALL" ? "FOOTBALL" : "8BALL";
}

/**
 * The spectator-network arena a hosted tournament is published as.
 *
 * Derived from the tournament rather than stored, so republishing after a
 * reload keeps the same spectator link. It is the same id the old host
 * manager page derived, so a tournament published from there keeps its link.
 */
function engineArenaId(tournamentId: string): string {
  return `T${tournamentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24).toUpperCase()}`;
}

/**
 * The tournament in the shape Live Screening, the spectator page and the
 * streaming endpoints read — the same shape a Quick Tournament publishes.
 */
function engineArenaState(
  tournament: TournamentRecord,
  teams: EngineTeamRow[],
  matches: EngineMatchRow[],
  isStarted: boolean
) {
  const sport = engineSport(tournament);
  return {
    isStarted,
    selectedSport: sport,
    tournamentId: tournament.id,
    // Spectators get the competitors, not the accounts behind them.
    teams: teams.map(({ user_id, ...t }) => ({
      ...t,
      is_team: false,
      players: [],
      total_balls_potted: 0,
      total_fouls: 0,
    })),
    matches: matches.map((m) => ({
      ...m,
      sport,
      order: m.match_order,
      is_draw: m.status === "COMPLETED" && !m.winner_id,
    })),
  };
}

/**
 * Keep a published tournament's spectator arena in step with the engine.
 *
 * The engine is the source of truth, so the server mirrors it rather than
 * relying on the host's browser to push it: spectators and cameras stay
 * current even with the host's tab closed. A tournament that was never
 * published, or was taken off air, is left alone. A failure here never fails
 * the host's action; spectators simply catch up on the next one.
 */
async function syncEngineArena(
  c: Context<AppContext>,
  tournament: TournamentRecord,
  preloaded?: [EngineTeamRow[], EngineMatchRow[]]
): Promise<void> {
  try {
    const store = c.get("store");
    const arena = await store.getArena(engineArenaId(tournament.id));
    if (!arena || !(arena.state as any)?.isStarted) return;

    const [teams, matches] =
      preloaded ??
      (await Promise.all([store.getEngineTeams(tournament.id), store.getEngineMatches(tournament.id)]));

    await store.upsertArena({
      id: arena.id,
      name: arena.name,
      state: engineArenaState(tournament, teams, matches, true),
      pin: arena.pin,
      ownerId: arena.owner_id,
    });
  } catch (err) {
    console.error("Could not mirror the tournament to its spectator arena:", err);
  }
}

/** What a finished tournament paid, and to whom. Stored on the tournament. */
interface TournamentResult {
  decidedBy: "FINAL" | "STANDINGS";
  decidedAt: string;
  potCents: number;
  platformFeePercent: number;
  prizeCents: number;
  splitWays: number;
  winners: Array<{
    teamId: string;
    teamName: string;
    userId: string | null;
    amountCents: number;
  }>;
}

/** How a prize reads in the wallet ledger. */
function prizeDescription(tournamentName: string, splitWays: number): string {
  const share = splitWays > 1 ? `, split equally ${splitWays} ways` : "";
  return `Prize pot — ${tournamentName}${share}`;
}

/**
 * Pay every winner who has not been paid yet.
 *
 * Each share is written against the tournament, and a share is only paid if
 * that account has no entry for it: settling the same tournament twice, or
 * finishing a payout that was interrupted, cannot pay anyone a second time.
 * A winning team the host typed in by hand has no account to credit, and is
 * recorded unpaid rather than silently dropped.
 */
async function payTournamentPrizes(
  c: Context<AppContext>,
  tournament: TournamentRecord,
  result: TournamentResult
): Promise<void> {
  const store = c.get("store");
  const description = prizeDescription(tournament.name, result.splitWays);

  for (const winner of result.winners) {
    if (!winner.userId || winner.amountCents <= 0) continue;
    if (await store.hasWalletEntry(winner.userId, "tournament_prize", tournament.id)) continue;

    await store.creditWallet(
      winner.userId,
      winner.amountCents,
      "tournament_prize",
      tournament.id,
      "tournament_payout",
      null,
      false,
      description
    );

    await store
      .createNotification({
        userId: winner.userId,
        type: "tournament_prize",
        title: result.splitWays > 1 ? "You shared the prize pot" : "You won the prize pot",
        message: `₹${(winner.amountCents / 100).toFixed(2)} from "${tournament.name}" has been credited to your wallet${
          result.splitWays > 1 ? `, split equally ${result.splitWays} ways` : ""
        }.`,
        tournamentId: tournament.id,
      })
      .catch(() => {
        /* the money is in; a missing notification must not undo that */
      });
  }
}

/**
 * Close a tournament and pay out its pot.
 *
 * Deciding, closing and paying are separate on purpose. `finishTournament` is
 * the one write that can only succeed once, so whoever wins it owns the
 * payout; the shares are stored on the tournament before any money moves, so
 * an interrupted payout can be finished later rather than lost.
 */
async function settleTournament(
  c: Context<AppContext>,
  tournament: TournamentRecord
): Promise<{ ok: true; result: TournamentResult } | { ok: false; message: string }> {
  const store = c.get("store");

  // Already closed: make sure everyone owed a share actually has it.
  const stored = (tournament.bracket_state as any)?.result as TournamentResult | undefined;
  if (tournament.status === "completed" && stored) {
    await payTournamentPrizes(c, tournament, stored);
    return { ok: true, result: stored };
  }

  const [teams, matches] = await Promise.all([
    store.getEngineTeams(tournament.id),
    store.getEngineMatches(tournament.id),
  ]);

  const decision = Engine.decideWinners(teams, matches);
  if ("error" in decision) return { ok: false, message: decision.error };

  const prizeCents = Engine.prizeAfterFee(tournament.prize_pool_cents, tournament.platform_fee_percent);
  const shares = Engine.splitPot(prizeCents, decision.winnerIds.length);

  const result: TournamentResult = {
    decidedBy: decision.decidedBy,
    decidedAt: new Date().toISOString(),
    potCents: tournament.prize_pool_cents,
    platformFeePercent: tournament.platform_fee_percent,
    prizeCents,
    splitWays: decision.winnerIds.length,
    winners: decision.winnerIds.map((teamId, i) => {
      const team = teams.find((t) => t.id === teamId);
      return {
        teamId,
        teamName: team?.name || "Unknown",
        userId: team?.user_id ?? null,
        amountCents: shares[i] ?? 0,
      };
    }),
  };

  // The title goes to a single winner. A shared pot has no one champion, so
  // the tournament records none rather than crowning one of them arbitrarily.
  const soleWinner = result.winners.length === 1 ? result.winners[0].userId : null;

  const claimed = await store.finishTournament(tournament.id, soleWinner, { result });
  if (!claimed) {
    // Someone else closed it first; theirs is the record that stands.
    const current = await store.getTournament(tournament.id);
    const theirs = (current?.bracket_state as any)?.result as TournamentResult | undefined;
    if (current && theirs) {
      await payTournamentPrizes(c, current, theirs);
      return { ok: true, result: theirs };
    }
    return { ok: false, message: "This tournament has already been closed." };
  }

  tournament.status = "completed";
  tournament.bracket_state = { result };
  tournament.winner_id = soleWinner;

  await payTournamentPrizes(c, tournament, result);

  // The tournament is over, so it stops being something to watch or film.
  await setEngineArenaLive(c, tournament, false);

  return { ok: true, result };
}

/** Put a tournament's spectator arena on air, or take it off. */
async function setEngineArenaLive(
  c: Context<AppContext>,
  tournament: TournamentRecord,
  live: boolean
): Promise<void> {
  try {
    const store = c.get("store");
    const arena = await store.getArena(engineArenaId(tournament.id));
    if (!arena || !!(arena.state as any)?.isStarted === live) return;

    const [teams, matches] = await Promise.all([
      store.getEngineTeams(tournament.id),
      store.getEngineMatches(tournament.id),
    ]);

    await store.upsertArena({
      id: arena.id,
      name: arena.name,
      state: engineArenaState(tournament, teams, matches, live),
      pin: arena.pin,
      ownerId: arena.owner_id,
    });
  } catch (err) {
    console.error("Could not change the tournament's spectator arena:", err);
  }
}

/**
 * Add a finished match to both teams' totals, and close the tournament once
 * its final is decided. Only ever called by the request whose guarded write
 * actually finished the match, so a result is never counted twice.
 */
async function recordEngineResult(
  c: Context<AppContext>,
  tournament: TournamentRecord,
  match: EngineMatchRow
): Promise<void> {
  const store = c.get("store");
  for (const delta of Engine.resultDeltas(match, engineSport(tournament))) {
    await store.addEngineTeamResult(delta.teamId, delta);
  }

  // Winning the grand final ends the tournament: it closes, and the pot is
  // paid out, without the host having to do anything.
  if (match.phase === "FINAL" && match.winner_id) {
    const settled = await settleTournament(c, tournament);
    if (!settled.ok) console.error("Could not settle the tournament:", settled.message);
  }
}

/**
 * Finish any live match whose clock has run out.
 *
 * The clock used to be looked at only when a score was recorded, so a match
 * nobody touched in its last seconds stayed live at 0:00 indefinitely. Quick
 * Tournament ends a match the moment its clock does, and this is the server's
 * equivalent: every poll of the state settles what has expired. The matches
 * passed in are updated in place. Returns whether anything changed.
 */
async function settleExpiredMatches(
  c: Context<AppContext>,
  tournament: TournamentRecord,
  matches: EngineMatchRow[]
): Promise<boolean> {
  const store = c.get("store");
  const now = nowSeconds();
  let changed = false;

  for (let i = 0; i < matches.length; i++) {
    const { updatedMatch, matchEnded, suddenDeathStarted } = Engine.checkTimer(matches[i], now);
    if (!matchEnded && !suddenDeathStarted) continue;

    const applied = await store.saveLiveEngineMatch(updatedMatch.id, {
      status: updatedMatch.status,
      winner_id: updatedMatch.winner_id,
      sudden_death: updatedMatch.sudden_death,
      ended_by: matchEnded ? "TIME" : null,
    });
    if (!applied) continue;

    changed = true;
    matches[i] = { ...updatedMatch, ended_by: matchEnded ? "TIME" : null };
    if (matchEnded) await recordEngineResult(c, tournament, matches[i]);
  }

  return changed;
}

app.get("/api/engine/tournaments/:id/state", async (c) => {
  const store = c.get("store");
  const tournamentId = c.req.param("id");

  let teams: EngineTeamRow[];
  let matches: EngineMatchRow[];
  let tournament: TournamentRecord | null;
  try {
    [teams, matches, tournament] = await Promise.all([
      store.getEngineTeams(tournamentId),
      store.getEngineMatches(tournamentId),
      store.getTournament(tournamentId),
    ]);
  } catch (err) {
    const storageError = engineStorageError(c, err);
    if (storageError) return storageError;
    throw err;
  }

  if (!tournament) return c.json({ ok: false, message: "Tournament not found" }, 404);

  const settled = await settleExpiredMatches(c, tournament, matches);
  if (settled) teams = await store.getEngineTeams(tournamentId);

  const arenaId = engineArenaId(tournamentId);
  const arena = await store.getArena(arenaId).catch(() => null);
  const published = !!(arena?.state as any)?.isStarted;
  if (settled && published) await syncEngineArena(c, tournament, [teams, matches]);

  return c.json({
    ok: true,
    phase: tournament.status as Engine.TournamentPhase,
    sport: tournament.sport,
    teams,
    matches,
    arenaId,
    published,
    matchesPerTeam: tournament.max_matches_per_team || 2,
    // Clocks are counted down in the browser against start_time, which is
    // server time; this lets a client with a skewed clock correct for it.
    serverTime: nowSeconds(),
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

/**
 * Start the tournament: turn everyone who joined into a competitor, then draw
 * the opening fixtures.
 *
 * Joining recorded a participant, while the bracket, the leaderboard and every
 * match read engine teams. Nothing bridged the two, so people who paid to join
 * never appeared as competitors and the draw had nobody to pair. The host
 * pressing start is where that conversion belongs — it is the moment the entry
 * list closes.
 */
app.post("/api/engine/tournaments/:id/start", async (c) => {
  const tournamentId = c.req.param("id");
  const access = await requireTournamentManager(c, tournamentId);
  if ("error" in access) return access.error;
  const { tournament } = access;

  const store = c.get("store");
  let participants: Awaited<ReturnType<typeof store.getParticipants>>;
  let existingTeams: Awaited<ReturnType<typeof store.getEngineTeams>>;
  try {
    [participants, existingTeams] = await Promise.all([
      store.getParticipants(tournamentId),
      store.getEngineTeams(tournamentId),
    ]);
  } catch (err) {
    const storageError = engineStorageError(c, err);
    if (storageError) return storageError;
    throw err;
  }

  // Teams the host entered by hand keep their place; a participant is only
  // added if nothing already stands for them.
  const taken = new Set(existingTeams.map((t) => t.name.trim().toLowerCase()));
  let teams: Awaited<ReturnType<typeof store.getEngineTeams>>;
  try {
    for (const p of participants) {
      const label = (p.team_name || p.user_name || p.user_id).trim();
      if (!label || taken.has(label.toLowerCase())) continue;
      await store.createEngineTeam(tournamentId, label, p.user_id);
      taken.add(label.toLowerCase());
    }
    teams = await store.getEngineTeams(tournamentId);
  } catch (err) {
    const storageError = engineStorageError(c, err);
    if (storageError) return storageError;
    throw err;
  }

  if (teams.length < 2) {
    return c.json(
      { ok: false, message: "At least two players must join before the tournament can start." },
      400
    );
  }

  await store.updateTournamentStatus(tournamentId, "GROUP");

  // Draw the opening fixtures so the schedule exists the moment it starts.
  const matches = await store.getEngineMatches(tournamentId);
  if (matches.length === 0) {
    const matchups = await store.getEngineMatchups(tournamentId);
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
  }

  return c.json({ ok: true, teams: teams.length });
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

  if (tournament.status !== "GROUP") {
    return c.json({ ok: false, message: "The group stage is over, so no more group rounds can be drawn." }, 400);
  }

  if (matches.some((m) => m.status === "LIVE")) {
    return c.json({ ok: false, message: "Cannot generate matches while a match is LIVE" }, 400);
  }

  const limit = tournament.max_matches_per_team || 2;
  const { matches: nextMatches, byeTeamId } = Engine.generateNextMatches(teams, matchups, "GROUP", limit);

  // Queue the new round behind whatever is already there.
  const nextOrder = matches.reduce((max, m) => Math.max(max, m.match_order), -1) + 1;
  for (let i = 0; i < nextMatches.length; i++) {
    const match = await store.createEngineMatch(tournamentId, { ...nextMatches[i], match_order: nextOrder + i });
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

  await syncEngineArena(c, tournament);

  return c.json({
    ok: true,
    matchesCreated: nextMatches.length,
    byeAssigned: !!byeTeamId,
    ...(nextMatches.length === 0 && !byeTeamId
      ? { message: "No new pairings are possible: every team has reached its quota or met everyone available. Advance to the knockouts." }
      : {}),
  });
});

/**
 * Take the knockout one step further: the group's top four into semi-finals
 * (or its top two straight into a final), then the semi-final winners into the
 * final. The same progression Quick Tournament's arena offers.
 */
app.post("/api/engine/tournaments/:id/advance", async (c) => {
  const tournamentId = c.req.param("id");
  const access = await requireTournamentManager(c, tournamentId);
  if ("error" in access) return access.error;
  const { tournament } = access;

  if (tournament.status !== "GROUP" && tournament.status !== "KNOCKOUT") {
    return c.json({ ok: false, message: "Only a tournament in play can advance to the knockouts." }, 400);
  }

  const store = c.get("store");
  const [teams, matches] = await Promise.all([
    store.getEngineTeams(tournamentId),
    store.getEngineMatches(tournamentId),
  ]);

  const plan = Engine.planAdvance(teams, matches);
  if ("error" in plan) return c.json({ ok: false, message: plan.error }, 400);

  // A knockout match keeps the length the host last played to.
  const lastPlayed = [...matches].reverse().find((m) => m.status === "COMPLETED");
  const duration = lastPlayed?.duration || 600;
  const nextOrder = matches.reduce((max, m) => Math.max(max, m.match_order), -1) + 1;

  for (let i = 0; i < plan.matches.length; i++) {
    await store.createEngineMatch(tournamentId, { ...plan.matches[i], duration, match_order: nextOrder + i });
  }

  await store.updateTournamentStatus(tournamentId, "KNOCKOUT");
  tournament.status = "KNOCKOUT";
  await syncEngineArena(c, tournament);

  return c.json({ ok: true, matchesCreated: plan.matches.length });
});

/**
 * Close a tournament and pay the pot out.
 *
 * Winning a grand final does this on its own. A tournament played as a group
 * with no final has no such moment, so its host ends it here: the top of the
 * table takes the pot, shared equally by anyone exactly level with them.
 * Running it again on a closed tournament pays any share that did not land.
 */
app.post("/api/engine/tournaments/:id/finish", async (c) => {
  const tournamentId = c.req.param("id");
  const access = await requireTournamentManager(c, tournamentId);
  if ("error" in access) return access.error;

  const settled = await settleTournament(c, access.tournament);
  if (!settled.ok) return c.json({ ok: false, message: settled.message }, 400);

  return c.json({ ok: true, result: serializeTournamentResult(settled.result) });
});

/**
 * Put a hosted tournament on the spectator network, or take it off.
 *
 * A hosted tournament is private until its host says otherwise. Publishing
 * mirrors it into the arena system — what Live Screening lists, what the
 * spectator link shows, and what a camera's stream code is checked against —
 * and from then on the server keeps that mirror current on every change.
 * Taking it off air clears isStarted, which removes it from Live Screening and
 * stops every camera on it, exactly as closing a Quick Tournament does.
 */
app.post("/api/engine/tournaments/:id/publish", async (c) => {
  const tournamentId = c.req.param("id");
  const access = await requireTournamentManager(c, tournamentId);
  if ("error" in access) return access.error;
  const { tournament } = access;

  const store = c.get("store");
  const body = parseBody(publishArenaSchema, await readJson(c));
  const arenaId = engineArenaId(tournamentId);
  const existing = await store.getArena(arenaId);

  if (existing?.owner_id && tournament.host_id && existing.owner_id !== tournament.host_id) {
    return c.json({ ok: false, message: "This tournament's spectator arena belongs to another account." }, 409);
  }

  if (!body.live && !existing) return c.json({ ok: true, arenaId, published: false });

  const [teams, matches] = await Promise.all([
    store.getEngineTeams(tournamentId),
    store.getEngineMatches(tournamentId),
  ]);

  try {
    await store.upsertArena({
      id: arenaId,
      name: tournament.name.slice(0, 80),
      state: engineArenaState(tournament, teams, matches, body.live),
      pin: existing?.pin ?? null,
      // The host owns it even when an admin publishes, so the host can still
      // put cameras on it.
      ownerId: existing?.owner_id ?? tournament.host_id,
    });
  } catch (err) {
    if (isMissingColumnError(err)) {
      return c.json(
        {
          ok: false,
          message:
            "Arena storage is out of date and is missing a column. Run migrations/0004_arena_columns.sql against the D1 database.",
          detail: err instanceof Error ? err.message : String(err),
        },
        500
      );
    }
    throw err;
  }

  return c.json({ ok: true, arenaId, published: body.live });
});

app.post("/api/engine/matches/:id/start", async (c) => {
  const store = c.get("store");
  const match = await store.getEngineMatch(c.req.param("id"));
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  const access = await requireTournamentManager(c, match.tournament_id);
  if ("error" in access) return access.error;

  // Starting a finished match again would count its result a second time.
  if (match.status !== "CREATED") {
    return c.json({ ok: false, message: "Only a match that has not been played can be started." }, 400);
  }

  const allMatches = await store.getEngineMatches(match.tournament_id);
  if (allMatches.some((m) => m.status === "LIVE")) {
    return c.json({ ok: false, message: "Another match is already LIVE" }, 400);
  }

  await store.updateEngineMatch(match.id, {
    status: "LIVE",
    start_time: nowSeconds(),
  });

  await syncEngineArena(c, access.tournament);
  return c.json({ ok: true });
});

/** Start a live match over: scores, balls and fouls back to zero, clock from the top. */
app.post("/api/engine/matches/:id/restart", async (c) => {
  const store = c.get("store");
  const match = await store.getEngineMatch(c.req.param("id"));
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  const access = await requireTournamentManager(c, match.tournament_id);
  if ("error" in access) return access.error;

  const reset = Engine.resetMatch(match, nowSeconds());
  const applied = await store.saveLiveEngineMatch(match.id, {
    score_team_a: reset.score_team_a,
    score_team_b: reset.score_team_b,
    balls_potted_a: reset.balls_potted_a,
    balls_potted_b: reset.balls_potted_b,
    black_potted_a: reset.black_potted_a,
    black_potted_b: reset.black_potted_b,
    fouls_a: reset.fouls_a,
    fouls_b: reset.fouls_b,
    sudden_death: reset.sudden_death,
    active_team_id: reset.active_team_id,
    winner_id: reset.winner_id,
    start_time: reset.start_time,
  });
  if (!applied) return c.json({ ok: false, message: "Only a live match can be restarted." }, 409);

  await syncEngineArena(c, access.tournament);
  return c.json({ ok: true });
});

/**
 * Add time to a match, or take it away. With no body this is the +1 MIN
 * button; the arena's − / + and +2 MINS controls send the seconds they mean.
 */
app.post("/api/engine/matches/:id/extra-time", async (c) => {
  const store = c.get("store");
  const match = await store.getEngineMatch(c.req.param("id"));
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  const access = await requireTournamentManager(c, match.tournament_id);
  if ("error" in access) return access.error;

  if (match.status === "COMPLETED") {
    return c.json({ ok: false, message: "This match has already finished." }, 409);
  }

  // No body at all is the plain +1 MIN.
  const body = parseBody(extraTimeSchema, await readJson(c).catch(() => ({})));
  const duration = Math.max(60, match.duration + (body.seconds ?? 60));

  const updates: Partial<EngineMatchRow> = { duration };
  // Time given back to a level knockout match reopens its clock, so it is no
  // longer waiting on a golden point.
  if (match.sudden_death && match.start_time && match.start_time + duration > nowSeconds()) {
    updates.sudden_death = false;
  }

  await store.updateEngineMatch(match.id, updates);
  await syncEngineArena(c, access.tournament);
  return c.json({ ok: true, duration });
});

/** Which set each side is on. Choosing one for a side gives the other the rest. */
app.post("/api/engine/matches/:id/house", async (c) => {
  const store = c.get("store");
  const match = await store.getEngineMatch(c.req.param("id"));
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  const access = await requireTournamentManager(c, match.tournament_id);
  if ("error" in access) return access.error;

  const body = parseBody(houseSchema, await readJson(c));
  const other: Engine.PoolHouse = body.house === "SOLID" ? "STRIPES" : "SOLID";

  await store.updateEngineMatch(match.id, {
    team_a_house: body.team === "A" ? body.house : other,
    team_b_house: body.team === "B" ? body.house : other,
  });

  await syncEngineArena(c, access.tournament);
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

  await syncEngineArena(c, access.tournament);
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
  await syncEngineArena(c, access.tournament);
  return c.json({ ok: true });
});

app.post("/api/engine/matches/:id/score", async (c) => {
  const store = c.get("store");
  const match = await store.getEngineMatch(c.req.param("id"));
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  const access = await requireTournamentManager(c, match.tournament_id);
  if ("error" in access) return access.error;
  const { tournament } = access;

  const body = parseBody(engineScoreSchema, await readJson(c));
  if (body.teamId !== match.team_a_id && body.teamId !== match.team_b_id) {
    return c.json({ ok: false, message: "teamId is not part of this match" }, 400);
  }

  if (match.status !== "LIVE") {
    return c.json({ ok: false, message: "This match is not live." }, 409);
  }

  // The clock first: a tap that arrives after it ran out is too late to count,
  // and the match ends on time instead.
  const timed = Engine.checkTimer(match, nowSeconds());
  let finalMatch = timed.updatedMatch;
  let endedBy: "SCORE" | "TIME" | null = timed.matchEnded ? "TIME" : null;

  if (!timed.matchEnded) {
    const scored = Engine.processScoreUpdate(timed.updatedMatch, body.teamId, body.type);
    finalMatch = scored.updatedMatch;
    if (scored.matchEnded) endedBy = "SCORE";
  }

  const applied = await store.saveLiveEngineMatch(finalMatch.id, {
    score_team_a: finalMatch.score_team_a,
    score_team_b: finalMatch.score_team_b,
    balls_potted_a: finalMatch.balls_potted_a,
    balls_potted_b: finalMatch.balls_potted_b,
    black_potted_a: finalMatch.black_potted_a,
    black_potted_b: finalMatch.black_potted_b,
    fouls_a: finalMatch.fouls_a,
    fouls_b: finalMatch.fouls_b,
    status: finalMatch.status,
    winner_id: finalMatch.winner_id,
    sudden_death: finalMatch.sudden_death,
    ended_by: endedBy,
  });

  // Something else finished it in the meantime — most likely its clock, on
  // someone's poll — and has already recorded the result.
  if (!applied) return c.json({ ok: false, message: "This match has already finished." }, 409);

  const saved = { ...finalMatch, ended_by: endedBy };
  if (saved.status === "COMPLETED") await recordEngineResult(c, tournament, saved);

  await syncEngineArena(c, tournament);
  return c.json({ ok: true, match: saved });
});

// --- Public Arenas ---

app.get("/api/public-arenas", async (c) => {
  const arenas = await c.get("store").listArenas();
  return c.json({
    ok: true,
    arenas: arenas.map((a) => ({
      id: a.id,
      name: a.name,
      state: a.state,
      isLocked: !!a.pin,
      updatedAt: a.updated_at,
    })),
  });
});

app.post("/api/public-arenas", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const limited = await streamRateLimit(c, "arena", 120, 60);
  if (limited) return limited;

  const store = c.get("store");
  const body = parseBody(upsertArenaSchema, await readJson(c));

  const existing = await store.getArena(body.id);

  if (existing && !(await mayManageArena(existing, user, body.pin))) {
    return c.json(
      {
        ok: false,
        message: existing.pin
          ? "Invalid PIN. This arena belongs to another host."
          : "This arena belongs to another host.",
      },
      403
    );
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
    if (isMissingColumnError(err)) {
      return c.json(
        {
          ok: false,
          message:
            "Arena storage is out of date and is missing a column. Run migrations/0004_arena_columns.sql against the D1 database.",
          detail: err instanceof Error ? err.message : String(err),
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

  return c.json({
    ok: true,
    arena: {
      id: arena.id,
      name: arena.name,
      state: arena.state,
      isLocked: !!arena.pin,
    },
  });
});

// --- Live Match Streaming (Cloudflare Realtime SFU) ---
//
// Media is relayed by the SFU and never recorded. This Worker only signs
// broadcast grants, proxies SDP so the app secret stays server-side, and keeps
// a short-lived list of who is currently streaming.

/**
 * Who may write to, or broadcast from, an arena.
 *
 * An arena belongs to the account that created it. Previously any signed-in
 * user could overwrite an arena that had no PIN, so one person's Quick
 * Tournament could be replaced by another's; drafts are now per-account, so
 * that latitude is no longer needed and is closed.
 *
 * Arenas created before ownership was recorded have no owner. The first
 * account to write to one claims it, which is what upsertArena already does.
 */
async function mayManageArena(
  arena: { owner_id: string | null; pin: string | null },
  user: { id: string; role: string },
  // upsertArenaSchema accepts null for an unlocked arena, so this has to as
  // well; the truthiness check below treats null and undefined alike.
  suppliedPin?: string | null
): Promise<boolean> {
  if (user.role === "admin") return true;
  if (!arena.owner_id) return true; // unclaimed, predates ownership
  if (arena.owner_id === user.id) return true;

  if (arena.pin && suppliedPin) {
    const hash = await sha256Hex(suppliedPin);
    // Legacy rows stored the PIN in plaintext.
    return timingSafeEqual(arena.pin, hash) || timingSafeEqual(arena.pin, suppliedPin);
  }
  return false;
}

/**
 * A broadcast grant is only meaningful while the match is actually being
 * played. The token itself lasts hours, so without this check a broadcaster
 * could reload the page after the tournament closed and start streaming
 * again on an expired fixture.
 */
async function matchIsLive(
  c: Context<AppContext>,
  arenaId: string,
  matchId: string
): Promise<boolean> {
  const arena = await c.get("store").getArena(arenaId);
  if (!arena) return false;

  const state: any = arena.state;
  if (!state?.isStarted) return false;

  const match = (state.matches || []).find((m: any) => m.id === matchId);
  return !!match && match.status === "LIVE";
}

/** Rate limit a streaming request in a Durable Object, so KV is untouched. */
async function streamRateLimit(
  c: Context<AppContext>,
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<Response | null> {
  const allowed = await checkStreamRateLimit(
    c.env.MATCH_FEEDS,
    clientKey(c.req.raw),
    bucket,
    limit,
    windowSeconds
  );
  if (allowed) return null;
  return c.json({ ok: false, message: "Too many requests, please try again later" }, 429);
}

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

  const limited = await streamRateLimit(c, "broadcast-token", 60, 60);
  if (limited) return limited;

  const body = parseBody(broadcastTokenSchema, await readJson(c));
  const arena = await c.get("store").getArena(body.arenaId);
  if (!arena) return c.json({ ok: false, message: "Arena not found" }, 404);

  // Same rule as updating the arena: broadcasting from someone else's
  // tournament is exactly as much of an intrusion as overwriting it.
  if (!(await mayManageArena(arena, user, body.pin))) {
    return c.json(
      {
        ok: false,
        message: arena.pin
          ? "This arena is locked. Enter its PIN to start a broadcast."
          : "Only the host who created this arena can start a broadcast.",
      },
      403
    );
  }

  if (!(await matchIsLive(c, body.arenaId, body.matchId))) {
    return c.json(
      { ok: false, message: "This match is not currently live, so it cannot be broadcast." },
      409
    );
  }

  const exp = nowSeconds() + BROADCAST_TOKEN_TTL_SECONDS;
  const token = await signBroadcastToken(secret, {
    arenaId: body.arenaId,
    matchId: body.matchId,
    exp,
  });

  const origin = c.env.PUBLIC_APP_ORIGIN || allowedOrigins(c.env)[0];

  // Everything points at the short code route: it is what the QR encodes, what
  // gets shared, and what someone types. The long signed URL it replaced made
  // a far denser symbol for no benefit.
  const code = createBroadcastCode();
  await putBroadcastCode(
    c.env.MATCH_FEEDS,
    code,
    { arenaId: body.arenaId, matchId: body.matchId, token },
    BROADCAST_CODE_TTL_SECONDS
  );
  const url = `${origin}/broadcast/${code}`;

  return c.json({
    ok: true,
    token,
    url,
    shortUrl: url,
    code,
    expiresAt: exp,
    codeExpiresIn: BROADCAST_CODE_TTL_SECONDS,
  });
});

/** Resolve a short broadcast code back to its arena, match and token. */
app.get("/api/stream/broadcast-code/:code", async (c) => {
  // The code is the only credential, so guessing must be rate limited.
  const limited = await streamRateLimit(c, "broadcast-code", 20, 60);
  if (limited) return limited;

  const code = normaliseBroadcastCode(c.req.param("code"));
  const record = await getBroadcastCode(c.env.MATCH_FEEDS, code);
  if (!record) {
    return c.json({ ok: false, message: "This stream code is not valid." }, 404);
  }

  // A code outlives the fixture it was minted for, so redeeming it has to be
  // refused once the match is over — otherwise reloading the page would put a
  // camera back on a finished match.
  if (!(await matchIsLive(c, record.arenaId, record.matchId))) {
    return c.json(
      { ok: false, message: "This match has finished, so it can no longer be streamed." },
      409
    );
  }

  return c.json({ ok: true, ...record });
});

/** Open a WebRTC session against the SFU. */
app.post("/api/stream/session", async (c) => {
  const config = requireRealtime(c);
  if (config instanceof Response) return config;

  const limited = await streamRateLimit(c, "stream-session", 60, 60);
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

  const limited = await streamRateLimit(c, "stream-tracks", 120, 60);
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
    const limited = await streamRateLimit(c, "stream-feed", 60, 60);
    if (limited) return limited;
  }
  // Two different questions. Refreshing a camera that is already streaming
  // only needs the grant to be authentic, because how long it may continue is
  // governed by the match still being live. Putting a camera on air needs the
  // grant to be unexpired as well — an expired code must not open a camera,
  // so neither may the grant it handed out.
  const isHeartbeat = !!body.feedId;
  const claims = isHeartbeat
    ? await verifyBroadcastSignature(secret, body.token)
    : await verifyBroadcastToken(secret, body.token, nowSeconds());

  if (!claims) {
    return c.json(
      {
        ok: false,
        message: isHeartbeat
          ? "This broadcast link is not valid."
          : "This stream code has expired. Ask the host for the current one.",
      },
      403
    );
  }

  // No account required: the signed broadcast token, obtained from the stream
  // code, is the authorisation. Someone handed a phone at the ground should
  // not have to sign up first.
  const broadcaster = c.get("user");

  // Checked on every heartbeat, not just registration: a match that ends
  // mid-broadcast must stop the feed even if the page never noticed.
  if (!(await matchIsLive(c, claims.arenaId, claims.matchId))) {
    return c.json(
      { ok: false, message: "This match has ended, so streaming has stopped." },
      409
    );
  }

  const feed: StreamFeed = {
    feedId: body.feedId || createId("feed"),
    arenaId: claims.arenaId,
    matchId: claims.matchId,
    sessionId: body.sessionId,
    trackNames: body.trackNames,
    label: body.label,
    // Recorded so viewers can see whose camera they are watching.
    broadcasterName: broadcaster?.name,
    startedAt: nowSeconds(),
  };

  const result = await putFeed(c.env.MATCH_FEEDS, feed, { requireExisting: isHeartbeat });
  if (result.missing) {
    // The feed is gone — expired, or ended — so this is really a fresh claim
    // and has to satisfy the unexpired-grant rule rather than slip in as a
    // refresh.
    return c.json(
      {
        ok: false,
        message: "This broadcast has ended. Ask the host for a new stream code to start again.",
      },
      403
    );
  }

  return c.json({ ok: true, feed });
});

/** Viewers poll this to see which camera angles are live right now. */
app.get("/api/stream/feeds", async (c) => {
  const arenaId = c.req.query("arenaId");
  const matchId = c.req.query("matchId");
  if (!arenaId || !matchId) {
    return c.json({ ok: false, message: "arenaId and matchId are required" }, 400);
  }

  const feeds = await listFeeds(c.env.MATCH_FEEDS, arenaId, matchId);
  return c.json({ ok: true, feeds });
});

app.post("/api/stream/feeds/end", async (c) => {
  const secret = c.env.BROADCAST_TOKEN_SECRET;
  if (!secret) return c.json({ ok: false, message: "Live streaming is not configured." }, 503);

  const body = parseBody(registerFeedSchema, await readJson(c));
  const claims = await verifyBroadcastSignature(secret, body.token);
  if (!claims || !body.feedId) {
    return c.json({ ok: false, message: "This broadcast link is not valid." }, 403);
  }

  await deleteFeed(c.env.MATCH_FEEDS, claims.arenaId, claims.matchId, body.feedId);
  return c.json({ ok: true });
});

// --- Fallback ---

app.all("*", (c) => c.json({ ok: false, message: "Not Found" }, 404));

/**
 * Open any week that has come due.
 *
 * Runs from the Worker's cron trigger. It is deliberately tolerant: one series
 * failing must not stop the rest of the seasons from opening, so each is tried
 * on its own and a failure is logged rather than thrown.
 */
async function openDueSeriesWeeks(env: Env): Promise<{ opened: number; failed: number }> {
  const store = new D1Store(env.DB);
  let opened = 0;
  let failed = 0;

  let due: SeriesRecord[] = [];
  try {
    due = await store.listSeriesDue(new Date().toISOString());
  } catch (err) {
    // No series table yet means the migration has not been applied. There is
    // nothing to open, and nothing worth failing the scheduled run over.
    if (isMissingTableError(err)) return { opened: 0, failed: 0 };
    throw err;
  }

  for (const series of due) {
    try {
      await openSeriesWeek(store, series);
      opened++;
    } catch (err) {
      failed++;
      console.error(`Could not open the next week of series ${series.id}:`, err);
    }
  }

  return { opened, failed };
}

export default {
  fetch: app.fetch,
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(openDueSeriesWeeks(env));
  },
};

// The Durable Object class must be exported from the Worker entry point for
// the MATCH_FEEDS binding to resolve.
export { MatchFeeds } from "./durable-objects/match-feeds";
