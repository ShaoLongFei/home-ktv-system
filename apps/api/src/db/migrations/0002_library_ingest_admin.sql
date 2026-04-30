ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready'
  CHECK (status IN ('ready', 'review_required', 'unavailable'));

CREATE TABLE IF NOT EXISTS import_scan_runs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  trigger text NOT NULL CHECK (trigger IN ('manual', 'scheduled', 'watcher')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  scope text NOT NULL DEFAULT 'imports' CHECK (scope IN ('imports', 'songs', 'all')),
  files_seen integer NOT NULL DEFAULT 0 CHECK (files_seen >= 0),
  files_added integer NOT NULL DEFAULT 0 CHECK (files_added >= 0),
  files_changed integer NOT NULL DEFAULT 0 CHECK (files_changed >= 0),
  files_deleted integer NOT NULL DEFAULT 0 CHECK (files_deleted >= 0),
  candidates_created integer NOT NULL DEFAULT 0 CHECK (candidates_created >= 0),
  candidates_updated integer NOT NULL DEFAULT 0 CHECK (candidates_updated >= 0),
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_files (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  last_seen_scan_run_id text REFERENCES import_scan_runs(id) ON DELETE SET NULL,
  root_kind text NOT NULL CHECK (root_kind IN ('imports_pending', 'imports_needs_review', 'songs')),
  relative_path text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  mtime_ms bigint NOT NULL CHECK (mtime_ms >= 0),
  quick_hash text,
  probe_status text NOT NULL DEFAULT 'pending' CHECK (probe_status IN ('pending', 'probed', 'failed', 'skipped', 'deleted')),
  probe_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  last_scanned_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(root_kind, relative_path)
);

CREATE TABLE IF NOT EXISTS import_candidates (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'held', 'review_required', 'conflict', 'approved', 'rejected_deleted', 'approval_failed')),
  title text NOT NULL DEFAULT '',
  normalized_title text NOT NULL DEFAULT '',
  title_pinyin text NOT NULL DEFAULT '',
  title_initials text NOT NULL DEFAULT '',
  artist_id text,
  artist_name text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'mandarin' CHECK (language IN ('mandarin', 'cantonese', 'other')),
  genre text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  aliases text[] NOT NULL DEFAULT '{}',
  search_hints text[] NOT NULL DEFAULT '{}',
  release_year integer,
  canonical_duration_ms integer CHECK (canonical_duration_ms IS NULL OR canonical_duration_ms >= 0),
  default_candidate_file_id text,
  same_version_confirmed boolean NOT NULL DEFAULT false,
  conflict_song_id text REFERENCES songs(id) ON DELETE SET NULL,
  review_notes text,
  candidate_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_candidate_files (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  candidate_id text NOT NULL REFERENCES import_candidates(id) ON DELETE CASCADE,
  import_file_id text NOT NULL REFERENCES import_files(id) ON DELETE RESTRICT,
  selected boolean NOT NULL DEFAULT true,
  proposed_vocal_mode text CHECK (proposed_vocal_mode IN ('original', 'instrumental', 'dual', 'unknown')),
  proposed_asset_kind text CHECK (proposed_asset_kind IN ('video', 'audio+lyrics', 'dual-track-video')),
  role_confidence numeric(5, 4) CHECK (role_confidence IS NULL OR (role_confidence >= 0 AND role_confidence <= 1)),
  probe_duration_ms integer CHECK (probe_duration_ms IS NULL OR probe_duration_ms >= 0),
  probe_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(candidate_id, import_file_id)
);

ALTER TABLE import_candidates
  ADD CONSTRAINT import_candidates_default_candidate_file_fk
  FOREIGN KEY (default_candidate_file_id) REFERENCES import_candidate_files(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS source_records (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_item_id text,
  source_uri text,
  import_file_id text REFERENCES import_files(id) ON DELETE SET NULL,
  raw_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_scan_runs_status_idx
  ON import_scan_runs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS import_files_root_path_idx
  ON import_files(root_kind, relative_path);

CREATE INDEX IF NOT EXISTS import_files_probe_status_idx
  ON import_files(probe_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS import_candidates_status_idx
  ON import_candidates(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS import_candidate_files_candidate_idx
  ON import_candidate_files(candidate_id, selected);

CREATE INDEX IF NOT EXISTS import_candidate_files_import_file_idx
  ON import_candidate_files(import_file_id);

CREATE INDEX IF NOT EXISTS source_records_provider_idx
  ON source_records(provider, provider_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS assets_verified_switch_family_mode_uq
  ON assets(song_id, switch_family, vocal_mode)
  WHERE switch_family IS NOT NULL
    AND status = 'ready'
    AND switch_quality_status = 'verified';
