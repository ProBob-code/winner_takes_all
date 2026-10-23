-- What a player shows: their avatar now, and the border, sticker, showcase and
-- emote deck once those exist (docs/progression-and-cosmetics-plan.md).
--
-- One row per player, created the first time they save anything. A player
-- with no row is drawn with the default avatar generated from their user id.
-- Mirrored in apps/api/src/lib/engine-schema.ts so a database that has not
-- had this run still works.

CREATE TABLE IF NOT EXISTS player_loadout (
    user_id TEXT PRIMARY KEY,
    -- JSON: layer -> part id, validated by lib/avatar.ts on write. Null means
    -- the generated default.
    avatar TEXT,
    border_id TEXT,
    sticker_id TEXT,
    -- JSON arrays of item ids: up to 3 showcased, up to 8 emotes.
    showcase TEXT NOT NULL DEFAULT '[]',
    emote_deck TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
);
