/**
 * Authoritative resolution of correctable values.
 *
 * Resolution starts at the value committed by the transaction that created
 * the target evidence, then folds valid committed corrections in deterministic
 * `transactionOrder`. No historical transaction is rewritten.
 */

import type {
  AnchorDocumentCommand,
  RecordCorrectionCommand,
  SupplyChainCommand,
} from "../commands/commands";
import {
  correctionTargetKey,
  correctionValuesEqual,
  correctionValuesTypeCompatible,
  isCorrectionValueValid,
  type CorrectionTarget,
  type CorrectionValue,
} from "../types/correction";
import { DocumentType, QuantityUnit, TransactionStatus, TransactionType } from "../types/enums";
import type { LedgerTransaction } from "../types/models";
import type { DomainState } from "./domain-state";

export interface EffectiveValueResolution {
  readonly target: CorrectionTarget;
  readonly originalTransactionId: string;
  readonly originalValue: CorrectionValue;
  readonly effectiveValue: CorrectionValue;
  readonly appliedCorrectionTransactionIds: readonly string[];
}

/**
 * Fold corrected values onto a base in caller-supplied ledger order.
 * Kept as a small pure primitive; ledger-aware callers use
 * `resolveEffectiveValue`, which additionally filters and validates the chain.
 */
export function applyCorrectionChain(
  base: CorrectionValue,
  orderedCorrectedValues: readonly CorrectionValue[],
): { readonly effectiveValue: CorrectionValue; readonly appliedCount: number } {
  const effectiveValue =
    orderedCorrectedValues.length === 0
      ? base
      : (orderedCorrectedValues[orderedCorrectedValues.length - 1] as CorrectionValue);
  return { effectiveValue, appliedCount: orderedCorrectedValues.length };
}

/**
 * The value for `target` that one transaction originally committed, or null
 * when the transaction is about a different object/field.
 */
export function correctionTargetValueInTransaction(
  transaction: LedgerTransaction,
  target: CorrectionTarget,
): CorrectionValue | null {
  const command = transaction.commandPayload as SupplyChainCommand;

  if (target.kind === "ASSET_FIELD") {
    switch (command.commandType) {
      case TransactionType.CREATE_BATCH:
        return command.assetId === target.assetId
          ? { kind: "QUANTITY", amount: command.quantity, unit: command.quantityUnit }
          : null;
      case TransactionType.TRANSFORM_BATCH:
        return command.outputAssetId === target.assetId
          ? {
              kind: "QUANTITY",
              amount: command.outputQuantity,
              unit: command.outputQuantityUnit,
            }
          : null;
      case TransactionType.PACKAGE_BATCH:
        return command.outputAssetId === target.assetId
          ? { kind: "QUANTITY", amount: command.packageCount, unit: QuantityUnit.UNIT }
          : null;
      default:
        return null;
    }
  }

  if (
    command.commandType !== TransactionType.ANCHOR_DOCUMENT ||
    command.documentAnchorId !== target.documentAnchorId
  ) {
    return null;
  }

  const anchor = command as AnchorDocumentCommand;
  if (
    target.field === "declaredQuantity" &&
    anchor.documentType === DocumentType.SHIPPING_MANIFEST &&
    anchor.metadata.kind === DocumentType.SHIPPING_MANIFEST
  ) {
    return anchor.metadata.declaredQuantity;
  }

  return null;
}

function originalResolution(
  state: DomainState,
  target: CorrectionTarget,
): Omit<EffectiveValueResolution, "effectiveValue" | "appliedCorrectionTransactionIds"> | null {
  for (const transactionId of state.transactionOrder) {
    const transaction = state.transactionsById[transactionId];
    if (transaction?.transactionStatus !== TransactionStatus.COMMITTED) continue;
    const originalValue = correctionTargetValueInTransaction(transaction, target);
    if (originalValue !== null) {
      return { target, originalTransactionId: transactionId, originalValue };
    }
  }
  return null;
}

function isApplicableCommittedCorrection(
  transaction: LedgerTransaction,
  target: CorrectionTarget,
  originalTransactionId: string,
): transaction is LedgerTransaction & { commandPayload: RecordCorrectionCommand } {
  if (
    transaction.transactionStatus !== TransactionStatus.COMMITTED ||
    transaction.transactionType !== TransactionType.RECORD_CORRECTION
  ) {
    return false;
  }
  const command = transaction.commandPayload as RecordCorrectionCommand;
  return (
    command.correctionOfTransactionId === originalTransactionId &&
    correctionTargetKey(command.target) === correctionTargetKey(target) &&
    !transaction.validationResults.some((result) => result.status === "FAILED")
  );
}

/** Resolve an original value plus every coherent committed correction. */
export function resolveEffectiveValue(
  state: DomainState,
  target: CorrectionTarget,
): EffectiveValueResolution | null {
  const original = originalResolution(state, target);
  if (original === null) return null;

  let effectiveValue = original.originalValue;
  const appliedCorrectionTransactionIds: string[] = [];

  for (const transactionId of state.transactionOrder) {
    const transaction = state.transactionsById[transactionId];
    if (
      transaction === undefined ||
      !isApplicableCommittedCorrection(transaction, target, original.originalTransactionId)
    ) {
      continue;
    }

    const correction = transaction.commandPayload;
    const coherent =
      correctionValuesEqual(correction.incorrectValue, effectiveValue) &&
      correctionValuesTypeCompatible(effectiveValue, correction.correctedValue) &&
      isCorrectionValueValid(correction.correctedValue) &&
      !correctionValuesEqual(correction.correctedValue, effectiveValue);
    if (!coherent) continue;

    effectiveValue = correction.correctedValue;
    appliedCorrectionTransactionIds.push(transactionId);
  }

  return {
    ...original,
    effectiveValue,
    appliedCorrectionTransactionIds,
  };
}

/** Convenience for consumers that need only the resolved value. */
export function effectiveValueOf(
  state: DomainState,
  target: CorrectionTarget,
): CorrectionValue | null {
  return resolveEffectiveValue(state, target)?.effectiveValue ?? null;
}
