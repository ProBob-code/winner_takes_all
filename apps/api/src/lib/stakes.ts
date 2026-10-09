/**
 * Whether this deployment may take a stake, and what it may charge if not.
 *
 * India's Promotion and Regulation of Online Gaming Act 2025, in force since
 * 1 May 2026, prohibits games played for a stake whether they turn on skill or
 * on chance. These two functions are the whole boundary: everything that could
 * take money from a player passes through one of them.
 */

/**
 * Off unless explicitly turned on.
 *
 * Default-off rather than default-on because of the asymmetry: wrong in one
 * direction is an offence, wrong in the other is a tournament that costs
 * nothing to enter. Anything other than the exact string "true" — unset, "1",
 * "yes", empty, whitespace — reads as off.
 */
export function stakesEnabled(env: { STAKES_ENABLED?: string }): boolean {
  return (env.STAKES_ENABLED ?? "").trim().toLowerCase() === "true";
}

/**
 * The entry fee this deployment will actually accept, in cents.
 *
 * With stakes off every tournament is free, whatever the host asked for. Done
 * here rather than only in the Zod schema so an old client, a replayed request
 * or a future caller cannot reintroduce a paid entry.
 */
export function allowedEntryFeeCents(
  env: { STAKES_ENABLED?: string },
  requestedRupees: number,
): number {
  if (!stakesEnabled(env)) return 0;
  if (!Number.isFinite(requestedRupees) || requestedRupees <= 0) return 0;
  return Math.round(requestedRupees * 100);
}
