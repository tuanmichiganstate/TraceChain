/**
 * Unit normalization.
 *
 * The specification defines QuantityUnit (section 10.5) and names
 * RULE_UNIT_COMPATIBLE (section 13.3) but never states a conversion policy.
 * Without one, RULE_TRANSFORMATION_OUTPUT_NOT_GREATER_THAN_INPUT compares raw
 * numbers -- and the packaging step in stage 7 turns 82 KG of roasted coffee
 * into 820 UNIT of 100 g packages. Comparing 820 against 82 rejects a valid
 * operation and blocks the stage entirely.
 *
 * Everything is normalized to grams before comparison:
 *
 *     82 KG   -> 82 000 g
 *     820 UNIT x 100 g/unit -> 82 000 g      (equal, so the rule passes)
 */

import { QuantityUnit } from "../types/enums";

/** Grams per unit for units with a fixed mass. UNIT is asset-dependent. */
const GRAMS_PER_UNIT: Readonly<Record<QuantityUnit, number | null>> = {
  [QuantityUnit.KG]: 1000,
  [QuantityUnit.GRAM]: 1,
  [QuantityUnit.UNIT]: null,
};

export type ConversionResult =
  | { readonly ok: true; readonly grams: number }
  | { readonly ok: false; readonly reason: ConversionFailureReason };

export enum ConversionFailureReason {
  /** The quantity was measured in UNIT but the asset declares no package size. */
  PACKAGE_SIZE_UNKNOWN = "PACKAGE_SIZE_UNKNOWN",
  /** The package size was zero or negative, so no meaningful mass exists. */
  PACKAGE_SIZE_INVALID = "PACKAGE_SIZE_INVALID",
  /** The quantity was not a finite number. */
  QUANTITY_NOT_FINITE = "QUANTITY_NOT_FINITE",
}

/**
 * Convert a quantity to grams.
 *
 * `packageSizeGrams` is only consulted for QuantityUnit.UNIT; it is taken from
 * the asset being measured, since a "unit" of packaged coffee has no universal
 * mass.
 */
export function toGrams(
  quantity: number,
  unit: QuantityUnit,
  packageSizeGrams: number | null,
): ConversionResult {
  if (!Number.isFinite(quantity)) {
    return { ok: false, reason: ConversionFailureReason.QUANTITY_NOT_FINITE };
  }

  const fixedFactor = GRAMS_PER_UNIT[unit];
  if (fixedFactor !== null) {
    return { ok: true, grams: quantity * fixedFactor };
  }

  if (packageSizeGrams === null) {
    return { ok: false, reason: ConversionFailureReason.PACKAGE_SIZE_UNKNOWN };
  }
  if (!Number.isFinite(packageSizeGrams) || packageSizeGrams <= 0) {
    return { ok: false, reason: ConversionFailureReason.PACKAGE_SIZE_INVALID };
  }

  return { ok: true, grams: quantity * packageSizeGrams };
}

/**
 * True when a quantity can be expressed in grams -- the check behind
 * RULE_UNIT_COMPATIBLE.
 */
export function isConvertibleToGrams(
  unit: QuantityUnit,
  packageSizeGrams: number | null,
): boolean {
  return toGrams(1, unit, packageSizeGrams).ok;
}

/**
 * Tolerance for mass comparisons. Scenario quantities are integers and the
 * conversion factors are integers, so results are exact; this guards only
 * against a content author introducing a fractional quantity later.
 */
const MASS_COMPARISON_TOLERANCE_GRAMS = 1e-6;

/** True when `left` is no greater than `right`, within tolerance. */
export function isMassNotGreaterThan(leftGrams: number, rightGrams: number): boolean {
  return leftGrams - rightGrams <= MASS_COMPARISON_TOLERANCE_GRAMS;
}
