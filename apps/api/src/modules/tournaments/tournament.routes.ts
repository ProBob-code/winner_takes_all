import type { FastifyInstance } from "fastify";
import { tournamentContracts } from "@wta/contracts/tournaments";
import type { AppContext } from "../../lib/app-context";
import { notImplemented } from "../../lib/response";

export function registerTournamentRoutes(app: FastifyInstance, context: AppContext) {
  app.post("/tournaments", async () => ({
    contract: tournamentContracts.create,
    ...notImplemented("tournament creation")
  }));

  app.get("/tournaments", async () => ({
    contract: tournamentContracts.list,
    ok: true,
    tournaments: context.listTournaments()
  }));

  app.get("/tournaments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tournament = context.state.tournaments.get(id);

    if (!tournament) {
      return reply.code(404).send({
        contract: tournamentContracts.detail,
        ok: false,
        message: "Tournament not found"
      });
    }

    return {
      contract: tournamentContracts.detail,
      ok: true,
      tournament: context.serializeTournamentDetail(tournament)
    };
  });

  app.post("/tournaments/:id/join", async (request, reply) => {
    const user = context.requireUser(request, reply);

    if (!user) {
      return reply.send({
        contract: tournamentContracts.join,
        ok: false,
        message: "Authentication required"
      });
    }

    const { id } = request.params as { id: string };
    const result = context.joinTournament(user, id);

    return reply.code(result.statusCode).send({
      contract: tournamentContracts.join,
      ...result.body
    });
  });
}
