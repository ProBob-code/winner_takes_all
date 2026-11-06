import { describe, expect, it } from "vitest";
import { canManageAdmins, decideAdmin, effectiveRole, isOwnerEmail, ownerEmailFrom } from "../src/lib/admin-access";
import { chargedAmountFromPayload, dayRange } from "../src/lib/admin-stats";

const OWNER = "bob@example.com";

describe("admin access", () => {
  it("normalises the owner email and fails closed when unset", () => {
    expect(ownerEmailFrom("  Bob@Example.com ")).toBe(OWNER);
    expect(ownerEmailFrom("")).toBeNull();
    expect(ownerEmailFrom(undefined)).toBeNull();
    expect(isOwnerEmail("bob@example.com", null)).toBe(false);
  });

  it("lets the owner in only on a Google session", () => {
    const google = decideAdmin({ email: "BOB@example.com", via: "google", ownerEmail: OWNER, hasGrant: false });
    expect(google).toMatchObject({ isOwner: true, isAdmin: true, reason: "ok" });
    expect(canManageAdmins(google)).toBe(true);

    const password = decideAdmin({ email: OWNER, via: "password", ownerEmail: OWNER, hasGrant: false });
    expect(password).toMatchObject({ isOwner: true, isAdmin: false, reason: "needs-google" });
    expect(canManageAdmins(password)).toBe(false);
  });

  it("lets a granted member in on Google, but never lets them manage admins", () => {
    const d = decideAdmin({ email: "ravi@example.com", via: "google", ownerEmail: OWNER, hasGrant: true });
    expect(d.isAdmin).toBe(true);
    expect(canManageAdmins(d)).toBe(false);
  });

  it("turns a stored admin role without a grant back into a player", () => {
    const d = decideAdmin({ email: "old-admin@example.com", via: "google", ownerEmail: OWNER, hasGrant: false });
    expect(d).toMatchObject({ isAdmin: false, reason: "not-eligible" });
    expect(effectiveRole("admin", d)).toBe("player");
    expect(effectiveRole("player", d)).toBe("player");
  });

  it("has no owner at all when the secret is unset", () => {
    const d = decideAdmin({ email: OWNER, via: "google", ownerEmail: null, hasGrant: false });
    expect(d.isAdmin).toBe(false);
  });
});

describe("admin stats helpers", () => {
  it("lists every day in the range, inclusive", () => {
    const days = dayRange("2026-11-01T10:00:00.000Z", new Date("2026-11-05T09:00:00Z"));
    expect(days).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
  });

  it("reads a subscription charge out of a Razorpay webhook", () => {
    const payload = JSON.stringify({ payload: { payment: { entity: { amount: 99900 } } } });
    expect(chargedAmountFromPayload(payload)).toBe(99900);
    expect(chargedAmountFromPayload("not json")).toBe(0);
    expect(chargedAmountFromPayload(null)).toBe(0);
  });
});
