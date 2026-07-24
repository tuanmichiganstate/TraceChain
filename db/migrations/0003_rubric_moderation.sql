PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rubric_moderation_resolutions (
  resolution_id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  rubric_id TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  criterion_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  level_value INTEGER NOT NULL,
  comment TEXT NOT NULL CHECK (length(comment) <= 1000),
  source_rating_ids_json TEXT NOT NULL
    CHECK (json_valid(source_rating_ids_json)),
  moderator_user_id TEXT NOT NULL,
  resolved_at_utc TEXT NOT NULL,
  UNIQUE (run_id, rubric_id, criterion_id, revision),
  FOREIGN KEY (assignment_id)
    REFERENCES assignments(assignment_id),
  FOREIGN KEY (moderator_user_id)
    REFERENCES application_users(user_id)
) STRICT;

CREATE INDEX IF NOT EXISTS rubric_moderation_run
  ON rubric_moderation_resolutions(
    run_id,
    rubric_id,
    criterion_id,
    revision
  );
