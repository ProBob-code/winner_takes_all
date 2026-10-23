/**
 * How a level looks. The level itself is worked out by the API
 * (apps/api/src/lib/progression.ts) and arrives as a LevelInfo; this file only
 * holds what the badge needs to draw it.
 *
 * LEVEL_BAND_IDS must match the API's LEVEL_BANDS — the progression-mirror
 * test in the API suite fails if a band is added on one side only.
 */

export interface LevelInfo {
  level: number;
  xp: number;
  levelXp: number;
  nextXp: number;
  toNext: number;
  band: { id: string; name: string };
  pip: number;
  pips: number | null;
  nextBand: { name: string; level: number } | null;
}

export const LEVEL_BAND_IDS = [
  "new-in",
  "regular",
  "contender",
  "shark",
  "hustler",
  "legend",
  "hall-of-fame",
] as const;

export type LevelBandId = (typeof LEVEL_BAND_IDS)[number];

/** The badge for each band: metal, rim and the emblem drawn inside. */
export const BAND_STYLE: Record<LevelBandId, { fill: string; rim: string; emblem: "ring" | "star" | "fin" | "cues" | "crown"; glow?: boolean }> = {
  "new-in": { fill: "#b07a4a", rim: "#7c522d", emblem: "ring" },
  regular: { fill: "#c68b52", rim: "#8a5a2b", emblem: "star" },
  contender: { fill: "#c9ced6", rim: "#8a9099", emblem: "star" },
  shark: { fill: "#c9ced6", rim: "#7d848e", emblem: "fin" },
  hustler: { fill: "#f0c930", rim: "#a67c00", emblem: "cues" },
  legend: { fill: "#f5c518", rim: "#a50016", emblem: "crown" },
  "hall-of-fame": { fill: "#ffd700", rim: "#a50016", emblem: "crown", glow: true },
};

export function bandStyle(id: string) {
  return BAND_STYLE[(id as LevelBandId)] ?? BAND_STYLE["new-in"];
}

/** How far through the current level, 0–100, for a progress bar. */
export function levelProgress(info: LevelInfo): number {
  const span = info.nextXp - info.levelXp;
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((info.xp - info.levelXp) / span) * 100)));
}
