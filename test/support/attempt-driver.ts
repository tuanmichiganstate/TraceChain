/**
 * Plays a complete learner attempt, headless.
 *
 * The ledger driver handles transactions; this adds the other half -- knowledge
 * check answers, hints, stage progression and scoring -- so a test can express
 * "a learner who did everything right" or "a learner who got the recall wrong"
 * as a few lines, and assert on the outcome.
 *
 * This is what makes the Milestone 3 exit condition checkable: the whole
 * scenario, all nine stages, with no interface involved.
 */

import { LearnerInteractionType } from "../../src/domain/types/scoring";
import type { LearnerInteraction } from "../../src/domain/types/scoring";
import type { ScenarioStageId } from "../../src/domain/types/enums";
import type {
  KnowledgeCheckDefinition,
  ScenarioDefinition,
} from "../../src/domain/types/scenario";
import { KnowledgeCheckType } from "../../src/domain/types/scenario";
import {
  appendInteraction,
  deriveCorrectness,
  deriveDecisions,
} from "../../src/domain/scenario/interaction-log";
import {
  calculateScore,
  isPassing,
  type ScoreBreakdown,
} from "../../src/domain/scoring/score-engine";
import {
  completedStages,
  currentStage,
  evaluateStageCompletion,
} from "../../src/domain/scenario/stage-completion";
import type { DomainState } from "../../src/domain/ledger/domain-state";
import { coffeeScenario } from "../../src/scenarios/coffee-traceability/scenario";

/**
 * Encode a knowledge check answer as the integer the state codec stores.
 *
 * Single choice is the option index. Multiple choice is a bitmap over the
 * options. Classification packs one base-4 category digit per item. All three
 * fit comfortably inside the codec's three base36 characters.
 */
export function encodeAnswer(
  check: KnowledgeCheckDefinition,
  selectedOptionIds: readonly string[],
  categoryByItem: Readonly<Record<string, string>> = {},
): number {
  switch (check.checkType) {
    case KnowledgeCheckType.SINGLE_CHOICE:
      return check.options.findIndex((option) => option.optionId === selectedOptionIds[0]);

    case KnowledgeCheckType.MULTIPLE_CHOICE:
      return check.options.reduce(
        (bitmap, option, index) =>
          selectedOptionIds.includes(option.optionId) ? bitmap | (1 << index) : bitmap,
        0,
      );

    case KnowledgeCheckType.CLASSIFICATION: {
      const categories = check.categories ?? [];
      return check.options.reduce((packed, option, index) => {
        const chosen = categoryByItem[option.optionId];
        const categoryIndex = categories.findIndex(
          (category) => category.categoryId === chosen,
        );
        return packed + Math.max(0, categoryIndex) * 4 ** index;
      }, 0);
    }

    default:
      return 0;
  }
}

export function isAnswerCorrect(
  check: KnowledgeCheckDefinition,
  selectedOptionIds: readonly string[],
  categoryByItem: Readonly<Record<string, string>> = {},
): boolean {
  if (check.checkType === KnowledgeCheckType.CLASSIFICATION) {
    // Every item must sit in the category its own definition declares.
    return check.options.every(
      (option) => categoryByItem[option.optionId] === option.categoryId,
    );
  }

  const selected = new Set(selectedOptionIds);
  const correct = new Set(check.correctOptionIds);
  return (
    selected.size === correct.size && [...correct].every((optionId) => selected.has(optionId))
  );
}

/** The answer a learner who understood everything would give. */
export function correctAnswerFor(check: KnowledgeCheckDefinition): {
  optionIds: readonly string[];
  categoryByItem: Record<string, string>;
} {
  if (check.checkType === KnowledgeCheckType.CLASSIFICATION) {
    return {
      optionIds: [],
      categoryByItem: Object.fromEntries(
        check.options.map((option) => [option.optionId, option.categoryId as string]),
      ),
    };
  }
  return { optionIds: check.correctOptionIds, categoryByItem: {} };
}

export class AttemptRecorder {
  private log: readonly LearnerInteraction[] = [];
  private hints: string[] = [];

  constructor(private readonly scenario: ScenarioDefinition = coffeeScenario) {}

  answerCheck(
    stageId: ScenarioStageId,
    check: KnowledgeCheckDefinition,
    selectedOptionIds: readonly string[],
    categoryByItem: Readonly<Record<string, string>> = {},
    scenarioTimestamp = "2026-01-01T00:00:00.000Z",
  ): this {
    this.log = appendInteraction(this.log, {
      stageId,
      interactionType: LearnerInteractionType.KNOWLEDGE_CHECK_ANSWERED,
      targetId: check.knowledgeCheckId,
      selectedValue: String(encodeAnswer(check, selectedOptionIds, categoryByItem)),
      isCorrect: isAnswerCorrect(check, selectedOptionIds, categoryByItem),
      scenarioTimestamp,
    });
    return this;
  }

  /** Record a procedural action: whether the transaction was accepted. */
  recordAction(
    stageId: ScenarioStageId,
    decisionId: string,
    wasAccepted: boolean,
    scenarioTimestamp = "2026-01-01T00:00:00.000Z",
  ): this {
    this.log = appendInteraction(this.log, {
      stageId,
      interactionType: wasAccepted
        ? LearnerInteractionType.TRANSACTION_SUBMITTED
        : LearnerInteractionType.TRANSACTION_REJECTED,
      targetId: decisionId,
      isCorrect: wasAccepted,
      scenarioTimestamp,
    });
    return this;
  }

  useHint(hintId: string): this {
    if (!this.hints.includes(hintId)) this.hints.push(hintId);
    return this;
  }

  /** Answer every knowledge check in the scenario correctly, first attempt. */
  answerEveryCheckCorrectly(): this {
    for (const stage of this.scenario.stages) {
      for (const check of stage.knowledgeChecks) {
        const answer = correctAnswerFor(check);
        this.answerCheck(stage.stageId, check, answer.optionIds, answer.categoryByItem);
      }
    }
    return this;
  }

  /**
   * Mark every procedural action and authored consequential-stage phase as
   * completed successfully.
   *
   * Phase evidence is intentionally separate from scored actions: it proves
   * that an initial decision was submitted and that its bounded mitigation was
   * completed or unnecessary.
   */
  completeEveryAction(): this {
    for (const stage of this.scenario.stages) {
      for (const action of stage.scoredActions) {
        this.recordAction(stage.stageId, action.decisionId, true);
      }
      for (const condition of stage.completionConditions) {
        if (
          condition.conditionType === "DECISION_RECORDED" &&
          !this.log.some(
            (interaction) => interaction.targetId === condition.decisionId,
          )
        ) {
          this.recordAction(stage.stageId, condition.decisionId, true);
        }
      }
    }
    return this;
  }

  get interactions(): readonly LearnerInteraction[] {
    return this.log;
  }

  get hintsUsed(): readonly string[] {
    return [...this.hints];
  }

  get decisions(): Record<string, ReturnType<typeof deriveDecisions>[string]> {
    return deriveDecisions(this.log);
  }

  score(): ScoreBreakdown {
    return calculateScore(
      {
        decisions: deriveDecisions(this.log),
        correctness: deriveCorrectness(this.log),
        hintsUsed: this.hints,
      },
      this.scenario,
    );
  }

  isPassing(): boolean {
    return isPassing(this.score().score, this.scenario.scoringConfiguration);
  }

  /** Stage progression, evaluated against real world state plus decisions. */
  progress(state: DomainState): {
    completed: readonly ScenarioStageId[];
    current: ScenarioStageId;
    isFinished: boolean;
  } {
    const context = { state, decisions: deriveDecisions(this.log) };
    const completed = completedStages(this.scenario, context);
    return {
      completed,
      current: currentStage(this.scenario, context),
      isFinished: completed.length === this.scenario.stages.length,
    };
  }

  stageStatus(state: DomainState, stageId: ScenarioStageId) {
    const stage = this.scenario.stages.find((candidate) => candidate.stageId === stageId);
    if (stage === undefined) throw new Error(`Unknown stage ${stageId}`);
    return evaluateStageCompletion(stage, {
      state,
      decisions: deriveDecisions(this.log),
    });
  }
}
