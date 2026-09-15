-- Add the foul counters to an engine_matches table that predates them.
--
-- WHY THIS IS SEPARATE
-- 0006 creates engine_matches WITH fouls_a and fouls_b, so a database that
-- gets the table from that file must NOT run this one: the columns are already
-- there and SQLite has no ADD COLUMN IF NOT EXISTS, so it would fail.
--
-- This file is only for a database that already had engine_matches from an
-- earlier schema.sql, before the foul counters existed.
--
-- HOW TO USE
-- Check first. If this lists fouls_a, you do not need this file:
--
--   wrangler d1 execute winner-takes-all-db --remote \
--     --command "PRAGMA table_info(engine_matches);"
--
--   wrangler d1 execute winner-takes-all-db --remote \
--     --file=./migrations/0008_engine_foul_columns.sql

ALTER TABLE engine_matches ADD COLUMN fouls_a INTEGER DEFAULT 0;
ALTER TABLE engine_matches ADD COLUMN fouls_b INTEGER DEFAULT 0;
