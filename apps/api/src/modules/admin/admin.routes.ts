import type { FastifyInstance } from "fastify";
import { notImplemented } from "../../lib/response";

export function registerAdminRoutes(app: FastifyInstance) {
  app.get("/admin/overview", async () => ({
    ...notImplemented("admin overview")
  }));
}
