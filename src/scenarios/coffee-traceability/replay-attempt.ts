/** Deterministic reconstruction of accepted coffee-scenario history. */

import type { AttemptSnapshot } from "../../infrastructure/persistence/state-codec";
import type { DomainState } from "../../domain/ledger/domain-state";
import { SimulatedLedger } from "../../domain/ledger/ledger-engine";
import type { ValidationRegistries } from "../../domain/rules/types";
import { ACTION_ACCEPTED, decodeAnswer } from "../../domain/scenario/answer-codec";
import { applyEligibleScriptedTransactions } from "../../domain/scenario/scripted-transactions";
import { ScenarioConfigurationError } from "../../domain/errors";
import { ScenarioStageId, TransactionStatus, TransactionType } from "../../domain/types/enums";
import type { SupplyChainCommand } from "../../domain/commands/commands";
import {
  CERTIFIER_CONTEXT,
  DISTRIBUTOR_CONTEXT,
  LOGISTICS_CONTEXT,
  PROCESSOR_CONTEXT,
  PRODUCER_CONTEXT,
  REGULATOR_CONTEXT,
  anchorCertificateCommand,
  dispatchToRetailerCommand,
  issueCertificateCommand,
  packageBatchCommand,
  purchaseOnReceiptCommand,
  recallBatchCommand,
  receiveBatchCommand,
  recordCorrectionCommand,
  recordTransportConditionCommand,
  transferCustodyCommand,
  transferOwnershipToDistributorCommand,
  transformBatchCommand,
  createBatchCommand,
} from "./commands";
import { coffeeScenario } from "./scenario";
import { DEFAULT_CORRECTION_REASON, SHIPPING_MANIFEST_ANCHOR_ID } from "./facts";
import { OrganizationId } from "./organizations";

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
export function replayCoffeeAttempt(
  snapshot: AttemptSnapshot,
  initialState: DomainState,
  ledger: SimulatedLedger,
  registries: ValidationRegistries,
): DomainState {
  let state = initialState;

  const execute = (
    command: SupplyChainCommand,
    context: { readonly actorId: string; readonly organizationId: string },
  ): void => {
    state = applyEligibleScriptedTransactions(
      state,
      coffeeScenario.scriptedTransactions,
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
      coffeeScenario.scriptedTransactions,
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
  if (stage2) execute(createBatchCommand(), PRODUCER_CONTEXT);

  const stage3Complete = completed(snapshot, ScenarioStageId.ANCHOR_CERTIFICATE);
  const anchorCertificate =
    wasAccepted(snapshot, "INT_CERTIFICATE_ANCHORED_TRANSACTION") || stage3Complete;
  const issueCertificate =
    wasAccepted(snapshot, "INT_CERTIFICATE_ISSUED_TRANSACTION") || stage3Complete;
  if (anchorCertificate || issueCertificate) {
    execute(anchorCertificateCommand(), CERTIFIER_CONTEXT);
  }
  if (issueCertificate) execute(issueCertificateCommand(), CERTIFIER_CONTEXT);
  const suspiciousAttempts =
    snapshot.decisions["INT_SUSPICIOUS_CERTIFICATE_ATTEMPT"]?.attemptCount ?? 0;
  for (let attempt = 0; attempt < suspiciousAttempts; attempt += 1) {
    executeRejected(
      anchorCertificateCommand(OrganizationId.UNRECOGNIZED_CERTIFIER),
      CERTIFIER_CONTEXT,
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
    executeRejected(transferCustodyCommand(true), PRODUCER_CONTEXT);
  }
  if (transferCustody) execute(transferCustodyCommand(false), PRODUCER_CONTEXT);
  if (recordTransport) execute(recordTransportConditionCommand(), LOGISTICS_CONTEXT);

  const stage5Complete = completed(snapshot, ScenarioStageId.RECEIVE_AND_CORRECT);
  const correctManifest =
    wasAccepted(snapshot, "INT_CORRECTION_RECORDED") || stage5Complete;
  const receive = wasAccepted(snapshot, "INT_RECEIVE_BATCH") || correctManifest || stage5Complete;
  const purchase =
    wasAccepted(snapshot, "INT_OWNERSHIP_PURCHASED_TRANSACTION") || stage5Complete;
  if (receive) execute(receiveBatchCommand(), PROCESSOR_CONTEXT);
  if (purchase) execute(purchaseOnReceiptCommand(), PRODUCER_CONTEXT);
  if (correctManifest) {
    const manifest = state.transactionOrder
      .map((transactionId) => state.transactionsById[transactionId])
      .find(
        (transaction) =>
          transaction?.transactionStatus === TransactionStatus.COMMITTED &&
          transaction.transactionType === TransactionType.ANCHOR_DOCUMENT &&
          (transaction.commandPayload as { documentAnchorId?: string }).documentAnchorId ===
            SHIPPING_MANIFEST_ANCHOR_ID,
      );
    if (manifest === undefined) {
      throw new ScenarioConfigurationError("Attempt replay could not find the shipping manifest");
    }
    execute(
      recordCorrectionCommand(
        manifest.transactionId,
        snapshot.replayData?.correctionReason ?? DEFAULT_CORRECTION_REASON,
      ),
      PROCESSOR_CONTEXT,
    );
  }

  const stage6 =
    wasAccepted(snapshot, "INT_TRANSFORM_BATCH") ||
    completed(snapshot, ScenarioStageId.TRANSFORM_BATCH);
  if (stage6) execute(transformBatchCommand(), PROCESSOR_CONTEXT);

  const stage7Complete = completed(snapshot, ScenarioStageId.PACKAGE_AND_DISTRIBUTE);
  const dispatch = wasAccepted(snapshot, "INT_DISPATCH_BATCH") || stage7Complete;
  const transferOwnership =
    wasAccepted(snapshot, "INT_OWNERSHIP_TRANSFER_SCOPE") || dispatch || stage7Complete;
  const packageBatch =
    wasAccepted(snapshot, "INT_PACKAGE_BATCH") || transferOwnership || stage7Complete;
  if (packageBatch) execute(packageBatchCommand(), PROCESSOR_CONTEXT);
  if (transferOwnership) {
    execute(transferOwnershipToDistributorCommand(), PROCESSOR_CONTEXT);
  }
  if (dispatch) execute(dispatchToRetailerCommand(), DISTRIBUTOR_CONTEXT);

  const recall =
    wasAccepted(snapshot, "INT_RECALL_COMMITTED") ||
    completed(snapshot, ScenarioStageId.RECALL_AND_DEBRIEF);
  if (recall) {
    const check = coffeeScenario.stages
      .flatMap((stage) => stage.knowledgeChecks)
      .find((candidate) => candidate.knowledgeCheckId === "INT_RECALL_SCOPE");
    const decision = snapshot.decisions["INT_RECALL_SCOPE"];
    if (check === undefined || decision === undefined) {
      throw new ScenarioConfigurationError("Attempt replay could not reconstruct recall scope");
    }
    execute(
      recallBatchCommand(decodeAnswer(check, decision.encodedValue).selectedOptionIds),
      REGULATOR_CONTEXT,
    );
  }

  return state;
}
