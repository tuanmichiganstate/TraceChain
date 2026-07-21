/**
 * Provenance traversal (specification section 24.1).
 *
 * Backward tracing answers "what did this come from"; forward tracing answers
 * "what did this become". The recall exercise depends entirely on the forward
 * direction being *exact* -- too wide and unaffected stock is destroyed, too
 * narrow and contaminated product stays on the shelf.
 *
 * Both traversals guard against cycles. A well-formed provenance graph is
 * acyclic, but scenario data is authored by hand and a cycle would otherwise
 * hang the browser rather than report a problem.
 */

import type { ProvenanceEdge } from "../types/models";

export interface TraceabilityResult {
  readonly rootAssetId: string;
  /** Reachable assets, excluding the root, in breadth-first order. */
  readonly assetIds: readonly string[];
  readonly edges: readonly ProvenanceEdge[];
  /** Longest path length from the root, in edges. */
  readonly depth: number;
}

type Direction = "FORWARD" | "BACKWARD";

function traverse(
  rootAssetId: string,
  edges: readonly ProvenanceEdge[],
  direction: Direction,
): TraceabilityResult {
  const isForward = direction === "FORWARD";

  // Adjacency built once per call; the graphs here are tiny, and this keeps the
  // traversal linear rather than rescanning every edge per hop.
  const adjacency = new Map<string, ProvenanceEdge[]>();
  for (const edge of edges) {
    const from = isForward ? edge.sourceAssetId : edge.targetAssetId;
    const existing = adjacency.get(from);
    if (existing === undefined) {
      adjacency.set(from, [edge]);
    } else {
      existing.push(edge);
    }
  }

  const visited = new Set<string>([rootAssetId]);
  const reached: string[] = [];
  const usedEdges: ProvenanceEdge[] = [];
  let frontier: string[] = [rootAssetId];
  let depth = 0;

  while (frontier.length > 0) {
    const nextFrontier: string[] = [];

    for (const assetId of frontier) {
      for (const edge of adjacency.get(assetId) ?? []) {
        const neighbour = isForward ? edge.targetAssetId : edge.sourceAssetId;
        usedEdges.push(edge);
        if (visited.has(neighbour)) {
          continue; // Already reached, or a cycle.
        }
        visited.add(neighbour);
        reached.push(neighbour);
        nextFrontier.push(neighbour);
      }
    }

    if (nextFrontier.length > 0) depth += 1;
    frontier = nextFrontier;
  }

  return { rootAssetId, assetIds: reached, edges: usedEdges, depth };
}

/** Everything this asset became, directly or indirectly. */
export function traceForward(
  assetId: string,
  provenanceEdges: readonly ProvenanceEdge[],
): TraceabilityResult {
  return traverse(assetId, provenanceEdges, "FORWARD");
}

/** Everything this asset came from, directly or indirectly. */
export function traceBackward(
  assetId: string,
  provenanceEdges: readonly ProvenanceEdge[],
): TraceabilityResult {
  return traverse(assetId, provenanceEdges, "BACKWARD");
}

/**
 * The full chain through an asset: ancestors, the asset itself, descendants.
 * This is what the consumer-facing verification view renders.
 */
export function traceFullLineage(
  assetId: string,
  provenanceEdges: readonly ProvenanceEdge[],
): readonly string[] {
  const backward = traceBackward(assetId, provenanceEdges);
  const forward = traceForward(assetId, provenanceEdges);
  return [...[...backward.assetIds].reverse(), assetId, ...forward.assetIds];
}
