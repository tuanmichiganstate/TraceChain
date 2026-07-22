/**
 * Typed correction targets and values.
 *
 * A correction used to carry a bare `fieldName: string` and string values, and
 * that permissiveness hid two bugs the stage 5 repair exists to close:
 *
 *   - `"1000"` could not say whether it meant 1000 KG or 1000 UNIT, so the
 *     rules could not check a stated wrong value against what was committed;
 *   - the reducer only understood `fieldName === "quantity"` and silently
 *     ignored every other name, so a correction to a document's declared
 *     quantity would commit and change nothing.
 *
 * Making both the target and the values typed unions means an incoherent
 * correction cannot be represented, rather than being caught (or missed) at
 * runtime.
 */

import type { QuantityUnit } from "./enums";

/** The only asset field a correction may move. Deliberately a closed set. */
export type CorrectableAssetField = "quantity";

/** The only document-metadata field a correction may move. */
export type CorrectableDocumentField = "declaredQuantity";

/**
 * What a correction points at.
 *
 * `ASSET_FIELD` moves a value the ledger tracks on the asset itself, so the
 * reducer updates it. `DOCUMENT_METADATA_FIELD` corrects a claim recorded on a
 * document -- a shipping manifest's declared quantity -- which the asset does
 * not track: nothing on the asset moves, and the effective value is derived by
 * replaying the correction chain. Keeping these distinct is what stops the
 * manifest correction from being smuggled in as an asset-quantity edit.
 */
export type CorrectionTarget =
  | {
      readonly kind: "ASSET_FIELD";
      readonly assetId: string;
      readonly field: CorrectableAssetField;
    }
  | {
      readonly kind: "DOCUMENT_METADATA_FIELD";
      readonly documentAnchorId: string;
      readonly field: CorrectableDocumentField;
    };

/**
 * A correction's before/after value, carrying enough type to be compared
 * unambiguously. A quantity knows its unit; text and dates keep their own
 * shapes so a future correction of a name or a date needs no new plumbing.
 */
export type CorrectionValue =
  | { readonly kind: "QUANTITY"; readonly amount: number; readonly unit: QuantityUnit }
  | { readonly kind: "TEXT"; readonly value: string }
  | { readonly kind: "DATE"; readonly value: string };

/** Typed equality: a quantity differs from another of a different unit. */
export function correctionValuesEqual(a: CorrectionValue, b: CorrectionValue): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "QUANTITY":
      return a.amount === (b as { amount: number }).amount && a.unit === (b as { unit: QuantityUnit }).unit;
    case "TEXT":
    case "DATE":
      return a.value === (b as { value: string }).value;
  }
}

/** A stable key for "the same target", so corrections to it can be grouped. */
export function correctionTargetKey(target: CorrectionTarget): string {
  return target.kind === "ASSET_FIELD"
    ? `ASSET:${target.assetId}:${target.field}`
    : `DOC:${target.documentAnchorId}:${target.field}`;
}

/** Human-facing rendering of a value, for feedback and reports. Identifiers-safe. */
export function formatCorrectionValue(value: CorrectionValue): string {
  switch (value.kind) {
    case "QUANTITY":
      return `${value.amount} ${value.unit}`;
    case "TEXT":
    case "DATE":
      return value.value;
  }
}
