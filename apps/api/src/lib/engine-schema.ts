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
 * 0007_series.sql, 0009_engine_houses.sql, 0010_wallet_description.sql,
 * 0011_payouts_and_bonus.sql, 0012_venues_offline_and_billing.sql,
 * 0013_wta_coins.sql, 0014_player_loadout.sql and 0015_trophies.sql;
 * apps/api/migrations/rehearse.py and
 * rehearse_bootstrap.py check the SQL runs.
 */

/** Tables and indexes. Safe to run any number of times. */
const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS payout_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    fee_cents INTEGER NOT NULL,
    net_cents INTEGER NOT NULL,
    destination TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,
    processed_by TEXT,
    processed_at TEXT,
    created_at TEXT NOT NULL
  )`,
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

  // ── Offline-first scoring ──
  // A score tap is an increment, so replaying one from a client's outbox would
  // count a second ball. The client mints an id per tap; this table makes the
  // replay a no-op instead.
  `CREATE TABLE IF NOT EXISTS engine_score_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_score_events_match ON engine_score_events(match_id, created_at)`,

  // ── Both players confirm the frame ──
  // One row per side. The unique index is the mechanism: a second tap from the
  // same side cannot stand in for the other player.
  `CREATE TABLE IF NOT EXISTS engine_frame_confirmations (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    user_id TEXT,
    agreed_winner_id TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_frame_confirm_unique ON engine_frame_confirmations(match_id, team_id)`,

  // ── Join by QR ──
  `CREATE TABLE IF NOT EXISTS tournament_join_codes (
    code TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    created_by TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_join_codes_tournament ON tournament_join_codes(tournament_id)`,

  // ── Chains, venues and the staff who run a night ──
  `CREATE TABLE IF NOT EXISTS chains (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chains_owner ON chains(owner_id)`,
  `CREATE TABLE IF NOT EXISTS venues (
    id TEXT PRIMARY KEY,
    chain_id TEXT,
    name TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    owner_id TEXT NOT NULL,
    whatsapp_group TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_venues_owner ON venues(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_venues_chain ON venues(chain_id)`,
  `CREATE TABLE IF NOT EXISTS venue_members (
    id TEXT PRIMARY KEY,
    venue_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_members_unique ON venue_members(venue_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_venue_members_user ON venue_members(user_id)`,

  // ── Subscription billing ──
  // Business software billed to a venue. Deliberately NOT gated by
  // STAKES_ENABLED: a venue paying for a scoreboard is a B2B sale, not a
  // player paying to enter a game. See lib/billing.ts.
  `CREATE TABLE IF NOT EXISTS venue_subscriptions (
    id TEXT PRIMARY KEY,
    venue_id TEXT,
    chain_id TEXT,
    user_id TEXT NOT NULL,
    plan_code TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'razorpay',
    provider_subscription_id TEXT,
    provider_plan_id TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    amount_cents INTEGER NOT NULL DEFAULT 0,
    interval_months INTEGER NOT NULL DEFAULT 1,
    current_period_end TEXT,
    trial_ends_at TEXT,
    cancelled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_subs_venue ON venue_subscriptions(venue_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_subs_chain ON venue_subscriptions(chain_id, status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_subs_provider ON venue_subscriptions(provider_subscription_id)`,
  // Every billing webhook, kept once. The unique index on the provider's event
  // id is what stops a redelivered webhook extending a period twice.
  `CREATE TABLE IF NOT EXISTS subscription_events (
    id TEXT PRIMARY KEY,
    subscription_id TEXT,
    provider_event_id TEXT,
    event TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_events_provider ON subscription_events(provider_event_id)`,

  // ── The WTA Coin ──
  // Deliberately separate from wallets and wallet_transactions, and never
  // joined to them. A coin cannot be bought, cashed out, transferred or
  // wagered, and there is no exchange rate between the two ledgers; keeping
  // them apart in the schema is what makes that structural rather than a
  // convention. See lib/coins.ts.
  `CREATE TABLE IF NOT EXISTS coin_balances (
    user_id TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    lifetime INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS coin_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description TEXT,
    reference_type TEXT,
    reference_id TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_coin_ledger_user ON coin_ledger(user_id, created_at DESC)`,
  // Stops one frame paying twice when a client replays its outbox, a poll
  // settles a match a second time, or a host restarts and re-finishes a frame.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_ledger_once ON coin_ledger(user_id, reason, reference_type, reference_id)`,
  `CREATE INDEX IF NOT EXISTS idx_coin_balances_rank ON coin_balances(balance DESC)`,
  // What a player shows: the avatar now, the rest of the loadout later.
  `CREATE TABLE IF NOT EXISTS player_loadout (
    user_id TEXT PRIMARY KEY,
    avatar TEXT,
    border_id TEXT,
    sticker_id TEXT,
    showcase TEXT NOT NULL DEFAULT '[]',
    emote_deck TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  )`,
  // Trophies, apart from coins: a standing, never a currency.
  `CREATE TABLE IF NOT EXISTS player_trophies (
    user_id TEXT NOT NULL,
    track TEXT NOT NULL,
    trophies INTEGER NOT NULL DEFAULT 0 CHECK (trophies >= 0),
    peak INTEGER NOT NULL DEFAULT 0,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, track)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_player_trophies_ladder ON player_trophies(track, trophies DESC)`,
  `CREATE TABLE IF NOT EXISTS trophy_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    track TEXT NOT NULL,
    delta INTEGER NOT NULL,
    trophies_after INTEGER NOT NULL,
    won INTEGER NOT NULL,
    opponent_key TEXT NOT NULL,
    reference_type TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_trophy_ledger_once ON trophy_ledger(user_id, track, reference_type, reference_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trophy_ledger_user ON trophy_ledger(user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS online_games (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    sport TEXT NOT NULL,
    ai_rating INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    result TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_online_games_open ON online_games(user_id, finished_at, started_at)`,
];

/**
 * Columns added to tables that already existed.
 *
 * SQLite has no ADD COLUMN IF NOT EXISTS, so each of these fails with
 * "duplicate column name" once it has been applied. That is the expected
 * steady state, and is ignored.
 */
const ADD_COLUMN_STATEMENTS = [
  // The part of a balance that was given rather than deposited or won. It can
  // be staked, but it can never be withdrawn.
  `ALTER TABLE wallets ADD COLUMN bonus_cents INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tournaments ADD COLUMN series_id TEXT`,
  `ALTER TABLE tournaments ADD COLUMN series_week INTEGER`,
  `ALTER TABLE engine_teams ADD COLUMN user_id TEXT`,
  `ALTER TABLE engine_matches ADD COLUMN fouls_a INTEGER DEFAULT 0`,
  `ALTER TABLE engine_matches ADD COLUMN fouls_b INTEGER DEFAULT 0`,
  `ALTER TABLE engine_matches ADD COLUMN team_a_house TEXT DEFAULT 'SOLID'`,
  `ALTER TABLE engine_matches ADD COLUMN team_b_house TEXT DEFAULT 'STRIPES'`,
  // Prize payouts are written from the engine routes, and say in the ledger
  // which tournament the money came from and how it was shared.
  `ALTER TABLE wallet_transactions ADD COLUMN description TEXT`,
  // A tournament belongs to the venue that ran it, once venues exist.
  `ALTER TABLE tournaments ADD COLUMN venue_id TEXT`,
  `ALTER TABLE series ADD COLUMN venue_id TEXT`,
  // Whether a frame has to be agreed by both players before it counts.
  `ALTER TABLE tournaments ADD COLUMN require_frame_confirmation INTEGER NOT NULL DEFAULT 0`,
  // Decided, but not yet agreed: COMPLETED for the clock's purposes and still
  // unsettled for the table's.
  `ALTER TABLE engine_matches ADD COLUMN awaiting_confirmation INTEGER DEFAULT 0`,
  // A walk-in who joined by QR is named, not identified. Kept apart from
  // user_id so a season table never credits their wins to a member.
  `ALTER TABLE engine_teams ADD COLUMN guest_label TEXT`,
];

const INDEX_AFTER_COLUMNS = [
  `CREATE INDEX IF NOT EXISTS idx_tournaments_series ON tournaments(series_id, series_week)`,
  `CREATE INDEX IF NOT EXISTS idx_payouts_user ON payout_requests(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_payouts_status ON payout_requests(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_tournaments_venue ON tournaments(venue_id, created_at DESC)`,
];

/**
 * An ALTER there is nothing to do about, which is not a problem: the column is
 * already there, or the table it belongs to is not part of this database at
 * all. The CREATEs above run first and still throw if they fail.
 */
function isAlreadyApplied(err: unknown): boolean {
  const detail = err instanceof Error ? err.message : String(err);
  return /duplicate column name|already exists|no such table/i.test(detail);
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
