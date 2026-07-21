/**
 * Time ordering and duplication (specification section 13.3).
 *
 * These are the rules that depend on the scenario timeline. They are the reason
 * `TIMELINE_ORDERING_CONSTRAINTS` exists and is checked at build time: a
 * scenario whose receipt precedes its dispatch does not crash, it produces a
 * stage nobody can complete.
 */

import { LedgerEventType, TransactionStatus, TransactionType } from "../types/enums";
import { ValidationRuleId } from "../types/rule-ids";
import type { SupplyChainCommand } from "../commands/commands";
import { ALL_TRANSACTION_TYPES, subjectAssetId } from "../commands/command-targets";
import type { LedgerTransaction } from "../types/models";
import type { ValidationContext } from "./types";
import { failed, notApplicable, passed, type ValidationRule } from "./types";

/** Committed transactions touching an asset, oldest first. */
function committedHistoryFor(assetId: string, context: ValidationContext): LedgerTransaction[] {
  return context.state.transactionOrder
    .map((id) => context.state.transactionsById[id])
    .filter((transaction): transaction is LedgerTransaction => transaction !== undefined)
    .filter(
      (transaction) =>
        transaction.transactionStatus !== TransactionStatus.REJECTED &&
        subjectAssetId(transaction.commandPayload as SupplyChainCommand) === assetId,
    );
}

/**
 * Goods cannot be received before they were sent.
 *
 * The relevant dispatch is a custody transfer or a dispatch transaction; the
 * check is against scenario time, never wall-clock time.
 */
export const shipmentBeforeReceiptRule: ValidationRule = {
  ruleId: ValidationRuleId.SHIPMENT_BEFORE_RECEIPT,
  appliesTo: [TransactionType.RECEIVE_BATCH],
  evaluate(command, context) {
    const assetId = subjectAssetId(command);
    if (assetId === null) {
      return notApplicable(ValidationRuleId.SHIPMENT_BEFORE_RECEIPT);
    }

    const shipments = committedHistoryFor(assetId, context).filter((transaction) =>
      [TransactionType.TRANSFER_CUSTODY, TransactionType.DISPATCH_BATCH].includes(
        transaction.transactionType,
      ),
    );

    if (shipments.length === 0) {
      return failed(ValidationRuleId.SHIPMENT_BEFORE_RECEIPT, "validation.noShipmentRecorded", {
        assetId,
      });
    }

    const receiptAt = Date.parse(command.scenarioTimestamp);
    const earliestShipmentAt = Math.min(
      ...shipments.map((transaction) => Date.parse(transaction.createdAt)),
    );

    if (!Number.isFinite(receiptAt) || receiptAt < earliestShipmentAt) {
      return failed(ValidationRuleId.SHIPMENT_BEFORE_RECEIPT, "validation.receiptBeforeShipment", {
        assetId,
      });
    }

    return passed(ValidationRuleId.SHIPMENT_BEFORE_RECEIPT, "validation.shipmentBeforeReceipt");
  },
};

/** The same consignment cannot be booked in twice. */
export const receiptNotDuplicatedRule: ValidationRule = {
  ruleId: ValidationRuleId.RECEIPT_NOT_DUPLICATED,
  appliesTo: [TransactionType.RECEIVE_BATCH],
  evaluate(command, context) {
    const assetId = subjectAssetId(command);
    if (assetId === null) {
      return notApplicable(ValidationRuleId.RECEIPT_NOT_DUPLICATED);
    }

    const priorReceipts = committedHistoryFor(assetId, context).filter(
      (transaction) => transaction.transactionType === TransactionType.RECEIVE_BATCH,
    );

    if (priorReceipts.length > 0) {
      return failed(ValidationRuleId.RECEIPT_NOT_DUPLICATED, "validation.receiptDuplicated", {
        assetId,
        existingTransactionId: priorReceipts[0]?.transactionId ?? "",
      });
    }

    return passed(ValidationRuleId.RECEIPT_NOT_DUPLICATED, "validation.receiptNotDuplicated");
  },
};

/**
 * Scenario time only moves forward for a given asset. A transaction dated
 * before the asset's most recent committed event would make the history
 * self-contradictory.
 */
export const timestampSequenceValidRule: ValidationRule = {
  ruleId: ValidationRuleId.TIMESTAMP_SEQUENCE_VALID,
  appliesTo: ALL_TRANSACTION_TYPES,
  evaluate(command, context) {
    const commandAt = Date.parse(command.scenarioTimestamp);
    if (!Number.isFinite(commandAt)) {
      return failed(ValidationRuleId.TIMESTAMP_SEQUENCE_VALID, "validation.timestampInvalid");
    }

    const assetId = subjectAssetId(command);
    if (assetId === null) {
      return passed(ValidationRuleId.TIMESTAMP_SEQUENCE_VALID, "validation.timestampSequenceOk");
    }

    const history = committedHistoryFor(assetId, context);
    if (history.length === 0) {
      return passed(ValidationRuleId.TIMESTAMP_SEQUENCE_VALID, "validation.timestampSequenceOk");
    }

    const latestAt = Math.max(
      ...history.map((transaction) => Date.parse(transaction.createdAt)),
    );

    if (commandAt < latestAt) {
      return failed(
        ValidationRuleId.TIMESTAMP_SEQUENCE_VALID,
        "validation.timestampBeforePrevious",
        { assetId, proposedAt: command.scenarioTimestamp },
      );
    }

    return passed(ValidationRuleId.TIMESTAMP_SEQUENCE_VALID, "validation.timestampSequenceOk");
  },
};

export const sequenceRules: readonly ValidationRule<SupplyChainCommand>[] = [
  shipmentBeforeReceiptRule,
  receiptNotDuplicatedRule,
  timestampSequenceValidRule,
];

export { LedgerEventType };
