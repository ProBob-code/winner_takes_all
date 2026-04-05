import type { ApiContract, Money } from "./common";

export type LeaderboardEntry = {
  userId: string;
  displayName: string;
  wins: number;
  losses: number;
  earnings: Money;
};

export const leaderboardContracts: Record<string, ApiContract> = {
  global: {
    method: "GET",
    path: "/leaderboard/global",
    summary: "Fetch the global leaderboard",
    auth: "public"
  },
  tournament: {
    method: "GET",
    path: "/leaderboard/tournaments/:id",
    summary: "Fetch leaderboard data for a tournament",
    auth: "public"
  }
};
