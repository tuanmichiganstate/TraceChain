/** Reusable primitives for executable cross-layer scenario contracts. */

import type { CommandContext, SupplyChainCommand } from "../commands/commands";
import type { DomainState } from "../ledger/domain-state";
import { SimulatedLedger } from "../ledger/ledger-engine";
import type { ValidationRegistries } from "../rules/types";
import { applyEligibleScriptedTransactions } from "./scripted-transactions";
import type { ScenarioDefinition, StageCompletionCondition } from "../types/scenario";
import type { LedgerTransaction } from "../types/models";
import { TransactionStatus, type TransactionType } from "../types/enums";

export interface ScenarioContractCheck {
  readonly checkId: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface ScenarioContractValidationResult {
  readonly isValid: boolean;
  readonly checkedCount: number;
  readonly checks: readonly ScenarioContractCheck[];
  readonly failures: readonly ScenarioContractCheck[];
}

export class ContractCheckRecorder {
  private readonly recorded: ScenarioContractCheck[] = [];

  check(checkId: string, passed: boolean, detail = ""): void {
    this.recorded.push({ checkId, passed, detail });
  }

  result(): ScenarioContractValidationResult {
    const failures = this.recorded.filter((check) => !check.passed);
    return {
      isValid: failures.length === 0,
      checkedCount: this.recorded.length,
      checks: this.recorded,
      failures,
    };
  }
}

/** A real command pipeline driver used by contract fixtures, not a state stub. */
export class ContractLedgerDriver {
  private current: DomainState;

  constructor(
    initialState: DomainState,
    private readonly scenario: ScenarioDefinition,
    private readonly ledger: SimulatedLedger,
    private readonly registries: ValidationRegistries,
  ) {
    this.current = initialState;
  }

  state(): DomainState {
    return this.current;
  }

  submitAndCommit(
    command: SupplyChainCommand,
    context: CommandContext,
  ): LedgerTransaction {
    this.current = applyEligibleScriptedTransactions(
      this.current,
      this.scenario.scriptedTransactions,
      this.ledger,
      this.registries,
    ).state;
    const result = this.ledger.submitCommand(
      this.current,
      command,
      context,
      this.registries,
    );
    if (!result.isAccepted) {
      throw new Error(
        `Contract fixture rejected ${command.commandType}: ${result.validation.failures
          .map((failure) => failure.ruleId)
          .join(", ")}`,
      );
    }
    this.current = this.ledger.sealPendingTransactions(
      result.state,
      command.scenarioTimestamp,
    );
    this.current = applyEligibleScriptedTransactions(
      this.current,
      this.scenario.scriptedTransactions,
      this.ledger,
      this.registries,
    ).state;
    return this.current.transactionsById[result.transaction.transactionId] as LedgerTransaction;
  }

  submitRejected(
    command: SupplyChainCommand,
    context: CommandContext,
  ): LedgerTransaction {
    const result = this.ledger.submitCommand(
      this.current,
      command,
      context,
      this.registries,
    );
    if (result.isAccepted) {
      throw new Error(`Contract fixture expected ${command.commandType} to be rejected`);
    }
    this.current = result.state;
    return result.transaction;
  }
}

export function orderedTransactions(state: DomainState): readonly LedgerTransaction[] {
  return state.transactionOrder
    .map((transactionId) => state.transactionsById[transactionId])
    .filter((transaction): transaction is LedgerTransaction => transaction !== undefined);
}

export function committedTransactionsOfType(
  state: DomainState,
  transactionType: TransactionType,
): readonly LedgerTransaction[] {
  return orderedTransactions(state).filter(
    (transaction) =>
      transaction.transactionStatus === TransactionStatus.COMMITTED &&
      transaction.transactionType === transactionType,
  );
}

/**
 * The transaction projection immediately before one ledger entry. Other world
 * state projections remain unchanged; this helper is for order-sensitive
 * evidence resolvers that read `transactionOrder` and `transactionsById`.
 */
export function stateBeforeTransaction(
  state: DomainState,
  transactionId: string,
): DomainState {
  const index = state.transactionOrder.indexOf(transactionId);
  if (index < 0) throw new Error(`Transaction ${transactionId} is not in ledger order`);
  const transactionOrder = state.transactionOrder.slice(0, index);
  const transactionsById = Object.fromEntries(
    transactionOrder.map((id) => [id, state.transactionsById[id] as LedgerTransaction]),
  );
  return { ...state, transactionOrder, transactionsById };
}

export interface NamedCompletionCondition {
  readonly stageId: string;
  readonly conditionIndex: number;
  readonly condition: StageCompletionCondition;
}

export function allCompletionConditions(
  scenario: ScenarioDefinition,
): readonly NamedCompletionCondition[] {
  return scenario.stages.flatMap((stage) =>
    stage.completionConditions.map((condition, conditionIndex) => ({
      stageId: stage.stageId,
      conditionIndex,
      condition,
    })),
  );
}

/** A rejected-only state for testing transaction-backed completion safety. */
export function rejectedEvidenceState(
  base: DomainState,
  transactionType: TransactionType,
): DomainState {
  const source = orderedTransactions(base).find(
    (transaction) => transaction.transactionType === transactionType,
  );
  if (source === undefined) return { ...base, transactionOrder: [], transactionsById: {} };
  const { blockId, committedAt, ...withoutCommitEvidence } = source;
  void blockId;
  void committedAt;
  const rejected: LedgerTransaction = {
    ...withoutCommitEvidence,
    transactionStatus: TransactionStatus.REJECTED,
  };
  return {
    ...base,
    transactionOrder: [rejected.transactionId],
    transactionsById: { [rejected.transactionId]: rejected },
  };
}
