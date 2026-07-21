/**
 * Encoding a learner's answer as a single integer, and reading it back.
 *
 * WHY THIS EXISTS
 * ---------------
 * The compact state codec stores one number per decision. Everything a learner
 * chooses -- a radio option, a set of checkboxes, six items dropped into four
 * categories -- has to survive as that number, and has to be interpretable
 * again on resume.
 *
 * That last part matters more than it looks. Because the answer itself is
 * persisted, correctness is a *pure function of the answer and the scenario*.
 * Nothing about whether the learner was right needs storing, and the score can
 * be recomputed exactly after a reload with no extra state at all.
 *
 * Milestone 3 derived correctness from the in-memory interaction log, which
 * worked within a session but quietly meant a resumed attempt could not
 * reproduce its own score. This closes that.
 *
 * Ranges, against the codec's 46 655 ceiling:
 *   single choice     option index                          < 10
 *   multiple choice   bitmap over options                   < 2^10
 *   classification    base-4 digit per item, six items      < 4^6 = 4096
 */

import {
  KnowledgeCheckType,
  allKnowledgeChecks,
  allScoredActions,
  type KnowledgeCheckDefinition,
  type ScenarioDefinition,
} from "../types/scenario";
import type { DecisionRecord } from "../../infrastructure/persistence/state-codec";

/** A learner's answer, in the form the interface works with. */
export interface Answer {
  readonly selectedOptionIds: readonly string[];
  /** Item identifier to category identifier, for classification checks. */
  readonly categoryByItem: Readonly<Record<string, string>>;
}

export const EMPTY_ANSWER: Answer = { selectedOptionIds: [], categoryByItem: {} };

export function encodeAnswer(check: KnowledgeCheckDefinition, answer: Answer): number {
  switch (check.checkType) {
    case KnowledgeCheckType.SINGLE_CHOICE: {
      const index = check.options.findIndex(
        (option) => option.optionId === answer.selectedOptionIds[0],
      );
      // Shifted by one so that "unanswered" and "chose the first option" are
      // distinguishable; the codec uses attemptCount for presence, but a
      // negative index would encode as garbage.
      return index < 0 ? 0 : index + 1;
    }

    case KnowledgeCheckType.MULTIPLE_CHOICE:
      return check.options.reduce(
        (bitmap, option, index) =>
          answer.selectedOptionIds.includes(option.optionId) ? bitmap | (1 << index) : bitmap,
        0,
      );

    case KnowledgeCheckType.CLASSIFICATION: {
      const categories = check.categories ?? [];
      return check.options.reduce((packed, option, index) => {
        const chosen = answer.categoryByItem[option.optionId];
        const categoryIndex = categories.findIndex((c) => c.categoryId === chosen);
        return packed + Math.max(0, categoryIndex) * 4 ** index;
      }, 0);
    }

    default:
      return 0;
  }
}

export function decodeAnswer(check: KnowledgeCheckDefinition, encodedValue: number): Answer {
  switch (check.checkType) {
    case KnowledgeCheckType.SINGLE_CHOICE: {
      const option = check.options[encodedValue - 1];
      return option === undefined
        ? EMPTY_ANSWER
        : { selectedOptionIds: [option.optionId], categoryByItem: {} };
    }

    case KnowledgeCheckType.MULTIPLE_CHOICE:
      return {
        selectedOptionIds: check.options
          .filter((_option, index) => (encodedValue & (1 << index)) !== 0)
          .map((option) => option.optionId),
        categoryByItem: {},
      };

    case KnowledgeCheckType.CLASSIFICATION: {
      const categories = check.categories ?? [];
      const categoryByItem: Record<string, string> = {};
      check.options.forEach((option, index) => {
        const digit = Math.floor(encodedValue / 4 ** index) % 4;
        const category = categories[digit];
        if (category !== undefined) categoryByItem[option.optionId] = category.categoryId;
      });
      return { selectedOptionIds: [], categoryByItem };
    }

    default:
      return EMPTY_ANSWER;
  }
}

export function isAnswerCorrect(check: KnowledgeCheckDefinition, answer: Answer): boolean {
  if (check.checkType === KnowledgeCheckType.CLASSIFICATION) {
    // Every item must sit in the category its own definition declares.
    return check.options.every(
      (option) => answer.categoryByItem[option.optionId] === option.categoryId,
    );
  }

  const selected = new Set(answer.selectedOptionIds);
  const correct = new Set(check.correctOptionIds);
  return selected.size === correct.size && [...correct].every((id) => selected.has(id));
}

/** The answer a learner who understood everything would give. */
export function correctAnswerFor(check: KnowledgeCheckDefinition): Answer {
  if (check.checkType === KnowledgeCheckType.CLASSIFICATION) {
    return {
      selectedOptionIds: [],
      categoryByItem: Object.fromEntries(
        check.options.map((option) => [option.optionId, option.categoryId as string]),
      ),
    };
  }
  return { selectedOptionIds: check.correctOptionIds, categoryByItem: {} };
}

/** Procedural actions encode acceptance directly. */
export const ACTION_ACCEPTED = 1;
export const ACTION_REJECTED = 0;

/**
 * Correctness for every decision, derived from the persisted answers alone.
 *
 * This is what makes the score reproducible across a save and reload: nothing
 * about right or wrong is stored, only what the learner chose.
 */
export function deriveCorrectnessFromDecisions(
  decisions: Readonly<Record<string, DecisionRecord>>,
  scenario: ScenarioDefinition,
): Record<string, boolean> {
  const correctness: Record<string, boolean> = {};

  for (const check of allKnowledgeChecks(scenario)) {
    const decision = decisions[check.knowledgeCheckId];
    if (decision === undefined) continue;
    correctness[check.knowledgeCheckId] = isAnswerCorrect(
      check,
      decodeAnswer(check, decision.encodedValue),
    );
  }

  for (const action of allScoredActions(scenario)) {
    const decision = decisions[action.decisionId];
    if (decision === undefined) continue;
    correctness[action.decisionId] = decision.encodedValue === ACTION_ACCEPTED;
  }

  return correctness;
}
