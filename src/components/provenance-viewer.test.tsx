import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type React from "react";
import { ProvenanceViewer } from "./provenance-viewer";
import { LocaleProvider } from "../app/providers/locale-provider";
import { createTranslator } from "../localization/i18n";
import { createEmptyDomainState } from "../domain/ledger/domain-state";
import type { DomainState } from "../domain/ledger/domain-state";
import type { SupplyChainAsset } from "../domain/types/models";
import {
  AssetLifecycleStatus,
  AssetType,
  ComplianceStatus,
  ProvenanceRelationshipType,
  QuantityUnit,
  SaleEligibility,
} from "../domain/types/enums";

/**
 * Which way an edge arrow points.
 *
 * Every relationship label ends in "into" -- transformed into, packaged into --
 * and the asset it goes into is the one printed on the next line. An upward
 * arrow pointed back at the source instead, contradicting the sentence it sat
 * in, and ran against both chains, which read oldest to newest down the page.
 *
 * The arrow is decorative and hidden, so this is about whether a sighted
 * learner can read the direction of the chain, not about what a screen reader
 * hears -- which is asserted separately, because the two must not swap.
 */
const vi = createTranslator("vi");

const GREEN = "BAT_TEST_GREEN";
const ROASTED = "BAT_TEST_ROASTED";

function asset(
  assetId: string,
  assetType: AssetType,
  productName: string,
  quantity: number,
): SupplyChainAsset {
  return {
    assetId,
    assetType,
    productName,
    originLocation: "Lâm Đồng",
    productionDate: "2026-06-01",
    quantity,
    quantityUnit: QuantityUnit.KG,
    packageSizeGrams: null,
    currentOwnerId: "ORG_PRODUCER_COOP",
    currentCustodianId: "ORG_PRODUCER_COOP",
    currentLocationId: "LOC_PRODUCER_FARM",
    lifecycleStatus: AssetLifecycleStatus.CREATED,
    complianceStatus: ComplianceStatus.PENDING_CERTIFICATION,
    saleEligibility: SaleEligibility.NOT_YET_ELIGIBLE,
    certificateIds: [],
    documentAnchorIds: [],
    parentAssetIds: [],
    childAssetIds: [],
    createdByTransactionId: "TX_000001",
    lastUpdatedByTransactionId: "TX_000001",
    stateVersion: 1,
  };
}

/** Two assets and the one edge between them: the smallest chain with an arrow. */
function stateWithOneEdge(): DomainState {
  const empty = createEmptyDomainState();
  return {
    ...empty,
    assetsById: {
      [GREEN]: asset(GREEN, AssetType.GREEN_COFFEE_BATCH, "Arabica green coffee", 100),
      [ROASTED]: asset(ROASTED, AssetType.ROASTED_COFFEE_BATCH, "Arabica roasted coffee", 82),
    },
    provenanceEdges: [
      {
        provenanceEdgeId: "PRV_000001",
        sourceAssetId: GREEN,
        targetAssetId: ROASTED,
        relationshipType: ProvenanceRelationshipType.TRANSFORMED_INTO,
        transactionId: "TX_000002",
      },
    ],
  };
}

function renderViewer(): void {
  const Viewer = (): React.ReactElement => (
    <LocaleProvider>
      <ProvenanceViewer state={stateWithOneEdge()} rootAssetId={GREEN} />
    </LocaleProvider>
  );
  render(<Viewer />);
}

describe("the provenance chain's edge arrows", () => {
  it("points down, toward the asset the relationship produces", () => {
    renderViewer();

    const edges = [...document.querySelectorAll(".provenance__edge")];
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      const arrow = edge.querySelector('[aria-hidden="true"]') as HTMLElement;
      expect(arrow.textContent?.trim()).toBe("↓");
    }
  });

  it("prints the arrow before the asset it introduces, not after it", () => {
    renderViewer();

    const node = document
      .querySelector(".provenance__edge")
      ?.closest(".provenance__node") as HTMLElement;
    const edge = node.querySelector(".provenance__edge") as HTMLElement;
    const introduced = node.querySelector(".provenance__asset") as HTMLElement;
    // "…into" then the thing it went into: the arrow is meaningless if the
    // asset it points at is above it.
    expect(
      edge.compareDocumentPosition(introduced) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(introduced.textContent).toContain(ROASTED);
  });

  it("leaves a screen reader the words, never the glyph", () => {
    renderViewer();

    const edge = document.querySelector(".provenance__edge") as HTMLElement;
    expect(edge.textContent).toContain(vi("provenance.TRANSFORMED_INTO"));
    expect(edge.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe("↓");
  });
});
