/**
 * Tennis scored as tennis, and deuce and advantage at every racket sport.
 *
 * Tennis: points 0, 15, 30, 40 and game; at 40-40 deuce, then advantage, and
 * a game needs two clear points. One set: first to 6 games by 2, a tie-break
 * to 7 at 6-6 that takes the set 7-6. Games are kept in score_team_*, the
 * game in progress in balls_potted_* (lib/tournament-engine.ts TENNIS_RULES).
 *
 * Badminton, table tennis and pickleball were always win-by-two; what they
 * gain here is the call: deuce when level at target - 1, advantage one ahead.
 */

import { describe, it, expect } from "vitest";
import * as Engine from "../src/lib/tournament-engine";
import {
  applyLocalScore,
  racketCall as localCall,
  TENNIS_RULES as LOCAL_TENNIS,
} from "../../frontend/lib/local-score";

const live = (over: Partial<Engine.EngineMatch> = {}): Engine.EngineMatch =>
  ({
    id: "m", phase: "GROUP", team_a_id: "a", team_b_id: "b", status: "LIVE", sudden_death: false,
    active_team_id: null, balls_potted_a: 0, balls_potted_b: 0, black_potted_a: false, black_potted_b: false,
    fouls_a: 0, fouls_b: 0, score_team_a: 0, score_team_b: 0, winner_id: null, duration: 600, start_time: 0,
    match_order: 1, ...over,
  }) as Engine.EngineMatch;

/** Play points for "a" and "b", in order. */
const play = (seq: string) => {
  let m = live();
  let ended = false;
  for (const ch of seq) {
    const r = Engine.processScoreUpdate(m, ch, "POINT", "TENNIS");
    m = r.updatedMatch;
    ended = ended || r.matchEnded;
  }
  return { m, ended };
};

const said = (m: Engine.EngineMatch) => {
  const tb = m.score_team_a === 6 && m.score_team_b === 6;
  return `${Engine.tennisPointsLabel(m.balls_potted_a, m.balls_potted_b, tb)}-${Engine.tennisPointsLabel(m.balls_potted_b, m.balls_potted_a, tb)}`;
};

const games = (n: number, who: "a" | "b") => who.repeat(4 * n);

describe("a tennis game", () => {
  it("counts 15, 30, 40", () => {
    expect(said(play("a").m)).toBe("15-0");
    expect(said(play("aa").m)).toBe("30-0");
    expect(said(play("aab").m)).toBe("30-15");
    expect(said(play("aaab").m)).toBe("40-15");
  });

  it("wins a game from 40 with the next point, and starts the next at love", () => {
    const { m } = play("aaaa");
    expect(m.score_team_a).toBe(1);
    expect(said(m)).toBe("0-0");
  });

  it("goes to deuce at 40-40, advantage on the next point, and back to deuce", () => {
    const deuce = play("aaabbb").m;
    expect(said(deuce)).toBe("40-40");
    expect(Engine.racketCall(deuce, "TENNIS")).toEqual({ call: "DEUCE", side: null });

    const adv = play("aaabbba").m;
    expect(said(adv)).toBe("AD-40");
    expect(Engine.racketCall(adv, "TENNIS")).toEqual({ call: "ADVANTAGE", side: "A" });

    const back = play("aaabbbab").m;
    expect(Engine.racketCall(back, "TENNIS")).toEqual({ call: "DEUCE", side: null });
    expect(back.score_team_a + back.score_team_b).toBe(0);
  });

  it("wins the game only from advantage, however long deuce lasts", () => {
    expect(play("aaabbbaa").m.score_team_a).toBe(1);
    expect(play("aaabbbababababab").m.score_team_a + play("aaabbbababababab").m.score_team_b).toBe(0);
    expect(play("aaabbbabababbb").m.score_team_b).toBe(1);
  });

  it("calls game point at 40 with the lead", () => {
    expect(Engine.racketCall(play("aaa").m, "TENNIS")).toEqual({ call: "GAME_POINT", side: "A" });
    expect(Engine.racketCall(play("abbb").m, "TENNIS")).toEqual({ call: "GAME_POINT", side: "B" });
    expect(Engine.racketCall(play("ab").m, "TENNIS")).toEqual({ call: null, side: null });
  });

  it("takes back a point of the game in progress, never a game already won", () => {
    const back = Engine.processScoreUpdate(play("aab").m, "a", "REMOVE_POINT", "TENNIS").updatedMatch;
    expect(said(back)).toBe("15-15");
    const won = Engine.processScoreUpdate(play("aaaa").m, "a", "REMOVE_POINT", "TENNIS").updatedMatch;
    expect(won.score_team_a).toBe(1);
  });
});

describe("a tennis set", () => {
  it("is won 6-4, and that ends the match", () => {
    const { m, ended } = play(games(4, "a") + games(4, "b") + games(2, "a"));
    expect([m.score_team_a, m.score_team_b, ended, m.winner_id]).toEqual([6, 4, true, "a"]);
  });

  it("is not won 6-5, and is won 7-5", () => {
    const sixFive = games(5, "a") + games(5, "b") + games(1, "a");
    expect(play(sixFive).m.status).toBe("LIVE");
    const { m, ended } = play(sixFive + games(1, "a"));
    expect([m.score_team_a, m.score_team_b, ended]).toEqual([7, 5, true]);
  });

  it("goes to a tie-break at 6-6, counted in ones, to 7 by 2, taking the set 7-6", () => {
    const sixAll = games(5, "a") + games(5, "b") + games(1, "a") + games(1, "b");
    const tb = play(sixAll).m;
    expect([tb.score_team_a, tb.score_team_b]).toEqual([6, 6]);
    expect(Engine.racketCall(tb, "TENNIS").call).toBe("TIEBREAK");

    const level = play(sixAll + "ab".repeat(6)).m;
    expect([level.balls_potted_a, level.balls_potted_b, level.status]).toEqual([6, 6, "LIVE"]);
    expect(said(level)).toBe("6-6");

    const { m, ended } = play(sixAll + "ab".repeat(6) + "bb");
    expect([m.score_team_a, m.score_team_b, ended, m.winner_id]).toEqual([6, 7, true, "b"]);
  });

  it("is played point for point the same by the scorer's copy", () => {
    expect(LOCAL_TENNIS).toEqual(Engine.TENNIS_RULES);
    let seed = 7;
    const next = () => ((seed = (seed * 16807) % 2147483647) % 100 < 52 ? "a" : "b");
    for (let match = 0; match < 25; match++) {
      let server = live();
      let local = live() as any;
      for (let i = 0; i < 2000 && server.status === "LIVE"; i++) {
        const team = next();
        server = Engine.processScoreUpdate(server, team, "POINT", "TENNIS").updatedMatch;
        local = applyLocalScore(local, team, "POINT", "TENNIS").match;
        expect([local.score_team_a, local.score_team_b, local.balls_potted_a, local.balls_potted_b, local.status, local.winner_id]).toEqual([
          server.score_team_a, server.score_team_b, server.balls_potted_a, server.balls_potted_b, server.status, server.winner_id,
        ]);
        expect(localCall(local, "TENNIS")).toEqual(Engine.racketCall(server, "TENNIS"));
      }
      expect(server.status).toBe("COMPLETED");
    }
  });
});

describe("deuce and advantage at badminton, table tennis and pickleball", () => {
  const at = (a: number, b: number, sport: Engine.RallySport) =>
    Engine.racketCall({ score_team_a: a, score_team_b: b, balls_potted_a: 0, balls_potted_b: 0 }, sport);

  it("calls deuce when level at target - 1 or beyond, and advantage one ahead", () => {
    expect(at(10, 10, "TABLE_TENNIS")).toEqual({ call: "DEUCE", side: null });
    expect(at(11, 10, "TABLE_TENNIS")).toEqual({ call: "ADVANTAGE", side: "A" });
    expect(at(20, 20, "BADMINTON")).toEqual({ call: "DEUCE", side: null });
    expect(at(28, 29, "BADMINTON")).toEqual({ call: "ADVANTAGE", side: "B" });
    expect(at(10, 10, "PICKLEBALL")).toEqual({ call: "DEUCE", side: null });
  });

  it("calls game point before deuce, and nothing early in a game", () => {
    expect(at(10, 8, "PICKLEBALL")).toEqual({ call: "GAME_POINT", side: "A" });
    expect(at(20, 15, "BADMINTON")).toEqual({ call: "GAME_POINT", side: "A" });
    expect(at(5, 3, "PICKLEBALL")).toEqual({ call: null, side: null });
  });

  it("agrees with the scorer's copy at every score", () => {
    for (const sport of ["BADMINTON", "PICKLEBALL", "TABLE_TENNIS"] as const) {
      for (let a = 0; a <= 30; a++) {
        for (let b = 0; b <= 30; b++) {
          const m = { score_team_a: a, score_team_b: b, balls_potted_a: 0, balls_potted_b: 0 };
          expect(localCall(m, sport)).toEqual(Engine.racketCall(m, sport));
        }
      }
    }
  });
});
