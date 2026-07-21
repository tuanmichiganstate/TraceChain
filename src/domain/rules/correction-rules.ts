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
    if (original.transactionStatus === TransactionStatus.REJECTED) {
      return failed(
        ValidationRuleId.CORRECTION_REFERENCE_EXISTS,
        "validation.correctionReferencesRejected",
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
    if (command.fieldName.trim().length === 0) {
      return failed(ValidationRuleId.CORRECTION_REASON_REQUIRED, "validation.correctionFieldRequired");
    }
    if (command.incorrectValue === command.correctedValue) {
      return failed(
        ValidationRuleId.CORRECTION_REASON_REQUIRED,
        "validation.correctionValuesIdentical",
      );
    }

    return passed(ValidationRuleId.CORRECTION_REASON_REQUIRED, "validation.correctionReasonOk");
  },
};

export const correctionRules: readonly ValidationRule<SupplyChainCommand>[] = [
  correctionReferenceExistsRule,
  correctionReasonRequiredRule,
];
