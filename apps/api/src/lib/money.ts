const CURRENCY = "INR" as const;

export function centsToMoney(cents: number) {
  return {
    amount: (cents / 100).toFixed(2),
    currency: CURRENCY,
  };
}

export function moneyToCents(amount: string): number {
  const normalized = Number(amount);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error("Amount must be a positive number");
  }

  return Math.round(normalized * 100);
}

/**
 * What the platform keeps for handling a withdrawal, as a percentage.
 *
 * The member sees this figure and the rupees it comes to before they confirm,
 * and again on the ledger entry afterwards. Only the platform-wide total of
 * these fees is admin-only.
 */
export const PAYOUT_FEE_PERCENT = 1;

/**
 * The fee on a withdrawal, in cents.
 *
 * Rounded up: a fee rounded down would leave the platform carrying fractions
 * of a paisa it cannot account for, and rounding up can never quote a member
 * less than they are actually charged.
 */
export function payoutFeeCents(amountCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 0;
  return Math.ceil((amountCents * PAYOUT_FEE_PERCENT) / 100);
}

/** What the member actually receives once the fee is taken. */
export function payoutNetCents(amountCents: number): number {
  return Math.max(0, amountCents - payoutFeeCents(amountCents));
}
