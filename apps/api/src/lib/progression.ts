/**
 * A player's level: the number that only goes up.
 *
 * See docs/progression-and-cosmetics-plan.md §5. A level is experience that
 * cannot be lost, and it is kept apart from the rank a player wins and loses
 * frame by frame so that neither can be bought back with the other.
 *
 * ── WHERE THE EXPERIENCE COMES FROM ──
 *
 * Lifetime coins, one XP per COIN_UNIT. Lifetime rather than balance because a
 * balance can one day be spent, and spending must never take a level away;
 * lifetime only ever rises. Every coin is already idempotent and capped by
 * lib/coins.ts, so a level inherits those protections instead of needing its
 * own: a frame replayed from an outbox cannot level anybody up twice.
 *
 * `collectionPoints` is the second source, for the items a player owns once
 * there are items to own. It is zero until then.
 *
 * ── THE CURVE ──
 *
 * Level n needs 25·(n−1)·n XP in total: 50 for level 2, 150 for 3, 500 for 5,
 * 2,250 for 10. Each level costs 50 more than the one before it, so early
 * levels arrive within a night or two — Supercell's stated reason for scrapping
 * King Level was that its rewards "felt distant" — and later ones take a season.
 *
 * ── THE NAMES ──
 *
 * The bands reuse the titles players already see beside their names, and each
 * band starts at the highest level whose threshold is at or below the coin
 * figure that title used to need. So moving titles from balance to level
 * leaves nobody with a lower title than they had the day before. Hall of Fame
 * is new, past Legend.
 *
 * Mirrored by apps/frontend/lib/progression.ts for the badge art; the
 * progression-mirror test holds the two to the same bands.
 */

import { COIN_UNIT } from "./coins";

/** XP for one COIN_UNIT of lifetime coins. */
export const XP_PER_COIN_UNIT = 1;

/** Each level costs this many XP more than the one before it. */
export const LEVEL_STEP_XP = 50;

export interface LevelBand {
  /** Stable id, used for the badge art and in tests. Never shown. */
  id: string;
  name: string;
  /** The first level in this band. */
  from: number;
}

export const LEVEL_BANDS: LevelBand[] = [
  { id: "new-in", name: "New in", from: 1 },
  { id: "regular", name: "Regular", from: 3 },
  { id: "contender", name: "Contender", from: 6 },
  { id: "shark", name: "Shark", from: 11 },
  { id: "hustler", name: "Hustler", from: 18 },
  { id: "legend", name: "Legend", from: 28 },
  { id: "hall-of-fame", name: "Hall of Fame", from: 50 },
];

/** Total XP needed to reach `level`. Level 1 needs none. */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return (LEVEL_STEP_XP / 2) * (n - 1) * n;
}

/** The level `xp` experience reaches. Never below 1. */
export function levelForXp(xp: number): number {
  const safe = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  // Solve 25·n·(n−1) ≤ xp for n, then correct for floating-point at the edges
  // so a player sitting exactly on a threshold is always the higher level.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * safe) / LEVEL_STEP_XP)) / 2));
  while (xpForLevel(level + 1) <= safe) level++;
  while (level > 1 && xpForLevel(level) > safe) level--;
  return level;
}

/** XP from lifetime coins. Partial units do not count yet; they will. */
export function xpFromCoins(lifetimeCoins: number): number {
  const coins = Math.max(0, Math.floor(Number(lifetimeCoins) || 0));
  return Math.floor(coins / COIN_UNIT) * XP_PER_COIN_UNIT;
}

export function bandFor(level: number): LevelBand {
  let band = LEVEL_BANDS[0];
  for (const b of LEVEL_BANDS) {
    if (level >= b.from) band = b;
  }
  return band;
}

export interface LevelInfo {
  level: number;
  xp: number;
  /** XP the current level started at. */
  levelXp: number;
  /** XP the next level starts at. */
  nextXp: number;
  toNext: number;
  band: { id: string; name: string };
  /**
   * Which step of its band this level is, from 1, and how many steps the band
   * has — the pips on the badge. `pips` is null for the last band, which is
   * open-ended.
   */
  pip: number;
  pips: number | null;
  /** The next band's name and the level it starts at, or null at the top. */
  nextBand: { name: string; level: number } | null;
}

export function levelInfo(lifetimeCoins: number, collectionPoints = 0): LevelInfo {
  const xp = xpFromCoins(lifetimeCoins) + Math.max(0, Math.floor(collectionPoints || 0));
  const level = levelForXp(xp);
  const band = bandFor(level);
  const index = LEVEL_BANDS.indexOf(band);
  const following = LEVEL_BANDS[index + 1];
  const levelXp = xpForLevel(level);
  const nextXp = xpForLevel(level + 1);

  return {
    level,
    xp,
    levelXp,
    nextXp,
    toNext: nextXp - xp,
    band: { id: band.id, name: band.name },
    pip: level - band.from + 1,
    pips: following ? following.from - band.from : null,
    nextBand: following ? { name: following.name, level: following.from } : null,
  };
}

/**
 * The lifetime coins at which a band starts, for the published title ladder in
 * lib/coins.ts. Kept here so the two cannot disagree; a test checks they don't.
 */
export function coinsForLevel(level: number): number {
  return (xpForLevel(level) / XP_PER_COIN_UNIT) * COIN_UNIT;
}
