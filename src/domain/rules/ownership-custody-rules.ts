/**
 * Ownership and custody.
 *
 * This is the most important file in the rule engine. The distinction between
 * owning goods and holding them is the central conceptual objective of the
 * whole simulation (specification section 2.2), and these three rules are what
 * make it real rather than a sentence in an instruction panel.
 */

import { TransactionType } from "../types/enums";
import { ValidationRuleId } from "../types/rule-ids";
import type { SupplyChainCommand } from "../commands/commands";
import {
  CUSTODY_REQUIRED_TYPES,
  OWNERSHIP_REQUIRED_TYPES,
  subjectAssetId,
} from "../commands/command-targets";
import { failed, notApplicable, passed, type ValidationRule } from "./types";

/**
 * You cannot hand over goods you are not holding.
 *
 * The specification's own example of this rule firing: a distributor trying to
 * transfer custody of a batch the carrier is still driving.
 */
export const currentCustodianRequiredRule: ValidationRule = {
  ruleId: ValidationRuleId.CURRENT_CUSTODIAN_REQUIRED,
  appliesTo: CUSTODY_REQUIRED_TYPES,
  evaluate(command, context) {
    const assetId = subjectAssetId(command);
    if (assetId === null) {
      return notApplicable(ValidationRuleId.CURRENT_CUSTODIAN_REQUIRED);
    }
    const asset = context.state.assetsById[assetId];
    if (asset === undefined) {
      return notApplicable(ValidationRuleId.CURRENT_CUSTODIAN_REQUIRED);
    }

    if (asset.currentCustodianId !== context.organizationId) {
      return failed(
        ValidationRuleId.CURRENT_CUSTODIAN_REQUIRED,
        "validation.currentCustodianRequired",
        {
          expectedCustodian: asset.currentCustodianId,
          actualActorOrganization: context.organizationId,
        },
      );
    }

    // Where the command also names the sender, the two must agree.
    if (
      command.commandType === TransactionType.TRANSFER_CUSTODY &&
      command.fromOrganizationId !== asset.currentCustodianId
    ) {
      return failed(
        ValidationRuleId.CURRENT_CUSTODIAN_REQUIRED,
        "validation.custodianMismatch",
        {
          declaredSender: command.fromOrganizationId,
          actualCustodian: asset.currentCustodianId,
        },
      );
    }

    return passed(ValidationRuleId.CURRENT_CUSTODIAN_REQUIRED, "validation.currentCustodianOk");
  },
};

/** You cannot sell or ship goods you do not own. */
export const currentOwnerRequiredRule: ValidationRule = {
  ruleId: ValidationRuleId.CURRENT_OWNER_REQUIRED,
  appliesTo: OWNERSHIP_REQUIRED_TYPES,
  evaluate(command, context) {
    const assetId = subjectAssetId(command);
    if (assetId === null) {
      return notApplicable(ValidationRuleId.CURRENT_OWNER_REQUIRED);
    }
    const asset = context.state.assetsById[assetId];
    if (asset === undefined) {
      return notApplicable(ValidationRuleId.CURRENT_OWNER_REQUIRED);
    }

    if (asset.currentOwnerId !== context.organizationId) {
      return failed(ValidationRuleId.CURRENT_OWNER_REQUIRED, "validation.currentOwnerRequired", {
        expectedOwner: asset.currentOwnerId,
        actualActorOrganization: context.organizationId,
      });
    }

    if (
      command.commandType === TransactionType.TRANSFER_OWNERSHIP &&
      command.fromOrganizationId !== asset.currentOwnerId
    ) {
      return failed(ValidationRuleId.CURRENT_OWNER_REQUIRED, "validation.ownerMismatch", {
        declaredSender: command.fromOrganizationId,
        actualOwner: asset.currentOwnerId,
      });
    }

    return passed(ValidationRuleId.CURRENT_OWNER_REQUIRED, "validation.currentOwnerOk");
  },
};

/**
 * THE RULE THE SPECIFICATION REQUIRED BUT NEVER DEFINED.
 *
 * Section 8.4 says validation "must reject a transaction that incorrectly
 * changes ownership" when the learner hands goods to a carrier -- the carrier
 * transports them, the co-operative still owns them. But no rule in section
 * 13.3 enforced it, so the single most important conceptual distinction in the
 * simulation had nothing behind it.
 *
 * Its failure message is a teaching message, not an error message: the learner
 * is meant to read it, understand why moving ownership to a haulier is wrong,
 * and retry.
 */
export const ownershipUnchangedOnCustodyTransferRule: ValidationRule = {
  ruleId: ValidationRuleId.OWNERSHIP_UNCHANGED_ON_CUSTODY_TRANSFER,
  appliesTo: [TransactionType.TRANSFER_CUSTODY],
  evaluate(command, context) {
    if (command.commandType !== TransactionType.TRANSFER_CUSTODY) {
      return notApplicable(ValidationRuleId.OWNERSHIP_UNCHANGED_ON_CUSTODY_TRANSFER);
    }

    if (command.alsoTransfersOwnership) {
      const asset = context.state.assetsById[command.assetId];
      return failed(
        ValidationRuleId.OWNERSHIP_UNCHANGED_ON_CUSTODY_TRANSFER,
        "validation.ownershipMustNotTransferWithCustody",
        {
          currentOwner: asset?.currentOwnerId ?? "",
          proposedNewCustodian: command.toOrganizationId,
        },
      );
    }

    return passed(
      ValidationRuleId.OWNERSHIP_UNCHANGED_ON_CUSTODY_TRANSFER,
      "validation.ownershipUnchanged",
    );
  },
};

export const ownershipCustodyRules: readonly ValidationRule<SupplyChainCommand>[] = [
  currentCustodianRequiredRule,
  currentOwnerRequiredRule,
  ownershipUnchangedOnCustodyTransferRule,
];
