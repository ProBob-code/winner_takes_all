-- Proof of Play (apps/api/src/lib/proof.ts).
--
-- One row per offline game, from the first code the scorer's phone shows to
-- the payout, and one per side that checked in with that code. Coordinates
-- are kept only until the result locks, then cleared.
-- Mirrored in apps/api/src/lib/engine-schema.ts.

CREATE TABLE IF NOT EXISTS match_proofs (
    match_id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    code TEXT,
    code_expires_at INTEGER,
    prev_code TEXT,
    prev_expires_at INTEGER,
    scorer_lat REAL,
    scorer_lng REAL,
    scorer_acc REAL,
    status TEXT NOT NULL DEFAULT 'LIVE',
    tier TEXT,
    reasons TEXT,
    winner_team_id TEXT,
    finished_at INTEGER,
    lock_at INTEGER,
    disputed_team_id TEXT,
    disputed_by TEXT,
    disputed_at INTEGER,
    ruling TEXT,
    ruled_by TEXT,
    ruled_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_match_proofs_code ON match_proofs(code);

CREATE INDEX IF NOT EXISTS idx_match_proofs_prev_code ON match_proofs(prev_code);

CREATE INDEX IF NOT EXISTS idx_match_proofs_tournament ON match_proofs(tournament_id, status);

CREATE INDEX IF NOT EXISTS idx_match_proofs_due ON match_proofs(status, lock_at);

CREATE TABLE IF NOT EXISTS match_checkins (
    match_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    checked_in_at INTEGER NOT NULL,
    lat REAL,
    lng REAL,
    acc REAL,
    confirmed_at INTEGER,
    PRIMARY KEY (match_id, team_id)
  );

CREATE INDEX IF NOT EXISTS idx_match_checkins_user ON match_checkins(user_id, checked_in_at);
