/**
 * Season standings for a weekly series.
 *
 * Pure logic, kept out of the route file so it can be tested on its own the
 * way the tournament engine is.
 */

export interface SeasonTeamRow {
  tournament_id: string;
  user_id: string | null;
  name: string;
  matches_played: number;
  group_points: number;
  total_score: number;
}

export interface SeasonWeekProgress {
  tournament_id: string;
  /** Counts arrive from SQLite as numbers or strings depending on the driver. */
  total: number | string;
  finished: number | string;
}

export interface SeasonRow {
  userId: string | null;
  name: string;
  weeksPlayed: number;
  weeksWon: number;
  matchWins: number;
  totalScore: number;
}

/**
 * Every week a player entered, added together.
 *
 * A week is only credited as won once all of its fixtures are finished —
 * before that the leader is provisional, and crowning them would be wrong.
 * Identity is the account where there is one, so the same person stays a
 * single row across the season even if their display name changes; a team the
 * host typed in by hand has no account and falls back to its name.
 */
export function computeSeasonStandings(
  teams: SeasonTeamRow[],
  progress: SeasonWeekProgress[]
): SeasonRow[] {
  const finishedWeeks = new Set(
    progress
      .filter((p) => Number(p.total) > 0 && Number(p.finished) === Number(p.total))
      .map((p) => p.tournament_id)
  );

  const keyOf = (t: { user_id: string | null; name: string }) => t.user_id || "name:" + t.name;
  const rows = new Map<string, SeasonRow>();

  for (const t of teams) {
    const key = keyOf(t);
    const row = rows.get(key) || {
      userId: t.user_id || null,
      name: t.name,
      weeksPlayed: 0,
      weeksWon: 0,
      matchWins: 0,
      totalScore: 0,
    };
    row.weeksPlayed += 1;
    row.matchWins += Number(t.group_points) || 0;
    row.totalScore += Number(t.total_score) || 0;
    rows.set(key, row);
  }

  // One winner per finished week: the top of that week's own table.
  const byWeek = new Map<string, SeasonTeamRow[]>();
  for (const t of teams) {
    if (!finishedWeeks.has(t.tournament_id)) continue;
    const list = byWeek.get(t.tournament_id) || [];
    list.push(t);
    byWeek.set(t.tournament_id, list);
  }
  for (const list of byWeek.values()) {
    const winner = [...list].sort(
      (a, b) => b.group_points - a.group_points || b.total_score - a.total_score
    )[0];
    if (!winner) continue;
    const row = rows.get(keyOf(winner));
    if (row) row.weeksWon += 1;
  }

  // Winning weeks is the point of a season, so it outranks everything; match
  // wins and then raw score settle the rest.
  return [...rows.values()].sort(
    (a, b) => b.weeksWon - a.weeksWon || b.matchWins - a.matchWins || b.totalScore - a.totalScore
  );
}
