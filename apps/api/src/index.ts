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



import { EngineStore } from "./lib/engine-store";
import * as Engine from "./lib/tournament-engine";

const app = new Hono<{ Bindings: Env; Variables: { store: D1Store; user?: any } }>();

// Inject Store
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

// --- Tournament Engine Routes ---

app.get("/api/engine/tournaments/:id/state", async (c) => {
  const store = c.get("store");
  const tournamentId = c.req.param("id");
  
  const [teams, matches, tournament] = await Promise.all([
    store.getEngineTeams(tournamentId),
    store.getEngineMatches(tournamentId),
    store.getTournament(tournamentId)
  ]);

  if (!tournament) return c.json({ ok: false, message: "Tournament not found" }, 404);

  return c.json({
    ok: true,
    phase: tournament.status as Engine.TournamentPhase,
    teams,
    matches
  });
});

app.post("/api/engine/tournaments/:id/add-team", async (c) => {
  const store = c.get("store");
  const tournamentId = c.req.param("id");
  const body = await c.req.json();
  
  const tournament = await store.getTournament(tournamentId);
  if (!tournament) return c.json({ ok: false, message: "Tournament not found" }, 404);
  
  if (tournament.status !== 'GROUP' && tournament.status !== 'open') {
    return c.json({ ok: false, message: "Can only add teams during GROUP or SETUP phase" }, 400);
  }

  const team = await store.createEngineTeam(tournamentId, body.name || `Team ${Math.floor(Math.random()*1000)}`);
  
  // THE BRAIN: Run a generation pass specifically to match the newcomer if anyone is waiting
  const [allTeams, matchups, matches] = await Promise.all([
    store.getEngineTeams(tournamentId),
    store.getEngineMatchups(tournamentId),
    store.getEngineMatches(tournamentId)
  ]);

  if (matches.length > 0) {
    const limit = tournament?.max_matches_per_team || 2;
    const { matches: nextMatches } = Engine.generateNextMatches(allTeams, matchups, 'GROUP', limit);
    
    const relevantMatches = nextMatches.filter(m => m.team_a_id === team.id || m.team_b_id === team.id);
    for (const nm of relevantMatches) {
      await store.createEngineMatch(tournamentId, nm.phase!, nm.team_a_id!, nm.team_b_id!, nm.explanation!);
    }
  }

  return c.json({ ok: true, team });
});

app.post("/api/engine/tournaments/:id/start", async (c) => {
  const store = c.get("store");
  const tournamentId = c.req.param("id");
  
  await store.updateTournamentPhase(tournamentId, 'GROUP');
  return c.json({ ok: true });
});

app.post("/api/engine/tournaments/:id/generate", async (c) => {
  const store = c.get("store");
  const tournamentId = c.req.param("id");
  
  const [teams, matchups, matches, tournament] = await Promise.all([
    store.getEngineTeams(tournamentId),
    store.getEngineMatchups(tournamentId),
    store.getEngineMatches(tournamentId),
    store.getTournament(tournamentId)
  ]);

  if (matches.some(m => m.status === 'LIVE')) {
    return c.json({ ok: false, message: "Cannot generate matches while a match is LIVE" }, 400);
  }

  const limit = tournament?.max_matches_per_team || 2;
  const { matches: nextMatches, byeTeamId } = Engine.generateNextMatches(teams, matchups, 'GROUP', limit);
  
  for (const mData of nextMatches) {
    const match = await store.createEngineMatch(tournamentId, mData);
    await store.createEngineMatchup(tournamentId, match.team_a_id, match.team_b_id, match.id);
  }

  if (byeTeamId) {
    const team = teams.find(t => t.id === byeTeamId);
    if (team) {
      await store.updateEngineTeam(byeTeamId, {
        matches_played: team.matches_played + 1,
        group_points: team.group_points + 1,
        bye_assigned: true
      });
    }
  }

  return c.json({ ok: true, matchesCreated: nextMatches.length, byeAssigned: !!byeTeamId });
});

app.post("/api/engine/matches/:id/start", async (c) => {
  const store = c.get("store");
  const matchId = c.req.param("id");
  
  const match = await store.getEngineMatch(matchId);
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  const allMatches = await store.getEngineMatches(match.tournamentId);
  if (allMatches.some(m => m.status === 'LIVE')) {
    return c.json({ ok: false, message: "Another match is already LIVE" }, 400);
  }

  await store.updateEngineMatch(matchId, {
    status: 'LIVE',
    start_time: Math.floor(Date.now() / 1000)
  });

  return c.json({ ok: true });
});

app.post("/api/engine/matches/:id/extra-time", async (c) => {
  const store = c.get("store");
  const matchId = c.req.param("id");
  const match = await store.getEngineMatch(matchId);
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  await store.updateEngineMatch(matchId, {
    duration: match.duration + 60
  });
  return c.json({ ok: true });
});

app.post("/api/engine/tournaments/:id/reorder", async (c) => {
  const store = c.get("store");
  const body = await c.req.json();
  const { matchIds } = body; // Array of IDs in order
  
  if (!Array.isArray(matchIds)) return c.json({ ok: false, message: "Invalid matchIds" }, 400);

  for (let i = 0; i < matchIds.length; i++) {
    await store.updateMatchOrder(matchIds[i], i);
  }

  return c.json({ ok: true });
});

app.post("/api/engine/matches/:id/highlight", async (c) => {
  const store = c.get("store");
  const matchId = c.req.param("id");
  const body = await c.req.json();
  const { teamId } = body;
  
  await engineStore.updateMatch(matchId, { active_team_id: teamId });
  return c.json({ ok: true });
});

app.post("/api/engine/matches/:id/score", async (c) => {
  const store = c.get("store");
  const matchId = c.req.param("id");
  const body = await c.req.json();
  const { teamId, type } = body; // type: 'BALL' | 'BLACK' | 'MISTAKE'

  let match = await store.getEngineMatch(matchId);
  if (!match) return c.json({ ok: false, message: "Match not found" }, 404);

  // Check timer first
  const { updatedMatch: timedMatch, matchEnded: timerEnded } = Engine.checkTimer(match, Math.floor(Date.now() / 1000));
  match = timedMatch;

  const { updatedMatch: finalMatch, matchEnded: scoreEnded } = Engine.processScoreUpdate(match, teamId, type);
  
  await store.updateEngineMatch(matchId, {
    score_team_a: finalMatch.score_team_a,
    score_team_b: finalMatch.score_team_b,
    balls_potted_a: finalMatch.balls_potted_a,
    balls_potted_b: finalMatch.balls_potted_b,
    black_potted_a: finalMatch.black_potted_a,
    black_potted_b: finalMatch.black_potted_b,
    status: finalMatch.status,
    winner_id: finalMatch.winner_id,
    sudden_death: finalMatch.sudden_death,
    ended_by: scoreEnded ? 'SCORE' : (timerEnded ? 'TIME' : null)
  });

  if (timerEnded || scoreEnded) {
    // Finalize team stats
    const teams = await store.getEngineTeams(finalMatch.tournamentId);
    const teamA = teams.find(t => t.id === finalMatch.team_a_id)!;
    const teamB = teams.find(t => t.id === finalMatch.team_b_id)!;

    await engineStore.updateTeam(teamA.id, {
      matches_played: teamA.matches_played + 1,
      total_score: teamA.total_score + finalMatch.score_team_a,
      group_points: teamA.group_points + (finalMatch.winner_id === teamA.id ? 1 : 0)
    });
    await engineStore.updateTeam(teamB.id, {
      matches_played: teamB.matches_played + 1,
      total_score: teamB.total_score + finalMatch.score_team_b,
      group_points: teamB.group_points + (finalMatch.winner_id === teamB.id ? 1 : 0)
    });
  }

  return c.json({ ok: true, match: finalMatch });
});

// --- Public Arena Routes ---

app.post("/api/public-arenas", async (c) => {
  const store = c.get("store");
  const body = await c.req.json();
  const { id, name, state } = body;
  
  // Use id as primary key (provided by client)
  await c.env.DB.prepare(`INSERT OR REPLACE INTO public_arenas (id, name, state_json, updated_at) VALUES (?, ?, ?, ?)`)
    .bind(id, name, JSON.stringify(state), new Date().toISOString()).run();
    
  return c.json({ ok: true, id });
});

app.get("/api/public-arenas/:id", async (c) => {
  const id = c.req.param("id");
  const r = await c.env.DB.prepare(`SELECT * FROM public_arenas WHERE id = ?`).bind(id).first<any>();
  if (!r) return c.json({ ok: false, message: "Arena not found" }, 404);
  
  return c.json({ ok: true, arena: { id: r.id, name: r.name, state: JSON.parse(r.state_json) } });
});

// --- Original Routes ---
app.all("*", (c) => {
  return c.json({ ok: false, message: "Not Found" }, 404);
});

export default app;
