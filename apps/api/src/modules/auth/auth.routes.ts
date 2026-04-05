import type { FastifyInstance } from "fastify";
import { authContracts } from "@wta/contracts/auth";
import type { AppContext } from "../../lib/app-context";

export function registerAuthRoutes(app: FastifyInstance, context: AppContext) {
  app.post("/auth/signup", async (request, reply) => {
    const result = context.signup(request.body, reply);
    return reply.code(result.statusCode).send({
      contract: authContracts.signup,
      ...result.body
    });
  });

  app.post("/auth/login", async (request, reply) => {
    const result = context.login(request.body, reply);
    return reply.code(result.statusCode).send({
      contract: authContracts.login,
      ...result.body
    });
  });

  app.post("/auth/refresh", async (request, reply) => {
    const result = context.refresh(request, request.body, reply);
    return reply.code(result.statusCode).send({
      contract: authContracts.refresh,
      ...result.body
    });
  });

  app.get("/user/profile", async (request, reply) => {
    const user = context.requireUser(request, reply);

    if (!user) {
      return reply.send({
        contract: authContracts.profile,
        ok: false,
        message: "Authentication required"
      });
    }

    return {
      contract: authContracts.profile,
      ok: true,
      user: context.serializeUser(user)
    };
  });
}
