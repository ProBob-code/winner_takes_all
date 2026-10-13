-- The WTA Coin: what a player earns for turning up and playing.
--
-- Deliberately a SEPARATE pair of tables from wallets and wallet_transactions,
-- and deliberately never joined to them. A coin is not money: it cannot be
-- bought, cashed out, transferred or wagered, and there is no exchange rate
-- between the two ledgers. Keeping them apart in the schema is what makes that
-- true structurally rather than by convention — there is no column here that
-- could hold a rupee figure, and no foreign key that could tie a coin to one.
--
-- See apps/api/src/lib/coins.ts for why the boundary is shaped this way.

CREATE TABLE IF NOT EXISTS coin_balances (
    user_id TEXT PRIMARY KEY,
    -- Whole coins. No fractions: a currency that cannot be exchanged has no
    -- need of them, and integers make the running total exact.
    balance INTEGER NOT NULL DEFAULT 0,
    -- Lifetime earned, which never goes down. The balance and this are equal
    -- for now because nothing is ever deducted; they are kept apart so that a
    -- future cosmetic sink cannot quietly rewrite a player's history.
    lifetime INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

-- Every award, with what it was for. A player can read this and check the
-- arithmetic themselves, which is the point: a balance nobody can audit is
-- just a number the app asserts.
CREATE TABLE IF NOT EXISTS coin_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description TEXT,
    -- Which frame or tournament earned it, so an award can be traced back and
    -- so the same frame cannot pay twice.
    reference_type TEXT,
    reference_id TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_coin_ledger_user ON coin_ledger (user_id, created_at DESC);

-- The guard that stops one frame paying twice when a client replays, a poll
-- settles a match a second time, or a host restarts and re-finishes a frame.
CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_ledger_once ON coin_ledger (
    user_id,
    reason,
    reference_type,
    reference_id
);

CREATE INDEX IF NOT EXISTS idx_coin_balances_rank ON coin_balances (balance DESC);
