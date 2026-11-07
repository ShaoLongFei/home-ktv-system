-- 0021 收敛运行库时删除了 online_songs / online_song_assets。
-- 该迁移只在表已存在的库上补列（0026 会在需要时重建表并补齐同样的列），
-- 因此这里用 to_regclass 保护，保证新库、老库都能顺利迁移。
DO $$
BEGIN
  IF to_regclass('public.online_song_assets') IS NOT NULL THEN
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
  END IF;

  IF to_regclass('public.online_songs') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS online_songs_normalized_title_idx
      ON online_songs(normalized_title);
  END IF;
END $$;
