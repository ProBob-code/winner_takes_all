/**
 * Make sure the tables the engine and series need actually exist.
 *
 * WHY THIS EXISTS
 * These tables were added to schema.sql, which only runs in full when a
 * database is first provisioned, and were never given a migration. A database
 * created before them therefore never gains them, and every engine route fails
 * with "no such table: engine_teams" — which is what stopped a host starting a
 * tournament at all.
 *
 * The migration files remain the proper way to apply this, and are still the
 * record of what changed. This is the safety net for the case where they have
 * not been run: rather than serving an error that asks an operator to go and
 * run something, the API creates what it is missing and carries on.
 *
 * Everything here is additive and idempotent. CREATE ... IF NOT EXISTS cannot
 * disturb a table that already exists, and the ALTERs are expected to fail on
 * a database that already has the column — that failure is swallowed. Nothing
 * in this file drops, rewrites or backfills anything, so it can never cost
 * data.
 *
 * Kept deliberately in step with apps/api/migrations/0006_engine_tables.sql,
 * 0007_series.sql and 0009_engine_houses.sql; apps/api/migrations/rehearse.py
 * and rehearse_bootstrap.py check the SQL runs.
 */

/** Tables and indexes. Safe to run any number of times. */
const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS engine_teams (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    name TEXT NOT NULL,
    user_id TEXT,
    matches_played INTEGER DEFAULT 0,
    group_points INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    bye_assigned INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS engine_matches (
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
    team_a_house TEXT DEFAULT 'SOLID',
    team_b_house TEXT DEFAULT 'STRIPES',
    start_time INTEGER,
    duration INTEGER DEFAULT 600,
    score_team_a INTEGER DEFAULT 0,
    score_team_b INTEGER DEFAULT 0,
    winner_id TEXT,
    ended_by TEXT,
    explanation TEXT,
    match_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS engine_matchups (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    team1_id TEXT NOT NULL,
    team2_id TEXT NOT NULL,
    match_id TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS series (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host_id TEXT NOT NULL,
    sport TEXT NOT NULL DEFAULT '8BALL',
    bracket_type TEXT NOT NULL DEFAULT 'single_elimination',
    tournament_type TEXT NOT NULL DEFAULT 'online',
    entry_fee_cents INTEGER NOT NULL DEFAULT 0,
    max_players INTEGER NOT NULL DEFAULT 8,
    team_size INTEGER NOT NULL DEFAULT 1,
    roster_mode TEXT NOT NULL DEFAULT 'open',
    cadence_days INTEGER NOT NULL DEFAULT 7,
    next_event_at TEXT,
    weeks_created INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    password TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS series_members (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_engine_teams_tournament ON engine_teams(tournament_id)`,
  `CREATE INDEX IF NOT EXISTS idx_engine_matches_tournament ON engine_matches(tournament_id)`,
  `CREATE INDEX IF NOT EXISTS idx_engine_matches_order ON engine_matches(tournament_id, match_order)`,
  `CREATE INDEX IF NOT EXISTS idx_engine_matchups_tournament ON engine_matchups(tournament_id)`,
  `CREATE INDEX IF NOT EXISTS idx_series_host ON series(host_id)`,
  `CREATE INDEX IF NOT EXISTS idx_series_status ON series(status, next_event_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_series_members_unique ON series_members(series_id, user_id)`,
];

/**
 * Columns added to tables that already existed.
 *
 * SQLite has no ADD COLUMN IF NOT EXISTS, so each of these fails with
 * "duplicate column name" once it has been applied. That is the expected
 * steady state, and is ignored.
 */
const ADD_COLUMN_STATEMENTS = [
  `ALTER TABLE tournaments ADD COLUMN series_id TEXT`,
  `ALTER TABLE tournaments ADD COLUMN series_week INTEGER`,
  `ALTER TABLE engine_teams ADD COLUMN user_id TEXT`,
  `ALTER TABLE engine_matches ADD COLUMN fouls_a INTEGER DEFAULT 0`,
  `ALTER TABLE engine_matches ADD COLUMN fouls_b INTEGER DEFAULT 0`,
  `ALTER TABLE engine_matches ADD COLUMN team_a_house TEXT DEFAULT 'SOLID'`,
  `ALTER TABLE engine_matches ADD COLUMN team_b_house TEXT DEFAULT 'STRIPES'`,
];

const INDEX_AFTER_COLUMNS = [
  `CREATE INDEX IF NOT EXISTS idx_tournaments_series ON tournaments(series_id, series_week)`,
];

/** An ALTER that has already been applied, which is not a problem. */
function isAlreadyApplied(err: unknown): boolean {
  const detail = err instanceof Error ? err.message : String(err);
  return /duplicate column name|already exists/i.test(detail);
}

/**
 * Whether this isolate has already checked. The work is idempotent, so the
 * flag is only there to keep a dozen DDL statements off every request; a new
 * isolate simply checks again.
 */
let checked = false;

export async function ensureEngineSchema(db: D1Database): Promise<void> {
  if (checked) return;

  for (const sql of CREATE_STATEMENTS) {
    await db.prepare(sql).run();
  }

  for (const sql of [...ADD_COLUMN_STATEMENTS, ...INDEX_AFTER_COLUMNS]) {
    try {
      await db.prepare(sql).run();
    } catch (err) {
      if (!isAlreadyApplied(err)) throw err;
    }
  }

  checked = true;
}

/** Test seam: forget that this isolate has checked. */
export function resetEngineSchemaCheck(): void {
  checked = false;
}

export const ENGINE_SCHEMA_SQL = {
  creates: CREATE_STATEMENTS,
  addColumns: ADD_COLUMN_STATEMENTS,
  indexes: INDEX_AFTER_COLUMNS,
};
