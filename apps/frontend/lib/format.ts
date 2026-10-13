type MoneyLike = {
  amount: string | number;
  currency: string;
} | string | number;

const currencyMap: Record<string, string> = {
  USD: "$",
  INR: "₹"
};

export function formatMoney(money: MoneyLike) {
  if (typeof money === "undefined" || money === null) return "₹0.00";
  
  if (typeof money === "object" && "amount" in money) {
    const symbol = currencyMap[money.currency] ?? `${money.currency} `;
    return `${symbol}${money.amount}`;
  }
  
  // Default to INR for raw numbers/strings
  const value = typeof money === "number" ? money.toFixed(2) : parseFloat(money as string).toFixed(2);
  return `₹${isNaN(parseFloat(value)) ? "0.00" : value}`;
}

/**
 * A coin figure, shortened for somewhere space is tight.
 *
 * WTA Coins are denominated in thousands, so a balance is five or six digits
 * from the first league night and a headline figure has to be read at a glance
 * across a room. 430000 becomes "430K" and 1500000 becomes "1.5M".
 *
 * Deliberately NOT `toLocaleString("en-IN")`, which groups in lakhs and would
 * render that first figure as "4,30,000" — correct for rupees, and the wrong
 * shape entirely for a game currency people think about as "430K".
 *
 * Use this for a balance, a chip or anything on the big screen. Use
 * `formatCoinsExact` wherever the number has to be checkable: a ledger whose
 * figures are rounded is a ledger nobody can audit.
 */
export function formatCoins(coins: number): string {
  if (!Number.isFinite(coins)) return "0";
  const n = Math.max(0, Math.floor(coins));

  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    // One decimal below ten million, none above: "1.5M" is worth reading,
    // "12.3M" is just noise at a glance.
    return `${m < 10 ? trimZero(m.toFixed(1)) : Math.round(m)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${k < 10 ? trimZero(k.toFixed(1)) : Math.round(k)}K`;
  }
  return String(n);
}

function trimZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}

/**
 * Every digit, grouped so a long number stays readable.
 *
 * For the ledger and anywhere a player is meant to check the arithmetic.
 * Grouped in threes rather than lakhs, to match how the shortened form reads.
 */
export function formatCoinsExact(coins: number): string {
  if (!Number.isFinite(coins)) return "0";
  return Math.max(0, Math.floor(coins)).toLocaleString("en-US");
}
