/**
 * The scoring rules, applied on the device, so a tap shows on the board before
 * the server has heard about it.
 *
 * WHY A SECOND COPY OF THE RULES
 * The server is authoritative, and deliberately so: the engine in the API's
 * lib/tournament-engine.ts is the only thing that decides a frame. But a score
 * that appears a second and a half after the ball goes down — or not at all,
 * because the bar's wifi dropped — is the complaint that made two of twenty
 * buyers refuse the product. So the same arithmetic runs here as well, purely
 * to paint the screen, and every tap is still queued for the server to settle.
 *
 * WHERE THEY DISAGREE, THE SERVER WINS
 * This file never writes anything. It produces a projection the UI shows while
 * taps are in flight, and the next poll of the real state replaces it wholly.
 * A projection that turns out wrong is therefore visibly corrected within a
 * poll, not persisted.
 *
 * KEPT IN STEP with the API's POOL_RULES and processScoreUpdate. If the rules
 * change there and not here, the board flickers: it shows this file's answer
 * and then the server's. See local-score.test.ts, which pins the constants.
 */

/** 8-ball scoring, as the engine plays it. Mirrors the API's POOL_RULES. */
export const POOL_RULES = {
  BALL_POINTS: 10,
  BALLS_PER_SIDE: 7,
  BLACK_POINTS: 30,
  FOUL_PENALTY: 5,
  /** What the opponent is awarded when the black goes down early. */
  EARLY_BLACK_AWARD: 100,
  RACE_TARGET: 100,
} as const;

export type LocalScoreEvent =
  | "BALL"
  | "BLACK"
  | "GOAL"
  | "FOUL"
  | "REMOVE_BALL"
  | "REMOVE_FOUL"
  | "REMOVE_GOAL"
  | "POINT"
  | "REMOVE_POINT";

/** Mirrors the API's Sport. */
export type LocalSport = "8BALL" | "FOOTBALL" | "TENNIS" | "BADMINTON" | "PICKLEBALL" | "TABLE_TENNIS";

/**
 * Rally scoring for badminton, table tennis and pickleball. Mirrors the API's
 * RALLY_RULES. Tennis is scored as tennis (TENNIS_RULES).
 */
export const RALLY_RULES: Record<string, { target: number; winBy: number; cap: number | null }> = {
  BADMINTON: { target: 21, winBy: 2, cap: 30 },
  PICKLEBALL: { target: 11, winBy: 2, cap: null },
  TABLE_TENNIS: { target: 11, winBy: 2, cap: null },
};

/**
 * Tennis: 0, 15, 30, 40, deuce and advantage; one set to 6 games by 2, a
 * tie-break to 7 at 6–6. Games are kept in score_team_*, the points of the
 * game in progress in balls_potted_*. Mirrors the API's TENNIS_RULES.
 */
export const TENNIS_RULES = {
  GAME_POINTS: 4,
  SET_GAMES: 6,
  TIEBREAK_AT: 6,
  TIEBREAK_POINTS: 7,
  WIN_BY: 2,
} as const;

/** Every racket sport: the three rally sports and tennis. */
export function isRallySport(sport: string | undefined | null): boolean {
  return !!sport && (sport === "TENNIS" || Object.prototype.hasOwnProperty.call(RALLY_RULES, sport));
}

/** Whether a tennis set is at 6–6, so the game in progress is the tie-break. */
export function isTiebreak(m: { score_team_a: number; score_team_b: number }): boolean {
  return m.score_team_a === TENNIS_RULES.TIEBREAK_AT && m.score_team_b === TENNIS_RULES.TIEBREAK_AT;
}

/** One point of tennis, in place. True when it won the set and the match. Mirrors the API. */
function tennisPoint(m: ScoreableMatch, isTeamA: boolean): boolean {
  const tiebreak = isTiebreak(m);
  if (isTeamA) m.balls_potted_a++;
  else m.balls_potted_b++;
  const need = tiebreak ? TENNIS_RULES.TIEBREAK_POINTS : TENNIS_RULES.GAME_POINTS;
  const pa = m.balls_potted_a;
  const pb = m.balls_potted_b;
  if (Math.max(pa, pb) < need || Math.abs(pa - pb) < TENNIS_RULES.WIN_BY) return false;
  if (pa > pb) m.score_team_a++;
  else m.score_team_b++;
  m.balls_potted_a = 0;
  m.balls_potted_b = 0;
  const ga = m.score_team_a;
  const gb = m.score_team_b;
  const setWon = tiebreak || (Math.max(ga, gb) >= TENNIS_RULES.SET_GAMES && Math.abs(ga - gb) >= TENNIS_RULES.WIN_BY);
  if (!setWon) return false;
  m.status = "COMPLETED";
  m.winner_id = ga > gb ? m.team_a_id : m.team_b_id;
  return true;
}

export type RacketCall = "DEUCE" | "ADVANTAGE" | "GAME_POINT" | "TIEBREAK" | null;

/** Deuce, advantage, game point or tie-break, for a scoreboard. Mirrors the API's racketCall. */
export function racketCall(
  m: { score_team_a: number; score_team_b: number; balls_potted_a: number; balls_potted_b: number },
  sport: string
): { call: RacketCall; side: "A" | "B" | null } {
  if (sport === "TENNIS") {
    const pa = m.balls_potted_a;
    const pb = m.balls_potted_b;
    if (isTiebreak(m)) return { call: "TIEBREAK", side: null };
    if (pa >= 3 && pb >= 3) {
      if (pa === pb) return { call: "DEUCE", side: null };
      return { call: "ADVANTAGE", side: pa > pb ? "A" : "B" };
    }
    if (pa >= 3 && pa > pb) return { call: "GAME_POINT", side: "A" };
    if (pb >= 3 && pb > pa) return { call: "GAME_POINT", side: "B" };
    return { call: null, side: null };
  }
  const rules = RALLY_RULES[sport];
  if (!rules) return { call: null, side: null };
  const a = m.score_team_a;
  const b = m.score_team_b;
  if (a >= rules.target - 1 && b >= rules.target - 1) {
    if (a === b) return { call: "DEUCE", side: null };
    if (Math.abs(a - b) === 1) return { call: "ADVANTAGE", side: a > b ? "A" : "B" };
  }
  if (rallyWinner(a + 1, b, sport) === "A") return { call: "GAME_POINT", side: "A" };
  if (rallyWinner(a, b + 1, sport) === "B") return { call: "GAME_POINT", side: "B" };
  return { call: null, side: null };
}

/** A tennis game score as it is said: 0, 15, 30, 40, or AD. Mirrors the API. */
export function tennisPointsLabel(mine: number, theirs: number, tiebreak: boolean): string {
  if (tiebreak) return String(mine);
  if (mine >= 3 && theirs >= 3) return mine > theirs ? "AD" : "40";
  return ["0", "15", "30", "40"][Math.min(mine, 3)];
}

/** How a sport's match is won, in one line. */
export function racketRuleText(sport: string): string {
  if (sport === "TENNIS") {
    return "One set: 15, 30, 40, deuce and advantage. First to 6 games by 2, tie-break to 7 at 6–6.";
  }
  const r = RALLY_RULES[sport];
  if (!r) return "";
  return `One game to ${r.target}, win by ${r.winBy}${r.cap ? `, capped at ${r.cap}` : ""}. Level at ${r.target - 1} is deuce.`;
}

/** Mirrors the API's rallyWinner. */
export function rallyWinner(a: number, b: number, sport: string): "A" | "B" | null {
  const rules = RALLY_RULES[sport];
  if (!rules) return null;
  const top = Math.max(a, b);
  if (rules.cap !== null && top >= rules.cap && a !== b) return a > b ? "A" : "B";
  if (top >= rules.target && Math.abs(a - b) >= rules.winBy) return a > b ? "A" : "B";
  return null;
}

/** The part of a match this projection touches. */
export interface ScoreableMatch {
  team_a_id: string;
  team_b_id: string;
  status: string;
  sudden_death: boolean;
  balls_potted_a: number;
  balls_potted_b: number;
  black_potted_a: boolean;
  black_potted_b: boolean;
  fouls_a?: number;
  fouls_b?: number;
  score_team_a: number;
  score_team_b: number;
  winner_id: string | null;
}

/**
 * Apply one tap to a copy of the match.
 *
 * Returns the match unchanged when the rules say the tap does nothing — an
 * eighth ball on a side, an undo with nothing to undo, a tap on a frame that
 * is not live — which is exactly what the server does with it, so the board
 * does not briefly show a score the server will refuse.
 */
export function applyLocalScore<M extends ScoreableMatch>(
  match: M,
  scoringTeamId: string,
  type: LocalScoreEvent,
  /** Only POINT reads it. */
  sport: string = "8BALL"
): { match: M; changed: boolean; ended: boolean } {
  if (match.status !== "LIVE") return { match, changed: false, ended: false };
  if (scoringTeamId !== match.team_a_id && scoringTeamId !== match.team_b_id) {
    return { match, changed: false, ended: false };
  }

  const next = { ...match };
  const isTeamA = next.team_a_id === scoringTeamId;
  const opponentId = isTeamA ? next.team_b_id : next.team_a_id;

  const balls = isTeamA ? next.balls_potted_a : next.balls_potted_b;
  const fouls = (isTeamA ? next.fouls_a : next.fouls_b) ?? 0;

  const addScore = (points: number) => {
    if (isTeamA) next.score_team_a += points;
    else next.score_team_b += points;
  };

  const unchanged = { match, changed: false, ended: false };

  switch (type) {
    case "BALL": {
      // Seven a side; the eighth is the black.
      if (balls >= POOL_RULES.BALLS_PER_SIDE) return unchanged;
      if (isTeamA) next.balls_potted_a++;
      else next.balls_potted_b++;
      addScore(POOL_RULES.BALL_POINTS);
      break;
    }

    case "REMOVE_BALL": {
      if (balls <= 0) return unchanged;
      if (isTeamA) next.balls_potted_a--;
      else next.balls_potted_b--;
      addScore(-POOL_RULES.BALL_POINTS);
      // An undo cannot decide a frame, so it skips the sudden-death check.
      return { match: next, changed: true, ended: false };
    }

    // A foul costs the side that committed it. Scores may go below zero, so
    // the arithmetic always undoes cleanly.
    case "FOUL": {
      if (isTeamA) next.fouls_a = fouls + 1;
      else next.fouls_b = fouls + 1;
      addScore(-POOL_RULES.FOUL_PENALTY);
      break;
    }

    case "REMOVE_FOUL": {
      if (fouls <= 0) return unchanged;
      if (isTeamA) next.fouls_a = fouls - 1;
      else next.fouls_b = fouls - 1;
      addScore(POOL_RULES.FOUL_PENALTY);
      return { match: next, changed: true, ended: false };
    }

    // The black decides the rack either way: after all seven it wins, before
    // them it hands the frame to the opponent.
    case "BLACK": {
      if (isTeamA ? next.black_potted_a : next.black_potted_b) return unchanged;
      if (isTeamA) next.black_potted_a = true;
      else next.black_potted_b = true;

      next.status = "COMPLETED";
      if (balls < POOL_RULES.BALLS_PER_SIDE) {
        next.winner_id = opponentId;
        if (isTeamA) next.score_team_b = POOL_RULES.EARLY_BLACK_AWARD;
        else next.score_team_a = POOL_RULES.EARLY_BLACK_AWARD;
      } else {
        next.winner_id = scoringTeamId;
        addScore(POOL_RULES.BLACK_POINTS);
      }
      return { match: next, changed: true, ended: true };
    }

    // Football has no race target: the clock decides, so a goal never ends it.
    case "GOAL": {
      addScore(1);
      break;
    }

    case "REMOVE_GOAL": {
      if ((isTeamA ? next.score_team_a : next.score_team_b) <= 0) return unchanged;
      addScore(-1);
      return { match: next, changed: true, ended: false };
    }

    // A rally won at a racket sport: the game ends at the target, clear by two.
    case "POINT": {
      if (!isRallySport(sport)) return unchanged;
      if (sport === "TENNIS") {
        if (tennisPoint(next, isTeamA)) return { match: next, changed: true, ended: true };
        break;
      }
      addScore(1);
      const won = rallyWinner(next.score_team_a, next.score_team_b, sport);
      if (won) {
        next.status = "COMPLETED";
        next.winner_id = won === "A" ? next.team_a_id : next.team_b_id;
        return { match: next, changed: true, ended: true };
      }
      break;
    }

    case "REMOVE_POINT": {
      if (!isRallySport(sport)) return unchanged;
      if (sport === "TENNIS") {
        if ((isTeamA ? next.balls_potted_a : next.balls_potted_b) <= 0) return unchanged;
        if (isTeamA) next.balls_potted_a--;
        else next.balls_potted_b--;
        return { match: next, changed: true, ended: false };
      }
      if ((isTeamA ? next.score_team_a : next.score_team_b) <= 0) return unchanged;
      addScore(-1);
      return { match: next, changed: true, ended: false };
    }
  }

  // Sudden death: the first event that breaks the tie decides it, and a foul
  // breaks it against the side that committed it.
  if (next.sudden_death && next.score_team_a !== next.score_team_b) {
    next.status = "COMPLETED";
    next.winner_id =
      next.score_team_a > next.score_team_b ? next.team_a_id : next.team_b_id;
    return { match: next, changed: true, ended: true };
  }

  return { match: next, changed: true, ended: false };
}

/** One queued tap, as the projection needs to see it. */
export interface PendingTap {
  matchId: string;
  teamId: string;
  type: LocalScoreEvent;
}

/**
 * Replay every queued tap for one match on top of the server's last word.
 *
 * In sequence, because two taps against one frame are not interchangeable.
 */
export function projectPending<M extends ScoreableMatch & { id: string }>(
  match: M,
  pending: PendingTap[],
  sport: string = "8BALL"
): { match: M; applied: number } {
  let current = match;
  let applied = 0;
  for (const tap of pending) {
    if (tap.matchId !== match.id) continue;
    const result = applyLocalScore(current, tap.teamId, tap.type, sport);
    current = result.match;
    if (result.changed) applied++;
  }
  return { match: current, applied };
}
