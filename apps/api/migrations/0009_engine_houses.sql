-- Add the 8-ball houses (solids / stripes) to engine_matches.
--
-- A hosted match now offers the same house selector as Quick Tournament, so
-- which set each side is on has to be stored.
--
-- The API also adds these columns itself on the first engine request (see
-- src/lib/engine-schema.ts), so on a database that has already served one this
-- file is not needed, and SQLite has no ADD COLUMN IF NOT EXISTS: it would
-- fail with "duplicate column name". Check first. If this lists team_a_house,
-- you do not need this file:
--
--   wrangler d1 execute winner-takes-all-db --remote \
--     --command "PRAGMA table_info(engine_matches);"
--
--   wrangler d1 execute winner-takes-all-db --remote \
--     --file=./migrations/0009_engine_houses.sql

ALTER TABLE engine_matches ADD COLUMN team_a_house TEXT DEFAULT 'SOLID';
ALTER TABLE engine_matches ADD COLUMN team_b_house TEXT DEFAULT 'STRIPES';
