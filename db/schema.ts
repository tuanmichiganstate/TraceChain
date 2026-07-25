/**
 * Logical D1 schema for the first hosted TraceChain vertical slice.
 *
 * Keep one SQL statement per entry so deployment code can prepare and execute
 * statements independently. Development environments install this current
 * schema from scratch; obsolete database shapes are not upgraded.
 */
export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS application_users (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'disabled')),
    created_at_utc TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS application_role_assignments (
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
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS scenario_pack_versions (
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
    retirement_command_id TEXT UNIQUE,
    retired_at_utc TEXT,
    retired_by_user_id TEXT,
    CHECK (
      (lifecycle_status != 'retired'
        AND retirement_command_id IS NULL
        AND retired_at_utc IS NULL
        AND retired_by_user_id IS NULL)
      OR
      (lifecycle_status = 'retired'
        AND retirement_command_id IS NOT NULL
        AND retired_at_utc IS NOT NULL
        AND retired_by_user_id IS NOT NULL)
    ),
    PRIMARY KEY (pack_id, pack_version)
  ) STRICT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS scenario_pack_content_hash_unique
    ON scenario_pack_versions(content_hash)
    WHERE content_hash IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS assignments (
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
    mode_configuration_json TEXT NOT NULL
      CHECK (json_valid(mode_configuration_json)),
    lifecycle_status TEXT NOT NULL DEFAULT 'active'
      CHECK (lifecycle_status IN ('active', 'closed')),
    available_from_utc TEXT,
    available_until_utc TEXT,
    close_command_id TEXT UNIQUE,
    closed_at_utc TEXT,
    closed_by_user_id TEXT,
    feedback_release_status TEXT NOT NULL DEFAULT 'withheld'
      CHECK (feedback_release_status IN ('withheld', 'released')),
    feedback_release_command_id TEXT UNIQUE,
    feedback_released_at_utc TEXT,
    feedback_released_by_user_id TEXT,
    created_at_utc TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    CHECK (
      available_from_utc IS NULL
      OR available_until_utc IS NULL
      OR available_from_utc < available_until_utc
    ),
    CHECK (
      (lifecycle_status = 'active'
        AND close_command_id IS NULL
        AND closed_at_utc IS NULL
        AND closed_by_user_id IS NULL)
      OR
      (lifecycle_status = 'closed'
        AND close_command_id IS NOT NULL
        AND closed_at_utc IS NOT NULL
        AND closed_by_user_id IS NOT NULL)
    ),
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
    FOREIGN KEY (closed_by_user_id)
      REFERENCES application_users(user_id),
    FOREIGN KEY (feedback_released_by_user_id)
      REFERENCES application_users(user_id)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS assignment_learners (
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
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS assignment_learners_user
    ON assignment_learners(learner_user_id, assignment_id)`,
  `CREATE TABLE IF NOT EXISTS hosted_run_events (
    run_id TEXT NOT NULL,
    sequence_number INTEGER NOT NULL CHECK (sequence_number >= 1),
    event_id TEXT NOT NULL UNIQUE,
    idempotency_key TEXT NOT NULL,
    event_json TEXT NOT NULL CHECK (json_valid(event_json)),
    server_timestamp_utc TEXT NOT NULL,
    PRIMARY KEY (run_id, sequence_number),
    UNIQUE (run_id, idempotency_key)
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS hosted_run_events_timestamp
    ON hosted_run_events(run_id, server_timestamp_utc)`,
  `CREATE TABLE IF NOT EXISTS rubric_rating_revisions (
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
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS rubric_rating_run
    ON rubric_rating_revisions(run_id, rubric_id, criterion_id, revision)`,
  `CREATE TABLE IF NOT EXISTS rubric_moderation_resolutions (
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
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS rubric_moderation_run
    ON rubric_moderation_resolutions(
      run_id,
      rubric_id,
      criterion_id,
      revision
    )`,
  `CREATE TABLE IF NOT EXISTS scorm_package_jobs (
    job_id TEXT PRIMARY KEY,
    creation_command_id TEXT NOT NULL UNIQUE,
    preset_id TEXT NOT NULL
      CHECK (preset_id IN ('guided', 'challenge', 'assessment')),
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
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS scorm_package_jobs_requester
    ON scorm_package_jobs(requested_by_user_id, requested_at_utc)`,
  `CREATE TABLE IF NOT EXISTS application_access_commands (
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
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS application_access_commands_target
    ON application_access_commands(
      target_user_id,
      performed_at_utc,
      command_id
    )`,
] as const;
