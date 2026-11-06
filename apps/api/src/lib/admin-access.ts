/**
 * Who may open the admin console.
 *
 * ── THE RULE ──
 *
 * One owner, named by the ADMIN_OWNER_EMAIL secret on the Worker (Bob's Google
 * account). Nobody else is an admin unless the owner granted it, and the grant
 * is a row in `admin_grants` that only the owner can write or delete.
 *
 * Every admin, the owner included, must have signed in **with Google** for the
 * session in hand. A password session from the owner's own account is not
 * enough: passwords can be phished or reset, a Google sign-in carries Google's
 * own checks (2-step verification, device prompts).
 *
 * ── WHY THE ROLE COLUMN IS NOT TRUSTED ON ITS OWN ──
 *
 * `users.role = 'admin'` used to be the whole test, and any admin could set it
 * on anyone. A stale 'admin' left over from that time, or one written straight
 * into the database, now counts for nothing without a grant row from the
 * owner: `effectiveRole` turns it back into 'player' for that request.
 *
 * Fails closed: with ADMIN_OWNER_EMAIL unset there is no owner, so nobody can
 * grant anything, and only grants already made stay valid.
 */

import type { SessionVia } from "./kv-sessions";

/** The owner's address, normalised, or null when the secret is unset. */
export function ownerEmailFrom(raw: string | undefined | null): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export function isOwnerEmail(email: string | null | undefined, ownerEmail: string | null): boolean {
  if (!ownerEmail || !email) return false;
  return email.trim().toLowerCase() === ownerEmail;
}

export interface AdminDecision {
  /** The account is the owner's, whatever the session. */
  isOwner: boolean;
  /** Owner, or holds a grant from the owner. */
  eligible: boolean;
  /** Eligible, and this session was signed in with Google. */
  isAdmin: boolean;
  /** Why not, when not. Shown on the console's locked screen. */
  reason: "ok" | "not-eligible" | "needs-google";
}

export function decideAdmin(args: {
  email: string;
  via: SessionVia | null;
  ownerEmail: string | null;
  hasGrant: boolean;
}): AdminDecision {
  const isOwner = isOwnerEmail(args.email, args.ownerEmail);
  const eligible = isOwner || args.hasGrant;
  if (!eligible) return { isOwner, eligible, isAdmin: false, reason: "not-eligible" };
  if (args.via !== "google") return { isOwner, eligible, isAdmin: false, reason: "needs-google" };
  return { isOwner, eligible, isAdmin: true, reason: "ok" };
}

/**
 * The role the rest of the API should see for this request.
 *
 * 'admin' only for an admin decided above; a stored 'admin' without that
 * becomes 'player'. Other roles pass through untouched.
 */
export function effectiveRole(storedRole: string, decision: AdminDecision): string {
  if (decision.isAdmin) return "admin";
  return storedRole === "admin" ? "player" : storedRole;
}

/** Whether `actor` may grant or take away admin. Only the owner, on Google. */
export function canManageAdmins(decision: AdminDecision): boolean {
  return decision.isOwner && decision.isAdmin;
}
