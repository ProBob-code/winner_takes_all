import { describe, expect, it } from "vitest";
import { centsToMoney, moneyToCents, payoutFeeCents, payoutNetCents } from "../src/lib/money";

describe("centsToMoney", () => {
  it("formats whole rupees with two decimal places", () => {
    expect(centsToMoney(100000)).toEqual({ amount: "1000.00", currency: "INR" });
  });

  it("formats fractional cents correctly", () => {
    expect(centsToMoney(1)).toEqual({ amount: "0.01", currency: "INR" });
    expect(centsToMoney(99)).toEqual({ amount: "0.99", currency: "INR" });
  });

  it("formats zero", () => {
    expect(centsToMoney(0)).toEqual({ amount: "0.00", currency: "INR" });
  });
});

describe("moneyToCents", () => {
  it("converts a rupee string to integer cents", () => {
    expect(moneyToCents("10.50")).toBe(1050);
    expect(moneyToCents("1")).toBe(100);
  });

  it("rejects zero and negative amounts", () => {
    expect(() => moneyToCents("0")).toThrow();
    expect(() => moneyToCents("-5")).toThrow();
  });

  it("rejects non-numeric input", () => {
    expect(() => moneyToCents("abc")).toThrow();
    expect(() => moneyToCents("")).toThrow();
    expect(() => moneyToCents("NaN")).toThrow();
  });

  it("round-trips through centsToMoney", () => {
    const cents = moneyToCents("42.37");
    expect(centsToMoney(cents).amount).toBe("42.37");
  });
});

describe("payout fees", () => {
  it("takes 1% of the withdrawal", () => {
    expect(payoutFeeCents(100000)).toBe(1000); // ₹1000 -> ₹10
    expect(payoutNetCents(100000)).toBe(99000); // member receives ₹990
  });

  it("rounds the fee up, so the platform never carries a fraction it cannot account for", () => {
    // ₹150.50 -> 1% is 150.5 cents, which must not become 150.
    expect(payoutFeeCents(15050)).toBe(151);
    expect(payoutNetCents(15050)).toBe(14899);
  });

  it("never lets the fee exceed the amount", () => {
    expect(payoutNetCents(100)).toBe(99);
    expect(payoutFeeCents(1) + payoutNetCents(1)).toBe(1);
  });

  it("refuses to charge anything on a non-amount", () => {
    expect(payoutFeeCents(0)).toBe(0);
    expect(payoutFeeCents(-500)).toBe(0);
    expect(payoutFeeCents(10.5)).toBe(0);
  });

  it("fee plus net always reconstructs the amount", () => {
    for (const cents of [100, 999, 10000, 15050, 33333, 100000, 9999999]) {
      expect(payoutFeeCents(cents) + payoutNetCents(cents)).toBe(cents);
    }
  });
});
