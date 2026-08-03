import type {
  HostedAssignmentReportV1,
} from "../platform/contracts/assessment";
import type {
  LearnerRunProjectionV1,
} from "../platform/contracts/run-events";
import type {
  InstructorTimelineItem,
} from "../platform/hosted/stage3-types";
import type {
  FirstTechnicalLabModuleId,
} from "./contracts";

export interface TechnicalLabModuleRunReportV1 {
  readonly moduleId: FirstTechnicalLabModuleId;
  readonly moduleVersion: string;
  readonly complete: boolean;
  readonly experimentComplete: boolean;
  readonly score: number;
  readonly maximumScore: number;
  readonly interpretationAttempts: number;
  readonly interpretationCorrect: boolean;
  readonly applicationAttempts: number;
  readonly applicationCorrect: boolean;
  readonly hintOpened: boolean;
  readonly observedVerificationFailureCount: number;
  readonly elapsedSeconds: number;
}

export interface TechnicalLabMisconceptionV1 {
  readonly itemId: string;
  readonly selectedOptionId: string;
  readonly count: number;
}

export interface TechnicalLabRunReportV1 {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly learnerUserId: string;
  readonly status: "active" | "completed";
  readonly labPackId: string;
  readonly labPackVersion: string;
  readonly configurationHash: string;
  readonly currentModuleId: FirstTechnicalLabModuleId;
  readonly completedModuleCount: number;
  readonly totalModuleCount: number;
  readonly score: {
    readonly experimentScore: number;
    readonly interpretationScore: number;
    readonly applicationScore: number;
    readonly totalScore: number;
    readonly maximumScore: 100;
    readonly passScore: number;
    readonly passed: boolean;
  };
  readonly hintUseCount: number;
  readonly incorrectResponseCount: number;
  readonly observedVerificationFailureCount: number;
  readonly modules: readonly TechnicalLabModuleRunReportV1[];
  readonly misconceptions: readonly TechnicalLabMisconceptionV1[];
}

export interface TechnicalLabAssignmentReportV1 {
  readonly schemaVersion: "1.0.0";
  readonly reportType:
    "SIMULEDGER_TECHNICAL_LAB_ASSIGNMENT_REPORT";
  readonly assignmentId: string;
  readonly labPackId: string;
  readonly labPackVersion: string;
  readonly generatedAt: string;
  readonly summary: {
    readonly assignedLearnerCount: number;
    readonly runCount: number;
    readonly completedRunCount: number;
    readonly meanCompletedScore: number | null;
    readonly hintUseCount: number;
    readonly incorrectResponseCount: number;
    readonly observedVerificationFailureCount: number;
  };
  readonly scoreDistribution: readonly {
    readonly minimumInclusive: number;
    readonly maximumInclusive: number;
    readonly completedRunCount: number;
  }[];
  readonly commonMisconceptions:
    readonly TechnicalLabMisconceptionV1[];
  readonly runs: readonly TechnicalLabRunReportV1[];
}

function requiredTechnicalLabProjection(
  projection: LearnerRunProjectionV1,
) {
  if (projection.technicalLab === undefined) {
    throw new Error(
      "A Technical Laboratory report requires a laboratory projection.",
    );
  }
  return projection.technicalLab;
}

function moduleElapsedSeconds(
  timeline: readonly InstructorTimelineItem[],
  moduleIndex: number,
): number {
  const timestamps = timeline
    .filter(
      (event) =>
        event.payload.moduleIndex === moduleIndex ||
        (moduleIndex === 0 && event.eventType === "RUN_CREATED"),
    )
    .map((event) => Date.parse(event.occurredAt))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const first = timestamps[0];
  const last = timestamps.at(-1);
  if (first === undefined || last === undefined) return 0;
  return Math.max(0, Math.floor((last - first) / 1_000));
}

export function createTechnicalLabRunReport(options: {
  readonly learnerUserId: string;
  readonly status: "active" | "completed";
  readonly projection: LearnerRunProjectionV1;
  readonly timeline: readonly InstructorTimelineItem[];
}): TechnicalLabRunReportV1 {
  const technicalLab = requiredTechnicalLabProjection(
    options.projection,
  );
  const replay = technicalLab.replay;
  const misconceptions = new Map<string, TechnicalLabMisconceptionV1>();
  for (const entry of replay.snapshot.responseJournal) {
    const module = replay.modules[entry.moduleIndex]?.module;
    if (module === undefined) continue;
    const definition =
      entry.kind === "INTERPRETATION"
        ? module.interpretationItem
        : module.applicationItem;
    const selectedOptionId =
      definition.options[entry.optionIndex]?.optionId;
    if (
      selectedOptionId === undefined ||
      selectedOptionId === definition.correctOptionId
    ) {
      continue;
    }
    const key = `${definition.itemId}\u0000${selectedOptionId}`;
    const prior = misconceptions.get(key);
    misconceptions.set(key, {
      itemId: definition.itemId,
      selectedOptionId,
      count: (prior?.count ?? 0) + 1,
    });
  }
  const modules = replay.modules.map<TechnicalLabModuleRunReportV1>(
    (module, moduleIndex) => ({
      moduleId: module.module.moduleId,
      moduleVersion: module.module.moduleVersion,
      complete: module.complete,
      experimentComplete: module.experimentComplete,
      score: module.score,
      maximumScore: module.maximumScore,
      interpretationAttempts: module.interpretation.attempts,
      interpretationCorrect: module.interpretation.correct,
      applicationAttempts: module.application.attempts,
      applicationCorrect: module.application.correct,
      hintOpened: module.hintOpened,
      observedVerificationFailureCount:
        module.evidence?.fields.filter(
          (field) =>
            field.status === "FAIL" &&
            field.revealAfterActionCount <=
              module.experimentActionCount,
        ).length ?? 0,
      elapsedSeconds: moduleElapsedSeconds(
        options.timeline,
        moduleIndex,
      ),
    }),
  );
  return {
    schemaVersion: "1.0.0",
    runId: options.projection.runId,
    learnerUserId: options.learnerUserId,
    status: options.status,
    labPackId: technicalLab.labPackId,
    labPackVersion: technicalLab.labPackVersion,
    configurationHash: technicalLab.configurationHash,
    currentModuleId:
      replay.modules[replay.snapshot.currentModuleIndex]!.module
        .moduleId,
    completedModuleCount: modules.filter((module) => module.complete)
      .length,
    totalModuleCount: modules.length,
    score: replay.score,
    hintUseCount: replay.snapshot.hintModuleIndexes.length,
    incorrectResponseCount: [...misconceptions.values()].reduce(
      (total, misconception) => total + misconception.count,
      0,
    ),
    observedVerificationFailureCount: modules.reduce(
      (total, module) =>
        total + module.observedVerificationFailureCount,
      0,
    ),
    modules,
    misconceptions: [...misconceptions.values()].sort(
      (left, right) =>
        `${left.itemId}\u0000${left.selectedOptionId}`.localeCompare(
          `${right.itemId}\u0000${right.selectedOptionId}`,
        ),
    ),
  };
}

const SCORE_RANGES = [
  [0, 59],
  [60, 69],
  [70, 79],
  [80, 89],
  [90, 100],
] as const;

export function createTechnicalLabAssignmentReport(options: {
  readonly assignmentReport: HostedAssignmentReportV1;
  readonly runs: readonly TechnicalLabRunReportV1[];
  readonly generatedAt: string;
}): TechnicalLabAssignmentReportV1 {
  const completed = options.runs.filter(
    (run) => run.status === "completed",
  );
  const misconceptionCounts = new Map<
    string,
    TechnicalLabMisconceptionV1
  >();
  for (const run of options.runs) {
    for (const misconception of run.misconceptions) {
      const key =
        `${misconception.itemId}\u0000` +
        misconception.selectedOptionId;
      const prior = misconceptionCounts.get(key);
      misconceptionCounts.set(key, {
        ...misconception,
        count: (prior?.count ?? 0) + misconception.count,
      });
    }
  }
  return {
    schemaVersion: "1.0.0",
    reportType: "SIMULEDGER_TECHNICAL_LAB_ASSIGNMENT_REPORT",
    assignmentId:
      options.assignmentReport.assignment.assignmentId,
    labPackId:
      options.assignmentReport.assignment.packId,
    labPackVersion:
      options.assignmentReport.assignment.packVersion,
    generatedAt: options.generatedAt,
    summary: {
      assignedLearnerCount:
        options.assignmentReport.learners.length,
      runCount: options.runs.length,
      completedRunCount: completed.length,
      meanCompletedScore:
        completed.length === 0
          ? null
          : completed.reduce(
              (total, run) => total + run.score.totalScore,
              0,
            ) / completed.length,
      hintUseCount: options.runs.reduce(
        (total, run) => total + run.hintUseCount,
        0,
      ),
      incorrectResponseCount: options.runs.reduce(
        (total, run) => total + run.incorrectResponseCount,
        0,
      ),
      observedVerificationFailureCount: options.runs.reduce(
        (total, run) =>
          total + run.observedVerificationFailureCount,
        0,
      ),
    },
    scoreDistribution: SCORE_RANGES.map(
      ([minimumInclusive, maximumInclusive]) => ({
        minimumInclusive,
        maximumInclusive,
        completedRunCount: completed.filter(
          (run) =>
            run.score.totalScore >= minimumInclusive &&
            run.score.totalScore <= maximumInclusive,
        ).length,
      }),
    ),
    commonMisconceptions: [...misconceptionCounts.values()].sort(
      (left, right) =>
        right.count - left.count ||
        `${left.itemId}\u0000${left.selectedOptionId}`.localeCompare(
          `${right.itemId}\u0000${right.selectedOptionId}`,
        ),
    ),
    runs: [...options.runs].sort((left, right) =>
      `${left.learnerUserId}\u0000${left.runId}`.localeCompare(
        `${right.learnerUserId}\u0000${right.runId}`,
      ),
    ),
  };
}
