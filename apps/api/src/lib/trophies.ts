/**
 * Trophies: the number a win raises and a loss lowers.
 *
 * See docs/progression-and-cosmetics-plan.md §4. Modelled on Clash Royale's
 * trophies: everyone starts at 0, a win against an equal opponent is +30 and
 * a loss −30, and arenas give the climb names and floors. The Collection Level
 * (lib/progression.ts) is the other number, the one that never drops; the two
 * are kept apart so nothing a player buys can buy back a defeat.
 *
 * ── NOT A CURRENCY ──
 *
 * Trophies cannot be bought, sold, transferred or redeemed, and they never
 * change what anything pays in coins. A loss costs trophies and never coins,
 * which keeps lib/coins.ts property 3 ("coins are never wagered") exactly true.
 *
 * Everything here is pure, so the rules can be tested without a database; the
 * route in index.ts reads the current figures and writes what this returns.
 * Mirrored by apps/frontend/lib/trophies.ts for the arena names and badges.
 */

export type Sport = "8BALL" | "FOOTBALL" | "TENNIS" | "BADMINTON" | "PICKLEBALL" | "TABLE_TENNIS";

export interface TrophyTrack {
  id: string;
  label: string;
}

/**
 * Every ladder a player can climb. Overall is its own count, not a sum of the
 * others: a sum would reward playing more sports rather than winning.
 */
export const TROPHY_TRACKS: TrophyTrack[] = [
  { id: "overall", label: "Overall" },
  { id: "offline:8BALL", label: "Pool" },
  { id: "offline:FOOTBALL", label: "Football" },
  { id: "offline:TENNIS", label: "Tennis" },
  { id: "offline:BADMINTON", label: "Badminton" },
  { id: "offline:PICKLEBALL", label: "Pickleball" },
  { id: "offline:TABLE_TENNIS", label: "Table tennis" },
  { id: "online:8BALL", label: "Pool online" },
];

export const OVERALL = "overall";
export const offlineTrack = (sport: Sport) => `offline:${sport}`;
export const onlineTrack = (sport: Sport) => `online:${sport}`;

export function isTrack(id: string): boolean {
  return TROPHY_TRACKS.some((t) => t.id === id);
}

export interface Arena {
  id: string;
  name: string;
  /** The trophies this arena starts at, and the floor a loss cannot go below. */
  from: number;
}

/**
 * The trophy road. Places, as Clash Royale's arenas are, and named apart from
 * the level bands so "Legend" never means two things on one profile.
 */
export const ARENAS: Arena[] = [
  { id: "practice-table", name: "Practice Table", from: 0 },
  { id: "corner-pub", name: "Corner Pub", from: 300 },
  { id: "back-room", name: "Back Room", from: 600 },
  { id: "club-house", name: "Club House", from: 1000 },
  { id: "felt-hall", name: "Felt Hall", from: 1500 },
  { id: "neon-lounge", name: "Neon Lounge", from: 2000 },
  { id: "velvet-room", name: "Velvet Room", from: 3000 },
  { id: "grand-hall", name: "Grand Hall", from: 4000 },
  { id: "the-crown", name: "The Crown", from: 5000 },
];

export function arenaFor(trophies: number): Arena {
  let arena = ARENAS[0];
  for (const a of ARENAS) {
    if (trophies >= a.from) arena = a;
  }
  return arena;
}

/** Trophies for a game against an equal opponent. */
export const BASE_TROPHIES = 30;
/** Trophies of difference that move the award by one. */
export const TROPHIES_PER_SWING = 25;
/** The most the difference can move the award, either way. */
export const MAX_SWING = 10;

/** A walk-in with no account counts at this weight, against your own trophies. */
export const GUEST_WEIGHT = 0.5;
/** The most a player can gain against walk-ins in a day, per track. */
export const GUEST_DAILY_GAIN = 90;

/** Online games count towards Overall at this weight. */
export const ONLINE_OVERALL_WEIGHT = 0.5;
/** The most online play can gain in a day, per track. */
export const ONLINE_DAILY_GAIN = 120;
/** An online game with no result this long after it started is a loss. */
export const ONLINE_ABANDON_MINUTES = 30;

/**
 * What the browser AI counts as, by difficulty. Fixed rather than relative to
 * the player, so beating the easiest AI pays less and less as you climb, which
 * is the honest value of beating it.
 */
export const AI_TROPHIES: Record<number, number> = { 1: 300, 2: 1500, 3: 3000 };

export function aiTrophies(rating: number | undefined): number {
  const level = Math.min(Math.max(Math.floor(Number(rating) || 1), 1), 3);
  return AI_TROPHIES[level];
}

/**
 * The weight of the nth game today between the same two players (n from 0).
 * Full, then half, then nothing: blunts two friends trading wins all night.
 */
export function pairWeight(gamesAlreadyToday: number): number {
  if (gamesAlreadyToday <= 0) return 1;
  if (gamesAlreadyToday === 1) return 0.5;
  return 0;
}

/**
 * The trophies a result is worth before floors and caps.
 *
 * Beating someone with more trophies pays more, and losing to someone with
 * fewer costs more; between equals it is ±30. The swing is capped so no single
 * game is worth more than 40 or less than 20 at full weight.
 */
export function trophyDelta(args: {
  mine: number;
  theirs: number;
  won: boolean;
  weight?: number;
}): number {
  const weight = args.weight ?? 1;
  if (!(weight > 0)) return 0;
  const raw = Math.round((args.theirs - args.mine) / TROPHIES_PER_SWING);
  const swing = Math.max(-MAX_SWING, Math.min(MAX_SWING, raw));
  const full = args.won ? BASE_TROPHIES + swing : -(BASE_TROPHIES - swing);
  return Math.round(full * weight);
}

/**
 * Apply a change to a player's trophies.
 *
 * A loss in the first arena costs nothing, so a new player is not put off on
 * their first night. Past that, a loss can never take a player out of the
 * arena they have reached: the arena's start is a floor. Returns the trophies
 * after and the change that actually happened, which is what the ledger
 * records.
 */
export function applyTrophies(current: number, delta: number): { after: number; delta: number; floor: number } {
  const now = Math.max(0, Math.floor(current) || 0);
  const floor = arenaFor(now).from;
  if (delta >= 0) return { after: now + delta, delta, floor };
  if (floor === 0) return { after: now, delta: 0, floor };
  const after = Math.max(floor, now + delta);
  return { after, delta: after - now, floor };
}

/** A positive change trimmed to what a daily gain cap still allows. */
export function capGain(delta: number, gainedToday: number, cap: number): number {
  if (delta <= 0) return delta;
  return Math.max(0, Math.min(delta, cap - Math.max(0, gainedToday)));
}

/** What a player's standing on one track looks like, for the profile. */
export function trackSummary(row: { trophies: number; peak: number; games: number; wins: number; losses: number } | undefined) {
  const trophies = row?.trophies ?? 0;
  const arena = arenaFor(trophies);
  const next = ARENAS[ARENAS.indexOf(arena) + 1];
  return {
    trophies,
    peak: row?.peak ?? 0,
    games: row?.games ?? 0,
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
    arena: { id: arena.id, name: arena.name, from: arena.from },
    nextArena: next ? { name: next.name, at: next.from } : null,
  };
}
