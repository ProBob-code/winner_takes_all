/**
 * Dynamic Tournament Engine — Pure Logic Module
 *
 * No HTTP, no D1 imports. Takes data in, returns actions out.
 * All database operations are performed by the caller (API route handler).
 */

import type { EngineTeamRecord, EngineMatchRecord, EngineMatchupRecord } from "./engine-store";

// ── Types ──

export interface GeneratedRound {
  matches: Array<[string, string]>; // [teamAId, teamBId]
  bye: { teamId: string; teamName: string } | null;
  done: boolean; // true if all teams have played max matches
}

export interface ScoreResult {
  scoreTeamA: number;
  scoreTeamB: number;
  ended: boolean;
  winner: string | null;
  endedBy: string | null; // 'SCORE' | 'SUDDEN_DEATH'
}

export interface TimerState {
  remaining: number; // seconds
  expired: boolean;
  danger: boolean; // < 60 seconds
}

export interface ExpiryResult {
  winner: string | null;
  endedBy: string | null; // 'TIME' or null (if tie → sudden death)
  suddenDeath: boolean;
}

export interface KnockoutBracket {
  semis: Array<[string, string]>; // [teamAId, teamBId]
  finals: Array<[string, string]>;
}

export interface RankedTeam extends EngineTeamRecord {
  rank: number;
}

// ── Phase 2: Match Generator (Core) ──

/**
 * Check if two teams have already played each other.
 */
function hasPlayed(matchups: EngineMatchupRecord[], team1Id: string, team2Id: string): boolean {
  const [a, b] = [team1Id, team2Id].sort();
  return matchups.some(m => m.team1_id === a && m.team2_id === b);
}

/**
 * Generate the next round of matches dynamically.
 * Rules:
 *  - Each team plays exactly `maxPerTeam` matches
 *  - No repeat opponents
 *  - BYE for odd teams: +1 matches_played, +1 group_points, NO score
 *  - No team gets more than 1 BYE
 */
export function generateNextMatches(
  teams: EngineTeamRecord[],
  matchups: EngineMatchupRecord[],
  maxPerTeam: number = 2
): GeneratedRound {
  // Step 1: Filter eligible teams
  const eligible = teams.filter(t => t.matches_played < maxPerTeam);

  if (eligible.length === 0) {
    return { matches: [], bye: null, done: true };
  }

  // If only 1 eligible team left, give them a BYE if they haven't had one
  if (eligible.length === 1) {
    const team = eligible[0];
    if (!team.bye_assigned) {
      return {
        matches: [],
        bye: { teamId: team.id, teamName: team.name },
        done: false,
      };
    }
    // Already has BYE, nothing more to generate
    return { matches: [], bye: null, done: true };
  }

  let bye: { teamId: string; teamName: string } | null = null;

  // Step 2: Handle odd team count
  if (eligible.length % 2 === 1) {
    // Pick team that hasn't had a BYE yet, with lowest matches_played
    const candidates = eligible
      .filter(t => !t.bye_assigned)
      .sort((a, b) => a.matches_played - b.matches_played);

    if (candidates.length > 0) {
      const byeTeam = candidates[0];
      bye = { teamId: byeTeam.id, teamName: byeTeam.name };
      // Remove from eligible for pairing
      const idx = eligible.findIndex(t => t.id === byeTeam.id);
      eligible.splice(idx, 1);
    }
  }

  // Step 3: Pair teams — no repeat opponents
  const pairs: Array<[string, string]> = [];
  const used = new Set<string>();

  for (let i = 0; i < eligible.length; i++) {
    const t1 = eligible[i];
    if (used.has(t1.id)) continue;

    for (let j = i + 1; j < eligible.length; j++) {
      const t2 = eligible[j];
      if (used.has(t2.id)) continue;
      if (hasPlayed(matchups, t1.id, t2.id)) continue;

      pairs.push([t1.id, t2.id]);
      used.add(t1.id);
      used.add(t2.id);
      break;
    }
  }

  return { matches: pairs, bye, done: false };
}

// ── Phase 3: Scoring Engine (Race to 100) ──

/**
 * Process a scoring event.
 * - In sudden death: first score wins immediately (ignore 100 cap)
 * - Otherwise: race to 100, cap at 100
 */
export function processScoreEvent(
  match: EngineMatchRecord,
  teamSide: "A" | "B",
  points: number
): ScoreResult {
  // Sudden death: first scoring event wins
  if (match.sudden_death) {
    const newA = teamSide === "A" ? match.score_team_a + points : match.score_team_a;
    const newB = teamSide === "B" ? match.score_team_b + points : match.score_team_b;
    return {
      scoreTeamA: newA,
      scoreTeamB: newB,
      ended: true,
      winner: teamSide === "A" ? match.team_a_id : match.team_b_id,
      endedBy: "SUDDEN_DEATH",
    };
  }

  let newScoreA = match.score_team_a;
  let newScoreB = match.score_team_b;

  if (teamSide === "A") newScoreA += points;
  else newScoreB += points;

  // Race to 100 — check both sides (mistake could push opponent over)
  if (newScoreA >= 100) {
    return {
      scoreTeamA: 100,
      scoreTeamB: newScoreB,
      ended: true,
      winner: match.team_a_id,
      endedBy: "SCORE",
    };
  }
  if (newScoreB >= 100) {
    return {
      scoreTeamA: newScoreA,
      scoreTeamB: 100,
      ended: true,
      winner: match.team_b_id,
      endedBy: "SCORE",
    };
  }

  return {
    scoreTeamA: newScoreA,
    scoreTeamB: newScoreB,
    ended: false,
    winner: null,
    endedBy: null,
  };
}

/**
 * Get the points value for a scoring event type.
 */
export function getScorePoints(type: "ball" | "black" | "mistake"): number {
  switch (type) {
    case "ball": return 10;
    case "black": return 30;
    case "mistake": return 10;
    default: return 0;
  }
}

/**
 * Determine which side receives points for a scoring event.
 * - ball/black: the scoring team gets points
 * - mistake: the OPPONENT gets points
 */
export function getScoreSide(
  eventTeam: "A" | "B",
  eventType: "ball" | "black" | "mistake"
): "A" | "B" {
  if (eventType === "mistake") {
    return eventTeam === "A" ? "B" : "A";
  }
  return eventTeam;
}

// ── Phase 4: Timer Engine ──

/**
 * Compute current timer state from stored start_time + duration.
 * Timer does NOT depend on frontend — pure server-side computation.
 */
export function computeTimerState(startTime: number, duration: number): TimerState {
  const now = Math.floor(Date.now() / 1000);
  const remaining = (startTime + duration) - now;

  return {
    remaining: Math.max(0, remaining),
    expired: remaining <= 0,
    danger: remaining > 0 && remaining <= 60,
  };
}

/**
 * Resolve a timer expiry:
 * - Higher score wins → ended_by = 'TIME'
 * - Tie → sudden death mode (match status changes, no winner yet)
 */
export function resolveTimerExpiry(match: EngineMatchRecord): ExpiryResult {
  if (match.score_team_a > match.score_team_b) {
    return { winner: match.team_a_id, endedBy: "TIME", suddenDeath: false };
  }
  if (match.score_team_b > match.score_team_a) {
    return { winner: match.team_b_id, endedBy: "TIME", suddenDeath: false };
  }
  // Tie → sudden death
  return { winner: null, endedBy: null, suddenDeath: true };
}

// ── Phase 7: Team Ranking ──

/**
 * Get head-to-head result between two teams.
 * Returns 1 if teamA won, -1 if teamB won, 0 if no match or draw.
 */
function getHeadToHead(
  teamAId: string,
  teamBId: string,
  matches: EngineMatchRecord[]
): number {
  for (const m of matches) {
    if (m.status !== "COMPLETED") continue;
    const isMatch =
      (m.team_a_id === teamAId && m.team_b_id === teamBId) ||
      (m.team_a_id === teamBId && m.team_b_id === teamAId);
    if (isMatch && m.winner_id) {
      if (m.winner_id === teamAId) return -1; // a wins → a sorts first
      if (m.winner_id === teamBId) return 1;  // b wins → b sorts first
    }
  }
  return 0;
}

/**
 * Rank teams for group standings / knockout seeding.
 * Priority: group_points → total_score → head-to-head
 */
export function rankTeams(
  teams: EngineTeamRecord[],
  matches: EngineMatchRecord[]
): RankedTeam[] {
  const sorted = [...teams].sort((a, b) => {
    // 1. group_points (wins count) — descending
    if (b.group_points !== a.group_points) return b.group_points - a.group_points;
    // 2. total_score (tie-breaker) — descending
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    // 3. head-to-head
    return getHeadToHead(a.id, b.id, matches);
  });

  return sorted.map((t, i) => ({ ...t, rank: i + 1 }));
}

// ── Phase 8: Knockout Generator ──

/**
 * Generate knockout bracket from ranked teams.
 * - 2 teams → direct Final
 * - 3 teams → Top 2 → Final (3rd eliminated)
 * - 4+ teams → Top 4 → Semi-finals → Final
 */
export function generateKnockoutBracket(rankedTeams: RankedTeam[]): KnockoutBracket {
  const count = rankedTeams.length;

  if (count < 2) {
    throw new Error("Need at least 2 teams for knockout");
  }

  if (count === 2) {
    return {
      semis: [],
      finals: [[rankedTeams[0].id, rankedTeams[1].id]],
    };
  }

  if (count === 3) {
    // Top 2 go to final, 3rd eliminated
    return {
      semis: [],
      finals: [[rankedTeams[0].id, rankedTeams[1].id]],
    };
  }

  // 4+ teams: Top 4 → Semis (1v4, 2v3) → Final
  const top4 = rankedTeams.slice(0, 4);
  return {
    semis: [
      [top4[0].id, top4[3].id], // 1st vs 4th
      [top4[1].id, top4[2].id], // 2nd vs 3rd
    ],
    finals: [], // Created after both semis complete
  };
}

// ── Phase 6: Team Addition Validation ──

/**
 * Check if a team can be added to the tournament.
 */
export function canAddTeam(
  phase: string,
  hasLiveMatch: boolean
): { allowed: boolean; reason?: string } {
  if (phase !== "GROUP" && phase !== "SETUP") {
    return { allowed: false, reason: "Can only add teams during SETUP or GROUP phase" };
  }
  if (hasLiveMatch) {
    return { allowed: false, reason: "Cannot add teams while a match is live" };
  }
  return { allowed: true };
}

// ── Phase 9: Host Explanation Generator ──

/**
 * Generate a human-readable explanation for a match.
 */
export function generateExplanation(
  phase: string,
  context: {
    maxPerTeam: number;
    byeTeamName?: string;
    teamAName: string;
    teamBName: string;
  }
): string {
  const lines: string[] = [];

  if (phase === "GROUP") {
    lines.push(`This match ensures each team plays exactly ${context.maxPerTeam} group matches.`);
    lines.push("No repeated opponents.");
    if (context.byeTeamName) {
      lines.push(`${context.byeTeamName} received a BYE due to odd team count.`);
    }
  } else if (phase === "SEMI") {
    lines.push(`Semi-final: ${context.teamAName} vs ${context.teamBName}.`);
    lines.push("Winner advances to the Final.");
  } else if (phase === "FINAL") {
    lines.push(`🏆 FINAL: ${context.teamAName} vs ${context.teamBName}.`);
    lines.push("Winner takes the championship!");
  }

  return lines.join(" ");
}
