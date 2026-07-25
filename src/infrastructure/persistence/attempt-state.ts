import type { ScenarioStageId } from "../../domain/types/enums";

/** Maximum value representable by the active compact TC3 decision field. */
export const MAX_DECISION_VALUE = 36 ** 3 - 1;

/** Bounded retry count used by scoring and the active TC3 journal. */
export const MAX_ATTEMPT_COUNT = 36 - 1;

export interface DecisionRecord {
  readonly encodedValue: number;
  readonly attemptCount: number;
}

/**
 * Reconstructable attempt inputs used by the headless scenario contract.
 *
 * The live SCORM player persists `Tc3AttemptSnapshot`; this smaller shape is
 * retained only as the pure replay input shared by scenario contract tests.
 */
export interface AttemptSnapshot {
  readonly currentStageId: ScenarioStageId;
  readonly completedStageIds: readonly ScenarioStageId[];
  readonly decisions: Readonly<Record<string, DecisionRecord>>;
  readonly hintsUsed: readonly string[];
  readonly isCompleted: boolean;
  readonly isPassed: boolean;
  readonly replayData?: {
    readonly correctionReason?: string;
  };
}
