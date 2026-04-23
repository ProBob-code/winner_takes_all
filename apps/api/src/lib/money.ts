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
