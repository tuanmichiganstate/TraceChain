import { useId, useRef, useState, type ReactNode } from "react";
import { ScenarioStageId } from "../domain/types/enums";
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
 * Which panel a stage is most likely to send the learner to.
 *
 * Five panels behind one collapsed toggle means the useful one is always at
 * least two clicks away, and which one is useful is entirely predictable from
 * the stage: correcting a record wants the transaction history, determining
 * recall scope wants the provenance graph. A UI-side map rather than a scenario
 * field, in the same spirit as the stage component registry -- it says how a
 * stage is *drawn*, not what it is.
 */
const DEFAULT_TAB: Readonly<Partial<Record<ScenarioStageId, TabId>>> = {
  [ScenarioStageId.ANCHOR_CERTIFICATE]: "glossary",
  [ScenarioStageId.RECEIVE_AND_CORRECT]: "history",
  [ScenarioStageId.TRANSFORM_BATCH]: "traceability",
  [ScenarioStageId.VERIFY_AND_TAMPER]: "ledger",
  [ScenarioStageId.RECALL_AND_DEBRIEF]: "traceability",
};

function defaultTabFor(stageId: ScenarioStageId): TabId {
  return DEFAULT_TAB[stageId] ?? "state";
}

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
  const [isOpen, setOpen] = useState(false);
  const baseId = useId();

  return (
    <section className="workspace-reference">
      <button
        type="button"
        className="workspace-reference__toggle"
        aria-label={t("workspace.tabs.label")}
        aria-expanded={isOpen}
        aria-controls={`${baseId}-content`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="workspace-reference__toggle-copy">
          <strong>{t("workspace.tabs.label")}</strong>
          <small aria-hidden="true">{t("workspace.tabs.description")}</small>
        </span>
        <span className="workspace-reference__toggle-mark" aria-hidden="true">
          {isOpen ? "−" : "+"}
        </span>
      </button>

      {/*
       * Keyed by the stage, so moving on re-aims at that stage's panel by
       * remounting with a fresh initial tab. The alternative -- adjusting state
       * during render -- works, but this needs no reconciliation logic to read
       * and cannot loop. `isOpen` deliberately lives outside the key: a learner
       * who opened the workspace expects it to stay open across a stage change.
       */}
      {isOpen ? (
        <ReferencePanels
          key={state.viewedStageId}
          baseId={baseId}
          initialTab={defaultTabFor(state.viewedStageId)}
        />
      ) : null}
    </section>
  );
}

function ReferencePanels({
  baseId,
  initialTab,
}: {
  baseId: string;
  initialTab: TabId;
}): ReactNode {
  const t = useTranslator();
  const { state } = useSimulation();
  const [active, setActive] = useState<TabId>(initialTab);
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
    <div className="workspace-tabs" id={`${baseId}-content`}>
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
    </div>
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
