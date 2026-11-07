ALTER TABLE online_song_assets
  ADD COLUMN IF NOT EXISTS last_played_at timestamptz,
  ADD COLUMN IF NOT EXISTS cache_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS online_song_assets_lru_idx
  ON online_song_assets(status, last_played_at NULLS FIRST, updated_at ASC);

CREATE INDEX IF NOT EXISTS online_song_assets_catalog_song_idx
  ON online_song_assets(catalog_song_id);
