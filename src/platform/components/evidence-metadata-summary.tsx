import type { ReactNode } from "react";
import { useTranslator } from "../../app/providers/locale-provider";

function recordValue(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

export function EvidenceMetadataSummary({
  metadata,
}: {
  readonly metadata: unknown;
}): ReactNode {
  const t = useTranslator();
  const record = recordValue(metadata);
  const access = recordValue(record?.access);
  if (
    record === undefined ||
    access === undefined ||
    typeof record.signatureStatus !== "string" ||
    typeof record.ledgerStatus !== "string" ||
    typeof record.completeness !== "string" ||
    typeof access.classification !== "string" ||
    typeof access.acquisitionMode !== "string" ||
    typeof access.delayMinutes !== "number" ||
    typeof access.costUnits !== "number"
  ) {
    return null;
  }

  const facts: Array<{
    readonly label: string;
    readonly value: ReactNode;
  }> = [];
  if (typeof record.ownerOrganizationId === "string") {
    facts.push({
      label: t("evidenceMetadata.ownerOrganization"),
      value: <code>{record.ownerOrganizationId}</code>,
    });
  }
  if (typeof record.createdAt === "string") {
    facts.push({
      label: t("evidenceMetadata.createdAt"),
      value: record.createdAt,
    });
  }
  if (typeof record.effectiveFrom === "string") {
    facts.push({
      label: t("evidenceMetadata.effectiveFrom"),
      value: record.effectiveFrom,
    });
  }
  facts.push(
    {
      label: t("evidenceMetadata.signature"),
      value: t(
        `evidenceMetadata.signatureStatus.${record.signatureStatus}`,
      ),
    },
    {
      label: t("evidenceMetadata.ledger"),
      value: t(
        `evidenceMetadata.ledgerStatus.${record.ledgerStatus}`,
      ),
    },
    {
      label: t("evidenceMetadata.completeness"),
      value: t(
        `evidenceMetadata.completenessStatus.${record.completeness}`,
      ),
    },
    {
      label: t("evidenceMetadata.access"),
      value: t(
        `evidenceMetadata.accessClassification.${access.classification}`,
      ),
    },
    {
      label: t("evidenceMetadata.availability"),
      value:
        access.acquisitionMode === "AVAILABLE"
          ? t("evidenceMetadata.acquisitionMode.AVAILABLE")
          : t(
              "evidenceMetadata.acquisitionMode.REQUEST_REQUIRED",
              {
                delayMinutes: access.delayMinutes,
                costUnits: access.costUnits,
              },
            ),
    },
  );

  return (
    <section className="evidence-metadata-summary">
      <h4>{t("evidenceMetadata.heading")}</h4>
      <dl className="instructor-review__facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
