import type { ReactNode } from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import type {
  ScenarioEvidenceAssessmentDefinitionV1,
} from "../contracts/evidence-assessment";

function joinedCodes(
  values: readonly string[],
  emptyLabel: string,
): string {
  return values.length === 0 ? emptyLabel : values.join(", ");
}

export function EvidenceAssessmentCatalog({
  evidenceDefinitions,
  packId,
  packVersion,
  scenarioId,
  scenarioVersion,
}: {
  readonly evidenceDefinitions:
    readonly ScenarioEvidenceAssessmentDefinitionV1[];
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
}): ReactNode {
  const t = useTranslator();
  const none = t("evidenceAssessment.none");

  return (
    <section className="evidence-assessment-catalog">
      <h4>{t("evidenceAssessment.heading")}</h4>
      <p>{t("evidenceAssessment.help")}</p>
      <p>
        {t("evidenceAssessment.exactVersion", {
          packId,
          packVersion,
          scenarioId,
          scenarioVersion,
        })}
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">
                {t("evidenceAssessment.evidence")}
              </th>
              <th scope="col">
                {t("evidenceAssessment.learnerMetadata")}
              </th>
              <th scope="col">
                {t("evidenceAssessment.assessmentMetadata")}
              </th>
            </tr>
          </thead>
          <tbody>
            {evidenceDefinitions.map((evidence) => {
              const title =
                evidence.title.valuesByLocale[t.locale] ??
                evidence.title.valuesByLocale.en ??
                Object.values(evidence.title.valuesByLocale)[0] ??
                evidence.evidenceId;
              return (
                <tr key={evidence.evidenceId}>
                  <th scope="row">
                    <strong>{title}</strong>
                    <br />
                    <code>{evidence.evidenceId}</code>
                    <br />
                    <span>{evidence.evidenceType}</span>
                  </th>
                  <td>
                    <strong>
                      {t("evidenceAssessment.source")}
                    </strong>{" "}
                    <code>{evidence.sourceOrganizationId}</code>
                    <br />
                    <strong>
                      {t("evidenceMetadata.signature")}
                    </strong>{" "}
                    {t(
                      `evidenceMetadata.signatureStatus.${evidence.learnerMetadata.signatureStatus}`,
                    )}
                    <br />
                    <strong>
                      {t("evidenceMetadata.ledger")}
                    </strong>{" "}
                    {t(
                      `evidenceMetadata.ledgerStatus.${evidence.learnerMetadata.ledgerStatus}`,
                    )}
                    <br />
                    <strong>
                      {t("evidenceMetadata.completeness")}
                    </strong>{" "}
                    {t(
                      `evidenceMetadata.completenessStatus.${evidence.learnerMetadata.completeness}`,
                    )}
                    <br />
                    <strong>
                      {t("evidenceMetadata.access")}
                    </strong>{" "}
                    {t(
                      `evidenceMetadata.accessClassification.${evidence.learnerMetadata.access.classification}`,
                    )}
                    <br />
                    <strong>
                      {t("evidenceAssessment.visibleRoles")}
                    </strong>{" "}
                    {evidence.visibleToRoleIds.join(", ")}
                  </td>
                  <td>
                    <strong>
                      {t("evidenceAssessment.reliability")}
                    </strong>{" "}
                    {t(
                      `evidenceAssessment.reliabilityStatus.${evidence.assessmentMetadata.reliability}`,
                    )}
                    <br />
                    <strong>
                      {t("evidenceAssessment.contentStatus")}
                    </strong>{" "}
                    {t(
                      `evidenceAssessment.contentStatusValue.${evidence.assessmentMetadata.contentStatus}`,
                    )}
                    <br />
                    <strong>
                      {t("evidenceAssessment.limitations")}
                    </strong>{" "}
                    <code>
                      {joinedCodes(
                        evidence.assessmentMetadata.limitationCodes,
                        none,
                      )}
                    </code>
                    <br />
                    <strong>
                      {t("evidenceAssessment.hiddenConditions")}
                    </strong>{" "}
                    <code>
                      {joinedCodes(
                        evidence.assessmentMetadata
                          .hiddenConditionReferences,
                        none,
                      )}
                    </code>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
