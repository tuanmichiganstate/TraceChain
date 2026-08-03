/**
 * Logical D1 schema for the first hosted SimuLedger vertical slice.
 *
 * Keep one SQL statement per entry so deployment code can prepare and execute
 * statements independently. Development environments install this current
 * schema from scratch; obsolete database shapes are not upgraded.
 */
export const currentD1SchemaVersion =
  "2026-08-03-simuledger-brand-v1";

export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS simuledger_schema_metadata (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    schema_version TEXT NOT NULL
  ) STRICT`,
  `INSERT OR IGNORE INTO simuledger_schema_metadata (
    singleton_id,
    schema_version
  ) VALUES (1, '${currentD1SchemaVersion}')`,
  `CREATE TABLE IF NOT EXISTS application_users (
    user_id TEXT PRIMARY KEY,
    email TEXT COLLATE NOCASE UNIQUE,
    display_name TEXT CHECK (
      display_name IS NULL
      OR length(display_name) BETWEEN 1 AND 200
    ),
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'disabled')),
    created_at_utc TEXT NOT NULL,
    CHECK (email IS NOT NULL OR display_name IS NOT NULL)
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
    experience_configuration_json TEXT NOT NULL
      CHECK (json_valid(experience_configuration_json)),
    experience_configuration_hash TEXT NOT NULL
      CHECK (
        length(experience_configuration_hash) = 64
        AND experience_configuration_hash NOT GLOB '*[^0-9a-f]*'
      ),
    counterfactual_configuration_json TEXT NOT NULL
      CHECK (json_valid(counterfactual_configuration_json)),
    research_configuration_json TEXT NOT NULL
      CHECK (json_valid(research_configuration_json)),
    learning_platform_issuer TEXT,
    learning_platform_client_id TEXT,
    learning_platform_deployment_id TEXT,
    learning_context_id TEXT,
    learning_resource_link_id TEXT,
    learning_context_label TEXT,
    learning_context_title TEXT,
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
      (
        learning_platform_issuer IS NULL
        AND learning_platform_client_id IS NULL
        AND learning_platform_deployment_id IS NULL
        AND learning_context_id IS NULL
        AND learning_resource_link_id IS NULL
        AND learning_context_label IS NULL
        AND learning_context_title IS NULL
      )
      OR
      (
        learning_platform_issuer IS NOT NULL
        AND learning_platform_client_id IS NOT NULL
        AND learning_platform_deployment_id IS NOT NULL
        AND learning_context_id IS NOT NULL
        AND learning_resource_link_id IS NOT NULL
      )
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
  /*
   * A rater carries no relation to a course, so without this roster the role
   * would reach every assignment in the deployment. Membership here is what
   * scopes an assessment-only account to the work it was asked to moderate.
   */
  `CREATE TABLE IF NOT EXISTS assignment_raters (
    assignment_id TEXT NOT NULL,
    rater_user_id TEXT NOT NULL,
    assigned_at_utc TEXT NOT NULL,
    assigned_by_user_id TEXT NOT NULL,
    PRIMARY KEY (assignment_id, rater_user_id),
    FOREIGN KEY (assignment_id)
      REFERENCES assignments(assignment_id),
    FOREIGN KEY (rater_user_id)
      REFERENCES application_users(user_id),
    FOREIGN KEY (assigned_by_user_id)
      REFERENCES application_users(user_id)
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS assignment_raters_user
    ON assignment_raters(rater_user_id, assignment_id)`,
  `CREATE INDEX IF NOT EXISTS assignments_learning_context
    ON assignments(
      learning_platform_issuer,
      learning_platform_deployment_id,
      learning_context_id,
      created_at_utc
    )`,
  `CREATE TABLE IF NOT EXISTS lti_login_states (
    state_hash TEXT PRIMARY KEY CHECK (length(state_hash) = 64),
    nonce_hash TEXT NOT NULL CHECK (length(nonce_hash) = 64),
    registration_id TEXT NOT NULL,
    target_link_uri TEXT NOT NULL,
    created_at_utc TEXT NOT NULL,
    expires_at_utc TEXT NOT NULL,
    consumed_at_utc TEXT,
    CHECK (created_at_utc < expires_at_utc)
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS lti_login_states_expiry
    ON lti_login_states(expires_at_utc, consumed_at_utc)`,
  `CREATE TABLE IF NOT EXISTS external_user_identities (
    identity_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider = 'lti-1.3'),
    issuer TEXT NOT NULL,
    client_id TEXT NOT NULL,
    deployment_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    user_id TEXT NOT NULL,
    email_claim TEXT COLLATE NOCASE,
    display_name_claim TEXT,
    created_at_utc TEXT NOT NULL,
    last_authenticated_at_utc TEXT,
    UNIQUE (
      provider,
      issuer,
      client_id,
      deployment_id,
      subject
    ),
    FOREIGN KEY (user_id) REFERENCES application_users(user_id)
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS external_user_identities_user
    ON external_user_identities(user_id, provider)`,
  `CREATE TABLE IF NOT EXISTS lti_sessions (
    session_token_hash TEXT PRIMARY KEY
      CHECK (length(session_token_hash) = 64),
    user_id TEXT NOT NULL,
    registration_id TEXT NOT NULL,
    issuer TEXT NOT NULL,
    client_id TEXT NOT NULL,
    deployment_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    launch_type TEXT NOT NULL
      CHECK (launch_type IN ('resource-link', 'deep-linking')),
    context_id TEXT NOT NULL,
    resource_link_id TEXT,
    context_label TEXT,
    context_title TEXT,
    return_url TEXT,
    deep_link_return_url TEXT,
    deep_link_data TEXT CHECK (
      deep_link_data IS NULL OR length(deep_link_data) <= 8192
    ),
    deep_link_accept_types_json TEXT CHECK (
      deep_link_accept_types_json IS NULL
      OR json_valid(deep_link_accept_types_json)
    ),
    deep_link_accept_targets_json TEXT CHECK (
      deep_link_accept_targets_json IS NULL
      OR json_valid(deep_link_accept_targets_json)
    ),
    deep_link_accept_lineitem INTEGER CHECK (
      deep_link_accept_lineitem IS NULL
      OR deep_link_accept_lineitem IN (0, 1)
    ),
    deep_link_response_nonce TEXT,
    deep_link_assignment_id TEXT,
    deep_link_completed_at_utc TEXT,
    deep_link_response_jwt TEXT CHECK (
      deep_link_response_jwt IS NULL
      OR length(deep_link_response_jwt) <= 32768
    ),
    ags_lineitem_url TEXT CHECK (
      ags_lineitem_url IS NULL
      OR length(ags_lineitem_url) BETWEEN 1 AND 2048
    ),
    ags_scopes_json TEXT CHECK (
      ags_scopes_json IS NULL
      OR json_valid(ags_scopes_json)
    ),
    nrps_context_memberships_url TEXT CHECK (
      nrps_context_memberships_url IS NULL
      OR length(nrps_context_memberships_url) BETWEEN 1 AND 2048
    ),
    nrps_service_versions_json TEXT CHECK (
      nrps_service_versions_json IS NULL
      OR json_valid(nrps_service_versions_json)
    ),
    platform_roles_json TEXT NOT NULL
      CHECK (json_valid(platform_roles_json)),
    application_role TEXT NOT NULL
      CHECK (application_role IN ('instructor', 'learner')),
    assignment_id TEXT,
    issued_at_utc TEXT NOT NULL,
    expires_at_utc TEXT NOT NULL,
    revoked_at_utc TEXT,
    CHECK (issued_at_utc < expires_at_utc),
    CHECK (
      (
        application_role = 'instructor'
        AND assignment_id IS NULL
      )
      OR
      (
        application_role = 'learner'
        AND assignment_id IS NOT NULL
      )
    ),
    CHECK (
      (
        nrps_context_memberships_url IS NULL
        AND nrps_service_versions_json IS NULL
      )
      OR
      (
        application_role = 'instructor'
        AND nrps_context_memberships_url IS NOT NULL
        AND nrps_service_versions_json IS NOT NULL
      )
    ),
    CHECK (
      (
        launch_type = 'resource-link'
        AND resource_link_id IS NOT NULL
        AND deep_link_return_url IS NULL
        AND deep_link_data IS NULL
        AND deep_link_accept_types_json IS NULL
        AND deep_link_accept_targets_json IS NULL
        AND deep_link_accept_lineitem IS NULL
        AND deep_link_response_nonce IS NULL
        AND deep_link_assignment_id IS NULL
        AND deep_link_completed_at_utc IS NULL
        AND deep_link_response_jwt IS NULL
        AND (
          (
            application_role = 'instructor'
            AND ags_lineitem_url IS NULL
            AND ags_scopes_json IS NULL
          )
          OR
          (
            application_role = 'learner'
            AND (
              (
                ags_lineitem_url IS NULL
                AND ags_scopes_json IS NULL
              )
              OR
              (
                ags_lineitem_url IS NOT NULL
                AND ags_scopes_json IS NOT NULL
              )
            )
          )
        )
      )
      OR
      (
        launch_type = 'deep-linking'
        AND application_role = 'instructor'
        AND resource_link_id IS NULL
        AND deep_link_return_url IS NOT NULL
        AND deep_link_accept_types_json IS NOT NULL
        AND deep_link_accept_targets_json IS NOT NULL
        AND deep_link_accept_lineitem IS NOT NULL
        AND deep_link_response_nonce IS NOT NULL
        AND ags_lineitem_url IS NULL
        AND ags_scopes_json IS NULL
        AND (
          (
            deep_link_assignment_id IS NULL
            AND deep_link_completed_at_utc IS NULL
            AND deep_link_response_jwt IS NULL
          )
          OR
          (
            deep_link_completed_at_utc IS NOT NULL
            AND deep_link_response_jwt IS NOT NULL
          )
        )
      )
    ),
    FOREIGN KEY (user_id) REFERENCES application_users(user_id),
    FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id),
    FOREIGN KEY (deep_link_assignment_id)
      REFERENCES assignments(assignment_id)
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS lti_sessions_user_expiry
    ON lti_sessions(user_id, expires_at_utc, revoked_at_utc)`,
  `CREATE TABLE IF NOT EXISTS lti_nrps_syncs (
    sync_id TEXT PRIMARY KEY CHECK (
      length(sync_id) BETWEEN 1 AND 128
    ),
    registration_id TEXT NOT NULL,
    issuer TEXT NOT NULL,
    client_id TEXT NOT NULL,
    deployment_id TEXT NOT NULL,
    context_id TEXT NOT NULL,
    context_memberships_url TEXT NOT NULL CHECK (
      length(context_memberships_url) BETWEEN 1 AND 2048
    ),
    snapshot_hash TEXT NOT NULL CHECK (
      length(snapshot_hash) = 64
      AND snapshot_hash NOT GLOB '*[^0-9a-f]*'
    ),
    received_member_count INTEGER NOT NULL CHECK (
      received_member_count BETWEEN 0 AND 1000
    ),
    active_learner_count INTEGER NOT NULL CHECK (
      active_learner_count BETWEEN 0 AND received_member_count
    ),
    inactive_learner_count INTEGER NOT NULL CHECK (
      inactive_learner_count BETWEEN 0 AND received_member_count
    ),
    page_count INTEGER NOT NULL CHECK (
      page_count BETWEEN 1 AND 20
    ),
    synchronized_at_utc TEXT NOT NULL,
    synchronized_by_user_id TEXT NOT NULL,
    CHECK (
      active_learner_count + inactive_learner_count
      = received_member_count
    ),
    FOREIGN KEY (synchronized_by_user_id)
      REFERENCES application_users(user_id)
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS lti_nrps_syncs_context
    ON lti_nrps_syncs(
      registration_id,
      context_id,
      synchronized_at_utc
    )`,
  `CREATE TABLE IF NOT EXISTS lti_context_memberships (
    registration_id TEXT NOT NULL,
    issuer TEXT NOT NULL,
    client_id TEXT NOT NULL,
    deployment_id TEXT NOT NULL,
    context_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    user_id TEXT NOT NULL,
    membership_status TEXT NOT NULL
      CHECK (membership_status IN ('active', 'inactive')),
    platform_roles_json TEXT NOT NULL
      CHECK (json_valid(platform_roles_json)),
    email_claim TEXT COLLATE NOCASE CHECK (
      email_claim IS NULL OR length(email_claim) <= 320
    ),
    display_name_claim TEXT CHECK (
      display_name_claim IS NULL
      OR length(display_name_claim) BETWEEN 1 AND 200
    ),
    first_seen_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    last_sync_id TEXT NOT NULL,
    PRIMARY KEY (registration_id, context_id, subject),
    FOREIGN KEY (user_id) REFERENCES application_users(user_id),
    FOREIGN KEY (last_sync_id)
      REFERENCES lti_nrps_syncs(sync_id)
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS lti_context_memberships_active
    ON lti_context_memberships(
      registration_id,
      context_id,
      membership_status,
      user_id
    )`,
  `CREATE TABLE IF NOT EXISTS lti_ags_score_deliveries (
    delivery_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL UNIQUE,
    assignment_id TEXT NOT NULL,
    registration_id TEXT NOT NULL,
    platform_user_id TEXT NOT NULL,
    lineitem_url TEXT NOT NULL
      CHECK (length(lineitem_url) BETWEEN 1 AND 2048),
    score_payload_json TEXT NOT NULL
      CHECK (
        json_valid(score_payload_json)
        AND length(score_payload_json) <= 8192
      ),
    status TEXT NOT NULL
      CHECK (status IN (
        'pending',
        'delivering',
        'delivered',
        'failed'
      )),
    attempt_count INTEGER NOT NULL DEFAULT 0
      CHECK (attempt_count >= 0),
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    last_attempt_at_utc TEXT,
    delivered_at_utc TEXT,
    last_error TEXT CHECK (
      last_error IS NULL OR length(last_error) <= 1000
    ),
    CHECK (
      (status = 'delivered' AND delivered_at_utc IS NOT NULL)
      OR
      (status != 'delivered' AND delivered_at_utc IS NULL)
    ),
    FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id)
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS lti_ags_score_deliveries_status
    ON lti_ags_score_deliveries(status, updated_at_utc)`,
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
  `CREATE TABLE IF NOT EXISTS counterfactual_runs (
    branch_run_id TEXT PRIMARY KEY,
    source_run_id TEXT NOT NULL,
    fork_sequence_number INTEGER NOT NULL
      CHECK (fork_sequence_number >= 1),
    source_pack_id TEXT NOT NULL,
    source_pack_version TEXT NOT NULL,
    source_scenario_id TEXT NOT NULL,
    source_scenario_version TEXT NOT NULL,
    intervention_id TEXT NOT NULL,
    comparison_mode TEXT NOT NULL
      CHECK (comparison_mode IN (
        'SINGLE_INTERVENTION',
        'EXPLORATORY_BRANCH'
      )),
    created_by_user_id TEXT NOT NULL,
    created_at_utc TEXT NOT NULL,
    metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
    CHECK (branch_run_id != source_run_id),
    FOREIGN KEY (created_by_user_id)
      REFERENCES application_users(user_id)
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS counterfactual_runs_source
    ON counterfactual_runs(
      source_run_id,
      created_at_utc,
      branch_run_id
    )`,
  `CREATE TABLE IF NOT EXISTS counterfactual_reflections (
    reflection_id TEXT PRIMARY KEY,
    branch_run_id TEXT NOT NULL UNIQUE,
    submitted_by_user_id TEXT NOT NULL,
    submitted_at_utc TEXT NOT NULL,
    reflection_json TEXT NOT NULL CHECK (json_valid(reflection_json)),
    FOREIGN KEY (branch_run_id)
      REFERENCES counterfactual_runs(branch_run_id),
    FOREIGN KEY (submitted_by_user_id)
      REFERENCES application_users(user_id)
  ) STRICT`,
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
      CHECK (preset_id IN (
        'guided',
        'practice',
        'challenge',
        'assessment',
        'audit-guided',
        'audit-practice',
        'audit-challenge',
        'audit-assessment',
        'technical-lab'
      )),
    lifecycle_status TEXT NOT NULL
      CHECK (lifecycle_status = 'completed'),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    filename TEXT NOT NULL CHECK (filename LIKE '%.zip'),
    artifact_key TEXT NOT NULL,
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    release_build INTEGER NOT NULL CHECK (release_build IN (0, 1)),
    configuration_hash TEXT NOT NULL CHECK (length(configuration_hash) = 64),
    configuration_schema_version TEXT NOT NULL
      CHECK (configuration_schema_version = '2'),
    activity_type TEXT NOT NULL
      CHECK (activity_type IN ('OPERATIONS', 'AUDIT', 'TECHNICAL_LAB')),
    support_profile TEXT NOT NULL
      CHECK (support_profile IN ('GUIDED', 'PRACTICE', 'CHALLENGE')),
    delivery_purpose TEXT NOT NULL
      CHECK (delivery_purpose IN ('FORMATIVE', 'ASSESSMENT', 'SANDBOX')),
    outcome_strategy TEXT NOT NULL
      CHECK (outcome_strategy IN (
        'FIXED',
        'CURATED_VARIANT',
        'SEEDED_STOCHASTIC',
        'FORCED_CONDITION'
      )),
    content_pack_id TEXT NOT NULL,
    content_pack_version TEXT NOT NULL,
    scoring_blueprint_id TEXT NOT NULL,
    scoring_blueprint_version TEXT NOT NULL,
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
