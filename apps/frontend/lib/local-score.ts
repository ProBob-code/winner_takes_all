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
  | "REMOVE_GOAL";

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
  type: LocalScoreEvent
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
  pending: PendingTap[]
): { match: M; applied: number } {
  let current = match;
  let applied = 0;
  for (const tap of pending) {
    if (tap.matchId !== match.id) continue;
    const result = applyLocalScore(current, tap.teamId, tap.type);
    current = result.match;
    if (result.changed) applied++;
  }
  return { match: current, applied };
}
