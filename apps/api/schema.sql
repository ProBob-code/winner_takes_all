-- WTA Full D1 Schema
-- Run with: wrangler d1 execute winner-takes-all-db --file=./schema.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  payment_id TEXT,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL DEFAULT 0,
  reference_type TEXT NOT NULL DEFAULT '',
  reference_id TEXT NOT NULL DEFAULT '',
  is_test INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  entry_fee_cents INTEGER NOT NULL DEFAULT 0,
  prize_pool_cents INTEGER NOT NULL DEFAULT 0,
  max_players INTEGER NOT NULL DEFAULT 8,
  status TEXT NOT NULL DEFAULT 'open',
  bracket_type TEXT NOT NULL DEFAULT 'single_elimination',
  bracket_state TEXT,
  platform_fee_percent INTEGER NOT NULL DEFAULT 7,
  team_size INTEGER NOT NULL DEFAULT 1,
  host_id TEXT,
  tournament_type TEXT NOT NULL DEFAULT 'online',
  sport TEXT NOT NULL DEFAULT '8BALL',
  password TEXT,
  winner_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  max_matches_per_team INTEGER DEFAULT 2,
  -- Set when this tournament is one week of a series; null for a one-off.
  series_id TEXT,
  series_week INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (host_id) REFERENCES users(id)
);

-- ── Weekly series (a season made of one tournament per week) ──

CREATE TABLE IF NOT EXISTS series (
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
  updated_at TEXT NOT NULL,
  FOREIGN KEY (host_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS series_members (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  FOREIGN KEY (series_id) REFERENCES series(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_series_host ON series(host_id);
CREATE INDEX IF NOT EXISTS idx_series_status ON series(status, next_event_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_series_members_unique ON series_members(series_id, user_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_series ON tournaments(series_id, series_week);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  team_id TEXT,
  status TEXT NOT NULL DEFAULT 'registered',
  seed INTEGER,
  total_score INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  eliminated_in_round INTEGER,
  joined_at TEXT NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  match_order INTEGER NOT NULL,
  player1_id TEXT,
  player2_id TEXT,
  winner_id TEXT,
  room_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  score_threshold INTEGER NOT NULL DEFAULT 40,
  player1_score INTEGER NOT NULL DEFAULT 0,
  player2_score INTEGER NOT NULL DEFAULT 0,
  player1_submitted_score INTEGER,
  player2_submitted_score INTEGER,
  scores_approved INTEGER NOT NULL DEFAULT 0,
  lifelines_used TEXT,
  reschedules_remaining INTEGER NOT NULL DEFAULT 2,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  name TEXT,
  code TEXT,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_order_id TEXT,
  provider_payment_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  is_test INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  tournament_id TEXT,
  match_id TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_user ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_tournament ON participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON participants(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(player1_id, player2_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_order ON payments(provider_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_unique ON participants(tournament_id, user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txns_user ON wallet_transactions(user_id, created_at DESC);

-- ── Dynamic tournament engine ──

CREATE TABLE IF NOT EXISTS engine_teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  name TEXT NOT NULL,
  -- Which account this competitor is, so a season table can add a player's
  -- weeks together. Null for a team the host typed in by hand.
  user_id TEXT,
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

-- ── Public arenas (shareable local score trackers) ──

CREATE TABLE IF NOT EXISTS public_arenas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state_json TEXT NOT NULL,
  pin TEXT,
  owner_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
