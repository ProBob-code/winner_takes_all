/**
 * Positions on a table where players can be level.
 *
 * WHY THIS IS NOT JUST THE ARRAY INDEX
 * It was, and three players on one frame won and 100 points each came out as
 * gold, silver and bronze — decided by nothing but the order the database
 * happened to return them. The room can see the numbers are identical, so the
 * screen inventing a winner between them is worse than showing no medal at
 * all: it is the one thing a scoreboard must never do.
 *
 * So players who are exactly level share a position, the next position skips
 * the way it does in any league table (1, 1, 1, 4), and a shared place takes
 * no medal — a medal is awarded, and a tie has not awarded one yet.
 */

export interface Standing {
  matches_played: number;
  group_points: number;
  total_score: number;
}

export interface Placed {
  /** 1-based, shared by players who are exactly level. */
  position: number;
  /** True when at least one other player is on the same position. */
  shared: boolean;
  /** 1, 2 or 3 for an outright medal; null for a tie or anywhere below. */
  medal: 1 | 2 | 3 | null;
}

/** The order the engine ranks on: wins, then score, then fewest played. */
export function rankStandings<T extends Standing>(teams: readonly T[]): T[] {
  return [...teams].sort(
    (a, b) =>
      b.group_points - a.group_points ||
      b.total_score - a.total_score ||
      a.matches_played - b.matches_played
  );
}

/** Whether anything has reached the table at all. */
export function anythingCounted(teams: readonly Standing[]): boolean {
  return teams.some((t) => t.matches_played > 0 || t.group_points > 0);
}

function level(a: Standing, b: Standing): boolean {
  return (
    a.group_points === b.group_points &&
    a.total_score === b.total_score &&
    a.matches_played === b.matches_played
  );
}

/**
 * Place an already-ranked list.
 *
 * Nothing counted means nothing is placed: every row is numbered, nothing is
 * medalled, and nothing is called shared, because "joint first on zero" is a
 * statement about the sort order rather than about the night.
 */
export function placeStandings(ranked: readonly Standing[]): Placed[] {
  const counted = anythingCounted(ranked);

  let position = 0;
  return ranked.map((team, i) => {
    if (i === 0 || !level(team, ranked[i - 1])) position = i + 1;

    const shared =
      counted &&
      ((i > 0 && level(team, ranked[i - 1])) ||
        (i + 1 < ranked.length && level(team, ranked[i + 1])));

    const medal = counted && !shared && position <= 3 ? (position as 1 | 2 | 3) : null;

    return { position, shared, medal };
  });
}
