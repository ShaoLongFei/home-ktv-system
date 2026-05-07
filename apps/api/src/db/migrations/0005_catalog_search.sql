CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS artist_pinyin text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS artist_initials text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS songs_normalized_title_trgm_idx ON songs USING gin (normalized_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS songs_artist_name_trgm_idx ON songs USING gin (lower(artist_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS songs_title_pinyin_trgm_idx ON songs USING gin (title_pinyin gin_trgm_ops);
CREATE INDEX IF NOT EXISTS songs_title_initials_idx ON songs (title_initials);
CREATE INDEX IF NOT EXISTS songs_artist_pinyin_trgm_idx ON songs USING gin (artist_pinyin gin_trgm_ops);
CREATE INDEX IF NOT EXISTS songs_artist_initials_idx ON songs (artist_initials);
CREATE INDEX IF NOT EXISTS songs_aliases_gin_idx ON songs USING gin (aliases);
CREATE INDEX IF NOT EXISTS songs_search_hints_gin_idx ON songs USING gin (search_hints);
CREATE INDEX IF NOT EXISTS assets_queueable_search_idx
  ON assets(song_id, switch_family, source_type, status, switch_quality_status)
  WHERE status = 'ready' AND switch_quality_status = 'verified';
