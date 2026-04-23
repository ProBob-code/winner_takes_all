-- Winner Takes All — D1 Schema
-- All tables for the pure Cloudflare architecture

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Wallets (one per user)
CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

-- Wallet transactions ledger
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id TEXT REFERENCES payments(id),
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  is_test INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_user ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_wallet ON wallet_transactions(wallet_id);

-- Tournaments
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  entry_fee_cents INTEGER NOT NULL DEFAULT 0,
  prize_pool_cents INTEGER NOT NULL DEFAULT 0,
  max_players INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  bracket_type TEXT NOT NULL DEFAULT 'single_elimination',
  bracket_state TEXT,
  platform_fee_percent INTEGER NOT NULL DEFAULT 7,
  team_size INTEGER NOT NULL DEFAULT 1,
  host_id TEXT REFERENCES users(id),
  tournament_type TEXT NOT NULL DEFAULT 'online',
  password TEXT,
  winner_id TEXT REFERENCES users(id),
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT,
  code TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_teams_tournament ON teams(tournament_id);

-- Participants (user ↔ tournament)
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'registered',
  seed INTEGER,
  total_score INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  eliminated_in_round INTEGER,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_participants_tournament ON participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON participants(user_id);

-- Matches
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL DEFAULT 1,
  match_order INTEGER NOT NULL DEFAULT 0,
  player1_id TEXT REFERENCES users(id),
  player2_id TEXT REFERENCES users(id),
  winner_id TEXT REFERENCES users(id),
  room_code TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  score_threshold INTEGER NOT NULL DEFAULT 40,
  player1_score INTEGER NOT NULL DEFAULT 0,
  player2_score INTEGER NOT NULL DEFAULT 0,
  player1_submitted_score INTEGER,
  player2_submitted_score INTEGER,
  scores_approved INTEGER NOT NULL DEFAULT 0,
  lifelines_used TEXT,
  result_meta TEXT,
  reschedules_remaining INTEGER NOT NULL DEFAULT 3,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id, round, match_order);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_order_id TEXT UNIQUE,
  provider_payment_id TEXT,
  provider_signature TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  is_test INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  tournament_id TEXT REFERENCES tournaments(id),
  match_id TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- Seed default tournaments
INSERT OR IGNORE INTO tournaments (id, name, entry_fee_cents, prize_pool_cents, max_players, status, bracket_type, bracket_state)
VALUES
  ('tournament_seed_friday', 'Friday Knockout', 100000, 800000, 8, 'open', 'single_elimination',
   '{"rounds":[{"name":"Quarterfinals","matches":4,"scoreThreshold":40},{"name":"Semifinals","matches":2,"scoreThreshold":50},{"name":"Final","matches":1,"scoreThreshold":60}]}'),
  ('tournament_seed_sunday', 'Sunday Free Cup', 0, 250000, 8, 'open', 'single_elimination',
   '{"rounds":[{"name":"Quarterfinals","matches":4,"scoreThreshold":40},{"name":"Semifinals","matches":2,"scoreThreshold":50},{"name":"Final","matches":1,"scoreThreshold":60}]}');
