-- Add max_matches_per_team to tournaments
ALTER TABLE tournaments ADD COLUMN max_matches_per_team INTEGER DEFAULT 2;
