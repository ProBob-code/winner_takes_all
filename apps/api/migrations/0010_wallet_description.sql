-- Say what a ledger entry was for.
--
-- A tournament prize is now credited to the winners' wallets, and the ledger
-- row names the tournament and says when the pot was split. That note needs
-- somewhere to live.
--
-- The API also adds this column itself on the first engine request (see
-- src/lib/engine-schema.ts), so on a database that has already served one this
-- file is not needed, and SQLite has no ADD COLUMN IF NOT EXISTS: it would
-- fail with "duplicate column name". Check first. If this lists description,
-- you do not need this file:
--
--   wrangler d1 execute winner-takes-all-db --remote \
--     --command "PRAGMA table_info(wallet_transactions);"
--
--   wrangler d1 execute winner-takes-all-db --remote \
--     --file=./migrations/0010_wallet_description.sql

ALTER TABLE wallet_transactions ADD COLUMN description TEXT;
