import { describe, it, expect } from "vitest";
import {
  PLANS,
  findPlan,
  billingEnabled,
  planAmountPaise,
  mapProviderStatus,
  statusEntitles,
  TRIAL_DAYS,
} from "../src/lib/billing";

const KEYS = { RAZORPAY_KEY_ID: "rzp_test_abc", RAZORPAY_KEY_SECRET: "secret" };

describe("billingEnabled", () => {
  it("is off when the switch is unset, whatever the keys say", () => {
    expect(billingEnabled(KEYS)).toBe(false);
  });

  it("is off for anything but the exact string true", () => {
    for (const value of ["1", "yes", "on", "TRUE ", "", "  "]) {
      expect(billingEnabled({ ...KEYS, BILLING_ENABLED: value })).toBe(
        value.trim().toLowerCase() === "true"
      );
    }
  });

  it("is on for true, in any case, with surrounding space", () => {
    expect(billingEnabled({ ...KEYS, BILLING_ENABLED: " True " })).toBe(true);
  });

  it("stays off without credentials, so checkout cannot be offered unbacked", () => {
    expect(billingEnabled({ BILLING_ENABLED: "true" })).toBe(false);
    expect(billingEnabled({ BILLING_ENABLED: "true", RAZORPAY_KEY_ID: "rzp" })).toBe(false);
  });

  it("does not consult STAKES_ENABLED at all", () => {
    // A venue paying for software is not a player paying to enter a game. The
    // stakes switch must not be able to turn the lawful revenue line off.
    const env = { ...KEYS, BILLING_ENABLED: "true", STAKES_ENABLED: "false" } as any;
    expect(billingEnabled(env)).toBe(true);
  });
});

describe("plans", () => {
  it("has a plan for one venue, a year, and a chain", () => {
    expect(findPlan("venue_monthly")).not.toBeNull();
    expect(findPlan("venue_annual")).not.toBeNull();
    expect(findPlan("chain_monthly")).not.toBeNull();
    expect(findPlan("nonsense")).toBeNull();
  });

  it("prices the monthly venue at the figure the CFO review used", () => {
    // founder/cfo.md: 17 venues at this price reach the ₹25,000/month target.
    expect(findPlan("venue_monthly")!.rupees).toBe(1500);
  });

  it("gives the annual plan two months free against the monthly", () => {
    const monthly = findPlan("venue_monthly")!;
    const annual = findPlan("venue_annual")!;
    expect(annual.rupees).toBe(monthly.rupees * 10);
    expect(annual.intervalMonths).toBe(12);
  });

  it("charges a chain less per site than a single venue pays", () => {
    expect(findPlan("chain_monthly")!.rupees).toBeLessThan(findPlan("venue_monthly")!.rupees);
  });

  it("gives every plan a price, a name and something to show a buyer", () => {
    for (const plan of PLANS) {
      expect(plan.rupees).toBeGreaterThan(0);
      expect(plan.name.length).toBeGreaterThan(3);
      expect(plan.features.length).toBeGreaterThan(0);
    }
  });

  it("runs the trial for a full billing cycle of league nights", () => {
    // Phase 1's exit test is three venues paying AFTER a free month, so the
    // trial has to be long enough to contain the nights that decide it.
    expect(TRIAL_DAYS).toBeGreaterThanOrEqual(28);
  });
});

describe("planAmountPaise", () => {
  it("ignores the site count for a single-venue plan", () => {
    const plan = findPlan("venue_monthly")!;
    expect(planAmountPaise(plan, 1)).toBe(150_000);
    expect(planAmountPaise(plan, 9)).toBe(150_000);
  });

  it("multiplies a chain plan across its sites", () => {
    const plan = findPlan("chain_monthly")!;
    expect(planAmountPaise(plan, 5)).toBe(1200 * 100 * 5);
  });

  it("never bills a chain for fewer sites than the plan's minimum", () => {
    const plan = findPlan("chain_monthly")!;
    expect(planAmountPaise(plan, 1)).toBe(1200 * 100 * plan.minSites);
  });

  it("treats a nonsense site count as one site", () => {
    const plan = findPlan("venue_monthly")!;
    expect(planAmountPaise(plan, 0)).toBe(150_000);
    expect(planAmountPaise(plan, NaN)).toBe(150_000);
  });
});

describe("mapProviderStatus", () => {
  it("maps the states Razorpay actually sends", () => {
    expect(mapProviderStatus("active")).toBe("active");
    expect(mapProviderStatus("authenticated")).toBe("authenticated");
    expect(mapProviderStatus("cancelled")).toBe("cancelled");
    expect(mapProviderStatus("expired")).toBe("expired");
  });

  it("treats a retrying payment as past due rather than cancelled", () => {
    expect(mapProviderStatus("halted")).toBe("past_due");
    expect(mapProviderStatus("pending")).toBe("past_due");
  });

  it("passes an unrecognised status through rather than guessing", () => {
    expect(mapProviderStatus("something_new")).toBe("something_new");
    expect(mapProviderStatus("")).toBe("unknown");
  });
});

describe("statusEntitles", () => {
  it("keeps the scoreboard on through a failed card", () => {
    // An expired card is not a reason to shut a league night down mid-frame.
    expect(statusEntitles("past_due")).toBe(true);
  });

  it("entitles a trial and an authorised mandate", () => {
    expect(statusEntitles("trialing")).toBe(true);
    expect(statusEntitles("authenticated")).toBe(true);
    expect(statusEntitles("active")).toBe(true);
  });

  it("does not entitle anything that has ended", () => {
    for (const status of ["cancelled", "expired", "completed", "created", "paused", ""]) {
      expect(statusEntitles(status)).toBe(false);
    }
  });
});
