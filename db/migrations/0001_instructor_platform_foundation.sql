PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS application_users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at_utc TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS application_role_assignments (
  user_id TEXT NOT NULL,
  application_role TEXT NOT NULL
    CHECK (application_role IN (
      'learner',
      'instructor',
      'scenario-author',
      'administrator',
      'rater'
    )),
  assigned_at_utc TEXT NOT NULL,
  assigned_by_user_id TEXT NOT NULL,
  PRIMARY KEY (user_id, application_role),
  FOREIGN KEY (user_id) REFERENCES application_users(user_id)
) STRICT;

CREATE TABLE IF NOT EXISTS scenario_pack_versions (
  pack_id TEXT NOT NULL,
  pack_version TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL
    CHECK (lifecycle_status IN (
      'draft',
      'validated',
      'published',
      'retired'
    )),
  content_hash TEXT,
  pack_json TEXT NOT NULL CHECK (json_valid(pack_json)),
  updated_at_utc TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  PRIMARY KEY (pack_id, pack_version)
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS scenario_pack_content_hash_unique
  ON scenario_pack_versions(content_hash)
  WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS hosted_run_events (
  run_id TEXT NOT NULL,
  sequence_number INTEGER NOT NULL CHECK (sequence_number >= 1),
  event_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL,
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  server_timestamp_utc TEXT NOT NULL,
  PRIMARY KEY (run_id, sequence_number),
  UNIQUE (run_id, idempotency_key)
) STRICT;

CREATE INDEX IF NOT EXISTS hosted_run_events_timestamp
  ON hosted_run_events(run_id, server_timestamp_utc);
