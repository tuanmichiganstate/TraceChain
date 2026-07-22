import { describe, expect, it } from "vitest";
import { ProvenanceRelationshipType } from "../types/enums";
import type { ProvenanceEdge } from "../types/models";
import { traceBackward, traceForward, traceFullLineage } from "./trace";
import { calculateRecallScope, justifyRecallSelection } from "./recall-scope";
import { createEmptyDomainState, type DomainState } from "../ledger/domain-state";

let sequence = 0;
function edge(source: string, target: string): ProvenanceEdge {
  sequence += 1;
  return {
    provenanceEdgeId: `EDGE_${String(sequence).padStart(6, "0")}`,
    sourceAssetId: source,
    targetAssetId: target,
    relationshipType: ProvenanceRelationshipType.TRANSFORMED_INTO,
    transactionId: `TX_${String(sequence).padStart(6, "0")}`,
  };
}

/** A -> B -> C, the shape of the coffee scenario's own chain. */
const linear = [edge("A", "B"), edge("B", "C")];

describe("provenance traversal", () => {
  describe("forward", () => {
    it("finds direct and indirect descendants in order", () => {
      const result = traceForward("A", linear);
      expect(result.assetIds).toEqual(["B", "C"]);
      expect(result.depth).toBe(2);
    });

    it("finds nothing beyond a leaf", () => {
      expect(traceForward("C", linear).assetIds).toEqual([]);
    });

    it("finds nothing for an asset with no edges at all", () => {
      expect(traceForward("ORPHAN", linear).assetIds).toEqual([]);
    });

    it("never includes the root itself", () => {
      expect(traceForward("A", linear).assetIds).not.toContain("A");
    });

    it("follows a branch to every leaf", () => {
      // One batch split into two packaged lots.
      const branching = [edge("A", "B"), edge("A", "C"), edge("B", "D")];
      const result = traceForward("A", branching);
      expect([...result.assetIds].sort()).toEqual(["B", "C", "D"]);
    });

    it("visits a shared descendant only once", () => {
      // Two inputs blended into one output, which is then packaged.
      const diamond = [edge("A", "B"), edge("A", "C"), edge("B", "D"), edge("C", "D")];
      const result = traceForward("A", diamond);
      expect(result.assetIds.filter((id) => id === "D")).toHaveLength(1);
    });
  });

  describe("backward", () => {
    it("finds direct and indirect ancestors", () => {
      expect(traceBackward("C", linear).assetIds).toEqual(["B", "A"]);
    });

    it("finds nothing above a root", () => {
      expect(traceBackward("A", linear).assetIds).toEqual([]);
    });

    it("finds every ancestor of a blended output", () => {
      const blend = [edge("A", "C"), edge("B", "C")];
      expect([...traceBackward("C", blend).assetIds].sort()).toEqual(["A", "B"]);
    });
  });

  describe("robustness", () => {
    /**
     * A well-formed provenance graph is acyclic, but scenario data is authored
     * by hand. Without the visited guard this would spin forever and hang the
     * learner's browser rather than reporting anything.
     */
    it("terminates on a cyclic graph instead of hanging", () => {
      const cyclic = [edge("A", "B"), edge("B", "C"), edge("C", "A")];
      const forward = traceForward("A", cyclic);
      expect(forward.assetIds).toEqual(["B", "C"]);
      expect(traceBackward("A", cyclic).assetIds).toEqual(["C", "B"]);
    });

    it("terminates on a self-referencing edge", () => {
      expect(traceForward("A", [edge("A", "A")]).assetIds).toEqual([]);
    });

    it("handles an empty graph", () => {
      expect(traceForward("A", []).assetIds).toEqual([]);
      expect(traceBackward("A", []).depth).toBe(0);
    });
  });

  describe("full lineage", () => {
    it("reads oldest ancestor to newest descendant, through the asset itself", () => {
      // What the consumer-facing verification view renders.
      expect(traceFullLineage("B", linear)).toEqual(["A", "B", "C"]);
    });
  });
});

describe("recall justification paths", () => {
  /**
   * The path has to be a walk the goods actually took. An earlier version
   * derived it by listing the asset's ancestors and reversing them, which is
   * indistinguishable from a real path on a straight chain and wrong the moment
   * anything blends: parallel inputs came back as consecutive steps.
   */
  function stateWith(edges: readonly ProvenanceEdge[]): DomainState {
    return { ...createEmptyDomainState(), provenanceEdges: edges };
  }

  it("reads from the contaminated source to the selected lot", () => {
    const justification = justifyRecallSelection("C", "A", stateWith(linear));
    expect(justification.isAffected).toBe(true);
    expect(justification.pathAssetIds).toEqual(["A", "B", "C"]);
  });

  it("returns a genuine walk when a lot has an unrelated second input", () => {
    // D is made from C (which came from the contaminated A) and from E, which
    // has nothing to do with A. E is an ancestor of D but is not on any walk
    // from A to D, so naming it would assert a chain of custody that never
    // happened.
    const blended = [edge("A", "C"), edge("C", "D"), edge("E", "D")];
    const justification = justifyRecallSelection("D", "A", stateWith(blended));

    expect(justification.pathAssetIds).toEqual(["A", "C", "D"]);
    expect(justification.pathAssetIds).not.toContain("E");
  });

  it("gives an unreachable lot no path at all", () => {
    expect(justifyRecallSelection("ORPHAN", "A", stateWith(linear))).toEqual({
      assetId: "ORPHAN",
      isAffected: false,
      pathAssetIds: [],
    });
  });

  it("does not run forever on a cycle", () => {
    const cyclic = [edge("A", "B"), edge("B", "C"), edge("C", "A")];
    expect(justifyRecallSelection("C", "A", stateWith(cyclic)).pathAssetIds).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  /**
   * The invariant that makes the path trustworthy at all: every step is a real
   * edge someone recorded. Without it a plausible-looking list of assets can
   * assert a chain of custody that never happened, which is exactly the failure
   * an earlier ancestor-list implementation produced.
   */
  it("returns only adjacent pairs that are real provenance edges", () => {
    const branching = [
      edge("A", "C"),
      edge("C", "D"),
      edge("E", "D"),
      edge("D", "F"),
      edge("A", "G"),
      edge("G", "F"),
    ];
    const state = stateWith(branching);
    const edgeKeys = new Set(branching.map((e) => `${e.sourceAssetId}->${e.targetAssetId}`));

    for (const assetId of ["C", "D", "F", "G"]) {
      const { pathAssetIds } = justifyRecallSelection(assetId, "A", state);
      expect(pathAssetIds[0], assetId).toBe("A");
      expect(pathAssetIds[pathAssetIds.length - 1], assetId).toBe(assetId);
      for (let i = 1; i < pathAssetIds.length; i += 1) {
        const step = `${pathAssetIds[i - 1]}->${pathAssetIds[i]}`;
        expect(edgeKeys.has(step), `${assetId}: ${step} is not a provenance edge`).toBe(true);
      }
    }
  });

  it("never disagrees with the recall scope about what is affected", () => {
    const branching = [edge("A", "C"), edge("C", "D"), edge("E", "D"), edge("X", "Y")];
    // Both functions only mean anything about assets the ledger actually holds,
    // so the world here holds every endpoint.
    const assetsById = Object.fromEntries(
      ["A", "C", "D", "E", "X", "Y"].map((assetId) => [
        assetId,
        { assetId, currentLocationId: "LOC_1", currentOwnerId: "ORG_1", currentCustodianId: "ORG_1" },
      ]),
    ) as unknown as DomainState["assetsById"];
    const state = { ...stateWith(branching), assetsById };

    const affected = new Set(calculateRecallScope("A", state).affectedAssetIds);
    for (const assetId of Object.keys(assetsById)) {
      expect(justifyRecallSelection(assetId, "A", state).isAffected, assetId).toBe(
        affected.has(assetId),
      );
    }
  });

  /**
   * The one place the two can differ, pinned rather than left to be discovered:
   * a source that is not in `assetsById` has nothing to recall, so the scope
   * omits it, while the justification still reports the trivial one-node path.
   * Unreachable from the interface -- the contaminated batch is always a
   * committed asset -- and recorded so a future caller is not surprised.
   */
  it("reports the source as reached even when the ledger holds no such asset", () => {
    const state = stateWith(linear);
    expect(state.assetsById["A"]).toBeUndefined();
    expect(justifyRecallSelection("A", "A", state).isAffected).toBe(true);
    expect(calculateRecallScope("A", state).affectedAssetIds).not.toContain("A");
  });

  it("treats the source as reaching itself", () => {
    expect(justifyRecallSelection("A", "A", stateWith(linear)).pathAssetIds).toEqual(["A"]);
  });

  it("does not walk backwards from a descendant to its ancestor", () => {
    expect(justifyRecallSelection("A", "C", stateWith(linear)).isAffected).toBe(false);
  });
});
