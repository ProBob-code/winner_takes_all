-- Create the dynamic tournament engine tables, and add the foul counters.
--
-- WHY THIS EXISTS
-- engine_teams, engine_matches and engine_matchups were added to schema.sql
-- (commit badba7e) but never given a migration. schema.sql creates every table
-- with CREATE TABLE IF NOT EXISTS and is only run in full at provisioning, so
-- a database created before that commit never gained them. Every engine route
-- then fails with "no such table: engine_teams":
--
--   * POST /api/engine/tournaments/:id/start  -> 500 "Internal server error",
--     which is why a host cannot start a tournament at all.
--   * GET  /api/engine/tournaments/:id/state  -> 500, which the tournament page
--     swallows, so the arena silently never appears.
--
-- fouls_a / fouls_b are new: the arena records a foul against the team that
-- committed it while awarding the points to their opponent, so the count has
-- to live somewhere.
--
-- HOW TO USE
-- Safe to run more than once. The CREATE statements are IF NOT EXISTS, and the
-- two ALTERs fail harmlessly with "duplicate column name: fouls_a" when the
-- columns are already there — run them only if this check lists no fouls_a:
--
--   wrangler d1 execute winner-takes-all-db --remote \
--     --command "PRAGMA table_info(engine_matches);"
--
--   wrangler d1 execute winner-takes-all-db --remote \
--     --file=./migrations/0006_engine_tables.sql

CREATE TABLE IF NOT EXISTS engine_teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  name TEXT NOT NULL,
  matches_played INTEGER DEFAULT 0,
  group_points INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,
  bye_assigned INTEGER DEFAULT 0,
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
  sudden_death INTEGER DEFAULT 0,
  active_team_id TEXT,
  balls_potted_a INTEGER DEFAULT 0,
  balls_potted_b INTEGER DEFAULT 0,
  black_potted_a INTEGER DEFAULT 0,
  black_potted_b INTEGER DEFAULT 0,
  fouls_a INTEGER DEFAULT 0,
  fouls_b INTEGER DEFAULT 0,
  start_time INTEGER,
  duration INTEGER DEFAULT 600,
  score_team_a INTEGER DEFAULT 0,
  score_team_b INTEGER DEFAULT 0,
  winner_id TEXT,
  ended_by TEXT,
  explanation TEXT,
  match_order INTEGER DEFAULT 0,
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
CREATE INDEX IF NOT EXISTS idx_engine_matches_order ON engine_matches(tournament_id, match_order);
CREATE INDEX IF NOT EXISTS idx_engine_matchups_tournament ON engine_matchups(tournament_id);

-- Only needed when engine_matches already existed without the foul counters.
ALTER TABLE engine_matches ADD COLUMN fouls_a INTEGER DEFAULT 0;
ALTER TABLE engine_matches ADD COLUMN fouls_b INTEGER DEFAULT 0;
