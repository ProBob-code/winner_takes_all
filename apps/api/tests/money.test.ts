import { describe, expect, it } from "vitest";
import { centsToMoney, moneyToCents } from "../src/lib/money";

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
