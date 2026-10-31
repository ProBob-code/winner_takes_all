/**
 * Proof of Play: how sure we are that an offline game really happened.
 *
 * WHY
 * Trophies and WTA Coins are earned for games played in a room, scored on a
 * phone. Nothing stopped one person scoring a game that never happened and
 * collecting for it. No single check makes that impossible (Strava's GPS can
 * be faked too), so several independent ones are stacked, and what a game
 * pays scales with how many it passed:
 *
 *   1. Handshake. The scorer's phone shows a six-character code that changes
 *      every two minutes. Each player types it on their own phone, signed in,
 *      which puts two real accounts at the table while the game is on.
 *   2. Proximity (opt-in). Phones that share their location must be within a
 *      short walk of each other. Coordinates are kept only until the result
 *      locks, then deleted; only the near/far verdict is kept.
 *   3. Timeline. A game has to have taken as long as the sport takes.
 *   4. A venue. A night a venue runs has an accountable witness in the room,
 *      which stands in for location.
 *
 * NOTHING HERE HOLDS THE TABLE
 * The standings count every game the moment it ends, exactly as before. Proof
 * only decides what the game *pays*, and when: the result locks 15 minutes
 * after full time (sooner if the loser says it looks right), and coins and
 * trophies are paid then. Holding the table itself once stalled whole nights
 * (see frame-confirmation.ts); this is deliberately not that.
 */

export type ProofTier = "VERIFIED" | "PARTLY" | "PRACTICE";
export type ProofStatus = "OPEN" | "DISPUTED" | "PAID" | "VOID";

/** A code lives this long on the scorer's screen before it is replaced. */
export const CODE_TTL_SECONDS = 120;
/** How long after full time a player can still check in. */
export const CHECKIN_GRACE_SECONDS = 120;
/** The window the loser has to object, after which the result locks. */
export const LOCK_SECONDS = 15 * 60;
/** A dispute nobody rules on within a day voids the game. */
export const DISPUTE_VOID_SECONDS = 24 * 60 * 60;
/** Wrong codes a player may type in ten minutes before being made to wait. */
export const MAX_CODE_ATTEMPTS = 5;
/** Disputes a host ruled against a player in a week before they lose the button. */
export const MAX_REJECTED_DISPUTES = 3;

/**
 * No 0/O, 1/I/L: the code is read across a table and typed on a phone.
 * 31 characters, six of them: about 887 million codes.
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export function generateCode(randomBytes: (n: number) => Uint8Array): string {
  // Rejection sampling, so every character is equally likely.
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let out = "";
  while (out.length < CODE_LENGTH) {
    for (const b of randomBytes(CODE_LENGTH * 2)) {
      if (b >= limit) continue;
      out += CODE_ALPHABET[b % CODE_ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

/**
 * What a player typed, as a code: case, spaces and the dash ignored. Null if
 * it cannot be a code.
 */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.toUpperCase().replace(/[\s\-_.]/g, "");
  if (cleaned.length !== CODE_LENGTH) return null;
  for (const ch of cleaned) if (!CODE_ALPHABET.includes(ch)) return null;
  return cleaned;
}

/** "K7MQ2P" as "K7M-Q2P", for the screen. */
export function formatCode(code: string): string {
  return code.length === CODE_LENGTH ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

// ── Proximity ──

export interface Fix {
  lat: number;
  lng: number;
  /** The phone's own accuracy estimate, in metres. */
  acc: number;
}

/** Within this, two phones are at the same table (before accuracy is added). */
export const NEAR_METERS = 150;
/** Beyond this, two phones were not in the same room by any reading. */
export const FAR_METERS = 1000;
/** How much of the phones' own uncertainty is forgiven. */
const MAX_ACCURACY_ALLOWANCE = 350;

export function isValidFix(v: any): v is Fix {
  return (
    v &&
    Number.isFinite(v.lat) && Math.abs(v.lat) <= 90 &&
    Number.isFinite(v.lng) && Math.abs(v.lng) <= 180 &&
    Number.isFinite(v.acc) && v.acc >= 0
  );
}

export function distanceMeters(a: Fix, b: Fix): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Near, far, or cannot tell. Indoors a phone can be off by a few hundred
 * metres, so the phones' own uncertainty is forgiven up to a point; a reading
 * that is merely vague is "cannot tell", never "far".
 */
export function compareFixes(a: Fix, b: Fix): "near" | "far" | "unknown" {
  const d = distanceMeters(a, b);
  const allowance = Math.min(a.acc + b.acc, MAX_ACCURACY_ALLOWANCE);
  if (d <= NEAR_METERS + allowance) return "near";
  if (d > FAR_METERS + allowance) return "far";
  return "unknown";
}

/** Every pair near, any pair far, or neither. */
export function compareAll(fixes: Fix[]): "near" | "far" | "unknown" {
  if (fixes.length < 2) return "unknown";
  let allNear = true;
  for (let i = 0; i < fixes.length; i++) {
    for (let j = i + 1; j < fixes.length; j++) {
      const verdict = compareFixes(fixes[i], fixes[j]);
      if (verdict === "far") return "far";
      if (verdict !== "near") allNear = false;
    }
  }
  return allNear ? "near" : "unknown";
}

// ── Timeline ──

/**
 * The shortest a genuine game of each sport can take. Deliberately generous:
 * a false "too fast" costs an honest player their reward, so these catch only
 * games that could not have been played at all.
 */
export function minimumSeconds(sport: string, points: number): number {
  switch (sport) {
    case "8BALL":
      // A break-and-run is the fastest frame there is.
      return 90;
    case "FOOTBALL":
      return 5 * 60;
    case "TENNIS":
      // Every point is a serve and a rally; a set takes a while.
      return Math.max(5 * 60, points * 10);
    case "BADMINTON":
    case "PICKLEBALL":
    case "TABLE_TENNIS":
      return Math.max(2 * 60, points * 4);
    default:
      return 60;
  }
}

// ── The verdict ──

export interface ProofSide {
  teamId: string;
  /** The account behind the side, if it has one. A walk-in has none. */
  userId: string | null;
  /** Typed the code (or is the scorer, signed in as that player). */
  checkedIn: boolean;
  fix: Fix | null;
}

export interface ProofInput {
  sport: string;
  sides: [ProofSide, ProofSide];
  /** The scorer's phone, when it shared its location. */
  scorerFix: Fix | null;
  /** A venue runs the night: a witness in the room. */
  venueNight: boolean;
  /** Seconds from the start of the game to full time. Null if unknown. */
  durationSeconds: number | null;
  /** Points scored, for the rally sports' timeline. */
  points: number;
}

export type ProofReason =
  | "walk_in"
  | "not_checked_in"
  | "same_account"
  | "too_fast"
  | "far_apart"
  | "near"
  | "venue"
  | "no_location";

export interface ProofVerdict {
  tier: ProofTier;
  reasons: ProofReason[];
}

export function assessProof(input: ProofInput): ProofVerdict {
  const [a, b] = input.sides;

  // Two real accounts, or it is practice. A walk-in cannot check in, and a
  // game against nobody verifiable proves nothing.
  if (!a.userId || !b.userId) return { tier: "PRACTICE", reasons: ["walk_in"] };
  if (a.userId === b.userId) return { tier: "PRACTICE", reasons: ["same_account"] };
  if (!a.checkedIn || !b.checkedIn) return { tier: "PRACTICE", reasons: ["not_checked_in"] };

  if (
    input.durationSeconds !== null &&
    input.durationSeconds < minimumSeconds(input.sport, input.points)
  ) {
    return { tier: "PRACTICE", reasons: ["too_fast"] };
  }

  const fixes = [a.fix, b.fix, input.scorerFix].filter((f): f is Fix => !!f);
  const where = compareAll(fixes);
  // Phones a kilometre apart were not playing each other.
  if (where === "far") return { tier: "PRACTICE", reasons: ["far_apart"] };

  if (input.venueNight) return { tier: "VERIFIED", reasons: ["venue"] };
  // Both players' own phones must be in it: the scorer's alone says nothing
  // about where the other player was.
  if (where === "near" && a.fix && b.fix) return { tier: "VERIFIED", reasons: ["near"] };

  return { tier: "PARTLY", reasons: ["no_location"] };
}

// ── What each tier pays ──

/** Trophies move by this much of the usual swing. */
export function trophyWeight(tier: ProofTier): number {
  return tier === "VERIFIED" ? 1 : tier === "PARTLY" ? 0.5 : 0;
}

/**
 * Which of a game's coin awards a tier keeps. Verified keeps everything.
 * Partly keeps the play coins and loses the win bonuses. Practice keeps only
 * the small amount for playing a frame.
 */
export function keepsCoinAward(tier: ProofTier, reason: string): boolean {
  if (tier === "VERIFIED") return true;
  if (tier === "PARTLY") return reason === "FRAME_PLAYED" || reason === "NIGHT_PLAYED" || reason === "STREAK";
  return reason === "FRAME_PLAYED";
}

/**
 * What share of the night-win coins the champion is paid, from the tiers of
 * the games they played that night. Most of them verified: all of it. Most
 * at least partly: half. Otherwise nothing, because a night of unproven games
 * is exactly what this is here to stop paying out for.
 */
export function nightWinShare(tiers: ProofTier[]): number {
  if (tiers.length === 0) return 1; // Games from before Proof of Play.
  const verified = tiers.filter((t) => t === "VERIFIED").length;
  const partly = tiers.filter((t) => t === "PARTLY").length;
  if (verified * 2 >= tiers.length) return 1;
  if ((verified + partly) * 2 >= tiers.length) return 0.5;
  return 0;
}

// ── Disputes ──

/**
 * Whose objection counts: the loser's. The winner has nothing to object to,
 * and asking only one side keeps it to one tap. A draw: either side.
 */
export function disputingTeams(teamA: string, teamB: string, winnerId: string | null): string[] {
  if (!winnerId) return [teamA, teamB];
  return [winnerId === teamA ? teamB : teamA];
}
