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
import { hostedExperienceFixture } from "../runs/experience-configuration.test-fixture";

const runtimeConfiguration = {
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
} as const;
const experience = hostedExperienceFixture({
  packId: "PACK_STANDARD_COFFEE_STAGE3",
  packVersion: "1.4.0",
  scenarioId: "SCN_COFFEE_001",
  scenarioVersion: "2.2.0",
  runtimeConfiguration,
});
const assignmentReport: HostedAssignmentReportV1 = {
  schemaVersion: "2.0.0",
  assignment: {
    schemaVersion: "2.0.0",
    assignmentId: "ASSIGNMENT_EXPORT_001",
    title: "Coffee export cohort",
    packId: "PACK_STANDARD_COFFEE_STAGE3",
    packVersion: "1.4.0",
    scenarioId: "SCN_COFFEE_001",
    scenarioVersion: "2.2.0",
    mode: "standard",
    runConfiguration: runtimeConfiguration,
    experienceConfiguration: experience.configuration,
    experienceConfigurationHash:
      experience.configurationHash,
    counterfactualReplay: {
      enabled: false,
      allowedDecisionNodeIds: [],
      maximumBranchesPerLearner: 1,
      learnerAvailability: "DISABLED",
      requireReflection: false,
    },
    research: { enabled: false },
    learnerUserIds: ["USER_LEARNER_001"],
    raterUserIds: [],
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
            rejectionFindings: [
              {
                findingCode: "RULE_ORGANIZATION_NOT_AUTHORIZED",
                count: 1,
              },
            ],
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

const evidenceCatalog = {
  schemaVersion: "1.0.0",
  assignmentId: "ASSIGNMENT_EXPORT_001",
  packId: "PACK_STANDARD_COFFEE_STAGE3",
  packVersion: "1.4.0",
  scenarioId: "SCN_COFFEE_001",
  scenarioVersion: "2.2.0",
  evidenceDefinitions: [
    {
      evidenceId: "EVID_CERTIFICATE_RECORD",
      evidenceType: "DOCUMENT_REFERENCE",
      title: {
        localizationKey: "evidence.certificate.title",
        valuesByLocale: {
          en: "Certificate record",
          vi: "Hồ sơ chứng nhận",
        },
      },
      sourceOrganizationId: "ORG_CERTIFICATION_BODY",
      visibleToRoleIds: ["LOGISTICS_COORDINATOR"],
      learnerMetadata: {
        signatureStatus: "VALID",
        ledgerStatus: "HASH_ANCHORED",
        completeness: "COMPLETE",
        access: {
          classification: "ROLE_RESTRICTED",
          acquisitionMode: "AVAILABLE",
          delayMinutes: 0,
          costUnits: 0,
        },
      },
      assessmentMetadata: {
        reliability: "RELIABLE",
        contentStatus: "ACCURATE",
        limitationCodes: [
          "HASH_DOES_NOT_PROVE_SOURCE_TRUTH",
        ],
        hiddenConditionReferences: [],
      },
    },
  ],
} as const;

describe("assignment evidence export", () => {
  it("retains exact interpretation versions and observable evidence", () => {
    const exported = createAssignmentEvidenceExport({
      report: assignmentReport,
      evidenceCatalog,
      events: [runEvent],
      ratingRevisions: [ratingRevision],
      moderationResolutions: [],
      generatedAt: "2026-07-24T09:00:00.000Z",
    });

    expect(exported).toMatchObject({
      schemaVersion: "3.0.0",
      exportType: "SIMULEDGER_ASSIGNMENT_EVIDENCE",
      identityMode: "identified",
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
      evidenceDefinitions: evidenceCatalog.evidenceDefinitions,
      ratingRevisions: [ratingRevision],
    });
    expect(exported.dataDictionary.datasets.map((dataset) => dataset.id)).toEqual(
      [
        "assignment",
        "evidenceDefinitions",
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
    expect(exported.dataDictionary.schemaVersion).toBe("3.0.0");
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
      evidenceCatalog,
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
      "event,ASSIGNMENT_EXPORT_001,USER_LEARNER_001,,RUN_EXPORT_001,1,EVENT_EXPORT_001,RUN_CREATED",
    );
    expect(csv).toContain(
      "evidence_definition,ASSIGNMENT_EXPORT_001",
    );
    expect(csv).toContain("EVID_CERTIFICATE_RECORD");
    expect(csv).toContain(
      '"contentStatus"":""ACCURATE""',
    );
    expect(csv).toContain('"elapsedSeconds"":0');
    expect(csv).toContain('"rejectedAttemptCount"":1');
    expect(csv).toContain(
      '"findingCode"":""RULE_ORGANIZATION_NOT_AUTHORIZED""',
    );
    expect(csv).toContain("rating_revision,ASSIGNMENT_EXPORT_001");
    expect(csv).toContain(
      "\"'=HYPERLINK(\"\"https://invalid.example\"\",\"\"quoted,\ntext\"\")\"",
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("can replace learner identities with deterministic assignment-scoped pseudonyms", () => {
    const input = {
      report: assignmentReport,
      evidenceCatalog,
      events: [runEvent],
      ratingRevisions: [ratingRevision],
      moderationResolutions: [],
      generatedAt: "2026-07-24T09:00:00.000Z",
      identityMode: "pseudonymous" as const,
    };
    const first = createAssignmentEvidenceExport(input);
    const repeated = createAssignmentEvidenceExport(input);
    const pseudonym = first.assignment.learnerUserIds[0];

    expect(first).toMatchObject({
      identityMode: "pseudonymous",
      assignment: {
        learnerUserIds: [expect.stringMatching(/^LEARNER_[A-F0-9]{24}$/u)],
      },
      participants: [
        {
          learnerUserId: pseudonym,
        },
      ],
      runs: [
        {
          learnerUserId: pseudonym,
        },
      ],
    });
    expect(repeated.assignment.learnerUserIds[0]).toBe(pseudonym);

    const json = serializeAssignmentEvidenceJson(first);
    const csv = serializeAssignmentEvidenceCsv(first);
    expect(json).not.toContain("USER_LEARNER_001");
    expect(csv).not.toContain("USER_LEARNER_001");
    expect(csv).toContain(
      '""exportIdentityMode"":""pseudonymous""',
    );
    expect(json).toContain("USER_INSTRUCTOR_001");
    expect(csv).toContain("USER_INSTRUCTOR_001");
  });

  it("adds bounded research metadata and stable participant IDs to the de-identified export", () => {
    const researchReport: HostedAssignmentReportV1 = {
      ...assignmentReport,
      assignment: {
        ...assignmentReport.assignment,
        research: {
          enabled: true,
          experimentalConditionId: "CONDITION_A",
          randomAssignmentRecordId: "RANDOMIZATION_001",
          fixedScenarioSeed: "SEED_RESEARCH_001",
          consentStatusReference: "CONSENT_RECORD_001",
          preTestLinkageId: "PRETEST_001",
          postTestLinkageId: "POSTTEST_001",
          blindedRaters: true,
          interventionVersion: "1.0.0",
          retentionPolicyReference: "RETENTION_POLICY_001",
        },
      },
    };
    const exported = createAssignmentEvidenceExport({
      report: researchReport,
      evidenceCatalog: {
        ...evidenceCatalog,
        assignmentId:
          researchReport.assignment.assignmentId,
      },
      events: [runEvent],
      ratingRevisions: [ratingRevision],
      moderationResolutions: [],
      generatedAt: "2026-07-24T09:00:00.000Z",
      identityMode: "pseudonymous",
    });

    expect(exported.researchMetadata).toEqual({
      experimentalConditionId: "CONDITION_A",
      randomAssignmentRecordId: "RANDOMIZATION_001",
      fixedScenarioSeed: "SEED_RESEARCH_001",
      consentStatusReference: "CONSENT_RECORD_001",
      preTestLinkageId: "PRETEST_001",
      postTestLinkageId: "POSTTEST_001",
      blindedRaters: true,
      interventionVersion: "1.0.0",
      retentionPolicyReference: "RETENTION_POLICY_001",
      deidentified: true,
    });
    expect(exported.participants[0]?.researchParticipantId).toMatch(
      /^LEARNER_[A-F0-9]{24}$/u,
    );
    expect(exported.participants[0]?.researchParticipantId).toBe(
      exported.participants[0]?.learnerUserId,
    );
  });
});
