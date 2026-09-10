-- Hosted tournaments gain a sport, so they are no longer 8-ball only.
--
-- Existing rows keep 8BALL, which is what every hosted tournament was before
-- this column existed, so nothing changes for them.
--
-- Run with:
--   wrangler d1 execute winner-takes-all-db --remote \
--     --file=./migrations/0005_tournament_sport.sql
--
-- Fails harmlessly with "duplicate column name: sport" if already applied.

ALTER TABLE tournaments ADD COLUMN sport TEXT NOT NULL DEFAULT '8BALL';
