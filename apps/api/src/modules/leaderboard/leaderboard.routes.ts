import type { FastifyInstance } from "fastify";
import { leaderboardContracts } from "@wta/contracts/leaderboard";
import type { AppContext } from "../../lib/app-context";
import type { UserRecord } from "../../lib/store";

export function registerLeaderboardRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/leaderboard/global", async () => {
    const entries = Array.from(context.state.users.values())
      .map((user) => ({
        userId: user.id,
        displayName: user.name,
        wins: 0,
        losses: 0,
        earnings: {
          amount: "0.00",
          currency: "USD" as const
        }
      }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));

    return {
      contract: leaderboardContracts.global,
      ok: true,
      entries
    };
  });

  app.get("/leaderboard/tournaments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tournament = context.state.tournaments.get(id);

    if (!tournament) {
      return reply.code(404).send({
        contract: leaderboardContracts.tournament,
        ok: false,
        message: "Tournament not found"
      });
    }

    const entries = tournament.participants
      .map((participantId) => context.state.users.get(participantId))
      .filter((user): user is UserRecord => Boolean(user))
      .map((user) => ({
        userId: user.id,
        displayName: user.name,
        wins: 0,
        losses: 0,
        earnings: {
          amount: "0.00",
          currency: "USD" as const
        }
      }));

    return {
      contract: leaderboardContracts.tournament,
      ok: true,
      entries
    };
  });
}
