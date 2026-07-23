import type { ReactNode } from "react";
import type { SupplyChainAsset } from "../domain/types/models";
import { useTranslator } from "../app/providers/locale-provider";
import { organizationsById, locationsById } from "../scenarios/coffee-traceability/organizations";
import { StatusPill } from "./status-pill";

/**
 * Current world state for one asset (specification section 18.6).
 *
 * Owner and custodian are always shown together, and always as separate rows,
 * because the distinction between them is the single most important idea in the
 * simulation. Collapsing them into one "holder" row would quietly undo the
 * lesson.
 */
export function AssetCard({ asset }: { asset: SupplyChainAsset }): ReactNode {
  const t = useTranslator();

  const organizationName = (organizationId: string): string => {
    const organization = organizationsById[organizationId];
    return organization === undefined ? organizationId : t(organization.displayNameKey);
  };

  const locationName = (locationId: string): string => {
    const location = locationsById[locationId];
    return location === undefined ? locationId : t(location.displayNameKey);
  };

  const rows: ReadonlyArray<readonly [string, ReactNode]> = [
    ["field.assetId", <code key="id">{asset.assetId}</code>],
    ["field.productName", asset.productName],
    ["field.originLocation", asset.originLocation],
    [
      "field.quantity",
      `${asset.quantity.toLocaleString("vi-VN")} ${t(`unit.${asset.quantityUnit}`)}`,
    ],
    ["field.owner", organizationName(asset.currentOwnerId)],
    ["field.custodian", organizationName(asset.currentCustodianId)],
    ["field.location", locationName(asset.currentLocationId)],
    [
      "field.lifecycleStatus",
      <StatusPill key="lifecycle" tone="neutral">
        {t(`lifecycle.${asset.lifecycleStatus}`)}
      </StatusPill>,
    ],
    [
      "field.complianceStatus",
      <StatusPill
        key="compliance"
        tone={
          asset.complianceStatus === "COMPLIANT"
            ? "pass"
            : asset.complianceStatus === "INSPECTION_REQUIRED"
              ? "warn"
              : asset.complianceStatus === "NON_COMPLIANT" || asset.complianceStatus === "RECALLED"
                ? "fail"
                : "neutral"
        }
      >
        {t(`compliance.${asset.complianceStatus}`)}
      </StatusPill>,
    ],
    ["field.saleEligibility", t(`sale.${asset.saleEligibility}`)],
    ["field.stateVersion", String(asset.stateVersion)],
  ];

  return (
    <article className="card card--reference asset-card">
      <h3>{asset.productName}</h3>
      <dl className="asset-card__grid">
        {rows.map(([labelKey, value]) => (
          <div key={labelKey} className="asset-card__row">
            <dt>{t(labelKey)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">{t("state.versionHelp")}</p>
    </article>
  );
}
