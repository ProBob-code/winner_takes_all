/**
 * Every sport WTA runs, for the screens: name, icon and how it scores.
 *
 * The rules themselves are the API's (lib/tournament-engine.ts) and their
 * on-device copy (lib/local-score.ts); this is what the pickers, labels and
 * scoring buttons need to say.
 */

import { RALLY_RULES, type LocalSport } from "./local-score";

export type ScoringKind = "pool" | "goals" | "rally";

export interface SportInfo {
  id: LocalSport;
  label: string;
  icon: string;
  kind: ScoringKind;
  /** What one tap of the main button is called. */
  unit: string;
  /** How a match is won, in one line, for a picker or the rules card. */
  summary: string;
}

const rally = (id: LocalSport, label: string, icon: string, extra = ""): SportInfo => {
  const r = RALLY_RULES[id];
  return {
    id,
    label,
    icon,
    kind: "rally",
    unit: "point",
    summary: `One game to ${r.target}, win by ${r.winBy}${r.cap ? `, capped at ${r.cap}` : ""}${extra}. Every rally is a point.`,
  };
};

export const SPORTS: SportInfo[] = [
  { id: "8BALL", label: "8-Ball", icon: "🎱", kind: "pool", unit: "ball", summary: "Seven balls then the black. A ball is 10, a foul costs 5." },
  { id: "FOOTBALL", label: "Football", icon: "⚽", kind: "goals", unit: "goal", summary: "Most goals when the clock runs out." },
  rally("TENNIS", "Tennis", "🎾", " (a match tie-break)"),
  rally("BADMINTON", "Badminton", "🏸"),
  rally("PICKLEBALL", "Pickleball", "🏓"),
  rally("TABLE_TENNIS", "Table Tennis", "🏓"),
];

export function sportInfo(id: string | null | undefined): SportInfo {
  return SPORTS.find((s) => s.id === id) ?? SPORTS[0];
}
