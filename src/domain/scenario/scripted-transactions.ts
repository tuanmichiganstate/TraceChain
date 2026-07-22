/** Deterministic, idempotent scenario-authored transactions. */

import { ScenarioConfigurationError } from "../errors";
import type { DomainState } from "../ledger/domain-state";
import { SimulatedLedger } from "../ledger/ledger-engine";
import { subjectAssetId } from "../commands/command-targets";
import { TransactionStatus } from "../types/enums";
import type { ScriptedTransactionDefinition } from "../types/scenario";
import type { ValidationRegistries } from "../rules/types";

function triggerSatisfied(
  state: DomainState,
  script: ScriptedTransactionDefinition,
): boolean {
  return state.transactionOrder.some((transactionId) => {
    const transaction = state.transactionsById[transactionId];
    return (
      transaction?.transactionStatus === TransactionStatus.COMMITTED &&
      transaction.transactionType === script.trigger.transactionType &&
      subjectAssetId(transaction.commandPayload as Parameters<typeof subjectAssetId>[0]) ===
        script.trigger.assetId
    );
  });
}

function alreadyApplied(
  state: DomainState,
  script: ScriptedTransactionDefinition,
): boolean {
  switch (script.idempotencyGuard.kind) {
    case "DOCUMENT_ANCHOR_ABSENT":
      return (
        state.documentAnchorsById[script.idempotencyGuard.documentAnchorId] !== undefined
      );
  }
}

export interface ScriptApplicationResult {
  readonly state: DomainState;
  readonly executedScriptIds: readonly string[];
  readonly transactionIds: readonly string[];
}

/**
 * Apply every newly eligible script in declaration order. Each accepted script
 * is sealed immediately, making it committed evidence before later commands.
 */
export function applyEligibleScriptedTransactions(
  initialState: DomainState,
  scripts: readonly ScriptedTransactionDefinition[],
  ledger: SimulatedLedger,
  registries: ValidationRegistries,
): ScriptApplicationResult {
  let state = initialState;
  const executedScriptIds: string[] = [];
  const transactionIds: string[] = [];

  for (const script of scripts) {
    if (alreadyApplied(state, script) || !triggerSatisfied(state, script)) continue;

    const result = ledger.submitCommand(
      state,
      script.command,
      { actorId: script.actorId, organizationId: script.organizationId },
      registries,
    );
    if (!result.isAccepted) {
      const failures = result.validation.failures.map((failure) => failure.ruleId).join(", ");
      throw new ScenarioConfigurationError(
        `Scripted transaction "${script.scriptId}" was rejected: ${failures}`,
      );
    }

    state = ledger.sealPendingTransactions(result.state, script.command.scenarioTimestamp);
    executedScriptIds.push(script.scriptId);
    transactionIds.push(result.transaction.transactionId);
  }

  return { state, executedScriptIds, transactionIds };
}
