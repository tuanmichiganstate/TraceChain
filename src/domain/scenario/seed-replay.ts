/**
 * Bringing a scenario's starting world into existence.
 *
 * Two different things are seeded, and they are seeded differently on purpose:
 *
 *   SEED ASSETS are genesis state. The background lots already existed before
 *   this ledger's recorded history begins -- they are the world the learner
 *   walks into. They carry a synthetic origin identifier rather than a
 *   transaction, because inventing transactions for them would put fictional
 *   history in the block chain and make the learner's own first block not the
 *   first block.
 *
 *   SEED TRANSACTIONS replay through the identical
 *   command -> validate -> event -> commit pipeline as learner transactions.
 *   They are real history: hash-linked, in blocks, indistinguishable from
 *   anything the learner does. History that depends on learner actions uses
 *   the separate deterministic scripted-transaction mechanism.
 */

import {
  AssetLifecycleStatus,
  SaleEligibility,
} from "../types/enums";
import type { ProvenanceEdge, SupplyChainAsset } from "../types/models";
import type { ScenarioDefinition } from "../types/scenario";
import { ScenarioConfigurationError } from "../errors";
import type { HashFunction } from "../../infrastructure/hashing/sha256";
import type { ValidationRegistries } from "../rules/types";
import {
  createEmptyDomainState,
  formatProvenanceEdgeId,
  type DomainState,
} from "../ledger/domain-state";
import { SimulatedLedger } from "../ledger/ledger-engine";

/** Marks an asset as part of the starting world rather than learner history. */
export const SEED_ORIGIN_TRANSACTION_ID = "TX_SEED";

export interface SeedResult {
  readonly state: DomainState;
  /** Seed transactions that failed validation. Empty in a healthy scenario. */
  readonly rejectedSeedIds: readonly string[];
}

export function applyScenarioSeed(
  scenario: ScenarioDefinition,
  hash: HashFunction,
  registries: ValidationRegistries,
): SeedResult {
  let state = createEmptyDomainState();

  // ---- Genesis assets --------------------------------------------------

  const assetsById: Record<string, SupplyChainAsset> = {};
  for (const seed of scenario.seedAssets) {
    assetsById[seed.assetId] = {
      assetId: seed.assetId,
      assetType: seed.assetType,
      productName: seed.productName,
      originLocation: seed.originLocation,
      productionDate: seed.productionDate,
      quantity: seed.quantity,
      quantityUnit: seed.quantityUnit,
      packageSizeGrams: seed.packageSizeGrams,
      currentOwnerId: seed.ownerOrganizationId,
      currentCustodianId: seed.custodianOrganizationId,
      currentLocationId: seed.locationId,
      lifecycleStatus: seed.lifecycleStatus,
      complianceStatus: seed.complianceStatus,
      saleEligibility:
        seed.lifecycleStatus === AssetLifecycleStatus.AVAILABLE_FOR_SALE
          ? SaleEligibility.ELIGIBLE
          : SaleEligibility.NOT_YET_ELIGIBLE,
      certificateIds: [],
      documentAnchorIds: [],
      parentAssetIds: [],
      childAssetIds: [],
      createdByTransactionId: SEED_ORIGIN_TRANSACTION_ID,
      lastUpdatedByTransactionId: SEED_ORIGIN_TRANSACTION_ID,
      stateVersion: 1,
    };
  }

  // ---- Genesis provenance ---------------------------------------------

  const provenanceEdges: ProvenanceEdge[] = [];
  let edgeSequence = 1;
  for (const seedEdge of scenario.seedProvenanceEdges) {
    const source = assetsById[seedEdge.sourceAssetId];
    const target = assetsById[seedEdge.targetAssetId];
    if (source === undefined || target === undefined) {
      // The scenario validator reports this at build time; reaching it here
      // means a scenario was constructed in code without validation.
      throw new ScenarioConfigurationError(
        `Seed provenance edge references an unseeded asset: ` +
          `${seedEdge.sourceAssetId} -> ${seedEdge.targetAssetId}`,
      );
    }

    provenanceEdges.push({
      provenanceEdgeId: formatProvenanceEdgeId(edgeSequence),
      sourceAssetId: seedEdge.sourceAssetId,
      targetAssetId: seedEdge.targetAssetId,
      relationshipType: seedEdge.relationshipType,
      transactionId: SEED_ORIGIN_TRANSACTION_ID,
    });
    edgeSequence += 1;

    // Parent and child links mirror the edges, so an asset card can show its
    // lineage without walking the graph.
    assetsById[seedEdge.targetAssetId] = {
      ...target,
      parentAssetIds: [...target.parentAssetIds, seedEdge.sourceAssetId],
    };
    assetsById[seedEdge.sourceAssetId] = {
      ...(assetsById[seedEdge.sourceAssetId] as SupplyChainAsset),
      childAssetIds: [
        ...(assetsById[seedEdge.sourceAssetId] as SupplyChainAsset).childAssetIds,
        seedEdge.targetAssetId,
      ],
    };
  }

  state = {
    ...state,
    assetsById,
    provenanceEdges,
    nextProvenanceEdgeSequence: edgeSequence,
  };

  // ---- Seeded history --------------------------------------------------

  const engine = new SimulatedLedger(hash, scenario.ledgerConfiguration);
  const rejectedSeedIds: string[] = [];

  for (const seedTransaction of scenario.seedTransactions) {
    const result = engine.submitCommand(
      state,
      seedTransaction.command,
      { actorId: seedTransaction.actorId, organizationId: seedTransaction.organizationId },
      registries,
    );
    state = result.state;
    if (!result.isAccepted) {
      rejectedSeedIds.push(seedTransaction.seedId);
    }
  }

  return { state, rejectedSeedIds };
}
