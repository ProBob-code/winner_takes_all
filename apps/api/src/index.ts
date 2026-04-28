import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { D1Store } from "./lib/d1-store";
import {
  createSessionTokens,
  getRefreshSession,
  deleteRefreshSession,
  buildSessionCookies,
} from "./lib/kv-sessions";
import { hashPassword, verifyPassword } from "./lib/crypto";
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
  const user = await store.createUserWithBonus(body.name, body.email, hashed, 2500); // $25 bonus

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

app.get("/api/user/profile", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, message: "Authentication required" }, 401);
  return c.json({ ok: true, user: serializeUser(user) });
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
