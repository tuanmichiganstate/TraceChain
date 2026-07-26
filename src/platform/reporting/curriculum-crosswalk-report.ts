import type {
  AssignmentCurriculumOverlayReportV2,
  AssignmentCurriculumOverlayV2,
  CurriculumCrosswalkOverlayV2,
  CurriculumEvidenceObservationLinkV2,
  CurriculumLocalizedValuesV2,
  LearnerCurriculumOutcomeEvidenceV2,
} from "../contracts/curriculum-crosswalk";
import type {
  HostedAssignmentCompetencyReportV1,
  LearnerCompetencyIndicatorV1,
  LearnerCompetencyRatingV1,
} from "../contracts/competency-report";
import type {
  ScenarioPackV1,
} from "../contracts/scenario-pack";
import {
  adoptedCurriculumOverlaysForPack,
} from "../curriculum-overlays/validation";

export class CurriculumCrosswalkReportError extends Error {
  constructor(
    readonly code: "CURRICULUM_CROSSWALK_SOURCE_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "CurriculumCrosswalkReportError";
  }
}

function mismatch(message: string): never {
  throw new CurriculumCrosswalkReportError(
    "CURRICULUM_CROSSWALK_SOURCE_MISMATCH",
    message,
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function localizedValue(
  value: CurriculumLocalizedValuesV2,
  locale: string,
): string {
  return (
    value.valuesByLocale[locale] ??
    value.valuesByLocale.en ??
    Object.values(value.valuesByLocale)[0] ??
    ""
  );
}

function overlayLabels(
  overlay: CurriculumCrosswalkOverlayV2,
): AssignmentCurriculumOverlayV2["labelsByLocale"] {
  return Object.fromEntries(
    overlay.supportedLocales.map((locale) => [
      locale,
      {
        title: localizedValue(overlay.title, locale),
        ownerDisplayName: localizedValue(
          overlay.owner.displayName,
          locale,
        ),
        externalFrameworkTitle: localizedValue(
          overlay.externalFramework.title,
          locale,
        ),
        outcomeTitles: Object.fromEntries(
          overlay.externalFramework.outcomes.map((outcome) => [
            outcome.outcomeId,
            localizedValue(outcome.title, locale),
          ]),
        ),
      },
    ]),
  );
}

function outcomeIndicatorIds(
  overlay: CurriculumCrosswalkOverlayV2,
  outcomeId: string,
  targetedIndicatorIds: ReadonlySet<string>,
): readonly string[] {
  return [
    ...new Set(
      overlay.mappings.flatMap((mapping) =>
        mapping.outcomeIds.includes(outcomeId) &&
        targetedIndicatorIds.has(mapping.indicatorId)
          ? [mapping.indicatorId]
          : [],
      ),
    ),
  ].sort(compareText);
}

function evidenceLinks(
  indicators: readonly LearnerCompetencyIndicatorV1[],
  evidenceRuleVersions: ReadonlyMap<string, string>,
): readonly CurriculumEvidenceObservationLinkV2[] {
  const byObservation = new Map<
    string,
    CurriculumEvidenceObservationLinkV2
  >();
  for (const indicator of indicators) {
    for (const observation of indicator.observations) {
      const key =
        `${observation.runId}\u0000${observation.competencyEvidenceId}`;
      const existing = byObservation.get(key);
      const evidenceRuleVersion = evidenceRuleVersions.get(
        observation.evidenceRuleId,
      );
      if (evidenceRuleVersion === undefined) {
        return mismatch(
          `Evidence observation ${observation.competencyEvidenceId} references unknown rule ${observation.evidenceRuleId}.`,
        );
      }
      if (existing === undefined) {
        byObservation.set(key, {
          ...observation,
          evidenceRuleVersion,
          mappedIndicatorIds: [indicator.indicatorId],
        });
        continue;
      }
      byObservation.set(key, {
        ...existing,
        mappedIndicatorIds: [
          ...new Set([
            ...existing.mappedIndicatorIds,
            indicator.indicatorId,
          ]),
        ].sort(compareText),
      });
    }
  }
  return [...byObservation.values()].sort(
    (left, right) =>
      compareText(left.observedAt, right.observedAt) ||
      compareText(left.runId, right.runId) ||
      compareText(
        left.competencyEvidenceId,
        right.competencyEvidenceId,
      ),
  );
}

function ratingLinks(
  indicators: readonly LearnerCompetencyIndicatorV1[],
): readonly LearnerCompetencyRatingV1[] {
  const ratings = new Map<string, LearnerCompetencyRatingV1>();
  for (const indicator of indicators) {
    for (const rating of indicator.currentRatings) {
      ratings.set(`${rating.runId}\u0000${rating.ratingId}`, rating);
    }
  }
  return [...ratings.values()].sort(
    (left, right) =>
      compareText(left.ratedAt, right.ratedAt) ||
      compareText(left.runId, right.runId) ||
      compareText(left.ratingId, right.ratingId),
  );
}

function learnerOutcome(
  outcomeId: string,
  mappedIndicatorIds: readonly string[],
  indicators: readonly LearnerCompetencyIndicatorV1[],
  evidenceRuleVersions: ReadonlyMap<string, string>,
): LearnerCurriculumOutcomeEvidenceV2 {
  const mapped = indicators.filter((indicator) =>
    mappedIndicatorIds.includes(indicator.indicatorId),
  );
  const evidenceObservations = evidenceLinks(
    mapped,
    evidenceRuleVersions,
  );
  const currentRatings = ratingLinks(mapped);
  return {
    outcomeId,
    mappedIndicatorIds,
    evidenceObservationCount: evidenceObservations.length,
    currentRatingCount: currentRatings.length,
    evidenceObservations,
    currentRatings,
  };
}

function mappedByAlignment(
  overlay: CurriculumCrosswalkOverlayV2,
  outcomeId: string,
  mappedIndicatorIds: readonly string[],
  alignment: "PRIMARY" | "SUPPORTING" | "CONTEXTUAL",
): readonly string[] {
  return [
    ...new Set(
      overlay.mappings.flatMap((mapping) =>
        mapping.alignment === alignment &&
        mapping.outcomeIds.includes(outcomeId) &&
        mappedIndicatorIds.includes(mapping.indicatorId)
          ? [mapping.indicatorId]
          : [],
      ),
    ),
  ].sort(compareText);
}

function projectOverlay(
  overlay: CurriculumCrosswalkOverlayV2,
  report: HostedAssignmentCompetencyReportV1,
  evidenceRuleVersions: ReadonlyMap<string, string>,
): AssignmentCurriculumOverlayV2 {
  if (
    overlay.status !== "ADOPTED" ||
    overlay.adoptedAt === undefined ||
    overlay.adoptedBy === undefined
  ) {
    return mismatch(
      `Overlay ${overlay.overlayId} has not been explicitly adopted.`,
    );
  }
  const classIndicatorById = new Map(
    report.classIndicators.map((indicator) => [
      indicator.indicatorId,
      indicator,
    ]),
  );
  const targetedIndicatorIds = new Set(classIndicatorById.keys());
  const learners = report.learners.map((learner) => ({
    learnerUserId: learner.learnerUserId,
    outcomes: overlay.externalFramework.outcomes.map((outcome) => {
      const mappedIndicatorIds = outcomeIndicatorIds(
        overlay,
        outcome.outcomeId,
        targetedIndicatorIds,
      );
      return learnerOutcome(
        outcome.outcomeId,
        mappedIndicatorIds,
        learner.indicators,
        evidenceRuleVersions,
      );
    }),
  }));

  return {
    overlayId: overlay.overlayId,
    overlayVersion: overlay.version,
    status: overlay.status,
    owner: overlay.owner,
    educationalDemoOnly: overlay.educationalDemoOnly,
    effectiveFrom: overlay.effectiveFrom,
    adoptedAt: overlay.adoptedAt,
    adoptedBy: overlay.adoptedBy,
    traceChainFrameworks: overlay.traceChainFrameworks,
    externalFrameworkId: overlay.externalFramework.frameworkId,
    externalFrameworkVersion: overlay.externalFramework.version,
    labelsByLocale: overlayLabels(overlay),
    learners,
    classOutcomes: overlay.externalFramework.outcomes.map((outcome) => {
      const mappedIndicatorIds = outcomeIndicatorIds(
        overlay,
        outcome.outcomeId,
        targetedIndicatorIds,
      );
      const targetTypes = [
        ...new Set(
          mappedIndicatorIds.flatMap((indicatorId) => {
            const indicator = classIndicatorById.get(indicatorId);
            return indicator === undefined
              ? []
              : [indicator.targetType];
          }),
        ),
      ].sort(compareText);
      const learnerOutcomes = learners.map((learner) => {
        const found = learner.outcomes.find(
          (candidate) => candidate.outcomeId === outcome.outcomeId,
        );
        if (found === undefined) {
          return mismatch(
            `Learner ${learner.learnerUserId} omitted outcome ${outcome.outcomeId}.`,
          );
        }
        return found;
      });
      return {
        outcomeId: outcome.outcomeId,
        outcomeType: outcome.outcomeType,
        mappedIndicatorIds,
        primaryIndicatorIds: mappedByAlignment(
          overlay,
          outcome.outcomeId,
          mappedIndicatorIds,
          "PRIMARY",
        ),
        supportingIndicatorIds: mappedByAlignment(
          overlay,
          outcome.outcomeId,
          mappedIndicatorIds,
          "SUPPORTING",
        ),
        contextualIndicatorIds: mappedByAlignment(
          overlay,
          outcome.outcomeId,
          mappedIndicatorIds,
          "CONTEXTUAL",
        ),
        targetTypes,
        assignedLearnerCount: learners.length,
        learnersWithEvidence: learnerOutcomes.filter(
          (learner) => learner.evidenceObservationCount > 0,
        ).length,
        evidenceObservationCount: learnerOutcomes.reduce(
          (total, learner) =>
            total + learner.evidenceObservationCount,
          0,
        ),
        currentRatingCount: learnerOutcomes.reduce(
          (total, learner) => total + learner.currentRatingCount,
          0,
        ),
      };
    }),
  };
}

export function createAssignmentCurriculumCrosswalkReport(options: {
  readonly pack: ScenarioPackV1;
  readonly overlays: readonly CurriculumCrosswalkOverlayV2[];
  readonly competencyReport: HostedAssignmentCompetencyReportV1;
}): AssignmentCurriculumOverlayReportV2 {
  const { pack, competencyReport } = options;
  if (
    pack.packId !== competencyReport.packId ||
    pack.version !== competencyReport.packVersion
  ) {
    mismatch("Curriculum overlay pack does not match the competency report.");
  }
  if (
    !pack.scenarios.some(
      (scenario) =>
        scenario.scenarioId === competencyReport.scenarioId &&
        scenario.version === competencyReport.scenarioVersion,
    )
  ) {
    mismatch(
      "Curriculum overlay scenario does not match the competency report.",
    );
  }
  const evidenceRuleVersions = new Map(
    pack.evidenceRules.map((rule) => [
      rule.evidenceRuleId,
      rule.version,
    ]),
  );

  return {
    schemaVersion: "2.0.0",
    interpretation:
      "EVIDENCE_CROSSWALK_NO_ATTAINMENT_INFERENCE",
    assignmentId: competencyReport.assignmentId,
    packId: competencyReport.packId,
    packVersion: competencyReport.packVersion,
    scenarioId: competencyReport.scenarioId,
    scenarioVersion: competencyReport.scenarioVersion,
    competencyFrameworks: competencyReport.frameworks,
    competencyIndicators: competencyReport.classIndicators.map(
      ({
        frameworkId,
        frameworkVersion,
        competencyId,
        competencyVersion,
        competencyTitleKey,
        indicatorId,
        indicatorVersion,
        indicatorStatementKey,
        targetType,
      }) => ({
        frameworkId,
        frameworkVersion,
        competencyId,
        competencyVersion,
        competencyTitleKey,
        indicatorId,
        indicatorVersion,
        indicatorStatementKey,
        targetType,
      }),
    ),
    overlays: adoptedCurriculumOverlaysForPack(
      options.overlays,
      pack,
    ).map((overlay) =>
      projectOverlay(
        overlay,
        competencyReport,
        evidenceRuleVersions,
      ),
    ),
  };
}

export function serializeAssignmentCurriculumCrosswalkReportJson(
  report: AssignmentCurriculumOverlayReportV2,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function assignmentCurriculumCrosswalkFilename(
  assignmentId: string,
): string {
  const safeAssignmentId = assignmentId.replaceAll(
    /[^A-Za-z0-9._-]/gu,
    "_",
  );
  return `TraceChain_${safeAssignmentId}_curriculum_overlay_v2.json`;
}
