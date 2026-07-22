/**
 * Recall scope (specification section 24.2 and 24.3).
 *
 * The rules, restated because getting them exactly right is the whole exercise:
 *
 *   - Include the source asset.
 *   - Include all direct and indirect descendants.
 *   - Do NOT include ancestors. A contaminated roasted batch does not
 *     retroactively contaminate the green coffee it came from.
 *   - Do NOT include assets with no provenance path from the source, however
 *     similar they look.
 *
 * That last one is what the near-miss distractor lot tests. It shares producer,
 * variety, region, processing plant and roasting date with the affected batch,
 * and differs only in having no edge back to it. A learner who recalls it has
 * pattern-matched; a learner who excludes it has followed the graph.
 */

import { AssetLifecycleStatus } from "../types/enums";
import type { SupplyChainAsset } from "../types/models";
import type { DomainState } from "../ledger/domain-state";
import { traceForward } from "./trace";

export interface RecallLocation {
  readonly locationId: string;
  readonly assetIds: readonly string[];
}

export enum RecallActionType {
  QUARANTINE_STOCK = "QUARANTINE_STOCK",
  NOTIFY_CURRENT_OWNER = "NOTIFY_CURRENT_OWNER",
  NOTIFY_CUSTODIAN = "NOTIFY_CUSTODIAN",
  WITHDRAW_FROM_SALE = "WITHDRAW_FROM_SALE",
}

export interface RecallAction {
  readonly actionType: RecallActionType;
  readonly assetId: string;
  readonly organizationId: string;
}

export interface RecallScopeResult {
  readonly sourceAssetId: string;
  /** The source plus every descendant, in traversal order. */
  readonly affectedAssetIds: readonly string[];
  /** Every other asset on the ledger. Recalling one of these is an error. */
  readonly unaffectedAssetIds: readonly string[];
  /**
   * Physical retrieval needs separate evidence. The current scenario issues a
   * recall and identifies affected lineage, but records no pickup confirmation.
   */
  readonly confirmedRetrievedAssetIds: readonly string[];
  readonly currentLocations: readonly RecallLocation[];
  readonly currentOwners: readonly string[];
  readonly currentCustodians: readonly string[];
  readonly recommendedActions: readonly RecallAction[];
}

export function calculateRecallScope(
  sourceAssetId: string,
  state: DomainState,
): RecallScopeResult {
  const descendants = traceForward(sourceAssetId, state.provenanceEdges);

  // The source itself is always affected, even with no descendants.
  const affected = state.assetsById[sourceAssetId] === undefined
    ? [...descendants.assetIds]
    : [sourceAssetId, ...descendants.assetIds];

  const affectedSet = new Set(affected);
  const unaffected = Object.keys(state.assetsById).filter((id) => !affectedSet.has(id));

  const affectedAssets = affected
    .map((id) => state.assetsById[id])
    .filter((asset): asset is SupplyChainAsset => asset !== undefined);

  const locationMap = new Map<string, string[]>();
  for (const asset of affectedAssets) {
    const existing = locationMap.get(asset.currentLocationId);
    if (existing === undefined) {
      locationMap.set(asset.currentLocationId, [asset.assetId]);
    } else {
      existing.push(asset.assetId);
    }
  }

  const recommendedActions: RecallAction[] = [];
  for (const asset of affectedAssets) {
    recommendedActions.push({
      actionType: RecallActionType.NOTIFY_CURRENT_OWNER,
      assetId: asset.assetId,
      organizationId: asset.currentOwnerId,
    });
    if (asset.currentCustodianId !== asset.currentOwnerId) {
      recommendedActions.push({
        actionType: RecallActionType.NOTIFY_CUSTODIAN,
        assetId: asset.assetId,
        organizationId: asset.currentCustodianId,
      });
    }
    // Stock already on a shelf needs withdrawing; stock consumed in a
    // transformation no longer exists to withdraw.
    if (asset.lifecycleStatus === AssetLifecycleStatus.AVAILABLE_FOR_SALE) {
      recommendedActions.push({
        actionType: RecallActionType.WITHDRAW_FROM_SALE,
        assetId: asset.assetId,
        organizationId: asset.currentCustodianId,
      });
    } else if (asset.lifecycleStatus !== AssetLifecycleStatus.CONSUMED_IN_TRANSFORMATION) {
      recommendedActions.push({
        actionType: RecallActionType.QUARANTINE_STOCK,
        assetId: asset.assetId,
        organizationId: asset.currentCustodianId,
      });
    }
  }

  return {
    sourceAssetId,
    affectedAssetIds: affected,
    unaffectedAssetIds: unaffected,
    confirmedRetrievedAssetIds: [],
    currentLocations: [...locationMap].map(([locationId, assetIds]) => ({
      locationId,
      assetIds,
    })),
    currentOwners: [...new Set(affectedAssets.map((asset) => asset.currentOwnerId))],
    currentCustodians: [...new Set(affectedAssets.map((asset) => asset.currentCustodianId))],
    recommendedActions,
  };
}

export interface RecallJustification {
  readonly assetId: string;
  readonly isAffected: boolean;
  /**
   * The provenance path, source first, ending at this asset. Empty when no path
   * exists -- which is the whole answer for the near-miss distractor lot.
   */
  readonly pathAssetIds: readonly string[];
}

/**
 * Why one asset is, or is not, in the recall scope.
 *
 * The score already tells a learner whether their selection was right. It does
 * not tell them *why*, and for the near-miss distractor that is the entire
 * lesson: two lots share producer, variety, plant and roasting date, and the
 * only thing separating them is a provenance edge. Returning the path makes the
 * reason inspectable rather than asserted.
 */
export function justifyRecallSelection(
  assetId: string,
  sourceAssetId: string,
  state: DomainState,
): RecallJustification {
  if (assetId === sourceAssetId) {
    return { assetId, isAffected: true, pathAssetIds: [sourceAssetId] };
  }

  /*
   * A real walk forward from the source, not the source's ancestor list sorted
   * into some order. On this scenario's linear chain the two agree, but the
   * domain already contemplates two batches blended into one lot, and there an
   * ancestor list would present parallel inputs as consecutive steps -- a chain
   * of custody that never happened. Breadth-first also makes it the shortest
   * such path, which is the one worth showing.
   */
  const childrenOf = new Map<string, string[]>();
  for (const edge of state.provenanceEdges) {
    const existing = childrenOf.get(edge.sourceAssetId);
    if (existing === undefined) childrenOf.set(edge.sourceAssetId, [edge.targetAssetId]);
    else existing.push(edge.targetAssetId);
  }

  // `visited` doubles as the predecessor map, so a cycle or a repeated edge is
  // walked once and cannot loop.
  const previous = new Map<string, string | null>([[sourceAssetId, null]]);
  let frontier = [sourceAssetId];

  while (frontier.length > 0 && !previous.has(assetId)) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const child of childrenOf.get(current) ?? []) {
        if (previous.has(child)) continue;
        previous.set(child, current);
        next.push(child);
      }
    }
    frontier = next;
  }

  if (!previous.has(assetId)) {
    return { assetId, isAffected: false, pathAssetIds: [] };
  }

  const reversed: string[] = [];
  for (let step: string | null = assetId; step !== null; step = previous.get(step) ?? null) {
    reversed.push(step);
  }

  return { assetId, isAffected: true, pathAssetIds: reversed.reverse() };
}

export interface RecallAccuracy {
  readonly isExact: boolean;
  /** Correctly identified as affected. */
  readonly correctlySelected: readonly string[];
  /** Selected but not actually affected -- destroying good stock. */
  readonly overSelected: readonly string[];
  /** Affected but not selected -- leaving contaminated product on sale. */
  readonly missed: readonly string[];
}

/**
 * Compare what the learner selected against the true scope.
 *
 * Both error directions are reported separately because they are different
 * mistakes with different real-world costs, and section 19.3 permits recall
 * precision to be scored more strictly than other items.
 */
export function assessRecallSelection(
  selectedAssetIds: readonly string[],
  scope: RecallScopeResult,
): RecallAccuracy {
  const selected = new Set(selectedAssetIds);
  const affected = new Set(scope.affectedAssetIds);

  const correctlySelected = [...affected].filter((id) => selected.has(id));
  const overSelected = [...selected].filter((id) => !affected.has(id));
  const missed = [...affected].filter((id) => !selected.has(id));

  return {
    isExact: overSelected.length === 0 && missed.length === 0,
    correctlySelected,
    overSelected,
    missed,
  };
}
