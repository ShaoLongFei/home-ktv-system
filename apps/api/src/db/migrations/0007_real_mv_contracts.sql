ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS compatibility_status text NOT NULL DEFAULT 'unknown' CHECK (compatibility_status IN ('unknown', 'review_required', 'playable', 'unsupported')),
  ADD COLUMN IF NOT EXISTS compatibility_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS media_info_summary jsonb NOT NULL DEFAULT '{"container":null,"durationMs":null,"videoCodec":null,"resolution":null,"fileSizeBytes":0,"audioTracks":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS media_info_provenance jsonb NOT NULL DEFAULT '{"source":"unknown","sourceVersion":null,"probedAt":null,"importedFrom":null}'::jsonb,
  ADD COLUMN IF NOT EXISTS track_roles jsonb NOT NULL DEFAULT '{"original":null,"instrumental":null}'::jsonb,
  ADD COLUMN IF NOT EXISTS playback_profile jsonb NOT NULL DEFAULT '{"kind":"separate_asset_pair","container":null,"videoCodec":null,"audioCodecs":[],"requiresAudioTrackSelection":false}'::jsonb;

ALTER TABLE import_candidate_files
  ADD COLUMN IF NOT EXISTS compatibility_status text NOT NULL DEFAULT 'unknown' CHECK (compatibility_status IN ('unknown', 'review_required', 'playable', 'unsupported')),
  ADD COLUMN IF NOT EXISTS compatibility_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS media_info_summary jsonb NOT NULL DEFAULT '{"container":null,"durationMs":null,"videoCodec":null,"resolution":null,"fileSizeBytes":0,"audioTracks":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS media_info_provenance jsonb NOT NULL DEFAULT '{"source":"unknown","sourceVersion":null,"probedAt":null,"importedFrom":null}'::jsonb,
  ADD COLUMN IF NOT EXISTS track_roles jsonb NOT NULL DEFAULT '{"original":null,"instrumental":null}'::jsonb,
  ADD COLUMN IF NOT EXISTS playback_profile jsonb NOT NULL DEFAULT '{"kind":"separate_asset_pair","container":null,"videoCodec":null,"audioCodecs":[],"requiresAudioTrackSelection":false}'::jsonb;

CREATE INDEX IF NOT EXISTS assets_compatibility_status_idx ON assets(compatibility_status, status);
CREATE INDEX IF NOT EXISTS import_candidate_files_compatibility_status_idx ON import_candidate_files(compatibility_status, selected);

UPDATE assets SET compatibility_status = 'playable', compatibility_reasons = '[]'::jsonb
WHERE status = 'ready'
  AND switch_quality_status = 'verified'
  AND compatibility_status = 'unknown';
