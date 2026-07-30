import type { ReactNode } from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import type { LearnerRunLocalizedTextV1 } from "../contracts/run-events";

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
  organizationNames,
}: {
  readonly metadata: unknown;
  readonly organizationNames?: Readonly<
    Record<string, LearnerRunLocalizedTextV1>
  >;
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
    const organization =
      organizationNames?.[record.ownerOrganizationId];
    facts.push({
      label: t("evidenceMetadata.ownerOrganization"),
      value:
        organization?.valuesByLocale[t.locale] ??
        organization?.valuesByLocale.en ??
        Object.values(organization?.valuesByLocale ?? {})[0] ??
        record.ownerOrganizationId,
    });
  }
  if (typeof record.createdAt === "string") {
    facts.push({
      label: t("evidenceMetadata.createdAt"),
      value: formatDate(record.createdAt, t.locale),
    });
  }
  if (typeof record.effectiveFrom === "string") {
    facts.push({
      label: t("evidenceMetadata.effectiveFrom"),
      value: formatDate(record.effectiveFrom, t.locale),
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

function formatDate(value: string, locale: string): string {
  const instant = new Date(value);
  return Number.isNaN(instant.valueOf())
    ? value
    : new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(instant);
}
