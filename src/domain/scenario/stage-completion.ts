/**
 * Evaluating stage completion (specification section 17.2).
 *
 * Stages advance because their declared conditions are satisfied against real
 * world state -- not because a component decided to call `completeStage`. That
 * matters for resume: a learner returning mid-attempt has their ledger replayed,
 * and stage progression falls out of the same evaluation rather than needing a
 * parallel record of "which screens did I click through".
 */

import { TransactionStatus } from "../types/enums";
import type { DomainState } from "../ledger/domain-state";
import type {
  RequiredScenarioAction,
  ScenarioDefinition,
  ScenarioStageDefinition,
  StageCompletionCondition,
} from "../types/scenario";
import type { SupplyChainCommand } from "../commands/commands";
import type { DecisionRecord } from "../../infrastructure/persistence/state-codec";
import type { ScenarioStageId } from "../types/enums";

export interface CompletionContext {
  readonly state: DomainState;
  readonly decisions: Readonly<Record<string, DecisionRecord>>;
}

export interface ConditionOutcome {
  readonly condition: StageCompletionCondition;
  readonly isSatisfied: boolean;
  /** Developer-facing explanation, for the diagnostics panel. */
  readonly detail: string;
}

export interface StageCompletionResult {
  readonly stageId: ScenarioStageId;
  readonly isComplete: boolean;
  readonly outcomes: readonly ConditionOutcome[];
  readonly unsatisfiedCount: number;
}

function hasCommittedTransactionOfType(state: DomainState, transactionType: string): boolean {
  return Object.values(state.transactionsById).some(
    (transaction) =>
      transaction.transactionType === transactionType &&
      // ORDERED counts: the outcome is determined and world state already
      // reflects it. Requiring COMMITTED would stall a stage behind its own
      // block-sealing step, which is a presentation concern.
      transaction.transactionStatus !== TransactionStatus.REJECTED,
  );
}

export function evaluateCondition(
  condition: StageCompletionCondition,
  context: CompletionContext,
): ConditionOutcome {
  switch (condition.conditionType) {
    case "TRANSACTION_COMMITTED": {
      const isSatisfied = hasCommittedTransactionOfType(
        context.state,
        condition.transactionType,
      );
      return {
        condition,
        isSatisfied,
        detail: `${condition.transactionType} ${isSatisfied ? "committed" : "not yet committed"}`,
      };
    }

    case "KNOWLEDGE_CHECK_ANSWERED": {
      const record = context.decisions[condition.knowledgeCheckId];
      const isSatisfied = (record?.attemptCount ?? 0) > 0;
      return {
        condition,
        isSatisfied,
        detail: `${condition.knowledgeCheckId} ${isSatisfied ? "answered" : "unanswered"}`,
      };
    }

    case "DECISION_RECORDED": {
      const record = context.decisions[condition.decisionId];
      const isSatisfied = (record?.attemptCount ?? 0) > 0;
      return {
        condition,
        isSatisfied,
        detail: `${condition.decisionId} ${isSatisfied ? "recorded" : "not recorded"}`,
      };
    }

    case "ASSET_EXISTS": {
      const isSatisfied = context.state.assetsById[condition.assetId] !== undefined;
      return {
        condition,
        isSatisfied,
        detail: `${condition.assetId} ${isSatisfied ? "exists" : "does not exist"}`,
      };
    }

    default: {
      const unhandled: never = condition;
      return unhandled;
    }
  }
}

export function evaluateStageCompletion(
  stage: ScenarioStageDefinition,
  context: CompletionContext,
): StageCompletionResult {
  const outcomes = stage.completionConditions.map((condition) =>
    evaluateCondition(condition, context),
  );
  const unsatisfiedCount = outcomes.filter((outcome) => !outcome.isSatisfied).length;

  return {
    stageId: stage.stageId,
    isComplete: unsatisfiedCount === 0,
    outcomes,
    unsatisfiedCount,
  };
}

export interface RequiredActionOutcome {
  readonly action: RequiredScenarioAction;
  readonly isSatisfied: boolean;
}

/**
 * Whether each of a stage's listed steps has been done.
 *
 * The outstanding-work panel lists required actions, but completion is governed
 * by the stage's conditions, and the two are not the same set: stage 2 lists one
 * action against two conditions, so summarising the conditions produced "2 items
 * remaining" above a single line. A learner cannot act on a count whose items
 * are invisible, so the panel reports the state of each step it actually shows
 * and leaves overall completion to `evaluateStageCompletion`.
 *
 * Every required action names either the transaction that discharges it or the
 * knowledge check that does, and the scenario validator holds it to exactly one
 * of the two -- so this is total, never a guess.
 */
export function evaluateRequiredActions(
  stage: ScenarioStageDefinition,
  context: CompletionContext,
): readonly RequiredActionOutcome[] {
  return stage.requiredActions.map((action) => ({
    action,
    isSatisfied:
      action.transactionType !== undefined
        ? hasCommittedTransactionOfType(context.state, action.transactionType)
        : action.knowledgeCheckId !== undefined
          ? (context.decisions[action.knowledgeCheckId]?.attemptCount ?? 0) > 0
          : false,
  }));
}

/**
 * Which stages are complete, in scenario order.
 *
 * Used on resume to rebuild progress from replayed state, rather than trusting
 * a separately-stored list that could disagree with the ledger.
 */
export function completedStages(
  scenario: ScenarioDefinition,
  context: CompletionContext,
): readonly ScenarioStageId[] {
  return scenario.stages
    .filter((stage) => evaluateStageCompletion(stage, context).isComplete)
    .map((stage) => stage.stageId);
}

/** The first stage that is not yet complete: where the learner should be. */
export function currentStage(
  scenario: ScenarioDefinition,
  context: CompletionContext,
): ScenarioStageId {
  const incomplete = scenario.stages.find(
    (stage) => !evaluateStageCompletion(stage, context).isComplete,
  );
  // Every stage complete means the activity is finished; stay on the last one.
  return (
    incomplete?.stageId ??
    (scenario.stages[scenario.stages.length - 1]?.stageId as ScenarioStageId)
  );
}

/** Which transaction types a stage still needs, for the instruction panel. */
export function outstandingTransactionTypes(
  stage: ScenarioStageDefinition,
  context: CompletionContext,
): readonly string[] {
  return stage.completionConditions
    .filter(
      (condition) =>
        condition.conditionType === "TRANSACTION_COMMITTED" &&
        !evaluateCondition(condition, context).isSatisfied,
    )
    .map((condition) =>
      condition.conditionType === "TRANSACTION_COMMITTED" ? condition.transactionType : "",
    );
}

export type { SupplyChainCommand };
