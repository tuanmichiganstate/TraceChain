import { describe, expect, it } from "vitest";
import {
  ActorId,
  GREEN_COFFEE_BATCH_ID,
  SCENARIO_TIMELINE,
  commands,
  contextFor,
  runUpTo,
} from "../../../test/support/scenario-driver";
import type {
  AnchorDocumentCommand,
  RecordCorrectionCommand,
} from "../commands/commands";
import { resolveEffectiveValue } from "../ledger/effective-value";
import { SimulatedLedger } from "../ledger/ledger-engine";
import { replayCommandJournal } from "../ledger/replay";
import type { ReplayCommandEntry } from "../ledger/replay";
import { applyScenarioSeed } from "./seed-replay";
import { evaluateStageCompletion } from "./stage-completion";
import { deriveCorrectnessFromDecisions, ACTION_ACCEPTED } from "./answer-codec";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import {
  DocumentType,
  QuantityUnit,
  ScenarioStageId,
  TransactionStatus,
  TransactionType,
} from "../types/enums";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import type { LedgerTransaction } from "../types/models";
import type { SupplyChainCommand } from "../commands/commands";
import {
  MANIFEST_QUANTITY_KG,
  SHIPPING_MANIFEST_ANCHOR_ID,
  WEIGHED_QUANTITY_KG,
} from "../../scenarios/coffee-traceability/facts";
import { replayScenarioAttempt } from "./replay-attempt";

const target = {
  kind: "DOCUMENT_METADATA_FIELD" as const,
  documentAnchorId: SHIPPING_MANIFEST_ANCHOR_ID,
  field: "declaredQuantity" as const,
};

const registries = {
  organizationsById: Object.fromEntries(
    coffeeScenario.organizations.map((organization) => [
      organization.organizationId,
      organization,
    ]),
  ),
  actorsById: Object.fromEntries(
    coffeeScenario.actors.map((actor) => [actor.actorId, actor]),
  ),
};

function stage5() {
  const stage = coffeeScenario.stages.find(
    (candidate) => candidate.stageId === ScenarioStageId.RECEIVE_AND_CORRECT,
  );
  if (stage === undefined) throw new Error("Stage 5 is missing");
  return stage;
}

function manifestTransaction(
  transactions: readonly LedgerTransaction[],
): LedgerTransaction {
  const transaction = transactions.find(
    (candidate) =>
      candidate.transactionType === TransactionType.ANCHOR_DOCUMENT &&
      (candidate.commandPayload as AnchorDocumentCommand).documentAnchorId ===
        SHIPPING_MANIFEST_ANCHOR_ID,
  );
  if (transaction === undefined) throw new Error("Shipping manifest transaction is missing");
  return transaction;
}

describe("Stage 5 shipping-manifest repair", () => {
  it("inserts exactly one committed typed manifest after custody and before sensing", async () => {
    const ledger = await runUpTo("monitored");
    const transactions = await ledger.getAllTransactions();
    const manifest = manifestTransaction(transactions) as (typeof transactions)[number];
    const command = manifest.commandPayload as AnchorDocumentCommand;

    expect(manifest.transactionId).toBe("TX_000005");
    expect(manifest.transactionStatus).toBe(TransactionStatus.COMMITTED);
    expect(manifest.proposedByActorId).toBe("ACT_SHIPPING_CLERK");
    expect(command.documentType).toBe(DocumentType.SHIPPING_MANIFEST);
    expect(command.metadata).toEqual({
      kind: DocumentType.SHIPPING_MANIFEST,
      declaredQuantity: {
        kind: "QUANTITY",
        amount: MANIFEST_QUANTITY_KG,
        unit: QuantityUnit.KG,
      },
    });

    const custodyIndex = transactions.findIndex(
      (transaction) => transaction.transactionType === TransactionType.TRANSFER_CUSTODY,
    );
    const manifestIndex = transactions.indexOf(manifest);
    const sensorIndex = transactions.findIndex(
      (transaction) =>
        transaction.transactionType === TransactionType.RECORD_TRANSPORT_CONDITION,
    );
    expect(custodyIndex).toBeLessThan(manifestIndex);
    expect(manifestIndex).toBeLessThan(sensorIndex);

    await ledger.sealPendingTransactions(SCENARIO_TIMELINE.sensorReading);
    expect(
      (await ledger.getAllTransactions()).filter(
        (transaction) =>
          transaction.transactionType === TransactionType.ANCHOR_DOCUMENT &&
          (transaction.commandPayload as AnchorDocumentCommand).documentAnchorId ===
            SHIPPING_MANIFEST_ANCHOR_ID,
      ),
    ).toHaveLength(1);
  });

  it("changes only evidence fields when the manifest is anchored", async () => {
    const ledger = await runUpTo("certified");
    await ledger.submitCommand(
      commands.transferCustody(),
      contextFor(ActorId.PRODUCER_MANAGER),
    );
    const before = await ledger.getAsset(GREEN_COFFEE_BATCH_ID);
    if (before === null) throw new Error("asset missing");

    await ledger.sealPendingTransactions(SCENARIO_TIMELINE.custodyTransferred);
    const after = await ledger.getAsset(GREEN_COFFEE_BATCH_ID);
    if (after === null) throw new Error("asset missing");

    expect({
      quantity: after.quantity,
      quantityUnit: after.quantityUnit,
      owner: after.currentOwnerId,
      custodian: after.currentCustodianId,
      location: after.currentLocationId,
      lifecycle: after.lifecycleStatus,
      compliance: after.complianceStatus,
      saleEligibility: after.saleEligibility,
    }).toEqual({
      quantity: before.quantity,
      quantityUnit: before.quantityUnit,
      owner: before.currentOwnerId,
      custodian: before.currentCustodianId,
      location: before.currentLocationId,
      lifecycle: before.lifecycleStatus,
      compliance: before.complianceStatus,
      saleEligibility: before.saleEligibility,
    });
    expect(after.documentAnchorIds).toEqual([
      ...before.documentAnchorIds,
      SHIPPING_MANIFEST_ANCHOR_ID,
    ]);
    expect(after.stateVersion).toBe(before.stateVersion + 1);
  });

  it("corrects declaredQuantity to 100 KG while preserving both ledger records", async () => {
    const ledger = await runUpTo("received");
    const state = ledger.getState();
    const transactions = await ledger.getAllTransactions();
    const manifest = manifestTransaction(transactions) as (typeof transactions)[number];
    const correction = transactions.find(
      (transaction) => transaction.transactionType === TransactionType.RECORD_CORRECTION,
    );
    if (correction === undefined) throw new Error("correction missing");
    const command = correction.commandPayload as RecordCorrectionCommand;

    expect(command.correctionOfTransactionId).toBe(manifest.transactionId);
    expect(command.target).toEqual(target);
    expect(command.incorrectValue).toEqual({
      kind: "QUANTITY",
      amount: MANIFEST_QUANTITY_KG,
      unit: QuantityUnit.KG,
    });
    expect(command.correctedValue).toEqual({
      kind: "QUANTITY",
      amount: WEIGHED_QUANTITY_KG,
      unit: QuantityUnit.KG,
    });
    expect(resolveEffectiveValue(state, target)?.effectiveValue).toEqual(
      command.correctedValue,
    );
    expect(
      ((manifest.commandPayload as AnchorDocumentCommand).metadata as {
        declaredQuantity: { amount: number };
      }).declaredQuantity.amount,
    ).toBe(MANIFEST_QUANTITY_KG);
    expect(state.transactionOrder).toContain(manifest.transactionId);
    expect(state.transactionOrder).toContain(correction.transactionId);
    expect(state.assetsById[GREEN_COFFEE_BATCH_ID]?.quantity).toBe(WEIGHED_QUANTITY_KG);
  });

  it("replay reconstructs the same effective manifest value", async () => {
    const ledger = await runUpTo("received", { withSeed: true });
    const live = ledger.getState();
    const entries: ReplayCommandEntry[] = live.transactionOrder
      .map((transactionId) => live.transactionsById[transactionId])
      .filter(
        (transaction): transaction is LedgerTransaction =>
          transaction?.transactionStatus === TransactionStatus.COMMITTED,
      )
      .map((transaction) => ({
        command: transaction.commandPayload as SupplyChainCommand,
        context: {
          actorId: transaction.proposedByActorId,
          organizationId: transaction.proposedByOrganizationId,
        },
        sealAfter: true,
      }));
    const initial = applyScenarioSeed(coffeeScenario, sha256Hex, registries).state;
    const replayed = replayCommandJournal({
      entries,
      hash: sha256Hex,
      configuration: coffeeScenario.ledgerConfiguration,
      registries,
      initialState: initial,
    });

    expect(resolveEffectiveValue(replayed, target)).toEqual(
      resolveEffectiveValue(live, target),
    );
  });

  it("resume replay restores the scripted manifest and learner correction", () => {
    const initial = applyScenarioSeed(coffeeScenario, sha256Hex, registries).state;
    const resumed = replayScenarioAttempt(
      {
        currentStageId: ScenarioStageId.TRANSFORM_BATCH,
        completedStageIds: [
          ScenarioStageId.ORIENTATION,
          ScenarioStageId.CREATE_BATCH,
          ScenarioStageId.ANCHOR_CERTIFICATE,
          ScenarioStageId.SHIP_AND_MONITOR,
          ScenarioStageId.RECEIVE_AND_CORRECT,
        ],
        decisions: {
          INT_SUSPICIOUS_CERTIFICATE_ATTEMPT: { encodedValue: 0, attemptCount: 1 },
        },
        hintsUsed: [],
        isCompleted: false,
        isPassed: false,
        replayData: { correctionReason: "Lý do khôi phục chính xác từ suspend_data." },
      },
      initial,
      new SimulatedLedger(sha256Hex, coffeeScenario.ledgerConfiguration),
      registries,
      coffeeScenario,
    );
    const transactions = resumed.transactionOrder.map(
      (transactionId) => resumed.transactionsById[transactionId] as LedgerTransaction,
    );
    const manifest = manifestTransaction(transactions);
    const correction = transactions.find(
      (transaction) => transaction.transactionType === TransactionType.RECORD_CORRECTION,
    );

    expect(manifest.transactionStatus).toBe(TransactionStatus.COMMITTED);
    expect(manifest.transactionId).toBe("TX_000006");
    expect((correction?.commandPayload as RecordCorrectionCommand).reason).toBe(
      "Lý do khôi phục chính xác từ suspend_data.",
    );
    expect(resolveEffectiveValue(resumed, target)?.effectiveValue).toEqual({
      kind: "QUANTITY",
      amount: WEIGHED_QUANTITY_KG,
      unit: QuantityUnit.KG,
    });
  });

  it("does not complete for an unrelated or rejected correction", async () => {
    const unrelated = await runUpTo("monitored");
    await unrelated.submitCommand(
      commands.receiveBatch(),
      contextFor(ActorId.PROCESSING_MANAGER),
    );
    await unrelated.submitCommand(
      commands.purchaseOnReceipt(),
      contextFor(ActorId.PRODUCER_MANAGER),
    );
    await unrelated.sealPendingTransactions(SCENARIO_TIMELINE.batchReceived);
    const create = (await unrelated.getAllTransactions()).find(
      (transaction) => transaction.transactionType === TransactionType.CREATE_BATCH,
    );
    if (create === undefined) throw new Error("create transaction missing");
    await unrelated.submitCommand(
      commands.recordCorrection({
        correctionOfTransactionId: create.transactionId,
        target: { kind: "ASSET_FIELD", assetId: GREEN_COFFEE_BATCH_ID, field: "quantity" },
        incorrectValue: { kind: "QUANTITY", amount: 100, unit: QuantityUnit.KG },
        correctedValue: { kind: "QUANTITY", amount: 99, unit: QuantityUnit.KG },
      }),
      contextFor(ActorId.PROCESSING_MANAGER),
    );
    await unrelated.sealPendingTransactions(SCENARIO_TIMELINE.correctionRecorded);
    expect(
      evaluateStageCompletion(stage5(), { state: unrelated.getState(), decisions: {} })
        .isComplete,
    ).toBe(false);

    const rejected = await runUpTo("monitored");
    await rejected.submitCommand(
      commands.receiveBatch(),
      contextFor(ActorId.PROCESSING_MANAGER),
    );
    await rejected.submitCommand(
      commands.purchaseOnReceipt(),
      contextFor(ActorId.PRODUCER_MANAGER),
    );
    await rejected.sealPendingTransactions(SCENARIO_TIMELINE.batchReceived);
    const manifest = manifestTransaction(await rejected.getAllTransactions());
    const attempt = await rejected.submitCommand(
      commands.recordCorrection({
        correctionOfTransactionId: manifest.transactionId,
        incorrectValue: { kind: "QUANTITY", amount: 999, unit: QuantityUnit.KG },
      }),
      contextFor(ActorId.PROCESSING_MANAGER),
    );
    expect(attempt.isAccepted).toBe(false);
    expect(
      evaluateStageCompletion(stage5(), { state: rejected.getState(), decisions: {} })
        .isComplete,
    ).toBe(false);
  });

  it("keeps completion monotonic while scoring the current effective value", async () => {
    const ledger = await runUpTo("received");
    const decisions = {
      INT_CORRECTION_RECORDED: { encodedValue: ACTION_ACCEPTED, attemptCount: 1 },
      INT_DISCREPANCY_INITIAL_SUBMITTED: {
        encodedValue: ACTION_ACCEPTED,
        attemptCount: 1,
      },
      INT_DISCREPANCY_MITIGATION_COMPLETE: {
        encodedValue: ACTION_ACCEPTED,
        attemptCount: 1,
      },
    };
    expect(
      evaluateStageCompletion(stage5(), { state: ledger.getState(), decisions }).isComplete,
    ).toBe(true);
    expect(
      deriveCorrectnessFromDecisions(decisions, coffeeScenario, ledger.getState())[
        "INT_CORRECTION_RECORDED"
      ],
    ).toBe(true);

    const manifest = manifestTransaction(await ledger.getAllTransactions());
    const later = await ledger.submitCommand(
      commands.recordCorrection({
        correctionOfTransactionId: manifest.transactionId,
        incorrectValue: { kind: "QUANTITY", amount: 100, unit: QuantityUnit.KG },
        correctedValue: { kind: "QUANTITY", amount: 105, unit: QuantityUnit.KG },
        scenarioTimestamp: "2026-06-17T04:00:00.000Z",
      }),
      contextFor(ActorId.PROCESSING_MANAGER),
    );
    expect(later.isAccepted).toBe(true);
    await ledger.sealPendingTransactions("2026-06-17T04:00:00.000Z");

    expect(
      evaluateStageCompletion(stage5(), { state: ledger.getState(), decisions }).isComplete,
    ).toBe(true);
    expect(resolveEffectiveValue(ledger.getState(), target)?.effectiveValue).toEqual({
      kind: "QUANTITY",
      amount: 105,
      unit: QuantityUnit.KG,
    });
    expect(
      deriveCorrectnessFromDecisions(decisions, coffeeScenario, ledger.getState())[
        "INT_CORRECTION_RECORDED"
      ],
    ).toBe(false);
  });
});
