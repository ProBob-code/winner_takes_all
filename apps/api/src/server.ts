import Fastify from "fastify";
import { createAppContext } from "./lib/app-context";
import { createAppState, type AppState } from "./lib/store";
import { registerAdminRoutes } from "./modules/admin/admin.routes";
import { registerAuthRoutes } from "./modules/auth/auth.routes";
import { registerHealthRoutes } from "./modules/health/health.routes";
import { registerLeaderboardRoutes } from "./modules/leaderboard/leaderboard.routes";
import { registerMatchRoutes } from "./modules/matches/match.routes";
import { registerPaymentRoutes } from "./modules/payments/payment.routes";
import { registerTournamentRoutes } from "./modules/tournaments/tournament.routes";
import { registerWalletRoutes } from "./modules/wallet/wallet.routes";

export function buildApp(state: AppState = createAppState()) {
  const app = Fastify({
    logger: true
  });
  const context = createAppContext(state);

  registerHealthRoutes(app);
  registerAuthRoutes(app, context);
  registerTournamentRoutes(app, context);
  registerPaymentRoutes(app);
  registerWalletRoutes(app, context);
  registerLeaderboardRoutes(app, context);
  registerMatchRoutes(app);
  registerAdminRoutes(app);

  return app;
}
