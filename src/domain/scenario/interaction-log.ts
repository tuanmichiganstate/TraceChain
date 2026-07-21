/**
 * The learner interaction record (specification section 29).
 *
 * Deliberately separate from the technical diagnostic log. This one is about
 * what the learner *did*; that one is about what the software did.
 *
 * HOW THIS RELATES TO THE SCORE
 * -----------------------------
 * The chain is:
 *
 *     interactions  ->  decisions  ->  score
 *
 * Interactions are the full record, kept in memory for the final report.
 * Decisions are the compressed projection -- option chosen, attempts taken --
 * and are the only part persisted, because the SCORM budget is 4096 characters
 * and a full interaction log would not come close to fitting.
 *
 * The score is computed from decisions, never from a running total. So a
 * learner who resumes gets the identical score they left with, and section
 * 19.3's reproducibility requirement holds across a save and reload rather than
 * only within one session. A test asserts exactly that round trip.
 */

import { LearnerInteractionType, type LearnerInteraction } from "../types/scoring";
import type { ScenarioStageId } from "../types/enums";
import type { DecisionRecord } from "../../infrastructure/persistence/state-codec";

export interface RecordInteractionInput {
  readonly stageId: ScenarioStageId;
  readonly interactionType: LearnerInteractionType;
  /** The decision identifier this interaction concerns. */
  readonly targetId: string;
  readonly selectedValue?: string;
  readonly isCorrect?: boolean;
  readonly scenarioTimestamp: string;
}

/**
 * Append an interaction, numbering the attempt from how many times this target
 * has already been touched.
 */
export function appendInteraction(
  log: readonly LearnerInteraction[],
  input: RecordInteractionInput,
): readonly LearnerInteraction[] {
  const priorAttempts = log.filter(
    (entry) =>
      entry.targetId === input.targetId &&
      entry.interactionType === input.interactionType,
  ).length;

  const interaction: LearnerInteraction = {
    interactionId: `INT_${String(log.length + 1).padStart(4, "0")}`,
    stageId: input.stageId,
    interactionType: input.interactionType,
    targetId: input.targetId,
    attemptNumber: priorAttempts + 1,
    scenarioTimestamp: input.scenarioTimestamp,
    ...(input.selectedValue === undefined ? {} : { selectedValue: input.selectedValue }),
    ...(input.isCorrect === undefined ? {} : { isCorrect: input.isCorrect }),
  };

  return [...log, interaction];
}

/** Interaction types that represent an assessed decision. */
const SCORING_TYPES: readonly LearnerInteractionType[] = [
  LearnerInteractionType.KNOWLEDGE_CHECK_ANSWERED,
  LearnerInteractionType.TRANSACTION_SUBMITTED,
  LearnerInteractionType.TRANSACTION_REJECTED,
  LearnerInteractionType.RECALL_SELECTION_SUBMITTED,
  LearnerInteractionType.TAMPER_DEMONSTRATION_RUN,
];

/**
 * Compress the log into the persisted decision form.
 *
 * The recorded value is the learner's *latest* answer, and the attempt count is
 * how many times they tried. A learner who gets it wrong then right keeps the
 * right answer and the attempt count that costs them credit -- which is exactly
 * the deduction ladder's input.
 */
export function deriveDecisions(
  log: readonly LearnerInteraction[],
): Record<string, DecisionRecord> {
  const decisions: Record<string, DecisionRecord> = {};

  for (const entry of log) {
    if (!SCORING_TYPES.includes(entry.interactionType)) continue;

    const encodedValue = Number(entry.selectedValue ?? "0");
    const existing = decisions[entry.targetId];

    decisions[entry.targetId] = {
      encodedValue: Number.isFinite(encodedValue) ? encodedValue : 0,
      attemptCount: (existing?.attemptCount ?? 0) + 1,
    };
  }

  return decisions;
}

/**
 * Whether each decision ended correctly.
 *
 * The *last* attempt decides. A learner who fixes their mistake has got it
 * right; the cost of having been wrong is carried by the attempt count, not by
 * marking them permanently incorrect.
 */
export function deriveCorrectness(
  log: readonly LearnerInteraction[],
): Record<string, boolean> {
  const correctness: Record<string, boolean> = {};

  for (const entry of log) {
    if (entry.isCorrect === undefined) continue;
    correctness[entry.targetId] = entry.isCorrect;
  }

  return correctness;
}

export function interactionsForStage(
  log: readonly LearnerInteraction[],
  stageId: ScenarioStageId,
): readonly LearnerInteraction[] {
  return log.filter((entry) => entry.stageId === stageId);
}

export function countByType(
  log: readonly LearnerInteraction[],
  interactionType: LearnerInteractionType,
): number {
  return log.filter((entry) => entry.interactionType === interactionType).length;
}

export { LearnerInteractionType };
export type { LearnerInteraction };
