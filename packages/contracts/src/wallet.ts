import type { ApiContract, Money } from "./common";

export type WalletTransaction = {
  id: string;
  type: "deposit" | "entry_fee_debit" | "tournament_payout" | "refund" | "manual_adjustment";
  amount: Money;
  createdAt: string;
  referenceType: string;
  referenceId: string;
};

export type WalletSnapshot = {
  balance: Money;
  transactions: WalletTransaction[];
};

export const walletContracts: Record<string, ApiContract> = {
  getWallet: {
    method: "GET",
    path: "/wallet",
    summary: "Return wallet balance and transaction history",
    auth: "user"
  },
  deduct: {
    method: "POST",
    path: "/wallet/deduct",
    summary: "Deduct funds for an authorized operation",
    auth: "user"
  }
};
