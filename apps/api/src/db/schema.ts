export const defaultRoomSeed = {
  id: "living-room",
  slug: "living-room",
  name: "Living Room"
} as const;

export const tableNames = {
  songs: "songs",
  assets: "assets",
  rooms: "rooms",
  queueEntries: "queue_entries",
  deviceSessions: "device_sessions",
  playbackSessions: "playback_sessions",
  playbackEvents: "playback_events",
  importScanRuns: "import_scan_runs",
  importFiles: "import_files",
  importCandidates: "import_candidates",
  importCandidateFiles: "import_candidate_files",
  sourceRecords: "source_records",
  roomPairingTokens: "room_pairing_tokens",
  controlSessions: "control_sessions",
  controlCommands: "control_commands"
} as const;

export const enumValues = {
  songStatus: ["ready", "review_required", "unavailable"],
  sourceType: ["local", "online_cached", "online_ephemeral"],
  assetKind: ["video", "audio+lyrics", "dual-track-video"],
  lyricMode: ["hard_sub", "soft_sub", "external_lrc", "none"],
  vocalMode: ["original", "instrumental", "dual", "unknown"],
  assetStatus: ["ready", "caching", "failed", "unavailable", "stale", "promoted"],
  switchQualityStatus: ["verified", "review_required", "rejected", "unknown"],
  roomStatus: ["active", "inactive", "maintenance"],
  queueEntryStatus: ["queued", "preparing", "loading", "playing", "played", "skipped", "failed"],
  deviceType: ["tv", "mobile"],
  playerState: ["idle", "preparing", "loading", "playing", "paused", "recovering", "error"],
  importScanTrigger: ["manual", "scheduled", "watcher"],
  importScanStatus: ["queued", "running", "completed", "failed"],
  importScanScope: ["imports", "songs", "all"],
  importFileRootKind: ["imports_pending", "imports_needs_review", "songs"],
  importFileProbeStatus: ["pending", "probed", "failed", "skipped", "deleted"],
  importCandidateStatus: [
    "pending",
    "held",
    "review_required",
    "conflict",
    "approved",
    "rejected_deleted",
    "approval_failed"
  ]
} as const;

export interface SongRow {
  id: string;
  title: string;
  normalized_title: string;
  title_pinyin: string;
  title_initials: string;
  artist_id: string;
  artist_name: string;
  language: string;
  status: string;
  genre: readonly string[];
  tags: readonly string[];
  aliases: readonly string[];
  search_hints: readonly string[];
  release_year: number | null;
  canonical_duration_ms: number | null;
  search_weight: number;
  default_asset_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AssetRow {
  id: string;
  song_id: string;
  source_type: string;
  asset_kind: string;
  display_name: string;
  file_path: string;
  duration_ms: number;
  lyric_mode: string;
  vocal_mode: string;
  status: string;
  switch_family: string | null;
  switch_quality_status: string;
  created_at: Date;
  updated_at: Date;
}

export interface RoomRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  default_player_device_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface QueueEntryRow {
  id: string;
  room_id: string;
  song_id: string;
  asset_id: string;
  requested_by: string;
  queue_position: number;
  status: string;
  priority: number;
  playback_options: Record<string, unknown>;
  requested_at: Date;
  started_at: Date | null;
  ended_at: Date | null;
}

export interface DeviceSessionRow {
  id: string;
  room_id: string;
  device_type: string;
  device_name: string;
  last_seen_at: Date | null;
  capabilities: Record<string, unknown>;
  pairing_token: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PlaybackSessionRow {
  room_id: string;
  current_queue_entry_id: string | null;
  active_asset_id: string | null;
  target_vocal_mode: string;
  player_state: string;
  player_position_ms: number;
  next_queue_entry_id: string | null;
  version: number;
  media_started_at: Date | null;
  updated_at: Date;
}

export interface PlaybackEventRow {
  id: string;
  room_id: string;
  queue_entry_id: string | null;
  event_type: string;
  event_payload: Record<string, unknown>;
  created_at: Date;
}

export interface ImportScanRunRow {
  id: string;
  trigger: string;
  status: string;
  scope: string;
  files_seen: number;
  files_added: number;
  files_changed: number;
  files_deleted: number;
  candidates_created: number;
  candidates_updated: number;
  error_message: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ImportFileRow {
  id: string;
  last_seen_scan_run_id: string | null;
  root_kind: string;
  relative_path: string;
  size_bytes: number;
  mtime_ms: number;
  quick_hash: string | null;
  probe_status: string;
  probe_payload: Record<string, unknown>;
  duration_ms: number | null;
  last_scanned_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ImportCandidateRow {
  id: string;
  status: string;
  title: string;
  normalized_title: string;
  title_pinyin: string;
  title_initials: string;
  artist_id: string | null;
  artist_name: string;
  language: string;
  genre: readonly string[];
  tags: readonly string[];
  aliases: readonly string[];
  search_hints: readonly string[];
  release_year: number | null;
  canonical_duration_ms: number | null;
  default_candidate_file_id: string | null;
  same_version_confirmed: boolean;
  conflict_song_id: string | null;
  review_notes: string | null;
  candidate_meta: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface ImportCandidateFileRow {
  id: string;
  candidate_id: string;
  import_file_id: string;
  selected: boolean;
  proposed_vocal_mode: string | null;
  proposed_asset_kind: string | null;
  role_confidence: number | null;
  probe_duration_ms: number | null;
  probe_summary: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface SourceRecordRow {
  id: string;
  asset_id: string;
  provider: string;
  provider_item_id: string | null;
  source_uri: string | null;
  import_file_id: string | null;
  raw_meta: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface RoomPairingTokenRow {
  room_id: string;
  token_value: string;
  token_hash: string;
  token_expires_at: Date;
  rotated_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ControlSessionRow {
  id: string;
  room_id: string;
  device_id: string;
  device_name: string;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ControlCommandRow {
  command_id: string;
  room_id: string;
  control_session_id: string;
  session_version: number;
  command_type: string;
  command_payload: Record<string, unknown>;
  result_status: string;
  result_payload: Record<string, unknown>;
  created_at: Date;
}

export interface ImportCandidateFileDetailRow {
  candidate_file_id: string;
  candidate_id: string;
  import_file_id: string;
  selected: boolean;
  proposed_vocal_mode: string | null;
  proposed_asset_kind: string | null;
  role_confidence: number | null;
  probe_duration_ms: number | null;
  probe_summary: Record<string, unknown>;
  candidate_file_created_at: Date;
  candidate_file_updated_at: Date;
  root_kind: string;
  relative_path: string;
  size_bytes: number;
  mtime_ms: number;
  quick_hash: string | null;
  probe_status: string;
  probe_payload: Record<string, unknown>;
  duration_ms: number | null;
  import_file_created_at: Date;
  import_file_updated_at: Date;
}

export const schemaSql = `
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
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'review_required', 'unavailable')),
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

CREATE TABLE IF NOT EXISTS room_pairing_tokens (
  room_id text PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  token_value text NOT NULL,
  token_hash text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  rotated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control_sessions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_name text NOT NULL DEFAULT 'Mobile Controller',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, device_id)
);

CREATE TABLE IF NOT EXISTS control_commands (
  command_id text PRIMARY KEY,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  control_session_id text NOT NULL REFERENCES control_sessions(id) ON DELETE CASCADE,
  session_version integer NOT NULL CHECK (session_version >= 0),
  command_type text NOT NULL CHECK (command_type IN (
    'add-queue-entry',
    'delete-queue-entry',
    'undo-delete-queue-entry',
    'promote-queue-entry',
    'skip-current',
    'switch-vocal-mode',
    'player-ended'
  )),
  command_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_status text NOT NULL CHECK (result_status IN ('accepted', 'duplicate', 'conflict', 'rejected')),
  result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_pairing_tokens_expiry_idx
  ON room_pairing_tokens(room_id, token_expires_at);

CREATE INDEX IF NOT EXISTS control_sessions_room_active_idx
  ON control_sessions(room_id, expires_at, last_seen_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS control_commands_room_created_idx
  ON control_commands(room_id, created_at DESC);
`;
