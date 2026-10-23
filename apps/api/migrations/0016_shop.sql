-- What a player owns from the shop (docs/progression-and-cosmetics-plan.md §6).
--
-- One row per item a player owns. The primary key is what makes buying an
-- item twice impossible however fast the button is pressed. The coins for it
-- are taken in the same transaction (lib/d1-store.ts buyItem), against a
-- PURCHASE row in coin_ledger. Mirrored in apps/api/src/lib/engine-schema.ts.

CREATE TABLE IF NOT EXISTS player_unlocks (
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    -- 'shop' for now; 'level', 'honour' and 'trophy' later.
    source TEXT NOT NULL,
    price_paid INTEGER,
    -- The purchase this row came from, so the coin debit in the same batch
    -- can find exactly it.
    reference_id TEXT,
    unlocked_at TEXT NOT NULL,
    PRIMARY KEY (user_id, item_id)
);
