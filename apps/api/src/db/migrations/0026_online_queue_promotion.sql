-- 0021 在收敛运行库时删除了 online_songs / online_song_assets。
-- 这里按当前在线补歌实现重建，并补齐缓存与「提升为本地曲库」相关字段。
CREATE TABLE IF NOT EXISTS online_songs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  provider text NOT NULL,
  provider_song_id text NOT NULL,
  title text NOT NULL,
  normalized_title text NOT NULL,
  title_pinyin text NOT NULL DEFAULT '',
  title_initials text NOT NULL DEFAULT '',
  primary_artist_name text NOT NULL,
  normalized_primary_artist_name text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_song_id)
);

CREATE TABLE IF NOT EXISTS online_song_assets (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  song_id text NOT NULL REFERENCES online_songs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_asset_id text NOT NULL,
  media_url text NOT NULL DEFAULT '',
  cache_path text,
  status text NOT NULL DEFAULT 'caching'
    CHECK (status IN ('ready', 'caching', 'failed', 'unavailable')),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_asset_id)
);

ALTER TABLE online_song_assets
  ADD COLUMN IF NOT EXISTS cache_bytes bigint,
  ADD COLUMN IF NOT EXISTS cache_sha256 text,
  ADD COLUMN IF NOT EXISTS audio_track_count integer,
  ADD COLUMN IF NOT EXISTS error_reason text,
  ADD COLUMN IF NOT EXISTS catalog_song_id text,
  ADD COLUMN IF NOT EXISTS last_resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS online_songs_normalized_title_idx
  ON online_songs(normalized_title);

CREATE INDEX IF NOT EXISTS online_song_assets_provider_status_idx
  ON online_song_assets(provider, status);

CREATE INDEX IF NOT EXISTS online_song_assets_updated_idx
  ON online_song_assets(updated_at DESC);

CREATE INDEX IF NOT EXISTS online_song_assets_catalog_song_idx
  ON online_song_assets(catalog_song_id);

CREATE INDEX IF NOT EXISTS ktv_songs_source_root_idx
  ON ktv_songs(source_root);
