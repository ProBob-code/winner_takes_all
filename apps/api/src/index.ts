import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { D1Store } from "./lib/d1-store";
import { EngineStore } from "./lib/engine-store";
import {
  generateNextMatches,
  processScoreEvent,
  getScorePoints,
  getScoreSide,
  computeTimerState,
  resolveTimerExpiry,
  rankTeams,
  generateKnockoutBracket,
  canAddTeam,
  generateExplanation,
} from "./lib/tournament-engine";
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

// ═══════════════════════════════════════════════════════════════
// ── Dynamic Tournament Engine Routes (/api/engine/*) ──
// ═══════════════════════════════════════════════════════════════

// --- Add team (SETUP or GROUP phase) ---
app.post("/api/engine/tournaments/:id/teams", async (c) => {
  const engineStore = new EngineStore(c.env.DB);
  const tournamentId = c.req.param("id");
  const body = await c.req.json();

  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return c.json({ ok: false, message: "Team name is required" }, 400);
  }

  const phase = await engineStore.getTournamentPhase(tournamentId);
  if (!phase) return c.json({ ok: false, message: "Tournament not found" }, 404);

  const liveMatch = await engineStore.getLiveMatch(tournamentId);
  const check = canAddTeam(phase, !!liveMatch);
  if (!check.allowed) {
    return c.json({ ok: false, message: check.reason }, 400);
  }

  const team = await engineStore.createEngineTeam(tournamentId, body.name.trim());
  return c.json({ ok: true, team });
});

// --- Start tournament (SETUP → GROUP) ---
app.post("/api/engine/tournaments/:id/start", async (c) => {
  const engineStore = new EngineStore(c.env.DB);
  const tournamentId = c.req.param("id");

  const phase = await engineStore.getTournamentPhase(tournamentId);
  if (!phase) return c.json({ ok: false, message: "Tournament not found" }, 404);

  // Allow starting from SETUP or 'open' (the default status from create)
  if (phase !== "SETUP" && phase !== "open") {
    return c.json({ ok: false, message: `Cannot start tournament in ${phase} phase` }, 400);
  }

  const teams = await engineStore.getEngineTeams(tournamentId);
  if (teams.length < 2) {
    return c.json({ ok: false, message: "Need at least 2 teams to start" }, 400);
  }

  // Transition to GROUP
  await engineStore.setTournamentPhase(tournamentId, "GROUP");

  // Generate first round of matches
  const matchups = await engineStore.getMatchups(tournamentId);
  const round = generateNextMatches(teams, matchups, 2);
  let matchOrder = 0;
  const body = await c.req.json().catch(() => ({}));
  const duration = body.duration || 600;

  // Handle BYE
  if (round.bye) {
    await engineStore.incrementTeamStats(round.bye.teamId, 1, 1, 0);
    await engineStore.updateEngineTeam(round.bye.teamId, { bye_assigned: 1 });
  }

  // Create matches
  const createdMatches = [];
  for (const [teamAId, teamBId] of round.matches) {
    matchOrder++;
    const teamA = teams.find(t => t.id === teamAId)!;
    const teamB = teams.find(t => t.id === teamBId)!;

    const explanation = generateExplanation("GROUP", {
      maxPerTeam: 2,
      byeTeamName: round.bye?.teamName,
      teamAName: teamA.name,
      teamBName: teamB.name,
    });

    const match = await engineStore.createEngineMatch({
      tournamentId, phase: "GROUP",
      teamAId, teamBId,
      duration, matchOrder, explanation,
    });
    await engineStore.createMatchup(tournamentId, teamAId, teamBId, match.id);
    createdMatches.push(match);
  }

  const updatedTeams = await engineStore.getEngineTeams(tournamentId);
  return c.json({
    ok: true,
    phase: "GROUP",
    teams: updatedTeams,
    matches: createdMatches,
    bye: round.bye,
  });
});

// --- Get full engine state ---
app.get("/api/engine/tournaments/:id/state", async (c) => {
  const engineStore = new EngineStore(c.env.DB);
  const tournamentId = c.req.param("id");

  const phase = await engineStore.getTournamentPhase(tournamentId);
  if (!phase) return c.json({ ok: false, message: "Tournament not found" }, 404);

  const teams = await engineStore.getEngineTeams(tournamentId);
  const matches = await engineStore.getEngineMatches(tournamentId);
  const liveMatch = await engineStore.getLiveMatch(tournamentId);
  const nextMatch = liveMatch ? null : await engineStore.getNextCreatedMatch(tournamentId);

  // Compute timer for live match
  let timerState = null;
  if (liveMatch && liveMatch.start_time) {
    timerState = computeTimerState(liveMatch.start_time, liveMatch.duration);
  }

  // Get team names map for match display
  const teamMap: Record<string, string> = {};
  for (const t of teams) teamMap[t.id] = t.name;

  // Enrich matches with team names
  const enrichedMatches = matches.map(m => ({
    ...m,
    teamAName: teamMap[m.team_a_id] || "Unknown",
    teamBName: teamMap[m.team_b_id] || "Unknown",
    winnerName: m.winner_id ? (teamMap[m.winner_id] || "Unknown") : null,
  }));

  return c.json({
    ok: true,
    phase,
    teams,
    matches: enrichedMatches,
    liveMatch: liveMatch ? {
      ...liveMatch,
      teamAName: teamMap[liveMatch.team_a_id] || "Unknown",
      teamBName: teamMap[liveMatch.team_b_id] || "Unknown",
      timer: timerState,
    } : null,
    nextMatch: nextMatch ? {
      ...nextMatch,
      teamAName: teamMap[nextMatch.team_a_id] || "Unknown",
      teamBName: teamMap[nextMatch.team_b_id] || "Unknown",
    } : null,
  });
});

// --- Generate next matches ---
app.post("/api/engine/tournaments/:id/generate", async (c) => {
  const engineStore = new EngineStore(c.env.DB);
  const tournamentId = c.req.param("id");

  const phase = await engineStore.getTournamentPhase(tournamentId);
  if (phase !== "GROUP") {
    return c.json({ ok: false, message: "Can only generate matches during GROUP phase" }, 400);
  }

  const liveMatch = await engineStore.getLiveMatch(tournamentId);
  if (liveMatch) {
    return c.json({ ok: false, message: "Cannot generate while a match is live" }, 400);
  }

  const teams = await engineStore.getEngineTeams(tournamentId);
  const matchups = await engineStore.getMatchups(tournamentId);
  const round = generateNextMatches(teams, matchups, 2);

  if (round.done) {
    return c.json({ ok: true, done: true, message: "All group matches complete", matches: [] });
  }

  let matchOrder = await engineStore.getMaxMatchOrder(tournamentId);
  const body = await c.req.json().catch(() => ({}));
  const duration = body.duration || 600;

  // Handle BYE
  if (round.bye) {
    await engineStore.incrementTeamStats(round.bye.teamId, 1, 1, 0);
    await engineStore.updateEngineTeam(round.bye.teamId, { bye_assigned: 1 });
  }

  const createdMatches = [];
  for (const [teamAId, teamBId] of round.matches) {
    matchOrder++;
    const teamA = teams.find(t => t.id === teamAId)!;
    const teamB = teams.find(t => t.id === teamBId)!;

    const explanation = generateExplanation("GROUP", {
      maxPerTeam: 2,
      byeTeamName: round.bye?.teamName,
      teamAName: teamA.name,
      teamBName: teamB.name,
    });

    const match = await engineStore.createEngineMatch({
      tournamentId, phase: "GROUP",
      teamAId, teamBId,
      duration, matchOrder, explanation,
    });
    await engineStore.createMatchup(tournamentId, teamAId, teamBId, match.id);
    createdMatches.push(match);
  }

  return c.json({
    ok: true,
    done: false,
    matches: createdMatches,
    bye: round.bye,
  });
});

// --- Start a match (CREATED → LIVE) ---
app.post("/api/engine/matches/:id/start", async (c) => {
  const engineStore = new EngineStore(c.env.DB);
  const matchId = c.req.param("id");
  const match = await engineStore.getEngineMatch(matchId);

  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);
  if (match.status !== "CREATED") {
    return c.json({ ok: false, message: `Match is ${match.status}, not CREATED` }, 400);
  }

  // Check no other live match exists
  const liveMatch = await engineStore.getLiveMatch(match.tournament_id);
  if (liveMatch) {
    return c.json({ ok: false, message: "Another match is already live" }, 400);
  }

  const startTime = Math.floor(Date.now() / 1000);
  await engineStore.updateEngineMatch(matchId, {
    status: "LIVE",
    start_time: startTime,
  });

  const updated = await engineStore.getEngineMatch(matchId);
  return c.json({ ok: true, match: updated });
});

// --- Score event ---
app.post("/api/engine/matches/:id/score", async (c) => {
  const engineStore = new EngineStore(c.env.DB);
  const matchId = c.req.param("id");
  const match = await engineStore.getEngineMatch(matchId);

  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);
  if (match.status !== "LIVE" && match.status !== "SUDDEN_DEATH") {
    return c.json({ ok: false, message: "Match is not live" }, 400);
  }

  const body = await c.req.json();
  const { team, type } = body as { team: "A" | "B"; type: "ball" | "black" | "mistake" };

  if (!team || !type) {
    return c.json({ ok: false, message: "team (A/B) and type (ball/black/mistake) required" }, 400);
  }

  const points = getScorePoints(type);
  const scoreSide = getScoreSide(team, type);
  const result = processScoreEvent(match, scoreSide, points);

  const updates: Record<string, any> = {
    score_team_a: result.scoreTeamA,
    score_team_b: result.scoreTeamB,
  };

  if (result.ended) {
    updates.status = "COMPLETED";
    updates.winner_id = result.winner;
    updates.ended_by = result.endedBy;
  }

  await engineStore.updateEngineMatch(matchId, updates);

  // Auto-progression on match end
  if (result.ended) {
    await handleMatchCompletion(engineStore, match, result);
  }

  return c.json({ ok: true, ...result });
});

// --- Force end match ---
app.post("/api/engine/matches/:id/end", async (c) => {
  const engineStore = new EngineStore(c.env.DB);
  const matchId = c.req.param("id");
  const match = await engineStore.getEngineMatch(matchId);

  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);
  if (match.status === "COMPLETED") {
    return c.json({ ok: false, message: "Match already completed" }, 400);
  }

  // Determine winner by current scores
  let winnerId: string | null = null;
  if (match.score_team_a > match.score_team_b) winnerId = match.team_a_id;
  else if (match.score_team_b > match.score_team_a) winnerId = match.team_b_id;
  // If tied and force-ending, pick team A as default (host override)
  else winnerId = match.team_a_id;

  await engineStore.updateEngineMatch(matchId, {
    status: "COMPLETED",
    winner_id: winnerId,
    ended_by: "TIME",
  });

  const result = {
    scoreTeamA: match.score_team_a,
    scoreTeamB: match.score_team_b,
    ended: true,
    winner: winnerId,
    endedBy: "TIME" as string | null,
  };

  await handleMatchCompletion(engineStore, match, result);

  return c.json({ ok: true, ...result });
});

// --- Get timer state ---
app.get("/api/engine/matches/:id/timer", async (c) => {
  const engineStore = new EngineStore(c.env.DB);
  const matchId = c.req.param("id");
  const match = await engineStore.getEngineMatch(matchId);

  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  if (!match.start_time) {
    return c.json({ ok: true, remaining: match.duration, expired: false, danger: false, started: false });
  }

  const timer = computeTimerState(match.start_time, match.duration);
  return c.json({ ok: true, ...timer, started: true, suddenDeath: !!match.sudden_death });
});

// --- Check timer expiry (server-side resolution) ---
app.post("/api/engine/matches/:id/check-timer", async (c) => {
  const engineStore = new EngineStore(c.env.DB);
  const matchId = c.req.param("id");
  const match = await engineStore.getEngineMatch(matchId);

  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);
  if (match.status !== "LIVE") {
    return c.json({ ok: true, action: "none", reason: "Match is not LIVE" });
  }
  if (!match.start_time) {
    return c.json({ ok: true, action: "none", reason: "Match has no start time" });
  }

  const timer = computeTimerState(match.start_time, match.duration);
  if (!timer.expired) {
    return c.json({ ok: true, action: "none", remaining: timer.remaining });
  }

  // Timer expired — resolve
  const expiry = resolveTimerExpiry(match);

  if (expiry.suddenDeath) {
    // Tie → enter sudden death
    await engineStore.updateEngineMatch(matchId, {
      status: "SUDDEN_DEATH",
      sudden_death: 1,
    });
    return c.json({ ok: true, action: "sudden_death" });
  }

  // Winner determined by score
  await engineStore.updateEngineMatch(matchId, {
    status: "COMPLETED",
    winner_id: expiry.winner,
    ended_by: expiry.endedBy,
  });

  const result = {
    scoreTeamA: match.score_team_a,
    scoreTeamB: match.score_team_b,
    ended: true,
    winner: expiry.winner,
    endedBy: expiry.endedBy,
  };

  await handleMatchCompletion(engineStore, match, result);

  return c.json({ ok: true, action: "completed", ...result });
});

// --- Add team mid-tournament ---
app.post("/api/engine/tournaments/:id/add-team", async (c) => {
  const engineStore = new EngineStore(c.env.DB);
  const tournamentId = c.req.param("id");
  const body = await c.req.json();

  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return c.json({ ok: false, message: "Team name is required" }, 400);
  }

  const phase = await engineStore.getTournamentPhase(tournamentId);
  if (!phase) return c.json({ ok: false, message: "Tournament not found" }, 404);

  const liveMatch = await engineStore.getLiveMatch(tournamentId);
  const check = canAddTeam(phase, !!liveMatch);
  if (!check.allowed) {
    return c.json({ ok: false, message: check.reason }, 400);
  }

  const team = await engineStore.createEngineTeam(tournamentId, body.name.trim());
  return c.json({ ok: true, team, message: "Team added. Generate new matches when ready." });
});

// ── Auto-progression handler ──
async function handleMatchCompletion(
  store: EngineStore,
  match: { id: string; tournament_id: string; phase: string; team_a_id: string; team_b_id: string },
  result: { scoreTeamA: number; scoreTeamB: number; winner: string | null; endedBy: string | null }
) {
  if (!result.winner) return;

  const winnerId = result.winner;
  const loserId = winnerId === match.team_a_id ? match.team_b_id : match.team_a_id;
  const winnerScore = winnerId === match.team_a_id ? result.scoreTeamA : result.scoreTeamB;
  const loserScore = winnerId === match.team_a_id ? result.scoreTeamB : result.scoreTeamA;

  // Update team stats
  await store.incrementTeamStats(winnerId, 1, 1, winnerScore);
  await store.incrementTeamStats(loserId, 1, 0, loserScore);

  const teams = await store.getEngineTeams(match.tournament_id);

  if (match.phase === "GROUP") {
    // Check if all teams completed their group matches
    const allDone = teams.every(t => t.matches_played >= 2);

    if (allDone) {
      // Transition to KNOCKOUT
      await store.setTournamentPhase(match.tournament_id, "KNOCKOUT");

      // Rank teams and generate knockout bracket
      const matches = await store.getEngineMatches(match.tournament_id);
      const ranked = rankTeams(teams, matches);
      const bracket = generateKnockoutBracket(ranked);
      let matchOrder = await store.getMaxMatchOrder(match.tournament_id);

      // Create semi-final matches
      for (const [teamAId, teamBId] of bracket.semis) {
        matchOrder++;
        const teamA = teams.find(t => t.id === teamAId)!;
        const teamB = teams.find(t => t.id === teamBId)!;
        const explanation = generateExplanation("SEMI", {
          maxPerTeam: 2, teamAName: teamA.name, teamBName: teamB.name,
        });
        await store.createEngineMatch({
          tournamentId: match.tournament_id, phase: "SEMI",
          teamAId, teamBId, duration: 600, matchOrder, explanation,
        });
      }

      // Create final matches (if direct final, i.e., 2-3 teams)
      for (const [teamAId, teamBId] of bracket.finals) {
        matchOrder++;
        const teamA = teams.find(t => t.id === teamAId)!;
        const teamB = teams.find(t => t.id === teamBId)!;
        const explanation = generateExplanation("FINAL", {
          maxPerTeam: 2, teamAName: teamA.name, teamBName: teamB.name,
        });
        await store.createEngineMatch({
          tournamentId: match.tournament_id, phase: "FINAL",
          teamAId, teamBId, duration: 600, matchOrder, explanation,
        });
      }
    }
    // If not all done, host will manually generate next matches
  } else if (match.phase === "SEMI") {
    // Check if both semis are done
    const semiMatches = await store.getEngineMatchesByPhase(match.tournament_id, "SEMI");
    const allSemisDone = semiMatches.every(m => m.status === "COMPLETED");

    if (allSemisDone) {
      // Create the final match from semi winners
      const semiWinners = semiMatches
        .filter(m => m.winner_id)
        .map(m => m.winner_id!);

      if (semiWinners.length === 2) {
        let matchOrder = await store.getMaxMatchOrder(match.tournament_id);
        matchOrder++;
        const teamA = teams.find(t => t.id === semiWinners[0])!;
        const teamB = teams.find(t => t.id === semiWinners[1])!;
        const explanation = generateExplanation("FINAL", {
          maxPerTeam: 2, teamAName: teamA.name, teamBName: teamB.name,
        });
        await store.createEngineMatch({
          tournamentId: match.tournament_id, phase: "FINAL",
          teamAId: semiWinners[0], teamBId: semiWinners[1],
          duration: 600, matchOrder, explanation,
        });
      }
    }
  } else if (match.phase === "FINAL") {
    // Tournament complete!
    await store.setTournamentPhase(match.tournament_id, "COMPLETED");
  }
}

// Unmatched routes
app.all("*", (c) => {
  return c.json({ ok: false, message: "Not Found" }, 404);
});

export default app;
