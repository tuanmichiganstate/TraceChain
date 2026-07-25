import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "../app/providers/locale-provider";
import { ScenarioProvider } from "../app/providers/scenario-provider";
import { createEmptyDomainState } from "../domain/ledger/domain-state";
import {
  AssetLifecycleStatus,
  AssetType,
  ComplianceStatus,
  QuantityUnit,
  SaleEligibility,
} from "../domain/types/enums";
import type { SupplyChainAsset } from "../domain/types/models";
import { coffeeScenario } from "../scenarios/coffee-traceability/scenario";
import { AssetCard } from "./asset-card";
import { ProvenanceViewer } from "./provenance-viewer";

const ASSET_ID = "BAT_LOCALE_QUANTITY";

function decimalAsset(): SupplyChainAsset {
  return {
    assetId: ASSET_ID,
    assetType: AssetType.GREEN_COFFEE_BATCH,
    productName: "Locale test coffee",
    originLocation: "Lâm Đồng",
    productionDate: "2026-06-01",
    quantity: 1.2,
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
    createdByTransactionId: "TX_LOCALE_QUANTITY",
    lastUpdatedByTransactionId: "TX_LOCALE_QUANTITY",
    stateVersion: 1,
  };
}

function Providers({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactNode {
  return (
    <LocaleProvider locale="en">
      <ScenarioProvider scenario={coffeeScenario}>
        {children}
      </ScenarioProvider>
    </LocaleProvider>
  );
}

afterEach(cleanup);

describe("quantities follow the active reading locale", () => {
  it("uses English decimal punctuation in the asset card and provenance view", () => {
    const asset = decimalAsset();
    render(
      <Providers>
        <AssetCard asset={asset} />
      </Providers>,
    );
    expect(screen.getByText("1.2 kg")).toBeInTheDocument();

    cleanup();
    const empty = createEmptyDomainState();
    render(
      <Providers>
        <ProvenanceViewer
          state={{
            ...empty,
            assetsById: { [ASSET_ID]: asset },
          }}
          rootAssetId={ASSET_ID}
        />
      </Providers>,
    );
    expect(screen.getByText("1.2 kg")).toBeInTheDocument();
  });
});
