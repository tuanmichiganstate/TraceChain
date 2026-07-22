/**
 * Background lots that exist before the learner starts (specification section
 * 24.4).
 *
 * WHY THESE ARE SHAPED THE WAY THEY ARE
 * -------------------------------------
 * Section 31.2 requires that recall use provenance "rather than simple keyword
 * matching". The specification's own suggestion -- BAT_PACKAGED_COFFEE_002 and
 * _003 -- does not achieve that: a learner can separate them from the affected
 * lot by reading the identifier, score full marks, and learn nothing.
 *
 * So the distractors are deliberately asymmetric:
 *
 *   _002 is a NEAR MISS. Same co-operative, harvested one day later, roasted at
 *        the same plant on the same day, packaged the next day under a
 *        near-identical product name. Nothing on its label distinguishes it.
 *        Only the absence of a provenance edge from BAT_GREEN_COFFEE_001 does.
 *
 *   _003 is an EASY CONTROL. Robusta from Dak Lak. Obviously unrelated, so a
 *        learner who over-recalls everything in sight is caught too.
 *
 * A learner who recalls _002 has pattern-matched. A learner who excludes it has
 * actually followed the graph. That distinction is the whole exercise.
 */

import {
  AssetLifecycleStatus,
  AssetType,
  ComplianceStatus,
  ProvenanceRelationshipType,
  QuantityUnit,
} from "../../domain/types/enums";
import type {
  SeedProvenanceEdgeDefinition,
  SupplyChainAssetSeed,
} from "../../domain/types/scenario";
import { LocationId, OrganizationId } from "./organizations";
import { SCENARIO_FACT_DATES } from "./timeline";

export const DISTRACTOR_GREEN_BATCH_ID = "BAT_GREEN_COFFEE_002";
export const DISTRACTOR_ROASTED_BATCH_ID = "BAT_ROASTED_COFFEE_002";
export const DISTRACTOR_PACKAGED_LOT_ID = "BAT_PACKAGED_COFFEE_002";
export const UNRELATED_PACKAGED_LOT_ID = "BAT_PACKAGED_COFFEE_003";

export const coffeeSeedAssets: readonly SupplyChainAssetSeed[] = [
  // ---- The near-miss chain --------------------------------------------
  {
    assetId: DISTRACTOR_GREEN_BATCH_ID,
    assetType: AssetType.GREEN_COFFEE_BATCH,
    productName: "Arabica green coffee",
    originLocation: "Lam Dong",
    productionDate: SCENARIO_FACT_DATES.distractorBatchHarvested,
    quantity: 120,
    quantityUnit: QuantityUnit.KG,
    packageSizeGrams: null,
    ownerOrganizationId: OrganizationId.COFFEE_PROCESSOR,
    custodianOrganizationId: OrganizationId.COFFEE_PROCESSOR,
    locationId: LocationId.PROCESSING_PLANT,
    lifecycleStatus: AssetLifecycleStatus.CONSUMED_IN_TRANSFORMATION,
    complianceStatus: ComplianceStatus.COMPLIANT,
  },
  {
    assetId: DISTRACTOR_ROASTED_BATCH_ID,
    assetType: AssetType.ROASTED_COFFEE_BATCH,
    productName: "Arabica roasted coffee",
    originLocation: "Lam Dong",
    // The same roasting day as the learner's own batch. Anyone filtering by
    // date, plant, or variety will sweep this up by mistake.
    productionDate: SCENARIO_FACT_DATES.distractorBatchRoasted,
    quantity: 98,
    quantityUnit: QuantityUnit.KG,
    packageSizeGrams: null,
    ownerOrganizationId: OrganizationId.COFFEE_PROCESSOR,
    custodianOrganizationId: OrganizationId.COFFEE_PROCESSOR,
    locationId: LocationId.PROCESSING_PLANT,
    lifecycleStatus: AssetLifecycleStatus.CONSUMED_IN_TRANSFORMATION,
    complianceStatus: ComplianceStatus.COMPLIANT,
  },
  {
    assetId: DISTRACTOR_PACKAGED_LOT_ID,
    assetType: AssetType.PACKAGED_COFFEE_LOT,
    productName: "Ca phe Arabica Lam Dong 100g",
    originLocation: "Lam Dong",
    productionDate: SCENARIO_FACT_DATES.distractorBatchPackaged,
    quantity: 980,
    quantityUnit: QuantityUnit.UNIT,
    packageSizeGrams: 100,
    ownerOrganizationId: OrganizationId.RETAILER,
    custodianOrganizationId: OrganizationId.RETAILER,
    locationId: LocationId.RETAIL_STORE,
    lifecycleStatus: AssetLifecycleStatus.AVAILABLE_FOR_SALE,
    complianceStatus: ComplianceStatus.COMPLIANT,
  },

  // ---- The easy control ------------------------------------------------
  {
    assetId: UNRELATED_PACKAGED_LOT_ID,
    assetType: AssetType.PACKAGED_COFFEE_LOT,
    productName: "Ca phe Robusta Dak Lak 200g",
    originLocation: "Dak Lak",
    productionDate: SCENARIO_FACT_DATES.unrelatedLotPackaged,
    quantity: 400,
    quantityUnit: QuantityUnit.UNIT,
    packageSizeGrams: 200,
    ownerOrganizationId: OrganizationId.RETAILER,
    custodianOrganizationId: OrganizationId.RETAILER,
    locationId: LocationId.RETAIL_STORE,
    lifecycleStatus: AssetLifecycleStatus.AVAILABLE_FOR_SALE,
    complianceStatus: ComplianceStatus.COMPLIANT,
  },
];

/**
 * The near-miss chain's provenance. Without these edges the distractor is not a
 * distractor at all -- `traceForward` would have nothing to correctly exclude,
 * and the recall exercise would degenerate into name matching.
 *
 * BAT_PACKAGED_COFFEE_003 deliberately has no edges: an orphan lot that shares
 * neither ancestry nor attributes with anything the learner touches.
 */
export const coffeeSeedProvenanceEdges: readonly SeedProvenanceEdgeDefinition[] = [
  {
    sourceAssetId: DISTRACTOR_GREEN_BATCH_ID,
    targetAssetId: DISTRACTOR_ROASTED_BATCH_ID,
    relationshipType: ProvenanceRelationshipType.TRANSFORMED_INTO,
  },
  {
    sourceAssetId: DISTRACTOR_ROASTED_BATCH_ID,
    targetAssetId: DISTRACTOR_PACKAGED_LOT_ID,
    relationshipType: ProvenanceRelationshipType.PACKAGED_INTO,
  },
];
