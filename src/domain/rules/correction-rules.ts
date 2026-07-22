/**
 * Corrections (specification sections 8.6 and 38.2).
 *
 * A committed record is never edited or deleted. A correction is a *new*
 * transaction that points at the original, states what was wrong, what it
 * should be, and why. Both records remain in history, and that is the whole
 * lesson of stage 5.
 *
 * These two rules are what stop a correction from being a quiet overwrite: it
 * must name what it corrects, and it must say why.
 */

import { TransactionStatus, TransactionType } from "../types/enums";
import { ValidationRuleId } from "../types/rule-ids";
import type { SupplyChainCommand } from "../commands/commands";
import {
  correctionValuesEqual,
  correctionValuesTypeCompatible,
  isCorrectionValueValid,
} from "../types/correction";
import {
  correctionTargetValueInTransaction,
  resolveEffectiveValue,
} from "../ledger/effective-value";
import { failed, notApplicable, passed, type ValidationRule } from "./types";

const MINIMUM_REASON_LENGTH = 10;

/**
 * A correction must reference a transaction that actually exists and was
 * actually committed. Correcting a rejected transaction is meaningless -- it
 * never changed anything.
 */
export const correctionReferenceExistsRule: ValidationRule = {
  ruleId: ValidationRuleId.CORRECTION_REFERENCE_EXISTS,
  appliesTo: [TransactionType.RECORD_CORRECTION],
  evaluate(command, context) {
    if (command.commandType !== TransactionType.RECORD_CORRECTION) {
      return notApplicable(ValidationRuleId.CORRECTION_REFERENCE_EXISTS);
    }

    const original = context.state.transactionsById[command.correctionOfTransactionId];
    if (original === undefined) {
      return failed(
        ValidationRuleId.CORRECTION_REFERENCE_EXISTS,
        "validation.correctionReferenceMissing",
        { transactionId: command.correctionOfTransactionId },
      );
    }
    if (original.transactionStatus !== TransactionStatus.COMMITTED) {
      return failed(
        ValidationRuleId.CORRECTION_REFERENCE_EXISTS,
        original.transactionStatus === TransactionStatus.REJECTED
          ? "validation.correctionReferencesRejected"
          : "validation.correctionReferenceNotCommitted",
        { transactionId: command.correctionOfTransactionId },
      );
    }
    if (original.transactionType === TransactionType.RECORD_CORRECTION) {
      return failed(
        ValidationRuleId.CORRECTION_REFERENCE_EXISTS,
        "validation.correctionOfCorrection",
        { transactionId: command.correctionOfTransactionId },
      );
    }

    return passed(ValidationRuleId.CORRECTION_REFERENCE_EXISTS, "validation.correctionReferenceOk");
  },
};

/** The typed target must be evidence the referenced transaction actually created. */
export const correctionTargetValidRule: ValidationRule = {
  ruleId: ValidationRuleId.CORRECTION_TARGET_VALID,
  appliesTo: [TransactionType.RECORD_CORRECTION],
  evaluate(command, context) {
    if (command.commandType !== TransactionType.RECORD_CORRECTION) {
      return notApplicable(ValidationRuleId.CORRECTION_TARGET_VALID);
    }

    const original = context.state.transactionsById[command.correctionOfTransactionId];
    if (original?.transactionStatus !== TransactionStatus.COMMITTED) {
      return failed(
        ValidationRuleId.CORRECTION_TARGET_VALID,
        "validation.correctionTargetUnknown",
      );
    }

    const originalValue = correctionTargetValueInTransaction(original, command.target);
    const commandTargetsSameAsset =
      command.target.kind === "ASSET_FIELD"
        ? command.target.assetId === command.assetId
        : (original.commandPayload as { assetId?: unknown }).assetId === command.assetId;
    if (originalValue === null || !commandTargetsSameAsset) {
      return failed(
        ValidationRuleId.CORRECTION_TARGET_VALID,
        "validation.correctionTargetNotInReference",
      );
    }

    return passed(ValidationRuleId.CORRECTION_TARGET_VALID, "validation.correctionTargetOk");
  },
};

/**
 * A correction must carry a reason, and the corrected value must differ from
 * the incorrect one. An unexplained change to the record is exactly the opacity
 * an audit trail exists to prevent.
 */
export const correctionReasonRequiredRule: ValidationRule = {
  ruleId: ValidationRuleId.CORRECTION_REASON_REQUIRED,
  appliesTo: [TransactionType.RECORD_CORRECTION],
  evaluate(command) {
    if (command.commandType !== TransactionType.RECORD_CORRECTION) {
      return notApplicable(ValidationRuleId.CORRECTION_REASON_REQUIRED);
    }

    if (command.reason.trim().length < MINIMUM_REASON_LENGTH) {
      return failed(
        ValidationRuleId.CORRECTION_REASON_REQUIRED,
        "validation.correctionReasonRequired",
        { minimumLength: MINIMUM_REASON_LENGTH },
      );
    }
    if (correctionValuesEqual(command.incorrectValue, command.correctedValue)) {
      return failed(
        ValidationRuleId.CORRECTION_REASON_REQUIRED,
        "validation.correctionValuesIdentical",
      );
    }

    return passed(ValidationRuleId.CORRECTION_REASON_REQUIRED, "validation.correctionReasonOk");
  },
};

/**
 * The stated incorrect value must equal what the target currently effectively
 * holds -- for the first correction that is the original committed value, and
 * for a later one it is the value the previous correction left. This is what
 * makes a correction chain coherent: you cannot claim to be fixing 1000 when
 * the record already reads 100.
 *
 * Deliberately generic. The scenario's numbers (1000, KG, 100) live in the
 * scenario and its tests; this rule only asks "does the stated wrong value
 * match the current effective value", whatever they happen to be.
 */
export const correctionIncorrectValueMatchesEffectiveRule: ValidationRule = {
  ruleId: ValidationRuleId.CORRECTION_INCORRECT_VALUE_MATCHES_EFFECTIVE,
  appliesTo: [TransactionType.RECORD_CORRECTION],
  evaluate(command, context) {
    if (command.commandType !== TransactionType.RECORD_CORRECTION) {
      return notApplicable(ValidationRuleId.CORRECTION_INCORRECT_VALUE_MATCHES_EFFECTIVE);
    }

    const resolution = resolveEffectiveValue(context.state, command.target);
    if (
      resolution === null ||
      resolution.originalTransactionId !== command.correctionOfTransactionId
    ) {
      return failed(
        ValidationRuleId.CORRECTION_INCORRECT_VALUE_MATCHES_EFFECTIVE,
        "validation.correctionTargetUnknown",
      );
    }
    if (!correctionValuesEqual(command.incorrectValue, resolution.effectiveValue)) {
      return failed(
        ValidationRuleId.CORRECTION_INCORRECT_VALUE_MATCHES_EFFECTIVE,
        "validation.correctionIncorrectValueMismatch",
      );
    }

    return passed(
      ValidationRuleId.CORRECTION_INCORRECT_VALUE_MATCHES_EFFECTIVE,
      "validation.correctionIncorrectValueOk",
    );
  },
};

/** Corrected values must preserve the target type/unit, be valid, and move it. */
export const correctionValueValidRule: ValidationRule = {
  ruleId: ValidationRuleId.CORRECTION_VALUE_VALID,
  appliesTo: [TransactionType.RECORD_CORRECTION],
  evaluate(command, context) {
    if (command.commandType !== TransactionType.RECORD_CORRECTION) {
      return notApplicable(ValidationRuleId.CORRECTION_VALUE_VALID);
    }

    const resolution = resolveEffectiveValue(context.state, command.target);
    if (resolution === null) {
      return failed(ValidationRuleId.CORRECTION_VALUE_VALID, "validation.correctionTargetUnknown");
    }
    if (!correctionValuesTypeCompatible(resolution.effectiveValue, command.correctedValue)) {
      return failed(
        ValidationRuleId.CORRECTION_VALUE_VALID,
        "validation.correctionValueTypeMismatch",
      );
    }
    if (!isCorrectionValueValid(command.correctedValue)) {
      return failed(ValidationRuleId.CORRECTION_VALUE_VALID, "validation.correctionValueInvalid");
    }
    if (correctionValuesEqual(command.correctedValue, resolution.effectiveValue)) {
      return failed(
        ValidationRuleId.CORRECTION_VALUE_VALID,
        "validation.correctionValuesIdentical",
      );
    }

    return passed(ValidationRuleId.CORRECTION_VALUE_VALID, "validation.correctionValueOk");
  },
};

export const correctionRules: readonly ValidationRule<SupplyChainCommand>[] = [
  correctionReferenceExistsRule,
  correctionTargetValidRule,
  correctionReasonRequiredRule,
  correctionIncorrectValueMatchesEffectiveRule,
  correctionValueValidRule,
];
