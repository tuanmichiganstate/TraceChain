import { describe, expect, it } from "vitest";
import { createVariantCalibrationReport } from "./variant-calibration";

const bank = {
  bankId: "BANK_AUDIT",
  bankVersion: "1.0.0",
  bankStatus: "DRAFT" as const,
  variants: [
    {
      variantId: "A",
      variantVersion: "1.0.0",
      variantContentHash: "a".repeat(64),
      caseReference: "AC-01",
    },
    {
      variantId: "B",
      variantVersion: "1.0.0",
      variantContentHash: "b".repeat(64),
      caseReference: "AC-02",
    },
  ],
};

function observation(
  runId: string,
  score: number,
  passed: boolean,
) {
  return {
    runId,
    variantId: "A",
    variantVersion: "1.0.0",
    variantContentHash: "a".repeat(64),
    score,
    maximumScore: 100,
    passed,
    completionSeconds: 1_200,
    itemScores: [
      {
        scorableItemId: "AUD_DETECTION",
        earnedScore: score / 4,
        maximumScore: 25,
      },
    ],
    evidenceIdsUsed: ["EVIDENCE_A"],
    hintIdsUsed: passed ? [] : ["HINT_A"],
    mitigationCount: passed ? 0 : 1,
    falsePositiveCount: passed ? 0 : 1,
    missedFindingCount: passed ? 0 : 1,
    rubricRatings: [
      {
        rubricCriterionId: "RUBRIC_JUDGMENT",
        rating: passed ? 4 : 2,
      },
    ],
  };
}

describe("variant calibration report", () => {
  it("summarizes review signals by exact variant without rescaling scores", () => {
    const report = createVariantCalibrationReport({
      bank,
      observations: [
        observation("RUN_1", 80, true),
        observation("RUN_2", 60, false),
      ],
    });

    expect(report).toMatchObject({
      sampleSize: 2,
      reviewOnly: true,
      automaticScoreRescalingApplied: false,
      minimumRecommendedPilotSamplePerVariant: 30,
    });
    expect(report.variants[0]).toMatchObject({
      variantId: "A",
      sampleSize: 2,
      meanScore: 70,
      passRatePercent: 50,
      hintUseRatePercent: 50,
      meanFalsePositiveCount: 0.5,
      meanMissedFindingCount: 0.5,
    });
    expect(report.variants[1]).toMatchObject({
      variantId: "B",
      sampleSize: 0,
      meanScore: null,
      passRatePercent: null,
    });
  });

  it("rejects results from another variant version or content hash", () => {
    expect(() =>
      createVariantCalibrationReport({
        bank,
        observations: [
          {
            ...observation("RUN_WRONG", 80, true),
            variantContentHash: "c".repeat(64),
          },
        ],
      }),
    ).toThrow(/exact immutable/iu);
  });
});
