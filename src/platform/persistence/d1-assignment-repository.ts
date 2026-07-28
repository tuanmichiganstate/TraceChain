import type { Clock } from "../../domain/simulation/environment";
import type {
  AssignmentRunMode,
  CreateHostedAssignmentRequest,
  HostedAssignmentReportV1,
  HostedLearnerAssignmentV1,
  HostedAssignmentRunSummary,
  HostedAssignmentCreationResult,
  HostedAssignmentV1,
  ManualRubricRatingResult,
  ManualRubricRatingV1,
  RubricModerationResolutionV1,
  RubricModerationResult,
  SaveManualRubricRatingRequest,
  SaveRubricModerationRequest,
} from "../contracts/assessment";
import { isJsonObject } from "../contracts/json";
import type { ApplicationPrincipal } from "../hosted/access";
import {
  validateHostedModeConfiguration,
} from "../runs/mode-configuration";
import {
  validateAssignmentCounterfactualConfiguration,
} from "../runs/counterfactual-assignment";
import {
  validateAssignmentResearchConfiguration,
} from "../runs/research-configuration";
import { assignmentStartAvailability } from "../runs/assignment-availability";
import { assertHostedExperienceIdentity } from "../runs/experience-configuration";
import type { LtiLearningContextV1 } from "../contracts/lti";
import type { D1DatabaseLike } from "./d1-types";

interface AssignmentRow {
  readonly assignment_id: string;
  readonly creation_command_id: string;
  readonly title: string;
  readonly pack_id: string;
  readonly pack_version: string;
  readonly scenario_id: string;
  readonly scenario_version: string;
  readonly run_mode: string;
  readonly mode_configuration_json: string;
  readonly experience_configuration_json: string;
  readonly experience_configuration_hash: string;
  readonly counterfactual_configuration_json: string;
  readonly research_configuration_json: string;
  readonly learning_platform_issuer: string | null;
  readonly learning_platform_client_id: string | null;
  readonly learning_platform_deployment_id: string | null;
  readonly learning_context_id: string | null;
  readonly learning_resource_link_id: string | null;
  readonly learning_context_label: string | null;
  readonly learning_context_title: string | null;
  readonly lifecycle_status: string;
  readonly available_from_utc: string | null;
  readonly available_until_utc: string | null;
  readonly close_command_id: string | null;
  readonly closed_at_utc: string | null;
  readonly closed_by_user_id: string | null;
  readonly feedback_release_status: string;
  readonly feedback_release_command_id: string | null;
  readonly feedback_released_at_utc: string | null;
  readonly feedback_released_by_user_id: string | null;
  readonly created_at_utc: string;
  readonly created_by_user_id: string;
}

interface LearnerRow {
  readonly learner_user_id: string;
}

interface RatingRow {
  readonly rating_id: string;
  readonly assignment_id: string;
  readonly run_id: string;
  readonly rubric_id: string;
  readonly rubric_version: string;
  readonly criterion_id: string;
  readonly revision: number;
  readonly level_value: number;
  readonly comment: string;
  readonly linked_evidence_ids_json: string;
  readonly rater_user_id: string;
  readonly rated_at_utc: string;
}

interface RunSummaryRow {
  readonly run_id: string;
  readonly learner_user_id: string;
  readonly event_count: number;
  readonly evidence_inspection_count: number;
  readonly policy_consultation_count: number;
  readonly cited_evidence_count: number;
  readonly decision_attempt_count: number;
  readonly rejected_attempt_count: number;
  readonly mitigation_count: number;
  readonly completed: number;
  readonly started_at_utc: string;
  readonly last_activity_at_utc: string;
  readonly completed_at_utc: string | null;
}

interface RejectionEventRow {
  readonly run_id: string;
  readonly event_json: string;
}

interface ModerationRow {
  readonly resolution_id: string;
  readonly assignment_id: string;
  readonly run_id: string;
  readonly rubric_id: string;
  readonly rubric_version: string;
  readonly criterion_id: string;
  readonly revision: number;
  readonly level_value: number;
  readonly comment: string;
  readonly source_rating_ids_json: string;
  readonly moderator_user_id: string;
  readonly resolved_at_utc: string;
}

const FIND_ASSIGNMENT = `SELECT
  assignment_id,
  creation_command_id,
  title,
  pack_id,
  pack_version,
  scenario_id,
  scenario_version,
  run_mode,
  mode_configuration_json,
  experience_configuration_json,
  experience_configuration_hash,
  counterfactual_configuration_json,
  research_configuration_json,
  learning_platform_issuer,
  learning_platform_client_id,
  learning_platform_deployment_id,
  learning_context_id,
  learning_resource_link_id,
  learning_context_label,
  learning_context_title,
  lifecycle_status,
  available_from_utc,
  available_until_utc,
  close_command_id,
  closed_at_utc,
  closed_by_user_id,
  feedback_release_status,
  feedback_release_command_id,
  feedback_released_at_utc,
  feedback_released_by_user_id,
  created_at_utc,
  created_by_user_id
FROM assignments
WHERE assignment_id = ?`;

const FIND_ASSIGNMENT_BY_COMMAND = `SELECT assignment_id
FROM assignments
WHERE creation_command_id = ?`;

const FIND_ASSIGNMENT_BY_CLOSE_COMMAND = `SELECT assignment_id
FROM assignments
WHERE close_command_id = ?`;

const LIST_LEARNER_ASSIGNMENTS = `SELECT
  assignments.assignment_id,
  assignments.creation_command_id,
  assignments.title,
  assignments.pack_id,
  assignments.pack_version,
  assignments.scenario_id,
  assignments.scenario_version,
  assignments.run_mode,
  assignments.mode_configuration_json,
  assignments.experience_configuration_json,
  assignments.experience_configuration_hash,
  assignments.counterfactual_configuration_json,
  assignments.research_configuration_json,
  assignments.learning_platform_issuer,
  assignments.learning_platform_client_id,
  assignments.learning_platform_deployment_id,
  assignments.learning_context_id,
  assignments.learning_resource_link_id,
  assignments.learning_context_label,
  assignments.learning_context_title,
  assignments.lifecycle_status,
  assignments.available_from_utc,
  assignments.available_until_utc,
  assignments.close_command_id,
  assignments.closed_at_utc,
  assignments.closed_by_user_id,
  assignments.feedback_release_status,
  assignments.feedback_release_command_id,
  assignments.feedback_released_at_utc,
  assignments.feedback_released_by_user_id,
  assignments.created_at_utc,
  assignments.created_by_user_id
FROM assignments
JOIN assignment_learners
  ON assignment_learners.assignment_id = assignments.assignment_id
WHERE assignment_learners.learner_user_id = ?
ORDER BY assignments.created_at_utc DESC, assignments.assignment_id`;

const FIND_LEARNERS = `SELECT learner_user_id
FROM assignment_learners
WHERE assignment_id = ?
ORDER BY learner_user_id`;

const FIND_ACTIVE_LEARNER = `SELECT users.user_id
FROM application_users AS users
JOIN application_role_assignments AS roles
  ON roles.user_id = users.user_id
WHERE users.user_id = ?
  AND users.status = 'active'
  AND roles.application_role = 'learner'`;

const INSERT_ASSIGNMENT = `INSERT INTO assignments (
  assignment_id,
  creation_command_id,
  title,
  pack_id,
  pack_version,
  scenario_id,
  scenario_version,
  run_mode,
  mode_configuration_json,
  experience_configuration_json,
  experience_configuration_hash,
  counterfactual_configuration_json,
  research_configuration_json,
  learning_platform_issuer,
  learning_platform_client_id,
  learning_platform_deployment_id,
  learning_context_id,
  learning_resource_link_id,
  learning_context_label,
  learning_context_title,
  lifecycle_status,
  available_from_utc,
  available_until_utc,
  feedback_release_status,
  created_at_utc,
  created_by_user_id
) VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
  'active', ?, ?, 'withheld', ?, ?
)`;

const INSERT_LEARNER = `INSERT INTO assignment_learners (
  assignment_id,
  learner_user_id,
  assigned_at_utc,
  assigned_by_user_id
) VALUES (?, ?, ?, ?)`;

const FIND_RUN_ASSIGNMENT = `SELECT
  json_extract(event_json, '$.payload.assignmentId') AS assignment_id,
  json_extract(event_json, '$.payload.learnerUserId') AS learner_user_id
FROM hosted_run_events
WHERE run_id = ?
  AND sequence_number = 1`;

const FIND_RATING_BY_ID = `SELECT
  rating_id,
  assignment_id,
  run_id,
  rubric_id,
  rubric_version,
  criterion_id,
  revision,
  level_value,
  comment,
  linked_evidence_ids_json,
  rater_user_id,
  rated_at_utc
FROM rubric_rating_revisions
WHERE rating_id = ?`;

const FIND_RATINGS_FOR_RUN = `SELECT
  rating_id,
  assignment_id,
  run_id,
  rubric_id,
  rubric_version,
  criterion_id,
  revision,
  level_value,
  comment,
  linked_evidence_ids_json,
  rater_user_id,
  rated_at_utc
FROM rubric_rating_revisions
WHERE run_id = ?
ORDER BY rubric_id, criterion_id, revision`;

const FIND_RATINGS_FOR_ASSIGNMENT = `SELECT
  rating_id,
  assignment_id,
  run_id,
  rubric_id,
  rubric_version,
  criterion_id,
  revision,
  level_value,
  comment,
  linked_evidence_ids_json,
  rater_user_id,
  rated_at_utc
FROM rubric_rating_revisions
WHERE assignment_id = ?
ORDER BY run_id, rubric_id, criterion_id, revision`;

const INSERT_RATING = `INSERT INTO rubric_rating_revisions (
  rating_id,
  assignment_id,
  run_id,
  rubric_id,
  rubric_version,
  criterion_id,
  revision,
  level_value,
  comment,
  linked_evidence_ids_json,
  rater_user_id,
  rated_at_utc
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const FIND_MODERATION_BY_ID = `SELECT
  resolution_id,
  assignment_id,
  run_id,
  rubric_id,
  rubric_version,
  criterion_id,
  revision,
  level_value,
  comment,
  source_rating_ids_json,
  moderator_user_id,
  resolved_at_utc
FROM rubric_moderation_resolutions
WHERE resolution_id = ?`;

const FIND_MODERATION_FOR_RUN = `SELECT
  resolution_id,
  assignment_id,
  run_id,
  rubric_id,
  rubric_version,
  criterion_id,
  revision,
  level_value,
  comment,
  source_rating_ids_json,
  moderator_user_id,
  resolved_at_utc
FROM rubric_moderation_resolutions
WHERE run_id = ?
ORDER BY rubric_id, criterion_id, revision`;

const FIND_MODERATION_FOR_ASSIGNMENT = `SELECT
  resolution_id,
  assignment_id,
  run_id,
  rubric_id,
  rubric_version,
  criterion_id,
  revision,
  level_value,
  comment,
  source_rating_ids_json,
  moderator_user_id,
  resolved_at_utc
FROM rubric_moderation_resolutions
WHERE assignment_id = ?
ORDER BY run_id, rubric_id, criterion_id, revision`;

const INSERT_MODERATION = `INSERT INTO rubric_moderation_resolutions (
  resolution_id,
  assignment_id,
  run_id,
  rubric_id,
  rubric_version,
  criterion_id,
  revision,
  level_value,
  comment,
  source_rating_ids_json,
  moderator_user_id,
  resolved_at_utc
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const RELEASE_FEEDBACK = `UPDATE assignments
SET feedback_release_status = 'released',
    feedback_release_command_id = ?,
    feedback_released_at_utc = ?,
    feedback_released_by_user_id = ?
WHERE assignment_id = ?
  AND feedback_release_status = 'withheld'`;

const CLOSE_ASSIGNMENT = `UPDATE assignments
SET lifecycle_status = 'closed',
    close_command_id = ?,
    closed_at_utc = ?,
    closed_by_user_id = ?
WHERE assignment_id = ?
  AND lifecycle_status = 'active'`;

const FIND_ASSIGNMENT_RUNS = `SELECT
  created.run_id AS run_id,
  json_extract(
    created.event_json,
    '$.payload.learnerUserId'
  ) AS learner_user_id,
  COUNT(events.sequence_number) AS event_count,
  MAX(
    CASE
      WHEN json_extract(events.event_json, '$.eventType') =
        'RUN_COMPLETED'
      THEN 1
      ELSE 0
    END
  ) AS completed,
  SUM(
    CASE
      WHEN json_extract(events.event_json, '$.eventType') =
        'EVIDENCE_INSPECTED'
      THEN 1
      ELSE 0
    END
  ) AS evidence_inspection_count,
  SUM(
    CASE
      WHEN json_extract(events.event_json, '$.eventType') =
        'POLICY_CONSULTED'
      THEN 1
      ELSE 0
    END
  ) AS policy_consultation_count,
  SUM(
    COALESCE(
      json_array_length(
        events.event_json,
        '$.payload.citedEvidenceIds'
      ),
      0
    )
  ) AS cited_evidence_count,
  SUM(
    CASE
      WHEN json_extract(events.event_json, '$.eventType') IN (
        'DECISION_SUBMITTED',
        'DECISION_REJECTED'
      )
      THEN 1
      ELSE 0
    END
  ) AS decision_attempt_count,
  SUM(
    CASE
      WHEN json_extract(events.event_json, '$.eventType') IN (
        'DECISION_REJECTED',
        'ENDORSEMENT_PROPOSAL_REJECTED',
        'ENDORSEMENT_REJECTED',
        'ENDORSED_TRANSACTION_REJECTED',
        'RUN_TIME_LIMIT_EXCEEDED',
        'TRANSACTION_REJECTED'
      )
      THEN 1
      ELSE 0
    END
  ) AS rejected_attempt_count,
  SUM(
    CASE
      WHEN json_extract(events.event_json, '$.eventType') =
        'MITIGATION_RECORDED'
      THEN 1
      ELSE 0
    END
  ) AS mitigation_count,
  MIN(events.server_timestamp_utc) AS started_at_utc,
  MAX(events.server_timestamp_utc) AS last_activity_at_utc,
  MAX(
    CASE
      WHEN json_extract(events.event_json, '$.eventType') =
        'RUN_COMPLETED'
      THEN events.server_timestamp_utc
      ELSE NULL
    END
  ) AS completed_at_utc
FROM hosted_run_events AS created
JOIN hosted_run_events AS events
  ON events.run_id = created.run_id
WHERE created.sequence_number = 1
  AND json_extract(
    created.event_json,
    '$.payload.assignmentId'
  ) = ?
GROUP BY created.run_id, learner_user_id
ORDER BY learner_user_id, created.run_id`;

const FIND_ASSIGNMENT_REJECTION_EVENTS = `SELECT
  events.run_id AS run_id,
  events.event_json AS event_json
FROM hosted_run_events AS created
JOIN hosted_run_events AS events
  ON events.run_id = created.run_id
WHERE created.sequence_number = 1
  AND json_extract(
    created.event_json,
    '$.payload.assignmentId'
  ) = ?
  AND json_extract(events.event_json, '$.eventType') IN (
    'DECISION_REJECTED',
    'ENDORSEMENT_PROPOSAL_REJECTED',
    'ENDORSEMENT_REJECTED',
    'ENDORSED_TRANSACTION_REJECTED',
    'RUN_TIME_LIMIT_EXCEEDED',
    'TRANSACTION_REJECTED'
  )
ORDER BY events.run_id, events.sequence_number`;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const ASSIGNMENT_MODES: readonly AssignmentRunMode[] = [
  "tutorial",
  "standard",
  "sandbox",
  "configured",
];

export class AssignmentRepositoryError extends Error {
  constructor(
    readonly code:
      | "ASSIGNMENT_NOT_FOUND"
      | "ASSIGNMENT_CONFLICT"
      | "INVALID_ASSIGNMENT"
      | "LEARNER_NOT_PROVISIONED"
      | "ASSIGNMENT_STORAGE_FAILED"
      | "ASSIGNMENT_ALREADY_CLOSED"
      | "ASSIGNMENT_CLOSED"
      | "ASSIGNMENT_NOT_YET_AVAILABLE"
      | "ASSIGNMENT_AVAILABILITY_ENDED"
      | "RUN_NOT_ASSIGNED"
      | "INVALID_RATING"
      | "RATING_REVISION_CONFLICT"
      | "INVALID_MODERATION"
      | "MODERATION_REVISION_CONFLICT"
      | "FEEDBACK_ALREADY_RELEASED"
      | "FEEDBACK_NOT_RELEASED",
    message: string,
  ) {
    super(message);
    this.name = "AssignmentRepositoryError";
  }
}

function boundedText(
  value: unknown,
  path: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new AssignmentRepositoryError(
      "INVALID_ASSIGNMENT",
      `${path} must be a string.`,
    );
  }
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maximumLength
  ) {
    throw new AssignmentRepositoryError(
      "INVALID_ASSIGNMENT",
      `${path} must contain 1 to ${String(maximumLength)} characters.`,
    );
  }
  return normalized;
}

function identifier(value: unknown, path: string): string {
  const normalized = boundedText(value, path, 128);
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new AssignmentRepositoryError(
      "INVALID_ASSIGNMENT",
      `${path} contains unsupported characters.`,
    );
  }
  return normalized;
}

function optionalUtcTimestamp(
  value: unknown,
  path: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new AssignmentRepositoryError(
      "INVALID_ASSIGNMENT",
      `${path} must be an ISO timestamp when present.`,
    );
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new AssignmentRepositoryError(
      "INVALID_ASSIGNMENT",
      `${path} must be a valid ISO timestamp.`,
    );
  }
  return new Date(parsed).toISOString();
}

function activityCount(
  value: number,
  field: string,
  runId: string,
): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new AssignmentRepositoryError(
      "ASSIGNMENT_STORAGE_FAILED",
      `Run ${runId} contains invalid ${field}.`,
    );
  }
  return value;
}

function rejectionFindingCodes(
  row: RejectionEventRow,
): readonly string[] {
  let event: unknown;
  try {
    event = JSON.parse(row.event_json);
  } catch {
    throw new AssignmentRepositoryError(
      "ASSIGNMENT_STORAGE_FAILED",
      `Run ${row.run_id} contains invalid rejection evidence.`,
    );
  }
  if (!isJsonObject(event) || !isJsonObject(event.payload)) {
    throw new AssignmentRepositoryError(
      "ASSIGNMENT_STORAGE_FAILED",
      `Run ${row.run_id} contains invalid rejection evidence.`,
    );
  }
  const eventType = event.eventType;
  if (typeof eventType !== "string") {
    throw new AssignmentRepositoryError(
      "ASSIGNMENT_STORAGE_FAILED",
      `Run ${row.run_id} contains an invalid rejection event type.`,
    );
  }
  const summary = event.payload.summary;
  if (isJsonObject(summary)) {
    const validationRuleIds = summary.validationRuleIds;
    if (
      Array.isArray(validationRuleIds) &&
      validationRuleIds.length > 0
    ) {
      if (
        !validationRuleIds.every(
          (ruleId) =>
            typeof ruleId === "string" &&
            IDENTIFIER_PATTERN.test(ruleId),
        )
      ) {
        throw new AssignmentRepositoryError(
          "ASSIGNMENT_STORAGE_FAILED",
          `Run ${row.run_id} contains invalid rejection rule IDs.`,
        );
      }
      return [...new Set(validationRuleIds as string[])];
    }
  }
  if (
    eventType === "DECISION_REJECTED" &&
    isJsonObject(event.payload.decision) &&
    typeof event.payload.decision.commandType === "string"
  ) {
    const findingCode =
      `DECISION_REJECTED:${event.payload.decision.commandType}`;
    if (!IDENTIFIER_PATTERN.test(findingCode)) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        `Run ${row.run_id} contains an invalid rejected decision type.`,
      );
    }
    return [findingCode];
  }
  if (!IDENTIFIER_PATTERN.test(eventType)) {
    throw new AssignmentRepositoryError(
      "ASSIGNMENT_STORAGE_FAILED",
      `Run ${row.run_id} contains an invalid rejection event type.`,
    );
  }
  return [eventType];
}

function compareFindingCode(
  left: string,
  right: string,
): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assignmentMode(value: unknown): AssignmentRunMode {
  if (
    typeof value !== "string" ||
    !ASSIGNMENT_MODES.includes(value as AssignmentRunMode)
  ) {
    throw new AssignmentRepositoryError(
      "INVALID_ASSIGNMENT",
      "mode must be a supported hosted run mode.",
    );
  }
  return value as AssignmentRunMode;
}

function normalizeLearningContext(
  value: LtiLearningContextV1 | undefined,
): LtiLearningContextV1 | undefined {
  if (value === undefined) return undefined;
  if (
    value.schemaVersion !== "1.0.0" ||
    value.provider !== "lti-1.3"
  ) {
    throw new AssignmentRepositoryError(
      "INVALID_ASSIGNMENT",
      "learningContext must use the current LTI 1.3 contract.",
    );
  }
  const issuer = boundedText(
    value.issuer,
    "learningContext.issuer",
    2048,
  );
  try {
    new URL(issuer);
  } catch {
    throw new AssignmentRepositoryError(
      "INVALID_ASSIGNMENT",
      "learningContext issuer must be an absolute URL.",
    );
  }
  const contextLabel =
    value.contextLabel === undefined
      ? undefined
      : boundedText(value.contextLabel, "learningContext.contextLabel", 200);
  const contextTitle =
    value.contextTitle === undefined
      ? undefined
      : boundedText(value.contextTitle, "learningContext.contextTitle", 500);
  return {
    schemaVersion: "1.0.0",
    provider: "lti-1.3",
    issuer,
    clientId: boundedText(
      value.clientId,
      "learningContext.clientId",
      256,
    ),
    deploymentId: boundedText(
      value.deploymentId,
      "learningContext.deploymentId",
      256,
    ),
    contextId: boundedText(
      value.contextId,
      "learningContext.contextId",
      512,
    ),
    resourceLinkId: boundedText(
      value.resourceLinkId,
      "learningContext.resourceLinkId",
      512,
    ),
    ...(contextLabel === undefined ? {} : { contextLabel }),
    ...(contextTitle === undefined ? {} : { contextTitle }),
  };
}

function learningContextMatchesPrincipal(
  assignmentContext: LtiLearningContextV1,
  principalContext: LtiLearningContextV1,
): boolean {
  return (
    assignmentContext.issuer === principalContext.issuer &&
    assignmentContext.clientId === principalContext.clientId &&
    assignmentContext.deploymentId ===
      principalContext.deploymentId &&
    assignmentContext.contextId === principalContext.contextId &&
    assignmentContext.resourceLinkId ===
      principalContext.resourceLinkId &&
    assignmentContext.contextLabel ===
      principalContext.contextLabel &&
    assignmentContext.contextTitle ===
      principalContext.contextTitle
  );
}

function normalizeRequest(
  request: CreateHostedAssignmentRequest,
): CreateHostedAssignmentRequest {
  const learningContext = normalizeLearningContext(
    request.learningContext,
  );
  if (
    !Array.isArray(request.learnerUserIds) ||
    (request.learnerUserIds.length === 0 &&
      learningContext === undefined) ||
    request.learnerUserIds.length > 200
  ) {
    throw new AssignmentRepositoryError(
      "INVALID_ASSIGNMENT",
      "learnerUserIds must contain 1 to 200 provisioned learners unless the assignment uses verified LTI learner launch.",
    );
  }
  const learnerUserIds = [
    ...new Set(
      request.learnerUserIds.map((learnerUserId, index) =>
        identifier(
          learnerUserId,
          `learnerUserIds[${String(index)}]`,
        ),
      ),
    ),
  ].sort();
  if (learnerUserIds.length !== request.learnerUserIds.length) {
    throw new AssignmentRepositoryError(
      "INVALID_ASSIGNMENT",
      "learnerUserIds must not contain duplicates.",
    );
  }
  let runConfiguration;
  let experienceConfiguration;
  let experienceConfigurationHash;
  let counterfactualReplay;
  let research;
  try {
    runConfiguration = validateHostedModeConfiguration(
      request.runConfiguration,
      assignmentMode(request.mode),
    );
    assertHostedExperienceIdentity({
      configuration: request.experienceConfiguration,
      configurationHash:
        request.experienceConfigurationHash,
    });
    experienceConfiguration = structuredClone(
      request.experienceConfiguration,
    );
    experienceConfigurationHash =
      request.experienceConfigurationHash;
    if (
      experienceConfiguration.delivery.channel !== "HOSTED" ||
      experienceConfiguration.content.packId !== request.packId ||
      experienceConfiguration.content.packVersion !==
        request.packVersion ||
      experienceConfiguration.content.scenarioId !==
        request.scenarioId ||
      experienceConfiguration.content.scenarioVersion !==
        request.scenarioVersion
    ) {
      throw new Error(
        "Hosted experience configuration must identify the exact assignment content.",
      );
    }
    counterfactualReplay =
      validateAssignmentCounterfactualConfiguration(
        request.counterfactualReplay,
        runConfiguration.mode,
      );
    research = validateAssignmentResearchConfiguration(
      request.research,
      runConfiguration,
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new AssignmentRepositoryError(
        "INVALID_ASSIGNMENT",
        error.message,
      );
    }
    throw error;
  }
  const availableFrom = optionalUtcTimestamp(
    request.availableFrom,
    "availableFrom",
  );
  const availableUntil = optionalUtcTimestamp(
    request.availableUntil,
    "availableUntil",
  );
  if (
    availableFrom !== undefined &&
    availableUntil !== undefined &&
    availableFrom >= availableUntil
  ) {
    throw new AssignmentRepositoryError(
      "INVALID_ASSIGNMENT",
      "availableFrom must be earlier than availableUntil.",
    );
  }
  return {
    commandId: identifier(request.commandId, "commandId"),
    assignmentId: identifier(request.assignmentId, "assignmentId"),
    title: boundedText(request.title, "title", 160),
    packId: identifier(request.packId, "packId"),
    packVersion: boundedText(request.packVersion, "packVersion", 64),
    scenarioId: identifier(request.scenarioId, "scenarioId"),
    scenarioVersion: boundedText(
      request.scenarioVersion,
      "scenarioVersion",
      64,
    ),
    mode: runConfiguration.mode,
    runConfiguration,
    experienceConfiguration,
    experienceConfigurationHash,
    counterfactualReplay,
    research,
    ...(learningContext === undefined ? {} : { learningContext }),
    learnerUserIds,
    ...(availableFrom === undefined ? {} : { availableFrom }),
    ...(availableUntil === undefined ? {} : { availableUntil }),
  };
}

function normalizeRatingRequest(
  request: SaveManualRubricRatingRequest,
): SaveManualRubricRatingRequest {
  if (
    !Number.isInteger(request.levelValue) ||
    !Number.isInteger(request.expectedRevision) ||
    request.expectedRevision < 0
  ) {
    throw new AssignmentRepositoryError(
      "INVALID_RATING",
      "Rating level and expected revision must be integers.",
    );
  }
  if (
    typeof request.comment !== "string" ||
    request.comment.length > 1000
  ) {
    throw new AssignmentRepositoryError(
      "INVALID_RATING",
      "Rating comment must not exceed 1,000 characters.",
    );
  }
  if (
    !Array.isArray(request.linkedEvidenceIds) ||
    request.linkedEvidenceIds.length === 0 ||
    request.linkedEvidenceIds.length > 100
  ) {
    throw new AssignmentRepositoryError(
      "INVALID_RATING",
      "A rating must link 1 to 100 evidence records.",
    );
  }
  const linkedEvidenceIds = [
    ...new Set(
      request.linkedEvidenceIds.map((evidenceId, index) =>
        identifier(
          evidenceId,
          `linkedEvidenceIds[${String(index)}]`,
        ),
      ),
    ),
  ].sort();
  if (linkedEvidenceIds.length !== request.linkedEvidenceIds.length) {
    throw new AssignmentRepositoryError(
      "INVALID_RATING",
      "linkedEvidenceIds must not contain duplicates.",
    );
  }
  return {
    commandId: identifier(request.commandId, "commandId"),
    runId: identifier(request.runId, "runId"),
    rubricId: identifier(request.rubricId, "rubricId"),
    rubricVersion: boundedText(
      request.rubricVersion,
      "rubricVersion",
      64,
    ),
    criterionId: identifier(request.criterionId, "criterionId"),
    levelValue: request.levelValue,
    comment: request.comment.trim(),
    linkedEvidenceIds,
    expectedRevision: request.expectedRevision,
  };
}

function normalizeModerationRequest(
  request: SaveRubricModerationRequest,
): SaveRubricModerationRequest {
  if (
    !Number.isInteger(request.levelValue) ||
    !Number.isInteger(request.expectedRevision) ||
    request.expectedRevision < 0
  ) {
    throw new AssignmentRepositoryError(
      "INVALID_MODERATION",
      "Moderation level and expected revision must be integers.",
    );
  }
  if (
    typeof request.comment !== "string" ||
    request.comment.trim().length === 0 ||
    request.comment.length > 1000
  ) {
    throw new AssignmentRepositoryError(
      "INVALID_MODERATION",
      "Moderation comment must contain 1 to 1,000 characters.",
    );
  }
  if (
    !Array.isArray(request.sourceRatingIds) ||
    request.sourceRatingIds.length === 0 ||
    request.sourceRatingIds.length > 100
  ) {
    throw new AssignmentRepositoryError(
      "INVALID_MODERATION",
      "Moderation must reference 1 to 100 rating revisions.",
    );
  }
  const sourceRatingIds = [
    ...new Set(
      request.sourceRatingIds.map((ratingId, index) =>
        identifier(
          ratingId,
          `sourceRatingIds[${String(index)}]`,
        ),
      ),
    ),
  ].sort();
  if (sourceRatingIds.length !== request.sourceRatingIds.length) {
    throw new AssignmentRepositoryError(
      "INVALID_MODERATION",
      "sourceRatingIds must not contain duplicates.",
    );
  }
  return {
    commandId: identifier(request.commandId, "commandId"),
    runId: identifier(request.runId, "runId"),
    rubricId: identifier(request.rubricId, "rubricId"),
    rubricVersion: boundedText(
      request.rubricVersion,
      "rubricVersion",
      64,
    ),
    criterionId: identifier(request.criterionId, "criterionId"),
    levelValue: request.levelValue,
    comment: request.comment.trim(),
    sourceRatingIds,
    expectedRevision: request.expectedRevision,
  };
}

function linkedEvidenceFrom(row: RatingRow): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(row.linked_evidence_ids_json);
    if (
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
    ) {
      return parsed;
    }
  } catch {
    // The structured storage error below is safer than exposing JSON details.
  }
  throw new AssignmentRepositoryError(
    "ASSIGNMENT_STORAGE_FAILED",
    "Stored rating evidence violates the current contract.",
  );
}

function ratingFrom(row: RatingRow): ManualRubricRatingV1 {
  return {
    schemaVersion: "1.0.0",
    ratingId: row.rating_id,
    assignmentId: row.assignment_id,
    runId: row.run_id,
    rubricId: row.rubric_id,
    rubricVersion: row.rubric_version,
    criterionId: row.criterion_id,
    levelValue: row.level_value,
    comment: row.comment,
    linkedEvidenceIds: linkedEvidenceFrom(row),
    revision: row.revision,
    raterUserId: row.rater_user_id,
    ratedAt: row.rated_at_utc,
  };
}

function sourceRatingIdsFrom(
  row: ModerationRow,
): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(row.source_rating_ids_json);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((item) => typeof item === "string")
    ) {
      return parsed;
    }
  } catch {
    // The structured storage error below avoids exposing database details.
  }
  throw new AssignmentRepositoryError(
    "ASSIGNMENT_STORAGE_FAILED",
    "Stored moderation evidence violates the current contract.",
  );
}

function moderationFrom(
  row: ModerationRow,
): RubricModerationResolutionV1 {
  return {
    schemaVersion: "1.0.0",
    resolutionId: row.resolution_id,
    assignmentId: row.assignment_id,
    runId: row.run_id,
    rubricId: row.rubric_id,
    rubricVersion: row.rubric_version,
    criterionId: row.criterion_id,
    levelValue: row.level_value,
    comment: row.comment,
    sourceRatingIds: sourceRatingIdsFrom(row),
    revision: row.revision,
    moderatorUserId: row.moderator_user_id,
    resolvedAt: row.resolved_at_utc,
  };
}

function isSameRating(
  existing: ManualRubricRatingV1,
  request: SaveManualRubricRatingRequest,
  principal: ApplicationPrincipal,
): boolean {
  return (
    existing.ratingId === request.commandId &&
    existing.runId === request.runId &&
    existing.rubricId === request.rubricId &&
    existing.rubricVersion === request.rubricVersion &&
    existing.criterionId === request.criterionId &&
    existing.levelValue === request.levelValue &&
    existing.comment === request.comment &&
    existing.revision === request.expectedRevision + 1 &&
    existing.raterUserId === principal.userId &&
    JSON.stringify(existing.linkedEvidenceIds) ===
      JSON.stringify(request.linkedEvidenceIds)
  );
}

function isSameModeration(
  existing: RubricModerationResolutionV1,
  request: SaveRubricModerationRequest,
  principal: ApplicationPrincipal,
): boolean {
  return (
    existing.resolutionId === request.commandId &&
    existing.runId === request.runId &&
    existing.rubricId === request.rubricId &&
    existing.rubricVersion === request.rubricVersion &&
    existing.criterionId === request.criterionId &&
    existing.levelValue === request.levelValue &&
    existing.comment === request.comment &&
    existing.revision === request.expectedRevision + 1 &&
    existing.moderatorUserId === principal.userId &&
    JSON.stringify(existing.sourceRatingIds) ===
      JSON.stringify(request.sourceRatingIds)
  );
}

function isSameAssignment(
  existing: HostedAssignmentV1,
  row: AssignmentRow,
  request: CreateHostedAssignmentRequest,
  principal: ApplicationPrincipal,
): boolean {
  return (
    row.creation_command_id === request.commandId &&
    existing.assignmentId === request.assignmentId &&
    existing.title === request.title &&
    existing.packId === request.packId &&
    existing.packVersion === request.packVersion &&
    existing.scenarioId === request.scenarioId &&
    existing.scenarioVersion === request.scenarioVersion &&
    existing.mode === request.mode &&
    JSON.stringify(existing.runConfiguration) ===
      JSON.stringify(request.runConfiguration) &&
    existing.experienceConfigurationHash ===
      request.experienceConfigurationHash &&
    JSON.stringify(existing.experienceConfiguration) ===
      JSON.stringify(request.experienceConfiguration) &&
    JSON.stringify(existing.counterfactualReplay) ===
      JSON.stringify(request.counterfactualReplay) &&
    JSON.stringify(existing.research) ===
      JSON.stringify(request.research) &&
    JSON.stringify(existing.learningContext) ===
      JSON.stringify(request.learningContext) &&
    existing.availableFrom === request.availableFrom &&
    existing.availableUntil === request.availableUntil &&
    existing.createdByUserId === principal.userId &&
    JSON.stringify(existing.learnerUserIds) ===
      JSON.stringify(request.learnerUserIds)
  );
}

function assignmentFrom(
  row: AssignmentRow,
  learnerUserIds: readonly string[],
): HostedAssignmentV1 {
  const closeMetadata = [
    row.close_command_id,
    row.closed_at_utc,
    row.closed_by_user_id,
  ];
  const hasAnyCloseMetadata = closeMetadata.some(
    (value) => value !== null,
  );
  const hasCompleteCloseMetadata = closeMetadata.every(
    (value) => value !== null,
  );
  let availableFrom: string | undefined;
  let availableUntil: string | undefined;
  let learningContext: LtiLearningContextV1 | undefined;
  try {
    availableFrom = optionalUtcTimestamp(
      row.available_from_utc ?? undefined,
      "stored availableFrom",
    );
    availableUntil = optionalUtcTimestamp(
      row.available_until_utc ?? undefined,
      "stored availableUntil",
    );
    const contextValues = [
      row.learning_platform_issuer,
      row.learning_platform_client_id,
      row.learning_platform_deployment_id,
      row.learning_context_id,
      row.learning_resource_link_id,
    ];
    const hasAnyContext = contextValues.some((value) => value !== null);
    const hasCompleteContext = contextValues.every(
      (value) => value !== null,
    );
    if (hasAnyContext !== hasCompleteContext) {
      throw new Error("Stored learning context is incomplete.");
    }
    if (hasCompleteContext) {
      learningContext = normalizeLearningContext({
        schemaVersion: "1.0.0",
        provider: "lti-1.3",
        issuer: row.learning_platform_issuer!,
        clientId: row.learning_platform_client_id!,
        deploymentId: row.learning_platform_deployment_id!,
        contextId: row.learning_context_id!,
        resourceLinkId: row.learning_resource_link_id!,
        ...(row.learning_context_label === null
          ? {}
          : { contextLabel: row.learning_context_label }),
        ...(row.learning_context_title === null
          ? {}
          : { contextTitle: row.learning_context_title }),
      });
    } else if (
      row.learning_context_label !== null ||
      row.learning_context_title !== null
    ) {
      throw new Error("Stored learning-context labels have no context.");
    }
  } catch (error) {
    throw new AssignmentRepositoryError(
      "ASSIGNMENT_STORAGE_FAILED",
      error instanceof Error
        ? error.message
        : "Stored assignment availability is invalid.",
    );
  }
  if (
    !ASSIGNMENT_MODES.includes(row.run_mode as AssignmentRunMode) ||
    (row.lifecycle_status !== "active" &&
      row.lifecycle_status !== "closed") ||
    (row.lifecycle_status === "active" &&
      hasAnyCloseMetadata) ||
    (row.lifecycle_status === "closed" &&
      !hasCompleteCloseMetadata) ||
    (row.available_from_utc !== null &&
      availableFrom !== row.available_from_utc) ||
    (row.available_until_utc !== null &&
      availableUntil !== row.available_until_utc) ||
    (availableFrom !== undefined &&
      availableUntil !== undefined &&
      availableFrom >= availableUntil) ||
    (row.feedback_release_status !== "withheld" &&
      row.feedback_release_status !== "released")
  ) {
    throw new AssignmentRepositoryError(
      "ASSIGNMENT_STORAGE_FAILED",
      "Stored assignment data violates the current contract.",
    );
  }
  let runConfiguration;
  let experienceConfiguration;
  let experienceConfigurationHash;
  let counterfactualReplay;
  let research;
  try {
    runConfiguration = validateHostedModeConfiguration(
      JSON.parse(row.mode_configuration_json) as unknown,
      row.run_mode as AssignmentRunMode,
    );
    experienceConfiguration = JSON.parse(
      row.experience_configuration_json,
    ) as HostedAssignmentV1["experienceConfiguration"];
    experienceConfigurationHash =
      row.experience_configuration_hash;
    assertHostedExperienceIdentity({
      configuration: experienceConfiguration,
      configurationHash: experienceConfigurationHash,
    });
    counterfactualReplay =
      validateAssignmentCounterfactualConfiguration(
        JSON.parse(
          row.counterfactual_configuration_json,
        ) as unknown,
        row.run_mode as AssignmentRunMode,
      );
    research = validateAssignmentResearchConfiguration(
      JSON.parse(row.research_configuration_json) as unknown,
      runConfiguration,
    );
  } catch (error) {
    throw new AssignmentRepositoryError(
      "ASSIGNMENT_STORAGE_FAILED",
      error instanceof Error
        ? `Stored assignment mode configuration is invalid: ${error.message}`
        : "Stored assignment mode configuration is invalid.",
    );
  }
  return {
    schemaVersion: "2.0.0",
    assignmentId: row.assignment_id,
    title: row.title,
    packId: row.pack_id,
    packVersion: row.pack_version,
    scenarioId: row.scenario_id,
    scenarioVersion: row.scenario_version,
    mode: row.run_mode as AssignmentRunMode,
    runConfiguration,
    experienceConfiguration,
    experienceConfigurationHash,
    counterfactualReplay,
    research,
    ...(learningContext === undefined ? {} : { learningContext }),
    learnerUserIds,
    status: row.lifecycle_status,
    ...(availableFrom === undefined ? {} : { availableFrom }),
    ...(availableUntil === undefined ? {} : { availableUntil }),
    ...(row.closed_at_utc === null
      ? {}
      : { closedAt: row.closed_at_utc }),
    ...(row.closed_by_user_id === null
      ? {}
      : { closedByUserId: row.closed_by_user_id }),
    feedbackReleaseStatus: row.feedback_release_status,
    ...(row.feedback_released_at_utc === null
      ? {}
      : { feedbackReleasedAt: row.feedback_released_at_utc }),
    ...(row.feedback_released_by_user_id === null
      ? {}
      : {
          feedbackReleasedByUserId:
            row.feedback_released_by_user_id,
        }),
    createdAt: row.created_at_utc,
    createdByUserId: row.created_by_user_id,
  };
}

export class D1AssignmentRepository {
  constructor(
    private readonly database: D1DatabaseLike,
    private readonly clock: Clock,
  ) {}

  async create(
    request: CreateHostedAssignmentRequest,
    principal: ApplicationPrincipal,
  ): Promise<HostedAssignmentCreationResult> {
    const normalized = normalizeRequest(request);
    if (
      normalized.learningContext !== undefined &&
      (
        principal.authenticationSource !== "lti" ||
        principal.learningContext === undefined ||
        !learningContextMatchesPrincipal(
          normalized.learningContext,
          principal.learningContext,
        )
      )
    ) {
      throw new AssignmentRepositoryError(
        "INVALID_ASSIGNMENT",
        "Only a verified LTI session may bind an assignment to its exact learning context.",
      );
    }
    const existingRow = await this.database
      .prepare(FIND_ASSIGNMENT)
      .bind(normalized.assignmentId)
      .first<AssignmentRow>();
    if (existingRow !== null) {
      const existing = await this.assignmentFromRow(existingRow);
      if (isSameAssignment(existing, existingRow, normalized, principal)) {
        return {
          assignment: existing,
          wasIdempotentReplay: true,
        };
      }
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_CONFLICT",
        "The assignment ID is already bound to different content.",
      );
    }
    const commandMatch = await this.database
      .prepare(FIND_ASSIGNMENT_BY_COMMAND)
      .bind(normalized.commandId)
      .first<{ readonly assignment_id: string }>();
    if (commandMatch !== null) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_CONFLICT",
        "The assignment command ID is already bound to another assignment.",
      );
    }
    for (const learnerUserId of normalized.learnerUserIds) {
      const learner = await this.database
        .prepare(FIND_ACTIVE_LEARNER)
        .bind(learnerUserId)
        .first<{ readonly user_id: string }>();
      if (learner === null) {
        throw new AssignmentRepositoryError(
          "LEARNER_NOT_PROVISIONED",
          `Learner ${learnerUserId} is not active and provisioned.`,
        );
      }
    }
    const now = this.clock.now();
    const results = await this.database.batch([
      this.database
        .prepare(INSERT_ASSIGNMENT)
        .bind(
          normalized.assignmentId,
          normalized.commandId,
          normalized.title,
          normalized.packId,
          normalized.packVersion,
          normalized.scenarioId,
          normalized.scenarioVersion,
          normalized.mode,
          JSON.stringify(normalized.runConfiguration),
          JSON.stringify(
            normalized.experienceConfiguration,
          ),
          normalized.experienceConfigurationHash,
          JSON.stringify(normalized.counterfactualReplay),
          JSON.stringify(normalized.research),
          normalized.learningContext?.issuer ?? null,
          normalized.learningContext?.clientId ?? null,
          normalized.learningContext?.deploymentId ?? null,
          normalized.learningContext?.contextId ?? null,
          normalized.learningContext?.resourceLinkId ?? null,
          normalized.learningContext?.contextLabel ?? null,
          normalized.learningContext?.contextTitle ?? null,
          normalized.availableFrom ?? null,
          normalized.availableUntil ?? null,
          now,
          principal.userId,
        ),
      ...normalized.learnerUserIds.map((learnerUserId) =>
        this.database
          .prepare(INSERT_LEARNER)
          .bind(
            normalized.assignmentId,
            learnerUserId,
            now,
            principal.userId,
          ),
      ),
    ]);
    if (results.some((result) => !result.success)) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "The assignment could not be stored atomically.",
      );
    }
    const assignment = await this.find(normalized.assignmentId);
    if (assignment === null) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "The stored assignment could not be reloaded.",
      );
    }
    return { assignment, wasIdempotentReplay: false };
  }

  async find(assignmentId: string): Promise<HostedAssignmentV1 | null> {
    const normalizedId = identifier(assignmentId, "assignmentId");
    const row = await this.database
      .prepare(FIND_ASSIGNMENT)
      .bind(normalizedId)
      .first<AssignmentRow>();
    return row === null ? null : this.assignmentFromRow(row);
  }

  async findForRun(
    runId: string,
  ): Promise<HostedAssignmentV1 | null> {
    const normalizedRunId = identifier(runId, "runId");
    const link = await this.database
      .prepare(FIND_RUN_ASSIGNMENT)
      .bind(normalizedRunId)
      .first<{
        readonly assignment_id: string | null;
        readonly learner_user_id: string | null;
      }>();
    if (
      link === null ||
      link.assignment_id === null ||
      link.learner_user_id === null
    ) {
      return null;
    }
    const assignment = await this.find(link.assignment_id);
    if (
      assignment === null ||
      !assignment.learnerUserIds.includes(link.learner_user_id)
    ) {
      throw new AssignmentRepositoryError(
        "RUN_NOT_ASSIGNED",
        "Run assignment evidence does not match the assignment roster.",
      );
    }
    return assignment;
  }

  async listForLearner(
    learnerUserId: string,
  ): Promise<readonly HostedLearnerAssignmentV1[]> {
    const normalizedLearnerId = identifier(
      learnerUserId,
      "learnerUserId",
    );
    const result = await this.database
      .prepare(LIST_LEARNER_ASSIGNMENTS)
      .bind(normalizedLearnerId)
      .all<AssignmentRow>();
    if (!result.success) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "Learner assignments could not be loaded.",
      );
    }
    const assignments: HostedLearnerAssignmentV1[] = [];
    const observedAt = this.clock.now();
    for (const row of result.results) {
      const assignment = await this.assignmentFromRow(row);
      const report = await this.report(assignment.assignmentId);
      assignments.push({
        assignment,
        startAvailability: assignmentStartAvailability(
          assignment,
          observedAt,
        ),
        runs:
          report.learners.find(
            (learner) =>
              learner.learnerUserId === normalizedLearnerId,
          )?.runs ?? [],
      });
    }
    return assignments;
  }

  async saveRating(
    request: SaveManualRubricRatingRequest,
    principal: ApplicationPrincipal,
  ): Promise<ManualRubricRatingResult> {
    const normalized = normalizeRatingRequest(request);
    const existingRow = await this.database
      .prepare(FIND_RATING_BY_ID)
      .bind(normalized.commandId)
      .first<RatingRow>();
    if (existingRow !== null) {
      const existing = ratingFrom(existingRow);
      if (isSameRating(existing, normalized, principal)) {
        return {
          rating: existing,
          wasIdempotentReplay: true,
        };
      }
      throw new AssignmentRepositoryError(
        "RATING_REVISION_CONFLICT",
        "The rating command ID is already bound to different content.",
      );
    }
    const assignment = await this.findForRun(normalized.runId);
    if (assignment === null) {
      throw new AssignmentRepositoryError(
        "RUN_NOT_ASSIGNED",
        "Manual ratings require a run created from an assignment.",
      );
    }
    const existingRatings = await this.ratingRows(normalized.runId);
    const latestRevision = existingRatings
      .filter(
        (rating) =>
          rating.rubric_id === normalized.rubricId &&
          rating.criterion_id === normalized.criterionId,
      )
      .reduce(
        (latest, rating) => Math.max(latest, rating.revision),
        0,
      );
    if (latestRevision !== normalized.expectedRevision) {
      throw new AssignmentRepositoryError(
        "RATING_REVISION_CONFLICT",
        "The rubric criterion was rated from a stale revision.",
      );
    }
    const revision = latestRevision + 1;
    const ratedAt = this.clock.now();
    const result = await this.database
      .prepare(INSERT_RATING)
      .bind(
        normalized.commandId,
        assignment.assignmentId,
        normalized.runId,
        normalized.rubricId,
        normalized.rubricVersion,
        normalized.criterionId,
        revision,
        normalized.levelValue,
        normalized.comment,
        JSON.stringify(normalized.linkedEvidenceIds),
        principal.userId,
        ratedAt,
      )
      .run();
    if (!result.success) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "The rating revision could not be stored.",
      );
    }
    return {
      rating: {
        schemaVersion: "1.0.0",
        ratingId: normalized.commandId,
        assignmentId: assignment.assignmentId,
        runId: normalized.runId,
        rubricId: normalized.rubricId,
        rubricVersion: normalized.rubricVersion,
        criterionId: normalized.criterionId,
        levelValue: normalized.levelValue,
        comment: normalized.comment,
        linkedEvidenceIds: normalized.linkedEvidenceIds,
        revision,
        raterUserId: principal.userId,
        ratedAt,
      },
      wasIdempotentReplay: false,
    };
  }

  async currentRatings(
    runId: string,
  ): Promise<readonly ManualRubricRatingV1[]> {
    const rows = await this.ratingRows(identifier(runId, "runId"));
    const latestByCriterion = new Map<string, RatingRow>();
    for (const row of rows) {
      const key = `${row.rubric_id}\u0000${row.criterion_id}`;
      const current = latestByCriterion.get(key);
      if (current === undefined || current.revision < row.revision) {
        latestByCriterion.set(key, row);
      }
    }
    return [...latestByCriterion.values()]
      .sort((left, right) =>
        `${left.rubric_id}\u0000${left.criterion_id}`.localeCompare(
          `${right.rubric_id}\u0000${right.criterion_id}`,
        ),
      )
      .map(ratingFrom);
  }

  async ratingHistory(
    assignmentId: string,
  ): Promise<readonly ManualRubricRatingV1[]> {
    const assignment = await this.find(assignmentId);
    if (assignment === null) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_NOT_FOUND",
        `Assignment ${assignmentId} does not exist.`,
      );
    }
    const result = await this.database
      .prepare(FIND_RATINGS_FOR_ASSIGNMENT)
      .bind(assignment.assignmentId)
      .all<RatingRow>();
    if (!result.success) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "Assignment rating history could not be loaded.",
      );
    }
    return result.results.map(ratingFrom);
  }

  async saveModeration(
    request: SaveRubricModerationRequest,
    principal: ApplicationPrincipal,
  ): Promise<RubricModerationResult> {
    const normalized = normalizeModerationRequest(request);
    const existingRow = await this.database
      .prepare(FIND_MODERATION_BY_ID)
      .bind(normalized.commandId)
      .first<ModerationRow>();
    if (existingRow !== null) {
      const existing = moderationFrom(existingRow);
      if (isSameModeration(existing, normalized, principal)) {
        return {
          resolution: existing,
          wasIdempotentReplay: true,
        };
      }
      throw new AssignmentRepositoryError(
        "MODERATION_REVISION_CONFLICT",
        "The moderation command ID is already bound to different content.",
      );
    }
    const assignment = await this.findForRun(normalized.runId);
    if (assignment === null) {
      throw new AssignmentRepositoryError(
        "RUN_NOT_ASSIGNED",
        "Moderation requires a run created from an assignment.",
      );
    }
    const ratingRows = await this.ratingRows(normalized.runId);
    const ratingsById = new Map(
      ratingRows.map((row) => [row.rating_id, row]),
    );
    for (const ratingId of normalized.sourceRatingIds) {
      const rating = ratingsById.get(ratingId);
      if (
        rating === undefined ||
        rating.rubric_id !== normalized.rubricId ||
        rating.rubric_version !== normalized.rubricVersion ||
        rating.criterion_id !== normalized.criterionId
      ) {
        throw new AssignmentRepositoryError(
          "INVALID_MODERATION",
          "Moderation sources must be rating revisions for the same run, rubric, version, and criterion.",
        );
      }
    }
    const existingResolutions = await this.moderationRows(
      normalized.runId,
    );
    const latestRevision = existingResolutions
      .filter(
        (resolution) =>
          resolution.rubric_id === normalized.rubricId &&
          resolution.criterion_id === normalized.criterionId,
      )
      .reduce(
        (latest, resolution) =>
          Math.max(latest, resolution.revision),
        0,
      );
    if (latestRevision !== normalized.expectedRevision) {
      throw new AssignmentRepositoryError(
        "MODERATION_REVISION_CONFLICT",
        "The rubric criterion was moderated from a stale revision.",
      );
    }
    const revision = latestRevision + 1;
    const resolvedAt = this.clock.now();
    const result = await this.database
      .prepare(INSERT_MODERATION)
      .bind(
        normalized.commandId,
        assignment.assignmentId,
        normalized.runId,
        normalized.rubricId,
        normalized.rubricVersion,
        normalized.criterionId,
        revision,
        normalized.levelValue,
        normalized.comment,
        JSON.stringify(normalized.sourceRatingIds),
        principal.userId,
        resolvedAt,
      )
      .run();
    if (!result.success) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "The moderation resolution could not be stored.",
      );
    }
    return {
      resolution: {
        schemaVersion: "1.0.0",
        resolutionId: normalized.commandId,
        assignmentId: assignment.assignmentId,
        runId: normalized.runId,
        rubricId: normalized.rubricId,
        rubricVersion: normalized.rubricVersion,
        criterionId: normalized.criterionId,
        levelValue: normalized.levelValue,
        comment: normalized.comment,
        sourceRatingIds: normalized.sourceRatingIds,
        revision,
        moderatorUserId: principal.userId,
        resolvedAt,
      },
      wasIdempotentReplay: false,
    };
  }

  async currentModerationResolutions(
    runId: string,
  ): Promise<readonly RubricModerationResolutionV1[]> {
    const rows = await this.moderationRows(identifier(runId, "runId"));
    const latestByCriterion = new Map<string, ModerationRow>();
    for (const row of rows) {
      const key = `${row.rubric_id}\u0000${row.criterion_id}`;
      const current = latestByCriterion.get(key);
      if (current === undefined || current.revision < row.revision) {
        latestByCriterion.set(key, row);
      }
    }
    return [...latestByCriterion.values()]
      .sort((left, right) =>
        `${left.rubric_id}\u0000${left.criterion_id}`.localeCompare(
          `${right.rubric_id}\u0000${right.criterion_id}`,
        ),
      )
      .map(moderationFrom);
  }

  async moderationHistory(
    assignmentId: string,
  ): Promise<readonly RubricModerationResolutionV1[]> {
    const assignment = await this.find(assignmentId);
    if (assignment === null) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_NOT_FOUND",
        `Assignment ${assignmentId} does not exist.`,
      );
    }
    const result = await this.database
      .prepare(FIND_MODERATION_FOR_ASSIGNMENT)
      .bind(assignment.assignmentId)
      .all<ModerationRow>();
    if (!result.success) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "Assignment moderation history could not be loaded.",
      );
    }
    return result.results.map(moderationFrom);
  }

  async close(
    assignmentId: string,
    commandId: string,
    principal: ApplicationPrincipal,
  ): Promise<HostedAssignmentCreationResult> {
    const normalizedAssignmentId = identifier(
      assignmentId,
      "assignmentId",
    );
    const normalizedCommandId = identifier(commandId, "commandId");
    const row = await this.database
      .prepare(FIND_ASSIGNMENT)
      .bind(normalizedAssignmentId)
      .first<AssignmentRow>();
    if (row === null) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_NOT_FOUND",
        `Assignment ${normalizedAssignmentId} does not exist.`,
      );
    }
    if (row.lifecycle_status === "closed") {
      if (row.close_command_id !== normalizedCommandId) {
        throw new AssignmentRepositoryError(
          "ASSIGNMENT_ALREADY_CLOSED",
          "The assignment was already closed by another command.",
        );
      }
      return {
        assignment: await this.assignmentFromRow(row),
        wasIdempotentReplay: true,
      };
    }
    const commandMatch = await this.database
      .prepare(FIND_ASSIGNMENT_BY_CLOSE_COMMAND)
      .bind(normalizedCommandId)
      .first<{ readonly assignment_id: string }>();
    if (
      commandMatch !== null &&
      commandMatch.assignment_id !== normalizedAssignmentId
    ) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_CONFLICT",
        "The assignment close command ID is already bound to another assignment.",
      );
    }
    const now = this.clock.now();
    const result = await this.database
      .prepare(CLOSE_ASSIGNMENT)
      .bind(
        normalizedCommandId,
        now,
        principal.userId,
        normalizedAssignmentId,
      )
      .run();
    if (!result.success) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "Assignment closure could not be stored.",
      );
    }
    if (result.meta?.changes !== 1) {
      const latestRow = await this.database
        .prepare(FIND_ASSIGNMENT)
        .bind(normalizedAssignmentId)
        .first<AssignmentRow>();
      if (
        latestRow !== null &&
        latestRow.lifecycle_status === "closed"
      ) {
        if (latestRow.close_command_id === normalizedCommandId) {
          return {
            assignment: await this.assignmentFromRow(latestRow),
            wasIdempotentReplay: true,
          };
        }
        throw new AssignmentRepositoryError(
          "ASSIGNMENT_ALREADY_CLOSED",
          "The assignment was closed concurrently by another command.",
        );
      }
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "Assignment closure did not update the stored assignment.",
      );
    }
    const assignment = await this.find(normalizedAssignmentId);
    if (assignment === null) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "Closed assignment could not be reloaded.",
      );
    }
    return {
      assignment,
      wasIdempotentReplay: false,
    };
  }

  async releaseFeedback(
    assignmentId: string,
    commandId: string,
    principal: ApplicationPrincipal,
  ): Promise<HostedAssignmentCreationResult> {
    const normalizedAssignmentId = identifier(
      assignmentId,
      "assignmentId",
    );
    const normalizedCommandId = identifier(commandId, "commandId");
    const row = await this.database
      .prepare(FIND_ASSIGNMENT)
      .bind(normalizedAssignmentId)
      .first<AssignmentRow>();
    if (row === null) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_NOT_FOUND",
        `Assignment ${normalizedAssignmentId} does not exist.`,
      );
    }
    if (row.feedback_release_status === "released") {
      if (row.feedback_release_command_id !== normalizedCommandId) {
        throw new AssignmentRepositoryError(
          "FEEDBACK_ALREADY_RELEASED",
          "Feedback was already released by another command.",
        );
      }
      return {
        assignment: await this.assignmentFromRow(row),
        wasIdempotentReplay: true,
      };
    }
    const now = this.clock.now();
    const result = await this.database
      .prepare(RELEASE_FEEDBACK)
      .bind(
        normalizedCommandId,
        now,
        principal.userId,
        normalizedAssignmentId,
      )
      .run();
    if (!result.success || result.meta?.changes !== 1) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "Feedback release could not be stored.",
      );
    }
    const assignment = await this.find(normalizedAssignmentId);
    if (assignment === null) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "Released assignment could not be reloaded.",
      );
    }
    return {
      assignment,
      wasIdempotentReplay: false,
    };
  }

  async report(
    assignmentId: string,
  ): Promise<HostedAssignmentReportV1> {
    const assignment = await this.find(assignmentId);
    if (assignment === null) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_NOT_FOUND",
        `Assignment ${assignmentId} does not exist.`,
      );
    }
    const result = await this.database
      .prepare(FIND_ASSIGNMENT_RUNS)
      .bind(assignment.assignmentId)
      .all<RunSummaryRow>();
    if (!result.success) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "Assignment runs could not be loaded.",
      );
    }
    const rejectionResult = await this.database
      .prepare(FIND_ASSIGNMENT_REJECTION_EVENTS)
      .bind(assignment.assignmentId)
      .all<RejectionEventRow>();
    if (!rejectionResult.success) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "Assignment rejection evidence could not be loaded.",
      );
    }
    const rejectionFindingsByRun = new Map<
      string,
      Map<string, number>
    >();
    for (const row of rejectionResult.results) {
      const findings =
        rejectionFindingsByRun.get(row.run_id) ??
        new Map<string, number>();
      for (const findingCode of rejectionFindingCodes(row)) {
        findings.set(
          findingCode,
          (findings.get(findingCode) ?? 0) + 1,
        );
      }
      rejectionFindingsByRun.set(row.run_id, findings);
    }
    const runs: HostedAssignmentRunSummary[] = [];
    for (const row of result.results) {
      const startedAtMs = Date.parse(row.started_at_utc);
      const lastActivityAtMs = Date.parse(row.last_activity_at_utc);
      const completedAtMs =
        row.completed_at_utc === null
          ? null
          : Date.parse(row.completed_at_utc);
      if (
        !Number.isFinite(startedAtMs) ||
        !Number.isFinite(lastActivityAtMs) ||
        (completedAtMs !== null &&
          !Number.isFinite(completedAtMs)) ||
        lastActivityAtMs < startedAtMs ||
        (completedAtMs !== null && completedAtMs < startedAtMs)
      ) {
        throw new AssignmentRepositoryError(
          "ASSIGNMENT_STORAGE_FAILED",
          `Run ${row.run_id} contains invalid event timing.`,
        );
      }
      const elapsedUntilMs =
        completedAtMs ?? lastActivityAtMs;
      runs.push({
        runId: row.run_id,
        learnerUserId: row.learner_user_id,
        status: row.completed === 1 ? "completed" : "active",
        eventCount: row.event_count,
        startedAt: row.started_at_utc,
        lastActivityAt: row.last_activity_at_utc,
        completedAt: row.completed_at_utc,
        elapsedSeconds: Math.floor(
          (elapsedUntilMs - startedAtMs) / 1_000,
        ),
        activity: {
          evidenceInspectionCount: activityCount(
            row.evidence_inspection_count,
            "evidence inspection count",
            row.run_id,
          ),
          policyConsultationCount: activityCount(
            row.policy_consultation_count,
            "policy consultation count",
            row.run_id,
          ),
          citedEvidenceCount: activityCount(
            row.cited_evidence_count,
            "cited evidence count",
            row.run_id,
          ),
          decisionAttemptCount: activityCount(
            row.decision_attempt_count,
            "decision attempt count",
            row.run_id,
          ),
          rejectedAttemptCount: activityCount(
            row.rejected_attempt_count,
            "rejected attempt count",
            row.run_id,
          ),
          mitigationCount: activityCount(
            row.mitigation_count,
            "mitigation count",
            row.run_id,
          ),
          rejectionFindings: [
            ...(rejectionFindingsByRun.get(row.run_id) ??
              new Map<string, number>()),
          ]
            .map(([findingCode, count]) => ({
              findingCode,
              count,
            }))
            .sort(
              (left, right) =>
                right.count - left.count ||
                compareFindingCode(
                  left.findingCode,
                  right.findingCode,
                ),
            ),
        },
        ratings: await this.currentRatings(row.run_id),
        moderationResolutions:
          await this.currentModerationResolutions(row.run_id),
      });
    }
    return {
      schemaVersion: "2.0.0",
      assignment,
      learners: assignment.learnerUserIds.map((learnerUserId) => ({
        learnerUserId,
        runs: runs.filter(
          (run) => run.learnerUserId === learnerUserId,
        ),
      })),
    };
  }

  private async ratingRows(runId: string): Promise<readonly RatingRow[]> {
    const result = await this.database
      .prepare(FIND_RATINGS_FOR_RUN)
      .bind(runId)
      .all<RatingRow>();
    if (!result.success) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "Run ratings could not be loaded.",
      );
    }
    return result.results;
  }

  private async moderationRows(
    runId: string,
  ): Promise<readonly ModerationRow[]> {
    const result = await this.database
      .prepare(FIND_MODERATION_FOR_RUN)
      .bind(runId)
      .all<ModerationRow>();
    if (!result.success) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "Run moderation resolutions could not be loaded.",
      );
    }
    return result.results;
  }

  private async assignmentFromRow(
    row: AssignmentRow,
  ): Promise<HostedAssignmentV1> {
    const learners = await this.database
      .prepare(FIND_LEARNERS)
      .bind(row.assignment_id)
      .all<LearnerRow>();
    if (!learners.success) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_STORAGE_FAILED",
        "Assignment learners could not be loaded.",
      );
    }
    return assignmentFrom(
      row,
      learners.results.map((learner) => learner.learner_user_id),
    );
  }
}
