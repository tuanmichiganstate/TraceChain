import type { HostedAssignmentReportV1 } from "../contracts/assessment";
import type {
  CompetencyIndicatorReferenceV1,
  HostedAssignmentCompetencyReportV1,
  LearnerCompetencyIndicatorV1,
  LearnerCompetencyObservationV1,
  LearnerCompetencyRatingV1,
} from "../contracts/competency-report";
import type {
  RubricCriterionV1,
  RubricDefinitionV1,
} from "../contracts/rubric";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import type { CompetencyEvidenceProjection } from "../hosted/stage3-types";

export class AssignmentCompetencyReportError extends Error {
  constructor(
    readonly code: "COMPETENCY_REPORT_SOURCE_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "AssignmentCompetencyReportError";
  }
}

export interface RunCompetencyEvidenceInput {
  readonly runId: string;
  readonly indicators: readonly CompetencyEvidenceProjection[];
}

export interface CreateAssignmentCompetencyReportInput {
  readonly assignmentReport: HostedAssignmentReportV1;
  readonly pack: ScenarioPackV1;
  readonly evidenceByRun: readonly RunCompetencyEvidenceInput[];
}

interface RubricCriterionReference {
  readonly rubric: RubricDefinitionV1;
  readonly criterion: RubricCriterionV1;
}

function mismatch(message: string): never {
  throw new AssignmentCompetencyReportError(
    "COMPETENCY_REPORT_SOURCE_MISMATCH",
    message,
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function indicatorReferences(
  input: CreateAssignmentCompetencyReportInput,
): readonly CompetencyIndicatorReferenceV1[] {
  const assignment = input.assignmentReport.assignment;
  if (
    input.pack.packId !== assignment.packId ||
    input.pack.version !== assignment.packVersion
  ) {
    mismatch("Competency report pack does not match the assignment version.");
  }
  const scenario = input.pack.scenarios.find(
    (candidate) =>
      candidate.scenarioId === assignment.scenarioId &&
      candidate.version === assignment.scenarioVersion,
  );
  if (scenario === undefined) {
    mismatch("Competency report scenario does not match the assignment.");
  }
  return scenario.competencyTargets
    .flatMap((target) =>
      target.indicatorIds.map((indicatorId) => {
        const matches = input.pack.competencyFrameworks.flatMap(
          (framework) =>
            framework.competencies.flatMap((competency) => {
              if (competency.competencyId !== target.competencyId) {
                return [];
              }
              const indicator = competency.indicators.find(
                (candidate) => candidate.indicatorId === indicatorId,
              );
              return indicator === undefined
                ? []
                : [
                    {
                      frameworkId: framework.frameworkId,
                      frameworkVersion: framework.version,
                      competencyId: competency.competencyId,
                      competencyVersion: competency.version,
                      competencyTitleKey:
                        competency.title.localizationKey,
                      indicatorId: indicator.indicatorId,
                      indicatorVersion: indicator.version,
                      indicatorStatementKey:
                        indicator.statement.localizationKey,
                      targetType: target.targetType,
                    } satisfies CompetencyIndicatorReferenceV1,
                  ];
            }),
        );
        if (matches.length !== 1) {
          return mismatch(
            `Scenario target ${indicatorId} must resolve to one versioned indicator.`,
          );
        }
        const match = matches[0];
        if (match === undefined) {
          return mismatch(
            `Scenario target ${indicatorId} did not resolve to an indicator.`,
          );
        }
        return match;
      }),
    )
    .sort((left, right) =>
      compareText(left.indicatorId, right.indicatorId),
    );
}

function rubricCriteria(
  pack: ScenarioPackV1,
  rubricIds: readonly string[],
): ReadonlyMap<string, RubricCriterionReference> {
  const result = new Map<string, RubricCriterionReference>();
  for (const rubricId of rubricIds) {
    const rubric = pack.rubrics.find(
      (candidate) => candidate.rubricId === rubricId,
    );
    if (rubric === undefined) {
      mismatch(`Scenario rubric ${rubricId} is missing.`);
    }
    for (const criterion of rubric.criteria) {
      const key = `${rubric.rubricId}\u0000${criterion.criterionId}`;
      if (result.has(key)) {
        mismatch(`Rubric criterion ${criterion.criterionId} is ambiguous.`);
      }
      result.set(key, { rubric, criterion });
    }
  }
  return result;
}

function ratingProjection(
  rating: HostedAssignmentReportV1["learners"][number]["runs"][number]["ratings"][number],
): LearnerCompetencyRatingV1 {
  return {
    runId: rating.runId,
    ratingId: rating.ratingId,
    rubricId: rating.rubricId,
    rubricVersion: rating.rubricVersion,
    criterionId: rating.criterionId,
    levelValue: rating.levelValue,
    comment: rating.comment,
    linkedEvidenceIds: rating.linkedEvidenceIds,
    revision: rating.revision,
    raterUserId: rating.raterUserId,
    ratedAt: rating.ratedAt,
  };
}

export function createAssignmentCompetencyReport(
  input: CreateAssignmentCompetencyReportInput,
): HostedAssignmentCompetencyReportV1 {
  const assignment = input.assignmentReport.assignment;
  const scenario = input.pack.scenarios.find(
    (candidate) =>
      candidate.scenarioId === assignment.scenarioId &&
      candidate.version === assignment.scenarioVersion,
  );
  if (scenario === undefined) {
    mismatch("Assignment scenario is absent from its exact pack version.");
  }
  const references = indicatorReferences(input);
  const referenceById = new Map(
    references.map((reference) => [reference.indicatorId, reference]),
  );
  if (referenceById.size !== references.length) {
    mismatch("Scenario competency targets contain duplicate indicators.");
  }
  const runs = input.assignmentReport.learners.flatMap(
    (learner) => learner.runs,
  );
  const runById = new Map(runs.map((run) => [run.runId, run]));
  const evidenceByRun = new Map(
    input.evidenceByRun.map((entry) => [entry.runId, entry]),
  );
  if (
    runById.size !== runs.length ||
    evidenceByRun.size !== input.evidenceByRun.length
  ) {
    mismatch("Competency report contains a duplicate run identifier.");
  }
  for (const runId of evidenceByRun.keys()) {
    if (!runById.has(runId)) {
      mismatch(`Competency evidence belongs to unknown run ${runId}.`);
    }
  }
  const criteria = rubricCriteria(input.pack, scenario.rubricIds);

  const learners = input.assignmentReport.learners.map((learner) => {
    const learnerRunIds = new Set(
      learner.runs.map((run) => run.runId),
    );
    const indicators: LearnerCompetencyIndicatorV1[] =
      references.map((reference) => {
        const observationsById = new Map<
          string,
          LearnerCompetencyObservationV1
        >();
        for (const runId of learnerRunIds) {
          const evidence = evidenceByRun.get(runId);
          const projection = evidence?.indicators.find(
            (candidate) =>
              candidate.indicatorId === reference.indicatorId,
          );
          for (const observed of projection?.evidence ?? []) {
            if (
              !observed.indicatorIds.includes(reference.indicatorId)
            ) {
              mismatch(
                `Evidence ${observed.competencyEvidenceId} omits its projected indicator.`,
              );
            }
            const key = `${runId}\u0000${observed.competencyEvidenceId}`;
            observationsById.set(key, {
              runId,
              competencyEvidenceId:
                observed.competencyEvidenceId,
              evidenceRuleId: observed.evidenceRuleId,
              sourceEventIds: observed.sourceEventIds,
              observedAt: observed.observedAt,
            });
          }
        }
        const observations = [...observationsById.values()].sort(
          (left, right) =>
            compareText(left.observedAt, right.observedAt) ||
            compareText(
              left.competencyEvidenceId,
              right.competencyEvidenceId,
            ),
        );
        const currentRatings = learner.runs
          .flatMap((run) => run.ratings)
          .filter((rating) => {
            if (
              rating.assignmentId !== assignment.assignmentId ||
              !learnerRunIds.has(rating.runId)
            ) {
              mismatch(
                `Rating ${rating.ratingId} is outside its learner run.`,
              );
            }
            const criterion = criteria.get(
              `${rating.rubricId}\u0000${rating.criterionId}`,
            );
            if (
              criterion === undefined ||
              criterion.rubric.version !== rating.rubricVersion
            ) {
              mismatch(
                `Rating ${rating.ratingId} uses an unknown rubric version.`,
              );
            }
            return criterion.criterion.indicatorIds.includes(
              reference.indicatorId,
            );
          })
          .map(ratingProjection)
          .sort(
            (left, right) =>
              compareText(left.runId, right.runId) ||
              compareText(left.rubricId, right.rubricId) ||
              compareText(left.criterionId, right.criterionId),
          );
        const latest = observations.at(-1)?.observedAt;
        return {
          ...reference,
          evidenceCount: observations.length,
          ...(latest === undefined
            ? {}
            : { latestObservedAt: latest }),
          observations,
          currentRatings,
        };
      });
    return {
      learnerUserId: learner.learnerUserId,
      indicators,
    };
  });

  return {
    schemaVersion: "1.0.0",
    interpretation: "EVIDENCE_ONLY_NO_COMPETENCE_INFERENCE",
    assignmentId: assignment.assignmentId,
    packId: assignment.packId,
    packVersion: assignment.packVersion,
    scenarioId: assignment.scenarioId,
    scenarioVersion: assignment.scenarioVersion,
    frameworks: [
      ...new Map(
        references.map((reference) => [
          `${reference.frameworkId}\u0000${reference.frameworkVersion}`,
          {
            frameworkId: reference.frameworkId,
            frameworkVersion: reference.frameworkVersion,
          },
        ]),
      ).values(),
    ],
    learners,
    classIndicators: references.map((reference) => {
      const learnerIndicators = learners.map((learner) => {
        const indicator = learner.indicators.find(
          (candidate) =>
            candidate.indicatorId === reference.indicatorId,
        );
        if (indicator === undefined) {
          return mismatch(
            `Learner report omitted indicator ${reference.indicatorId}.`,
          );
        }
        return indicator;
      });
      const ratingCounts = new Map<number, number>();
      for (const indicator of learnerIndicators) {
        for (const rating of indicator.currentRatings) {
          ratingCounts.set(
            rating.levelValue,
            (ratingCounts.get(rating.levelValue) ?? 0) + 1,
          );
        }
      }
      return {
        ...reference,
        assignedLearnerCount: learners.length,
        learnersWithEvidence: learnerIndicators.filter(
          (indicator) => indicator.evidenceCount > 0,
        ).length,
        evidenceCount: learnerIndicators.reduce(
          (total, indicator) => total + indicator.evidenceCount,
          0,
        ),
        currentRatingCount: learnerIndicators.reduce(
          (total, indicator) =>
            total + indicator.currentRatings.length,
          0,
        ),
        ratingDistribution: [...ratingCounts.entries()]
          .sort(([left], [right]) => left - right)
          .map(([levelValue, count]) => ({ levelValue, count })),
      };
    }),
  };
}
