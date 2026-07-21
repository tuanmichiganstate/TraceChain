/**
 * Uniform access to the parts of a command that generic rules need.
 *
 * Rules like RULE_ASSET_EXISTS and RULE_BATCH_NOT_RECALLED apply across most
 * transaction types, but each command names its subject differently --
 * `assetId`, `inputAssetId`, `sourceAssetId`. Without these accessors every
 * generic rule would need its own switch, and adding a command type would mean
 * editing every rule.
 */

import { TransactionType } from "../types/enums";
import type { SupplyChainCommand } from "./commands";

/**
 * The asset a transaction reads or modifies. For a transformation this is the
 * *input*: the thing that must already exist and must not be recalled.
 */
export function subjectAssetId(command: SupplyChainCommand): string | null {
  switch (command.commandType) {
    case TransactionType.CREATE_BATCH:
      // Nothing yet exists to be the subject; uniqueness is checked instead.
      return null;
    case TransactionType.TRANSFORM_BATCH:
    case TransactionType.PACKAGE_BATCH:
      return command.inputAssetId;
    case TransactionType.RECALL_BATCH:
      return command.sourceAssetId;
    default:
      return command.assetId;
  }
}

/** The asset a transaction brings into existence, if any. */
export function producedAssetId(command: SupplyChainCommand): string | null {
  switch (command.commandType) {
    case TransactionType.CREATE_BATCH:
      return command.assetId;
    case TransactionType.TRANSFORM_BATCH:
    case TransactionType.PACKAGE_BATCH:
      return command.outputAssetId;
    default:
      return null;
  }
}

/** The organization receiving goods or ownership, if any. */
export function receivingOrganizationId(command: SupplyChainCommand): string | null {
  switch (command.commandType) {
    case TransactionType.TRANSFER_CUSTODY:
    case TransactionType.TRANSFER_OWNERSHIP:
    case TransactionType.DISPATCH_BATCH:
      return command.toOrganizationId;
    case TransactionType.RECEIVE_BATCH:
      return command.receivingOrganizationId;
    default:
      return null;
  }
}

/** Transaction types that require the actor to be physically holding the goods. */
export const CUSTODY_REQUIRED_TYPES: readonly TransactionType[] = [
  TransactionType.TRANSFER_CUSTODY,
  TransactionType.RECORD_TRANSPORT_CONDITION,
  TransactionType.TRANSFORM_BATCH,
  TransactionType.PACKAGE_BATCH,
];

/**
 * Transaction types that require the actor to own the goods.
 *
 * DISPATCH_BATCH sits here rather than with the custody rules: in stage 7 the
 * distributor has taken ownership while the packages are still at the plant,
 * and it is the owner who directs where they ship. Requiring custody instead
 * would make that stage impossible -- and would teach the wrong thing, since
 * directing a shipment is an ownership right, not a custody one.
 */
export const OWNERSHIP_REQUIRED_TYPES: readonly TransactionType[] = [
  TransactionType.TRANSFER_OWNERSHIP,
  TransactionType.DISPATCH_BATCH,
];

/** Transaction types that act on an asset which must already exist. */
export const EXISTING_ASSET_TYPES: readonly TransactionType[] = [
  TransactionType.ANCHOR_DOCUMENT,
  TransactionType.ISSUE_CERTIFICATE,
  TransactionType.TRANSFER_OWNERSHIP,
  TransactionType.TRANSFER_CUSTODY,
  TransactionType.RECORD_TRANSPORT_CONDITION,
  TransactionType.RECEIVE_BATCH,
  TransactionType.RECORD_CORRECTION,
  TransactionType.TRANSFORM_BATCH,
  TransactionType.PACKAGE_BATCH,
  TransactionType.DISPATCH_BATCH,
  TransactionType.RECALL_BATCH,
];

/**
 * Every transaction type except a recall, which is precisely the operation that
 * acts *on* recalled goods.
 */
export const NOT_RECALLED_TYPES: readonly TransactionType[] = EXISTING_ASSET_TYPES.filter(
  (type) => type !== TransactionType.RECALL_BATCH,
);

export const ALL_TRANSACTION_TYPES: readonly TransactionType[] =
  Object.values(TransactionType);
