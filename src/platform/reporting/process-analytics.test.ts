import { describe, expect, it } from "vitest";
import type {
  HostedAssignmentReportV1,
} from "../contracts/assessment";
import type {
  PlatformRunEventType,
  RunEventV1,
} from "../contracts/run-events";
import { createAssignmentProcessAnalytics } from "./process-analytics";
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
  allowCommunication: false,
  allowEvidenceRequests: true,
} as const;
const experience = hostedExperienceFixture({
  packId: "PACK_ANALYTICS",
  packVersion: "1.0.0",
  scenarioId: "SCENARIO_ANALYTICS",
  scenarioVersion: "1.0.0",
  runtimeConfiguration,
});
const report: HostedAssignmentReportV1 = {
  schemaVersion: "2.0.0",
  assignment: {
    schemaVersion: "2.0.0",
    assignmentId: "ASSIGNMENT_ANALYTICS_001",
    title: "Analytics cohort",
    packId: "PACK_ANALYTICS",
    packVersion: "1.0.0",
    scenarioId: "SCENARIO_ANALYTICS",
    scenarioVersion: "1.0.0",
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
    feedbackReleaseStatus: "withheld",
    createdAt: "2026-07-26T01:00:00.000Z",
    createdByUserId: "USER_INSTRUCTOR_001",
  },
  learners: [
    {
      learnerUserId: "USER_LEARNER_001",
      runs: [
        {
          runId: "RUN_ANALYTICS_001",
          learnerUserId: "USER_LEARNER_001",
          status: "active",
          eventCount: 5,
          startedAt: "2026-07-26T01:01:00.000Z",
          lastActivityAt: "2026-07-26T01:04:00.000Z",
          completedAt: null,
          elapsedSeconds: 180,
          activity: {
            evidenceInspectionCount: 1,
            policyConsultationCount: 1,
            citedEvidenceCount: 1,
            decisionAttemptCount: 1,
            rejectedAttemptCount: 1,
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

function event(
  sequenceNumber: number,
  eventType: PlatformRunEventType,
  payload: RunEventV1["payload"],
): RunEventV1 {
  return {
    schemaVersion: "1.0.0",
    sequenceNumber,
    eventId: `EVENT_ANALYTICS_${String(sequenceNumber)}`,
    runId: "RUN_ANALYTICS_001",
    idempotencyKey: `COMMAND_ANALYTICS:${String(sequenceNumber)}`,
    serverTimestampUtc:
      `2026-07-26T01:0${String(sequenceNumber)}:00.000Z`,
    authenticatedUserId: "USER_LEARNER_001",
    simulationActorId: "ACTOR_LEARNER_001",
    organizationId: "ORG_ANALYTICS",
    roleId: "ROLE_ANALYTICS",
    eventType,
    packId: "PACK_ANALYTICS",
    packVersion: "1.0.0",
    scenarioId: "SCENARIO_ANALYTICS",
    scenarioVersion: "1.0.0",
    payload,
    causationId: `COMMAND_ANALYTICS_${String(sequenceNumber)}`,
    correlationId: "RUN_ANALYTICS_001",
    previousStateHash: "a".repeat(64),
    resultingStateHash: "b".repeat(64),
  };
}

describe("assignment process analytics", () => {
  it("keeps descriptive observations linked to authoritative events", () => {
    const analytics = createAssignmentProcessAnalytics({
      report,
      events: [
        event(1, "RUN_CREATED", {}),
        event(2, "EVIDENCE_REQUESTED", {
          evidenceId: "EVIDENCE_STABILITY_ASSESSMENT",
          simulatedAvailableAt: "2026-07-26T01:47:00.000Z",
          delayMinutes: 45,
          costUnits: 2,
        }),
        event(3, "EVIDENCE_INSPECTED", {
          evidenceId: "EVIDENCE_SENSOR",
        }),
        event(4, "POLICY_CONSULTED", {
          policyId: "POLICY_RELEASE",
        }),
        event(5, "DECISION_SUBMITTED", {
          decision: {
            commandType: "SUBMIT_STRUCTURED_DECISION",
            decisionId: "DECISION_RELEASE",
          },
          citedEvidenceIds: ["EVIDENCE_SENSOR"],
          citedPolicyIds: ["POLICY_RELEASE"],
          confidenceRating: 4,
          adverseEventProbabilityPercent: 25,
        }),
      ],
      professionalConsequencesByRun: {
        RUN_ANALYTICS_001: {
          PATIENT_SAFETY_INDEX: 2,
        },
      },
      generatedAt: "2026-07-26T02:00:00.000Z",
    });

    expect(analytics).toMatchObject({
      schemaVersion: "1.2.0",
      interpretation:
        "DESCRIPTIVE_EVENT_LINKED_NO_LEARNER_TRAIT_INFERENCE",
      ruleVersion: "SIMULEDGER_PROCESS_ANALYTICS_V1@1.2.0",
      summary: {
        evidenceRequestCounts: {
          EVIDENCE_STABILITY_ASSESSMENT: 1,
        },
        evidenceInspectionCounts: { EVIDENCE_SENSOR: 1 },
        evidenceCitationCounts: { EVIDENCE_SENSOR: 1 },
        policyConsultationCounts: { POLICY_RELEASE: 1 },
        policyCitationCounts: { POLICY_RELEASE: 1 },
        decisionSubmissionCounts: { DECISION_RELEASE: 1 },
        authoredRequestDelayMinutesTotal: 45,
        authoredRequestCostUnitsTotal: 2,
      },
    });
    expect(analytics.runs[0]).toMatchObject({
      evidenceRequestOrder: [
        {
          eventId: "EVENT_ANALYTICS_2",
          sequenceNumber: 2,
          itemId: "EVIDENCE_STABILITY_ASSESSMENT",
          delayMinutes: 45,
          costUnits: 2,
          simulatedAvailableAt: "2026-07-26T01:47:00.000Z",
        },
      ],
      evidenceInspectionOrder: [
        {
          eventId: "EVENT_ANALYTICS_3",
          sequenceNumber: 3,
          itemId: "EVIDENCE_SENSOR",
        },
      ],
      decisions: [
        {
          eventId: "EVENT_ANALYTICS_5",
          decisionId: "DECISION_RELEASE",
          elapsedSincePreviousSubmissionSeconds: null,
        },
      ],
      professionalConsequences: {
        PATIENT_SAFETY_INDEX: 2,
      },
    });
    expect(analytics.limitations).toContain(
      "ELAPSED_INTERVAL_IS_NOT_ATTENTION",
    );
  });

  it("fails closed when an evidence request lacks bounded acquisition metadata", () => {
    const singleEventReport: HostedAssignmentReportV1 = {
      ...report,
      learners: [
        {
          ...report.learners[0]!,
          runs: [
            {
              ...report.learners[0]!.runs[0]!,
              eventCount: 1,
            },
          ],
        },
      ],
    };

    expect(() =>
      createAssignmentProcessAnalytics({
        report: singleEventReport,
        events: [
          event(1, "EVIDENCE_REQUESTED", {
            evidenceId: "EVIDENCE_STABILITY_ASSESSMENT",
            delayMinutes: -1,
            costUnits: 2,
            simulatedAvailableAt:
              "2026-07-26T02:47:00.000Z",
          }),
        ],
        generatedAt: "2026-07-26T02:00:00.000Z",
      }),
    ).toThrow("invalid authored acquisition metadata");
  });

  it("rejects an event from another content version", () => {
    expect(() =>
      createAssignmentProcessAnalytics({
        report,
        events: [
          {
            ...event(1, "RUN_CREATED", {}),
            scenarioVersion: "2.0.0",
          },
        ],
        generatedAt: "2026-07-26T02:00:00.000Z",
      }),
    ).toThrow("outside the exact assignment source");
  });

  it("supports the generic runtime's top-level decision identifier", () => {
    const singleEventReport: HostedAssignmentReportV1 = {
      ...report,
      learners: [
        {
          ...report.learners[0]!,
          runs: [
            {
              ...report.learners[0]!.runs[0]!,
              eventCount: 1,
            },
          ],
        },
      ],
    };
    const analytics = createAssignmentProcessAnalytics({
      report: singleEventReport,
      events: [
        event(1, "DECISION_SUBMITTED", {
          decisionId: "DECISION_GENERIC",
        }),
      ],
      generatedAt: "2026-07-26T02:00:00.000Z",
    });

    expect(analytics.runs[0]?.decisions[0]?.decisionId).toBe(
      "DECISION_GENERIC",
    );
  });

  it("fails closed when the event source is incomplete", () => {
    expect(() =>
      createAssignmentProcessAnalytics({
        report,
        events: [event(1, "RUN_CREATED", {})],
        generatedAt: "2026-07-26T02:00:00.000Z",
      }),
    ).toThrow("event count does not match");
  });
});
