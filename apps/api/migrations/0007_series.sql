-- Weekly series: a season made of one tournament per week.
--
-- WHAT THIS ADDS
--   series          one row per season. Holds the settings every week is cut
--                   from, so a host configures the format once.
--   series_members  the roster. Always recorded; only enforced as a gate when
--                   the series is locked.
--   tournaments.series_id / series_week
--                   what makes an ordinary tournament "Week 3" of a season.
--                   A tournament with no series_id behaves exactly as before.
--   engine_teams.user_id
--                   which account a competitor is. Engine teams were only ever
--                   labelled with a name, so results could not be added up
--                   across weeks without guessing that two equal names were
--                   the same person. The season table needs a real identity.
--
-- Money is unchanged: each week pays its own winner, so there is no escrow
-- here and no column for one.
--
-- HOW TO USE
-- The CREATEs are safe to re-run. The four ALTERs are not — SQLite has no
-- ADD COLUMN IF NOT EXISTS, so they fail harmlessly with "duplicate column
-- name" if they have already been applied. Check first if unsure:
--
--   wrangler d1 execute winner-takes-all-db --remote \
--     --command "PRAGMA table_info(tournaments);"
--
--   wrangler d1 execute winner-takes-all-db --remote \
--     --file=./migrations/0007_series.sql

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
  -- 'open': anyone may enter any week. 'locked': only members may enter.
  roster_mode TEXT NOT NULL DEFAULT 'open',
  -- Days between weeks. 7 is weekly; kept as a number so fortnightly works.
  cadence_days INTEGER NOT NULL DEFAULT 7,
  -- When the next week is due to open, as ISO 8601 UTC.
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

ALTER TABLE tournaments ADD COLUMN series_id TEXT;
ALTER TABLE tournaments ADD COLUMN series_week INTEGER;
ALTER TABLE engine_teams ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tournaments_series ON tournaments(series_id, series_week);
