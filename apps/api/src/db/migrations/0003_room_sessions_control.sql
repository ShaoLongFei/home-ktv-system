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
