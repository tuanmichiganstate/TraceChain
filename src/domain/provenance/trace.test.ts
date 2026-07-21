import { describe, expect, it } from "vitest";
import { ProvenanceRelationshipType } from "../types/enums";
import type { ProvenanceEdge } from "../types/models";
import { traceBackward, traceForward, traceFullLineage } from "./trace";

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
