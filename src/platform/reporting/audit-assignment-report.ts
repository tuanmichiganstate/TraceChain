import type {
  AuditLearnerProjectionV1,
  AuditVariantBankDefinitionV1,
} from "../contracts/audit";
import type {
  HostedAssignmentReportV1,
  HostedAssignmentRunSummary,
  ManualRubricRatingV1,
} from "../contracts/assessment";
import type { InstructorTimelineItem } from "../hosted/stage3-types";
import {
  createVariantCalibrationReport,
  type VariantCalibrationObservationV1,
  type VariantCalibrationReportV1,
} from "./variant-calibration";

export type AuditFindingReviewClassificationV1 =
  | "CONFIRMED"
  | "LEGITIMATE_EXCEPTION"
  | "UNSUPPORTED"
  | "PENDING"
  | "WITHDRAWN";

export interface AuditFindingReplayRowV1 {
  readonly findingId: string;
  readonly revision: number;
  readonly title: string;
  readonly severity: string;
  readonly materiality: string;
  readonly evidenceIds: readonly string[];
  readonly policyIds: readonly string[];
  readonly classification: AuditFindingReviewClassificationV1;
  readonly eventId: string;
  readonly sequenceNumber: number;
  readonly eventType: string;
}

export interface AuditAssignmentRunReportV1 {
  readonly runId: string;
  readonly learnerUserId: string;
  readonly auditCaseId: string;
  readonly auditCaseVersion: string;
  readonly sourceStateHash: string;
  readonly status: "active" | "completed";
  readonly elapsedSeconds: number;
  readonly score: number | null;
  readonly maximumScore: number;
  readonly passed: boolean | null;
  readonly confirmedFindingCount: number;
  readonly unsupportedFindingCount: number;
  readonly missedFindingCount: number;
  readonly evidenceCitationCount: number;
  readonly policyCitationCount: number;
  readonly findings: readonly AuditFindingReplayRowV1[];
  readonly variant: {
    readonly variantId: string;
    readonly variantVersion: string;
    readonly variantContentHash: string;
    readonly caseReference: string;
  } | null;
}

export interface AuditAssignmentReportV1 {
  readonly schemaVersion: "1.0.0";
  readonly reportType: "TRACECHAIN_AUDIT_ASSIGNMENT_REPORT";
  readonly assignmentId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly reviewOnly: true;
  readonly officialScoresUnchanged: true;
  readonly runs: readonly AuditAssignmentRunReportV1[];
  readonly summary: {
    readonly runCount: number;
    readonly completedRunCount: number;
    readonly meanCompletedScore: number | null;
    readonly confirmedFindingCount: number;
    readonly unsupportedFindingCount: number;
    readonly missedFindingCount: number;
  };
  readonly variantDistribution: readonly {
    readonly variantId: string;
    readonly variantVersion: string;
    readonly caseReference: string;
    readonly runCount: number;
    readonly completedRunCount: number;
  }[];
  readonly calibration: VariantCalibrationReportV1 | null;
}

export interface AuditAssignmentRunSourceV1 {
  readonly summary: HostedAssignmentRunSummary;
  readonly projection: AuditLearnerProjectionV1;
  readonly timeline: readonly InstructorTimelineItem[];
}

interface VariantIdentity {
  readonly variantId: string;
  readonly variantVersion: string;
  readonly variantContentHash: string;
  readonly caseReference: string;
}

function isRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function findingEvent(
  timeline: readonly InstructorTimelineItem[],
  findingId: string,
): InstructorTimelineItem | null {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const event = timeline[index]!;
    if (
      event.eventType !== "AUDIT_FINDING_SUBMITTED" &&
      event.eventType !== "AUDIT_FINDING_AMENDED" &&
      event.eventType !== "AUDIT_FINDING_WITHDRAWN"
    ) {
      continue;
    }
    const submitted = isRecord(event.payload.finding)
      ? event.payload.finding
      : null;
    if (
      submitted?.findingId === findingId ||
      event.payload.findingId === findingId
    ) {
      return event;
    }
  }
  return null;
}

function classificationFor(
  projection: AuditLearnerProjectionV1,
  finding: AuditLearnerProjectionV1["findings"][number],
): AuditFindingReviewClassificationV1 {
  if (finding.status === "WITHDRAWN") return "WITHDRAWN";
  if (projection.report?.confirmedFindingIds.includes(finding.findingId)) {
    return "CONFIRMED";
  }
  if (
    projection.report?.unsupportedFindingIds.includes(
      finding.findingId,
    )
  ) {
    return "UNSUPPORTED";
  }
  return finding.feedback?.classification ?? "PENDING";
}

function replayRows(
  projection: AuditLearnerProjectionV1,
  timeline: readonly InstructorTimelineItem[],
): readonly AuditFindingReplayRowV1[] {
  return projection.findings.map((finding) => {
    const event = findingEvent(timeline, finding.findingId);
    if (event === null) {
      throw new Error(
        `Audit finding ${finding.findingId} has no replayable source event.`,
      );
    }
    return {
      findingId: finding.findingId,
      revision: finding.revision,
      title: finding.title,
      severity: finding.severity,
      materiality: finding.materiality,
      evidenceIds: [...finding.evidenceIds],
      policyIds: [...finding.policyIds],
      classification: classificationFor(projection, finding),
      eventId: event.eventId,
      sequenceNumber: event.sequenceNumber,
      eventType: event.eventType,
    };
  });
}

function variantFor(
  projection: AuditLearnerProjectionV1,
  bank: AuditVariantBankDefinitionV1 | undefined,
): VariantIdentity | null {
  if (projection.variantAssignment !== undefined) {
    const assignment = projection.variantAssignment;
    if (
      bank !== undefined &&
      (assignment.bankId !== bank.bankId ||
        assignment.bankVersion !== bank.bankVersion)
    ) {
      throw new Error(
        "Audit run variant identity does not match the assignment bank.",
      );
    }
    return {
      variantId: assignment.variantId,
      variantVersion: assignment.variantVersion,
      variantContentHash: assignment.variantContentHash,
      caseReference: assignment.caseReference,
    };
  }
  const variant = bank?.variants.find(
    (candidate) =>
      candidate.auditCaseId === projection.auditCaseId &&
      candidate.auditCaseVersion === projection.auditCaseVersion,
  );
  return variant === undefined
    ? null
    : {
        variantId: variant.variantId,
        variantVersion: variant.variantVersion,
        variantContentHash: variant.contentHash,
        caseReference: variant.caseReference,
      };
}

function currentRubricRatings(
  ratings: readonly ManualRubricRatingV1[],
): VariantCalibrationObservationV1["rubricRatings"] {
  const current = new Map<string, ManualRubricRatingV1>();
  for (const rating of ratings) {
    const key = `${rating.rubricId}:${rating.criterionId}`;
    const previous = current.get(key);
    if (
      previous === undefined ||
      rating.revision > previous.revision ||
      (rating.revision === previous.revision &&
        rating.ratedAt > previous.ratedAt)
    ) {
      current.set(key, rating);
    }
  }
  return [...current.values()]
    .sort(
      (left, right) =>
        left.rubricId.localeCompare(right.rubricId) ||
        left.criterionId.localeCompare(right.criterionId),
    )
    .map((rating) => ({
      rubricCriterionId:
        `${rating.rubricId}:${rating.criterionId}`,
      rating: rating.levelValue,
    }));
}

function calibrationObservation(
  source: AuditAssignmentRunSourceV1,
  variant: VariantIdentity | null,
): VariantCalibrationObservationV1 | null {
  const report = source.projection.report;
  if (report === undefined || variant === null) return null;
  return {
    runId: source.summary.runId,
    ...variant,
    score: report.score,
    maximumScore: report.maximumScore,
    passed: report.passed,
    completionSeconds: source.summary.elapsedSeconds,
    itemScores: report.scoreLines.map((line) => ({
      scorableItemId: line.scorableItemId,
      earnedScore: line.score,
      maximumScore: line.maximumScore,
    })),
    evidenceIdsUsed: [
      ...new Set(
        source.projection.findings.flatMap(
          (finding) => finding.evidenceIds,
        ),
      ),
    ],
    hintIdsUsed: source.projection.hints
      .filter((hint) => hint.viewed)
      .map((hint) => hint.hintId),
    mitigationCount: source.timeline.filter(
      (event) =>
        event.eventType === "AUDIT_FINDING_AMENDED" ||
        event.eventType === "AUDIT_FINDING_WITHDRAWN",
    ).length,
    falsePositiveCount: report.unsupportedFindingIds.length,
    missedFindingCount: report.missedFindingDefinitionIds.length,
    rubricRatings: currentRubricRatings(source.summary.ratings),
  };
}

function roundedMean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return (
    Math.round(
      (values.reduce((total, value) => total + value, 0) /
        values.length) *
        100,
    ) / 100
  );
}

export function createAuditAssignmentReport(options: {
  readonly assignmentReport: HostedAssignmentReportV1;
  readonly runs: readonly AuditAssignmentRunSourceV1[];
  readonly bank?: AuditVariantBankDefinitionV1;
}): AuditAssignmentReportV1 {
  const expectedRunIds = new Set(
    options.assignmentReport.learners.flatMap((learner) =>
      learner.runs.map((run) => run.runId),
    ),
  );
  if (
    options.runs.length !== expectedRunIds.size ||
    options.runs.some(
      (source) =>
        !expectedRunIds.has(source.summary.runId) ||
        source.summary.learnerUserId.trim().length === 0,
    )
  ) {
    throw new Error(
      "Audit assignment reporting requires exactly one projection for every assignment run.",
    );
  }

  const variantsByRun = new Map<string, VariantIdentity | null>();
  const runs = options.runs.map((source) => {
    const projection = source.projection;
    const report = projection.report;
    const findings = replayRows(projection, source.timeline);
    const variant = variantFor(projection, options.bank);
    variantsByRun.set(source.summary.runId, variant);
    return {
      runId: source.summary.runId,
      learnerUserId: source.summary.learnerUserId,
      auditCaseId: projection.auditCaseId,
      auditCaseVersion: projection.auditCaseVersion,
      sourceStateHash: projection.sourceStateHash,
      status: source.summary.status,
      elapsedSeconds: source.summary.elapsedSeconds,
      score: report?.score ?? null,
      maximumScore:
        report?.maximumScore ?? 100,
      passed: report?.passed ?? null,
      confirmedFindingCount:
        report?.confirmedFindingIds.length ?? 0,
      unsupportedFindingCount:
        report?.unsupportedFindingIds.length ?? 0,
      missedFindingCount:
        report?.missedFindingDefinitionIds.length ?? 0,
      evidenceCitationCount: new Set(
        projection.findings.flatMap(
          (finding) => finding.evidenceIds,
        ),
      ).size,
      policyCitationCount: new Set(
        projection.findings.flatMap(
          (finding) => finding.policyIds,
        ),
      ).size,
      findings,
      variant,
    } satisfies AuditAssignmentRunReportV1;
  });
  const observations = options.runs.flatMap((source) => {
    const observation = calibrationObservation(
      source,
      variantsByRun.get(source.summary.runId) ?? null,
    );
    return observation === null ? [] : [observation];
  });
  const completedScores = runs.flatMap((run) =>
    run.score === null ? [] : [run.score],
  );
  const variantDistribution =
    options.bank?.variants.map((variant) => {
      const matching = runs.filter(
        (run) => run.variant?.variantId === variant.variantId,
      );
      return {
        variantId: variant.variantId,
        variantVersion: variant.variantVersion,
        caseReference: variant.caseReference,
        runCount: matching.length,
        completedRunCount: matching.filter(
          (run) => run.status === "completed",
        ).length,
      };
    }) ?? [];
  const assignment = options.assignmentReport.assignment;
  return {
    schemaVersion: "1.0.0",
    reportType: "TRACECHAIN_AUDIT_ASSIGNMENT_REPORT",
    assignmentId: assignment.assignmentId,
    packId: assignment.packId,
    packVersion: assignment.packVersion,
    scenarioId: assignment.scenarioId,
    scenarioVersion: assignment.scenarioVersion,
    reviewOnly: true,
    officialScoresUnchanged: true,
    runs,
    summary: {
      runCount: runs.length,
      completedRunCount: runs.filter(
        (run) => run.status === "completed",
      ).length,
      meanCompletedScore: roundedMean(completedScores),
      confirmedFindingCount: runs.reduce(
        (total, run) => total + run.confirmedFindingCount,
        0,
      ),
      unsupportedFindingCount: runs.reduce(
        (total, run) => total + run.unsupportedFindingCount,
        0,
      ),
      missedFindingCount: runs.reduce(
        (total, run) => total + run.missedFindingCount,
        0,
      ),
    },
    variantDistribution,
    calibration:
      options.bank === undefined
        ? null
        : createVariantCalibrationReport({
            bank: {
              bankId: options.bank.bankId,
              bankVersion: options.bank.bankVersion,
              bankStatus: options.bank.status,
              variants: options.bank.variants.map((variant) => ({
                variantId: variant.variantId,
                variantVersion: variant.variantVersion,
                variantContentHash: variant.contentHash,
                caseReference: variant.caseReference,
              })),
            },
            observations,
          }),
  };
}
