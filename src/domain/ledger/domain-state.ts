/**
 * The world state the ledger maintains, plus the reducer that advances it.
 *
 * THE REDUCER IS PURE AND SYNCHRONOUS. It never hashes, never reads a clock,
 * never imports React. Hashes are metadata computed *after* the reducer runs,
 * at the ledger commit boundary. Keeping that boundary sharp is what makes
 * attempt replay deterministic and every domain test trivial to write.
 */

import {
  AssetLifecycleStatus,
  ComplianceStatus,
  LedgerEventType,
  SaleEligibility,
} from "../types/enums";
import type {
  DocumentAnchor,
  LedgerBlock,
  LedgerTransaction,
  ProvenanceEdge,
  SupplyChainAsset,
} from "../types/models";
import type { LedgerDomainEvent } from "../events/events";

export interface DomainState {
  readonly assetsById: Readonly<Record<string, SupplyChainAsset>>;
  readonly transactionsById: Readonly<Record<string, LedgerTransaction>>;
  readonly transactionOrder: readonly string[];
  readonly blocksById: Readonly<Record<string, LedgerBlock>>;
  readonly blockOrder: readonly string[];
  readonly documentAnchorsById: Readonly<Record<string, DocumentAnchor>>;
  readonly provenanceEdges: readonly ProvenanceEdge[];
  /**
   * Accepted by the ordering service but not yet sealed into a block. Making
   * this visible is a deliberate teaching device: ordering and commitment are
   * genuinely separate steps, and the interface shows the queue draining.
   */
  readonly pendingTransactionIds: readonly string[];
  readonly nextTransactionSequence: number;
  readonly nextBlockSequence: number;
  readonly nextProvenanceEdgeSequence: number;
}

export function createEmptyDomainState(): DomainState {
  return {
    assetsById: {},
    transactionsById: {},
    transactionOrder: [],
    blocksById: {},
    blockOrder: [],
    documentAnchorsById: {},
    provenanceEdges: [],
    pendingTransactionIds: [],
    nextTransactionSequence: 1,
    nextBlockSequence: 1,
    nextProvenanceEdgeSequence: 1,
  };
}

/** Deterministic identifiers (specification section 5.3). No random UUIDs. */
export function formatTransactionId(sequence: number): string {
  return `TX_${String(sequence).padStart(6, "0")}`;
}

export function formatBlockId(sequence: number): string {
  return `BLK_${String(sequence).padStart(6, "0")}`;
}

export function formatProvenanceEdgeId(sequence: number): string {
  return `EDGE_${String(sequence).padStart(6, "0")}`;
}

/**
 * Apply a committed event to world state.
 *
 * Milestone 0 handles BATCH_CREATED. Every other event type is declared in the
 * union and returns state unchanged for now, so that the exhaustiveness check
 * at the bottom continues to compile as handlers are added in Milestone 2.
 */
export function reduce(state: DomainState, event: LedgerDomainEvent): DomainState {
  switch (event.eventType) {
    case LedgerEventType.BATCH_CREATED: {
      const asset: SupplyChainAsset = {
        assetId: event.assetId,
        assetType: event.assetType,
        productName: event.productName,
        originLocation: event.originLocation,
        productionDate: event.productionDate,
        quantity: event.quantity,
        quantityUnit: event.quantityUnit,
        packageSizeGrams: event.packageSizeGrams,
        currentOwnerId: event.ownerOrganizationId,
        currentCustodianId: event.custodianOrganizationId,
        currentLocationId: event.locationId,
        lifecycleStatus: AssetLifecycleStatus.CREATED,
        complianceStatus: ComplianceStatus.PENDING_CERTIFICATION,
        saleEligibility: SaleEligibility.NOT_YET_ELIGIBLE,
        certificateIds: [],
        documentAnchorIds: [],
        parentAssetIds: [],
        childAssetIds: [],
        createdByTransactionId: event.transactionId,
        lastUpdatedByTransactionId: event.transactionId,
        stateVersion: 1,
      };
      return {
        ...state,
        assetsById: { ...state.assetsById, [asset.assetId]: asset },
      };
    }

    // Milestone 2 adds the remaining handlers. Listing them explicitly keeps
    // the switch exhaustive, so a new event type is a compile error until it
    // is handled here.
    case LedgerEventType.CUSTODY_TRANSFERRED:
    case LedgerEventType.OWNERSHIP_TRANSFERRED:
    case LedgerEventType.DOCUMENT_ANCHORED:
    case LedgerEventType.CERTIFICATE_ISSUED:
    case LedgerEventType.TRANSPORT_CONDITION_RECORDED:
    case LedgerEventType.BATCH_RECEIVED:
    case LedgerEventType.CORRECTION_RECORDED:
    case LedgerEventType.BATCH_TRANSFORMED:
    case LedgerEventType.BATCH_PACKAGED:
    case LedgerEventType.BATCH_DISPATCHED:
    case LedgerEventType.BATCH_RECALLED:
      return state;

    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

/** Bump an asset's version and last-writer, applied by every mutating handler. */
export function touchAsset(
  asset: SupplyChainAsset,
  transactionId: string,
): SupplyChainAsset {
  return {
    ...asset,
    lastUpdatedByTransactionId: transactionId,
    stateVersion: asset.stateVersion + 1,
  };
}
