ALTER TABLE online_song_assets
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS online_song_assets_claim_idx
  ON online_song_assets(claim_expires_at)
  WHERE status = 'caching';
