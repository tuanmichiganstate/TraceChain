PRAGMA foreign_keys = ON;

ALTER TABLE assignments
ADD COLUMN close_command_id TEXT;

ALTER TABLE assignments
ADD COLUMN closed_at_utc TEXT;

ALTER TABLE assignments
ADD COLUMN closed_by_user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS assignments_close_command_unique
  ON assignments(close_command_id)
  WHERE close_command_id IS NOT NULL;
