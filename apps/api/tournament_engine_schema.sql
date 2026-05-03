-- Dynamic Tournament Engine Schema
-- Additive tables for state-driven tournament flow

CREATE TABLE IF NOT EXISTS engine_teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  name TEXT NOT NULL,
  matches_played INTEGER DEFAULT 0,
  group_points INTEGER DEFAULT 0,    -- Count of wins
  total_score INTEGER DEFAULT 0,     -- Tie-breaker (sum of match scores)
  bye_assigned INTEGER DEFAULT 0,    -- 0 or 1
  created_at TEXT NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

CREATE TABLE IF NOT EXISTS engine_matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'GROUP', -- GROUP | SEMI | FINAL
  team_a_id TEXT NOT NULL,
  team_b_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED', -- CREATED | LIVE | COMPLETED
  sudden_death INTEGER DEFAULT 0,         -- 1 if in sudden death
  start_time INTEGER,                      -- Unix timestamp
  duration INTEGER DEFAULT 600,            -- seconds
  score_team_a INTEGER DEFAULT 0,
  score_team_b INTEGER DEFAULT 0,
  winner_id TEXT,
  ended_by TEXT,                           -- 'TIME' | 'SCORE'
  explanation TEXT,                        -- Host guidance
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
