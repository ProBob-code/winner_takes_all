/**
 * D1 database adapter for the Dynamic Tournament Engine tables.
 * Follows the same pattern as d1-store.ts.
 */

import { createId } from "./crypto";

// ── Record types ──

export interface EngineTeamRecord {
  id: string;
  tournament_id: string;
  name: string;
  matches_played: number;
  group_points: number;
  total_score: number;
  bye_assigned: number; // 0 or 1
  created_at: string;
}

export interface EngineMatchRecord {
  id: string;
  tournament_id: string;
  phase: string; // GROUP | SEMI | FINAL
  team_a_id: string;
  team_b_id: string;
  status: string; // CREATED | LIVE | SUDDEN_DEATH | COMPLETED
  start_time: number | null;
  duration: number;
  score_team_a: number;
  score_team_b: number;
  winner_id: string | null;
  ended_by: string | null; // SCORE | TIME | SUDDEN_DEATH
  sudden_death: number; // 0 or 1
  match_order: number;
  explanation: string | null;
  created_at: string;
}

export interface EngineMatchupRecord {
  id: string;
  tournament_id: string;
  team1_id: string;
  team2_id: string;
  match_id: string;
}

// ── Engine Store ──

export class EngineStore {
  constructor(private db: D1Database) {}

  // ── Teams ──

  async createEngineTeam(tournamentId: string, name: string): Promise<EngineTeamRecord> {
    const id = createId("eteam");
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO engine_teams (id, tournament_id, name, matches_played, group_points, total_score, bye_assigned, created_at)
       VALUES (?, ?, ?, 0, 0, 0, 0, ?)`
    ).bind(id, tournamentId, name, now).run();
    return {
      id, tournament_id: tournamentId, name,
      matches_played: 0, group_points: 0, total_score: 0,
      bye_assigned: 0, created_at: now,
    };
  }

  async getEngineTeams(tournamentId: string): Promise<EngineTeamRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM engine_teams WHERE tournament_id = ? ORDER BY group_points DESC, total_score DESC, name ASC`
    ).bind(tournamentId).all<any>();
    return results as EngineTeamRecord[];
  }

  async getEngineTeam(teamId: string): Promise<EngineTeamRecord | null> {
    const r = await this.db.prepare(
      `SELECT * FROM engine_teams WHERE id = ?`
    ).bind(teamId).first<any>();
    return r as EngineTeamRecord | null;
  }

  async updateEngineTeam(teamId: string, updates: Partial<EngineTeamRecord>): Promise<void> {
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (k === "id" || k === "tournament_id" || k === "created_at") continue;
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    if (sets.length === 0) return;
    vals.push(teamId);
    await this.db.prepare(
      `UPDATE engine_teams SET ${sets.join(", ")} WHERE id = ?`
    ).bind(...vals).run();
  }

  async incrementTeamStats(
    teamId: string,
    matchesPlayedInc: number,
    groupPointsInc: number,
    totalScoreInc: number
  ): Promise<void> {
    await this.db.prepare(
      `UPDATE engine_teams SET
        matches_played = matches_played + ?,
        group_points = group_points + ?,
        total_score = total_score + ?
       WHERE id = ?`
    ).bind(matchesPlayedInc, groupPointsInc, totalScoreInc, teamId).run();
  }

  async deleteEngineTeam(teamId: string): Promise<void> {
    await this.db.prepare(`DELETE FROM engine_teams WHERE id = ?`).bind(teamId).run();
  }

  // ── Matches ──

  async createEngineMatch(data: {
    tournamentId: string;
    phase: string;
    teamAId: string;
    teamBId: string;
    duration: number;
    matchOrder: number;
    explanation?: string;
  }): Promise<EngineMatchRecord> {
    const id = createId("ematch");
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO engine_matches (id, tournament_id, phase, team_a_id, team_b_id, status, duration, match_order, explanation, created_at)
       VALUES (?, ?, ?, ?, ?, 'CREATED', ?, ?, ?, ?)`
    ).bind(
      id, data.tournamentId, data.phase, data.teamAId, data.teamBId,
      data.duration, data.matchOrder, data.explanation ?? null, now
    ).run();
    return (await this.getEngineMatch(id))!;
  }

  async getEngineMatch(matchId: string): Promise<EngineMatchRecord | null> {
    const r = await this.db.prepare(
      `SELECT * FROM engine_matches WHERE id = ?`
    ).bind(matchId).first<any>();
    return r as EngineMatchRecord | null;
  }

  async getEngineMatches(tournamentId: string): Promise<EngineMatchRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM engine_matches WHERE tournament_id = ? ORDER BY match_order ASC`
    ).bind(tournamentId).all<any>();
    return results as EngineMatchRecord[];
  }

  async getEngineMatchesByPhase(tournamentId: string, phase: string): Promise<EngineMatchRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM engine_matches WHERE tournament_id = ? AND phase = ? ORDER BY match_order ASC`
    ).bind(tournamentId, phase).all<any>();
    return results as EngineMatchRecord[];
  }

  async getLiveMatch(tournamentId: string): Promise<EngineMatchRecord | null> {
    const r = await this.db.prepare(
      `SELECT * FROM engine_matches WHERE tournament_id = ? AND (status = 'LIVE' OR status = 'SUDDEN_DEATH') LIMIT 1`
    ).bind(tournamentId).first<any>();
    return r as EngineMatchRecord | null;
  }

  async getNextCreatedMatch(tournamentId: string): Promise<EngineMatchRecord | null> {
    const r = await this.db.prepare(
      `SELECT * FROM engine_matches WHERE tournament_id = ? AND status = 'CREATED' ORDER BY match_order ASC LIMIT 1`
    ).bind(tournamentId).first<any>();
    return r as EngineMatchRecord | null;
  }

  async updateEngineMatch(matchId: string, updates: Record<string, any>): Promise<void> {
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (k === "id" || k === "tournament_id" || k === "created_at") continue;
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    if (sets.length === 0) return;
    vals.push(matchId);
    await this.db.prepare(
      `UPDATE engine_matches SET ${sets.join(", ")} WHERE id = ?`
    ).bind(...vals).run();
  }

  async getMaxMatchOrder(tournamentId: string): Promise<number> {
    const r = await this.db.prepare(
      `SELECT MAX(match_order) as max_order FROM engine_matches WHERE tournament_id = ?`
    ).bind(tournamentId).first<any>();
    return r?.max_order ?? 0;
  }

  // ── Matchups ──

  async getMatchups(tournamentId: string): Promise<EngineMatchupRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM engine_matchups WHERE tournament_id = ?`
    ).bind(tournamentId).all<any>();
    return results as EngineMatchupRecord[];
  }

  async createMatchup(tournamentId: string, team1Id: string, team2Id: string, matchId: string): Promise<void> {
    const id = createId("ematchup");
    // Always store in sorted order for consistent lookup
    const [a, b] = [team1Id, team2Id].sort();
    await this.db.prepare(
      `INSERT INTO engine_matchups (id, tournament_id, team1_id, team2_id, match_id) VALUES (?, ?, ?, ?, ?)`
    ).bind(id, tournamentId, a, b, matchId).run();
  }

  async haveTeamsPlayed(tournamentId: string, team1Id: string, team2Id: string): Promise<boolean> {
    const [a, b] = [team1Id, team2Id].sort();
    const r = await this.db.prepare(
      `SELECT id FROM engine_matchups WHERE tournament_id = ? AND team1_id = ? AND team2_id = ? LIMIT 1`
    ).bind(tournamentId, a, b).first<any>();
    return !!r;
  }

  // ── Tournament Phase ──

  async getTournamentPhase(tournamentId: string): Promise<string | null> {
    const r = await this.db.prepare(
      `SELECT status FROM tournaments WHERE id = ?`
    ).bind(tournamentId).first<any>();
    return r?.status ?? null;
  }

  async setTournamentPhase(tournamentId: string, phase: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.prepare(
      `UPDATE tournaments SET status = ?, updated_at = ? WHERE id = ?`
    ).bind(phase, now, tournamentId).run();
  }
}
