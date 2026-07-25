PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS application_access_commands (
  command_id TEXT PRIMARY KEY,
  target_user_id TEXT NOT NULL,
  target_email TEXT NOT NULL COLLATE NOCASE,
  target_status TEXT NOT NULL
    CHECK (target_status IN ('active', 'disabled')),
  roles_json TEXT NOT NULL CHECK (json_valid(roles_json)),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  performed_at_utc TEXT NOT NULL,
  performed_by_user_id TEXT NOT NULL,
  FOREIGN KEY (target_user_id)
    REFERENCES application_users(user_id),
  FOREIGN KEY (performed_by_user_id)
    REFERENCES application_users(user_id)
) STRICT;

CREATE INDEX IF NOT EXISTS application_access_commands_target
  ON application_access_commands(
    target_user_id,
    performed_at_utc,
    command_id
  );
