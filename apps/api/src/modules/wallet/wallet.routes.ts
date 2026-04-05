import type { FastifyInstance } from "fastify";
import { walletContracts } from "@wta/contracts/wallet";
import type { AppContext } from "../../lib/app-context";

export function registerWalletRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/wallet", async (request, reply) => {
    const user = context.requireUser(request, reply);

    if (!user) {
      return reply.send({
        contract: walletContracts.getWallet,
        ok: false,
        message: "Authentication required"
      });
    }

    return {
      contract: walletContracts.getWallet,
      ok: true,
      wallet: context.serializeWallet(user)
    };
  });

  app.post("/wallet/deduct", async (request, reply) => {
    const user = context.requireUser(request, reply);

    if (!user) {
      return reply.send({
        contract: walletContracts.deduct,
        ok: false,
        message: "Authentication required"
      });
    }

    const result = context.deductFromWallet(user, request.body);
    return reply.code(result.statusCode).send({
      contract: walletContracts.deduct,
      ...result.body
    });
  });
}
