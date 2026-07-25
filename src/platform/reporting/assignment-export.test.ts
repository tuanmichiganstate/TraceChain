import { describe, expect, it } from "vitest";
import type {
  HostedAssignmentReportV1,
  ManualRubricRatingV1,
} from "../contracts/assessment";
import type { RunEventV1 } from "../contracts/run-events";
import {
  createAssignmentEvidenceExport,
  serializeAssignmentEvidenceCsv,
  serializeAssignmentEvidenceJson,
} from "./assignment-export";

const assignmentReport: HostedAssignmentReportV1 = {
  schemaVersion: "1.2.0",
  assignment: {
    schemaVersion: "1.0.0",
    assignmentId: "ASSIGNMENT_EXPORT_001",
    title: "Coffee export cohort",
    packId: "PACK_STANDARD_COFFEE_STAGE3",
    packVersion: "1.4.0",
    scenarioId: "SCN_COFFEE_001",
    scenarioVersion: "2.2.0",
    mode: "standard",
    runConfiguration: {
      mode: "standard",
      allowHints: false,
      allowRetry: false,
      allowBacktracking: false,
      feedbackTiming: "final",
      showScores: false,
      outcomeStrategy: "forced",
      seedPolicy: "supplied",
      timeLimitMinutes: 30,
      allowCommunication: false,
      allowEvidenceRequests: true,
      outcomeModelId: "CERTIFICATE_CASE",
    },
    learnerUserIds: ["USER_LEARNER_001"],
    status: "active",
    feedbackReleaseStatus: "released",
    feedbackReleasedAt: "2026-07-24T08:30:00.000Z",
    feedbackReleasedByUserId: "USER_INSTRUCTOR_001",
    createdAt: "2026-07-24T08:00:00.000Z",
    createdByUserId: "USER_INSTRUCTOR_001",
  },
  learners: [
    {
      learnerUserId: "USER_LEARNER_001",
      runs: [
        {
          runId: "RUN_EXPORT_001",
          learnerUserId: "USER_LEARNER_001",
          status: "completed",
          eventCount: 1,
          startedAt: "2026-07-24T03:00:00.000Z",
          lastActivityAt: "2026-07-24T03:00:00.000Z",
          completedAt: "2026-07-24T03:00:00.000Z",
          elapsedSeconds: 0,
          activity: {
            evidenceInspectionCount: 2,
            policyConsultationCount: 1,
            citedEvidenceCount: 1,
            decisionAttemptCount: 3,
            rejectedAttemptCount: 1,
            mitigationCount: 1,
          },
          moderationResolutions: [],
          ratings: [],
        },
      ],
    },
  ],
};

const runEvent: RunEventV1 = {
  schemaVersion: "1.0.0",
  sequenceNumber: 1,
  eventId: "EVENT_EXPORT_001",
  runId: "RUN_EXPORT_001",
  idempotencyKey: "COMMAND_EXPORT_001:RUN_CREATED",
  serverTimestampUtc: "2026-07-24T08:01:00.000Z",
  authenticatedUserId: "USER_INSTRUCTOR_001",
  simulationActorId: "ACT_CERTIFIER",
  organizationId: "ORG_CERTIFICATION_BODY",
  roleId: "CERTIFICATION_OFFICER",
  eventType: "RUN_CREATED",
  packId: "PACK_STANDARD_COFFEE_STAGE3",
  packVersion: "1.4.0",
  scenarioId: "SCN_COFFEE_001",
  scenarioVersion: "2.2.0",
  payload: {
    assignmentId: "ASSIGNMENT_EXPORT_001",
    learnerUserId: "USER_LEARNER_001",
  },
  causationId: "COMMAND_EXPORT_001",
  correlationId: "RUN_EXPORT_001",
  previousStateHash:
    "0000000000000000000000000000000000000000000000000000000000000000",
  resultingStateHash:
    "1111111111111111111111111111111111111111111111111111111111111111",
};

const ratingRevision: ManualRubricRatingV1 = {
  schemaVersion: "1.0.0",
  ratingId: "RATING_EXPORT_001",
  assignmentId: "ASSIGNMENT_EXPORT_001",
  runId: "RUN_EXPORT_001",
  rubricId: "RUBRIC_CERTIFICATE_DECISION",
  rubricVersion: "1.0.0",
  criterionId: "CRITERION_EVIDENCE_USE",
  levelValue: 3,
  comment: '=HYPERLINK("https://invalid.example","quoted,\ntext")',
  linkedEvidenceIds: ["EVENT_EXPORT_001"],
  revision: 1,
  raterUserId: "USER_INSTRUCTOR_001",
  ratedAt: "2026-07-24T08:20:00.000Z",
};

describe("assignment evidence export", () => {
  it("retains exact interpretation versions and observable evidence", () => {
    const exported = createAssignmentEvidenceExport({
      report: assignmentReport,
      events: [runEvent],
      ratingRevisions: [ratingRevision],
      moderationResolutions: [],
      generatedAt: "2026-07-24T09:00:00.000Z",
    });

    expect(exported).toMatchObject({
      schemaVersion: "1.2.0",
      exportType: "TRACECHAIN_ASSIGNMENT_EVIDENCE",
      generatedAt: "2026-07-24T09:00:00.000Z",
      assignment: {
        assignmentId: "ASSIGNMENT_EXPORT_001",
        packId: "PACK_STANDARD_COFFEE_STAGE3",
        packVersion: "1.4.0",
        scenarioId: "SCN_COFFEE_001",
        scenarioVersion: "2.2.0",
      },
      participants: [
        {
          assignmentId: "ASSIGNMENT_EXPORT_001",
          learnerUserId: "USER_LEARNER_001",
        },
      ],
      runs: [
        {
          runId: "RUN_EXPORT_001",
          learnerUserId: "USER_LEARNER_001",
          status: "completed",
          eventCount: 1,
          startedAt: "2026-07-24T03:00:00.000Z",
          lastActivityAt: "2026-07-24T03:00:00.000Z",
          completedAt: "2026-07-24T03:00:00.000Z",
          elapsedSeconds: 0,
          activity: assignmentReport.learners[0]?.runs[0]?.activity,
        },
      ],
      events: [runEvent],
      ratingRevisions: [ratingRevision],
    });
    expect(exported.dataDictionary.datasets.map((dataset) => dataset.id)).toEqual(
      [
        "assignment",
        "participants",
        "runs",
        "events",
        "ratingRevisions",
        "moderationResolutions",
      ],
    );
    expect(
      exported.dataDictionary.datasets
        .find((dataset) => dataset.id === "runs")
        ?.fields.map((field) => field.name),
    ).toEqual(
      expect.arrayContaining([
        "startedAt",
        "lastActivityAt",
        "completedAt",
        "elapsedSeconds",
        "activity",
      ]),
    );
    expect(exported.dataDictionary.schemaVersion).toBe("1.2.0");
    const serialized = JSON.parse(
      serializeAssignmentEvidenceJson(exported),
    ) as typeof exported;
    expect(serialized.ratingRevisions[0]?.comment).toBe(
      ratingRevision.comment,
    );
  });

  it("writes a stable flat CSV and neutralizes spreadsheet formulas", () => {
    const exported = createAssignmentEvidenceExport({
      report: assignmentReport,
      events: [runEvent],
      ratingRevisions: [ratingRevision],
      moderationResolutions: [],
      generatedAt: "2026-07-24T09:00:00.000Z",
    });
    const csv = serializeAssignmentEvidenceCsv(exported);

    expect(csv).toMatch(
      /^export_schema_version,record_type,assignment_id,/u,
    );
    expect(csv).toContain(
      "event,ASSIGNMENT_EXPORT_001,USER_LEARNER_001,RUN_EXPORT_001,1,EVENT_EXPORT_001,RUN_CREATED",
    );
    expect(csv).toContain('"elapsedSeconds"":0');
    expect(csv).toContain('"rejectedAttemptCount"":1');
    expect(csv).toContain("rating_revision,ASSIGNMENT_EXPORT_001");
    expect(csv).toContain(
      "\"'=HYPERLINK(\"\"https://invalid.example\"\",\"\"quoted,\ntext\"\")\"",
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
