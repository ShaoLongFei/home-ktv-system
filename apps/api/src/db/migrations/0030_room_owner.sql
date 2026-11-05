ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS owner_device_id text;

CREATE INDEX IF NOT EXISTS rooms_owner_idx ON rooms(owner_device_id);
