import type { Clock } from "../../domain/simulation/environment";
import type {
  AssignmentRunMode,
  CreateHostedAssignmentRequest,
  HostedAssignmentReportV1,
  HostedAssignmentRunSummary,
  HostedAssignmentCreationResult,
  HostedAssignmentV1,
  ManualRubricRatingResult,
  ManualRubricRatingV1,
  SaveManualRubricRatingRequest,
} from "../contracts/assessment";
import type { ApplicationPrincipal } from "../hosted/access";
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
  readonly lifecycle_status: string;
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
  readonly completed: number;
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
  lifecycle_status,
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
  lifecycle_status,
  feedback_release_status,
  created_at_utc,
  created_by_user_id
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 'withheld', ?, ?)`;

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

const RELEASE_FEEDBACK = `UPDATE assignments
SET feedback_release_status = 'released',
    feedback_release_command_id = ?,
    feedback_released_at_utc = ?,
    feedback_released_by_user_id = ?
WHERE assignment_id = ?
  AND feedback_release_status = 'withheld'`;

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
  ) AS completed
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
      | "RUN_NOT_ASSIGNED"
      | "INVALID_RATING"
      | "RATING_REVISION_CONFLICT"
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

function normalizeRequest(
  request: CreateHostedAssignmentRequest,
): CreateHostedAssignmentRequest {
  if (
    !Array.isArray(request.learnerUserIds) ||
    request.learnerUserIds.length === 0 ||
    request.learnerUserIds.length > 200
  ) {
    throw new AssignmentRepositoryError(
      "INVALID_ASSIGNMENT",
      "learnerUserIds must contain 1 to 200 provisioned learners.",
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
    mode: assignmentMode(request.mode),
    learnerUserIds,
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
    existing.createdByUserId === principal.userId &&
    JSON.stringify(existing.learnerUserIds) ===
      JSON.stringify(request.learnerUserIds)
  );
}

function assignmentFrom(
  row: AssignmentRow,
  learnerUserIds: readonly string[],
): HostedAssignmentV1 {
  if (
    !ASSIGNMENT_MODES.includes(row.run_mode as AssignmentRunMode) ||
    (row.lifecycle_status !== "active" &&
      row.lifecycle_status !== "closed") ||
    (row.feedback_release_status !== "withheld" &&
      row.feedback_release_status !== "released")
  ) {
    throw new AssignmentRepositoryError(
      "ASSIGNMENT_STORAGE_FAILED",
      "Stored assignment data violates the current contract.",
    );
  }
  return {
    schemaVersion: "1.0.0",
    assignmentId: row.assignment_id,
    title: row.title,
    packId: row.pack_id,
    packVersion: row.pack_version,
    scenarioId: row.scenario_id,
    scenarioVersion: row.scenario_version,
    mode: row.run_mode as AssignmentRunMode,
    learnerUserIds,
    status: row.lifecycle_status,
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
    const runs: HostedAssignmentRunSummary[] = [];
    for (const row of result.results) {
      runs.push({
        runId: row.run_id,
        learnerUserId: row.learner_user_id,
        status: row.completed === 1 ? "completed" : "active",
        eventCount: row.event_count,
        ratings: await this.currentRatings(row.run_id),
      });
    }
    return {
      schemaVersion: "1.0.0",
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
