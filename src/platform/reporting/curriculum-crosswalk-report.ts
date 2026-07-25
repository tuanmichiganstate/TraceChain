import type {
  AssignmentCurriculumCrosswalkReportV1,
  AssignmentCurriculumCrosswalkV1,
  CurriculumCrosswalkV1,
  LearnerCurriculumOutcomeEvidenceV1,
} from "../contracts/curriculum-crosswalk";
import type {
  HostedAssignmentCompetencyReportV1,
  LearnerCompetencyIndicatorV1,
} from "../contracts/competency-report";
import type {
  ScenarioPackV1,
} from "../contracts/scenario-pack";

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

function crosswalkLabels(
  crosswalk: CurriculumCrosswalkV1,
  supportedLocales: readonly string[],
  applicationCatalogs: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >,
  packCatalogs: Readonly<
    Record<string, Readonly<Record<string, string>>>
  > | undefined,
): AssignmentCurriculumCrosswalkV1["labelsByLocale"] {
  return Object.fromEntries(
    supportedLocales.map((locale) => {
      const catalog = {
        ...(applicationCatalogs[locale] ?? {}),
        ...(packCatalogs?.[locale] ?? {}),
      };
      return [
        locale,
        {
          title:
            catalog[crosswalk.title.localizationKey] ??
            crosswalk.title.localizationKey,
          externalFrameworkTitle:
            catalog[
              crosswalk.externalFramework.title.localizationKey
            ] ??
            crosswalk.externalFramework.title.localizationKey,
          outcomeTitles: Object.fromEntries(
            crosswalk.externalFramework.outcomes.map((outcome) => [
              outcome.outcomeId,
              catalog[outcome.title.localizationKey] ??
                outcome.title.localizationKey,
            ]),
          ),
        },
      ];
    }),
  );
}

function uniqueObservationCount(
  indicators: readonly LearnerCompetencyIndicatorV1[],
): number {
  return new Set(
    indicators.flatMap((indicator) =>
      indicator.observations.map(
        (observation) =>
          `${observation.runId}\u0000${observation.competencyEvidenceId}`,
      ),
    ),
  ).size;
}

function uniqueRatingCount(
  indicators: readonly LearnerCompetencyIndicatorV1[],
): number {
  return new Set(
    indicators.flatMap((indicator) =>
      indicator.currentRatings.map(
        (rating) => `${rating.runId}\u0000${rating.ratingId}`,
      ),
    ),
  ).size;
}

function outcomeIndicatorIds(
  crosswalk: CurriculumCrosswalkV1,
  outcomeId: string,
  targetedIndicatorIds: ReadonlySet<string>,
): readonly string[] {
  return crosswalk.mappings
    .filter(
      (mapping) =>
        mapping.outcomeIds.includes(outcomeId) &&
        targetedIndicatorIds.has(mapping.indicatorId),
    )
    .map((mapping) => mapping.indicatorId)
    .sort(compareText);
}

function learnerOutcome(
  outcomeId: string,
  mappedIndicatorIds: readonly string[],
  indicators: readonly LearnerCompetencyIndicatorV1[],
): LearnerCurriculumOutcomeEvidenceV1 {
  const mapped = indicators.filter((indicator) =>
    mappedIndicatorIds.includes(indicator.indicatorId),
  );
  return {
    outcomeId,
    mappedIndicatorIds,
    evidenceObservationCount: uniqueObservationCount(mapped),
    currentRatingCount: uniqueRatingCount(mapped),
  };
}

function projectCrosswalk(
  crosswalk: CurriculumCrosswalkV1,
  report: HostedAssignmentCompetencyReportV1,
  pack: ScenarioPackV1,
  localizationCatalogs: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >,
): AssignmentCurriculumCrosswalkV1 {
  const classIndicatorById = new Map(
    report.classIndicators.map((indicator) => [
      indicator.indicatorId,
      indicator,
    ]),
  );
  const targetedIndicatorIds = new Set(classIndicatorById.keys());
  const learners = report.learners.map((learner) => ({
    learnerUserId: learner.learnerUserId,
    outcomes: crosswalk.externalFramework.outcomes.map((outcome) => {
      const mappedIndicatorIds = outcomeIndicatorIds(
        crosswalk,
        outcome.outcomeId,
        targetedIndicatorIds,
      );
      return learnerOutcome(
        outcome.outcomeId,
        mappedIndicatorIds,
        learner.indicators,
      );
    }),
  }));

  return {
    crosswalkId: crosswalk.crosswalkId,
    crosswalkVersion: crosswalk.version,
    effectiveFrom: crosswalk.effectiveFrom,
    titleKey: crosswalk.title.localizationKey,
    externalFrameworkId: crosswalk.externalFramework.frameworkId,
    externalFrameworkVersion: crosswalk.externalFramework.version,
    externalFrameworkTitleKey:
      crosswalk.externalFramework.title.localizationKey,
    labelsByLocale: crosswalkLabels(
      crosswalk,
      pack.supportedLocales,
      localizationCatalogs,
      pack.localizationCatalogs,
    ),
    learners,
    classOutcomes: crosswalk.externalFramework.outcomes.map(
      (outcome) => {
        const mappedIndicatorIds = outcomeIndicatorIds(
          crosswalk,
          outcome.outcomeId,
          targetedIndicatorIds,
        );
        const primaryIndicatorIds = crosswalk.mappings
          .filter(
            (mapping) =>
              mapping.alignment === "PRIMARY" &&
              mapping.outcomeIds.includes(outcome.outcomeId) &&
              mappedIndicatorIds.includes(mapping.indicatorId),
          )
          .map((mapping) => mapping.indicatorId)
          .sort(compareText);
        const supportingIndicatorIds = crosswalk.mappings
          .filter(
            (mapping) =>
              mapping.alignment === "SUPPORTING" &&
              mapping.outcomeIds.includes(outcome.outcomeId) &&
              mappedIndicatorIds.includes(mapping.indicatorId),
          )
          .map((mapping) => mapping.indicatorId)
          .sort(compareText);
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
          const learnerOutcomeValue = learner.outcomes.find(
            (candidate) => candidate.outcomeId === outcome.outcomeId,
          );
          if (learnerOutcomeValue === undefined) {
            return mismatch(
              `Learner ${learner.learnerUserId} omitted outcome ${outcome.outcomeId}.`,
            );
          }
          return learnerOutcomeValue;
        });
        return {
          outcomeId: outcome.outcomeId,
          outcomeType: outcome.outcomeType,
          outcomeTitleKey: outcome.title.localizationKey,
          mappedIndicatorIds,
          primaryIndicatorIds,
          supportingIndicatorIds,
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
      },
    ),
  };
}

export function createAssignmentCurriculumCrosswalkReport(options: {
  readonly pack: ScenarioPackV1;
  readonly competencyReport: HostedAssignmentCompetencyReportV1;
  readonly localizationCatalogs?: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
}): AssignmentCurriculumCrosswalkReportV1 {
  const { pack, competencyReport } = options;
  if (
    pack.packId !== competencyReport.packId ||
    pack.version !== competencyReport.packVersion
  ) {
    mismatch("Crosswalk pack does not match the competency report.");
  }
  if (
    !pack.scenarios.some(
      (scenario) =>
        scenario.scenarioId === competencyReport.scenarioId &&
        scenario.version === competencyReport.scenarioVersion,
    )
  ) {
    mismatch("Crosswalk scenario does not match the competency report.");
  }

  return {
    schemaVersion: "1.1.0",
    interpretation:
      "EVIDENCE_CROSSWALK_NO_ATTAINMENT_INFERENCE",
    assignmentId: competencyReport.assignmentId,
    packId: competencyReport.packId,
    packVersion: competencyReport.packVersion,
    scenarioId: competencyReport.scenarioId,
    scenarioVersion: competencyReport.scenarioVersion,
    crosswalks: pack.curriculumCrosswalks
      .map((crosswalk) =>
        projectCrosswalk(
          crosswalk,
          competencyReport,
          pack,
          options.localizationCatalogs ?? {},
        ),
      )
      .sort((left, right) =>
        compareText(left.crosswalkId, right.crosswalkId),
      ),
  };
}

export function serializeAssignmentCurriculumCrosswalkReportJson(
  report: AssignmentCurriculumCrosswalkReportV1,
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
  return `TraceChain_${safeAssignmentId}_curriculum_crosswalk_v1.json`;
}
