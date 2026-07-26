import { describe, expect, it } from "vitest";
import pharmaceuticalPackJson from "../../../scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json";
import type {
  ClassCompetencyIndicatorV1,
  HostedAssignmentCompetencyReportV1,
  LearnerCompetencyIndicatorV1,
} from "../contracts/competency-report";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import {
  repositoryCurriculumOverlays,
} from "../curriculum-overlays/repository-overlays";
import {
  assignmentCurriculumCrosswalkFilename,
  createAssignmentCurriculumCrosswalkReport,
  CurriculumCrosswalkReportError,
  serializeAssignmentCurriculumCrosswalkReportJson,
} from "./curriculum-crosswalk-report";

const pack = pharmaceuticalPackJson as ScenarioPackV1;
const scenario = pack.scenarios.find(
  (candidate) =>
    candidate.scenarioId === "SCN_PHARMA_COLD_CHAIN_TRANSFER",
);

if (scenario === undefined) {
  throw new Error("Expected the pharmaceutical transfer scenario.");
}

const observedAt = "2026-07-25T03:20:00.000Z";
const frameworkVersion =
  pack.competencyFrameworks[0]?.version ?? "1.2.0";

function learnerIndicator(options: {
  readonly indicatorId: string;
  readonly targetType: "primary" | "supporting";
  readonly evidenceIds: readonly string[];
  readonly ratingIds?: readonly string[];
}): LearnerCompetencyIndicatorV1 {
  return {
    frameworkId: "PHARMA_COLD_CHAIN",
    frameworkVersion,
    competencyId: "PHARMA.COLD_CHAIN",
    competencyVersion: "1.2.0",
    competencyTitleKey:
      "platformPack.pharmaColdChain.competency.title",
    indicatorId: options.indicatorId,
    indicatorVersion:
      options.indicatorId === "PHARMA.COLD_CHAIN.PI1"
        ? "1.1.0"
        : "1.0.0",
    indicatorStatementKey:
      "platformPack.pharmaColdChain.indicator.statement",
    targetType: options.targetType,
    evidenceCount: options.evidenceIds.length,
    ...(options.evidenceIds.length === 0
      ? {}
      : { latestObservedAt: observedAt }),
    observations: options.evidenceIds.map((evidenceId) => ({
      runId: "RUN_PHARMA_TRANSFER_001",
      competencyEvidenceId: evidenceId,
      evidenceRuleId:
        evidenceId === "CEV_TRIAGE"
          ? "EVIDENCE_RULE_PHARMA_TRANSFER_TRIAGE"
          : "EVIDENCE_RULE_PHARMA_TRANSFER_DISPOSITION",
      sourceEventIds: [`EVENT_${evidenceId}`],
      observedAt,
    })),
    currentRatings: (options.ratingIds ?? []).map(
      (ratingId) => ({
        runId: "RUN_PHARMA_TRANSFER_001",
        ratingId,
        rubricId: "RUBRIC_PHARMA_TRANSFER",
        rubricVersion: "1.0.0",
        criterionId:
          ratingId === "RATING_TRIAGE"
            ? "CRITERION_PHARMA_TRANSFER_TRIAGE"
            : "CRITERION_PHARMA_TRANSFER_DISPOSITION",
        levelValue: 2,
        comment: "Pilot rating.",
        linkedEvidenceIds: options.evidenceIds,
        revision: 1,
        raterUserId: "USER_INSTRUCTOR_001",
        ratedAt: observedAt,
      }),
    ),
  };
}

const learnerIndicators: readonly LearnerCompetencyIndicatorV1[] = [
  learnerIndicator({
    indicatorId: "PHARMA.COLD_CHAIN.PI1",
    targetType: "primary",
    evidenceIds: ["CEV_TRIAGE"],
    ratingIds: ["RATING_TRIAGE"],
  }),
  learnerIndicator({
    indicatorId: "PHARMA.COLD_CHAIN.PI2",
    targetType: "primary",
    evidenceIds: ["CEV_DISPOSITION"],
    ratingIds: ["RATING_DISPOSITION"],
  }),
  learnerIndicator({
    indicatorId: "PHARMA.COLD_CHAIN.PI3",
    targetType: "supporting",
    evidenceIds: ["CEV_TRIAGE", "CEV_DISPOSITION"],
    ratingIds: ["RATING_TRIAGE", "RATING_DISPOSITION"],
  }),
];

const classIndicators: readonly ClassCompetencyIndicatorV1[] =
  learnerIndicators.map((indicator) => ({
    frameworkId: indicator.frameworkId,
    frameworkVersion: indicator.frameworkVersion,
    competencyId: indicator.competencyId,
    competencyVersion: indicator.competencyVersion,
    competencyTitleKey: indicator.competencyTitleKey,
    indicatorId: indicator.indicatorId,
    indicatorVersion: indicator.indicatorVersion,
    indicatorStatementKey: indicator.indicatorStatementKey,
    targetType: indicator.targetType,
    assignedLearnerCount: 1,
    learnersWithEvidence: 1,
    evidenceCount: indicator.evidenceCount,
    currentRatingCount: indicator.currentRatings.length,
    ratingDistribution: [{ levelValue: 2, count: 1 }],
  }));

const competencyReport: HostedAssignmentCompetencyReportV1 = {
  schemaVersion: "1.0.0",
  interpretation: "EVIDENCE_ONLY_NO_COMPETENCE_INFERENCE",
  assignmentId: "ASSIGNMENT_PHARMA_TRANSFER",
  packId: pack.packId,
  packVersion: pack.version,
  scenarioId: scenario.scenarioId,
  scenarioVersion: scenario.version,
  frameworks: [
    {
      frameworkId: "PHARMA_COLD_CHAIN",
      frameworkVersion,
    },
  ],
  learners: [
    {
      learnerUserId: "USER_LEARNER_001",
      indicators: learnerIndicators,
    },
  ],
  classIndicators,
};

describe("curriculum crosswalk report", () => {
  it("maps evidence to external outcomes without inventing attainment", () => {
    const report = createAssignmentCurriculumCrosswalkReport({
      pack,
      overlays: repositoryCurriculumOverlays,
      competencyReport,
    });

    expect(report).toMatchObject({
      schemaVersion: "2.0.0",
      interpretation:
        "EVIDENCE_CROSSWALK_NO_ATTAINMENT_INFERENCE",
      assignmentId: "ASSIGNMENT_PHARMA_TRANSFER",
      packVersion: "1.6.0",
      scenarioId: "SCN_PHARMA_COLD_CHAIN_TRANSFER",
      scenarioVersion: "1.1.0",
      competencyIndicators: expect.arrayContaining([
        expect.objectContaining({
          competencyId: "PHARMA.COLD_CHAIN",
          competencyVersion: "1.2.0",
          indicatorId: "PHARMA.COLD_CHAIN.PI1",
          indicatorVersion: "1.1.0",
        }),
      ]),
    });
    expect(report.overlays).toHaveLength(2);
    const courseOverlay = report.overlays.find(
      (overlay) => overlay.owner.ownerType === "COURSE",
    );
    expect(courseOverlay).toMatchObject({
      overlayId: "OVERLAY_PHARMA_PILOT_COURSE",
      overlayVersion: "1.0.0",
      status: "ADOPTED",
      educationalDemoOnly: true,
      owner: {
        ownerId: "TRACECHAIN_DEMO_COURSE",
        ownerType: "COURSE",
      },
      externalFrameworkId: "PHARMA_PILOT_COURSE_OUTCOMES",
      labelsByLocale: {
        en: {
          ownerDisplayName: "TraceChain demonstration course",
          externalFrameworkTitle:
            "Pilot pharmaceutical course outcomes",
        },
        vi: {
          ownerDisplayName: "Học phần minh họa TraceChain",
          externalFrameworkTitle:
            "Chuẩn đầu ra học phần dược phẩm thí điểm",
        },
      },
    });
    expect(courseOverlay?.classOutcomes).toEqual([
      expect.objectContaining({
        outcomeId: "CLO_EVIDENCE_EVALUATION",
        primaryIndicatorIds: ["PHARMA.COLD_CHAIN.PI1"],
        supportingIndicatorIds: ["PHARMA.COLD_CHAIN.PI3"],
        contextualIndicatorIds: [],
        evidenceObservationCount: 2,
        currentRatingCount: 2,
      }),
      expect.objectContaining({
        outcomeId: "CLO_PROPORTIONATE_ACTION",
        primaryIndicatorIds: ["PHARMA.COLD_CHAIN.PI2"],
        supportingIndicatorIds: ["PHARMA.COLD_CHAIN.PI3"],
        contextualIndicatorIds: [],
        evidenceObservationCount: 2,
        currentRatingCount: 2,
      }),
    ]);
    expect(courseOverlay?.learners[0]?.outcomes).toEqual([
      expect.objectContaining({
        outcomeId: "CLO_EVIDENCE_EVALUATION",
        evidenceObservationCount: 2,
        currentRatingCount: 2,
        evidenceObservations: expect.arrayContaining([
          expect.objectContaining({
            runId: "RUN_PHARMA_TRANSFER_001",
            competencyEvidenceId: "CEV_TRIAGE",
            evidenceRuleVersion: "1.0.0",
            sourceEventIds: ["EVENT_CEV_TRIAGE"],
            mappedIndicatorIds: [
              "PHARMA.COLD_CHAIN.PI1",
              "PHARMA.COLD_CHAIN.PI3",
            ],
          }),
        ]),
      }),
      expect.objectContaining({
        outcomeId: "CLO_PROPORTIONATE_ACTION",
        evidenceObservationCount: 2,
        currentRatingCount: 2,
      }),
    ]);
    const programOverlay = report.overlays.find(
      (overlay) => overlay.owner.ownerType === "PROGRAM",
    );
    expect(programOverlay).toMatchObject({
      overlayId: "OVERLAY_PHARMA_PILOT_PROGRAM",
      owner: {
        ownerId: "TRACECHAIN_DEMO_PROGRAM",
        ownerType: "PROGRAM",
      },
    });
    expect(
      programOverlay?.classOutcomes.find(
        (outcome) =>
          outcome.outcomeId === "PLO_EVIDENCE_GOVERNANCE",
      ),
    ).toMatchObject({
      primaryIndicatorIds: ["PHARMA.COLD_CHAIN.PI1"],
      supportingIndicatorIds: [],
      contextualIndicatorIds: ["PHARMA.COLD_CHAIN.PI3"],
    });
    expect(JSON.stringify(report)).not.toContain("attainment");
    expect(JSON.stringify(report)).not.toContain("mastery");
    expect(
      serializeAssignmentCurriculumCrosswalkReportJson(report),
    ).toBe(`${JSON.stringify(report, null, 2)}\n`);
    expect(
      assignmentCurriculumCrosswalkFilename(
        "ASSIGNMENT PHARMA/TRANSFER",
      ),
    ).toBe(
      "TraceChain_ASSIGNMENT_PHARMA_TRANSFER_curriculum_overlay_v2.json",
    );
  });

  it("rejects crosswalk projection against another pack version", () => {
    const mismatched = {
      ...competencyReport,
      packVersion: "1.2.0",
    };

    expect(() =>
      createAssignmentCurriculumCrosswalkReport({
        pack,
        overlays: repositoryCurriculumOverlays,
        competencyReport: mismatched,
      }),
    ).toThrowError(
      new CurriculumCrosswalkReportError(
        "CURRICULUM_CROSSWALK_SOURCE_MISMATCH",
        "Curriculum overlay pack does not match the competency report.",
      ),
    );
  });
});
