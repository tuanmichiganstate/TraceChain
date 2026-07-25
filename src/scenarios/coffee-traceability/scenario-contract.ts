/** Executable cross-layer contracts for the coffee scenario. */

import type {
  AnchorDocumentCommand,
  RecordCorrectionCommand,
} from "../../domain/commands/commands";
import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type {
  AttemptSnapshot,
  DecisionRecord,
} from "../../infrastructure/persistence/attempt-state";
import type { DomainState } from "../../domain/ledger/domain-state";
import { SimulatedLedger } from "../../domain/ledger/ledger-engine";
import { resolveEffectiveValue, correctionTargetValueInTransaction } from "../../domain/ledger/effective-value";
import { calculateRecallScope } from "../../domain/provenance/recall-scope";
import type { ValidationRegistries } from "../../domain/rules/types";
import {
  ACTION_ACCEPTED,
  correctAnswerFor,
  encodeAnswer,
} from "../../domain/scenario/answer-codec";
import {
  ContractCheckRecorder,
  ContractLedgerDriver,
  allCompletionConditions,
  committedTransactionsOfType,
  orderedTransactions,
  rejectedEvidenceState,
  stateBeforeTransaction,
  type ScenarioContractValidationResult,
} from "../../domain/scenario/contract-helpers";
import { buildEffectiveValueView } from "../../domain/scenario/effective-value-view";
import { allHints, allScorableItems } from "../../domain/types/scenario";
import { calculateScore, hintPointsAtRisk } from "../../domain/scoring/score-engine";
import { evaluateCondition, evaluateStageCompletion } from "../../domain/scenario/stage-completion";
import { scoringEvidenceSatisfied } from "../../domain/scenario/transaction-evidence";
import {
  correctionValuesEqual,
  type CorrectionTarget,
} from "../../domain/types/correction";
import {
  QuantityUnit,
  SCENARIO_STAGE_ORDER,
  ScenarioStageId,
  TransactionStatus,
  TransactionType,
} from "../../domain/types/enums";
import type { LedgerTransaction } from "../../domain/types/models";
import { allKnowledgeChecks, allScoredActions } from "../../domain/types/scenario";
import {
  CERTIFIER_CONTEXT,
  DISTRIBUTOR_CONTEXT,
  PROCESSOR_CONTEXT,
  PRODUCER_CONTEXT,
  REGULATOR_CONTEXT,
  LOGISTICS_CONTEXT,
  QUALITY_CERTIFICATE_ANCHOR_ID,
  QUALITY_CERTIFICATE_ID,
  SENSOR_ID,
  anchorCertificateCommand,
  createBatchCommand,
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
} from "./commands";
import { coffeeScenario } from "./scenario";
import {
  DEFAULT_CORRECTION_REASON,
  MANIFEST_QUANTITY_KG,
  SHIPPING_MANIFEST_ANCHOR_ID,
  WEIGHED_QUANTITY_KG,
} from "./facts";
import {
  DISTRACTOR_GREEN_BATCH_ID,
  DISTRACTOR_PACKAGED_LOT_ID,
  DISTRACTOR_ROASTED_BATCH_ID,
  UNRELATED_PACKAGED_LOT_ID,
} from "./seed-assets";
import {
  GREEN_COFFEE_BATCH_ID,
  PACKAGED_COFFEE_LOT_ID,
  ROASTED_COFFEE_BATCH_ID,
} from "./stages";
import { applyScenarioSeed } from "../../domain/scenario/seed-replay";
import { replayScenarioAttempt } from "../../domain/scenario/replay-attempt";
import { SCENARIO_FACT_DATES, SCENARIO_TIMELINE } from "./timeline";

export const STAGE5_MANIFEST_TARGET: CorrectionTarget = {
  kind: "DOCUMENT_METADATA_FIELD",
  documentAnchorId: SHIPPING_MANIFEST_ANCHOR_ID,
  field: "declaredQuantity",
};

const registries: ValidationRegistries = {
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

const SUPPORTING_ACTION_IDS = [
  "INT_CERTIFICATE_ANCHORED_TRANSACTION",
  "INT_CERTIFICATE_ISSUED_TRANSACTION",
  "INT_CUSTODY_TRANSFERRED_TRANSACTION",
  "INT_TRANSPORT_RECORDED_TRANSACTION",
  "INT_OWNERSHIP_PURCHASED_TRANSACTION",
  "INT_CERTIFICATE_INITIAL_SUBMITTED",
  "INT_CERTIFICATE_MITIGATION_COMPLETE",
  "INT_DISCREPANCY_INITIAL_SUBMITTED",
  "INT_DISCREPANCY_MITIGATION_COMPLETE",
  "INT_RECALL_INITIAL_SUBMITTED",
  "INT_RECALL_AUTHORIZATION_RESOLVED",
] as const;

export function canonicalContractSnapshot(): AttemptSnapshot {
  const decisions: Record<string, DecisionRecord> = {};
  for (const check of allKnowledgeChecks(coffeeScenario)) {
    decisions[check.knowledgeCheckId] = {
      encodedValue: encodeAnswer(check, correctAnswerFor(check)),
      attemptCount: 1,
    };
  }
  for (const action of allScoredActions(coffeeScenario)) {
    decisions[action.decisionId] = { encodedValue: ACTION_ACCEPTED, attemptCount: 1 };
  }
  for (const decisionId of SUPPORTING_ACTION_IDS) {
    decisions[decisionId] = { encodedValue: ACTION_ACCEPTED, attemptCount: 1 };
  }
  return {
    currentStageId: ScenarioStageId.RECALL_AND_DEBRIEF,
    completedStageIds: [...SCENARIO_STAGE_ORDER],
    decisions,
    hintsUsed: [],
    isCompleted: true,
    isPassed: true,
    replayData: { correctionReason: DEFAULT_CORRECTION_REASON },
  };
}

export interface CoffeeContractFixture {
  readonly snapshot: AttemptSnapshot;
  readonly liveState: DomainState;
  readonly replayedState: DomainState;
}

function findManifest(state: DomainState): LedgerTransaction {
  const manifest = orderedTransactions(state).find(
    (transaction) =>
      transaction.transactionStatus === TransactionStatus.COMMITTED &&
      transaction.transactionType === TransactionType.ANCHOR_DOCUMENT &&
      (transaction.commandPayload as AnchorDocumentCommand).documentAnchorId ===
        SHIPPING_MANIFEST_ANCHOR_ID,
  );
  if (manifest === undefined) throw new Error("Canonical manifest is missing");
  return manifest;
}

function buildLiveDriver(): ContractLedgerDriver {
  const initial = applyScenarioSeed(coffeeScenario, sha256Hex, registries).state;
  return new ContractLedgerDriver(
    initial,
    coffeeScenario,
    new SimulatedLedger(sha256Hex, coffeeScenario.ledgerConfiguration),
    registries,
  );
}

function runThroughPurchase(): ContractLedgerDriver {
  const driver = buildLiveDriver();
  driver.submitAndCommit(createBatchCommand(), PRODUCER_CONTEXT);
  driver.submitAndCommit(anchorCertificateCommand(), CERTIFIER_CONTEXT);
  driver.submitAndCommit(issueCertificateCommand(), CERTIFIER_CONTEXT);
  driver.submitAndCommit(transferCustodyCommand(false), PRODUCER_CONTEXT);
  driver.submitAndCommit(recordTransportConditionCommand(), LOGISTICS_CONTEXT);
  driver.submitAndCommit(receiveBatchCommand(), PROCESSOR_CONTEXT);
  driver.submitAndCommit(purchaseOnReceiptCommand(), PRODUCER_CONTEXT);
  return driver;
}

function runThroughCorrection(): ContractLedgerDriver {
  const driver = runThroughPurchase();
  const manifest = findManifest(driver.state());
  driver.submitAndCommit(
    recordCorrectionCommand(manifest.transactionId, DEFAULT_CORRECTION_REASON),
    PROCESSOR_CONTEXT,
  );
  return driver;
}

export function buildCanonicalCoffeeContractFixture(): CoffeeContractFixture {
  const driver = runThroughCorrection();
  driver.submitAndCommit(transformBatchCommand(), PROCESSOR_CONTEXT);
  driver.submitAndCommit(packageBatchCommand(), PROCESSOR_CONTEXT);
  driver.submitAndCommit(transferOwnershipToDistributorCommand(), PROCESSOR_CONTEXT);
  driver.submitAndCommit(dispatchToRetailerCommand(), DISTRIBUTOR_CONTEXT);
  driver.submitAndCommit(
    recallBatchCommand([PACKAGED_COFFEE_LOT_ID, ROASTED_COFFEE_BATCH_ID]),
    REGULATOR_CONTEXT,
  );

  const snapshot = canonicalContractSnapshot();
  const initial = applyScenarioSeed(coffeeScenario, sha256Hex, registries).state;
  const replayedState = replayScenarioAttempt(
    snapshot,
    initial,
    new SimulatedLedger(sha256Hex, coffeeScenario.ledgerConfiguration),
    registries,
    coffeeScenario,
  );
  return { snapshot, liveState: driver.state(), replayedState };
}

type TimelineEvidence = {
  readonly timelineKey: keyof typeof SCENARIO_TIMELINE;
  readonly transactionType: TransactionType;
  readonly predicate?: (transaction: LedgerTransaction) => boolean;
};

type FactDateEvidence =
  | {
      readonly kind: "GENESIS_ASSET";
      readonly factKey: keyof typeof SCENARIO_FACT_DATES;
      readonly assetId: string;
    }
  | {
      readonly kind: "DOCUMENT_EXPIRY";
      readonly factKey: keyof typeof SCENARIO_FACT_DATES;
      readonly documentAnchorId: string;
    };

const TIMELINE_EVIDENCE: readonly TimelineEvidence[] = [
  { timelineKey: "batchCreated", transactionType: TransactionType.CREATE_BATCH },
  { timelineKey: "certificateIssued", transactionType: TransactionType.ISSUE_CERTIFICATE },
  {
    timelineKey: "dispatchManifestFiled",
    transactionType: TransactionType.ANCHOR_DOCUMENT,
    predicate: (transaction) =>
      (transaction.commandPayload as AnchorDocumentCommand).documentAnchorId ===
      SHIPPING_MANIFEST_ANCHOR_ID,
  },
  { timelineKey: "custodyTransferred", transactionType: TransactionType.TRANSFER_CUSTODY },
  { timelineKey: "sensorReading", transactionType: TransactionType.RECORD_TRANSPORT_CONDITION },
  { timelineKey: "batchReceived", transactionType: TransactionType.RECEIVE_BATCH },
  { timelineKey: "correctionRecorded", transactionType: TransactionType.RECORD_CORRECTION },
  { timelineKey: "batchRoasted", transactionType: TransactionType.TRANSFORM_BATCH },
  { timelineKey: "batchPackaged", transactionType: TransactionType.PACKAGE_BATCH },
  {
    timelineKey: "ownershipTransferred",
    transactionType: TransactionType.TRANSFER_OWNERSHIP,
    predicate: (transaction) =>
      (transaction.commandPayload as { assetId?: string }).assetId === PACKAGED_COFFEE_LOT_ID,
  },
  { timelineKey: "batchDispatched", transactionType: TransactionType.DISPATCH_BATCH },
  { timelineKey: "laboratoryResult", transactionType: TransactionType.RECALL_BATCH },
];

const FACT_DATE_EVIDENCE: readonly FactDateEvidence[] = [
  { kind: "DOCUMENT_EXPIRY", factKey: "certificateExpires", documentAnchorId: QUALITY_CERTIFICATE_ANCHOR_ID },
  { kind: "GENESIS_ASSET", factKey: "distractorBatchHarvested", assetId: DISTRACTOR_GREEN_BATCH_ID },
  { kind: "GENESIS_ASSET", factKey: "distractorBatchRoasted", assetId: DISTRACTOR_ROASTED_BATCH_ID },
  { kind: "GENESIS_ASSET", factKey: "distractorBatchPackaged", assetId: DISTRACTOR_PACKAGED_LOT_ID },
  { kind: "GENESIS_ASSET", factKey: "unrelatedLotPackaged", assetId: UNRELATED_PACKAGED_LOT_ID },
];

function stage5Definition() {
  const stage = coffeeScenario.stages.find(
    (candidate) => candidate.stageId === ScenarioStageId.RECEIVE_AND_CORRECT,
  );
  if (stage === undefined) throw new Error("Stage 5 is missing");
  return stage;
}

export function validateCoffeeScenarioContracts(): ScenarioContractValidationResult {
  const recorder = new ContractCheckRecorder();
  const fixture = buildCanonicalCoffeeContractFixture();
  const { snapshot, liveState, replayedState } = fixture;

  // 1. Every authored script and timeline fact resolves to committed/replayed evidence.
  for (const script of coffeeScenario.scriptedTransactions) {
    const scripted = orderedTransactions(replayedState).filter((transaction) => {
      if (script.idempotencyGuard.kind !== "DOCUMENT_ANCHOR_ABSENT") return false;
      return (
        transaction.transactionType === TransactionType.ANCHOR_DOCUMENT &&
        (transaction.commandPayload as AnchorDocumentCommand).documentAnchorId ===
          script.idempotencyGuard.documentAnchorId
      );
    });
    recorder.check(
      `script.${script.scriptId}.committed-once`,
      scripted.length === 1 && scripted[0]?.transactionStatus === TransactionStatus.COMMITTED,
      `found ${scripted.length}`,
    );
    const triggerIndex = replayedState.transactionOrder.findIndex((transactionId) => {
      const transaction = replayedState.transactionsById[transactionId];
      return (
        transaction?.transactionStatus === TransactionStatus.COMMITTED &&
        transaction.transactionType === script.trigger.transactionType
      );
    });
    const scriptIndex =
      scripted[0] === undefined
        ? -1
        : replayedState.transactionOrder.indexOf(scripted[0].transactionId);
    recorder.check(
      `script.${script.scriptId}.after-trigger`,
      triggerIndex >= 0 && scriptIndex > triggerIndex,
      `${triggerIndex} -> ${scriptIndex}`,
    );
    const sensorIndex = replayedState.transactionOrder.findIndex(
      (transactionId) =>
        replayedState.transactionsById[transactionId]?.transactionType ===
        TransactionType.RECORD_TRANSPORT_CONDITION,
    );
    recorder.check(
      `script.${script.scriptId}.before-sensor`,
      scriptIndex >= 0 && sensorIndex > scriptIndex,
      `${scriptIndex} -> ${sensorIndex}`,
    );
    recorder.check(
      `script.${script.scriptId}.deterministic-id`,
      scripted[0]?.transactionId === "TX_000005",
      scripted[0]?.transactionId,
    );
    recorder.check(
      `script.${script.scriptId}.actor`,
      scripted[0]?.proposedByActorId === script.actorId &&
        scripted[0]?.proposedByOrganizationId === script.organizationId,
    );
  }

  recorder.check(
    "timeline.contract-coverage",
    Object.keys(coffeeScenario.timeline).every((timelineKey) =>
      TIMELINE_EVIDENCE.some((contract) => contract.timelineKey === timelineKey),
    ) && TIMELINE_EVIDENCE.length === Object.keys(coffeeScenario.timeline).length,
    `${TIMELINE_EVIDENCE.length}/${Object.keys(coffeeScenario.timeline).length}`,
  );
  for (const contract of TIMELINE_EVIDENCE) {
    const expected = SCENARIO_TIMELINE[contract.timelineKey];
    const exists = committedTransactionsOfType(
      replayedState,
      contract.transactionType,
    ).some(
      (transaction) =>
        transaction.createdAt === expected &&
        (contract.predicate === undefined || contract.predicate(transaction)),
    );
    recorder.check(`timeline.${contract.timelineKey}`, exists, expected);
  }

  recorder.check(
    "fact-date.contract-coverage",
    Object.keys(SCENARIO_FACT_DATES).every((factKey) =>
      FACT_DATE_EVIDENCE.some((contract) => contract.factKey === factKey),
    ) && FACT_DATE_EVIDENCE.length === Object.keys(SCENARIO_FACT_DATES).length,
    `${FACT_DATE_EVIDENCE.length}/${Object.keys(SCENARIO_FACT_DATES).length}`,
  );
  for (const contract of FACT_DATE_EVIDENCE) {
    const expected = SCENARIO_FACT_DATES[contract.factKey];
    if (contract.kind === "GENESIS_ASSET") {
      recorder.check(
        `fact-date.${contract.factKey}.genesis`,
        replayedState.assetsById[contract.assetId]?.productionDate === expected,
        `${contract.assetId} at ${expected}`,
      );
    } else {
      recorder.check(
        `fact-date.${contract.factKey}.expiry`,
        replayedState.documentAnchorsById[contract.documentAnchorId]?.expiresAt === expected,
      );
    }
  }

  // 2-3. Every correction has a committed target and states the immediately prior value.
  const corrections = committedTransactionsOfType(
    replayedState,
    TransactionType.RECORD_CORRECTION,
  );
  for (const transaction of corrections) {
    const command = transaction.commandPayload as RecordCorrectionCommand;
    const referenced = replayedState.transactionsById[command.correctionOfTransactionId];
    recorder.check(
      `correction.${transaction.transactionId}.reference`,
      referenced?.transactionStatus === TransactionStatus.COMMITTED,
    );
    recorder.check(
      `correction.${transaction.transactionId}.target`,
      referenced !== undefined &&
        correctionTargetValueInTransaction(referenced, command.target) !== null,
    );
    const prior = resolveEffectiveValue(
      stateBeforeTransaction(replayedState, transaction.transactionId),
      command.target,
    );
    recorder.check(
      `correction.${transaction.transactionId}.incorrect-value`,
      prior !== null && correctionValuesEqual(prior.effectiveValue, command.incorrectValue),
    );
  }

  // 4. Every scored mechanic has its persisted/domain evidence.
  for (const check of allKnowledgeChecks(coffeeScenario).filter((candidate) => candidate.isScored)) {
    recorder.check(
      `score.${check.knowledgeCheckId}.decision`,
      snapshot.decisions[check.knowledgeCheckId] !== undefined,
    );
  }
  for (const action of allScoredActions(coffeeScenario)) {
    recorder.check(
      `score.${action.decisionId}.transaction`,
      committedTransactionsOfType(replayedState, action.transactionType).length > 0,
    );
    if (action.evidence !== undefined) {
      recorder.check(
        `score.${action.decisionId}.evidence`,
        scoringEvidenceSatisfied(replayedState, action.evidence),
      );
    }
  }

  // 5. Every milestone condition is executed, not merely schema-checked.
  for (const named of allCompletionConditions(coffeeScenario)) {
    const outcome = evaluateCondition(named.condition, {
      state: replayedState,
      decisions: snapshot.decisions,
    });
    recorder.check(
      `milestone.${named.stageId}.${named.conditionIndex}`,
      outcome.isSatisfied,
      outcome.detail,
    );
  }

  // 6. IDs shown by Stage 3/5 and the report resolve to real evidence.
  recorder.check(
    "display.document.quality-certificate",
    replayedState.documentAnchorsById[QUALITY_CERTIFICATE_ANCHOR_ID] !== undefined,
  );
  recorder.check(
    "display.document.shipping-manifest",
    replayedState.documentAnchorsById[SHIPPING_MANIFEST_ANCHOR_ID] !== undefined,
  );
  recorder.check(
    "display.certificate.quality",
    Object.values(replayedState.assetsById).some((asset) =>
      asset.certificateIds.includes(QUALITY_CERTIFICATE_ID),
    ),
  );
  recorder.check(
    "display.sensor",
    committedTransactionsOfType(
      replayedState,
      TransactionType.RECORD_TRANSPORT_CONDITION,
    ).some(
      (transaction) =>
        (transaction.commandPayload as { sensorId?: string }).sensorId === SENSOR_ID,
    ),
  );
  recorder.check(
    "display.transaction-order",
    replayedState.transactionOrder.every(
      (transactionId) => replayedState.transactionsById[transactionId] !== undefined,
    ),
  );
  const displayedCorrectionView = buildEffectiveValueView(
    replayedState,
    STAGE5_MANIFEST_TARGET,
  );
  recorder.check(
    "display.correction-lineage-transactions",
    displayedCorrectionView !== null &&
      replayedState.transactionsById[displayedCorrectionView.originalTransactionId] !==
        undefined &&
      displayedCorrectionView.correctionTransactionIds.every(
        (transactionId) => replayedState.transactionsById[transactionId] !== undefined,
      ),
  );

  // 8. A valid correction to a different target cannot complete Stage 5.
  const unrelatedDriver = runThroughPurchase();
  const create = committedTransactionsOfType(
    unrelatedDriver.state(),
    TransactionType.CREATE_BATCH,
  )[0];
  if (create !== undefined) {
    const unrelated: RecordCorrectionCommand = {
      ...recordCorrectionCommand(create.transactionId, DEFAULT_CORRECTION_REASON),
      target: { kind: "ASSET_FIELD", assetId: GREEN_COFFEE_BATCH_ID, field: "quantity" },
      incorrectValue: { kind: "QUANTITY", amount: 100, unit: QuantityUnit.KG },
      correctedValue: { kind: "QUANTITY", amount: 99, unit: QuantityUnit.KG },
    };
    unrelatedDriver.submitAndCommit(unrelated, PROCESSOR_CONTEXT);
  }
  recorder.check(
    "stage5.unrelated-correction-does-not-complete",
    !evaluateStageCompletion(stage5Definition(), {
      state: unrelatedDriver.state(),
      decisions: snapshot.decisions,
    }).isComplete,
  );

  // 9. Rejected evidence cannot complete Stage 5 or any transaction condition.
  const rejectedDriver = runThroughPurchase();
  const rejectedManifest = findManifest(rejectedDriver.state());
  rejectedDriver.submitRejected(
    {
      ...recordCorrectionCommand(rejectedManifest.transactionId, DEFAULT_CORRECTION_REASON),
      incorrectValue: { kind: "QUANTITY", amount: 999, unit: QuantityUnit.KG },
    },
    PROCESSOR_CONTEXT,
  );
  recorder.check(
    "stage5.rejected-correction-does-not-complete",
    !evaluateStageCompletion(stage5Definition(), {
      state: rejectedDriver.state(),
      decisions: snapshot.decisions,
    }).isComplete,
  );
  for (const named of allCompletionConditions(coffeeScenario).filter(
    (candidate) => candidate.condition.conditionType === "TRANSACTION_COMMITTED",
  )) {
    if (named.condition.conditionType !== "TRANSACTION_COMMITTED") continue;
    const outcome = evaluateCondition(named.condition, {
      state: rejectedEvidenceState(replayedState, named.condition.transactionType),
      decisions: snapshot.decisions,
    });
    recorder.check(
      `rejected-attempt.${named.stageId}.${named.conditionIndex}`,
      !outcome.isSatisfied,
    );
  }

  // 10. Later corrections may change scoring, never historical completion.
  const laterDriver = runThroughCorrection();
  const firstManifest = findManifest(laterDriver.state());
  const beforeLater = evaluateStageCompletion(stage5Definition(), {
    state: laterDriver.state(),
    decisions: snapshot.decisions,
  }).isComplete;
  laterDriver.submitAndCommit(
    {
      ...recordCorrectionCommand(firstManifest.transactionId, DEFAULT_CORRECTION_REASON),
      incorrectValue: { kind: "QUANTITY", amount: WEIGHED_QUANTITY_KG, unit: QuantityUnit.KG },
      correctedValue: { kind: "QUANTITY", amount: 105, unit: QuantityUnit.KG },
      scenarioTimestamp: "2026-06-17T04:00:00.000Z",
    },
    PROCESSOR_CONTEXT,
  );
  recorder.check(
    "stage5.later-correction-keeps-completion",
    beforeLater &&
      evaluateStageCompletion(stage5Definition(), {
        state: laterDriver.state(),
        decisions: snapshot.decisions,
      }).isComplete,
  );

  // 11. Each consequential stage explicitly distinguishes its one initial
  // submission and its completed-or-unneeded mitigation phase. The separate
  // transaction conditions prove the business mutations.
  const decisionConditions = allCompletionConditions(coffeeScenario).filter(
    (candidate) => candidate.condition.conditionType === "DECISION_RECORDED",
  );
  const consequentialCompletionIds = new Set([
    "INT_CERTIFICATE_INITIAL_SUBMITTED",
    "INT_CERTIFICATE_MITIGATION_COMPLETE",
    "INT_DISCREPANCY_INITIAL_SUBMITTED",
    "INT_DISCREPANCY_MITIGATION_COMPLETE",
    "INT_RECALL_INITIAL_SUBMITTED",
    "INT_RECALL_AUTHORIZATION_RESOLVED",
  ]);
  recorder.check(
    "completion.decision-recorded-audit",
    decisionConditions.length === consequentialCompletionIds.size &&
      decisionConditions.every(
        (candidate) =>
          candidate.condition.conditionType === "DECISION_RECORDED" &&
          consequentialCompletionIds.has(candidate.condition.decisionId),
      ),
    `${decisionConditions.length} attempt-backed completion condition(s) found`,
  );

  // 12-13. Live, replay, UI view and score agree; both lineage records remain.
  const liveView = buildEffectiveValueView(liveState, STAGE5_MANIFEST_TARGET);
  const replayView = buildEffectiveValueView(replayedState, STAGE5_MANIFEST_TARGET);
  const expectedEffective = {
    kind: "QUANTITY" as const,
    amount: WEIGHED_QUANTITY_KG,
    unit: QuantityUnit.KG,
  };
  recorder.check(
    "effective.live-replay",
    liveView !== null && replayView !== null &&
      correctionValuesEqual(liveView.effectiveValue, replayView.effectiveValue),
  );
  recorder.check(
    "effective.ui-view",
    replayView !== null && correctionValuesEqual(replayView.effectiveValue, expectedEffective),
  );
  recorder.check(
    "effective.full-replay-state",
    canonicalize(liveState) === canonicalize(replayedState),
  );
  const correctionScoreEvidence = allScoredActions(coffeeScenario).find(
    (action) => action.decisionId === "INT_CORRECTION_RECORDED",
  )?.evidence;
  recorder.check(
    "effective.scoring",
    correctionScoreEvidence !== undefined &&
      scoringEvidenceSatisfied(replayedState, correctionScoreEvidence),
  );
  recorder.check(
    "lineage.original-manifest",
    replayView !== null &&
      correctionValuesEqual(replayView.originalValue, {
        kind: "QUANTITY",
        amount: MANIFEST_QUANTITY_KG,
        unit: QuantityUnit.KG,
      }) &&
      replayedState.transactionsById[replayView.originalTransactionId]
        ?.transactionStatus === TransactionStatus.COMMITTED,
  );
  recorder.check(
    "lineage.correction",
    replayView?.correctionTransactionIds.length === 1 &&
      replayView.correctionTransactionIds.every(
        (transactionId) =>
          replayedState.transactionsById[transactionId]?.transactionStatus ===
          TransactionStatus.COMMITTED,
      ),
  );

  // 14. Affected lineage is not a claim that stock was physically retrieved.
  const recallScope = calculateRecallScope(GREEN_COFFEE_BATCH_ID, replayedState);
  recorder.check(
    "recall.affected-lineage",
    [GREEN_COFFEE_BATCH_ID, ROASTED_COFFEE_BATCH_ID, PACKAGED_COFFEE_LOT_ID].every(
      (assetId) => recallScope.affectedAssetIds.includes(assetId),
    ),
  );
  recorder.check(
    "recall.unaffected-lineage",
    [DISTRACTOR_PACKAGED_LOT_ID, UNRELATED_PACKAGED_LOT_ID].every((assetId) =>
      recallScope.unaffectedAssetIds.includes(assetId),
    ),
  );
  recorder.check(
    "recall.no-unproven-retrieval",
    recallScope.confirmedRetrievedAssetIds.length === 0,
    "The scenario has no physical pickup-confirmation transaction",
  );

  /*
   * 15. Hint scope is priced the way it is declared.
   *
   * The schema validator already holds every target to a real, same-stage,
   * nameable item. What it cannot see is whether the engine then charges those
   * items and only those, so this drives the real scoring engine once per hint
   * and compares the result against the hint's own declaration.
   */
  const scorableItems = allScorableItems(coffeeScenario);
  for (const hint of allHints(coffeeScenario)) {
    const targets = new Set(hint.targetScorableItemIds);
    const scored = calculateScore(
      {
        decisions: Object.fromEntries(
          scorableItems.map((item) => [item.decisionId, { encodedValue: 1, attemptCount: 1 }]),
        ),
        hintsUsed: [hint.hintId],
        correctness: Object.fromEntries(
          scorableItems.map((item) => [item.decisionId, true]),
        ),
      },
      coffeeScenario,
    );

    recorder.check(
      `hints.${hint.hintId}.caps-exactly-its-targets`,
      scored.items.every((item) => item.wasHintUsed === targets.has(item.decisionId)),
      "A hint must cap the items it declares, and no others",
    );

    const expectedLoss =
      hint.targetScorableItemIds.reduce((total, decisionId) => {
        const item = scorableItems.find((candidate) => candidate.decisionId === decisionId);
        return total + (item?.points ?? 0);
      }, 0) *
      (1 - coffeeScenario.scoringConfiguration.afterHintCredit);

    // Against a fresh attempt: nothing answered, so every target is still worth
    // the full difference between first-attempt and after-hint credit.
    const untouched = calculateScore(
      {
        decisions: {},
        hintsUsed: [],
        correctness: {},
      },
      coffeeScenario,
    );
    recorder.check(
      `hints.${hint.hintId}.disclosed-risk-matches-engine`,
      Math.abs(hintPointsAtRisk(hint, coffeeScenario, untouched) - expectedLoss) < 0.05,
      "The points shown to the learner must be the points the engine removes",
    );
  }

  return recorder.result();
}

export const scenarioContractSourceFiles: readonly string[] = [
  "src",
  "README.md",
  "docs",
];
