import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    ok: true,
    service: "api",
    timestamp: new Date().toISOString()
  }));
}
