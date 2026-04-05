import type { ApiContract, Money } from "./common";

export type TournamentSummary = {
  id: string;
  name: string;
  entryFee: Money;
  maxPlayers: number;
  joinedPlayers: number;
  status: "draft" | "open" | "full" | "in_progress" | "completed" | "cancelled";
};

export type TournamentDetail = TournamentSummary & {
  prizePool: Money;
  bracketType: "single_elimination" | "double_elimination";
  bracketState?: unknown;
};

export const tournamentContracts: Record<string, ApiContract> = {
  create: {
    method: "POST",
    path: "/tournaments",
    summary: "Create a tournament",
    auth: "admin"
  },
  list: {
    method: "GET",
    path: "/tournaments",
    summary: "List tournaments",
    auth: "public"
  },
  detail: {
    method: "GET",
    path: "/tournaments/:id",
    summary: "Get tournament details",
    auth: "public"
  },
  join: {
    method: "POST",
    path: "/tournaments/:id/join",
    summary: "Join a tournament with wallet or payment-backed entry",
    auth: "user"
  }
};
