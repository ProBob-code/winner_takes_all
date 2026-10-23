-- Trophies: what a win raises and a loss lowers (docs/progression-and-cosmetics-plan.md §4).
--
-- Deliberately apart from the coin tables. Trophies are a standing, not a
-- currency: nothing here can be bought, spent or turned into coins, and a
-- loss that costs trophies never costs a coin. Mirrored in
-- apps/api/src/lib/engine-schema.ts so a database without this still works.

-- One row per player per track: 'overall', 'offline:8BALL',
-- 'offline:FOOTBALL', 'online:8BALL'.
CREATE TABLE IF NOT EXISTS player_trophies (
    user_id TEXT NOT NULL,
    track TEXT NOT NULL,
    trophies INTEGER NOT NULL DEFAULT 0 CHECK (trophies >= 0),
    peak INTEGER NOT NULL DEFAULT 0,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, track)
);

CREATE INDEX IF NOT EXISTS idx_player_trophies_ladder ON player_trophies (track, trophies DESC);

-- Every change, so a player can check it like the coin ledger. The unique
-- index is what makes a frame settled twice move trophies once.
CREATE TABLE IF NOT EXISTS trophy_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    track TEXT NOT NULL,
    delta INTEGER NOT NULL,
    trophies_after INTEGER NOT NULL,
    won INTEGER NOT NULL,
    -- 'user:<id>', 'guest:<name>' or 'ai:<level>': who the game was against,
    -- for the same-pair and walk-in rules.
    opponent_key TEXT NOT NULL,
    reference_type TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trophy_ledger_once ON trophy_ledger (user_id, track, reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_trophy_ledger_user ON trophy_ledger (user_id, created_at DESC);

-- Browser games the server saw start, so one abandoned before it was lost
-- still counts as a loss.
CREATE TABLE IF NOT EXISTS online_games (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    sport TEXT NOT NULL,
    ai_rating INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    -- 'won' | 'lost' | 'abandoned'
    result TEXT
);

CREATE INDEX IF NOT EXISTS idx_online_games_open ON online_games (user_id, finished_at, started_at);
