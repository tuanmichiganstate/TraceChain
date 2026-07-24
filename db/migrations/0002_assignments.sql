PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS assignments (
  assignment_id TEXT PRIMARY KEY,
  creation_command_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL CHECK (
    length(title) BETWEEN 1 AND 160
  ),
  pack_id TEXT NOT NULL,
  pack_version TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  scenario_version TEXT NOT NULL,
  run_mode TEXT NOT NULL
    CHECK (run_mode IN (
      'tutorial',
      'standard',
      'sandbox',
      'configured'
    )),
  lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'closed')),
  feedback_release_status TEXT NOT NULL DEFAULT 'withheld'
    CHECK (feedback_release_status IN ('withheld', 'released')),
  feedback_release_command_id TEXT UNIQUE,
  feedback_released_at_utc TEXT,
  feedback_released_by_user_id TEXT,
  created_at_utc TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  CHECK (
    (feedback_release_status = 'withheld'
      AND feedback_release_command_id IS NULL
      AND feedback_released_at_utc IS NULL
      AND feedback_released_by_user_id IS NULL)
    OR
    (feedback_release_status = 'released'
      AND feedback_release_command_id IS NOT NULL
      AND feedback_released_at_utc IS NOT NULL
      AND feedback_released_by_user_id IS NOT NULL)
  ),
  FOREIGN KEY (pack_id, pack_version)
    REFERENCES scenario_pack_versions(pack_id, pack_version),
  FOREIGN KEY (created_by_user_id)
    REFERENCES application_users(user_id),
  FOREIGN KEY (feedback_released_by_user_id)
    REFERENCES application_users(user_id)
) STRICT;

CREATE TABLE IF NOT EXISTS assignment_learners (
  assignment_id TEXT NOT NULL,
  learner_user_id TEXT NOT NULL,
  assigned_at_utc TEXT NOT NULL,
  assigned_by_user_id TEXT NOT NULL,
  PRIMARY KEY (assignment_id, learner_user_id),
  FOREIGN KEY (assignment_id)
    REFERENCES assignments(assignment_id),
  FOREIGN KEY (learner_user_id)
    REFERENCES application_users(user_id),
  FOREIGN KEY (assigned_by_user_id)
    REFERENCES application_users(user_id)
) STRICT;

CREATE INDEX IF NOT EXISTS assignment_learners_user
  ON assignment_learners(learner_user_id, assignment_id);

CREATE TABLE IF NOT EXISTS rubric_rating_revisions (
  rating_id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  rubric_id TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  criterion_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  level_value INTEGER NOT NULL,
  comment TEXT NOT NULL CHECK (length(comment) <= 1000),
  linked_evidence_ids_json TEXT NOT NULL
    CHECK (json_valid(linked_evidence_ids_json)),
  rater_user_id TEXT NOT NULL,
  rated_at_utc TEXT NOT NULL,
  UNIQUE (run_id, rubric_id, criterion_id, revision),
  FOREIGN KEY (assignment_id)
    REFERENCES assignments(assignment_id),
  FOREIGN KEY (rater_user_id)
    REFERENCES application_users(user_id)
) STRICT;

CREATE INDEX IF NOT EXISTS rubric_rating_run
  ON rubric_rating_revisions(
    run_id,
    rubric_id,
    criterion_id,
    revision
  );
