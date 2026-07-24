PRAGMA foreign_keys = ON;

ALTER TABLE scenario_pack_versions
ADD COLUMN retirement_command_id TEXT;

ALTER TABLE scenario_pack_versions
ADD COLUMN retired_at_utc TEXT;

ALTER TABLE scenario_pack_versions
ADD COLUMN retired_by_user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS scenario_pack_retirement_command_unique
  ON scenario_pack_versions(retirement_command_id)
  WHERE retirement_command_id IS NOT NULL;
