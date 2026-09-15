import { describe, expect, it } from "vitest";
import {
  generateNextMatches,
  processScoreUpdate,
  checkTimer,
  rankTeams,
  generateKnockout,
  planAdvance,
  resetMatch,
  resultDeltas,
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
    fouls_a: 0,
    fouls_b: 0,
    team_a_house: "SOLID",
    team_b_house: "STRIPES",
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

describe("processScoreUpdate — Quick Tournament 8-ball rules", () => {
  it("awards 10 points for a potted ball", () => {
    const { updatedMatch, matchEnded } = processScoreUpdate(match(), "a", "BALL");
    expect(updatedMatch.score_team_a).toBe(10);
    expect(updatedMatch.balls_potted_a).toBe(1);
    expect(matchEnded).toBe(false);
  });

  it("stops counting balls at seven", () => {
    const m = match({ balls_potted_a: 7, score_team_a: 70 });
    const { updatedMatch } = processScoreUpdate(m, "a", "BALL");
    expect(updatedMatch.balls_potted_a).toBe(7);
    expect(updatedMatch.score_team_a).toBe(70);
  });

  it("wins the match with the black after all seven balls", () => {
    const m = match({ balls_potted_a: 7, score_team_a: 70, score_team_b: 40 });
    const { updatedMatch, matchEnded } = processScoreUpdate(m, "a", "BLACK");
    expect(matchEnded).toBe(true);
    expect(updatedMatch.status).toBe("COMPLETED");
    expect(updatedMatch.winner_id).toBe("a");
    expect(updatedMatch.score_team_a).toBe(100);
    expect(updatedMatch.black_potted_a).toBe(true);
  });

  it("loses the match with the black before the seven balls are down", () => {
    const m = match({ balls_potted_b: 3, score_team_b: 30, score_team_a: 20 });
    const { updatedMatch, matchEnded } = processScoreUpdate(m, "b", "BLACK");
    expect(matchEnded).toBe(true);
    expect(updatedMatch.winner_id).toBe("a");
    expect(updatedMatch.score_team_a).toBe(100);
    expect(updatedMatch.score_team_b).toBe(30);
  });

  it("ignores score events on a non-LIVE match", () => {
    const m = match({ status: "COMPLETED" });
    const { updatedMatch, matchEnded } = processScoreUpdate(m, "a", "BALL");
    expect(matchEnded).toBe(false);
    expect(updatedMatch.score_team_a).toBe(0);
  });

  it("does not mutate the match it was given", () => {
    const m = match();
    processScoreUpdate(m, "a", "BALL");
    expect(m.score_team_a).toBe(0);
  });
});

describe("processScoreUpdate — fouls and corrections", () => {
  it("takes 5 from the side that fouled and leaves the opponent alone", () => {
    const m = match({ score_team_a: 60, score_team_b: 50 });
    const { updatedMatch, matchEnded } = processScoreUpdate(m, "b", "FOUL");
    expect(updatedMatch.fouls_b).toBe(1);
    expect(updatedMatch.score_team_b).toBe(45);
    expect(updatedMatch.score_team_a).toBe(60);
    expect(matchEnded).toBe(false);
  });

  it("lets a foul take a score below zero, as Quick Tournament does", () => {
    const { updatedMatch } = processScoreUpdate(match(), "a", "FOUL");
    expect(updatedMatch.fouls_a).toBe(1);
    expect(updatedMatch.score_team_a).toBe(-5);
  });

  it("gives back the 5 when a foul is taken back", () => {
    const m = match({ fouls_a: 1, score_team_a: 15 });
    const { updatedMatch } = processScoreUpdate(m, "a", "REMOVE_FOUL");
    expect(updatedMatch.fouls_a).toBe(0);
    expect(updatedMatch.score_team_a).toBe(20);
  });

  it("ignores an undo when there is nothing to undo", () => {
    const { updatedMatch } = processScoreUpdate(match(), "a", "REMOVE_FOUL");
    expect(updatedMatch.fouls_a).toBe(0);
    expect(updatedMatch.score_team_a).toBe(0);
  });

  it("takes back a potted ball", () => {
    const m = match({ balls_potted_b: 2, score_team_b: 20 });
    const { updatedMatch } = processScoreUpdate(m, "b", "REMOVE_BALL");
    expect(updatedMatch.balls_potted_b).toBe(1);
    expect(updatedMatch.score_team_b).toBe(10);
  });

  it("takes back a ball that was never potted as a no-op", () => {
    const { updatedMatch } = processScoreUpdate(match(), "b", "REMOVE_BALL");
    expect(updatedMatch.balls_potted_b).toBe(0);
    expect(updatedMatch.score_team_b).toBe(0);
  });

  it("does not let a correction decide a sudden-death match", () => {
    const m = match({ sudden_death: true, fouls_a: 1, score_team_a: 25, score_team_b: 30 });
    const { updatedMatch, matchEnded } = processScoreUpdate(m, "a", "REMOVE_FOUL");
    expect(matchEnded).toBe(false);
    expect(updatedMatch.winner_id).toBeNull();
    expect(updatedMatch.score_team_a).toBe(30);
  });
});

describe("processScoreUpdate — sudden death", () => {
  const level = { phase: "SEMI" as const, sudden_death: true, score_team_a: 40, score_team_b: 40 };

  it("gives the match to whoever scores next", () => {
    const { updatedMatch, matchEnded } = processScoreUpdate(match(level), "b", "BALL");
    expect(matchEnded).toBe(true);
    expect(updatedMatch.winner_id).toBe("b");
  });

  it("gives the match to the opponent of whoever fouls next", () => {
    const { updatedMatch, matchEnded } = processScoreUpdate(match(level), "a", "FOUL");
    expect(matchEnded).toBe(true);
    expect(updatedMatch.winner_id).toBe("b");
  });

  it("still honours the legacy MISTAKE event", () => {
    const { updatedMatch, matchEnded } = processScoreUpdate(match(level), "b", "MISTAKE");
    expect(matchEnded).toBe(true);
    expect(updatedMatch.winner_id).toBe("b");
  });
});

describe("processScoreUpdate — football", () => {
  it("counts a goal and never ends the match early", () => {
    const { updatedMatch, matchEnded } = processScoreUpdate(match({ score_team_a: 9 }), "a", "GOAL");
    expect(updatedMatch.score_team_a).toBe(10);
    expect(matchEnded).toBe(false);
  });

  it("takes back a goal, but not below zero", () => {
    expect(processScoreUpdate(match({ score_team_b: 2 }), "b", "REMOVE_GOAL").updatedMatch.score_team_b).toBe(1);
    expect(processScoreUpdate(match(), "b", "REMOVE_GOAL").updatedMatch.score_team_b).toBe(0);
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

  it("draws a level group match at time expiry", () => {
    const m = match({ start_time: 1000, duration: 600, score_team_a: 30, score_team_b: 30 });
    const { updatedMatch, matchEnded, suddenDeathStarted } = checkTimer(m, 1601);
    expect(matchEnded).toBe(true);
    expect(suddenDeathStarted).toBe(false);
    expect(updatedMatch.status).toBe("COMPLETED");
    expect(updatedMatch.winner_id).toBeNull();
  });

  it("sends a level knockout match to sudden death", () => {
    const m = match({ phase: "FINAL", start_time: 1000, duration: 600, score_team_a: 30, score_team_b: 30 });
    const { updatedMatch, matchEnded, suddenDeathStarted } = checkTimer(m, 1601);
    expect(matchEnded).toBe(false);
    expect(suddenDeathStarted).toBe(true);
    expect(updatedMatch.sudden_death).toBe(true);
  });

  it("leaves a match already in sudden death to be decided by a score", () => {
    const m = match({ phase: "SEMI", sudden_death: true, start_time: 1000, duration: 600, score_team_a: 30, score_team_b: 30 });
    const { matchEnded, suddenDeathStarted } = checkTimer(m, 1700);
    expect(matchEnded).toBe(false);
    expect(suddenDeathStarted).toBe(false);
  });

  it("is a no-op for a match that has not started", () => {
    const m = match({ status: "CREATED", start_time: null });
    const { matchEnded } = checkTimer(m, 99999);
    expect(matchEnded).toBe(false);
  });
});

describe("resetMatch", () => {
  it("clears the scoring and restarts the clock", () => {
    const m = match({
      score_team_a: 60, score_team_b: -5, balls_potted_a: 6, fouls_b: 1,
      black_potted_b: true, sudden_death: true, active_team_id: "a", start_time: 1000,
    });
    const reset = resetMatch(m, 5000);
    expect(reset).toMatchObject({
      score_team_a: 0, score_team_b: 0, balls_potted_a: 0, fouls_b: 0,
      black_potted_b: false, sudden_death: false, active_team_id: null, start_time: 5000,
      status: "LIVE",
    });
  });
});

describe("resultDeltas", () => {
  it("credits the winner with a win and both sides with their score", () => {
    const m = match({ status: "COMPLETED", winner_id: "a", score_team_a: 100, score_team_b: 35 });
    expect(resultDeltas(m, "8BALL")).toEqual([
      { teamId: "a", played: 1, wins: 1, score: 100 },
      { teamId: "b", played: 1, wins: 0, score: 35 },
    ]);
  });

  it("adds 50 to each side for a drawn 8-ball match", () => {
    const m = match({ status: "COMPLETED", winner_id: null, score_team_a: 30, score_team_b: 30 });
    expect(resultDeltas(m, "8BALL").map((d) => d.score)).toEqual([80, 80]);
  });

  it("adds no bonus to a drawn football match", () => {
    const m = match({ status: "COMPLETED", winner_id: null, score_team_a: 1, score_team_b: 1 });
    expect(resultDeltas(m, "FOOTBALL").map((d) => d.score)).toEqual([1, 1]);
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

describe("planAdvance", () => {
  const four = [
    team({ id: "1", group_points: 3 }),
    team({ id: "2", group_points: 2 }),
    team({ id: "3", group_points: 1 }),
    team({ id: "4", group_points: 0 }),
  ];
  const played = (overrides: Partial<EngineMatch>) => match({ status: "COMPLETED", ...overrides });

  it("refuses while a match is still queued or live", () => {
    const result = planAdvance(four, [played({ id: "g1" }), match({ id: "g2", status: "CREATED" })]);
    expect(result).toHaveProperty("error");
  });

  it("draws semi-finals from the group standings", () => {
    const result = planAdvance(four, [played({ id: "g1" })]);
    expect("matches" in result && result.matches.map((m) => [m.phase, m.team_a_id, m.team_b_id])).toEqual([
      ["SEMI", "1", "4"],
      ["SEMI", "2", "3"],
    ]);
  });

  it("puts the two semi-final winners into the final", () => {
    const result = planAdvance(four, [
      played({ id: "s1", phase: "SEMI", winner_id: "4" }),
      played({ id: "s2", phase: "SEMI", winner_id: "2" }),
    ]);
    expect("matches" in result && result.matches).toEqual([
      expect.objectContaining({ phase: "FINAL", team_a_id: "4", team_b_id: "2" }),
    ]);
  });

  it("refuses once the final has been played", () => {
    const result = planAdvance(four, [played({ id: "f", phase: "FINAL", winner_id: "1" })]);
    expect(result).toHaveProperty("error");
  });
});
