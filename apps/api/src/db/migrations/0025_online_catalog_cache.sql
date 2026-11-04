ALTER TABLE online_song_assets
  ADD COLUMN IF NOT EXISTS cache_bytes bigint,
  ADD COLUMN IF NOT EXISTS cache_sha256 text,
  ADD COLUMN IF NOT EXISTS audio_track_count integer,
  ADD COLUMN IF NOT EXISTS error_reason text,
  ADD COLUMN IF NOT EXISTS last_resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS online_song_assets_provider_status_idx
  ON online_song_assets(provider, status);

CREATE INDEX IF NOT EXISTS online_song_assets_updated_idx
  ON online_song_assets(updated_at DESC);

CREATE INDEX IF NOT EXISTS online_songs_normalized_title_idx
  ON online_songs(normalized_title);
