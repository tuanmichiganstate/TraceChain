import { useId, useRef, useState, type ReactNode } from "react";
import { useTranslator } from "../app/providers/locale-provider";
import { useSimulation } from "../app/providers/simulation-provider";
import { AssetCard } from "./asset-card";
import { Glossary } from "./glossary";
import { LedgerExplorer } from "./ledger-explorer";
import { ProvenanceViewer } from "./provenance-viewer";
import { TransactionHistory } from "./transaction-history";

type TabId = "state" | "history" | "ledger" | "traceability" | "glossary";

const TABS: ReadonlyArray<{ id: TabId; labelKey: string }> = [
  { id: "state", labelKey: "workspace.tabs.currentState" },
  { id: "history", labelKey: "workspace.tabs.transactionHistory" },
  { id: "ledger", labelKey: "workspace.tabs.ledger" },
  { id: "traceability", labelKey: "workspace.tabs.traceability" },
  { id: "glossary", labelKey: "workspace.tabs.glossary" },
];

/**
 * The reference panels a learner can consult at any point (section 18.2).
 *
 * Implemented as a proper tab widget: arrow keys move between tabs, Home and
 * End jump to the ends, and only the active tab is in the page tab order. That
 * is the ARIA authoring practice for tabs, and getting it wrong would make five
 * panels' worth of content awkward to reach by keyboard.
 */
export function WorkspaceTabs(): ReactNode {
  const t = useTranslator();
  const { state } = useSimulation();
  const [active, setActive] = useState<TabId>("state");
  const baseId = useId();
  const tabRefs = useRef<Map<TabId, HTMLButtonElement>>(new Map());

  const focusTab = (id: TabId): void => {
    setActive(id);
    tabRefs.current.get(id)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number): void => {
    const last = TABS.length - 1;
    const target =
      event.key === "ArrowRight"
        ? TABS[index === last ? 0 : index + 1]
        : event.key === "ArrowLeft"
          ? TABS[index === 0 ? last : index - 1]
          : event.key === "Home"
            ? TABS[0]
            : event.key === "End"
              ? TABS[last]
              : undefined;

    if (target !== undefined) {
      event.preventDefault();
      focusTab(target.id);
    }
  };

  return (
    <section className="workspace-tabs">
      <div className="workspace-tabs__list" role="tablist" aria-label={t("workspace.tabs.label")}>
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            className={`workspace-tabs__tab${active === tab.id ? " workspace-tabs__tab--active" : ""}`}
            ref={(element) => {
              if (element !== null) tabRefs.current.set(tab.id, element);
            }}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${active}`}
        aria-labelledby={`${baseId}-tab-${active}`}
        tabIndex={0}
        className="workspace-tabs__panel"
      >
        {active === "state" ? <CurrentStatePanel /> : null}
        {active === "history" ? <TransactionHistory state={state.domain} /> : null}
        {active === "ledger" ? <LedgerExplorer state={state.domain} /> : null}
        {active === "traceability" ? <TraceabilityPanel /> : null}
        {active === "glossary" ? <Glossary /> : null}
      </div>
    </section>
  );
}

function CurrentStatePanel(): ReactNode {
  const t = useTranslator();
  const { state } = useSimulation();
  const assets = Object.values(state.domain.assetsById);

  if (assets.length === 0) {
    return <p className="muted">{t("state.empty")}</p>;
  }

  return (
    <section aria-labelledby="current-state-heading">
      <h2 id="current-state-heading">{t("state.title")}</h2>
      {assets.map((asset) => (
        <AssetCard key={asset.assetId} asset={asset} />
      ))}
    </section>
  );
}

function TraceabilityPanel(): ReactNode {
  const t = useTranslator();
  const { state } = useSimulation();
  const assets = Object.values(state.domain.assetsById);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (assets.length === 0) {
    return <p className="muted">{t("state.empty")}</p>;
  }

  const rootId = selectedId ?? (assets[0]?.assetId as string);

  return (
    <>
      <div className="field">
        <label className="field__label" htmlFor="traceability-asset">
          {t("traceability.chooseAsset")}
        </label>
        <select
          id="traceability-asset"
          className="field__control"
          value={rootId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {assets.map((asset) => (
            <option key={asset.assetId} value={asset.assetId}>
              {asset.assetId} — {asset.productName}
            </option>
          ))}
        </select>
      </div>
      <ProvenanceViewer state={state.domain} rootAssetId={rootId} />
    </>
  );
}
