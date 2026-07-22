/**
 * The world state the ledger maintains, plus the reducer that advances it.
 *
 * THE REDUCER IS PURE AND SYNCHRONOUS. It never hashes, never reads a clock,
 * never imports React. Hashes are metadata computed *after* the reducer runs,
 * at the ledger commit boundary. Keeping that boundary sharp is what makes
 * attempt replay deterministic and every domain test trivial to write.
 *
 * Applying an event cannot fail. Everything that could go wrong was decided by
 * the rule engine before the event was emitted, so there is no error path here
 * -- only state transitions.
 */

import {
  AssetLifecycleStatus,
  ComplianceStatus,
  DocumentVerificationStatus,
  LedgerEventType,
  ProvenanceRelationshipType,
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

/** Bump an asset's version and last-writer. Applied by every mutating handler. */
export function touchAsset(asset: SupplyChainAsset, transactionId: string): SupplyChainAsset {
  return {
    ...asset,
    lastUpdatedByTransactionId: transactionId,
    stateVersion: asset.stateVersion + 1,
  };
}

/** Replace one asset, leaving the rest of state alone. */
function withAsset(state: DomainState, asset: SupplyChainAsset): DomainState {
  return { ...state, assetsById: { ...state.assetsById, [asset.assetId]: asset } };
}

/**
 * Apply a committed event to world state.
 *
 * The switch is exhaustive: adding an event type without handling it here is a
 * compile error, not a silent no-op.
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
      return withAsset(state, asset);
    }

    case LedgerEventType.DOCUMENT_ANCHORED: {
      const anchor: DocumentAnchor = {
        documentAnchorId: event.documentAnchorId,
        documentType: event.documentType,
        fileName: event.fileName,
        contentHash: event.contentHash,
        metadata: event.metadata,
        hashAlgorithm: "SHA-256",
        issuerOrganizationId: event.issuerOrganizationId,
        issuedAt: event.issuedAt,
        // The file lives outside the chain; only its digest and metadata are on
        // it. That distinction is the entire lesson of stage 3.
        storageLocationType: "SIMULATED_OFF_CHAIN",
        verificationStatus: DocumentVerificationStatus.HASH_MATCHED,
        ...(event.expiresAt === undefined ? {} : { expiresAt: event.expiresAt }),
      };

      const asset = state.assetsById[event.assetId];
      const nextState: DomainState = {
        ...state,
        documentAnchorsById: {
          ...state.documentAnchorsById,
          [anchor.documentAnchorId]: anchor,
        },
      };
      if (asset === undefined) return nextState;

      return withAsset(
        nextState,
        touchAsset(
          {
            ...asset,
            documentAnchorIds: [...asset.documentAnchorIds, anchor.documentAnchorId],
          },
          event.transactionId,
        ),
      );
    }

    case LedgerEventType.CERTIFICATE_ISSUED: {
      const asset = state.assetsById[event.assetId];
      if (asset === undefined) return state;
      return withAsset(
        state,
        touchAsset(
          {
            ...asset,
            certificateIds: [...asset.certificateIds, event.certificateId],
            complianceStatus: event.complianceStatus,
            lifecycleStatus: AssetLifecycleStatus.CERTIFIED,
          },
          event.transactionId,
        ),
      );
    }

    case LedgerEventType.OWNERSHIP_TRANSFERRED: {
      const asset = state.assetsById[event.assetId];
      if (asset === undefined) return state;
      // Custody is deliberately untouched. Ownership and custody move
      // independently, and conflating them here would undo the whole lesson.
      return withAsset(
        state,
        touchAsset({ ...asset, currentOwnerId: event.newOwnerId }, event.transactionId),
      );
    }

    case LedgerEventType.CUSTODY_TRANSFERRED: {
      const asset = state.assetsById[event.assetId];
      if (asset === undefined) return state;
      // Ownership is deliberately untouched, for the same reason.
      return withAsset(
        state,
        touchAsset(
          {
            ...asset,
            currentCustodianId: event.newCustodianId,
            currentLocationId: event.newLocationId,
            lifecycleStatus: AssetLifecycleStatus.IN_TRANSIT,
          },
          event.transactionId,
        ),
      );
    }

    case LedgerEventType.TRANSPORT_CONDITION_RECORDED: {
      const asset = state.assetsById[event.assetId];
      if (asset === undefined) return state;
      return withAsset(
        state,
        touchAsset(
          {
            ...asset,
            complianceStatus: event.resultingComplianceStatus,
            currentLocationId: event.locationId,
          },
          event.transactionId,
        ),
      );
    }

    case LedgerEventType.BATCH_RECEIVED: {
      const asset = state.assetsById[event.assetId];
      if (asset === undefined) return state;
      return withAsset(
        state,
        touchAsset(
          {
            ...asset,
            currentCustodianId: event.receivingOrganizationId,
            currentLocationId: event.locationId,
            lifecycleStatus: AssetLifecycleStatus.RECEIVED,
          },
          event.transactionId,
        ),
      );
    }

    case LedgerEventType.CORRECTION_RECORDED: {
      const asset = state.assetsById[event.assetId];
      if (asset === undefined) return state;

      /*
       * The original transaction is left completely untouched -- it stays in
       * history, still bearing the wrong value. Only current state moves. That
       * is the difference between correcting a record and editing one, and it
       * is what stage 5 exists to demonstrate.
       *
       * Only an ASSET_FIELD correction moves state the ledger tracks. A
       * DOCUMENT_METADATA_FIELD correction -- the shipping manifest's declared
       * quantity -- changes nothing here: the asset never held that value, and
       * its effective figure is derived by replaying the correction chain
       * (see effective-value.ts), not stored. Editing asset.quantity from a
       * manifest correction is exactly the shortcut stage 5 must not take.
       */
      if (
        event.target.kind === "ASSET_FIELD" &&
        event.target.field === "quantity" &&
        event.correctedValue.kind === "QUANTITY"
      ) {
        const corrected = { ...asset, quantity: event.correctedValue.amount };
        return withAsset(state, touchAsset(corrected, event.transactionId));
      }

      return state;
    }

    case LedgerEventType.BATCH_TRANSFORMED:
    case LedgerEventType.BATCH_PACKAGED: {
      const input = state.assetsById[event.inputAssetId];
      if (input === undefined) return state;

      const isPackaging = event.eventType === LedgerEventType.BATCH_PACKAGED;
      const outputQuantity = isPackaging ? event.packageCount : event.outputQuantity;
      const outputUnit = isPackaging ? ("UNIT" as SupplyChainAsset["quantityUnit"]) : event.outputQuantityUnit;
      const outputPackageSize = isPackaging ? event.packageSizeGrams : event.outputPackageSizeGrams;
      const outputType = isPackaging
        ? ("PACKAGED_COFFEE_LOT" as SupplyChainAsset["assetType"])
        : event.outputAssetType;
      const relationship = isPackaging
        ? ProvenanceRelationshipType.PACKAGED_INTO
        : event.relationshipType;

      const output: SupplyChainAsset = {
        assetId: event.outputAssetId,
        assetType: outputType,
        productName: event.outputProductName,
        // Origin survives transformation: that is what makes provenance work.
        originLocation: input.originLocation,
        productionDate: event.committedAt,
        quantity: outputQuantity,
        quantityUnit: outputUnit,
        packageSizeGrams: outputPackageSize,
        currentOwnerId: input.currentOwnerId,
        currentCustodianId: input.currentCustodianId,
        currentLocationId: input.currentLocationId,
        lifecycleStatus: isPackaging
          ? AssetLifecycleStatus.PACKAGED
          : AssetLifecycleStatus.PROCESSED,
        complianceStatus: input.complianceStatus,
        saleEligibility: SaleEligibility.NOT_YET_ELIGIBLE,
        certificateIds: [],
        documentAnchorIds: [],
        parentAssetIds: [input.assetId],
        childAssetIds: [],
        createdByTransactionId: event.transactionId,
        lastUpdatedByTransactionId: event.transactionId,
        stateVersion: 1,
      };

      const consumedInput = touchAsset(
        {
          ...input,
          lifecycleStatus: AssetLifecycleStatus.CONSUMED_IN_TRANSFORMATION,
          childAssetIds: [...input.childAssetIds, output.assetId],
        },
        event.transactionId,
      );

      const edge: ProvenanceEdge = {
        provenanceEdgeId: formatProvenanceEdgeId(state.nextProvenanceEdgeSequence),
        sourceAssetId: input.assetId,
        targetAssetId: output.assetId,
        relationshipType: relationship,
        transactionId: event.transactionId,
      };

      return {
        ...state,
        assetsById: {
          ...state.assetsById,
          [consumedInput.assetId]: consumedInput,
          [output.assetId]: output,
        },
        provenanceEdges: [...state.provenanceEdges, edge],
        nextProvenanceEdgeSequence: state.nextProvenanceEdgeSequence + 1,
      };
    }

    case LedgerEventType.BATCH_DISPATCHED: {
      const asset = state.assetsById[event.assetId];
      if (asset === undefined) return state;
      // A sale moves both: the retailer owns the goods and holds them.
      return withAsset(
        state,
        touchAsset(
          {
            ...asset,
            currentOwnerId: event.toOrganizationId,
            currentCustodianId: event.toOrganizationId,
            currentLocationId: event.toLocationId,
            lifecycleStatus: AssetLifecycleStatus.AVAILABLE_FOR_SALE,
            saleEligibility: SaleEligibility.ELIGIBLE,
          },
          event.transactionId,
        ),
      );
    }

    case LedgerEventType.BATCH_RECALLED: {
      /*
       * Every affected asset is frozen at once. Nothing is deleted: previous
       * transfers, sales and transformations all remain in history exactly as
       * they were, and only the current state changes.
       */
      const updated: Record<string, SupplyChainAsset> = {};
      for (const assetId of event.affectedAssetIds) {
        const asset = state.assetsById[assetId];
        if (asset === undefined) continue;
        updated[assetId] = touchAsset(
          {
            ...asset,
            lifecycleStatus: AssetLifecycleStatus.RECALLED,
            complianceStatus: ComplianceStatus.RECALLED,
            saleEligibility: SaleEligibility.PROHIBITED,
          },
          event.transactionId,
        );
      }
      return { ...state, assetsById: { ...state.assetsById, ...updated } };
    }

    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}
