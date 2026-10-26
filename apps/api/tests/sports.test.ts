/**
 * The racket sports: tennis, badminton, pickleball and table tennis.
 *
 * One structure for all four (lib/tournament-engine.ts RALLY_RULES): every
 * rally is a point, and a match is one game to the sport's target, won by
 * two, never past the cap. These pin the rules, and hold the scorer's copy of
 * them (apps/frontend/lib/local-score.ts) to the server's, point for point.
 */

import { describe, it, expect } from "vitest";
import * as Engine from "../src/lib/tournament-engine";
import { applyLocalScore, rallyWinner as localWinner, RALLY_RULES as LOCAL_RULES } from "../../frontend/lib/local-score";
import { SPORTS as SCREEN_SPORTS } from "../../frontend/lib/sports";
import { parseVoiceCommand } from "../../frontend/lib/voice-command";

const live = (over: Partial<Engine.EngineMatch> = {}): Engine.EngineMatch => ({
  id: "m",
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
  score_team_a: 0,
  score_team_b: 0,
  winner_id: null,
  duration: 600,
  start_time: 0,
  match_order: 1,
  ...over,
} as Engine.EngineMatch);

const RALLY: Engine.RallySport[] = ["TENNIS", "BADMINTON", "PICKLEBALL", "TABLE_TENNIS"];

describe("the rules for each racket sport", () => {
  it("match the governing bodies' targets", () => {
    expect(Engine.RALLY_RULES.BADMINTON).toEqual({ target: 21, winBy: 2, cap: 30 });
    expect(Engine.RALLY_RULES.TABLE_TENNIS).toEqual({ target: 11, winBy: 2, cap: null });
    expect(Engine.RALLY_RULES.PICKLEBALL).toEqual({ target: 11, winBy: 2, cap: null });
    expect(Engine.RALLY_RULES.TENNIS).toEqual({ target: 10, winBy: 2, cap: null });
  });

  it("end a game at the target with a two-point lead, not before", () => {
    expect(Engine.rallyWinner(11, 9, "TABLE_TENNIS")).toBe("A");
    expect(Engine.rallyWinner(11, 10, "TABLE_TENNIS")).toBeNull();
    expect(Engine.rallyWinner(12, 10, "TABLE_TENNIS")).toBe("A");
    expect(Engine.rallyWinner(9, 11, "PICKLEBALL")).toBe("B");
    expect(Engine.rallyWinner(10, 8, "TENNIS")).toBe("A");
    expect(Engine.rallyWinner(10, 9, "TENNIS")).toBeNull();
  });

  it("stop badminton at 30, whatever the lead", () => {
    expect(Engine.rallyWinner(29, 29, "BADMINTON")).toBeNull();
    expect(Engine.rallyWinner(30, 29, "BADMINTON")).toBe("A");
    expect(Engine.rallyWinner(21, 19, "BADMINTON")).toBe("A");
    expect(Engine.rallyWinner(21, 20, "BADMINTON")).toBeNull();
  });

  it("read anything unknown as 8-ball, so old rows keep working", () => {
    expect(Engine.toSport("TENNIS")).toBe("TENNIS");
    expect(Engine.toSport(null)).toBe("8BALL");
    expect(Engine.toSport("CRICKET")).toBe("8BALL");
  });
});

describe("scoring a rally", () => {
  it("adds a point and ends the game at the target", () => {
    let m = live({ score_team_a: 10, score_team_b: 5 });
    const r = Engine.processScoreUpdate(m, "a", "POINT", "TABLE_TENNIS");
    expect(r.matchEnded).toBe(true);
    expect(r.updatedMatch.winner_id).toBe("a");
    expect(r.updatedMatch.score_team_a).toBe(11);

    m = live({ score_team_a: 10, score_team_b: 10 });
    const deuce = Engine.processScoreUpdate(m, "a", "POINT", "TABLE_TENNIS");
    expect(deuce.matchEnded).toBe(false);
    expect(deuce.updatedMatch.score_team_a).toBe(11);
  });

  it("takes a point back, never below zero, and never ends a game doing it", () => {
    const back = Engine.processScoreUpdate(live({ score_team_b: 3 }), "b", "REMOVE_POINT", "BADMINTON");
    expect(back.updatedMatch.score_team_b).toBe(2);
    expect(back.matchEnded).toBe(false);
    const none = Engine.processScoreUpdate(live(), "b", "REMOVE_POINT", "BADMINTON");
    expect(none.updatedMatch.score_team_b).toBe(0);
  });

  it("does nothing at a sport that is not a racket sport", () => {
    for (const sport of ["8BALL", "FOOTBALL"] as Engine.Sport[]) {
      const r = Engine.processScoreUpdate(live(), "a", "POINT", sport);
      expect(r.updatedMatch.score_team_a).toBe(0);
    }
  });

  it("lets the next point decide a level knockout game in sudden death", () => {
    const r = Engine.processScoreUpdate(live({ sudden_death: true, score_team_a: 7, score_team_b: 7 }), "b", "POINT", "PICKLEBALL");
    expect(r.matchEnded).toBe(true);
    expect(r.updatedMatch.winner_id).toBe("b");
  });

  it("gives no 8-ball draw bonus to a drawn racket match", () => {
    const drawn = live({ status: "COMPLETED", winner_id: null, score_team_a: 6, score_team_b: 6 });
    for (const sport of RALLY) {
      for (const d of Engine.resultDeltas(drawn, sport)) expect(d.score).toBe(6);
    }
    expect(Engine.resultDeltas(drawn, "8BALL")[0].score).toBe(6 + Engine.POOL_RULES.DRAW_BONUS);
  });
});

describe("the scorer's copy of the rules", () => {
  it("has the same targets as the server", () => {
    for (const sport of RALLY) expect(LOCAL_RULES[sport]).toEqual(Engine.RALLY_RULES[sport]);
  });

  it("agrees with the server on every score up to the cap", () => {
    for (const sport of RALLY) {
      for (let a = 0; a <= 31; a++) {
        for (let b = 0; b <= 31; b++) expect(localWinner(a, b, sport)).toBe(Engine.rallyWinner(a, b, sport));
      }
    }
  });

  it("plays a whole game the same way, tap for tap", () => {
    const taps = ["a", "b", "a", "a", "b", "b", "a", "a", "a", "b", "a", "a", "a", "a", "a"];
    for (const sport of RALLY) {
      let server = live();
      let local = live() as any;
      for (const team of taps) {
        server = Engine.processScoreUpdate(server, team, "POINT", sport).updatedMatch;
        local = applyLocalScore(local, team, "POINT", sport).match;
        expect([local.score_team_a, local.score_team_b, local.status, local.winner_id]).toEqual([
          server.score_team_a, server.score_team_b, server.status, server.winner_id,
        ]);
      }
    }
  });

  it("lists every sport the server knows, in the same order", () => {
    expect(SCREEN_SPORTS.map((s) => s.id)).toEqual(Engine.SPORTS);
  });
});

describe("voice at a racket sport", () => {
  const table = [{ id: "a", name: "Asha" }, { id: "b", name: "Ravi" }];
  const said = (text: string) => parseVoiceCommand(text, table, "RALLY").events.map((e) => `${e.teamId}:${e.type}`);

  it("hears a point, two points, and a point taken back", () => {
    expect(said("Asha point")).toEqual(["a:POINT"]);
    expect(said("two points for Ravi")).toEqual(["b:POINT", "b:POINT"]);
    expect(said("remove a point from Asha")).toEqual(["a:REMOVE_POINT"]);
  });

  it("says plainly that a foul is not something it scores", () => {
    const parsed = parseVoiceCommand("Asha foul", table, "RALLY");
    expect(parsed.events).toEqual([]);
    expect(parsed.problems.join(" ")).toContain("point");
  });
});
