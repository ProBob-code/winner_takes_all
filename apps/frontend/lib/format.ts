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
