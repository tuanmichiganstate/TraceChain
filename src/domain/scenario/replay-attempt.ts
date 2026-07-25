/** Deterministic reconstruction of accepted scenario history. */

import type { AttemptSnapshot } from "../../infrastructure/persistence/attempt-state";
import type { DomainState } from "../ledger/domain-state";
import { SimulatedLedger } from "../ledger/ledger-engine";
import type { ValidationRegistries } from "../rules/types";
import { ACTION_ACCEPTED, decodeAnswer } from "./answer-codec";
import { applyEligibleScriptedTransactions } from "./scripted-transactions";
import { ScenarioConfigurationError } from "../errors";
import { ScenarioStageId, TransactionStatus, TransactionType } from "../types/enums";
import type { SupplyChainCommand } from "../commands/commands";
import type {
  AnchorDocumentCommand,
  RecallBatchCommand,
  RecordCorrectionCommand,
  TransferCustodyCommand,
} from "../commands/commands";
import type { ScenarioDefinition } from "../types/scenario";
import { commandContext, runtimeCommand } from "./runtime";

function wasAccepted(snapshot: AttemptSnapshot, decisionId: string): boolean {
  return snapshot.decisions[decisionId]?.encodedValue === ACTION_ACCEPTED;
}

function completed(snapshot: AttemptSnapshot, stageId: ScenarioStageId): boolean {
  return snapshot.completedStageIds.includes(stageId);
}

/**
 * Rejected attempts are deliberately not replayed: they never changed world
 * state. Accepted commands are rebuilt in scenario order and revalidated.
 */
export function replayScenarioAttempt(
  snapshot: AttemptSnapshot,
  initialState: DomainState,
  ledger: SimulatedLedger,
  registries: ValidationRegistries,
  scenario: ScenarioDefinition,
): DomainState {
  let state = initialState;

  const execute = (
    command: SupplyChainCommand,
    context: { readonly actorId: string; readonly organizationId: string },
  ): void => {
    state = applyEligibleScriptedTransactions(
      state,
      scenario.scriptedTransactions,
      ledger,
      registries,
    ).state;
    const result = ledger.submitCommand(state, command, context, registries);
    if (!result.isAccepted) {
      throw new ScenarioConfigurationError(
        `Attempt replay rejected ${command.commandType}: ` +
          result.validation.failures.map((failure) => failure.ruleId).join(", "),
      );
    }
    state = ledger.sealPendingTransactions(result.state, command.scenarioTimestamp);
    state = applyEligibleScriptedTransactions(
      state,
      scenario.scriptedTransactions,
      ledger,
      registries,
    ).state;
  };

  const executeRejected = (
    command: SupplyChainCommand,
    context: { readonly actorId: string; readonly organizationId: string },
  ): void => {
    const result = ledger.submitCommand(state, command, context, registries);
    if (result.isAccepted) {
      throw new ScenarioConfigurationError(
        `Attempt replay expected ${command.commandType} to be rejected`,
      );
    }
    state = result.state;
  };

  const stage2 =
    wasAccepted(snapshot, "INT_CREATE_BATCH") ||
    completed(snapshot, ScenarioStageId.CREATE_BATCH);
  if (stage2) {
    execute(runtimeCommand(scenario, "CREATE_BATCH"), commandContext(scenario, "CREATE_BATCH"));
  }

  const stage3Complete = completed(snapshot, ScenarioStageId.ANCHOR_CERTIFICATE);
  const anchorCertificate =
    wasAccepted(snapshot, "INT_CERTIFICATE_ANCHORED_TRANSACTION") || stage3Complete;
  const issueCertificate =
    wasAccepted(snapshot, "INT_CERTIFICATE_ISSUED_TRANSACTION") || stage3Complete;
  if (anchorCertificate || issueCertificate) {
    execute(
      runtimeCommand(scenario, "ANCHOR_CERTIFICATE"),
      commandContext(scenario, "ANCHOR_CERTIFICATE"),
    );
  }
  if (issueCertificate) {
    execute(
      runtimeCommand(scenario, "ISSUE_CERTIFICATE"),
      commandContext(scenario, "ISSUE_CERTIFICATE"),
    );
  }
  const suspiciousAttempts =
    snapshot.decisions["INT_SUSPICIOUS_CERTIFICATE_ATTEMPT"]?.attemptCount ?? 0;
  for (let attempt = 0; attempt < suspiciousAttempts; attempt += 1) {
    executeRejected(
      runtimeCommand<AnchorDocumentCommand>(scenario, "SUSPICIOUS_CERTIFICATE"),
      commandContext(scenario, "SUSPICIOUS_CERTIFICATE"),
    );
  }

  const stage4Complete = completed(snapshot, ScenarioStageId.SHIP_AND_MONITOR);
  const recordTransport =
    wasAccepted(snapshot, "INT_TRANSPORT_RECORDED_TRANSACTION") || stage4Complete;
  const transferCustody =
    wasAccepted(snapshot, "INT_CUSTODY_TRANSFERRED_TRANSACTION") ||
    recordTransport ||
    stage4Complete;
  const custodyRecord = snapshot.decisions["INT_CUSTODY_TRANSFERRED_TRANSACTION"];
  const rejectedCustodyAttempts = Math.max(
    0,
    (custodyRecord?.attemptCount ?? 0) - (transferCustody ? 1 : 0),
  );
  for (let attempt = 0; attempt < rejectedCustodyAttempts; attempt += 1) {
    executeRejected(
      runtimeCommand<TransferCustodyCommand>(scenario, "TRANSFER_CUSTODY", {
        alsoTransfersOwnership: true,
      }),
      commandContext(scenario, "TRANSFER_CUSTODY"),
    );
  }
  if (transferCustody) {
    execute(
      runtimeCommand<TransferCustodyCommand>(scenario, "TRANSFER_CUSTODY", {
        alsoTransfersOwnership: false,
      }),
      commandContext(scenario, "TRANSFER_CUSTODY"),
    );
  }
  if (recordTransport) {
    execute(
      runtimeCommand(scenario, "RECORD_TRANSPORT"),
      commandContext(scenario, "RECORD_TRANSPORT"),
    );
  }

  const stage5Complete = completed(snapshot, ScenarioStageId.RECEIVE_AND_CORRECT);
  const correctManifest =
    wasAccepted(snapshot, "INT_CORRECTION_RECORDED") || stage5Complete;
  const receive = wasAccepted(snapshot, "INT_RECEIVE_BATCH") || correctManifest || stage5Complete;
  const purchase =
    wasAccepted(snapshot, "INT_OWNERSHIP_PURCHASED_TRANSACTION") || stage5Complete;
  if (receive) {
    execute(runtimeCommand(scenario, "RECEIVE_BATCH"), commandContext(scenario, "RECEIVE_BATCH"));
  }
  if (purchase) {
    execute(
      runtimeCommand(scenario, "PURCHASE_ON_RECEIPT"),
      commandContext(scenario, "PURCHASE_ON_RECEIPT"),
    );
  }
  if (correctManifest) {
    const manifest = state.transactionOrder
      .map((transactionId) => state.transactionsById[transactionId])
      .find(
        (transaction) =>
          transaction?.transactionStatus === TransactionStatus.COMMITTED &&
          transaction.transactionType === TransactionType.ANCHOR_DOCUMENT &&
          (transaction.commandPayload as { documentAnchorId?: string }).documentAnchorId ===
            scenario.runtime.documentRoles.shippingManifestAnchorId,
      );
    if (manifest === undefined) {
      throw new ScenarioConfigurationError("Attempt replay could not find the shipping manifest");
    }
    execute(
      runtimeCommand<RecordCorrectionCommand>(scenario, "RECORD_CORRECTION", {
        correctionOfTransactionId: manifest.transactionId,
        reason:
          snapshot.replayData?.correctionReason ??
          runtimeCommand<RecordCorrectionCommand>(scenario, "RECORD_CORRECTION").reason,
      }),
      commandContext(scenario, "RECORD_CORRECTION"),
    );
  }

  const stage6 =
    wasAccepted(snapshot, "INT_TRANSFORM_BATCH") ||
    completed(snapshot, ScenarioStageId.TRANSFORM_BATCH);
  if (stage6) {
    execute(runtimeCommand(scenario, "TRANSFORM_BATCH"), commandContext(scenario, "TRANSFORM_BATCH"));
  }

  const stage7Complete = completed(snapshot, ScenarioStageId.PACKAGE_AND_DISTRIBUTE);
  const dispatch = wasAccepted(snapshot, "INT_DISPATCH_BATCH") || stage7Complete;
  const transferOwnership =
    wasAccepted(snapshot, "INT_OWNERSHIP_TRANSFER_SCOPE") || dispatch || stage7Complete;
  const packageBatch =
    wasAccepted(snapshot, "INT_PACKAGE_BATCH") || transferOwnership || stage7Complete;
  if (packageBatch) {
    execute(runtimeCommand(scenario, "PACKAGE_BATCH"), commandContext(scenario, "PACKAGE_BATCH"));
  }
  if (transferOwnership) {
    execute(
      runtimeCommand(scenario, "TRANSFER_OWNERSHIP"),
      commandContext(scenario, "TRANSFER_OWNERSHIP"),
    );
  }
  if (dispatch) {
    execute(runtimeCommand(scenario, "DISPATCH_BATCH"), commandContext(scenario, "DISPATCH_BATCH"));
  }

  const recall =
    wasAccepted(snapshot, "INT_RECALL_COMMITTED") ||
    completed(snapshot, ScenarioStageId.RECALL_AND_DEBRIEF);
  if (recall) {
    const check = scenario.stages
      .flatMap((stage) => stage.knowledgeChecks)
      .find((candidate) => candidate.knowledgeCheckId === "INT_RECALL_SCOPE");
    const decision = snapshot.decisions["INT_RECALL_SCOPE"];
    if (check === undefined || decision === undefined) {
      throw new ScenarioConfigurationError("Attempt replay could not reconstruct recall scope");
    }
    execute(
      runtimeCommand<RecallBatchCommand>(scenario, "RECALL_BATCH", {
        selectedAssetIds: decodeAnswer(check, decision.encodedValue).selectedOptionIds,
      }),
      commandContext(scenario, "RECALL_BATCH"),
    );
  }

  return state;
}
