-- Phases 1 and 2: the venue becomes the customer, scoring survives the network,
-- and a frame is agreed by the players rather than typed by the owner.
--
-- Everything here is additive. The ALTERs fail with "duplicate column name" on
-- a database that already has them, which is the expected steady state and is
-- swallowed by lib/engine-schema.ts. Nothing drops, rewrites or backfills.

-- ── 1.2 Offline-first scoring ───────────────────────────────────────────────
-- A score tap is an increment, so replaying one double-counts it. The client
-- mints an id per tap and keeps it in its outbox across reloads and flight
-- mode; this table is what makes a replay a no-op rather than a second ball.
CREATE TABLE IF NOT EXISTS engine_score_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_score_events_match ON engine_score_events (match_id, created_at);

-- ── 1.3 Both players confirm the frame ──────────────────────────────────────
-- One row per side per match. The unique index is the whole mechanism: a
-- second tap from the same side cannot stand in for the other player.
CREATE TABLE IF NOT EXISTS engine_frame_confirmations (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    user_id TEXT,
    agreed_winner_id TEXT,
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frame_confirm_unique ON engine_frame_confirmations (match_id, team_id);

-- ── 1.7 Join by QR ──────────────────────────────────────────────────────────
-- A short code a player scans off the screen. No account, no wallet.
CREATE TABLE IF NOT EXISTS tournament_join_codes (
    code TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    created_by TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_join_codes_tournament ON tournament_join_codes (tournament_id);

-- ── 2.3 Chains ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chains (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chains_owner ON chains (owner_id);

-- ── 2.1 Venue accounts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venues (
    id TEXT PRIMARY KEY,
    chain_id TEXT,
    name TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    owner_id TEXT NOT NULL,
    -- The group chat results are pushed into. Venues already run their
    -- tournaments through one; see 1.4.
    whatsapp_group TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_venues_owner ON venues (owner_id);

CREATE INDEX IF NOT EXISTS idx_venues_chain ON venues (chain_id);

-- Staff who may run a night at this venue without owning the account.
CREATE TABLE IF NOT EXISTS venue_members (
    id TEXT PRIMARY KEY,
    venue_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_members_unique ON venue_members (venue_id, user_id);

CREATE INDEX IF NOT EXISTS idx_venue_members_user ON venue_members (user_id);

-- ── 2.2 Subscription billing ────────────────────────────────────────────────
-- Business software billed to a venue. This is NOT a stake and is deliberately
-- not gated by STAKES_ENABLED: a venue paying for a scoreboard is an ordinary
-- B2B sale, not a player paying to enter a game. It has its own switch,
-- BILLING_ENABLED, so a deployment without Razorpay keys does not offer it.
CREATE TABLE IF NOT EXISTS venue_subscriptions (
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
);

CREATE INDEX IF NOT EXISTS idx_subs_venue ON venue_subscriptions (venue_id, status);

CREATE INDEX IF NOT EXISTS idx_subs_chain ON venue_subscriptions (chain_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subs_provider ON venue_subscriptions (provider_subscription_id);

-- Every billing webhook, kept once. The unique index on the provider's event
-- id is what stops a redelivered webhook extending a period twice.
CREATE TABLE IF NOT EXISTS subscription_events (
    id TEXT PRIMARY KEY,
    subscription_id TEXT,
    provider_event_id TEXT,
    event TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_events_provider ON subscription_events (provider_event_id);

-- ── Columns on tables that already existed ──────────────────────────────────
ALTER TABLE tournaments ADD COLUMN venue_id TEXT;

ALTER TABLE tournaments
ADD COLUMN require_frame_confirmation INTEGER NOT NULL DEFAULT 0;

ALTER TABLE series ADD COLUMN venue_id TEXT;

-- A match whose result is decided but not yet agreed by both players. It is
-- COMPLETED for the clock's purposes and still unsettled for the table's.
ALTER TABLE engine_matches ADD COLUMN awaiting_confirmation INTEGER DEFAULT 0;

-- A team that joined by QR has no account, so its player is named rather than
-- identified. Kept distinct from user_id so the season table never credits a
-- walk-in's wins to a member.
ALTER TABLE engine_teams ADD COLUMN guest_label TEXT;

CREATE INDEX IF NOT EXISTS idx_tournaments_venue ON tournaments (venue_id, created_at DESC);
