-- Bring an existing public_arenas table up to what the code writes.
--
-- WHY THIS EXISTS
-- upsertArena() inserts into (id, name, state_json, pin, owner_id, updated_at).
-- owner_id is only ever added by 0003_integrity_constraints.sql, and
-- schema.sql creates the table with CREATE TABLE IF NOT EXISTS, so a database
-- created before those columns existed never gains them. The insert then fails
-- with "no such column" and the API answers 500 Internal server error.
--
-- 0003 is NOT a safe way to fix that on its own: its first step drops and
-- rebuilds the wallets table, which destroys real balances if it is re-run or
-- fails partway. This migration touches only public_arenas.
--
-- HOW TO USE
-- SQLite has no ADD COLUMN IF NOT EXISTS, so check first and run only the
-- statements for columns that are actually missing:
--
--   wrangler d1 execute winner-takes-all-db --remote \
--     --command "PRAGMA table_info(public_arenas);"
--
-- Then run this file, or just the lines you need:
--
--   wrangler d1 execute winner-takes-all-db --remote \
--     --file=./migrations/0004_arena_columns.sql
--
-- A statement for a column that already exists fails with
-- "duplicate column name: ..." and is safe to ignore — nothing is modified.

-- Owner of the arena, used to authorize updates without a PIN.
ALTER TABLE public_arenas ADD COLUMN owner_id TEXT;

-- Last write time. listArenas orders by it, and Live Screening uses it to
-- decide whether an arena is still actively being hosted.
ALTER TABLE public_arenas ADD COLUMN updated_at DATETIME;
