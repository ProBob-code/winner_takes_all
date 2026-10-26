"use client";

/**
 * What a racket-sport scoreboard calls out: deuce, advantage, game point,
 * match point, tie-break; and for tennis the game score as it is said, 15,
 * 30, 40, AD. One piece, used by the scorer, the hosted arena, the quick
 * arena and the venue TV, so they all call the same thing at the same point.
 *
 * Match point is not guessed: the next point is played through the real rules
 * (lib/local-score.ts) for each side, and if it would end the match, it is
 * match point.
 */

import {
  applyLocalScore,
  isTiebreak,
  racketCall,
  tennisPointsLabel,
  type ScoreableMatch,
} from "@/lib/local-score";

type Live = ScoreableMatch & { status: string };

export function racketBanner(match: Live, sport: string, nameA: string, nameB: string): string | null {
  if (match.status !== "LIVE") return null;
  const nameOf = (side: "A" | "B") => (side === "A" ? nameA : nameB);
  for (const [side, teamId] of [["A", match.team_a_id], ["B", match.team_b_id]] as const) {
    if (applyLocalScore(match, teamId, "POINT", sport).ended) {
      const { call } = racketCall(match, sport);
      // Deuce cannot be match point; advantage can, and says so.
      return call === "ADVANTAGE" ? `ADVANTAGE ${nameOf(side)} · MATCH POINT` : `MATCH POINT ${nameOf(side)}`;
    }
  }
  const { call, side } = racketCall(match, sport);
  switch (call) {
    case "DEUCE":
      return "DEUCE";
    case "ADVANTAGE":
      return `ADVANTAGE ${nameOf(side!)}`;
    case "GAME_POINT":
      return sport === "TENNIS" ? `GAME POINT ${nameOf(side!)}` : `GAME POINT ${nameOf(side!)}`;
    case "TIEBREAK":
      return "TIE-BREAK";
    default:
      return null;
  }
}

/** For tennis, the points of the game in progress for one side, as said. */
export function tennisGameScore(match: ScoreableMatch, side: "A" | "B"): string {
  const mine = side === "A" ? match.balls_potted_a : match.balls_potted_b;
  const theirs = side === "A" ? match.balls_potted_b : match.balls_potted_a;
  return tennisPointsLabel(mine, theirs, isTiebreak(match));
}

/** The banner itself: gold on dark, loud enough to read across a court. */
export function RacketCallBanner({
  match,
  sport,
  nameA,
  nameB,
  size = "normal",
}: {
  match: Live;
  sport: string;
  nameA: string;
  nameB: string;
  size?: "normal" | "big";
}) {
  const text = racketBanner(match, sport, nameA, nameB);
  if (!text) return null;
  return (
    <div className={`racket-call ${size}`} role="status" aria-live="polite">
      {text}
    </div>
  );
}
