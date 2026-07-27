export interface VariantCalibrationBankV1 {
  readonly bankId: string;
  readonly bankVersion: string;
  readonly bankStatus:
    | "DRAFT"
    | "EXPERT_REVIEWED"
    | "PILOT_CALIBRATED"
    | "RETIRED";
  readonly variants: readonly {
    readonly variantId: string;
    readonly variantVersion: string;
    readonly variantContentHash: string;
    readonly caseReference: string;
  }[];
}

export interface VariantCalibrationObservationV1 {
  readonly runId: string;
  readonly variantId: string;
  readonly variantVersion: string;
  readonly variantContentHash: string;
  readonly score: number;
  readonly maximumScore: number;
  readonly passed: boolean;
  readonly completionSeconds: number;
  readonly itemScores: readonly {
    readonly scorableItemId: string;
    readonly earnedScore: number;
    readonly maximumScore: number;
  }[];
  readonly evidenceIdsUsed: readonly string[];
  readonly hintIdsUsed: readonly string[];
  readonly mitigationCount: number;
  readonly falsePositiveCount: number;
  readonly missedFindingCount: number;
  readonly rubricRatings: readonly {
    readonly rubricCriterionId: string;
    readonly rating: number;
  }[];
}

export interface VariantCalibrationSummaryV1 {
  readonly variantId: string;
  readonly variantVersion: string;
  readonly variantContentHash: string;
  readonly caseReference: string;
  readonly sampleSize: number;
  readonly meanScore: number | null;
  readonly passRatePercent: number | null;
  readonly meanCompletionSeconds: number | null;
  readonly itemPerformance: readonly {
    readonly scorableItemId: string;
    readonly sampleSize: number;
    readonly meanEarnedScore: number;
    readonly maximumScore: number;
  }[];
  readonly evidenceUse: readonly {
    readonly evidenceId: string;
    readonly runCount: number;
  }[];
  readonly hintUseRatePercent: number | null;
  readonly meanMitigationCount: number | null;
  readonly meanFalsePositiveCount: number | null;
  readonly meanMissedFindingCount: number | null;
  readonly rubricRatings: readonly {
    readonly rubricCriterionId: string;
    readonly sampleSize: number;
    readonly meanRating: number;
  }[];
}

export interface VariantCalibrationReportV1 {
  readonly schemaVersion: "1";
  readonly bankId: string;
  readonly bankVersion: string;
  readonly bankStatus:
    VariantCalibrationBankV1["bankStatus"];
  readonly sampleSize: number;
  readonly reviewOnly: true;
  readonly automaticScoreRescalingApplied: false;
  readonly minimumRecommendedPilotSamplePerVariant: number;
  readonly variants: readonly VariantCalibrationSummaryV1[];
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return (
    values.reduce((total, value) => total + value, 0) /
    values.length
  );
}

function rounded(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

function validateObservation(
  observation: VariantCalibrationObservationV1,
): void {
  if (
    observation.runId.trim().length === 0 ||
    !Number.isFinite(observation.score) ||
    !Number.isFinite(observation.maximumScore) ||
    observation.maximumScore <= 0 ||
    observation.score < 0 ||
    observation.score > observation.maximumScore ||
    !Number.isSafeInteger(observation.completionSeconds) ||
    observation.completionSeconds < 0 ||
    !Number.isSafeInteger(observation.mitigationCount) ||
    observation.mitigationCount < 0 ||
    !Number.isSafeInteger(observation.falsePositiveCount) ||
    observation.falsePositiveCount < 0 ||
    !Number.isSafeInteger(observation.missedFindingCount) ||
    observation.missedFindingCount < 0
  ) {
    throw new Error(
      "Variant calibration observations must contain bounded completed-run measures.",
    );
  }
}

function groupedMean(
  entries: readonly {
    readonly id: string;
    readonly value: number;
    readonly maximum?: number;
  }[],
): readonly {
  readonly id: string;
  readonly count: number;
  readonly value: number;
  readonly maximum?: number;
}[] {
  const groups = new Map<
    string,
    { values: number[]; maximum?: number }
  >();
  for (const entry of entries) {
    const group = groups.get(entry.id) ?? { values: [] };
    if (
      entry.maximum !== undefined &&
      group.maximum !== undefined &&
      group.maximum !== entry.maximum
    ) {
      throw new Error(
        `Calibration item ${entry.id} has inconsistent maximum scores.`,
      );
    }
    group.values.push(entry.value);
    groups.set(entry.id, {
      values: group.values,
      ...(entry.maximum === undefined
        ? {}
        : { maximum: entry.maximum }),
    });
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, group]) => ({
      id,
      count: group.values.length,
      value: rounded(mean(group.values))!,
      ...(group.maximum === undefined
        ? {}
        : { maximum: group.maximum }),
    }));
}

export function createVariantCalibrationReport(options: {
  readonly bank: VariantCalibrationBankV1;
  readonly observations:
    readonly VariantCalibrationObservationV1[];
  readonly minimumRecommendedPilotSamplePerVariant?: number;
}): VariantCalibrationReportV1 {
  const variants = new Map(
    options.bank.variants.map((variant) => [
      variant.variantId,
      variant,
    ]),
  );
  if (
    variants.size !== options.bank.variants.length ||
    options.bank.variants.length === 0
  ) {
    throw new Error(
      "Calibration requires a non-empty bank with unique variants.",
    );
  }
  const runIds = new Set<string>();
  for (const observation of options.observations) {
    validateObservation(observation);
    if (runIds.has(observation.runId)) {
      throw new Error(
        "A completed run may appear only once in calibration.",
      );
    }
    runIds.add(observation.runId);
    const variant = variants.get(observation.variantId);
    if (
      variant === undefined ||
      variant.variantVersion !== observation.variantVersion ||
      variant.variantContentHash !==
        observation.variantContentHash
    ) {
      throw new Error(
        "Calibration data does not match the exact immutable variant bank.",
      );
    }
  }
  const summaries = options.bank.variants.map((variant) => {
    const observations = options.observations.filter(
      (observation) =>
        observation.variantId === variant.variantId,
    );
    const evidenceCounts = new Map<string, number>();
    for (const observation of observations) {
      for (const evidenceId of new Set(
        observation.evidenceIdsUsed,
      )) {
        evidenceCounts.set(
          evidenceId,
          (evidenceCounts.get(evidenceId) ?? 0) + 1,
        );
      }
    }
    const itemPerformance = groupedMean(
      observations.flatMap((observation) =>
        observation.itemScores.map((item) => ({
          id: item.scorableItemId,
          value: item.earnedScore,
          maximum: item.maximumScore,
        })),
      ),
    ).map((item) => ({
      scorableItemId: item.id,
      sampleSize: item.count,
      meanEarnedScore: item.value,
      maximumScore: item.maximum!,
    }));
    const rubricRatings = groupedMean(
      observations.flatMap((observation) =>
        observation.rubricRatings.map((rating) => ({
          id: rating.rubricCriterionId,
          value: rating.rating,
        })),
      ),
    ).map((rating) => ({
      rubricCriterionId: rating.id,
      sampleSize: rating.count,
      meanRating: rating.value,
    }));
    return {
      ...variant,
      sampleSize: observations.length,
      meanScore: rounded(
        mean(observations.map((observation) => observation.score)),
      ),
      passRatePercent: rounded(
        observations.length === 0
          ? null
          : (observations.filter(
              (observation) => observation.passed,
            ).length /
              observations.length) *
              100,
      ),
      meanCompletionSeconds: rounded(
        mean(
          observations.map(
            (observation) => observation.completionSeconds,
          ),
        ),
      ),
      itemPerformance,
      evidenceUse: [...evidenceCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([evidenceId, runCount]) => ({
          evidenceId,
          runCount,
        })),
      hintUseRatePercent: rounded(
        observations.length === 0
          ? null
          : (observations.filter(
              (observation) =>
                observation.hintIdsUsed.length > 0,
            ).length /
              observations.length) *
              100,
      ),
      meanMitigationCount: rounded(
        mean(
          observations.map(
            (observation) => observation.mitigationCount,
          ),
        ),
      ),
      meanFalsePositiveCount: rounded(
        mean(
          observations.map(
            (observation) =>
              observation.falsePositiveCount,
          ),
        ),
      ),
      meanMissedFindingCount: rounded(
        mean(
          observations.map(
            (observation) => observation.missedFindingCount,
          ),
        ),
      ),
      rubricRatings,
    };
  });
  return {
    schemaVersion: "1",
    bankId: options.bank.bankId,
    bankVersion: options.bank.bankVersion,
    bankStatus: options.bank.bankStatus,
    sampleSize: options.observations.length,
    reviewOnly: true,
    automaticScoreRescalingApplied: false,
    minimumRecommendedPilotSamplePerVariant:
      options.minimumRecommendedPilotSamplePerVariant ?? 30,
    variants: summaries,
  };
}
