-- Payouts, and the bonus credit that cannot be withdrawn.
--
-- Two things move money out of the platform that had nowhere to live before:
-- a member asking for their balance back, and the 1% the platform keeps for
-- handling it. Both are recorded here so every rupee is accounted for.
--
-- wallets.bonus_cents is the part of balance_cents that was given rather than
-- earned or deposited. It is included in the balance -- it can be staked on an
-- entry fee -- but it is never withdrawable, so the withdrawable figure is
-- balance_cents - bonus_cents.

ALTER TABLE wallets ADD COLUMN bonus_cents INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS payout_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  -- What leaves the wallet. Debited when the request is made, so the same
  -- balance cannot be promised to two requests.
  amount_cents INTEGER NOT NULL,
  -- The platform's 1%, and what the member actually receives.
  fee_cents INTEGER NOT NULL,
  net_cents INTEGER NOT NULL,
  -- Where it is being sent, as the member typed it (UPI id or account ref).
  destination TEXT NOT NULL DEFAULT '',
  -- pending -> paid, or pending -> rejected (which refunds amount_cents).
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  processed_by TEXT,
  processed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_payouts_user ON payout_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payout_requests(status, created_at DESC);
