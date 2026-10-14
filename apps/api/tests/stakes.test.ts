import { describe, expect, it } from "vitest";
import { stakesEnabled, allowedEntryFeeCents, allowedSignupBonusCents } from "../src/lib/stakes";

describe("stakesEnabled", () => {
  it("is off when the flag is absent", () => {
    expect(stakesEnabled({})).toBe(false);
    expect(stakesEnabled({ STAKES_ENABLED: undefined })).toBe(false);
  });

  it("is off for everything that is not exactly true", () => {
    // A deployment must not start taking stakes because someone wrote "1".
    for (const v of ["", " ", "1", "yes", "on", "TRUE1", "false", "no", "null"]) {
      expect(stakesEnabled({ STAKES_ENABLED: v })).toBe(false);
    }
  });

  it("is on only for a deliberate true, however it is cased or padded", () => {
    for (const v of ["true", "TRUE", " True ", "\ttrue\n"]) {
      expect(stakesEnabled({ STAKES_ENABLED: v })).toBe(true);
    }
  });
});

describe("allowedEntryFeeCents", () => {
  it("forces every entry fee to zero while stakes are off", () => {
    expect(allowedEntryFeeCents({}, 100)).toBe(0);
    expect(allowedEntryFeeCents({ STAKES_ENABLED: "false" }, 5000)).toBe(0);
  });

  it("charges what was asked once stakes are deliberately on", () => {
    expect(allowedEntryFeeCents({ STAKES_ENABLED: "true" }, 100)).toBe(10000);
    expect(allowedEntryFeeCents({ STAKES_ENABLED: "true" }, 99.99)).toBe(9999);
  });

  it("never returns a negative or nonsense fee", () => {
    const on = { STAKES_ENABLED: "true" };
    expect(allowedEntryFeeCents(on, -50)).toBe(0);
    expect(allowedEntryFeeCents(on, 0)).toBe(0);
    expect(allowedEntryFeeCents(on, NaN)).toBe(0);
    expect(allowedEntryFeeCents(on, Infinity)).toBe(0);
  });
});

describe("allowedSignupBonusCents", () => {
  it("grants nothing while stakes are off", () => {
    // The bug this exists to stop: Phase 0 shut money in and out, but signup
    // went on minting ₹1,000 into every new wallet — money nobody deposited
    // and nobody could withdraw.
    expect(allowedSignupBonusCents({}, 1000)).toBe(0);
    expect(allowedSignupBonusCents({ STAKES_ENABLED: "false" }, 1000)).toBe(0);
  });

  it("grants nothing for anything but the exact string true", () => {
    for (const value of ["1", "yes", "on", "", "  "]) {
      expect(allowedSignupBonusCents({ STAKES_ENABLED: value }, 1000)).toBe(0);
    }
  });

  it("converts rupees to cents once stakes are deliberately on", () => {
    expect(allowedSignupBonusCents({ STAKES_ENABLED: "true" }, 1000)).toBe(100_000);
  });

  it("grants nothing for a nonsense or negative offer", () => {
    for (const offered of [0, -500, NaN, Infinity]) {
      expect(allowedSignupBonusCents({ STAKES_ENABLED: "true" }, offered)).toBe(0);
    }
  });

  it("defaults to nothing when no figure is offered at all", () => {
    expect(allowedSignupBonusCents({ STAKES_ENABLED: "true" })).toBe(0);
  });
});
