/**
 * Asset existence, identity and lifecycle (specification section 13.3).
 */

import { AssetLifecycleStatus, TransactionType } from "../types/enums";
import { ValidationRuleId } from "../types/rule-ids";
import type { SupplyChainCommand } from "../commands/commands";
import {
  EXISTING_ASSET_TYPES,
  NOT_RECALLED_TYPES,
  producedAssetId,
  subjectAssetId,
} from "../commands/command-targets";
import { failed, notApplicable, passed, type ValidationRule } from "./types";

export const assetExistsRule: ValidationRule = {
  ruleId: ValidationRuleId.ASSET_EXISTS,
  appliesTo: EXISTING_ASSET_TYPES,
  evaluate(command, context) {
    const assetId = subjectAssetId(command);
    if (assetId === null) {
      return notApplicable(ValidationRuleId.ASSET_EXISTS);
    }
    if (context.state.assetsById[assetId] === undefined) {
      return failed(ValidationRuleId.ASSET_EXISTS, "validation.assetDoesNotExist", { assetId });
    }
    return passed(ValidationRuleId.ASSET_EXISTS, "validation.assetExists");
  },
};

/**
 * A new asset identifier must be unused. Reusing one would make the ledger's
 * history ambiguous: two different physical batches sharing a name means
 * provenance can no longer say which one a package came from.
 */
export const assetIdUniqueRule: ValidationRule = {
  ruleId: ValidationRuleId.ASSET_ID_UNIQUE,
  appliesTo: [
    TransactionType.CREATE_BATCH,
    TransactionType.TRANSFORM_BATCH,
    TransactionType.PACKAGE_BATCH,
  ],
  evaluate(command, context) {
    const assetId = producedAssetId(command);
    if (assetId === null) {
      return notApplicable(ValidationRuleId.ASSET_ID_UNIQUE);
    }
    if (assetId.trim().length === 0) {
      return failed(ValidationRuleId.ASSET_ID_UNIQUE, "validation.assetIdRequired");
    }
    if (context.state.assetsById[assetId] !== undefined) {
      return failed(ValidationRuleId.ASSET_ID_UNIQUE, "validation.assetIdAlreadyExists", {
        assetId,
      });
    }
    return passed(ValidationRuleId.ASSET_ID_UNIQUE, "validation.assetIdUnique");
  },
};

/**
 * Recalled goods are frozen. Nothing may be transferred, transformed, packaged
 * or dispatched once a recall has been recorded -- that is what makes the
 * recall mean something operationally rather than being a label.
 */
export const batchNotRecalledRule: ValidationRule = {
  ruleId: ValidationRuleId.BATCH_NOT_RECALLED,
  appliesTo: NOT_RECALLED_TYPES,
  evaluate(command, context) {
    const assetId = subjectAssetId(command);
    if (assetId === null) {
      return notApplicable(ValidationRuleId.BATCH_NOT_RECALLED);
    }
    const asset = context.state.assetsById[assetId];
    if (asset === undefined) {
      // RULE_ASSET_EXISTS reports this; not duplicated here.
      return notApplicable(ValidationRuleId.BATCH_NOT_RECALLED);
    }
    if (asset.lifecycleStatus === AssetLifecycleStatus.RECALLED) {
      return failed(ValidationRuleId.BATCH_NOT_RECALLED, "validation.batchRecalled", { assetId });
    }
    return passed(ValidationRuleId.BATCH_NOT_RECALLED, "validation.batchNotRecalled");
  },
};

/**
 * Lifecycle transitions that make no physical sense are rejected: goods already
 * consumed in a transformation no longer exist to be shipped, and a batch
 * cannot be received twice.
 */
const FORBIDDEN_WHEN: Partial<Record<TransactionType, readonly AssetLifecycleStatus[]>> = {
  [TransactionType.TRANSFER_CUSTODY]: [
    AssetLifecycleStatus.CONSUMED_IN_TRANSFORMATION,
    AssetLifecycleStatus.CLOSED,
  ],
  [TransactionType.TRANSFER_OWNERSHIP]: [
    AssetLifecycleStatus.CONSUMED_IN_TRANSFORMATION,
    AssetLifecycleStatus.CLOSED,
  ],
  [TransactionType.TRANSFORM_BATCH]: [
    AssetLifecycleStatus.CONSUMED_IN_TRANSFORMATION,
    AssetLifecycleStatus.CLOSED,
  ],
  [TransactionType.PACKAGE_BATCH]: [
    AssetLifecycleStatus.CONSUMED_IN_TRANSFORMATION,
    AssetLifecycleStatus.CLOSED,
  ],
  [TransactionType.DISPATCH_BATCH]: [
    AssetLifecycleStatus.CONSUMED_IN_TRANSFORMATION,
    AssetLifecycleStatus.CLOSED,
  ],
};

export const validStateTransitionRule: ValidationRule = {
  ruleId: ValidationRuleId.VALID_STATE_TRANSITION,
  appliesTo: Object.keys(FORBIDDEN_WHEN) as TransactionType[],
  evaluate(command, context) {
    const assetId = subjectAssetId(command);
    if (assetId === null) {
      return notApplicable(ValidationRuleId.VALID_STATE_TRANSITION);
    }
    const asset = context.state.assetsById[assetId];
    if (asset === undefined) {
      return notApplicable(ValidationRuleId.VALID_STATE_TRANSITION);
    }

    const forbidden = FORBIDDEN_WHEN[command.commandType] ?? [];
    if (forbidden.includes(asset.lifecycleStatus)) {
      return failed(ValidationRuleId.VALID_STATE_TRANSITION, "validation.invalidStateTransition", {
        assetId,
        lifecycleStatus: asset.lifecycleStatus,
        action: command.commandType,
      });
    }
    return passed(ValidationRuleId.VALID_STATE_TRANSITION, "validation.validStateTransition");
  },
};

export const assetRules: readonly ValidationRule<SupplyChainCommand>[] = [
  assetExistsRule,
  assetIdUniqueRule,
  batchNotRecalledRule,
  validStateTransitionRule,
];
