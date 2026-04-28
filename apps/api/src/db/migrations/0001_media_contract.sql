CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS songs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title text NOT NULL,
  normalized_title text NOT NULL,
  title_pinyin text NOT NULL DEFAULT '',
  title_initials text NOT NULL DEFAULT '',
  artist_id text NOT NULL,
  artist_name text NOT NULL,
  language text NOT NULL DEFAULT 'mandarin',
  genre text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  aliases text[] NOT NULL DEFAULT '{}',
  search_hints text[] NOT NULL DEFAULT '{}',
  release_year integer,
  canonical_duration_ms integer,
  search_weight integer NOT NULL DEFAULT 0,
  default_asset_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  song_id text NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('local', 'online_cached', 'online_ephemeral')),
  asset_kind text NOT NULL CHECK (asset_kind IN ('video', 'audio+lyrics', 'dual-track-video')),
  display_name text NOT NULL DEFAULT '',
  file_path text NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  lyric_mode text NOT NULL CHECK (lyric_mode IN ('hard_sub', 'soft_sub', 'external_lrc', 'none')),
  vocal_mode text NOT NULL CHECK (vocal_mode IN ('original', 'instrumental', 'dual', 'unknown')),
  status text NOT NULL CHECK (status IN ('ready', 'caching', 'failed', 'unavailable', 'stale', 'promoted')),
  switch_family text,
  switch_quality_status text NOT NULL CHECK (switch_quality_status IN ('verified', 'review_required', 'rejected', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'inactive', 'maintenance')),
  default_player_device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS queue_entries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  song_id text NOT NULL REFERENCES songs(id) ON DELETE RESTRICT,
  asset_id text NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  requested_by text NOT NULL,
  queue_position integer NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'preparing', 'loading', 'playing', 'played', 'skipped', 'failed')),
  priority integer NOT NULL DEFAULT 0,
  playback_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS device_sessions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  device_type text NOT NULL CHECK (device_type IN ('tv', 'mobile')),
  device_name text NOT NULL,
  last_seen_at timestamptz,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  pairing_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS playback_sessions (
  room_id text PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  current_queue_entry_id text REFERENCES queue_entries(id) ON DELETE SET NULL,
  active_asset_id text REFERENCES assets(id) ON DELETE SET NULL,
  target_vocal_mode text NOT NULL CHECK (target_vocal_mode IN ('original', 'instrumental', 'dual', 'unknown')),
  player_state text NOT NULL CHECK (player_state IN ('idle', 'preparing', 'loading', 'playing', 'paused', 'recovering', 'error')),
  player_position_ms integer NOT NULL DEFAULT 0 CHECK (player_position_ms >= 0),
  next_queue_entry_id text REFERENCES queue_entries(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  media_started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS playback_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  queue_entry_id text REFERENCES queue_entries(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE songs
  ADD CONSTRAINT songs_default_asset_fk
  FOREIGN KEY (default_asset_id) REFERENCES assets(id) ON DELETE SET NULL;

ALTER TABLE rooms
  ADD CONSTRAINT rooms_default_player_device_fk
  FOREIGN KEY (default_player_device_id) REFERENCES device_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS assets_song_switch_mode_idx ON assets(song_id, switch_family, vocal_mode);
CREATE INDEX IF NOT EXISTS assets_ready_switch_idx ON assets(switch_family, vocal_mode, status, switch_quality_status);
CREATE INDEX IF NOT EXISTS queue_entries_room_position_idx ON queue_entries(room_id, status, queue_position, priority);
CREATE INDEX IF NOT EXISTS playback_events_room_created_idx ON playback_events(room_id, created_at DESC);

INSERT INTO rooms (id, slug, name, status)
VALUES ('living-room', 'living-room', 'Living Room', 'active')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO playback_sessions (room_id, target_vocal_mode, player_state, player_position_ms, version)
VALUES ('living-room', 'instrumental', 'idle', 0, 1)
ON CONFLICT (room_id) DO NOTHING;
