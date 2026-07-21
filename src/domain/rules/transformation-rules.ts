/**
 * Transformation and packaging (specification section 8.7).
 *
 * These carry the fix for the specification's one blocking arithmetic defect --
 * see `transformationOutputNotGreaterThanInputRule` below.
 */

import { QuantityUnit, TransactionType } from "../types/enums";
import { ValidationRuleId } from "../types/rule-ids";
import type { SupplyChainCommand } from "../commands/commands";
import { isMassNotGreaterThan, toGrams } from "../units/convert";
import { failed, notApplicable, passed, type ValidationRule } from "./types";

const TRANSFORMING_TYPES = [TransactionType.TRANSFORM_BATCH, TransactionType.PACKAGE_BATCH];

/** Input and output as mass, whichever transforming command this is. */
function transformationQuantities(
  command: SupplyChainCommand,
): { inputAssetId: string; outputQuantity: number; outputUnit: QuantityUnit; outputPackageSizeGrams: number | null } | null {
  if (command.commandType === TransactionType.TRANSFORM_BATCH) {
    return {
      inputAssetId: command.inputAssetId,
      outputQuantity: command.outputQuantity,
      outputUnit: command.outputQuantityUnit,
      outputPackageSizeGrams: command.outputPackageSizeGrams,
    };
  }
  if (command.commandType === TransactionType.PACKAGE_BATCH) {
    return {
      inputAssetId: command.inputAssetId,
      outputQuantity: command.packageCount,
      outputUnit: QuantityUnit.UNIT,
      outputPackageSizeGrams: command.packageSizeGrams,
    };
  }
  return null;
}

export const transformationInputExistsRule: ValidationRule = {
  ruleId: ValidationRuleId.TRANSFORMATION_INPUT_EXISTS,
  appliesTo: TRANSFORMING_TYPES,
  evaluate(command, context) {
    const quantities = transformationQuantities(command);
    if (quantities === null) {
      return notApplicable(ValidationRuleId.TRANSFORMATION_INPUT_EXISTS);
    }
    if (context.state.assetsById[quantities.inputAssetId] === undefined) {
      return failed(
        ValidationRuleId.TRANSFORMATION_INPUT_EXISTS,
        "validation.transformationInputMissing",
        { assetId: quantities.inputAssetId },
      );
    }
    return passed(ValidationRuleId.TRANSFORMATION_INPUT_EXISTS, "validation.transformationInputOk");
  },
};

export const transformationOutputUniqueRule: ValidationRule = {
  ruleId: ValidationRuleId.TRANSFORMATION_OUTPUT_UNIQUE,
  appliesTo: TRANSFORMING_TYPES,
  evaluate(command, context) {
    if (
      command.commandType !== TransactionType.TRANSFORM_BATCH &&
      command.commandType !== TransactionType.PACKAGE_BATCH
    ) {
      return notApplicable(ValidationRuleId.TRANSFORMATION_OUTPUT_UNIQUE);
    }
    if (command.outputAssetId === command.inputAssetId) {
      return failed(
        ValidationRuleId.TRANSFORMATION_OUTPUT_UNIQUE,
        "validation.transformationOutputSameAsInput",
      );
    }
    if (context.state.assetsById[command.outputAssetId] !== undefined) {
      return failed(
        ValidationRuleId.TRANSFORMATION_OUTPUT_UNIQUE,
        "validation.transformationOutputExists",
        { assetId: command.outputAssetId },
      );
    }
    return passed(ValidationRuleId.TRANSFORMATION_OUTPUT_UNIQUE, "validation.transformationOutputUnique");
  },
};

/**
 * THE BLOCKING DEFECT.
 *
 * As written in specification sections 8.7 and 13.3, this rule compares raw
 * `quantity` numbers. Roasting passes -- 82 <= 100, both in kilograms. Packaging
 * does not: the input is 82 KG and the output is 820 UNIT of 100 g each, so a
 * numeric comparison sees 820 > 82 and rejects it. Stage 7 would have been
 * impossible to complete.
 *
 * The mass is in fact exactly conserved:
 *
 *     82 KG                 -> 82 000 g
 *     820 UNIT x 100 g      -> 82 000 g
 *
 * So both sides normalize to grams before comparison. The rule still catches
 * what it is meant to catch: 900 packages out of 82 kg is 90 kg from 82 kg, and
 * fails.
 */
export const transformationOutputNotGreaterThanInputRule: ValidationRule = {
  ruleId: ValidationRuleId.TRANSFORMATION_OUTPUT_NOT_GREATER_THAN_INPUT,
  appliesTo: TRANSFORMING_TYPES,
  evaluate(command, context) {
    const quantities = transformationQuantities(command);
    if (quantities === null) {
      return notApplicable(ValidationRuleId.TRANSFORMATION_OUTPUT_NOT_GREATER_THAN_INPUT);
    }

    const input = context.state.assetsById[quantities.inputAssetId];
    if (input === undefined) {
      // RULE_TRANSFORMATION_INPUT_EXISTS reports this.
      return notApplicable(ValidationRuleId.TRANSFORMATION_OUTPUT_NOT_GREATER_THAN_INPUT);
    }

    const inputMass = toGrams(input.quantity, input.quantityUnit, input.packageSizeGrams);
    const outputMass = toGrams(
      quantities.outputQuantity,
      quantities.outputUnit,
      quantities.outputPackageSizeGrams,
    );

    if (!inputMass.ok || !outputMass.ok) {
      return failed(
        ValidationRuleId.TRANSFORMATION_OUTPUT_NOT_GREATER_THAN_INPUT,
        "validation.quantityNotComparable",
        { assetId: quantities.inputAssetId },
      );
    }

    if (!isMassNotGreaterThan(outputMass.grams, inputMass.grams)) {
      return failed(
        ValidationRuleId.TRANSFORMATION_OUTPUT_NOT_GREATER_THAN_INPUT,
        "validation.transformationOutputExceedsInput",
        { inputGrams: inputMass.grams, outputGrams: outputMass.grams },
      );
    }

    return passed(
      ValidationRuleId.TRANSFORMATION_OUTPUT_NOT_GREATER_THAN_INPUT,
      "validation.transformationYieldOk",
    );
  },
};

export const transformationRules: readonly ValidationRule<SupplyChainCommand>[] = [
  transformationInputExistsRule,
  transformationOutputUniqueRule,
  transformationOutputNotGreaterThanInputRule,
];
