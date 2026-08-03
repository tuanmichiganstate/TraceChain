import { describe, expect, it } from "vitest";
import challengeAuditPackJson from "../../../scenario-packs/challenge-coffee-audit/simuledger.pack.json";
import { LECTURER_PRESETS } from "../../config/presets";
import type { AuditLearnerProjectionV1 } from "../contracts/audit";
import type { HostedAssignmentReportV1 } from "../contracts/assessment";
import type { ScenarioPackV2 } from "../contracts/scenario-pack";
import type { InstructorTimelineItem } from "../hosted/stage3-types";
import { createAuditAssignmentReport } from "./audit-assignment-report";

const pack = challengeAuditPackJson as unknown as ScenarioPackV2;
const bank = pack.auditVariantBanks[0]!;

function projection(): AuditLearnerProjectionV1 {
  return {
    schemaVersion: "1.0.0",
    auditCaseId: "AUDIT_COFFEE_CHALLENGE_A",
    auditCaseVersion: "1.0.0",
    sourceProcessId: "PROCESS_COFFEE_CHALLENGE_A",
    sourceProcessVersion: "1.0.0",
    sourceStateHash: "a".repeat(64),
    supportProfile: "CHALLENGE",
    scopeViewed: true,
    objective: {
      localizationKey: "audit.objective",
      valuesByLocale: { en: "Review the process." },
    },
    scope: {
      title: {
        localizationKey: "audit.scope",
        valuesByLocale: { en: "Audit scope" },
      },
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-01-02T00:00:00.000Z",
      organizationIds: ["ORG_AUDIT"],
      entityIds: ["ENTITY_CERTIFICATE"],
    },
    categories: [],
    entities: [],
    rootCauses: [],
    recommendations: [],
    hints: [
      {
        hintId: "HINT_AUDIT_001",
        text: {
          localizationKey: "audit.hint",
          valuesByLocale: { en: "Review the evidence." },
        },
        viewed: true,
      },
    ],
    conclusionCategories: [],
    sourceRecords: [],
    evidence: [],
    policies: [],
    drafts: [],
    findings: [
      {
        findingId: "FINDING_001",
        revision: 1,
        status: "SUBMITTED",
        categoryId: "CATEGORY_CERTIFICATE",
        entityId: "ENTITY_CERTIFICATE",
        title: "Expired certificate accepted",
        observation: "The certificate expired before review.",
        severity: "HIGH",
        materiality: "MATERIAL",
        confidence: 90,
        evidenceIds: ["EVID_CERTIFICATE"],
        policyIds: ["POLICY_CERTIFICATE"],
        rootCauseCode: "ROOT_VALIDITY_REVIEW",
        recommendationCode: "RECOMMEND_HOLD",
        recommendation: "Hold pending verification.",
        submittedAt: "2026-07-27T01:00:00.000Z",
      },
    ],
    conclusion: {
      conclusionCategory: "QUALIFIED",
      scopeSummary: "Certificate control",
      materialFindingsSummary: "One material exception",
      nonMaterialFindingsSummary: "None",
      limitations: "None",
      uncertainty: "Low",
      recommendations: "Hold and verify",
      confidence: 90,
      submittedAt: "2026-07-27T01:05:00.000Z",
    },
    maximumSubmittedFindings: 4,
    inputLimits: {
      maximumDrafts: 1,
      maximumDraftRecords: 1,
      maximumFindingRecords: 6,
      findingTitleUtf8Bytes: 256,
      findingObservationUtf8Bytes: 1_024,
      findingRecommendationUtf8Bytes: 1_024,
      conclusionFieldUtf8Bytes: 1_024,
      maximumEvidenceCitationsPerFinding: 4,
      maximumPolicyCitationsPerFinding: 3,
    },
    report: {
      schemaVersion: "1.0.0",
      auditCaseId: "AUDIT_COFFEE_CHALLENGE_A",
      auditCaseVersion: "1.0.0",
      sourceProcessId: "PROCESS_COFFEE_CHALLENGE_A",
      sourceProcessVersion: "1.0.0",
      sourceStateHash: "a".repeat(64),
      score: 80,
      maximumScore: 100,
      passScore: 70,
      passed: true,
      scoreLines: [
        {
          scorableItemId: "AUD_DETECTION",
          score: 20,
          maximumScore: 25,
          sourceFindingIds: ["FINDING_001"],
          sourceEvidenceIds: ["EVID_CERTIFICATE"],
          sourcePolicyIds: ["POLICY_CERTIFICATE"],
        },
      ],
      confirmedFindingIds: ["FINDING_001"],
      unsupportedFindingIds: [],
      missedFindingDefinitionIds: ["FINDING_DEF_002"],
      conclusionCategory: "QUALIFIED",
      generatedAt: "2026-07-27T01:06:00.000Z",
    },
  };
}

const timeline: readonly InstructorTimelineItem[] = [
  {
    sequenceNumber: 7,
    eventId: "HEVT_FINDING_001",
    eventType: "AUDIT_FINDING_SUBMITTED",
    occurredAt: "2026-07-27T01:00:00.000Z",
    authenticatedUserId: "USER_LEARNER_001",
    simulationActorId: "ACTOR_AUDITOR_001",
    organizationId: "ORG_AUDIT",
    roleId: "ROLE_AUDITOR",
    causationId: "COMMAND_FINDING_001",
    payload: {
      finding: {
        findingId: "FINDING_001",
      },
    },
  },
];

const assignmentReport: HostedAssignmentReportV1 = {
  schemaVersion: "2.0.0",
  assignment: {
    schemaVersion: "2.0.0",
    assignmentId: "ASSIGNMENT_AUDIT_001",
    title: "Audit cohort",
    packId: pack.packId,
    packVersion: pack.version,
    scenarioId: "SCN_COFFEE_AUDIT_CHALLENGE_A",
    scenarioVersion: "1.0.0",
    mode: "configured",
    runConfiguration: {
      mode: "configured",
      allowHints: false,
      allowRetry: false,
      allowBacktracking: false,
      feedbackTiming: "final",
      showScores: true,
      outcomeStrategy: "forced",
      seedPolicy: "supplied",
      allowCommunication: false,
      allowEvidenceRequests: false,
    },
    experienceConfiguration:
      LECTURER_PRESETS["audit-assessment"],
    experienceConfigurationHash: "b".repeat(64),
    counterfactualReplay: {
      enabled: false,
      allowedDecisionNodeIds: [],
      maximumBranchesPerLearner: 0,
      learnerAvailability: "DISABLED",
      requireReflection: false,
    },
    research: { enabled: false },
    learnerUserIds: ["USER_LEARNER_001"],
    raterUserIds: [],
    status: "active",
    feedbackReleaseStatus: "withheld",
    createdAt: "2026-07-27T00:00:00.000Z",
    createdByUserId: "USER_INSTRUCTOR_001",
  },
  learners: [
    {
      learnerUserId: "USER_LEARNER_001",
      runs: [
        {
          runId: "RUN_AUDIT_001",
          learnerUserId: "USER_LEARNER_001",
          status: "completed",
          eventCount: 12,
          startedAt: "2026-07-27T00:30:00.000Z",
          lastActivityAt: "2026-07-27T01:06:00.000Z",
          completedAt: "2026-07-27T01:06:00.000Z",
          elapsedSeconds: 2_160,
          activity: {
            evidenceInspectionCount: 4,
            policyConsultationCount: 2,
            citedEvidenceCount: 1,
            decisionAttemptCount: 2,
            rejectedAttemptCount: 0,
            mitigationCount: 0,
            rejectionFindings: [],
          },
          ratings: [],
          moderationResolutions: [],
        },
      ],
    },
  ],
};

describe("Audit assignment report", () => {
  it("links finding-level replay and reports review-only variant calibration", () => {
    const sourceSummary = assignmentReport.learners[0]!.runs[0]!;
    const original = structuredClone(assignmentReport);

    const result = createAuditAssignmentReport({
      assignmentReport,
      runs: [
        {
          summary: sourceSummary,
          projection: projection(),
          timeline,
        },
      ],
      bank,
    });

    expect(result).toMatchObject({
      reviewOnly: true,
      officialScoresUnchanged: true,
      summary: {
        runCount: 1,
        completedRunCount: 1,
        meanCompletedScore: 80,
        confirmedFindingCount: 1,
        unsupportedFindingCount: 0,
        missedFindingCount: 1,
      },
    });
    expect(result.runs[0]?.findings[0]).toMatchObject({
      findingId: "FINDING_001",
      eventId: "HEVT_FINDING_001",
      sequenceNumber: 7,
      classification: "CONFIRMED",
    });
    expect(result.variantDistribution).toHaveLength(3);
    expect(
      result.variantDistribution.find(
        (variant) => variant.variantId === "AUDIT_CHALLENGE_A",
      ),
    ).toMatchObject({ runCount: 1, completedRunCount: 1 });
    expect(result.calibration).toMatchObject({
      reviewOnly: true,
      automaticScoreRescalingApplied: false,
      sampleSize: 1,
      bankStatus: "DRAFT",
    });
    expect(assignmentReport).toEqual(original);
  });
});
