ALTER TABLE queue_entries
  DROP CONSTRAINT IF EXISTS queue_entries_status_check;

ALTER TABLE queue_entries
  ADD CONSTRAINT queue_entries_status_check
  CHECK (status IN ('queued', 'preparing', 'loading', 'playing', 'played', 'skipped', 'failed', 'removed'));

ALTER TABLE queue_entries
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by_control_session_id text REFERENCES control_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS undo_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS queue_entries_room_effective_position_idx
  ON queue_entries(room_id, status, queue_position)
  WHERE status IN ('queued', 'preparing', 'loading', 'playing');
