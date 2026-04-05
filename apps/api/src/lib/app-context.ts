import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppState, TournamentRecord, UserRecord } from "./store";
import { createId, hashPassword, verifyPassword } from "./crypto";
import { ACCESS_COOKIE, readCookie, REFRESH_COOKIE, setSessionCookies } from "./cookies";
import { centsToMoney, moneyToCents } from "./money";

const signupSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72)
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72)
});

const refreshSchema = z
  .object({
    refreshToken: z.string().min(10).optional()
  })
  .optional()
  .transform((value) => value ?? {});

const deductSchema = z.object({
  amount: z.string(),
  referenceType: z.string().trim().min(2).max(40),
  referenceId: z.string().trim().min(2).max(80)
});

export type AppContext = ReturnType<typeof createAppContext>;

export function createAppContext(state: AppState) {
  function createSessionTokens(reply: FastifyReply, userId: string) {
    const now = Date.now();
    const accessToken = createId("access");
    const refreshToken = createId("refresh");

    state.accessSessions.set(accessToken, {
      token: accessToken,
      userId,
      expiresAt: now + 1000 * 60 * 15
    });

    state.refreshSessions.set(refreshToken, {
      token: refreshToken,
      userId,
      expiresAt: now + 1000 * 60 * 60 * 24 * 7
    });

    setSessionCookies(reply, accessToken, refreshToken);

    return {
      accessToken,
      refreshToken
    };
  }

  function getSessionUser(request: FastifyRequest) {
    const authorization = request.headers.authorization;
    const bearerToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : undefined;

    const accessToken = bearerToken ?? readCookie(request, ACCESS_COOKIE);

    if (!accessToken) {
      return null;
    }

    const session = state.accessSessions.get(accessToken);

    if (!session || session.expiresAt < Date.now()) {
      state.accessSessions.delete(accessToken);
      return null;
    }

    const user = state.users.get(session.userId);
    return user ?? null;
  }

  function requireUser(request: FastifyRequest, reply: FastifyReply) {
    const user = getSessionUser(request);

    if (!user) {
      reply.code(401);
      return null;
    }

    return user;
  }

  function serializeUser(user: UserRecord) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      walletBalance: (user.walletBalanceCents / 100).toFixed(2),
      role: user.role
    };
  }

  function serializeWallet(user: UserRecord) {
    const transactions = state.walletEntries
      .filter((entry: AppState["walletEntries"][number]) => entry.userId === user.id)
      .sort(
        (
          left: AppState["walletEntries"][number],
          right: AppState["walletEntries"][number]
        ) => right.createdAt.localeCompare(left.createdAt)
      )
      .map((entry: AppState["walletEntries"][number]) => ({
        id: entry.id,
        type: entry.type,
        amount: centsToMoney(entry.amountCents),
        createdAt: entry.createdAt,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId
      }));

    return {
      balance: centsToMoney(user.walletBalanceCents),
      transactions
    };
  }

  function listTournaments() {
    return Array.from(state.tournaments.values()).map(serializeTournamentSummary);
  }

  function serializeTournamentSummary(tournament: TournamentRecord) {
    return {
      id: tournament.id,
      name: tournament.name,
      entryFee: centsToMoney(tournament.entryFeeCents),
      maxPlayers: tournament.maxPlayers,
      joinedPlayers: tournament.participants.length,
      status: tournament.status
    };
  }

  function serializeTournamentDetail(tournament: TournamentRecord) {
    return {
      ...serializeTournamentSummary(tournament),
      prizePool: centsToMoney(tournament.prizePoolCents),
      bracketType: tournament.bracketType,
      bracketState: tournament.bracketState
    };
  }

  function signup(input: unknown, reply: FastifyReply) {
    const parsed = signupSchema.safeParse(input);

    if (!parsed.success) {
      return {
        statusCode: 400,
        body: {
          ok: false,
          message: parsed.error.issues[0]?.message ?? "Invalid signup payload"
        }
      };
    }

    const email = parsed.data.email;

    if (state.usersByEmail.has(email)) {
      return {
        statusCode: 409,
        body: {
          ok: false,
          message: "An account already exists for this email"
        }
      };
    }

    const userId = createId("user");
    const user: UserRecord = {
      id: userId,
      name: parsed.data.name,
      email,
      passwordHash: hashPassword(parsed.data.password),
      role: "player",
      walletBalanceCents: 2500,
      createdAt: new Date().toISOString()
    };

    state.users.set(userId, user);
    state.usersByEmail.set(email, userId);
    state.walletEntries.push({
      id: createId("wallet"),
      userId,
      type: "manual_adjustment",
      amountCents: 2500,
      createdAt: new Date().toISOString(),
      referenceType: "signup_bonus",
      referenceId: userId
    });

    createSessionTokens(reply, userId);

    return {
      statusCode: 201,
      body: {
        ok: true,
        user: serializeUser(user)
      }
    };
  }

  function login(input: unknown, reply: FastifyReply) {
    const parsed = loginSchema.safeParse(input);

    if (!parsed.success) {
      return {
        statusCode: 400,
        body: {
          ok: false,
          message: parsed.error.issues[0]?.message ?? "Invalid login payload"
        }
      };
    }

    const userId = state.usersByEmail.get(parsed.data.email);
    const user = userId ? state.users.get(userId) : undefined;

    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return {
        statusCode: 401,
        body: {
          ok: false,
          message: "Invalid email or password"
        }
      };
    }

    createSessionTokens(reply, user.id);

    return {
      statusCode: 200,
      body: {
        ok: true,
        user: serializeUser(user)
      }
    };
  }

  function refresh(request: FastifyRequest, input: unknown, reply: FastifyReply) {
    const parsed = refreshSchema.safeParse(input);

    if (!parsed.success) {
      return {
        statusCode: 400,
        body: {
          ok: false,
          message: "Invalid refresh request"
        }
      };
    }

    const refreshToken = parsed.data.refreshToken ?? readCookie(request, REFRESH_COOKIE);

    if (!refreshToken) {
      return {
        statusCode: 401,
        body: {
          ok: false,
          message: "Missing refresh token"
        }
      };
    }

    const session = state.refreshSessions.get(refreshToken);

    if (!session || session.expiresAt < Date.now()) {
      state.refreshSessions.delete(refreshToken);
      return {
        statusCode: 401,
        body: {
          ok: false,
          message: "Refresh token is invalid or expired"
        }
      };
    }

    const user = state.users.get(session.userId);

    if (!user) {
      return {
        statusCode: 404,
        body: {
          ok: false,
          message: "User not found"
        }
      };
    }

    state.refreshSessions.delete(refreshToken);
    createSessionTokens(reply, user.id);

    return {
      statusCode: 200,
      body: {
        ok: true,
        user: serializeUser(user)
      }
    };
  }

  function deductFromWallet(user: UserRecord, input: unknown) {
    const parsed = deductSchema.safeParse(input);

    if (!parsed.success) {
      return {
        statusCode: 400,
        body: {
          ok: false,
          message: parsed.error.issues[0]?.message ?? "Invalid wallet deduction payload"
        }
      };
    }

    let amountCents = 0;

    try {
      amountCents = moneyToCents(parsed.data.amount);
    } catch {
      return {
        statusCode: 400,
        body: {
          ok: false,
          message: "Amount must be a positive number"
        }
      };
    }

    if (user.walletBalanceCents < amountCents) {
      return {
        statusCode: 409,
        body: {
          ok: false,
          message: "Insufficient wallet balance"
        }
      };
    }

    user.walletBalanceCents -= amountCents;
    state.walletEntries.push({
      id: createId("wallet"),
      userId: user.id,
      type: "entry_fee_debit",
      amountCents,
      createdAt: new Date().toISOString(),
      referenceType: parsed.data.referenceType,
      referenceId: parsed.data.referenceId
    });

    return {
      statusCode: 200,
      body: {
        ok: true,
        wallet: serializeWallet(user)
      }
    };
  }

  function joinTournament(user: UserRecord, tournamentId: string) {
    const tournament = state.tournaments.get(tournamentId);

    if (!tournament) {
      return {
        statusCode: 404,
        body: {
          ok: false,
          message: "Tournament not found"
        }
      };
    }

    if (tournament.participants.includes(user.id)) {
      return {
        statusCode: 409,
        body: {
          ok: false,
          message: "User already joined this tournament"
        }
      };
    }

    if (tournament.status !== "open") {
      return {
        statusCode: 409,
        body: {
          ok: false,
          message: "Tournament is not open for new entries"
        }
      };
    }

    if (tournament.participants.length >= tournament.maxPlayers) {
      tournament.status = "full";
      return {
        statusCode: 409,
        body: {
          ok: false,
          message: "Tournament is already full"
        }
      };
    }

    if (tournament.entryFeeCents > 0) {
      if (user.walletBalanceCents < tournament.entryFeeCents) {
        return {
          statusCode: 409,
          body: {
            ok: false,
            message: "Insufficient wallet balance for tournament entry"
          }
        };
      }

      user.walletBalanceCents -= tournament.entryFeeCents;
      state.walletEntries.push({
        id: createId("wallet"),
        userId: user.id,
        type: "entry_fee_debit",
        amountCents: tournament.entryFeeCents,
        createdAt: new Date().toISOString(),
        referenceType: "tournament_entry",
        referenceId: tournament.id
      });
    }

    tournament.participants.push(user.id);

    if (tournament.participants.length >= tournament.maxPlayers) {
      tournament.status = "full";
    }

    return {
      statusCode: 200,
      body: {
        ok: true,
        tournament: serializeTournamentDetail(tournament),
        wallet: serializeWallet(user)
      }
    };
  }

  return {
    state,
    signup,
    login,
    refresh,
    requireUser,
    serializeUser,
    serializeWallet,
    listTournaments,
    serializeTournamentDetail,
    deductFromWallet,
    joinTournament
  };
}
