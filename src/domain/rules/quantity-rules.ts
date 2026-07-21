/**
 * Quantity and unit rules (specification section 13.3).
 */

import { QuantityUnit, TransactionType } from "../types/enums";
import { ValidationRuleId } from "../types/rule-ids";
import type { SupplyChainCommand } from "../commands/commands";
import { subjectAssetId } from "../commands/command-targets";
import { isConvertibleToGrams, isMassNotGreaterThan, toGrams } from "../units/convert";
import { failed, notApplicable, passed, type ValidationRule } from "./types";

/** The quantity a command declares, whatever the command calls it. */
function declaredQuantity(
  command: SupplyChainCommand,
): { quantity: number; unit: QuantityUnit; packageSizeGrams: number | null } | null {
  switch (command.commandType) {
    case TransactionType.CREATE_BATCH:
      return {
        quantity: command.quantity,
        unit: command.quantityUnit,
        packageSizeGrams: command.packageSizeGrams,
      };
    case TransactionType.TRANSFORM_BATCH:
      return {
        quantity: command.outputQuantity,
        unit: command.outputQuantityUnit,
        packageSizeGrams: command.outputPackageSizeGrams,
      };
    case TransactionType.PACKAGE_BATCH:
      return {
        quantity: command.packageCount,
        unit: QuantityUnit.UNIT,
        packageSizeGrams: command.packageSizeGrams,
      };
    case TransactionType.RECEIVE_BATCH:
      return {
        quantity: command.observedQuantity,
        unit: command.quantityUnit,
        packageSizeGrams: null,
      };
    case TransactionType.TRANSFER_CUSTODY:
      return null;
    default:
      return null;
  }
}

const QUANTITY_BEARING_TYPES = [
  TransactionType.CREATE_BATCH,
  TransactionType.TRANSFORM_BATCH,
  TransactionType.PACKAGE_BATCH,
  TransactionType.RECEIVE_BATCH,
];

export const validQuantityRule: ValidationRule = {
  ruleId: ValidationRuleId.VALID_QUANTITY,
  appliesTo: QUANTITY_BEARING_TYPES,
  evaluate(command) {
    const declared = declaredQuantity(command);
    if (declared === null) {
      return notApplicable(ValidationRuleId.VALID_QUANTITY);
    }
    if (!Number.isFinite(declared.quantity)) {
      return failed(ValidationRuleId.VALID_QUANTITY, "validation.quantityNotANumber");
    }
    if (declared.quantity <= 0) {
      return failed(ValidationRuleId.VALID_QUANTITY, "validation.quantityMustBePositive", {
        quantity: declared.quantity,
      });
    }
    return passed(ValidationRuleId.VALID_QUANTITY, "validation.quantityValid");
  },
};

/**
 * A unit must be convertible to a mass, or later rules have nothing to compare.
 * An asset measured in packages without a declared package size is exactly the
 * gap that makes a transformation check impossible.
 */
export const unitCompatibleRule: ValidationRule = {
  ruleId: ValidationRuleId.UNIT_COMPATIBLE,
  appliesTo: QUANTITY_BEARING_TYPES,
  evaluate(command) {
    const declared = declaredQuantity(command);
    if (declared === null) {
      return notApplicable(ValidationRuleId.UNIT_COMPATIBLE);
    }
    if (!isConvertibleToGrams(declared.unit, declared.packageSizeGrams)) {
      return failed(ValidationRuleId.UNIT_COMPATIBLE, "validation.packageSizeRequired", {
        quantityUnit: declared.unit,
      });
    }
    if (declared.unit !== QuantityUnit.UNIT && declared.packageSizeGrams !== null) {
      return failed(ValidationRuleId.UNIT_COMPATIBLE, "validation.packageSizeNotApplicable", {
        quantityUnit: declared.unit,
      });
    }
    return passed(ValidationRuleId.UNIT_COMPATIBLE, "validation.unitCompatible");
  },
};

/**
 * You cannot move more than exists.
 *
 * Comparison is by mass, not by raw number, for the same reason the
 * transformation rule is: a receipt recorded in kilograms against a lot held in
 * packages is a perfectly ordinary situation.
 */
export const availableQuantityRule: ValidationRule = {
  ruleId: ValidationRuleId.AVAILABLE_QUANTITY,
  appliesTo: [TransactionType.RECEIVE_BATCH],
  evaluate(command, context) {
    const declared = declaredQuantity(command);
    const assetId = subjectAssetId(command);
    if (declared === null || assetId === null) {
      return notApplicable(ValidationRuleId.AVAILABLE_QUANTITY);
    }
    const asset = context.state.assetsById[assetId];
    if (asset === undefined) {
      return notApplicable(ValidationRuleId.AVAILABLE_QUANTITY);
    }

    const observed = toGrams(declared.quantity, declared.unit, declared.packageSizeGrams);
    const onLedger = toGrams(asset.quantity, asset.quantityUnit, asset.packageSizeGrams);
    if (!observed.ok || !onLedger.ok) {
      return failed(ValidationRuleId.AVAILABLE_QUANTITY, "validation.quantityNotComparable", {
        assetId,
      });
    }

    /*
     * A receipt that is *smaller* than the ledger says is the normal case in
     * stage 5: the manifest claims 1000 kg and the scales say 100 kg. That is a
     * discrepancy to correct, not a transaction to reject -- so it is a warning
     * the learner must act on, not a failure that blocks them.
     */
    if (!isMassNotGreaterThan(observed.grams, onLedger.grams)) {
      return failed(ValidationRuleId.AVAILABLE_QUANTITY, "validation.quantityExceedsLedger", {
        observedGrams: observed.grams,
        ledgerGrams: onLedger.grams,
      });
    }
    if (observed.grams < onLedger.grams) {
      return {
        ruleId: ValidationRuleId.AVAILABLE_QUANTITY,
        status: "WARNING" as never,
        messageKey: "validation.quantityBelowLedger",
        details: { observedGrams: observed.grams, ledgerGrams: onLedger.grams },
      };
    }

    return passed(ValidationRuleId.AVAILABLE_QUANTITY, "validation.quantityAvailable");
  },
};

export const quantityRules: readonly ValidationRule<SupplyChainCommand>[] = [
  validQuantityRule,
  unitCompatibleRule,
  availableQuantityRule,
];
