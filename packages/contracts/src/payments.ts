import type { ApiContract, Money } from "./common";

export type PaymentOrderRequest = {
  amount: Money;
  provider: "stripe" | "razorpay";
  purpose: "wallet_topup" | "tournament_entry";
  referenceId?: string;
  idempotencyKey: string;
};

export type PaymentRecord = {
  id: string;
  userId: string;
  status: "pending" | "processing" | "succeeded" | "failed" | "refunded";
  providerOrderId?: string;
  amount: Money;
};

export const paymentContracts: Record<string, ApiContract> = {
  createOrder: {
    method: "POST",
    path: "/payments/create-order",
    summary: "Create a provider payment order",
    auth: "user"
  },
  webhook: {
    method: "POST",
    path: "/payments/webhook",
    summary: "Verify payment provider events and settle balances",
    auth: "public"
  }
};
