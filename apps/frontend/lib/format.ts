type MoneyLike = {
  amount: string;
  currency: string;
};

const currencyMap: Record<string, string> = {
  USD: "$",
  INR: "₹"
};

export function formatMoney(money: MoneyLike) {
  const symbol = currencyMap[money.currency] ?? `${money.currency} `;
  return `${symbol}${money.amount}`;
}
