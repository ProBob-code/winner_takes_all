import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import type { AppContext, Env } from "./types";
import {
  D1Store,
  InsufficientFundsError,
  isMissingColumnError,
  isMissingTableError,
  type PayoutRequestRecord,
  type SeriesRecord,
  type TournamentRecord,
  type VenueRecord,
} from "./lib/d1-store";
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
import { centsToMoney, payoutFeeCents, PAYOUT_FEE_PERCENT } from "./lib/money";
import {
  stakesEnabled,
  allowedEntryFeeCents,
  allowedSignupBonusCents,
} from "./lib/stakes";
import {
  PLANS,
  TRIAL_DAYS,
  billingEnabled,
  findPlan,
  planAmountPaise,
  createRazorpayPlan,
  createRazorpaySubscription,
  cancelRazorpaySubscription,
  mapProviderStatus,
  statusEntitles,
} from "./lib/billing";
import { shareText, whatsappShareUrl, type ShareKind } from "./lib/share-text";
import { planFrameConfirmation } from "./lib/frame-confirmation";
import {
  COIN_AWARDS,
  COIN_RULES,
  COIN_TITLES,
  DAILY_COIN_CAP,
  MIN_PLAYERS_FOR_COINS,
  applyDailyCap,
  awardsForFrame,
  awardsForNight,
  titleFor,
  nextTitle,
  awardsForOnlineGame,
  awardsForDailyVisit,
  awardsForStreak,
  awardsForSeason,
  STREAK_NIGHTS,
  ONLINE_DAILY_CAP,
  ONLINE_REASONS,
  MIN_ONLINE_SECONDS,
  MIN_ONLINE_SHOTS,
  type CoinAward,
} from "./lib/coins";
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
  payoutRequestSchema,
  settlePayoutSchema,
  adminRoleSchema,
  adminBonusSchema,
  adminResetPasswordSchema,
  claimOnlineGameSchema,
  confirmFrameSchema,
  quickSetupSchema,
  joinByCodeSchema,
  createVenueSchema,
  updateVenueSchema,
  venueMemberSchema,
  createChainSchema,
  subscribeSchema,
} from "./lib/validation";

const app = new Hono<AppContext>();

const DEFAULT_ORIGINS = ["https://winner-takes-all.pages.dev", "http://localhost:3000"];

function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : DEFAULT_ORIGINS;
}

/**
 * The origin links handed to a person should point at.
 *
 * A join link goes on a screen for a room to scan and into a WhatsApp group;
 * it has to be the public address of the app, not whichever origin happened to
 * make the request.
 */
function publicOrigin(env: Env): string {
  return env.PUBLIC_APP_ORIGIN || allowedOrigins(env)[0] || "";
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

// Payout requests and the bonus column arrived the same way the engine tables
// did, so the same safety net covers the routes that read them.
app.use("/api/wallet/*", async (c, next) => {
  try {
    await ensureEngineSchema(c.env.DB);
  } catch (err) {
    console.error("Could not ensure the payout schema:", err);
  }
  return next();
});

app.use("/api/admin/*", async (c, next) => {
  try {
    await ensureEngineSchema(c.env.DB);
  } catch (err) {
    console.error("Could not ensure the payout schema:", err);
  }
  return next();
});

// Venues, chains, billing, join codes and the share text all read tables added
// in 0012, so they get the same safety net.
for (const family of [
  "/api/venues/*",
  "/api/chains/*",
  "/api/billing/*",
  "/api/join/*",
  "/api/tournaments/*",
  "/api/coins/*",
]) {
  app.use(family, async (c, next) => {
    try {
      await ensureEngineSchema(c.env.DB);
    } catch (err) {
      console.error("Could not ensure the venue schema:", err);
    }
    return next();
  });
}

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

  // Zero while stakes are off. The old Rs 1,000 grant minted money nobody had
  // deposited and nobody could withdraw, and advertised it on the way in.
  // New players are welcomed with WTA Coins instead, which they earn by
  // playing — see lib/coins.ts.
  const SIGNUP_BONUS_RUPEES = 1000;
  const user = await store.createUserWithBonus(
    body.name,
    body.email,
    hashed,
    allowedSignupBonusCents(c.env, SIGNUP_BONUS_RUPEES)
  );

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

/**
 * The 410 handed back to anything that would move a stake.
 *
 * 410 rather than 404: the route existed and was deliberately withdrawn, which
 * is what we want in a log a regulator or an auditor reads.
 */
function stakesWithdrawn(c: Context<AppContext>) {
  return c.json(
    {
      ok: false,
      code: "stakes_disabled",
      message:
        "Paid entry and wallet top-ups have been withdrawn. Tournaments on this platform are free to enter and no prize money is pooled from players.",
    },
    410,
  );
}

/**
 * The Razorpay credentials as this Worker actually holds them.
 *
 * Keys pasted into the Cloudflare dashboard routinely arrive with a trailing
 * newline or a stray space. Razorpay answers those with a 401 that says
 * nothing about whitespace, so trimming once here means every caller --
 * config, order creation, signature checks -- works from the same clean pair,
 * and a value that is only whitespace counts as absent rather than present.
 */
function razorpayCredentials(env: Env) {
  const keyId = (env.RAZORPAY_KEY_ID ?? "").trim();
  const keySecret = (env.RAZORPAY_KEY_SECRET ?? "").trim();
  const missing: string[] = [];
  if (!keyId) missing.push("RAZORPAY_KEY_ID");
  if (!keySecret) missing.push("RAZORPAY_KEY_SECRET");
  return { keyId, keySecret, configured: missing.length === 0, missing };
}

/**
 * Whether top-ups can be taken, and the key the checkout needs.
 *
 * A Razorpay key pair is a public id and a secret; the id is what the browser
 * hands to the checkout, and only the secret is confidential. Saying plainly
 * whether the gateway is configured is what lets the app explain itself when
 * it is not, instead of failing at the moment someone tries to pay.
 */
app.get("/api/payments/config", (c) => {
  const { keyId, configured, missing } = razorpayCredentials(c.env);
  // Never let this answer come from a cache: a stale "not configured" reads
  // exactly like a real one, and sends someone to re-check keys that are set.
  c.header("Cache-Control", "no-store");
  // Keys may well be present and valid; with stakes off the gateway is still
  // shut, and the wallet should say so rather than offer a top-up that 410s.
  if (!stakesEnabled(c.env)) {
    return c.json({
      ok: true,
      enabled: false,
      stakesDisabled: true,
      keyId: null,
      mode: null,
      webhookConfigured: false,
      missing: [],
      message: "Top-ups are closed. Tournaments here are free to enter.",
    });
  }
  return c.json({
    ok: true,
    enabled: configured,
    keyId: keyId || null,
    mode: keyId ? (keyId.startsWith("rzp_live") ? "live" : "test") : null,
    /** Without this, a payment completed away from the browser is never credited. */
    webhookConfigured: !!(c.env.RAZORPAY_WEBHOOK_SECRET ?? "").trim(),
    /**
     * Which variables this Worker is missing, so "not configured" can name
     * them instead of sending someone to check both. Presence only: the
     * values themselves never leave the Worker, and the key id that does is
     * public by design -- the browser hands it to the checkout.
     */
    missing,
  });
});

app.post("/api/payments/create-order", async (c) => {
  if (!stakesEnabled(c.env)) return stakesWithdrawn(c);
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const limited = await rateLimit(c, `order:${user.id}`, 10, 60);
  if (limited) return limited;

  const body = parseBody(createOrderSchema, await readJson(c));
  const amountCents = Math.round(body.amount * 100);

  const razorpay = razorpayCredentials(c.env);
  if (!razorpay.configured) {
    console.error(`Missing ${razorpay.missing.join(" and ")} in worker environment`);
    return c.json(
      {
        ok: false,
        message: `Payment gateway is not configured on the server: ${razorpay.missing.join(" and ")} is not set on the API Worker.`,
      },
      500,
    );
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
        keyId: razorpay.keyId,
      });
    }
  }

  try {
    const order = await createRazorpayOrder(
      razorpay.keyId,
      razorpay.keySecret,
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
      keyId: razorpay.keyId,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("Razorpay order creation error:", detail);
    // Keys that Razorpay rejects are a configuration problem, not a blip, and
    // saying so beats asking someone to try again forever.
    const rejected = /\b401\b|authentication/i.test(detail);
    return c.json(
      {
        ok: false,
        message: rejected
          ? "Razorpay rejected this site's API keys. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the Worker."
          : "Payment gateway error, please try again",
      },
      502
    );
  }
});

app.post("/api/payments/verify", async (c) => {
  if (!stakesEnabled(c.env)) return stakesWithdrawn(c);
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const body = parseBody(verifyPaymentSchema, await readJson(c));

  const isValid = await verifyPaymentSignature(
    razorpayCredentials(c.env).keySecret,
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
  // A webhook for an order that can no longer be created is either late or
  // forged; either way it must not credit a wallet.
  if (!stakesEnabled(c.env)) return stakesWithdrawn(c);
  const signature = c.req.header("X-Razorpay-Signature");
  if (!signature) return c.json({ ok: false, message: "Missing signature" }, 400);

  const rawBody = await c.req.arrayBuffer();
  // Fail closed: without a configured webhook secret no webhook is accepted.
  const isValid = await verifyWebhookSignature((c.env.RAZORPAY_WEBHOOK_SECRET ?? "").trim(), rawBody, signature);
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

  // A host may attribute the night to a venue they actually work at, and no
  // other. Without the check, a venue's activity figures — which is what a
  // chain owner is paying to see — could be written by anyone.
  const venue = await resolveVenueForUser(c, body.venueId ?? null, user.id);
  if (venue === "denied") {
    return c.json({ ok: false, message: "You cannot host for that venue." }, 403);
  }

  // Any remaining database-shape problem should name itself rather than reach
  // the catch-all as "Internal server error", which says nothing actionable.
  let tournament;
  try {
    tournament = await store.createTournament({
      name: body.name,
      entryFeeCents: allowedEntryFeeCents(c.env, body.entryFee),
      maxPlayers: body.maxPlayers,
      hostId: user.id,
      teamSize: body.teamSize,
      tournamentType: body.tournamentType,
      bracketType: body.bracketType,
      sport: body.sport,
      password: body.password ?? null,
      venueId: venue?.id ?? null,
      requireFrameConfirmation: body.requireFrameConfirmation,
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

  // A tournament created before stakes were switched off still carries its fee.
  // Nobody may be charged for it now.
  if (tournament.entry_fee_cents > 0 && !stakesEnabled(c.env)) return stakesWithdrawn(c);

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

  // Bonus credit is spendable but not cashable, so the wallet reports both the
  // balance and what could actually be withdrawn from it.
  const summary = await store.getWalletSummary(user.id);
  const payouts = await store.listPayoutRequests({ userId: user.id, limit: 20 });

  return c.json({
    ok: true,
    wallet: {
      balance: centsToMoney(user.wallet_balance_cents),
      bonus: centsToMoney(summary.bonusCents),
      withdrawable: centsToMoney(summary.withdrawableCents),
      payoutFeePercent: PAYOUT_FEE_PERCENT,
      transactions,
      payouts: payouts.map(serializePayout),
    },
  });
});

function serializePayout(p: PayoutRequestRecord) {
  return {
    id: p.id,
    amount: centsToMoney(p.amount_cents),
    fee: centsToMoney(p.fee_cents),
    net: centsToMoney(p.net_cents),
    destination: p.destination,
    status: p.status,
    note: p.note,
    createdAt: p.created_at,
    processedAt: p.processed_at,
    user: p.user_name ? { id: p.user_id, name: p.user_name, email: p.user_email } : undefined,
  };
}

/**
 * Ask for money back.
 *
 * Everything except bonus credit is withdrawable. The balance is debited here
 * rather than when an admin approves, so two requests cannot be funded by the
 * same rupees; a rejection refunds it.
 */
app.post("/api/wallet/payout", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const limited = await rateLimit(c, `payout:${user.id}`, 5, 300);
  if (limited) return limited;

  const body = parseBody(payoutRequestSchema, await readJson(c));
  const amountCents = Math.round(body.amount * 100);

  const store = c.get("store");
  const summary = await store.getWalletSummary(user.id);

  if (amountCents > summary.withdrawableCents) {
    return c.json({
      ok: false,
      message:
        summary.bonusCents > 0
          ? `Only ${centsToMoney(summary.withdrawableCents).amount} of this balance can be withdrawn — ${centsToMoney(summary.bonusCents).amount} is bonus credit, which can be played with but not cashed out.`
          : `Only ${centsToMoney(summary.withdrawableCents).amount} is available to withdraw.`,
    }, 400);
  }

  const feeCents = payoutFeeCents(amountCents);

  try {
    const request = await store.createPayoutRequest(user.id, amountCents, feeCents, body.destination);
    return c.json({ ok: true, payout: serializePayout(request) });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      return c.json({ ok: false, message: "That is more than this wallet can withdraw right now." }, 400);
    }
    throw err;
  }
});

/** A member's own payout history. */
app.get("/api/wallet/payouts", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);
  const store = c.get("store");
  const payouts = await store.listPayoutRequests({ userId: user.id, limit: 50 });
  return c.json({ ok: true, payouts: payouts.map(serializePayout) });
});

app.post("/api/wallet/transfer", async (c) => {
  if (!stakesEnabled(c.env)) return stakesWithdrawn(c);
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

/**
 * Guard every admin route the same way.
 *
 * Returns the admin, or the 403 to hand straight back. Kept as one helper so a
 * new admin route cannot accidentally ship without the check.
 */
function adminOr403(c: Context<AppContext>) {
  const admin = requireAdmin(c);
  if (!admin) return { admin: null, deny: c.json({ ok: false, message: "Admin access required" }, 403) };
  return { admin, deny: null };
}

app.get("/api/admin/overview", async (c) => {
  const { admin, deny } = adminOr403(c);
  if (!admin) return deny;

  const store = c.get("store");
  const [tournaments, users, earnings, pendingPayouts] = await Promise.all([
    store.listTournaments(),
    store.listAllUsers(500),
    store.platformEarnings(),
    store.listPayoutRequests({ status: "pending", limit: 100 }),
  ]);

  const completed = tournaments.filter((t) => String(t.status).toLowerCase() === "completed");

  // Money the members are holding, which is what the platform owes if every
  // one of them cashed out at once. Bonus credit is excluded: it is never
  // payable.
  const heldCents = users.reduce((n: number, u: any) => n + (u.balance_cents || 0), 0);
  const bonusCents = users.reduce((n: number, u: any) => n + (u.bonus_cents || 0), 0);

  return c.json({
    ok: true,
    totalTournaments: tournaments.length,
    activeTournaments: tournaments.filter((t) => t.status === "open" || t.status === "in_progress").length,
    completedTournaments: completed.length,
    totalUsers: users.length,
    admins: users.filter((u: any) => u.role === "admin").length,
    /** Platform charges live here and nowhere a member can reach. */
    platform: {
      feesEarned: centsToMoney(earnings.feesEarnedCents),
      paidOut: centsToMoney(earnings.paidOutCents),
      pendingPayouts: earnings.pendingCount,
      pendingPayoutValue: centsToMoney(earnings.pendingCents),
      feePercent: PAYOUT_FEE_PERCENT,
      memberBalances: centsToMoney(heldCents),
      bonusOutstanding: centsToMoney(bonusCents),
      liability: centsToMoney(Math.max(0, heldCents - bonusCents)),
    },
    pendingPayoutQueue: pendingPayouts.map(serializePayout),
    tournaments: tournaments.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      joinedPlayers: t.participant_ids.length,
      maxPlayers: t.max_players,
      entryFee: centsToMoney(t.entry_fee_cents),
      prizePool: centsToMoney(t.prize_pool_cents),
      hostId: t.host_id,
      // Who took the pot, for the wins view.
      winnerId: t.winner_id,
      startedAt: t.started_at,
      completedAt: t.completed_at,
    })),
  });
});

/**
 * Every member.
 *
 * Passwords are deliberately absent: they are stored as salted PBKDF2 hashes
 * and cannot be turned back into the original, by an admin or by anyone else.
 * Use the reset route below to set a new one rather than to read the old one.
 */
app.get("/api/admin/users", async (c) => {
  const { admin, deny } = adminOr403(c);
  if (!admin) return deny;

  const store = c.get("store");
  const users = await store.listAllUsers(500);

  return c.json({
    ok: true,
    users: users.map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.created_at,
      balance: centsToMoney(u.balance_cents || 0),
      bonus: centsToMoney(u.bonus_cents || 0),
      withdrawable: centsToMoney(Math.max(0, (u.balance_cents || 0) - (u.bonus_cents || 0))),
      transactionCount: u.txn_count || 0,
      lastActivity: u.last_activity || null,
    })),
  });
});

/** The whole ledger, across every member. */
app.get("/api/admin/transactions", async (c) => {
  const { admin, deny } = adminOr403(c);
  if (!admin) return deny;

  const store = c.get("store");
  const limit = Number(c.req.query("limit") || 150);
  const rows = await store.listAllTransactions(Number.isFinite(limit) ? limit : 150);

  return c.json({
    ok: true,
    transactions: rows.map((t: any) => ({
      id: t.id,
      userId: t.user_id,
      userName: t.user_name,
      userEmail: t.user_email,
      type: t.type,
      amount: centsToMoney(t.amount_cents),
      referenceType: t.reference_type,
      referenceId: t.reference_id,
      description: t.description,
      createdAt: t.created_at,
    })),
  });
});

/** The payout queue. `status` filters it; omitted, it lists everything. */
app.get("/api/admin/payouts", async (c) => {
  const { admin, deny } = adminOr403(c);
  if (!admin) return deny;

  const store = c.get("store");
  const status = c.req.query("status");
  const payouts = await store.listPayoutRequests({ status: status || undefined, limit: 200 });
  return c.json({ ok: true, payouts: payouts.map(serializePayout) });
});

/**
 * Mark a payout paid, or decline it.
 *
 * Declining refunds the member. Both are conditional on the request still
 * being pending, so two admins acting at once cannot pay it twice.
 */
app.post("/api/admin/payouts/:id/settle", async (c) => {
  const { admin, deny } = adminOr403(c);
  if (!admin) return deny;

  const body = parseBody(settlePayoutSchema, await readJson(c));
  const store = c.get("store");
  const settled = await store.settlePayoutRequest(c.req.param("id"), body.action, admin.id, body.note ?? null);

  if (!settled) {
    return c.json({ ok: false, message: "That payout is no longer pending — someone may have already settled it." }, 409);
  }

  return c.json({ ok: true, payout: serializePayout(settled) });
});

/** Promote or demote a member. */
app.post("/api/admin/users/:id/role", async (c) => {
  const { admin, deny } = adminOr403(c);
  if (!admin) return deny;

  const target = c.req.param("id");
  if (target === admin.id) {
    return c.json({ ok: false, message: "You cannot change your own role." }, 400);
  }

  const body = parseBody(adminRoleSchema, await readJson(c));
  const store = c.get("store");
  const changed = await store.setUserRole(target, body.role);
  if (!changed) return c.json({ ok: false, message: "No such member" }, 404);
  return c.json({ ok: true, role: body.role });
});

/**
 * Set a new password for a member.
 *
 * This is the only thing an admin can do about a password. The stored value is
 * a salted PBKDF2 hash, so the original cannot be read back by anyone.
 */
app.post("/api/admin/users/:id/reset-password", async (c) => {
  const { admin, deny } = adminOr403(c);
  if (!admin) return deny;

  const body = parseBody(adminResetPasswordSchema, await readJson(c));
  const store = c.get("store");
  const hash = await hashPassword(body.password);
  const changed = await store.setPasswordHash(c.req.param("id"), hash);
  if (!changed) return c.json({ ok: false, message: "No such member" }, 404);
  return c.json({ ok: true, message: "Password reset. The member should change it after signing in." });
});

/** Grant bonus credit: spendable on entry fees, never withdrawable as cash. */
app.post("/api/admin/users/:id/bonus", async (c) => {
  if (!stakesEnabled(c.env)) return stakesWithdrawn(c);
  const { admin, deny } = adminOr403(c);
  if (!admin) return deny;

  const body = parseBody(adminBonusSchema, await readJson(c));
  const store = c.get("store");
  const target = await store.getUserById(c.req.param("id"));
  if (!target) return c.json({ ok: false, message: "No such member" }, 404);

  const amountCents = Math.round(body.amount * 100);
  await store.creditBonus(target.id, amountCents, body.reason ? `Bonus: ${body.reason}` : "Game bonus");
  const summary = await store.getWalletSummary(target.id);

  return c.json({
    ok: true,
    balance: centsToMoney(summary.balanceCents),
    bonus: centsToMoney(summary.bonusCents),
    withdrawable: centsToMoney(summary.withdrawableCents),
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
      entryFeeCents: allowedEntryFeeCents(c.env, body.entryFee),
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

  // Closing the season is what settles it, so this is where the title — and
  // the coins that go with it — are awarded. Keyed on the series, so ending an
  // already-ended season pays nobody twice.
  await awardSeasonCoins(c, series);

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
        message: `Rs ${(winner.amountCents / 100).toFixed(2)} from "${tournament.name}" has been credited to your wallet${
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

  // Whoever took the night earns for it. Guarded on the tournament id, so a
  // tournament settled twice crowns the same people once.
  await awardNightCoins(c, tournament, result.winners.map((w) => w.userId));

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
/**
 * Pay the WTA Coins a finished frame earned, to the accounts that played it.
 *
 * Only signed-in accounts earn: a walk-in who joined by QR has no account to
 * credit, and crediting the guest name instead would let anyone mint coins by
 * entering under a new name each week.
 *
 * Deliberately forgiving. Coins are recognition, not money — if this throws,
 * the frame, the table and the tournament are all still correct, and losing an
 * award is not worth failing a league night over.
 */
async function awardFrameCoins(
  c: Context<AppContext>,
  tournament: TournamentRecord,
  match: EngineMatchRow
): Promise<void> {
  try {
    const store = c.get("store");

    // A bracket of one is not a game. Anything larger is.
    const competitors = await store.countCompetitors(tournament.id);
    if (competitors < MIN_PLAYERS_FOR_COINS) return;

    const teams = await store.getEngineTeams(tournament.id);
    const sides = [match.team_a_id, match.team_b_id];

    for (const teamId of sides) {
      const team = teams.find((t) => t.id === teamId);
      const userId = team?.user_id;
      if (!userId) continue;

      const firstOfNight = !(await store.hasNightAward(userId, tournament.id));

      // A clearance is all seven and the black in the one frame. 8-ball only;
      // football has no equivalent.
      const isTeamA = teamId === match.team_a_id;
      const clearance =
        tournament.sport !== "FOOTBALL" &&
        match.winner_id === teamId &&
        (isTeamA ? match.balls_potted_a : match.balls_potted_b) >= 7 &&
        (isTeamA ? match.black_potted_a : match.black_potted_b);

      const wanted = awardsForFrame({
        won: match.winner_id === teamId,
        firstOfNight,
        clearance,
        tournamentName: tournament.name,
      });

      // A run of nights at one venue. Only checked on the night's first
      // frame, so it costs one query a player a night rather than one a frame,
      // and only for a tournament a venue actually owns.
      if (firstOfNight && tournament.venue_id) {
        const nights = await store
          .consecutiveVenueNights(userId, tournament.venue_id)
          .catch(() => 0);
        if (nights > 0 && nights % STREAK_NIGHTS === 0) {
          const venue = await store.getVenue(tournament.venue_id).catch(() => null);
          wanted.push(...awardsForStreak(nights, venue?.name));
        }
      }

      const earnedToday = await store.coinsEarnedToday(userId);
      const { granted } = applyDailyCap(wanted, earnedToday);

      for (const award of granted) {
        await store.awardCoins({
          userId,
          reason: award.reason,
          amount: award.amount,
          description: award.description,
          // The reference is what makes an award idempotent. A per-night award
          // keys on the tournament; a per-frame award keys on the frame.
          // Per-night awards key on the tournament, per-frame awards on the
          // frame, so each pays exactly once however often it is recomputed.
          referenceType:
            award.reason === "NIGHT_PLAYED" || award.reason === "STREAK"
              ? "tournament"
              : "match",
          referenceId:
            award.reason === "NIGHT_PLAYED" || award.reason === "STREAK"
              ? tournament.id
              : match.id,
        });
      }
    }
  } catch (err) {
    console.error("Could not award coins for a frame:", err);
  }
}

/**
 * Pay the coins for topping a season's table, when the host closes it.
 *
 * Everyone tied at the top is paid, rather than one of them being picked
 * arbitrarily — the standings already sort on weeks won, then match wins, then
 * score, and a genuine tie after all three is a shared title.
 */
async function awardSeasonCoins(
  c: Context<AppContext>,
  series: SeriesRecord
): Promise<void> {
  try {
    const store = c.get("store");
    const [teams, progress] = await Promise.all([
      store.getSeriesEngineTeams(series.id),
      store.getSeriesMatchProgress(series.id),
    ]);

    const standings = computeSeasonStandings(teams, progress);
    const top = standings[0];
    if (!top) return;

    // Everyone level with the leader on all three sort keys.
    const champions = standings.filter(
      (row) =>
        row.weeksWon === top.weeksWon &&
        row.matchWins === top.matchWins &&
        row.totalScore === top.totalScore
    );

    for (const champion of champions) {
      if (!champion.userId) continue;
      for (const award of awardsForSeason(series.name)) {
        await store.awardCoins({
          userId: champion.userId,
          reason: award.reason,
          amount: award.amount,
          description: award.description,
          referenceType: "series",
          referenceId: series.id,
        });
      }
    }
  } catch (err) {
    console.error("Could not award coins for a season:", err);
  }
}

/** Pay the coins for taking the night, to whoever won it. */
async function awardNightCoins(
  c: Context<AppContext>,
  tournament: TournamentRecord,
  winnerUserIds: Array<string | null>
): Promise<void> {
  try {
    const store = c.get("store");
    const competitors = await store.countCompetitors(tournament.id);
    if (competitors < MIN_PLAYERS_FOR_COINS) return;

    for (const userId of winnerUserIds) {
      if (!userId) continue;
      for (const award of awardsForNight(tournament.name, competitors)) {
        await store.awardCoins({
          userId,
          reason: award.reason,
          amount: award.amount,
          description: award.description,
          referenceType: "tournament",
          referenceId: tournament.id,
        });
      }
    }
  } catch (err) {
    console.error("Could not award coins for a night:", err);
  }
}

async function recordEngineResult(
  c: Context<AppContext>,
  tournament: TournamentRecord,
  match: EngineMatchRow
): Promise<void> {
  const store = c.get("store");

  // A tournament that asked for both players to agree holds the result here.
  // The frame is over — the clock has stopped and the bracket has moved on —
  // but nothing is added to either team's totals and a final does not pay out
  // until both sides have confirmed. See the confirm route below.
  //
  // The `awaiting_confirmation` flag is deliberately NOT part of this
  // condition any more. It used to be, and that is how a frame both players
  // agreed still failed to count: the confirm route clears the flag and then
  // records the result, which came straight back in here with the flag down
  // and re-applied the hold. What has actually been agreed is the thing worth
  // asking about, so the rule is given the confirmations instead.
  if (tournament.require_frame_confirmation) {
    // A side with no account has nobody to ask.
    //
    // This was a deadlock. Walk-ins seated by name — which is most of a real
    // league night, and everyone in a night started from "Run a night" — have
    // no account, so they could never tap confirm. Every frame sat waiting on
    // a person who did not exist, nothing reached the table, and the standings
    // stayed on zero all evening with no indication why.
    //
    // So a side that cannot be asked is confirmed on its behalf. What remains
    // is the case the feature is for: two signed-in players who both have to
    // agree. One account against a walk-in needs only that one tap, and a
    // frame between two walk-ins counts straight away, because there is
    // nobody whose agreement the hold would be collecting.
    const [sides, agreed] = await Promise.all([
      store.getEngineTeams(tournament.id).catch(() => []),
      store.getFrameConfirmations(match.id).catch(() => []),
    ]);
    const plan = planFrameConfirmation(
      sides,
      match.team_a_id,
      match.team_b_id,
      agreed.map((fc) => fc.team_id)
    );

    if (plan.hold) {
      await store.updateEngineMatch(match.id, { awaiting_confirmation: true });
      match.awaiting_confirmation = true;

      for (const teamId of plan.autoConfirm) {
        await store
          .confirmFrame(match.id, teamId, null, match.winner_id)
          .catch(() => undefined);
      }
      return;
    }
    // Nobody to ask at all, so this falls through and counts now.
  }

  for (const delta of Engine.resultDeltas(match, engineSport(tournament))) {
    await store.addEngineTeamResult(delta.teamId, delta);
  }

  // The same moment the table counts the frame, the players earn for it. Both
  // are guarded against paying twice, so a re-settled frame changes neither.
  await awardFrameCoins(c, tournament, match);

  // Winning the grand final ends the tournament: it closes, and the pot is
  // paid out, without the host having to do anything.
  if (match.phase === "FINAL" && match.winner_id) {
    const settled = await settleTournament(c, tournament);
    if (!settled.ok) console.error("Could not settle the tournament:", settled.message);
  }
}

/**
 * Release frames that are held for a confirmation that can never arrive.
 *
 * The two deadlocks above were fixed at the point a frame finishes, which
 * mends every night from here on and does nothing for the ones already stuck.
 * A league that played all Friday against a frozen table would have had to be
 * unstuck by hand, frame by frame, from the host's phone.
 *
 * So every read of the tournament state re-applies the rule to what is still
 * being held: a side with no account is agreed on its behalf, and a frame
 * nobody is left to ask goes on the table. A frame that is genuinely waiting
 * on a signed-in player is untouched, which is the whole point of the feature.
 *
 * Costs nothing on a tournament with nothing held, and nothing at all on one
 * that never asked for confirmation. The matches passed in are updated in
 * place. Returns whether anything changed.
 */
async function releaseHeldFrames(
  c: Context<AppContext>,
  tournament: TournamentRecord,
  matches: EngineMatchRow[]
): Promise<boolean> {
  if (!tournament.require_frame_confirmation) return false;
  if (!matches.some((m) => m.status === "COMPLETED" && m.awaiting_confirmation)) return false;

  const store = c.get("store");
  const [sides, allConfirmations] = await Promise.all([
    store.getEngineTeams(tournament.id).catch(() => []),
    store.getTournamentFrameConfirmations(tournament.id).catch(() => []),
  ]);

  let changed = false;
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (match.status !== "COMPLETED" || !match.awaiting_confirmation) continue;

    const agreed = allConfirmations
      .filter((fc) => fc.match_id === match.id)
      .map((fc) => fc.team_id);

    const plan = planFrameConfirmation(sides, match.team_a_id, match.team_b_id, agreed);
    for (const teamId of plan.autoConfirm) {
      await store.confirmFrame(match.id, teamId, null, match.winner_id).catch(() => undefined);
      agreed.push(teamId);
    }

    // Ask again with those taps in. Still held means held on a real person.
    if (planFrameConfirmation(sides, match.team_a_id, match.team_b_id, agreed).hold) continue;

    // The same guard the confirm route uses, so a frame counts once even if
    // two devices read the state at the same instant.
    if (!(await store.settleAwaitingConfirmation(match.id))) continue;

    matches[i] = { ...match, awaiting_confirmation: false };
    await recordEngineResult(c, tournament, matches[i]);
    changed = true;
  }

  return changed;
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
  const released = await releaseHeldFrames(c, tournament, matches);
  if (settled || released) teams = await store.getEngineTeams(tournamentId);

  // A tournament whose final was won before prizes were paid out at all — or
  // one whose payout was interrupted — never had its pot settled. The final
  // decided it, so there is nothing to ask anyone: close it and pay.
  if (!(tournament.bracket_state as any)?.result) {
    const decidedFinal = matches.find(
      (m) =>
        m.phase === "FINAL" &&
        m.status === "COMPLETED" &&
        m.winner_id &&
        // A final held for both players to agree is not an unsettled final. It
        // is one working exactly as the host asked, and closing it here would
        // defeat the confirmation it is waiting for.
        !m.awaiting_confirmation
    );
    if (decidedFinal) {
      const paid = await settleTournament(c, tournament);
      if (!paid.ok) console.error("Could not settle a decided tournament:", paid.message);
    }
  }

  const arenaId = engineArenaId(tournamentId);
  const arena = await store.getArena(arenaId).catch(() => null);
  const published = !!(arena?.state as any)?.isStarted;
  if ((settled || released) && published) await syncEngineArena(c, tournament, [teams, matches]);

  // Only fetched when the rule is on, so an ordinary tournament pays nothing
  // for a feature it is not using.
  const confirmations = tournament.require_frame_confirmation
    ? await store.getTournamentFrameConfirmations(tournamentId).catch(() => [])
    : [];

  // The code on the screen, if the host has put one there. Reused rather than
  // reissued so a QR the room has already scanned keeps working.
  const joinCode = await store.getLiveJoinCodeFor(tournamentId).catch(() => null);

  return c.json({
    ok: true,
    phase: tournament.status as Engine.TournamentPhase,
    sport: tournament.sport,
    teams,
    matches,
    arenaId,
    published,
    requireFrameConfirmation: tournament.require_frame_confirmation,
    confirmations: confirmations.map((fc) => ({
      matchId: fc.match_id,
      teamId: fc.team_id,
      agreedWinnerId: fc.agreed_winner_id,
      at: fc.created_at,
    })),
    joinCode: joinCode?.code ?? null,
    joinUrl: joinCode ? `${publicOrigin(c.env)}/join/${joinCode.code}` : null,
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

  // Whatever the players agreed about was the old frame. It no longer exists.
  await store.clearFrameConfirmations(match.id).catch(() => undefined);
  await store.updateEngineMatch(match.id, { awaiting_confirmation: false }).catch(() => undefined);

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
    // A tap the client queued while offline can arrive after the frame ended.
    // If that exact tap was already applied, the client is replaying an
    // outbox it has not yet been able to clear, and the honest answer is that
    // the score is already in — not an error it will keep retrying.
    if (body.eventId) {
      const fresh = await store.claimScoreEvent(body.eventId, match.id, body.teamId, body.type);
      if (!fresh) return c.json({ ok: true, duplicate: true, match });
    }
    return c.json({ ok: false, message: "This match is not live." }, 409);
  }

  // Claim the tap before applying it. A client replaying its offline outbox
  // sends the same event id again; the second claim fails and the score is
  // left exactly as the first one left it.
  if (body.eventId) {
    const fresh = await store.claimScoreEvent(body.eventId, match.id, body.teamId, body.type);
    if (!fresh) return c.json({ ok: true, duplicate: true, match });
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

  const origin = publicOrigin(c.env);

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

// ════════════════════════════════════════════════════════════════════════════
// Phase 1 — what the buyer panel said blocks the sale
// ════════════════════════════════════════════════════════════════════════════

/**
 * Which venue, if any, this account may act for.
 *
 * Returns the venue, null when none was asked for, and the string "denied"
 * when one was asked for that this account has no part in. A venue's activity
 * figures are what a chain owner pays to see, so they must not be writable by
 * someone who has never worked there.
 */
async function resolveVenueForUser(
  c: Context<AppContext>,
  venueId: string | null,
  userId: string
): Promise<VenueRecord | null | "denied"> {
  if (!venueId) return null;
  const store = c.get("store");
  const venue = await store.getVenue(venueId).catch(() => null);
  if (!venue) return "denied";
  const role = await store.getVenueRole(venueId, userId).catch(() => null);
  if (!role) return "denied";
  return venue;
}

/** Venue access at or above one of the roles given. */
async function requireVenueRole(
  c: Context<AppContext>,
  venueId: string,
  roles: string[]
): Promise<{ venue: VenueRecord; role: string } | { error: Response }> {
  const user = requireUser(c);
  if (!user) return { error: c.json({ ok: false, message: "Authentication required" }, 401) };

  const store = c.get("store");
  const venue = await store.getVenue(venueId);
  if (!venue) return { error: c.json({ ok: false, message: "Venue not found" }, 404) };

  // A platform admin can see and fix any venue; that is what the admin console
  // is for, and a support request should not need an invitation first.
  if (user.role === "admin") return { venue, role: "owner" };

  const role = await store.getVenueRole(venueId, user.id);
  if (!role || !roles.includes(role)) {
    return { error: c.json({ ok: false, message: "You do not have access to this venue." }, 403) };
  }
  return { venue, role };
}

function serializeVenue(v: VenueRecord) {
  return {
    id: v.id,
    name: v.name,
    city: v.city,
    chainId: v.chain_id,
    whatsappGroup: v.whatsapp_group,
    status: v.status,
    ownerId: v.owner_id,
    createdAt: v.created_at,
  };
}

// ── 1.3 Both players confirm the frame ──

/**
 * One side agrees the frame is over and who won it.
 *
 * This answers the objection that sank the dispute-settling pitch: a screen
 * does not referee a frame, someone still types the result — and on a bar
 * table that someone is usually the owner, whose word is exactly what is in
 * dispute. With this, the screen carries both players' word.
 *
 * A player confirms for their own side. The host may confirm for either, since
 * on a walk-in night one of the two may not have the app open at all; that is
 * recorded as the host having done it, so the record says what happened.
 */
app.post("/api/engine/matches/:id/confirm", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const match = await store.getEngineMatch(c.req.param("id"));
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  const tournament = await store.getTournament(match.tournament_id);
  if (!tournament) return c.json({ ok: false, message: "Tournament not found" }, 404);

  const body = parseBody(confirmFrameSchema, await readJson(c));
  if (body.teamId !== match.team_a_id && body.teamId !== match.team_b_id) {
    return c.json({ ok: false, message: "teamId is not part of this match" }, 400);
  }

  if (match.status !== "COMPLETED") {
    return c.json({ ok: false, message: "This frame has not finished yet." }, 409);
  }

  const teams = await store.getEngineTeams(match.tournament_id);
  const isHost = tournament.host_id === user.id || user.role === "admin";
  const ownSide = teams.find((t) => t.id === body.teamId && t.user_id === user.id);
  if (!ownSide && !isHost) {
    return c.json(
      { ok: false, message: "Only that player, or the host, can confirm for that side." },
      403
    );
  }

  // Disagreeing about the winner is reported rather than quietly accepted: the
  // whole point is that a contested frame stays visibly contested.
  if (body.winnerId !== undefined && body.winnerId !== null && body.winnerId !== match.winner_id) {
    return c.json(
      {
        ok: false,
        code: "winner_disputed",
        message:
          "That is not the result the table recorded. Ask the host to restart the frame rather than confirming a different winner.",
        recordedWinnerId: match.winner_id,
      },
      409
    );
  }

  await store.confirmFrame(match.id, body.teamId, user.id, match.winner_id);
  const confirmations = await store.getFrameConfirmations(match.id);
  const sides = new Set(confirmations.map((fc) => fc.team_id));
  const bothAgreed = sides.has(match.team_a_id) && sides.has(match.team_b_id);

  // Both sides in: the result becomes real. settleAwaitingConfirmation is the
  // guard that makes this happen once even if both players tap at the instant.
  if (bothAgreed && match.awaiting_confirmation) {
    const mine = await store.settleAwaitingConfirmation(match.id);
    if (mine) {
      const settled = { ...match, awaiting_confirmation: false };
      await recordEngineResult(c, tournament, settled);
      await syncEngineArena(c, tournament);
    }
  }

  return c.json({
    ok: true,
    confirmed: [...sides],
    bothAgreed,
    awaitingFrom: bothAgreed
      ? []
      : [match.team_a_id, match.team_b_id].filter((id) => !sides.has(id)),
  });
});

/**
 * The host settles a frame nobody will confirm.
 *
 * A player who has left, a phone that is flat, a walk-in who never had the app
 * open: the night cannot stop for any of them. The override is recorded as the
 * host's own confirmation of both sides, so the ledger says the screen is
 * carrying the owner's word for this one — which is the thing confirmation
 * exists to make visible.
 */
app.post("/api/engine/matches/:id/confirm-override", async (c) => {
  const store = c.get("store");
  const match = await store.getEngineMatch(c.req.param("id"));
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  const access = await requireTournamentManager(c, match.tournament_id);
  if ("error" in access) return access.error;
  const { tournament } = access;
  const user = requireUser(c)!;

  if (match.status !== "COMPLETED") {
    return c.json({ ok: false, message: "This frame has not finished yet." }, 409);
  }

  await store.confirmFrame(match.id, match.team_a_id, user.id, match.winner_id);
  await store.confirmFrame(match.id, match.team_b_id, user.id, match.winner_id);

  if (match.awaiting_confirmation) {
    const mine = await store.settleAwaitingConfirmation(match.id);
    if (mine) {
      await recordEngineResult(c, tournament, { ...match, awaiting_confirmation: false });
      await syncEngineArena(c, tournament);
    }
  }

  return c.json({ ok: true, overriddenBy: user.id });
});

// ── 1.4 WhatsApp push ──

/**
 * The bracket, the results or the table as text, with a link that opens
 * WhatsApp with it already written.
 *
 * Public, because it says no more than the tournament page already does, and
 * because the host wants to push results from whichever device is to hand.
 * See lib/share-text.ts for why this is a share link and not a Business API
 * integration.
 */
app.get("/api/tournaments/:id/share", async (c) => {
  const store = c.get("store");
  const tournamentId = c.req.param("id");

  const tournament = await store.getTournament(tournamentId);
  if (!tournament) return c.json({ ok: false, message: "Tournament not found" }, 404);

  const requested = (c.req.query("kind") || "bracket").toLowerCase();
  const kind: ShareKind =
    requested === "results" || requested === "table" ? (requested as ShareKind) : "bracket";

  let teams: EngineTeamRow[] = [];
  let matches: EngineMatchRow[] = [];
  try {
    [teams, matches] = await Promise.all([
      store.getEngineTeams(tournamentId),
      store.getEngineMatches(tournamentId),
    ]);
  } catch (err) {
    // No engine tables yet means nothing has been drawn; an empty bracket is
    // the honest answer, not a 500.
    if (!isMissingTableError(err)) throw err;
  }

  const joinCode = await store.getLiveJoinCodeFor(tournamentId).catch(() => null);
  const joinUrl = joinCode ? `${publicOrigin(c.env)}/join/${joinCode.code}` : undefined;

  const text = shareText(kind, tournament.name, teams, matches, joinUrl);
  return c.json({ ok: true, kind, text, whatsappUrl: whatsappShareUrl(text) });
});

// ── 1.5 Sixty-second setup ──

/**
 * Run a night in one request.
 *
 * Pick a game, pick how many are playing, go. This exists because the panel's
 * complaint was never that the app lacked features — it was that setting up
 * took longer than the regulars would wait, and the person holding the phone
 * had been trained for ninety seconds. Everything a hosted tournament usually
 * needs several calls for happens here: create, seat the players, start, draw.
 *
 * Free to enter, always: entryFeeCents is not a parameter, so there is no path
 * through this route that could take a stake.
 */
app.post("/api/engine/quick-setup", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const limited = await rateLimit(c, "quick-setup", 30, 300);
  if (limited) return limited;

  try {
    await ensureEngineSchema(c.env.DB);
  } catch (err) {
    console.error("Could not ensure the engine schema:", err);
  }

  const store = c.get("store");
  const body = parseBody(quickSetupSchema, await readJson(c).catch(() => ({})));

  const venue = await resolveVenueForUser(c, body.venueId ?? null, user.id);
  if (venue === "denied") {
    return c.json({ ok: false, message: "You cannot host for that venue." }, 403);
  }

  // Names if the host had them, Player n for the rest. A blank in the middle
  // of the list is filled rather than dropped, so the count the host asked for
  // is the count that gets seated.
  const supplied = body.players ?? [];
  const names: string[] = [];
  for (let i = 0; i < body.size; i++) {
    const given = (supplied[i] ?? "").trim();
    names.push(given || `Player ${i + 1}`);
  }

  // You cannot be drawn against more opponents than have turned up, so what
  // the host asked for is clamped to the field rather than quietly producing a
  // round that cannot be drawn. Four players is three frames each at most.
  const matchesPerTeam = Engine.framesEachFor(body.matchesPerTeam, body.size);

  const tournament = await store.createTournament({
    name: body.name || `${venue ? venue.name : "League"} night`,
    entryFeeCents: 0,
    maxPlayers: Math.max(body.size, 2),
    hostId: user.id,
    tournamentType: "offline",
    bracketType: body.bracketType,
    sport: body.sport,
    venueId: venue?.id ?? null,
    requireFrameConfirmation: body.requireFrameConfirmation,
    maxMatchesPerTeam: matchesPerTeam,
  });

  // The host takes the first seat under their own account unless they say
  // they are only running the night. Without this, "Run a night" seated
  // everybody by name alone, no team carried an account, and the person who
  // set the whole thing up earned nothing from it.
  for (let i = 0; i < names.length; i++) {
    const seatIsHost = body.hostPlaying && i === 0;
    await store.createEngineTeam(
      tournament.id,
      seatIsHost && !supplied[0] ? user.name : names[i],
      seatIsHost ? user.id : null
    );
  }

  const teams = await store.getEngineTeams(tournament.id);
  await store.updateTournamentStatus(tournament.id, "GROUP");

  // Draw the opening fixtures, exactly as the start route does, so the
  // schedule exists the moment the page opens.
  const limit = tournament.max_matches_per_team || matchesPerTeam;
  const { matches: nextMatches, byeTeamId } = Engine.generateNextMatches(teams, [], "GROUP", limit);
  for (const mData of nextMatches) {
    const match = await store.createEngineMatch(tournament.id, mData);
    await store.createEngineMatchup(tournament.id, match.team_a_id, match.team_b_id, match.id);
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

  // A code on the screen from the start, so anyone who walks in later can join
  // without the host going looking for the button.
  const code = await issueJoinCode(c, tournament.id, user.id);

  return c.json({
    ok: true,
    tournamentId: tournament.id,
    teams: teams.length,
    matches: nextMatches.length,
    matchesPerTeam,
    joinCode: code,
    joinUrl: `${publicOrigin(c.env)}/join/${code}`,
    staffUrl: `${publicOrigin(c.env)}/staff/${tournament.id}`,
    displayUrl: `${publicOrigin(c.env)}/display/${tournament.id}`,
  });
});

// ── 1.7 Join by QR ──

/**
 * How long a join code stays scannable.
 *
 * Six hours covers a long league night with a wide margin, and is short enough
 * that a photograph of the screen is not a permanent back door into the
 * tournament.
 */
const JOIN_CODE_TTL_SECONDS = 6 * 60 * 60;

/**
 * Mint a join code for a tournament, or hand back the one already on screen.
 *
 * Reused rather than reissued: a room that has already scanned the QR must not
 * find it dead because the host reopened the display.
 */
async function issueJoinCode(
  c: Context<AppContext>,
  tournamentId: string,
  userId: string | null
): Promise<string> {
  const store = c.get("store");
  const existing = await store.getLiveJoinCodeFor(tournamentId).catch(() => null);
  if (existing) return existing.code;

  const expiresAt = new Date(Date.now() + JOIN_CODE_TTL_SECONDS * 1000).toISOString();
  // Six characters from the broadcast alphabet, which already excludes the
  // glyphs people misread off a screen across a room.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = createBroadcastCode();
    const taken = await store.getJoinCode(code).catch(() => null);
    if (taken) continue;
    await store.createJoinCode(code, tournamentId, userId, expiresAt);
    return code;
  }
  throw new Error("Could not allocate a join code");
}

/** The host puts a code on the screen. */
app.post("/api/tournaments/:id/join-code", async (c) => {
  const tournamentId = c.req.param("id");
  const access = await requireTournamentManager(c, tournamentId);
  if ("error" in access) return access.error;
  const user = requireUser(c)!;

  const code = await issueJoinCode(c, tournamentId, user.id);
  return c.json({
    ok: true,
    code,
    url: `${publicOrigin(c.env)}/join/${code}`,
    expiresInSeconds: JOIN_CODE_TTL_SECONDS,
  });
});

/**
 * What a scanned code points at.
 *
 * Deliberately open: a player who has just scanned a QR off a screen has no
 * account, and asking them to make one before telling them what they scanned
 * is how a walk-in becomes a non-entrant.
 */
app.get("/api/join/:code", async (c) => {
  const store = c.get("store");
  const code = normaliseBroadcastCode(c.req.param("code") || "");

  const record = await store.getJoinCode(code);
  if (!record) return c.json({ ok: false, message: "That code is not valid." }, 404);
  if (record.expires_at && record.expires_at < new Date().toISOString()) {
    return c.json({ ok: false, message: "That code has expired. Ask for a new one." }, 410);
  }

  const tournament = await store.getTournament(record.tournament_id);
  if (!tournament) return c.json({ ok: false, message: "That tournament no longer exists." }, 404);

  const teams = await store.getEngineTeams(tournament.id).catch(() => []);
  const venue = tournament.venue_id
    ? await store.getVenue(tournament.venue_id).catch(() => null)
    : null;

  return c.json({
    ok: true,
    tournamentId: tournament.id,
    name: tournament.name,
    venue: venue?.name ?? null,
    sport: tournament.sport,
    status: tournament.status,
    // Free, always. A code that led to a payment screen would be a stake taken
    // from someone who scanned a poster.
    free: tournament.entry_fee_cents === 0,
    entered: teams.length,
    capacity: tournament.max_players,
    open: tournament.status === "open" || tournament.status === "GROUP",
  });
});

/**
 * Take a seat by code. No account, no wallet, no top-up.
 *
 * The player types a name and is in. That is the whole flow, and it is why the
 * route creates an engine team rather than a participant: a participant has an
 * account, a wallet and a join fee to settle, none of which a walk-in has.
 */
app.post("/api/join/:code", async (c) => {
  const limited = await rateLimit(c, "join-code", 20, 60);
  if (limited) return limited;

  const store = c.get("store");
  const code = normaliseBroadcastCode(c.req.param("code") || "");
  const body = parseBody(joinByCodeSchema, await readJson(c));

  const record = await store.getJoinCode(code);
  if (!record) return c.json({ ok: false, message: "That code is not valid." }, 404);
  if (record.expires_at && record.expires_at < new Date().toISOString()) {
    return c.json({ ok: false, message: "That code has expired. Ask for a new one." }, 410);
  }

  const tournament = await store.getTournament(record.tournament_id);
  if (!tournament) return c.json({ ok: false, message: "That tournament no longer exists." }, 404);

  // Belt and braces. Entry fees are already clamped to zero while stakes are
  // off, but a code must never be the thing that admits someone to a paid
  // tournament: they scanned a poster, they did not agree to a charge.
  if (tournament.entry_fee_cents > 0) {
    return c.json(
      { ok: false, message: "This tournament is not free to enter, so it cannot be joined by code." },
      409
    );
  }

  if (tournament.status !== "open" && tournament.status !== "GROUP") {
    return c.json({ ok: false, message: "This tournament is no longer taking entries." }, 409);
  }

  const seated = await store.countEngineTeams(tournament.id);
  if (seated >= tournament.max_players) {
    return c.json({ ok: false, message: "This tournament is full." }, 409);
  }

  const existing = await store.getEngineTeams(tournament.id);
  const wanted = body.name.trim();
  if (existing.some((t) => t.name.trim().toLowerCase() === wanted.toLowerCase())) {
    return c.json(
      { ok: false, message: "Someone is already playing under that name. Try another." },
      409
    );
  }

  // A signed-in player keeps their account on the team, so a series table can
  // add their weeks up; a walk-in is seated as a guest.
  const user = c.get("user");
  const team = user
    ? await store.createEngineTeam(tournament.id, wanted, user.id)
    : await store.createGuestEngineTeam(tournament.id, wanted);

  // Mid-tournament arrivals get matched against whoever is waiting, exactly as
  // the add-team route does.
  if (tournament.status === "GROUP") {
    const [allTeams, matchups, matches] = await Promise.all([
      store.getEngineTeams(tournament.id),
      store.getEngineMatchups(tournament.id),
      store.getEngineMatches(tournament.id),
    ]);
    if (matches.length > 0) {
      const limit = tournament.max_matches_per_team || 2;
      const { matches: nextMatches } = Engine.generateNextMatches(allTeams, matchups, "GROUP", limit);
      for (const nm of nextMatches.filter((m) => m.team_a_id === team.id || m.team_b_id === team.id)) {
        const match = await store.createEngineMatch(tournament.id, nm);
        await store.createEngineMatchup(tournament.id, match.team_a_id, match.team_b_id, match.id);
      }
    }
  }

  return c.json({
    ok: true,
    tournamentId: tournament.id,
    teamId: team.id,
    name: team.name,
    guest: !user,
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Phase 2 — the venue becomes the customer
// ════════════════════════════════════════════════════════════════════════════

// ── 2.1 Venue accounts ──

app.post("/api/venues", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const body = parseBody(createVenueSchema, await readJson(c));

  // A venue may only be put into a chain by whoever owns that chain.
  if (body.chainId) {
    const chain = await store.getChain(body.chainId);
    if (!chain || (chain.owner_id !== user.id && user.role !== "admin")) {
      return c.json({ ok: false, message: "You do not own that chain." }, 403);
    }
  }

  const venue = await store.createVenue({
    name: body.name,
    city: body.city,
    ownerId: user.id,
    chainId: body.chainId ?? null,
    whatsappGroup: body.whatsappGroup ?? null,
  });

  return c.json({ ok: true, venue: serializeVenue(venue) });
});

app.get("/api/venues", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const venues = await store.listVenuesForUser(user.id);

  // Entitlement is read per venue so a page can say which sites are covered by
  // a subscription and which are not, without a second round trip.
  const rows = await Promise.all(
    venues.map(async (v) => {
      const sub = await store.entitlingSubscription(v.id, v.chain_id).catch(() => null);
      return {
        ...serializeVenue(v),
        role: await store.getVenueRole(v.id, user.id).catch(() => null),
        entitled: !!sub && statusEntitles(sub.status),
        subscriptionStatus: sub?.status ?? null,
      };
    })
  );

  return c.json({ ok: true, venues: rows });
});

app.get("/api/venues/:id", async (c) => {
  const access = await requireVenueRole(c, c.req.param("id"), ["owner", "manager", "staff"]);
  if ("error" in access) return access.error;
  const { venue, role } = access;

  const store = c.get("store");
  const [activity, members, sub, chain] = await Promise.all([
    store.venueActivity(venue.id).catch(() => null),
    // Staff do not need the roster, and it carries other people's emails.
    role === "staff" ? Promise.resolve([]) : store.listVenueMembers(venue.id).catch(() => []),
    store.entitlingSubscription(venue.id, venue.chain_id).catch(() => null),
    venue.chain_id ? store.getChain(venue.chain_id).catch(() => null) : Promise.resolve(null),
  ]);

  return c.json({
    ok: true,
    venue: serializeVenue(venue),
    role,
    chain: chain ? { id: chain.id, name: chain.name } : null,
    activity,
    members: members.map((m) => ({
      userId: m.user_id,
      name: m.user_name ?? null,
      email: m.user_email ?? null,
      role: m.role,
      since: m.created_at,
    })),
    subscription: sub
      ? {
          id: sub.id,
          planCode: sub.plan_code,
          status: sub.status,
          entitled: statusEntitles(sub.status),
          amount: centsToMoney(sub.amount_cents),
          periodEnd: sub.current_period_end,
          trialEndsAt: sub.trial_ends_at,
          // A chain subscription covering this site, rather than its own.
          viaChain: !!sub.chain_id && sub.chain_id === venue.chain_id,
        }
      : null,
  });
});

/** POST rather than PATCH: the CORS policy allows GET, POST, PUT and DELETE. */
app.post("/api/venues/:id/update", async (c) => {
  const access = await requireVenueRole(c, c.req.param("id"), ["owner", "manager"]);
  if ("error" in access) return access.error;
  const user = requireUser(c)!;

  const store = c.get("store");
  const body = parseBody(updateVenueSchema, await readJson(c));

  if (body.chainId) {
    const chain = await store.getChain(body.chainId);
    if (!chain || (chain.owner_id !== user.id && user.role !== "admin")) {
      return c.json({ ok: false, message: "You do not own that chain." }, 403);
    }
  }

  await store.updateVenue(access.venue.id, {
    name: body.name,
    city: body.city,
    chain_id: body.chainId === undefined ? undefined : body.chainId,
    whatsapp_group: body.whatsappGroup === undefined ? undefined : body.whatsappGroup,
    status: body.status,
  });

  const fresh = await store.getVenue(access.venue.id);
  return c.json({ ok: true, venue: fresh ? serializeVenue(fresh) : null });
});

/**
 * Put a member of staff on a venue.
 *
 * By email, against an account that already exists: inviting someone who has
 * not signed up would mean holding an address and sending mail, neither of
 * which this app does. The owner tells them to sign up, then adds them.
 */
app.post("/api/venues/:id/members", async (c) => {
  const access = await requireVenueRole(c, c.req.param("id"), ["owner", "manager"]);
  if ("error" in access) return access.error;

  const store = c.get("store");
  const body = parseBody(venueMemberSchema, await readJson(c));

  const account = await store.getUserByEmail(body.email);
  if (!account) {
    return c.json(
      {
        ok: false,
        message:
          "Nobody has signed up with that email yet. Ask them to create an account, then add them.",
      },
      404
    );
  }

  await store.addVenueMember(access.venue.id, account.id, body.role);
  return c.json({ ok: true, userId: account.id, name: account.name, role: body.role });
});

app.post("/api/venues/:id/members/remove", async (c) => {
  const access = await requireVenueRole(c, c.req.param("id"), ["owner", "manager"]);
  if ("error" in access) return access.error;

  const body = parseBody(venueMemberSchema.partial({ role: true }), await readJson(c));
  const store = c.get("store");

  const account = await store.getUserByEmail(body.email!);
  if (!account) return c.json({ ok: false, message: "No such account." }, 404);

  // The owner is the account the venue belongs to; removing them would leave a
  // venue nobody can administer.
  if (account.id === access.venue.owner_id) {
    return c.json({ ok: false, message: "The owner cannot be removed from their own venue." }, 409);
  }

  await store.removeVenueMember(access.venue.id, account.id);
  return c.json({ ok: true });
});

/** Every tournament this venue has run. */
app.get("/api/venues/:id/tournaments", async (c) => {
  const access = await requireVenueRole(c, c.req.param("id"), ["owner", "manager", "staff"]);
  if ("error" in access) return access.error;

  const store = c.get("store");
  const all = await store.listTournaments();
  const mine = all.filter((t) => t.venue_id === access.venue.id);
  return c.json({ ok: true, tournaments: mine.map(serializeTournament) });
});

// ── 2.3 Chain tier ──

app.post("/api/chains", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const body = parseBody(createChainSchema, await readJson(c));
  const chain = await c.get("store").createChain({ name: body.name, ownerId: user.id });
  return c.json({ ok: true, chain });
});

app.get("/api/chains", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const chains = await store.listChainsForUser(user.id);
  const rows = await Promise.all(
    chains.map(async (ch) => ({
      id: ch.id,
      name: ch.name,
      sites: (await store.listVenuesForChain(ch.id).catch(() => [])).length,
      createdAt: ch.created_at,
    }))
  );
  return c.json({ ok: true, chains: rows });
});

/**
 * The chain dashboard: every site, and how busy each one actually is.
 *
 * The per-site activity is the point. A chain owner's real question is not how
 * the chain is doing in aggregate but which rooms have stopped running nights,
 * because those are the ones about to cancel.
 */
app.get("/api/chains/:id/overview", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const chain = await store.getChain(c.req.param("id"));
  if (!chain) return c.json({ ok: false, message: "Chain not found" }, 404);
  if (chain.owner_id !== user.id && user.role !== "admin") {
    return c.json({ ok: false, message: "You do not own that chain." }, 403);
  }

  const venues = await store.listVenuesForChain(chain.id);
  const sites = await Promise.all(
    venues.map(async (v) => ({
      ...serializeVenue(v),
      activity: await store.venueActivity(v.id).catch(() => null),
    }))
  );

  const sub = await store
    .entitlingSubscription(venues[0]?.id ?? "", chain.id)
    .catch(() => null);

  return c.json({
    ok: true,
    chain: { id: chain.id, name: chain.name },
    sites,
    subscription: sub
      ? {
          id: sub.id,
          planCode: sub.plan_code,
          status: sub.status,
          entitled: statusEntitles(sub.status),
          amount: centsToMoney(sub.amount_cents),
          periodEnd: sub.current_period_end,
        }
      : null,
  });
});

/** One league table across every venue in the chain. */
app.get("/api/chains/:id/standings", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const chain = await store.getChain(c.req.param("id"));
  if (!chain) return c.json({ ok: false, message: "Chain not found" }, 404);
  if (chain.owner_id !== user.id && user.role !== "admin") {
    return c.json({ ok: false, message: "You do not own that chain." }, 403);
  }

  const standings = await store.chainStandings(chain.id).catch(() => []);
  return c.json({ ok: true, standings });
});

// ── 2.2 Subscription billing ──

/**
 * What the software costs.
 *
 * Always answerable, even where billing is switched off: a venue deciding
 * whether to pilot needs the price before it needs a checkout.
 */
app.get("/api/billing/plans", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({
    ok: true,
    enabled: billingEnabled(c.env),
    trialDays: TRIAL_DAYS,
    plans: PLANS.map((p) => ({
      code: p.code,
      name: p.name,
      price: centsToMoney(p.rupees * 100),
      rupees: p.rupees,
      intervalMonths: p.intervalMonths,
      perSite: p.chain,
      minSites: p.minSites,
      blurb: p.blurb,
      features: p.features,
    })),
    message: billingEnabled(c.env)
      ? null
      : "Subscriptions are not open yet. Get in touch and we will set your venue up by hand.",
  });
});

/**
 * Start a subscription for a venue, or for a chain.
 *
 * NOT gated by stakesEnabled, and that is deliberate: see lib/billing.ts. A
 * venue buying tournament software is a business-to-business sale; a player
 * paying to enter a game is a stake. Only the second is prohibited.
 */
app.post("/api/billing/subscribe", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  if (!billingEnabled(c.env)) {
    return c.json(
      {
        ok: false,
        code: "billing_disabled",
        message:
          "Subscriptions are not open on this deployment. Get in touch and we will set your venue up by hand.",
      },
      503
    );
  }

  const limited = await rateLimit(c, "subscribe", 10, 600);
  if (limited) return limited;

  const store = c.get("store");
  const body = parseBody(subscribeSchema, await readJson(c));

  const plan = findPlan(body.planCode);
  if (!plan) return c.json({ ok: false, message: "No such plan." }, 400);

  // Who is being billed, and may this account commit them to it.
  let venueId: string | null = null;
  let chainId: string | null = null;
  let sites = 1;

  if (plan.chain) {
    if (!body.chainId) return c.json({ ok: false, message: "A chain plan needs a chain." }, 400);
    const chain = await store.getChain(body.chainId);
    if (!chain || (chain.owner_id !== user.id && user.role !== "admin")) {
      return c.json({ ok: false, message: "You do not own that chain." }, 403);
    }
    chainId = chain.id;
    const venues = await store.listVenuesForChain(chain.id);
    sites = Math.max(venues.length, body.sites, plan.minSites);
  } else {
    if (!body.venueId) return c.json({ ok: false, message: "A venue plan needs a venue." }, 400);
    const access = await requireVenueRole(c, body.venueId, ["owner"]);
    if ("error" in access) return access.error;
    venueId = access.venue.id;
  }

  // Already covered: say so rather than selling a second mandate for the same
  // room, which is a refund conversation later.
  const existing = await store.entitlingSubscription(venueId ?? "", chainId);
  if (existing && statusEntitles(existing.status)) {
    return c.json(
      {
        ok: false,
        code: "already_subscribed",
        message: "That is already covered by a live subscription.",
        subscriptionId: existing.id,
      },
      409
    );
  }

  const { keyId, keySecret } = razorpayCredentials(c.env);
  const amountPaise = planAmountPaise(plan, sites);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86400 * 1000);

  let providerPlan: { id: string };
  let providerSubscription: any;
  try {
    providerPlan = await createRazorpayPlan(keyId, keySecret, plan, amountPaise);
    providerSubscription = await createRazorpaySubscription(keyId, keySecret, {
      planId: providerPlan.id,
      // The free month expressed the way Razorpay expresses one: the mandate is
      // authorised now and the first charge falls due after the trial.
      startAtUnix: Math.floor(trialEndsAt.getTime() / 1000),
      totalCount: plan.intervalMonths === 12 ? 10 : 120,
      notes: {
        plan_code: plan.code,
        venue_id: venueId ?? "",
        chain_id: chainId ?? "",
        sites: String(sites),
      },
    });
  } catch (err) {
    console.error("Could not create the Razorpay subscription:", err);
    return c.json(
      { ok: false, message: "The payment provider would not start that subscription." },
      502
    );
  }

  const record = await store.createSubscription({
    venueId,
    chainId,
    userId: user.id,
    planCode: plan.code,
    amountCents: amountPaise,
    intervalMonths: plan.intervalMonths,
    providerSubscriptionId: providerSubscription?.id ?? null,
    providerPlanId: providerPlan.id,
    status: mapProviderStatus(providerSubscription?.status ?? "created"),
    trialEndsAt: trialEndsAt.toISOString(),
  });

  return c.json({
    ok: true,
    subscription: {
      id: record.id,
      planCode: record.plan_code,
      status: record.status,
      amount: centsToMoney(record.amount_cents),
      sites,
      trialEndsAt: record.trial_ends_at,
    },
    // What the checkout needs. The short URL Razorpay returns is what a venue
    // owner actually opens to authorise the mandate.
    keyId,
    providerSubscriptionId: providerSubscription?.id ?? null,
    authorisationUrl: providerSubscription?.short_url ?? null,
  });
});

app.get("/api/billing/subscriptions", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const subs = await store.listSubscriptionsForUser(user.id);
  return c.json({
    ok: true,
    subscriptions: subs.map((sub) => ({
      id: sub.id,
      venueId: sub.venue_id,
      venueName: sub.venue_name ?? null,
      chainId: sub.chain_id,
      planCode: sub.plan_code,
      status: sub.status,
      entitled: statusEntitles(sub.status),
      amount: centsToMoney(sub.amount_cents),
      intervalMonths: sub.interval_months,
      periodEnd: sub.current_period_end,
      trialEndsAt: sub.trial_ends_at,
      cancelledAt: sub.cancelled_at,
      createdAt: sub.created_at,
    })),
  });
});

/**
 * Cancel at the end of the period, not immediately.
 *
 * A venue that has paid for this month keeps this month. Cancelling mid-cycle
 * and shutting the scoreboard off is how a refund request and a bad review
 * arrive together.
 */
app.post("/api/billing/subscriptions/:id/cancel", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const sub = await store.getSubscription(c.req.param("id"));
  if (!sub) return c.json({ ok: false, message: "Subscription not found" }, 404);
  if (sub.user_id !== user.id && user.role !== "admin") {
    return c.json({ ok: false, message: "That is not your subscription." }, 403);
  }

  if (sub.provider_subscription_id && billingEnabled(c.env)) {
    const { keyId, keySecret } = razorpayCredentials(c.env);
    try {
      await cancelRazorpaySubscription(keyId, keySecret, sub.provider_subscription_id, true);
    } catch (err) {
      console.error("Could not cancel the Razorpay subscription:", err);
      return c.json(
        { ok: false, message: "The payment provider would not cancel that subscription." },
        502
      );
    }
  }

  await store.updateSubscription(sub.id, {
    status: "cancelling",
    cancelled_at: new Date().toISOString(),
  });

  return c.json({
    ok: true,
    message: "Cancelled. You keep access until the end of the period you have paid for.",
  });
});

/**
 * Razorpay's subscription webhooks.
 *
 * Signature-verified against the raw body, fail-closed on a missing secret,
 * and de-duplicated on the provider's event id — Razorpay redelivers, and
 * without the de-duplication a redelivered charge would extend a billing
 * period twice.
 */
app.post("/api/billing/webhook", async (c) => {
  const secret =
    (c.env.RAZORPAY_SUBSCRIPTION_WEBHOOK_SECRET ?? "").trim() ||
    (c.env.RAZORPAY_WEBHOOK_SECRET ?? "").trim();
  const signature = c.req.header("X-Razorpay-Signature");
  if (!signature) return c.json({ ok: false, message: "Missing signature" }, 400);

  const raw = await c.req.arrayBuffer();
  const valid = await verifyWebhookSignature(secret, raw, signature);
  if (!valid) return c.json({ ok: false, message: "Invalid signature" }, 400);

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return c.json({ ok: false, message: "Malformed body" }, 400);
  }

  const event: string = payload?.event ?? "unknown";
  const providerSub = payload?.payload?.subscription?.entity;
  const store = c.get("store");

  try {
    await ensureEngineSchema(c.env.DB);
  } catch (err) {
    console.error("Could not ensure the billing schema:", err);
  }

  const record = providerSub?.id
    ? await store.getSubscriptionByProviderId(providerSub.id).catch(() => null)
    : null;

  // The key a redelivery is recognised by. Razorpay's own event id where it
  // sends one, and the subscription id paired with the event name where it
  // does not — the pair is enough, because the same event does not fire twice
  // for one subscription with a different meaning.
  const eventIdHeader = (c.req.header("X-Razorpay-Event-Id") ?? "").trim();
  const dedupeBasis = eventIdHeader || providerSub?.id || "";
  const providerEventId = dedupeBasis ? `${dedupeBasis}:${event}` : null;

  // Recorded before anything is acted on, so a redelivery is a no-op even if
  // the handling below throws.
  const fresh = await store.recordSubscriptionEvent({
    subscriptionId: record?.id ?? null,
    providerEventId,
    event,
    payload,
  });
  if (!fresh) return c.json({ ok: true, duplicate: true });

  if (!record) {
    // A subscription we have no row for: logged and acknowledged. Returning an
    // error would only have Razorpay retry something we still cannot match.
    console.warn(`Billing webhook ${event} for an unknown subscription`);
    return c.json({ ok: true, unmatched: true });
  }

  const updates: Record<string, unknown> = {};
  if (providerSub?.status) updates.status = mapProviderStatus(providerSub.status);
  if (providerSub?.current_end) {
    updates.current_period_end = new Date(providerSub.current_end * 1000).toISOString();
  }
  if (event === "subscription.cancelled") {
    updates.status = "cancelled";
    updates.cancelled_at = new Date().toISOString();
  }
  if (Object.keys(updates).length > 0) await store.updateSubscription(record.id, updates);

  return c.json({ ok: true });
});

// ── The admin console sees the business ──

app.get("/api/admin/venues", async (c) => {
  const { admin, deny } = adminOr403(c);
  if (!admin) return deny;

  const store = c.get("store");
  const venues = await store.listAllVenues();
  const rows = await Promise.all(
    venues.map(async (v) => {
      const [activity, sub] = await Promise.all([
        store.venueActivity(v.id).catch(() => null),
        store.entitlingSubscription(v.id, v.chain_id).catch(() => null),
      ]);
      return {
        ...serializeVenue(v),
        activity,
        subscriptionStatus: sub?.status ?? null,
        entitled: !!sub && statusEntitles(sub.status),
        monthly: sub ? centsToMoney(sub.amount_cents) : null,
      };
    })
  );
  return c.json({ ok: true, venues: rows });
});

/**
 * Every subscription, and what they add up to.
 *
 * The recurring total is the number the whole plan turns on: the exit test for
 * Phase 1 is three venues paying, and this is where that is read off.
 */
app.get("/api/admin/subscriptions", async (c) => {
  const { admin, deny } = adminOr403(c);
  if (!admin) return deny;

  const store = c.get("store");
  const subs = await store.listSubscriptions();
  const live = subs.filter((sub) => statusEntitles(sub.status) && !sub.cancelled_at);

  // Normalised to a month so an annual plan and a monthly one can be added up.
  const monthlyCents = live.reduce(
    (total, sub) => total + Math.round(sub.amount_cents / Math.max(1, sub.interval_months)),
    0
  );

  return c.json({
    ok: true,
    payingVenues: live.filter((sub) => sub.venue_id).length,
    payingChains: live.filter((sub) => sub.chain_id).length,
    recurringMonthly: centsToMoney(monthlyCents),
    billingEnabled: billingEnabled(c.env),
    subscriptions: subs.map((sub) => ({
      id: sub.id,
      venueId: sub.venue_id,
      venueName: sub.venue_name ?? null,
      chainId: sub.chain_id,
      owner: sub.user_name ?? null,
      planCode: sub.plan_code,
      status: sub.status,
      amount: centsToMoney(sub.amount_cents),
      intervalMonths: sub.interval_months,
      periodEnd: sub.current_period_end,
      trialEndsAt: sub.trial_ends_at,
      cancelledAt: sub.cancelled_at,
      createdAt: sub.created_at,
    })),
  });
});

// ── The WTA Coin ──
//
// Read-only, every one of them. There is no route here that credits, debits,
// buys, sells, transfers or redeems a coin, and that is the point: a coin is
// awarded by the engine for a frame that was actually played, and by nothing
// else. See lib/coins.ts for the Act this is shaped around.

/**
 * What a coin is and how it is earned. Public, and deliberately so — a
 * currency whose rules are not published is one nobody can check.
 */
app.get("/api/coins/rules", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({
    ok: true,
    name: "WTA Coin",
    symbol: "WTA",
    rules: COIN_RULES,
    awards: COIN_AWARDS,
    // NIGHT_WON above is per player; the champion is paid it times the field.
    nightWonPerPlayer: true,
    dailyCap: DAILY_COIN_CAP,
    onlineDailyCap: ONLINE_DAILY_CAP,
    minPlayers: MIN_PLAYERS_FOR_COINS,
    titles: COIN_TITLES,
    // Said plainly, in the API as well as on the page, because this is the
    // sentence that keeps the whole thing lawful.
    notice:
      "WTA Coins have no cash value. They cannot be bought, sold, transferred, withdrawn or staked. They are a score you build by playing, with a small amount for signing in each day.",
  });
});

/**
 * Claim today's visit coins.
 *
 * Called by the app on load for anyone signed in. Idempotent on the UTC date,
 * so opening the app ten times in a day pays once and the tenth call is as
 * cheap as the second — the ledger's unique index does the work rather than a
 * read-then-write that could race with itself.
 *
 * Always 200. A day already claimed is not an error, and the page uses
 * `awarded` to decide whether to say anything at all.
 */
app.post("/api/coins/daily", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const today = new Date().toISOString().slice(0, 10);

  // Whether this is their very first coin, which only changes the wording.
  const before = await store.getCoinBalance(user.id).catch(() => null);
  const firstEver = !before || before.lifetime === 0;

  const paid: Array<{ reason: string; amount: number; description: string }> = [];
  for (const award of awardsForDailyVisit(firstEver)) {
    const applied = await store.awardCoins({
      userId: user.id,
      reason: award.reason,
      amount: award.amount,
      description: award.description,
      referenceType: "daily",
      referenceId: today,
    });
    if (applied !== null) paid.push(award);
  }

  const balance = await store.getCoinBalance(user.id);
  const awarded = paid.reduce((sum, a) => sum + a.amount, 0);

  return c.json({
    ok: true,
    awarded,
    // Null when today was already claimed, so the client shows nothing.
    award: paid[0] ?? null,
    firstEver: firstEver && awarded > 0,
    balance: balance.balance,
    title: titleFor(balance.balance),
  });
});

app.get("/api/coins/me", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const store = c.get("store");
  const [balance, rank, earnedToday] = await Promise.all([
    store.getCoinBalance(user.id),
    store.coinRank(user.id).catch(() => 0),
    store.coinsEarnedToday(user.id).catch(() => 0),
  ]);

  return c.json({
    ok: true,
    balance: balance.balance,
    lifetime: balance.lifetime,
    rank,
    title: titleFor(balance.balance),
    next: nextTitle(balance.balance),
    earnedToday,
    dailyCap: DAILY_COIN_CAP,
    rules: COIN_RULES,
  });
});

/**
 * The player's own ledger.
 *
 * Every award, with what it was for and the running total after it, so a
 * player can check the arithmetic themselves. A balance nobody can audit is
 * just a number the app asserts.
 */
app.get("/api/coins/ledger", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
  const entries = await c.get("store").getCoinLedger(user.id, limit);

  return c.json({
    ok: true,
    entries: entries.map((e) => ({
      id: e.id,
      reason: e.reason,
      amount: e.amount,
      balanceAfter: e.balance_after,
      description: e.description,
      at: e.created_at,
    })),
  });
});

/** Who has earned the most. Public: it is a league table, not an account. */
app.get("/api/coins/leaderboard", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 100);
  const rows = await c.get("store").coinLeaderboard(limit);

  return c.json({
    ok: true,
    leaders: rows.map((row, i) => ({
      rank: i + 1,
      userId: row.user_id,
      name: row.user_name ?? "Unknown",
      balance: row.balance,
      title: titleFor(row.balance),
    })),
  });
});

/**
 * Claim the coins for a game finished in the browser.
 *
 * ── THE HONEST CAVEAT ──
 * This result is reported by the player's own device, and nothing here can
 * verify it. A determined person can call this endpoint directly and say they
 * won. That is not a flaw to be patched so much as a property of running the
 * game on the client, and it is exactly why the online awards are an order of
 * magnitude below the offline ones and sit under their own tight daily cap:
 * the defence is that the prize is not worth the trouble, not that the gate
 * cannot be picked.
 *
 * What is checked is the cheap, obvious stuff — one claim per game, a game
 * that lasted long enough and took enough shots to have been played at all,
 * a rate limit, and the cap. A venue frame, by contrast, is recorded by the
 * engine from a host's taps and is worth ten times as much.
 */
app.post("/api/coins/claim-online", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);

  const limited = await rateLimit(c, "coins-online", 40, 3600);
  if (limited) return limited;

  const store = c.get("store");
  const body = parseBody(claimOnlineGameSchema, await readJson(c));

  // A game that lasted four seconds and took one shot was not played.
  if (body.seconds < MIN_ONLINE_SECONDS || body.shots < MIN_ONLINE_SHOTS) {
    return c.json({
      ok: true,
      awarded: 0,
      awards: [],
      message: "That game was too short to count.",
    });
  }

  const earnedOnlineToday = await store
    .coinsEarnedTodayFor(user.id, ONLINE_REASONS)
    .catch(() => 0);

  if (earnedOnlineToday >= ONLINE_DAILY_CAP) {
    return c.json({
      ok: true,
      awarded: 0,
      awards: [],
      cappedOut: true,
      message:
        "You have earned all the coins browser play gives today. Play a league night — a night at a venue is worth far more.",
    });
  }

  const wanted = awardsForOnlineGame({
    won: body.won,
    mode: body.mode,
    aiRating: body.aiRating,
  });

  // Two ceilings apply: the online-only one and the overall daily cap.
  const byOnlineCap = applyDailyCap(wanted, earnedOnlineToday, ONLINE_DAILY_CAP);
  const earnedToday = await store.coinsEarnedToday(user.id).catch(() => 0);
  const { granted } = applyDailyCap(byOnlineCap.granted, earnedToday);

  // Losing earns nothing at all in the browser, so say that rather than
  // returning an empty success the page has to guess at.
  if (wanted.length === 0) {
    return c.json({
      ok: true,
      awarded: 0,
      awards: [],
      lost: true,
      message: "The machine took that one. Only the winner keeps the coins.",
    });
  }

  const paid: Array<{ reason: string; amount: number; description: string }> = [];
  for (const award of granted) {
    const applied = await store.awardCoins({
      userId: user.id,
      reason: award.reason,
      amount: award.amount,
      description: award.description,
      // Keyed on the session the page minted, so the same finished game
      // cannot be claimed twice however many times the message arrives.
      referenceType: "online_game",
      referenceId: body.sessionId,
    });
    if (applied !== null) paid.push(award);
  }

  const balance = await store.getCoinBalance(user.id);

  return c.json({
    ok: true,
    awarded: paid.reduce((sum, a) => sum + a.amount, 0),
    awards: paid,
    balance: balance.balance,
    title: titleFor(balance.balance),
    onlineRemainingToday: Math.max(0, ONLINE_DAILY_CAP - earnedOnlineToday),
  });
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
