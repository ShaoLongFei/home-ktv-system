CREATE TABLE IF NOT EXISTS candidate_tasks (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_candidate_id text NOT NULL,
  title text NOT NULL,
  artist_name text NOT NULL,
  source_label text NOT NULL,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  candidate_type text NOT NULL CHECK (candidate_type IN ('mv', 'karaoke', 'audio', 'unknown')),
  reliability_label text NOT NULL CHECK (reliability_label IN ('high', 'medium', 'low', 'unknown')),
  risk_label text NOT NULL CHECK (risk_label IN ('normal', 'risky', 'blocked')),
  status text NOT NULL DEFAULT 'discovered' CHECK (status IN (
    'discovered',
    'selected',
    'review_required',
    'fetching',
    'fetched',
    'ready',
    'failed',
    'stale',
    'promoted',
    'purged'
  )),
  failure_reason text,
  recent_event jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ready_asset_id text REFERENCES assets(id) ON DELETE SET NULL,
  selected_at timestamptz,
  review_required_at timestamptz,
  fetching_at timestamptz,
  fetched_at timestamptz,
  ready_at timestamptz,
  failed_at timestamptz,
  stale_at timestamptz,
  promoted_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, provider, provider_candidate_id)
);

CREATE INDEX IF NOT EXISTS candidate_tasks_room_status_updated_idx
  ON candidate_tasks(room_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS candidate_tasks_provider_candidate_idx
  ON candidate_tasks(provider, provider_candidate_id);

CREATE INDEX IF NOT EXISTS candidate_tasks_room_recent_idx
  ON candidate_tasks(room_id, updated_at DESC);
