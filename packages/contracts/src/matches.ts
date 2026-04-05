import type { ApiContract } from "./common";

export type MatchSummary = {
  id: string;
  tournamentId: string;
  round: number;
  status: "pending" | "ready" | "live" | "completed" | "cancelled" | "disputed";
  player1Id?: string;
  player2Id?: string;
  winnerId?: string;
  roomCode?: string;
};

export const matchContracts: Record<string, ApiContract> = {
  getMatch: {
    method: "GET",
    path: "/matches/:id",
    summary: "Get match details",
    auth: "user"
  },
  startMatch: {
    method: "POST",
    path: "/matches/:id/start",
    summary: "Start a match and issue room access",
    auth: "user"
  },
  submitResult: {
    method: "POST",
    path: "/matches/:id/result",
    summary: "Submit or confirm a match result",
    auth: "user"
  }
};
