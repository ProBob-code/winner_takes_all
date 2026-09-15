/**
 * Dynamic Tournament Engine Core Logic
 * Handles match generation, scoring, ranking, and timer calculations.
 *
 * The scoring rules are Quick Tournament's, so a hosted tournament plays
 * exactly like the arena players already know: a ball is worth 10, a foul
 * costs the side that committed it 5, the black after all seven balls wins the
 * rack and the black before them loses it.
 */

export type TournamentPhase = 'SETUP' | 'GROUP' | 'KNOCKOUT' | 'COMPLETED';
export type MatchStatus = 'CREATED' | 'LIVE' | 'COMPLETED';
export type MatchPhase = 'GROUP' | 'SEMI' | 'FINAL';
export type PoolHouse = 'SOLID' | 'STRIPES';
export type Sport = '8BALL' | 'FOOTBALL';

/**
 * Everything the arena can record. MISTAKE predates FOUL and awards ten points
 * to the team named; it is kept so older clients keep working.
 */
export type ScoreEventType =
  | 'BALL' | 'BLACK' | 'MISTAKE' | 'GOAL'
  | 'FOUL' | 'REMOVE_BALL' | 'REMOVE_FOUL' | 'REMOVE_GOAL';

/** 8-ball scoring, as Quick Tournament plays it. */
export const POOL_RULES = {
  BALL_POINTS: 10,
  BALLS_PER_SIDE: 7,
  BLACK_POINTS: 30,
  FOUL_PENALTY: 5,
  /** What the opponent is awarded when the black goes down early. */
  EARLY_BLACK_AWARD: 100,
  /** Added to each side's running total when an 8-ball match is drawn. */
  DRAW_BONUS: 50,
  /** The legacy MISTAKE event races to this. */
  RACE_TARGET: 100,
} as const;

export interface EngineTeam {
  id: string;
  name: string;
  matches_played: number;
  group_points: number; // wins count
  total_score: number;  // tie-breaker
  bye_assigned: boolean;
}

export interface EngineMatch {
  id: string;
  phase: MatchPhase;
  team_a_id: string;
  team_b_id: string;
  status: MatchStatus;
  sudden_death: boolean;
  active_team_id: string | null;
  balls_potted_a: number;
  balls_potted_b: number;
  black_potted_a: boolean;
  black_potted_b: boolean;
  /** Fouls committed by each side. Each one costs that side FOUL_PENALTY. */
  fouls_a: number;
  fouls_b: number;
  team_a_house: PoolHouse;
  team_b_house: PoolHouse;
  start_time: number | null; // unix timestamp
  duration: number;          // seconds
  score_team_a: number;
  score_team_b: number;
  winner_id: string | null;
  explanation: string;
  match_order: number;
}

export interface MatchupRecord {
  team1_id: string;
  team2_id: string;
}

/**
 * PHASE 2 — Match Generator
 */
export function generateNextMatches(
  teams: EngineTeam[],
  pastMatchups: MatchupRecord[],
  currentPhase: MatchPhase = 'GROUP',
  maxMatches: number = 2
): { matches: Partial<EngineMatch>[], byeTeamId?: string } {

  if (currentPhase !== 'GROUP') {
    // Knockout pairings are handled differently (Phases 7/8)
    return { matches: [] };
  }

  const eligible = teams.filter(t => t.matches_played < maxMatches);
  const matches: Partial<EngineMatch>[] = [];
  let byeTeamId: string | undefined;

  // Step 2: Handle odd teams (BYE)
  if (eligible.length % 2 === 1) {
    // Pick team without bye and lowest matches_played
    const byeTeam = eligible
      .filter(t => !t.bye_assigned)
      .sort((a, b) => a.matches_played - b.matches_played)[0];

    if (byeTeam) {
      byeTeamId = byeTeam.id;
      // Remove from eligible for pairing
      const idx = eligible.findIndex(t => t.id === byeTeam.id);
      eligible.splice(idx, 1);
    }
  }

  // Step 3: Pair teams (no repeats)
  const pairedIds = new Set<string>();

  for (let i = 0; i < eligible.length; i++) {
    const t1 = eligible[i];
    if (pairedIds.has(t1.id)) continue;

    // Find opponent
    const t2 = eligible.find(potential => {
      if (potential.id === t1.id || pairedIds.has(potential.id)) return false;

      // Check if they played before
      const hasPlayed = pastMatchups.some(m =>
        (m.team1_id === t1.id && m.team2_id === potential.id) ||
        (m.team1_id === potential.id && m.team2_id === t1.id)
      );

      return !hasPlayed;
    });

    if (t2) {
      pairedIds.add(t1.id);
      pairedIds.add(t2.id);

      matches.push({
        phase: 'GROUP',
        team_a_id: t1.id,
        team_b_id: t2.id,
        status: 'CREATED',
        explanation: `Match assigned to ensure each team plays 2 matches. No repeated opponents.`
      });
    }
  }

  return { matches, byeTeamId };
}

/**
 * PHASE 4 — Scoring Engine
 *
 * The corrections (REMOVE_*) only ever take a count back down, so they never
 * end a match, and they do nothing when there is nothing to take back.
 */
export function processScoreUpdate<M extends EngineMatch>(
  match: M,
  scoringTeamId: string,
  type: ScoreEventType
): { updatedMatch: M, matchEnded: boolean } {

  const updatedMatch = { ...match };
  const unchanged = { updatedMatch, matchEnded: false };

  if (updatedMatch.status !== 'LIVE') return unchanged;

  const isTeamA = updatedMatch.team_a_id === scoringTeamId;
  const opponentId = isTeamA ? updatedMatch.team_b_id : updatedMatch.team_a_id;

  const balls = isTeamA ? updatedMatch.balls_potted_a : updatedMatch.balls_potted_b;
  const fouls = isTeamA ? updatedMatch.fouls_a : updatedMatch.fouls_b;
  const addScore = (points: number) => {
    if (isTeamA) updatedMatch.score_team_a += points;
    else updatedMatch.score_team_b += points;
  };

  switch (type) {
    case 'BALL': {
      // Seven balls a side; the eighth is the black.
      if (balls >= POOL_RULES.BALLS_PER_SIDE) return unchanged;
      if (isTeamA) updatedMatch.balls_potted_a++;
      else updatedMatch.balls_potted_b++;
      addScore(POOL_RULES.BALL_POINTS);
      break;
    }

    case 'REMOVE_BALL': {
      if (balls <= 0) return unchanged;
      if (isTeamA) updatedMatch.balls_potted_a--;
      else updatedMatch.balls_potted_b--;
      addScore(-POOL_RULES.BALL_POINTS);
      return unchanged;
    }

    // A foul is recorded against the side that committed it, and it is that
    // side which loses the points. Scores may go below zero, exactly as they
    // do in Quick Tournament, so the arithmetic always undoes cleanly.
    case 'FOUL': {
      if (isTeamA) updatedMatch.fouls_a++;
      else updatedMatch.fouls_b++;
      addScore(-POOL_RULES.FOUL_PENALTY);
      break;
    }

    case 'REMOVE_FOUL': {
      if (fouls <= 0) return unchanged;
      if (isTeamA) updatedMatch.fouls_a--;
      else updatedMatch.fouls_b--;
      addScore(POOL_RULES.FOUL_PENALTY);
      return unchanged;
    }

    // The black decides the rack either way: after all seven balls it wins,
    // before them it hands the match to the opponent.
    case 'BLACK': {
      if (isTeamA ? updatedMatch.black_potted_a : updatedMatch.black_potted_b) return unchanged;
      if (isTeamA) updatedMatch.black_potted_a = true;
      else updatedMatch.black_potted_b = true;

      updatedMatch.status = 'COMPLETED';
      if (balls < POOL_RULES.BALLS_PER_SIDE) {
        updatedMatch.winner_id = opponentId;
        if (isTeamA) updatedMatch.score_team_b = POOL_RULES.EARLY_BLACK_AWARD;
        else updatedMatch.score_team_a = POOL_RULES.EARLY_BLACK_AWARD;
      } else {
        updatedMatch.winner_id = scoringTeamId;
        addScore(POOL_RULES.BLACK_POINTS);
      }
      return { updatedMatch, matchEnded: true };
    }

    // A goal is worth one, and football has no race target: the match is
    // decided by the clock, so a goal never ends it early.
    case 'GOAL': {
      addScore(1);
      break;
    }

    case 'REMOVE_GOAL': {
      if ((isTeamA ? updatedMatch.score_team_a : updatedMatch.score_team_b) <= 0) return unchanged;
      addScore(-1);
      return unchanged;
    }

    case 'MISTAKE': {
      addScore(POOL_RULES.BALL_POINTS);
      const raced = checkRaceTarget(updatedMatch);
      if (raced.matchEnded) return raced;
      break;
    }
  }

  // Sudden death: the first event that breaks the tie decides the match. A
  // foul breaks it against the side that committed it.
  if (updatedMatch.sudden_death && updatedMatch.score_team_a !== updatedMatch.score_team_b) {
    updatedMatch.status = 'COMPLETED';
    updatedMatch.winner_id =
      updatedMatch.score_team_a > updatedMatch.score_team_b
        ? updatedMatch.team_a_id
        : updatedMatch.team_b_id;
    return { updatedMatch, matchEnded: true };
  }

  return { updatedMatch, matchEnded: false };
}

/** First to the race target takes the match outright (legacy MISTAKE only). */
function checkRaceTarget<M extends EngineMatch>(match: M): { updatedMatch: M, matchEnded: boolean } {
  const updatedMatch = match;
  const target = POOL_RULES.RACE_TARGET;

  if (updatedMatch.score_team_a >= target) {
    updatedMatch.score_team_a = target;
    updatedMatch.winner_id = updatedMatch.team_a_id;
    updatedMatch.status = 'COMPLETED';
    return { updatedMatch, matchEnded: true };
  }

  if (updatedMatch.score_team_b >= target) {
    updatedMatch.score_team_b = target;
    updatedMatch.winner_id = updatedMatch.team_b_id;
    updatedMatch.status = 'COMPLETED';
    return { updatedMatch, matchEnded: true };
  }

  return { updatedMatch, matchEnded: false };
}

/**
 * PHASE 5 — Timer Engine
 *
 * When the clock runs out the higher score wins. A level group match is a
 * draw, as in Quick Tournament. A knockout match has to produce someone to go
 * through, so a level one goes to sudden death instead.
 */
export function checkTimer<M extends EngineMatch>(
  match: M,
  currentTime: number // unix seconds
): { updatedMatch: M, matchEnded: boolean, suddenDeathStarted: boolean } {

  const untouched = { updatedMatch: match, matchEnded: false, suddenDeathStarted: false };
  if (match.status !== 'LIVE' || !match.start_time) return untouched;

  const remaining = (match.start_time + match.duration) - currentTime;
  if (remaining > 0) return untouched;

  // Already waiting on the next score; nothing more for the clock to decide.
  if (match.sudden_death) return untouched;

  const updatedMatch = { ...match };

  if (updatedMatch.score_team_a === updatedMatch.score_team_b) {
    if (updatedMatch.phase !== 'GROUP') {
      updatedMatch.sudden_death = true;
      return { updatedMatch, matchEnded: false, suddenDeathStarted: true };
    }
    updatedMatch.status = 'COMPLETED';
    updatedMatch.winner_id = null;
    return { updatedMatch, matchEnded: true, suddenDeathStarted: false };
  }

  updatedMatch.status = 'COMPLETED';
  updatedMatch.winner_id = updatedMatch.score_team_a > updatedMatch.score_team_b
    ? updatedMatch.team_a_id
    : updatedMatch.team_b_id;
  return { updatedMatch, matchEnded: true, suddenDeathStarted: false };
}

/** Put a live match back to its opening state and restart its clock. */
export function resetMatch<M extends EngineMatch>(match: M, now: number): M {
  return {
    ...match,
    score_team_a: 0,
    score_team_b: 0,
    balls_potted_a: 0,
    balls_potted_b: 0,
    black_potted_a: false,
    black_potted_b: false,
    fouls_a: 0,
    fouls_b: 0,
    sudden_death: false,
    active_team_id: null,
    winner_id: null,
    start_time: now,
  };
}

/** What a finished match adds to each side's running totals. */
export interface ResultDelta {
  teamId: string;
  played: number;
  wins: number;
  score: number;
}

export function resultDeltas(match: EngineMatch, sport: Sport): ResultDelta[] {
  const drawn = match.status === 'COMPLETED' && !match.winner_id;
  const bonus = drawn && sport !== 'FOOTBALL' ? POOL_RULES.DRAW_BONUS : 0;

  return [
    { teamId: match.team_a_id, score: match.score_team_a },
    { teamId: match.team_b_id, score: match.score_team_b },
  ].map(({ teamId, score }) => ({
    teamId,
    played: 1,
    wins: match.winner_id === teamId ? 1 : 0,
    score: score + bonus,
  }));
}

/**
 * PHASE 7 — Ranking
 */
export function rankTeams(teams: EngineTeam[]): EngineTeam[] {
  return [...teams].sort((a, b) => {
    // 1. Group points (wins)
    if (b.group_points !== a.group_points) {
      return b.group_points - a.group_points;
    }
    // 2. Total score (tie-breaker)
    if (b.total_score !== a.total_score) {
      return b.total_score - a.total_score;
    }
    // Note: head-to-head would require matchup data, simplified for now
    return 0;
  });
}

/**
 * PHASE 8 — Knockout Generator
 */
export function generateKnockout(rankedTeams: EngineTeam[]): Partial<EngineMatch>[] {
  const count = rankedTeams.length;
  const matches: Partial<EngineMatch>[] = [];

  if (count >= 4) {
    // Semi-finals: 1 vs 4, 2 vs 3
    matches.push({
      phase: 'SEMI',
      team_a_id: rankedTeams[0].id,
      team_b_id: rankedTeams[3].id,
      explanation: 'Semi-final: Rank 1 vs Rank 4'
    });
    matches.push({
      phase: 'SEMI',
      team_a_id: rankedTeams[1].id,
      team_b_id: rankedTeams[2].id,
      explanation: 'Semi-final: Rank 2 vs Rank 3'
    });
  } else if (count === 3) {
    // Top 2 to final
    matches.push({
      phase: 'FINAL',
      team_a_id: rankedTeams[0].id,
      team_b_id: rankedTeams[1].id,
      explanation: 'Final: Top 2 teams from group phase'
    });
  } else if (count === 2) {
    // Direct final
    matches.push({
      phase: 'FINAL',
      team_a_id: rankedTeams[0].id,
      team_b_id: rankedTeams[1].id,
      explanation: 'Final match'
    });
  }

  return matches;
}

/**
 * The next step of the knockout, as Quick Tournament takes it: the group
 * stage's top four into semi-finals (or its top two straight into a final),
 * then the two semi-final winners into the final.
 */
export function planAdvance(
  teams: EngineTeam[],
  matches: EngineMatch[]
): { matches: Partial<EngineMatch>[] } | { error: string } {
  if (matches.some(m => m.status !== 'COMPLETED')) {
    return { error: 'Finish every queued match before advancing.' };
  }

  const semis = matches.filter(m => m.phase === 'SEMI');
  const finals = matches.filter(m => m.phase === 'FINAL');

  if (finals.length > 0) {
    return { error: 'The final has already been played.' };
  }

  if (semis.length === 0) {
    const knockout = generateKnockout(rankTeams(teams));
    if (knockout.length === 0) {
      return { error: 'At least two teams are needed for a knockout.' };
    }
    return { matches: knockout };
  }

  const winners = semis.map(m => m.winner_id);
  if (winners.some(w => !w)) {
    return { error: 'Both semi-finals need a winner before the final.' };
  }

  return {
    matches: [{
      phase: 'FINAL',
      team_a_id: winners[0]!,
      team_b_id: winners[1]!,
      explanation: 'Final: the two semi-final winners',
    }],
  };
}
