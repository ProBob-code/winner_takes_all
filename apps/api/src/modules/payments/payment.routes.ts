import type { FastifyInstance } from "fastify";
import { paymentContracts } from "@wta/contracts/payments";
import { notImplemented } from "../../lib/response";

export function registerPaymentRoutes(app: FastifyInstance) {
  app.post("/payments/create-order", async () => ({
    contract: paymentContracts.createOrder,
    ...notImplemented("payment order creation")
  }));

  app.post("/payments/webhook", async () => ({
    contract: paymentContracts.webhook,
    ...notImplemented("payment webhook verification")
  }));
}
