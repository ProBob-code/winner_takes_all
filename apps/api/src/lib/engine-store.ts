import { createId } from "./crypto";
import { EngineTeam, EngineMatch, MatchupRecord, TournamentPhase } from "./tournament-engine";

export class EngineStore {
  constructor(private db: D1Database) {}

  // --- Teams ---

  async createTeam(tournamentId: string, name: string): Promise<EngineTeam> {
    const id = createId("eteam");
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO engine_teams (id, tournament_id, name, created_at) VALUES (?, ?, ?, ?)`
    ).bind(id, tournamentId, name, now).run();
    
    return {
      id,
      name,
      matches_played: 0,
      group_points: 0,
      total_score: 0,
      bye_assigned: false
    };
  }

  async getTeams(tournamentId: string): Promise<EngineTeam[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM engine_teams WHERE tournament_id = ?`
    ).bind(tournamentId).all<any>();
    
    return results.map(r => ({
      ...r,
      bye_assigned: !!r.bye_assigned
    }));
  }

  async updateTeam(teamId: string, updates: Partial<EngineTeam>): Promise<void> {
    const sets: string[] = [];
    const vals: any[] = [];
    
    for (const [k, v] of Object.entries(updates)) {
      if (k === 'id') continue;
      sets.push(`${k} = ?`);
      vals.push(k === 'bye_assigned' ? (v ? 1 : 0) : v);
    }
    
    if (sets.length === 0) return;
    
    vals.push(teamId);
    await this.db.prepare(
      `UPDATE engine_teams SET ${sets.join(", ")} WHERE id = ?`
    ).bind(...vals).run();
  }

  // --- Matches ---

  async createMatch(tournamentId: string, data: Partial<EngineMatch>): Promise<EngineMatch> {
    const id = createId("ematch");
    const now = new Date().toISOString();
    
    await this.db.prepare(
      `INSERT INTO engine_matches (
        id, tournament_id, phase, team_a_id, team_b_id, status, 
        sudden_death, duration, explanation, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, 
      tournamentId, 
      data.phase || 'GROUP', 
      data.team_a_id, 
      data.team_b_id, 
      'CREATED',
      0,
      data.duration || 600,
      data.explanation || '',
      now
    ).run();

    return this.getMatch(id) as Promise<EngineMatch>;
  }

  async getMatch(matchId: string): Promise<EngineMatch | null> {
    const r = await this.db.prepare(
      `SELECT * FROM engine_matches WHERE id = ?`
    ).bind(matchId).first<any>();
    
    if (!r) return null;
    
    return {
      ...r,
      sudden_death: !!r.sudden_death,
      status: r.status as any,
      phase: r.phase as any
    };
  }

  async getMatches(tournamentId: string): Promise<EngineMatch[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM engine_matches WHERE tournament_id = ? ORDER BY created_at ASC`
    ).bind(tournamentId).all<any>();
    
    return results.map(r => ({
      ...r,
      sudden_death: !!r.sudden_death,
      status: r.status as any,
      phase: r.phase as any
    }));
  }

  async updateMatch(matchId: string, updates: Partial<EngineMatch>): Promise<void> {
    const sets: string[] = [];
    const vals: any[] = [];
    
    for (const [k, v] of Object.entries(updates)) {
      if (k === 'id') continue;
      sets.push(`${k} = ?`);
      vals.push(k === 'sudden_death' ? (v ? 1 : 0) : v);
    }
    
    if (sets.length === 0) return;
    
    vals.push(matchId);
    await this.db.prepare(
      `UPDATE engine_matches SET ${sets.join(", ")} WHERE id = ?`
    ).bind(...vals).run();
  }

  // --- Matchups ---

  async createMatchup(tournamentId: string, team1Id: string, team2Id: string, matchId: string): Promise<void> {
    const id = createId("emup");
    await this.db.prepare(
      `INSERT INTO engine_matchups (id, tournament_id, team1_id, team2_id, match_id) VALUES (?, ?, ?, ?, ?)`
    ).bind(id, tournamentId, team1Id, team2Id, matchId).run();
  }

  async getMatchups(tournamentId: string): Promise<MatchupRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT team1_id, team2_id FROM engine_matchups WHERE tournament_id = ?`
    ).bind(tournamentId).all<any>();
    return results;
  }

  // --- Tournament Phase ---

  async updateTournamentPhase(tournamentId: string, phase: TournamentPhase): Promise<void> {
    await this.db.prepare(
      `UPDATE tournaments SET status = ?, updated_at = ? WHERE id = ?`
    ).bind(phase, new Date().toISOString(), tournamentId).run();
  }
}
