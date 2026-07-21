/**
 * Scoring and completion (specification sections 19 and 19.6).
 *
 * The score is never stored as an authority. It is recomputed from the
 * interaction record on every load, which is what makes "the final score must
 * be reproducible from the interaction log" (section 19.3) true rather than
 * aspirational -- and it is why the compact state codec persists decisions
 * instead of points.
 */

import type { ScenarioStageId } from "./enums";

/** The six assessed dimensions, summing to 100 points (section 19.2). */
export enum ScoreComponent {
  TRANSACTION_ACCURACY = "TRANSACTION_ACCURACY",
  TRACEABILITY_COMPLETENESS = "TRACEABILITY_COMPLETENESS",
  DATA_GOVERNANCE = "DATA_GOVERNANCE",
  COMPLIANCE_AND_CORRECTION = "COMPLIANCE_AND_CORRECTION",
  RECALL_PERFORMANCE = "RECALL_PERFORMANCE",
  CONCEPTUAL_UNDERSTANDING = "CONCEPTUAL_UNDERSTANDING",
}

export interface ScoreState {
  readonly transactionAccuracy: number;
  readonly traceabilityCompleteness: number;
  readonly dataGovernance: number;
  readonly complianceAndCorrection: number;
  readonly recallPerformance: number;
  readonly conceptualUnderstanding: number;
  readonly totalScore: number;
  readonly maxScore: number;
  readonly hintsUsed: number;
  readonly invalidAttempts: number;
}

export interface CompletionState {
  readonly isCompleted: boolean;
  readonly isPassed: boolean;
  readonly completedAt: string | null;
  readonly finalScore: number | null;
}

/**
 * The deduction ladder (section 19.4). Exploration is meant to be safe: one
 * wrong answer must not make a good score unreachable, and a required
 * procedural action the learner eventually completes never drops below
 * `minimumProceduralCredit`.
 */
export interface ScoringConfiguration {
  readonly maxScore: number;
  readonly passingScore: number;
  /** Points available per component. Must sum to `maxScore`. */
  readonly componentPoints: Readonly<Record<ScoreComponent, number>>;
  readonly firstAttemptCredit: number;
  readonly secondAttemptCredit: number;
  readonly afterHintCredit: number;
  readonly multipleAttemptCredit: number;
  readonly minimumProceduralCredit: number;
  /** Cap on total points lost to repeated invalid attempts (section 19.3). */
  readonly maxInvalidAttemptPenalty: number;
}

export function createEmptyScoreState(configuration: ScoringConfiguration): ScoreState {
  return {
    transactionAccuracy: 0,
    traceabilityCompleteness: 0,
    dataGovernance: 0,
    complianceAndCorrection: 0,
    recallPerformance: 0,
    conceptualUnderstanding: 0,
    totalScore: 0,
    maxScore: configuration.maxScore,
    hintsUsed: 0,
    invalidAttempts: 0,
  };
}

export function createInitialCompletionState(): CompletionState {
  return { isCompleted: false, isPassed: false, completedAt: null, finalScore: null };
}

/** What the learner did, separate from technical logs (section 29). */
export enum LearnerInteractionType {
  KNOWLEDGE_CHECK_ANSWERED = "KNOWLEDGE_CHECK_ANSWERED",
  TRANSACTION_SUBMITTED = "TRANSACTION_SUBMITTED",
  TRANSACTION_REJECTED = "TRANSACTION_REJECTED",
  HINT_USED = "HINT_USED",
  STAGE_COMPLETED = "STAGE_COMPLETED",
  TAMPER_DEMONSTRATION_RUN = "TAMPER_DEMONSTRATION_RUN",
  RECALL_SELECTION_SUBMITTED = "RECALL_SELECTION_SUBMITTED",
}

export interface LearnerInteraction {
  readonly interactionId: string;
  readonly stageId: ScenarioStageId;
  readonly interactionType: LearnerInteractionType;
  readonly targetId: string;
  readonly selectedValue?: string;
  readonly isCorrect?: boolean;
  readonly attemptNumber: number;
  readonly scenarioTimestamp: string;
}

/** Technical diagnostics, never persisted to suspend data (section 29). */
export interface DiagnosticLogEntry {
  readonly timestamp: string;
  readonly level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  readonly category: string;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>>;
}
