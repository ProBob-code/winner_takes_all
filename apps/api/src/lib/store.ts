import { createId } from "./crypto";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "player" | "admin";
  walletBalanceCents: number;
  createdAt: string;
};

export type WalletEntryRecord = {
  id: string;
  userId: string;
  type:
    | "deposit"
    | "entry_fee_debit"
    | "tournament_payout"
    | "refund"
    | "manual_adjustment";
  amountCents: number;
  createdAt: string;
  referenceType: string;
  referenceId: string;
};

export type TournamentRecord = {
  id: string;
  name: string;
  entryFeeCents: number;
  prizePoolCents: number;
  maxPlayers: number;
  status: "draft" | "open" | "full" | "in_progress" | "completed" | "cancelled";
  bracketType: "single_elimination" | "double_elimination";
  bracketState?: {
    rounds: Array<{
      name: string;
      matches: number;
    }>;
  };
  participants: string[];
};

type SessionRecord = {
  token: string;
  userId: string;
  expiresAt: number;
};

export type AppState = {
  users: Map<string, UserRecord>;
  usersByEmail: Map<string, string>;
  walletEntries: WalletEntryRecord[];
  tournaments: Map<string, TournamentRecord>;
  accessSessions: Map<string, SessionRecord>;
  refreshSessions: Map<string, SessionRecord>;
};

function seedTournaments() {
  const fridayId = createId("tournament");
  const sundayId = createId("tournament");

  return new Map<string, TournamentRecord>([
    [
      fridayId,
      {
        id: fridayId,
        name: "Friday Knockout",
        entryFeeCents: 1000,
        prizePoolCents: 8000,
        maxPlayers: 8,
        status: "open",
        bracketType: "single_elimination",
        bracketState: {
          rounds: [
            { name: "Quarterfinals", matches: 4 },
            { name: "Semifinals", matches: 2 },
            { name: "Final", matches: 1 }
          ]
        },
        participants: []
      }
    ],
    [
      sundayId,
      {
        id: sundayId,
        name: "Sunday Finals Qualifier",
        entryFeeCents: 0,
        prizePoolCents: 2500,
        maxPlayers: 16,
        status: "open",
        bracketType: "single_elimination",
        bracketState: {
          rounds: [
            { name: "Round of 16", matches: 8 },
            { name: "Quarterfinals", matches: 4 },
            { name: "Semifinals", matches: 2 },
            { name: "Final", matches: 1 }
          ]
        },
        participants: []
      }
    ]
  ]);
}

export function createAppState(): AppState {
  return {
    users: new Map(),
    usersByEmail: new Map(),
    walletEntries: [],
    tournaments: seedTournaments(),
    accessSessions: new Map(),
    refreshSessions: new Map()
  };
}
