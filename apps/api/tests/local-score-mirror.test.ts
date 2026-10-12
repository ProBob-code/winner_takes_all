/**
 * The browser's copy of the scoring rules must agree with the engine's.
 *
 * apps/frontend/lib/local-score.ts exists so a score tap paints the board
 * before the server has heard about it — the complaint that made two of twenty
 * buyers refuse the product outright. The cost of that is a second copy of the
 * arithmetic, and the risk of a second copy is drift: if the two disagree, the
 * board shows one answer and then visibly corrects itself a poll later.
 *
 * This test is the thing that stops that happening. It lives in the API's
 * suite rather than the frontend's because this is the only place that can
 * import both and compare them, which is the whole point.
 */

import { describe, it, expect } from "vitest";
import * as Engine from "../src/lib/tournament-engine";
import {
  applyLocalScore,
  projectPending,
  POOL_RULES as LOCAL_RULES,
  type LocalScoreEvent,
} from "../../frontend/lib/local-score";

/** Every event both implementations handle. MISTAKE is legacy and server-only. */
const EVENTS: LocalScoreEvent[] = [
  "BALL",
  "BLACK",
  "GOAL",
  "FOUL",
  "REMOVE_BALL",
  "REMOVE_FOUL",
  "REMOVE_GOAL",
];

function baseMatch(over: Partial<Engine.EngineMatch> = {}): Engine.EngineMatch {
  return {
    id: "m1",
    phase: "GROUP",
    team_a_id: "A",
    team_b_id: "B",
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
    match_order: 0,
    ...over,
  } as Engine.EngineMatch;
}

/** The fields both sides are expected to agree on, after one tap. */
function comparable(m: any) {
  return {
    status: m.status,
    winner_id: m.winner_id ?? null,
    score_team_a: m.score_team_a,
    score_team_b: m.score_team_b,
    balls_potted_a: m.balls_potted_a,
    balls_potted_b: m.balls_potted_b,
    black_potted_a: !!m.black_potted_a,
    black_potted_b: !!m.black_potted_b,
    fouls_a: m.fouls_a ?? 0,
    fouls_b: m.fouls_b ?? 0,
  };
}

describe("the rule constants are the same on both sides", () => {
  it("agrees on every shared figure", () => {
    expect(LOCAL_RULES.BALL_POINTS).toBe(Engine.POOL_RULES.BALL_POINTS);
    expect(LOCAL_RULES.BALLS_PER_SIDE).toBe(Engine.POOL_RULES.BALLS_PER_SIDE);
    expect(LOCAL_RULES.BLACK_POINTS).toBe(Engine.POOL_RULES.BLACK_POINTS);
    expect(LOCAL_RULES.FOUL_PENALTY).toBe(Engine.POOL_RULES.FOUL_PENALTY);
    expect(LOCAL_RULES.EARLY_BLACK_AWARD).toBe(Engine.POOL_RULES.EARLY_BLACK_AWARD);
    expect(LOCAL_RULES.RACE_TARGET).toBe(Engine.POOL_RULES.RACE_TARGET);
  });
});

describe("one tap, both implementations", () => {
  const states: Array<[string, Partial<Engine.EngineMatch>]> = [
    ["a fresh frame", {}],
    ["mid-frame", { balls_potted_a: 3, balls_potted_b: 2, score_team_a: 30, score_team_b: 20 }],
    [
      "seven balls down for A",
      { balls_potted_a: 7, score_team_a: 70, balls_potted_b: 1, score_team_b: 10 },
    ],
    [
      "seven balls down for B",
      { balls_potted_b: 7, score_team_b: 70, balls_potted_a: 2, score_team_a: 20 },
    ],
    ["fouls already recorded", { fouls_a: 2, fouls_b: 1, score_team_a: -10, score_team_b: -5 }],
    ["level in sudden death", { sudden_death: true, score_team_a: 40, score_team_b: 40 }],
    ["nothing to undo", { balls_potted_a: 0, fouls_a: 0, score_team_a: 0 }],
    ["A has already potted the black", { black_potted_a: true }],
    ["scores already negative", { score_team_a: -15, score_team_b: -5, fouls_a: 3 }],
  ];

  for (const [label, over] of states) {
    for (const team of ["A", "B"]) {
      for (const type of EVENTS) {
        it(`${label}: ${type} for ${team}`, () => {
          const server = Engine.processScoreUpdate(
            baseMatch(over),
            team,
            type as Engine.ScoreEventType
          );
          const local = applyLocalScore(baseMatch(over), team, type);

          expect(comparable(local.match)).toEqual(comparable(server.updatedMatch));
          // And they agree about whether the frame is over, which is what
          // decides if the board shows a winner.
          expect(local.ended).toBe(server.matchEnded);
        });
      }
    }
  }
});

describe("a tap the rules refuse", () => {
  it("changes nothing when an eighth ball is tapped on a side", () => {
    const match = baseMatch({ balls_potted_a: 7, score_team_a: 70 });
    const local = applyLocalScore(match, "A", "BALL");
    expect(local.changed).toBe(false);
    expect(local.match.score_team_a).toBe(70);
  });

  it("changes nothing on a frame that is not live", () => {
    for (const status of ["CREATED", "COMPLETED"]) {
      const local = applyLocalScore(baseMatch({ status } as any), "A", "BALL");
      expect(local.changed).toBe(false);
    }
  });

  it("changes nothing for a team that is not in the frame", () => {
    const local = applyLocalScore(baseMatch(), "SOMEONE_ELSE", "BALL");
    expect(local.changed).toBe(false);
  });
});

describe("projecting a queue of taps", () => {
  it("matches the engine replaying the same taps in the same order", () => {
    const taps: Array<{ team: string; type: LocalScoreEvent }> = [
      { team: "A", type: "BALL" },
      { team: "A", type: "BALL" },
      { team: "B", type: "BALL" },
      { team: "A", type: "FOUL" },
      { team: "B", type: "BALL" },
      { team: "A", type: "REMOVE_BALL" },
    ];

    let server = baseMatch();
    for (const tap of taps) {
      server = Engine.processScoreUpdate(server, tap.team, tap.type as Engine.ScoreEventType)
        .updatedMatch;
    }

    const projected = projectPending(
      baseMatch(),
      taps.map((t) => ({ matchId: "m1", teamId: t.team, type: t.type }))
    );

    expect(comparable(projected.match)).toEqual(comparable(server));
    expect(projected.applied).toBe(taps.length);
  });

  it("ignores taps belonging to another frame", () => {
    const projected = projectPending(baseMatch(), [
      { matchId: "another", teamId: "A", type: "BALL" },
      { matchId: "m1", teamId: "A", type: "BALL" },
    ]);
    expect(projected.applied).toBe(1);
    expect(projected.match.score_team_a).toBe(Engine.POOL_RULES.BALL_POINTS);
  });

  it("counts only the taps the rules actually allowed", () => {
    // Nine balls tapped on a side; seven land, two are refused.
    const taps = Array.from({ length: 9 }, () => ({
      matchId: "m1",
      teamId: "A",
      type: "BALL" as LocalScoreEvent,
    }));
    const projected = projectPending(baseMatch(), taps);
    expect(projected.applied).toBe(Engine.POOL_RULES.BALLS_PER_SIDE);
    expect(projected.match.balls_potted_a).toBe(Engine.POOL_RULES.BALLS_PER_SIDE);
  });

  it("leaves the frame untouched when nothing is queued", () => {
    const projected = projectPending(baseMatch({ score_team_a: 20 }), []);
    expect(projected.applied).toBe(0);
    expect(projected.match.score_team_a).toBe(20);
  });

  it("ends the frame where the queued black ends it", () => {
    const projected = projectPending(baseMatch({ balls_potted_a: 7, score_team_a: 70 }), [
      { matchId: "m1", teamId: "A", type: "BLACK" },
    ]);
    expect(projected.match.status).toBe("COMPLETED");
    expect(projected.match.winner_id).toBe("A");
  });

  it("hands the frame over where a queued black went down early", () => {
    const projected = projectPending(baseMatch({ balls_potted_a: 3, score_team_a: 30 }), [
      { matchId: "m1", teamId: "A", type: "BLACK" },
    ]);
    expect(projected.match.winner_id).toBe("B");
    expect(projected.match.score_team_b).toBe(Engine.POOL_RULES.EARLY_BLACK_AWARD);
  });
});
