import type { FastifyInstance } from "fastify";
import { matchContracts } from "@wta/contracts/matches";
import { notImplemented } from "../../lib/response";

export function registerMatchRoutes(app: FastifyInstance) {
  app.get("/matches/:id", async () => ({
    contract: matchContracts.getMatch,
    ...notImplemented("match detail")
  }));

  app.post("/matches/:id/start", async () => ({
    contract: matchContracts.startMatch,
    ...notImplemented("match start")
  }));

  app.post("/matches/:id/result", async () => ({
    contract: matchContracts.submitResult,
    ...notImplemented("match result submission")
  }));
}
