-- Dynamic Tournament Engine Schema
-- Run with: wrangler d1 execute winner-takes-all-db --file=./tournament_engine_schema.sql

CREATE TABLE IF NOT EXISTS engine_teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  name TEXT NOT NULL,
  matches_played INTEGER NOT NULL DEFAULT 0,
  group_points INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  bye_assigned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

CREATE TABLE IF NOT EXISTS engine_matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'GROUP',
  team_a_id TEXT NOT NULL,
  team_b_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED',
  start_time INTEGER,
  duration INTEGER NOT NULL DEFAULT 600,
  score_team_a INTEGER NOT NULL DEFAULT 0,
  score_team_b INTEGER NOT NULL DEFAULT 0,
  winner_id TEXT,
  ended_by TEXT,
  sudden_death INTEGER NOT NULL DEFAULT 0,
  match_order INTEGER NOT NULL DEFAULT 0,
  explanation TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  FOREIGN KEY (team_a_id) REFERENCES engine_teams(id),
  FOREIGN KEY (team_b_id) REFERENCES engine_teams(id)
);

CREATE TABLE IF NOT EXISTS engine_matchups (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  team1_id TEXT NOT NULL,
  team2_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

CREATE INDEX IF NOT EXISTS idx_engine_teams_tournament ON engine_teams(tournament_id);
CREATE INDEX IF NOT EXISTS idx_engine_matches_tournament ON engine_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_engine_matchups_tournament ON engine_matchups(tournament_id);
