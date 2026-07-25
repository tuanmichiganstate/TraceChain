import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import type {
  HostedAssignmentReportV1,
  ManualRubricRatingV1,
  RubricModerationResolutionV1,
} from "../contracts/assessment";
import type {
  AssignmentEvidenceExportV1,
  AssignmentExportDataDictionaryV1,
  AssignmentExportRunV1,
} from "../contracts/assignment-export";
import type { RunEventV1 } from "../contracts/run-events";

export class AssignmentExportError extends Error {
  constructor(
    readonly code: "ASSIGNMENT_EXPORT_SOURCE_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "AssignmentExportError";
  }
}

const DATA_DICTIONARY: AssignmentExportDataDictionaryV1 = {
  schemaVersion: "1.2.0",
  csvLayout: "TRACECHAIN_ASSIGNMENT_EVIDENCE_FLAT_V1",
  datasets: [
    {
      id: "assignment",
      description:
        "Exact assignment, scenario-pack, scenario, mode, and feedback-release metadata.",
      fields: [
        {
          name: "assignmentId",
          type: "string",
          required: true,
          description: "Stable assignment identifier.",
        },
        {
          name: "packId",
          type: "string",
          required: true,
          description: "Immutable scenario-pack identifier.",
        },
        {
          name: "packVersion",
          type: "string",
          required: true,
          description: "Exact published scenario-pack version.",
        },
        {
          name: "scenarioId",
          type: "string",
          required: true,
          description: "Scenario identifier interpreted by this assignment.",
        },
        {
          name: "scenarioVersion",
          type: "string",
          required: true,
          description: "Exact scenario version interpreted by this assignment.",
        },
      ],
    },
    {
      id: "participants",
      description: "Provisioned learner roster bound to the assignment.",
      fields: [
        {
          name: "assignmentId",
          type: "string",
          required: true,
          description: "Assignment containing the roster entry.",
        },
        {
          name: "learnerUserId",
          type: "string",
          required: true,
          description: "Server-provisioned learner user identifier.",
        },
      ],
    },
    {
      id: "runs",
      description:
        "Hosted learner runs with completion status and observable event count.",
      fields: [
        {
          name: "runId",
          type: "string",
          required: true,
          description: "Stable hosted-run identifier.",
        },
        {
          name: "learnerUserId",
          type: "string",
          required: true,
          description: "Assigned learner who owns the run.",
        },
        {
          name: "status",
          type: "string",
          required: true,
          description: "Current active or completed run status.",
        },
        {
          name: "eventCount",
          type: "integer",
          required: true,
          description: "Number of append-only authoritative run events.",
        },
        {
          name: "startedAt",
          type: "string",
          required: true,
          description: "Timestamp of the first authoritative run event.",
        },
        {
          name: "lastActivityAt",
          type: "string",
          required: true,
          description: "Timestamp of the latest authoritative run event.",
        },
        {
          name: "completedAt",
          type: "string",
          required: false,
          description:
            "Timestamp of RUN_COMPLETED, absent while the run is active.",
        },
        {
          name: "elapsedSeconds",
          type: "integer",
          required: true,
          description:
            "Whole seconds from the first event to completion or latest recorded activity.",
        },
        {
          name: "activity",
          type: "object",
          required: true,
          description:
            "Event-derived counts of evidence inspection, policy consultation, evidence citation, decision attempts, rejected attempts, and mitigation.",
        },
      ],
    },
    {
      id: "events",
      description:
        "Complete append-only hosted event envelopes in run and sequence order.",
      fields: [
        {
          name: "runId",
          type: "string",
          required: true,
          description: "Run containing the event.",
        },
        {
          name: "sequenceNumber",
          type: "integer",
          required: true,
          description: "Authoritative event order within the run.",
        },
        {
          name: "eventType",
          type: "string",
          required: true,
          description: "Versioned TraceChain platform event type.",
        },
        {
          name: "payload",
          type: "object",
          required: true,
          description: "Event-specific observable evidence and outcome data.",
        },
      ],
    },
    {
      id: "ratingRevisions",
      description:
        "Append-only manual rubric rating revisions with evidence links.",
      fields: [
        {
          name: "ratingId",
          type: "string",
          required: true,
          description: "Stable rating-revision identifier.",
        },
        {
          name: "rubricVersion",
          type: "string",
          required: true,
          description: "Exact rubric version used for interpretation.",
        },
        {
          name: "revision",
          type: "integer",
          required: true,
          description: "Monotonic revision for one run and criterion.",
        },
        {
          name: "linkedEvidenceIds",
          type: "array",
          required: true,
          description: "Observable event or competency-evidence references.",
        },
      ],
    },
    {
      id: "moderationResolutions",
      description:
        "Append-only instructor moderation resolutions linked to their source rating revisions.",
      fields: [
        {
          name: "resolutionId",
          type: "string",
          required: true,
          description: "Stable moderation-resolution identifier.",
        },
        {
          name: "revision",
          type: "integer",
          required: true,
          description: "Monotonic resolution revision for one criterion.",
        },
        {
          name: "sourceRatingIds",
          type: "array",
          required: true,
          description: "Rating revisions considered by the moderator.",
        },
      ],
    },
  ],
};

export interface CreateAssignmentEvidenceExportInput {
  readonly report: HostedAssignmentReportV1;
  readonly events: readonly RunEventV1[];
  readonly ratingRevisions: readonly ManualRubricRatingV1[];
  readonly moderationResolutions:
    readonly RubricModerationResolutionV1[];
  readonly generatedAt: string;
}

function sourceMismatch(message: string): never {
  throw new AssignmentExportError(
    "ASSIGNMENT_EXPORT_SOURCE_MISMATCH",
    message,
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function createAssignmentEvidenceExport(
  input: CreateAssignmentEvidenceExportInput,
): AssignmentEvidenceExportV1 {
  const { assignment } = input.report;
  const runs: AssignmentExportRunV1[] = input.report.learners.flatMap(
    (learner) =>
      learner.runs.map((run) => {
        if (run.learnerUserId !== learner.learnerUserId) {
          return sourceMismatch(
            `Run ${run.runId} is attributed to a different learner.`,
          );
        }
        return {
          assignmentId: assignment.assignmentId,
          runId: run.runId,
          learnerUserId: learner.learnerUserId,
          status: run.status,
          eventCount: run.eventCount,
          startedAt: run.startedAt,
          lastActivityAt: run.lastActivityAt,
          completedAt: run.completedAt,
          elapsedSeconds: run.elapsedSeconds,
          activity: run.activity,
        };
      }),
  );
  const runById = new Map(runs.map((run) => [run.runId, run]));
  if (runById.size !== runs.length) {
    sourceMismatch("Assignment report contains a duplicate run identifier.");
  }

  const sortedEvents = [...input.events].sort(
    (left, right) =>
      compareText(left.runId, right.runId) ||
      left.sequenceNumber - right.sequenceNumber,
  );
  const countedEvents = new Map<string, number>();
  for (const event of sortedEvents) {
    const run = runById.get(event.runId);
    if (run === undefined) {
      sourceMismatch(`Event ${event.eventId} belongs to an unknown run.`);
    }
    if (
      event.packId !== assignment.packId ||
      event.packVersion !== assignment.packVersion ||
      event.scenarioId !== assignment.scenarioId ||
      event.scenarioVersion !== assignment.scenarioVersion
    ) {
      sourceMismatch(
        `Event ${event.eventId} does not match the assignment's exact content version.`,
      );
    }
    countedEvents.set(
      event.runId,
      (countedEvents.get(event.runId) ?? 0) + 1,
    );
  }
  for (const run of runs) {
    if ((countedEvents.get(run.runId) ?? 0) !== run.eventCount) {
      sourceMismatch(
        `Run ${run.runId} event count does not match its assignment report.`,
      );
    }
  }

  const sortedRatings = [...input.ratingRevisions].sort(
    (left, right) =>
      compareText(left.runId, right.runId) ||
      compareText(left.rubricId, right.rubricId) ||
      compareText(left.criterionId, right.criterionId) ||
      left.revision - right.revision,
  );
  for (const rating of sortedRatings) {
    if (
      rating.assignmentId !== assignment.assignmentId ||
      !runById.has(rating.runId)
    ) {
      sourceMismatch(
        `Rating ${rating.ratingId} does not belong to this assignment export.`,
      );
    }
  }
  const ratingIds = new Set(
    sortedRatings.map((rating) => rating.ratingId),
  );
  const sortedModeration = [...input.moderationResolutions].sort(
    (left, right) =>
      compareText(left.runId, right.runId) ||
      compareText(left.rubricId, right.rubricId) ||
      compareText(left.criterionId, right.criterionId) ||
      left.revision - right.revision,
  );
  for (const resolution of sortedModeration) {
    if (
      resolution.assignmentId !== assignment.assignmentId ||
      !runById.has(resolution.runId) ||
      resolution.sourceRatingIds.some(
        (ratingId) => !ratingIds.has(ratingId),
      )
    ) {
      sourceMismatch(
        `Moderation ${resolution.resolutionId} does not belong to this assignment export.`,
      );
    }
  }

  return {
    schemaVersion: "1.2.0",
    exportType: "TRACECHAIN_ASSIGNMENT_EVIDENCE",
    generatedAt: input.generatedAt,
    assignment,
    participants: assignment.learnerUserIds.map((learnerUserId) => ({
      assignmentId: assignment.assignmentId,
      learnerUserId,
    })),
    runs,
    events: sortedEvents,
    ratingRevisions: sortedRatings,
    moderationResolutions: sortedModeration,
    dataDictionary: DATA_DICTIONARY,
  };
}

export function serializeAssignmentEvidenceJson(
  exported: AssignmentEvidenceExportV1,
): string {
  return `${JSON.stringify(exported, null, 2)}\n`;
}

const CSV_COLUMNS = [
  "export_schema_version",
  "record_type",
  "assignment_id",
  "learner_user_id",
  "run_id",
  "sequence_number",
  "event_id",
  "event_type",
  "recorded_at",
  "authenticated_user_id",
  "simulation_actor_id",
  "organization_id",
  "role_id",
  "causation_id",
  "pack_id",
  "pack_version",
  "scenario_id",
  "scenario_version",
  "mode",
  "status",
  "event_count",
  "rating_id",
  "resolution_id",
  "rubric_id",
  "rubric_version",
  "criterion_id",
  "rating_revision",
  "rating_level",
  "rater_user_id",
  "linked_evidence_ids_json",
  "source_rating_ids_json",
  "comment",
  "payload_json",
] as const;

type CsvColumn = (typeof CSV_COLUMNS)[number];
type CsvValue = string | number | undefined;
type CsvRow = Readonly<Partial<Record<CsvColumn, CsvValue>>>;

function csvCell(value: CsvValue): string {
  if (value === undefined) return "";
  let text = String(value);
  if (
    typeof value === "string" &&
    /^[=+\-@\t\r]/u.test(text)
  ) {
    text = `'${text}`;
  }
  if (/[",\r\n]/u.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function csvRows(exported: AssignmentEvidenceExportV1): readonly CsvRow[] {
  const assignment = exported.assignment;
  const runById = new Map(exported.runs.map((run) => [run.runId, run]));
  return [
    {
      export_schema_version: exported.schemaVersion,
      record_type: "assignment",
      assignment_id: assignment.assignmentId,
      pack_id: assignment.packId,
      pack_version: assignment.packVersion,
      scenario_id: assignment.scenarioId,
      scenario_version: assignment.scenarioVersion,
      mode: assignment.mode,
      status: assignment.status,
      recorded_at: assignment.createdAt,
      authenticated_user_id: assignment.createdByUserId,
      payload_json: canonicalize(assignment),
    },
    ...exported.participants.map(
      (participant): CsvRow => ({
        export_schema_version: exported.schemaVersion,
        record_type: "participant",
        assignment_id: participant.assignmentId,
        learner_user_id: participant.learnerUserId,
      }),
    ),
    ...exported.runs.map(
      (run): CsvRow => ({
        export_schema_version: exported.schemaVersion,
        record_type: "run",
        assignment_id: run.assignmentId,
        learner_user_id: run.learnerUserId,
        run_id: run.runId,
        status: run.status,
        event_count: run.eventCount,
        recorded_at: run.startedAt,
        payload_json: canonicalize({
          startedAt: run.startedAt,
          lastActivityAt: run.lastActivityAt,
          completedAt: run.completedAt,
          elapsedSeconds: run.elapsedSeconds,
          activity: run.activity,
        }),
      }),
    ),
    ...exported.events.map((event): CsvRow => {
      const run = runById.get(event.runId);
      return {
        export_schema_version: exported.schemaVersion,
        record_type: "event",
        assignment_id: assignment.assignmentId,
        learner_user_id: run?.learnerUserId,
        run_id: event.runId,
        sequence_number: event.sequenceNumber,
        event_id: event.eventId,
        event_type: event.eventType,
        recorded_at: event.serverTimestampUtc,
        authenticated_user_id: event.authenticatedUserId,
        simulation_actor_id: event.simulationActorId,
        organization_id: event.organizationId,
        role_id: event.roleId,
        causation_id: event.causationId,
        pack_id: event.packId,
        pack_version: event.packVersion,
        scenario_id: event.scenarioId,
        scenario_version: event.scenarioVersion,
        payload_json: canonicalize(event.payload),
      };
    }),
    ...exported.ratingRevisions.map((rating): CsvRow => {
      const run = runById.get(rating.runId);
      return {
        export_schema_version: exported.schemaVersion,
        record_type: "rating_revision",
        assignment_id: rating.assignmentId,
        learner_user_id: run?.learnerUserId,
        run_id: rating.runId,
        recorded_at: rating.ratedAt,
        authenticated_user_id: rating.raterUserId,
        rating_id: rating.ratingId,
        rubric_id: rating.rubricId,
        rubric_version: rating.rubricVersion,
        criterion_id: rating.criterionId,
        rating_revision: rating.revision,
        rating_level: rating.levelValue,
        rater_user_id: rating.raterUserId,
        linked_evidence_ids_json: canonicalize(
          rating.linkedEvidenceIds,
        ),
        comment: rating.comment,
      };
    }),
    ...exported.moderationResolutions.map(
      (resolution): CsvRow => {
        const run = runById.get(resolution.runId);
        return {
          export_schema_version: exported.schemaVersion,
          record_type: "moderation_resolution",
          assignment_id: resolution.assignmentId,
          learner_user_id: run?.learnerUserId,
          run_id: resolution.runId,
          recorded_at: resolution.resolvedAt,
          authenticated_user_id: resolution.moderatorUserId,
          resolution_id: resolution.resolutionId,
          rubric_id: resolution.rubricId,
          rubric_version: resolution.rubricVersion,
          criterion_id: resolution.criterionId,
          rating_revision: resolution.revision,
          rating_level: resolution.levelValue,
          comment: resolution.comment,
          source_rating_ids_json: canonicalize(
            resolution.sourceRatingIds,
          ),
        };
      },
    ),
  ];
}

export function serializeAssignmentEvidenceCsv(
  exported: AssignmentEvidenceExportV1,
): string {
  const lines = [
    CSV_COLUMNS.join(","),
    ...csvRows(exported).map((row) =>
      CSV_COLUMNS.map((column) => csvCell(row[column])).join(","),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function assignmentEvidenceFilename(
  assignmentId: string,
  extension: "json" | "csv",
): string {
  const safeAssignmentId = assignmentId.replaceAll(
    /[^A-Za-z0-9._-]/gu,
    "_",
  );
  return `TraceChain_${safeAssignmentId}_evidence_v1.${extension}`;
}
