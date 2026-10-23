-- Emotes fired during a live night (docs/progression-and-cosmetics-plan.md §6.2).
--
-- Short-lived by design: the venue TV and the night page poll for the last
-- few seconds, and rows older than an hour are pruned whenever a new one is
-- written. Mirrored in apps/api/src/lib/engine-schema.ts.

CREATE TABLE IF NOT EXISTS night_emotes (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    emote_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_night_emotes_recent ON night_emotes (tournament_id, created_at);
CREATE INDEX IF NOT EXISTS idx_night_emotes_user ON night_emotes (user_id, tournament_id, created_at);
