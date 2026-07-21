/**
 * Hash payload construction (specification sections 15.3 and 15.4).
 *
 * Each payload is an explicit, narrowly-typed object rather than a filtered
 * view of a larger record. That is how the requirement to "exclude calculated
 * hash fields from the payload being hashed" is met: the field being calculated
 * simply has no place in the payload type, so it cannot be included by
 * accident. Filtering by key name would be ambiguous, since `previousBlockHash`
 * and `contentHash` are legitimate hash *inputs*.
 */

import type { SupplyChainAsset } from "../../domain/types/models";
import type { TransactionType } from "../../domain/types/enums";
import { canonicalize } from "./canonicalize";
import type { HashFunction } from "./sha256";

export interface TransactionHashPayload {
  readonly transactionId: string;
  readonly transactionType: TransactionType;
  readonly commandPayload: unknown;
  readonly proposedByOrganizationId: string;
  readonly committedAt: string;
  readonly previousAssetStateHash: string | null;
  readonly resultingAssetStateHash: string;
}

/** Note the absence of `blockHash`: a block cannot contain its own digest. */
export interface BlockHashPayload {
  readonly blockId: string;
  readonly blockNumber: number;
  readonly previousBlockHash: string | null;
  readonly transactionHashes: readonly string[];
  readonly createdAt: string;
  readonly orderingServiceId: string;
}

export function calculateTransactionHash(
  payload: TransactionHashPayload,
  hash: HashFunction,
): string {
  return hash(canonicalize(payload));
}

export function calculateBlockHash(payload: BlockHashPayload, hash: HashFunction): string {
  return hash(canonicalize(payload));
}

/**
 * Digest of an asset's world state, used as the before/after anchor in a
 * transaction hash. `stateVersion` is included, so two states that differ only
 * in how many times the asset has been touched hash differently.
 */
export function calculateAssetStateHash(asset: SupplyChainAsset, hash: HashFunction): string {
  return hash(canonicalize(asset));
}
