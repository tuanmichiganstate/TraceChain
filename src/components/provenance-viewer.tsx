import type { ReactNode } from "react";
import { AssetLifecycleStatus } from "../domain/types/enums";
import type { DomainState } from "../domain/ledger/domain-state";
import { traceBackward, traceForward } from "../domain/provenance/trace";
import { useTranslator } from "../app/providers/locale-provider";
import { StatusPill } from "./status-pill";

/**
 * The provenance graph (specification section 18.9).
 *
 * Built as a nested ordered list rather than an SVG diagram. That is not a
 * shortcut: a list is keyboard reachable by default, reflows at 320 px, reads
 * correctly in a screen reader, and needs no separate text alternative because
 * the accessible version *is* the visible version. Section 18.9 explicitly says
 * not to add a graph library, and at this size one would earn nothing.
 *
 * Every edge is labelled with its relationship, and recall status is shown as
 * text plus a glyph -- never colour alone.
 */
export function ProvenanceViewer({
  state,
  rootAssetId,
}: {
  state: DomainState;
  rootAssetId: string;
}): ReactNode {
  const t = useTranslator();
  const root = state.assetsById[rootAssetId];

  if (root === undefined) {
    return <p className="muted">{t("traceability.noAsset")}</p>;
  }

  const ancestors = traceBackward(rootAssetId, state.provenanceEdges);
  const descendants = traceForward(rootAssetId, state.provenanceEdges);

  return (
    <section className="provenance" aria-labelledby="provenance-heading">
      <h2 id="provenance-heading">{t("traceability.title")}</h2>

      <div className="provenance__group">
        <h3>{t("traceability.backward")}</h3>
        {ancestors.assetIds.length === 0 ? (
          <p className="muted">{t("traceability.noAncestors")}</p>
        ) : (
          <ol className="provenance__chain">
            {[...ancestors.assetIds].reverse().map((assetId) => (
              <ProvenanceNode key={assetId} state={state} assetId={assetId} />
            ))}
          </ol>
        )}
      </div>

      <div className="provenance__group provenance__group--current">
        <h3>{t("traceability.currentAsset")}</h3>
        <ol className="provenance__chain">
          <ProvenanceNode state={state} assetId={rootAssetId} isCurrent />
        </ol>
      </div>

      <div className="provenance__group">
        <h3>{t("traceability.forward")}</h3>
        {descendants.assetIds.length === 0 ? (
          <p className="muted">{t("traceability.noDescendants")}</p>
        ) : (
          <ol className="provenance__chain">
            {descendants.assetIds.map((assetId) => (
              <ProvenanceNode key={assetId} state={state} assetId={assetId} />
            ))}
          </ol>
        )}
      </div>

      <p className="muted">{t("traceability.explanation")}</p>
    </section>
  );
}

function ProvenanceNode({
  state,
  assetId,
  isCurrent = false,
}: {
  state: DomainState;
  assetId: string;
  isCurrent?: boolean;
}): ReactNode {
  const t = useTranslator();
  const asset = state.assetsById[assetId];
  if (asset === undefined) return null;

  const incoming = state.provenanceEdges.find((edge) => edge.targetAssetId === assetId);
  const isRecalled = asset.lifecycleStatus === AssetLifecycleStatus.RECALLED;

  return (
    <li className={`provenance__node${isCurrent ? " provenance__node--current" : ""}`}>
      {incoming !== undefined ? (
        <span className="provenance__edge">
          <span aria-hidden="true">↑ </span>
          {t(`provenance.${incoming.relationshipType}`)}
        </span>
      ) : null}

      <span className="provenance__asset">
        <code>{asset.assetId}</code>
        <span className="provenance__name">{asset.productName}</span>
        <span className="provenance__quantity">
          {asset.quantity.toLocaleString("vi-VN")} {t(`unit.${asset.quantityUnit}`)}
        </span>
        <StatusPill tone={isRecalled ? "fail" : "neutral"}>
          {t(`lifecycle.${asset.lifecycleStatus}`)}
        </StatusPill>
      </span>
    </li>
  );
}
