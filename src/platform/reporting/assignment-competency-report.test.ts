import { describe, expect, it } from "vitest";
import packJson from "../../../scenario-packs/standard-coffee-stage3/tracechain.pack.json";
import type { HostedAssignmentReportV1 } from "../contracts/assessment";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import type { CompetencyEvidenceProjection } from "../hosted/stage3-types";
import {
  createAssignmentCompetencyReport,
} from "./assignment-competency-report";

const pack = packJson as ScenarioPackV1;
const scenario = pack.scenarios[0];

if (scenario === undefined) {
  throw new Error("Expected the standard coffee hosted scenario.");
}

const assignmentReport: HostedAssignmentReportV1 = {
  schemaVersion: "1.0.0",
  assignment: {
    schemaVersion: "1.0.0",
    assignmentId: "ASSIGNMENT_COMPETENCY_001",
    title: "Coffee competency cohort",
    packId: pack.packId,
    packVersion: pack.version,
    scenarioId: scenario.scenarioId,
    scenarioVersion: scenario.version,
    mode: "standard",
    runConfiguration:
      scenario.modeConfigurations?.find(
        (configuration) => configuration.mode === "standard",
      ) ??
      (() => {
        throw new Error("Expected the standard run configuration.");
      })(),
    learnerUserIds: ["USER_LEARNER_001"],
    status: "active",
    feedbackReleaseStatus: "withheld",
    createdAt: "2026-07-24T08:00:00.000Z",
    createdByUserId: "USER_INSTRUCTOR_001",
  },
  learners: [
    {
      learnerUserId: "USER_LEARNER_001",
      runs: [
        {
          runId: "RUN_COMPETENCY_001",
          learnerUserId: "USER_LEARNER_001",
          status: "completed",
          eventCount: 12,
          moderationResolutions: [],
          ratings: [
            {
              schemaVersion: "1.0.0",
              ratingId: "RATING_COMPETENCY_001",
              assignmentId: "ASSIGNMENT_COMPETENCY_001",
              runId: "RUN_COMPETENCY_001",
              rubricId: "RUBRIC_CERTIFICATE_DECISION",
              rubricVersion: "1.0.0",
              criterionId: "CRITERION_EVIDENCE_USE",
              levelValue: 3,
              comment: "The cited evidence supports the decision.",
              linkedEvidenceIds: ["CEV_INSPECTION_001"],
              revision: 1,
              raterUserId: "USER_INSTRUCTOR_001",
              ratedAt: "2026-07-24T08:20:00.000Z",
            },
          ],
        },
      ],
    },
  ],
};

const evidenceByRun: readonly {
  readonly runId: string;
  readonly indicators: readonly CompetencyEvidenceProjection[];
}[] = [
  {
    runId: "RUN_COMPETENCY_001",
    indicators: [
      {
        indicatorId: "PC2.PI1",
        evidence: [
          {
            competencyEvidenceId: "CEV_INSPECTION_001",
            evidenceRuleId: "RULE_CERTIFICATE_INSPECTED",
            indicatorIds: ["PC2.PI1", "BC6.PI2"],
            sourceEventIds: ["EVENT_INSPECTION_001"],
            observedAt: "2026-07-24T08:10:00.000Z",
          },
        ],
      },
      {
        indicatorId: "BC6.PI2",
        evidence: [
          {
            competencyEvidenceId: "CEV_INSPECTION_001",
            evidenceRuleId: "RULE_CERTIFICATE_INSPECTED",
            indicatorIds: ["PC2.PI1", "BC6.PI2"],
            sourceEventIds: ["EVENT_INSPECTION_001"],
            observedAt: "2026-07-24T08:10:00.000Z",
          },
        ],
      },
    ],
  },
];

describe("assignment competency report", () => {
  it("links scenario targets to learner evidence and current rubric ratings", () => {
    const report = createAssignmentCompetencyReport({
      assignmentReport,
      pack,
      evidenceByRun,
    });

    expect(report).toMatchObject({
      schemaVersion: "1.0.0",
      interpretation: "EVIDENCE_ONLY_NO_COMPETENCE_INFERENCE",
      assignmentId: "ASSIGNMENT_COMPETENCY_001",
      packId: pack.packId,
      packVersion: pack.version,
      scenarioId: scenario.scenarioId,
      scenarioVersion: scenario.version,
      frameworks: [
        {
          frameworkId: "TRACECHAIN_CORE",
          frameworkVersion: "1.0.0",
        },
      ],
    });
    const learner = report.learners[0];
    const evidenceUse = learner?.indicators.find(
      (indicator) => indicator.indicatorId === "PC2.PI1",
    );
    expect(evidenceUse).toMatchObject({
      competencyId: "PC2",
      targetType: "supporting",
      evidenceCount: 1,
      latestObservedAt: "2026-07-24T08:10:00.000Z",
    });
    expect(evidenceUse?.observations[0]).toMatchObject({
      runId: "RUN_COMPETENCY_001",
      competencyEvidenceId: "CEV_INSPECTION_001",
      sourceEventIds: ["EVENT_INSPECTION_001"],
    });
    expect(evidenceUse?.currentRatings[0]).toMatchObject({
      runId: "RUN_COMPETENCY_001",
      ratingId: "RATING_COMPETENCY_001",
      rubricVersion: "1.0.0",
      criterionId: "CRITERION_EVIDENCE_USE",
      levelValue: 3,
    });
    const classSummary = report.classIndicators.find(
      (indicator) => indicator.indicatorId === "PC2.PI1",
    );
    expect(classSummary).toMatchObject({
      assignedLearnerCount: 1,
      learnersWithEvidence: 1,
      evidenceCount: 1,
      currentRatingCount: 1,
      ratingDistribution: [{ levelValue: 3, count: 1 }],
    });
  });

  it("reports unobserved targets without inventing a performance level", () => {
    const report = createAssignmentCompetencyReport({
      assignmentReport,
      pack,
      evidenceByRun,
    });
    const unobserved = report.learners[0]?.indicators.find(
      (indicator) => indicator.indicatorId === "BC8.PI1",
    );

    expect(unobserved).toMatchObject({
      evidenceCount: 0,
      observations: [],
      currentRatings: [],
    });
    expect(unobserved).not.toHaveProperty("performanceLevel");
  });
});
