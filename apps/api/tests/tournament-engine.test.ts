import { describe, expect, it } from "vitest";
import {
  generateNextMatches,
  processScoreUpdate,
  checkTimer,
  rankTeams,
  generateKnockout,
  type EngineTeam,
  type EngineMatch,
  type MatchupRecord,
} from "../src/lib/tournament-engine";

function team(overrides: Partial<EngineTeam> = {}): EngineTeam {
  return {
    id: "t1",
    name: "Team",
    matches_played: 0,
    group_points: 0,
    total_score: 0,
    bye_assigned: false,
    ...overrides,
  };
}

function match(overrides: Partial<EngineMatch> = {}): EngineMatch {
  return {
    id: "m1",
    phase: "GROUP",
    team_a_id: "a",
    team_b_id: "b",
    status: "LIVE",
    sudden_death: false,
    active_team_id: null,
    balls_potted_a: 0,
    balls_potted_b: 0,
    black_potted_a: false,
    black_potted_b: false,
    start_time: 1000,
    duration: 600,
    score_team_a: 0,
    score_team_b: 0,
    winner_id: null,
    explanation: "",
    match_order: 0,
    ...overrides,
  };
}

describe("generateNextMatches", () => {
  it("pairs an even number of teams with no repeats", () => {
    const teams = [team({ id: "a" }), team({ id: "b" }), team({ id: "c" }), team({ id: "d" })];
    const { matches, byeTeamId } = generateNextMatches(teams, [], "GROUP", 2);
    expect(byeTeamId).toBeUndefined();
    expect(matches).toHaveLength(2);
    const paired = new Set(matches.flatMap((m) => [m.team_a_id, m.team_b_id]));
    expect(paired.size).toBe(4);
  });

  it("assigns a bye when the eligible team count is odd", () => {
    const teams = [team({ id: "a" }), team({ id: "b" }), team({ id: "c" })];
    const { matches, byeTeamId } = generateNextMatches(teams, [], "GROUP", 2);
    expect(byeTeamId).toBeDefined();
    expect(matches).toHaveLength(1);
  });

  it("does not re-pair teams that have already played each other", () => {
    const teams = [team({ id: "a" }), team({ id: "b" }), team({ id: "c" }), team({ id: "d" })];
    const pastMatchups: MatchupRecord[] = [{ team1_id: "a", team2_id: "b" }];
    const { matches } = generateNextMatches(teams, pastMatchups, "GROUP", 2);
    const hasRepeat = matches.some(
      (m) =>
        (m.team_a_id === "a" && m.team_b_id === "b") ||
        (m.team_a_id === "b" && m.team_b_id === "a")
    );
    expect(hasRepeat).toBe(false);
  });

  it("excludes teams that have reached the match limit", () => {
    const teams = [
      team({ id: "a", matches_played: 2 }),
      team({ id: "b" }),
      team({ id: "c" }),
    ];
    const { matches } = generateNextMatches(teams, [], "GROUP", 2);
    const involvedIds = new Set(matches.flatMap((m) => [m.team_a_id, m.team_b_id]));
    expect(involvedIds.has("a")).toBe(false);
  });

  it("returns no matches outside the GROUP phase", () => {
    const teams = [team({ id: "a" }), team({ id: "b" })];
    const { matches } = generateNextMatches(teams, [], "SEMI" as any, 2);
    expect(matches).toHaveLength(0);
  });
});

describe("processScoreUpdate", () => {
  it("awards 10 points for a potted ball", () => {
    const { updatedMatch, matchEnded } = processScoreUpdate(match(), "a", "BALL");
    expect(updatedMatch.score_team_a).toBe(10);
    expect(updatedMatch.balls_potted_a).toBe(1);
    expect(matchEnded).toBe(false);
  });

  it("awards 30 points for the black ball", () => {
    const { updatedMatch } = processScoreUpdate(match(), "b", "BLACK");
    expect(updatedMatch.score_team_b).toBe(30);
    expect(updatedMatch.black_potted_b).toBe(true);
  });

  it("ends the match when a team reaches 100", () => {
    const m = match({ score_team_a: 90 });
    const { updatedMatch, matchEnded } = processScoreUpdate(m, "a", "BLACK");
    expect(matchEnded).toBe(true);
    expect(updatedMatch.status).toBe("COMPLETED");
    expect(updatedMatch.winner_id).toBe("a");
    expect(updatedMatch.score_team_a).toBe(100); // capped, not 120
  });

  it("ignores score events on a non-LIVE match", () => {
    const m = match({ status: "COMPLETED" });
    const { updatedMatch, matchEnded } = processScoreUpdate(m, "a", "BALL");
    expect(matchEnded).toBe(false);
    expect(updatedMatch.score_team_a).toBe(0);
  });

  it("ends sudden death on the next score regardless of type", () => {
    const m = match({ sudden_death: true, score_team_a: 80, score_team_b: 80 });
    const { updatedMatch, matchEnded } = processScoreUpdate(m, "b", "MISTAKE");
    expect(matchEnded).toBe(true);
    expect(updatedMatch.winner_id).toBe("b");
  });
});

describe("checkTimer", () => {
  it("does nothing before time expires", () => {
    const m = match({ start_time: 1000, duration: 600 });
    const { matchEnded, suddenDeathStarted } = checkTimer(m, 1500);
    expect(matchEnded).toBe(false);
    expect(suddenDeathStarted).toBe(false);
  });

  it("ends the match for the leading team once time expires", () => {
    const m = match({ start_time: 1000, duration: 600, score_team_a: 40, score_team_b: 20 });
    const { updatedMatch, matchEnded } = checkTimer(m, 1601);
    expect(matchEnded).toBe(true);
    expect(updatedMatch.status).toBe("COMPLETED");
    expect(updatedMatch.winner_id).toBe("a");
  });

  it("enters sudden death on a tie at time expiry", () => {
    const m = match({ start_time: 1000, duration: 600, score_team_a: 30, score_team_b: 30 });
    const { updatedMatch, matchEnded, suddenDeathStarted } = checkTimer(m, 1601);
    expect(matchEnded).toBe(false);
    expect(suddenDeathStarted).toBe(true);
    expect(updatedMatch.sudden_death).toBe(true);
  });

  it("is a no-op for a match that has not started", () => {
    const m = match({ status: "CREATED", start_time: null });
    const { matchEnded } = checkTimer(m, 99999);
    expect(matchEnded).toBe(false);
  });
});

describe("rankTeams", () => {
  it("sorts by group points, then total score", () => {
    const teams = [
      team({ id: "low", group_points: 1, total_score: 100 }),
      team({ id: "high", group_points: 3, total_score: 10 }),
      team({ id: "tiebreak-winner", group_points: 1, total_score: 200 }),
    ];
    const ranked = rankTeams(teams);
    expect(ranked.map((t) => t.id)).toEqual(["high", "tiebreak-winner", "low"]);
  });

  it("does not mutate the input array", () => {
    const teams = [team({ id: "a", group_points: 1 }), team({ id: "b", group_points: 2 })];
    const original = [...teams];
    rankTeams(teams);
    expect(teams).toEqual(original);
  });
});

describe("generateKnockout", () => {
  it("creates two semi-finals (1v4, 2v3) for four teams", () => {
    const ranked = ["1", "2", "3", "4"].map((id) => team({ id }));
    const matches = generateKnockout(ranked);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ team_a_id: "1", team_b_id: "4", phase: "SEMI" });
    expect(matches[1]).toMatchObject({ team_a_id: "2", team_b_id: "3", phase: "SEMI" });
  });

  it("creates a direct final for two teams", () => {
    const ranked = ["1", "2"].map((id) => team({ id }));
    const matches = generateKnockout(ranked);
    expect(matches).toHaveLength(1);
    expect(matches[0].phase).toBe("FINAL");
  });

  it("returns nothing for a single team", () => {
    expect(generateKnockout([team()])).toHaveLength(0);
  });
});
