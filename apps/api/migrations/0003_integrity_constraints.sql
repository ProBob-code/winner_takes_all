-- Integrity constraints for money and membership invariants.
--
-- IMPORTANT: schema.sql already includes all of these changes (the CHECK
-- constraint, both unique indexes, the wallet_transactions index, and
-- public_arenas.owner_id) for fresh installs. Only run this migration
-- against a database that was created BEFORE schema.sql was updated to
-- include them — e.g. an existing deployed/remote database. Running it
-- against a database freshly created from the current schema.sql will fail
-- with "duplicate column name: owner_id".
--
-- Run with: wrangler d1 execute winner-takes-all-db --remote --file=./migrations/0003_integrity_constraints.sql

-- 1. Rebuild wallets with a non-negative balance CHECK. Any transaction that
--    would overdraw a wallet now aborts atomically at the database level.
CREATE TABLE wallets_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
INSERT INTO wallets_new SELECT id, user_id, MAX(balance_cents, 0), created_at, updated_at FROM wallets;
DROP TABLE wallets;
ALTER TABLE wallets_new RENAME TO wallets;

-- 2. A user can join a tournament exactly once, even under concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_unique
  ON participants(tournament_id, user_id);

-- 3. Payments are looked up by provider order id on every verify/webhook call.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_order
  ON payments(provider_order_id);

-- 4. Wallet history is always queried per user, newest first.
CREATE INDEX IF NOT EXISTS idx_wallet_txns_user
  ON wallet_transactions(user_id, created_at DESC);

-- 5. Public arenas gain an owner for write authorization.
ALTER TABLE public_arenas ADD COLUMN owner_id TEXT;
