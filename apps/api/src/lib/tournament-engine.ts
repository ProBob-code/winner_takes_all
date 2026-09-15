/**
 * Dynamic Tournament Engine Core Logic
 * Handles match generation, scoring, ranking, and timer calculations.
 */

export type TournamentPhase = 'SETUP' | 'GROUP' | 'KNOCKOUT' | 'COMPLETED';
export type MatchStatus = 'CREATED' | 'LIVE' | 'COMPLETED';
export type MatchPhase = 'GROUP' | 'SEMI' | 'FINAL';

/**
 * Everything the arena can record. MISTAKE predates FOUL and awards the ten
 * points to the team named, rather than to that team's opponent; it is kept so
 * older clients keep working.
 */
export type ScoreEventType =
  | 'BALL' | 'BLACK' | 'MISTAKE' | 'GOAL'
  | 'FOUL' | 'REMOVE_BALL' | 'REMOVE_FOUL';

const UNDO_EVENTS = new Set<ScoreEventType>(['REMOVE_BALL', 'REMOVE_FOUL']);

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
  /** Fouls committed by each side. The points go to their opponent. */
  fouls_a: number;
  fouls_b: number;
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
 */
export function processScoreUpdate<M extends EngineMatch>(
  match: M,
  scoringTeamId: string,
  type: ScoreEventType
): { updatedMatch: M, matchEnded: boolean } {
  
  const updatedMatch = { ...match };
  
  if (updatedMatch.status !== 'LIVE') {
    return { updatedMatch, matchEnded: false };
  }

  // Handle sudden death. An undo is a correction, not a golden point, so it
  // must not hand the match to whoever was being corrected.
  if (updatedMatch.sudden_death && !UNDO_EVENTS.has(type)) {
    updatedMatch.winner_id = scoringTeamId;
    updatedMatch.status = 'COMPLETED';
    return { updatedMatch, matchEnded: true };
  }

  const isTeamA = updatedMatch.team_a_id === scoringTeamId;

  // A foul is recorded against the side that committed it, while the ten
  // points go to their opponent — "a foul by your opponent awards you 10".
  if (type === 'FOUL' || type === 'REMOVE_FOUL') {
    const undo = type === 'REMOVE_FOUL';
    const fouls = isTeamA ? updatedMatch.fouls_a : updatedMatch.fouls_b;
    if (undo && fouls <= 0) return { updatedMatch, matchEnded: false };

    const step = undo ? -1 : 1;
    if (isTeamA) {
      updatedMatch.fouls_a += step;
      updatedMatch.score_team_b = Math.max(0, updatedMatch.score_team_b + step * 10);
    } else {
      updatedMatch.fouls_b += step;
      updatedMatch.score_team_a = Math.max(0, updatedMatch.score_team_a + step * 10);
    }

    if (undo) return { updatedMatch, matchEnded: false };
    return checkRaceTarget(updatedMatch);
  }

  // Undo a potted ball, for a miscount. It can only take a score down, so it
  // never ends the match.
  if (type === 'REMOVE_BALL') {
    if (isTeamA && updatedMatch.balls_potted_a > 0) {
      updatedMatch.balls_potted_a--;
      updatedMatch.score_team_a = Math.max(0, updatedMatch.score_team_a - 10);
    } else if (!isTeamA && updatedMatch.balls_potted_b > 0) {
      updatedMatch.balls_potted_b--;
      updatedMatch.score_team_b = Math.max(0, updatedMatch.score_team_b - 10);
    }
    return { updatedMatch, matchEnded: false };
  }

  // A goal is worth one, and football has no race target: the match is decided
  // by the clock, so a goal never ends it early.
  if (type === 'GOAL') {
    if (isTeamA) updatedMatch.score_team_a += 1;
    else updatedMatch.score_team_b += 1;
    return { updatedMatch, matchEnded: false };
  }

  const points = type === 'BLACK' ? 30 : 10;

  // Update specific counters
  if (type === 'BALL') {
    if (isTeamA) updatedMatch.balls_potted_a++;
    else updatedMatch.balls_potted_b++;
  } else if (type === 'BLACK') {
    if (isTeamA) updatedMatch.black_potted_a = true;
    else updatedMatch.black_potted_b = true;
  }

  // Update scores
  if (isTeamA) {
    updatedMatch.score_team_a += points;
  } else {
    updatedMatch.score_team_b += points;
  }

  return checkRaceTarget(updatedMatch);
}

/** First to 100 takes the match outright. */
function checkRaceTarget<M extends EngineMatch>(match: M): { updatedMatch: M, matchEnded: boolean } {
  const updatedMatch = match;

  if (updatedMatch.score_team_a >= 100) {
    updatedMatch.score_team_a = 100;
    updatedMatch.winner_id = updatedMatch.team_a_id;
    updatedMatch.status = 'COMPLETED';
    return { updatedMatch, matchEnded: true };
  }

  if (updatedMatch.score_team_b >= 100) {
    updatedMatch.score_team_b = 100;
    updatedMatch.winner_id = updatedMatch.team_b_id;
    updatedMatch.status = 'COMPLETED';
    return { updatedMatch, matchEnded: true };
  }

  return { updatedMatch, matchEnded: false };
}

/**
 * PHASE 5 — Timer Engine
 */
export function checkTimer<M extends EngineMatch>(
  match: M,
  currentTime: number // unix seconds
): { updatedMatch: M, matchEnded: boolean, suddenDeathStarted: boolean } {
  
  if (match.status !== 'LIVE' || !match.start_time) {
    return { updatedMatch: match, matchEnded: false, suddenDeathStarted: false };
  }

  const remaining = (match.start_time + match.duration) - currentTime;
  
  if (remaining <= 0) {
    const updatedMatch = { ...match };
    
    if (updatedMatch.score_team_a === updatedMatch.score_team_b) {
      updatedMatch.sudden_death = true;
      return { updatedMatch, matchEnded: false, suddenDeathStarted: true };
    } else {
      updatedMatch.status = 'COMPLETED';
      updatedMatch.winner_id = updatedMatch.score_team_a > updatedMatch.score_team_b 
        ? updatedMatch.team_a_id 
        : updatedMatch.team_b_id;
      return { updatedMatch, matchEnded: true, suddenDeathStarted: false };
    }
  }

  return { updatedMatch: match, matchEnded: false, suddenDeathStarted: false };
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
