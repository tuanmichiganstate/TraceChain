PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scorm_package_jobs (
  job_id TEXT PRIMARY KEY,
  creation_command_id TEXT NOT NULL UNIQUE,
  preset_id TEXT NOT NULL
    CHECK (preset_id IN ('guided', 'challenge')),
  lifecycle_status TEXT NOT NULL
    CHECK (lifecycle_status = 'completed'),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  filename TEXT NOT NULL CHECK (filename LIKE '%.zip'),
  artifact_key TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  release_build INTEGER NOT NULL CHECK (release_build IN (0, 1)),
  configuration_hash TEXT NOT NULL CHECK (length(configuration_hash) = 64),
  scenario_id TEXT NOT NULL,
  scenario_version TEXT NOT NULL,
  application_build_hash TEXT NOT NULL
    CHECK (length(application_build_hash) = 64),
  source_commit TEXT NOT NULL,
  requested_at_utc TEXT NOT NULL,
  completed_at_utc TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  FOREIGN KEY (requested_by_user_id)
    REFERENCES application_users(user_id)
) STRICT;

CREATE INDEX IF NOT EXISTS scorm_package_jobs_requester
  ON scorm_package_jobs(requested_by_user_id, requested_at_utc);
