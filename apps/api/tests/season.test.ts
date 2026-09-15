import { describe, it, expect } from "vitest";
import { computeSeasonStandings, type SeasonTeamRow } from "../src/lib/season";

function team(
  tournamentId: string,
  userId: string | null,
  name: string,
  wins: number,
  score: number
): SeasonTeamRow {
  return {
    tournament_id: tournamentId,
    user_id: userId,
    name,
    matches_played: 2,
    group_points: wins,
    total_score: score,
  };
}

describe("computeSeasonStandings", () => {
  it("adds a player's weeks together and crowns the season leader", () => {
    const rows = computeSeasonStandings(
      [
        team("w1", "u_bob", "Bob", 2, 150),
        team("w1", "u_jj", "JJ", 1, 120),
        team("w2", "u_bob", "Bob", 2, 140),
        team("w2", "u_jj", "JJ", 0, 60),
      ],
      [
        { tournament_id: "w1", total: 3, finished: 3 },
        { tournament_id: "w2", total: 3, finished: 3 },
      ]
    );

    expect(rows[0].name).toBe("Bob");
    expect(rows[0].weeksWon).toBe(2);
    expect(rows[0].weeksPlayed).toBe(2);
    expect(rows[0].matchWins).toBe(4);
    expect(rows[0].totalScore).toBe(290);
    expect(rows[1].weeksWon).toBe(0);
  });

  it("does not crown a week that is still being played", () => {
    const rows = computeSeasonStandings(
      [team("w1", "u_bob", "Bob", 2, 150), team("w1", "u_jj", "JJ", 1, 120)],
      [{ tournament_id: "w1", total: 3, finished: 2 }]
    );

    expect(rows[0].weeksWon).toBe(0);
    expect(rows[0].weeksPlayed).toBe(1);
    expect(rows[0].matchWins).toBe(2);
  });

  it("does not crown a week that has no fixtures", () => {
    const rows = computeSeasonStandings(
      [team("w1", "u_bob", "Bob", 0, 0)],
      [{ tournament_id: "w1", total: 0, finished: 0 }]
    );

    expect(rows[0].weeksWon).toBe(0);
  });

  it("ranks weeks won above raw match wins", () => {
    const rows = computeSeasonStandings(
      [
        team("w1", "u_a", "A", 1, 50),
        team("w1", "u_b", "B", 0, 10),
        team("w2", "u_b", "B", 9, 900),
      ],
      [
        { tournament_id: "w1", total: 1, finished: 1 },
        { tournament_id: "w2", total: 1, finished: 1 },
      ]
    );

    // Both won one week, so match wins settles it.
    expect(rows[0].weeksWon).toBe(1);
    expect(rows[1].weeksWon).toBe(1);
    expect(rows[0].name).toBe("B");
  });

  it("keeps one row per account even when the display name changes", () => {
    const rows = computeSeasonStandings(
      [team("w1", "u_bob", "Bob", 1, 50), team("w2", "u_bob", "Bobby", 1, 50)],
      [{ tournament_id: "w1", total: 1, finished: 1 }]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].weeksPlayed).toBe(2);
  });

  it("falls back to the name for a team with no account behind it", () => {
    const rows = computeSeasonStandings(
      [team("w1", null, "Guest Team", 1, 40), team("w2", null, "Guest Team", 1, 40)],
      []
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBeNull();
    expect(rows[0].weeksPlayed).toBe(2);
  });

  it("copes with counts that arrive as strings", () => {
    const rows = computeSeasonStandings(
      [team("w1", "u_a", "A", 1, 10)],
      [{ tournament_id: "w1", total: "1", finished: "1" }]
    );

    expect(rows[0].weeksWon).toBe(1);
  });

  it("returns an empty table before anything has been played", () => {
    expect(computeSeasonStandings([], [])).toEqual([]);
  });
});
