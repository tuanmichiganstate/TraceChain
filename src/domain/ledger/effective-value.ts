/**
 * The current effective value of a correctable target.
 *
 * A value can be corrected more than once -- 1000 -> 100, then 100 -> 98 -- and
 * every one of those transactions stays in history. The effective value is the
 * last link in that chain, resolved in ledger order, never a mutable field
 * someone overwrote.
 *
 * For an ASSET_FIELD the ledger already tracks the live value on the asset (the
 * reducer moves it with each correction), so that field *is* the effective
 * value. For a DOCUMENT_METADATA_FIELD nothing on the asset tracks it: the base
 * is the value the referenced document declared, and each committed correction
 * for that same target supersedes it, in the order the transactions committed.
 */

import type { DomainState } from "./domain-state";
import type { CorrectionValue, CorrectionTarget } from "../types/correction";
import { correctionTargetKey } from "../types/correction";
import type { RecordCorrectionCommand } from "../commands/commands";
import { TransactionType, QuantityUnit } from "../types/enums";

/**
 * Fold a chain of corrected values onto a base, in the order given.
 *
 * Pure and independent of the ledger, so the "apply successive corrections in
 * order" logic can be tested on its own. The caller is responsible for passing
 * the corrections already sorted into ledger order.
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

/** Committed corrections for one target, oldest first. */
function committedCorrectionsFor(
  state: DomainState,
  target: CorrectionTarget,
): readonly RecordCorrectionCommand[] {
  const key = correctionTargetKey(target);
  const matches: RecordCorrectionCommand[] = [];
  for (const transactionId of state.transactionOrder) {
    const transaction = state.transactionsById[transactionId];
    if (transaction === undefined) continue;
    const command = transaction.commandPayload as { commandType?: unknown };
    if (command.commandType !== TransactionType.RECORD_CORRECTION) continue;
    const correction = command as unknown as RecordCorrectionCommand;
    if (correctionTargetKey(correction.target) === key) matches.push(correction);
  }
  return matches;
}

/** The declared value a document anchored, if the referenced transaction has one. */
function declaredBaseValue(
  state: DomainState,
  documentAnchorId: string,
): CorrectionValue | null {
  for (const transactionId of state.transactionOrder) {
    const transaction = state.transactionsById[transactionId];
    if (transaction === undefined) continue;
    const command = transaction.commandPayload as {
      commandType?: unknown;
      documentAnchorId?: unknown;
      declaredQuantity?: unknown;
      declaredQuantityUnit?: unknown;
    };
    if (
      command.commandType === TransactionType.ANCHOR_DOCUMENT &&
      command.documentAnchorId === documentAnchorId &&
      typeof command.declaredQuantity === "number"
    ) {
      return {
        kind: "QUANTITY",
        amount: command.declaredQuantity,
        unit: (command.declaredQuantityUnit as QuantityUnit | undefined) ?? QuantityUnit.KG,
      };
    }
  }
  return null;
}

/**
 * The value a correction submitted now must state as its "incorrect" value:
 * whatever the target currently effectively holds. `null` when it cannot be
 * determined -- an unknown asset, or a document field with no declared base and
 * no corrections yet -- which the caller treats as a validation failure.
 */
export function effectiveValueOf(
  state: DomainState,
  target: CorrectionTarget,
): CorrectionValue | null {
  if (target.kind === "ASSET_FIELD") {
    const asset = state.assetsById[target.assetId];
    if (asset === undefined) return null;
    // Only "quantity" is correctable today; the live field is the effective value.
    return { kind: "QUANTITY", amount: asset.quantity, unit: asset.quantityUnit };
  }

  const corrections = committedCorrectionsFor(state, target);
  const base = declaredBaseValue(state, target.documentAnchorId);
  if (base === null) {
    // No declared base: the effective value is the latest correction, if any.
    if (corrections.length === 0) return null;
    return (corrections[corrections.length - 1] as RecordCorrectionCommand).correctedValue;
  }
  return applyCorrectionChain(
    base,
    corrections.map((correction) => correction.correctedValue),
  ).effectiveValue;
}
