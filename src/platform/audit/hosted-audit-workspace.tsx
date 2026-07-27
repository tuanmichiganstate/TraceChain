import {
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AuditFindingBuilder,
  AuditWorkbenchShell,
  PersistentResult,
  type AuditFindingDraft,
} from "../../components/product-mode-workspaces";
import { useTranslator } from "../../app/providers/locale-provider";
import type {
  AuditConclusionCategoryV1,
  AuditLearnerProjectionV1,
} from "../contracts/audit";
import type { LearnerRunLocalizedTextV1 } from "../contracts/run-events";

function localized(
  value: LearnerRunLocalizedTextV1,
  t: ReturnType<typeof useTranslator>,
): string {
  return (
    value.valuesByLocale[t.locale] ??
    value.valuesByLocale.en ??
    Object.values(value.valuesByLocale)[0] ??
    t(value.localizationKey)
  );
}

function newFindingId(): string {
  return `AUD_FINDING_${crypto.randomUUID()}`;
}

function blankDraft(
  audit: AuditLearnerProjectionV1,
): AuditFindingDraft {
  return {
    findingId: newFindingId(),
    categoryId: audit.categories[0]?.choiceId ?? "",
    entityId: audit.entities[0]?.choiceId ?? "",
    title: "",
    observation: "",
    severity: "MODERATE",
    materiality: "NON_MATERIAL",
    confidence: 50,
    evidenceIds: [],
    policyIds: [],
    rootCauseCode: audit.rootCauses[0]?.choiceId ?? "",
    recommendationCode:
      audit.recommendations[0]?.choiceId ?? "",
    recommendation: "",
  };
}

function initialDraft(
  audit: AuditLearnerProjectionV1,
): AuditFindingDraft {
  const restored = audit.drafts[0];
  return restored === undefined
    ? blankDraft(audit)
    : {
        findingId: restored.findingId,
        categoryId: restored.categoryId,
        entityId: restored.entityId,
        title: restored.title,
        observation: restored.observation,
        severity: restored.severity,
        materiality: restored.materiality,
        confidence: restored.confidence,
        evidenceIds: restored.evidenceIds,
        policyIds: restored.policyIds,
        rootCauseCode: restored.rootCauseCode,
        recommendationCode: restored.recommendationCode,
        recommendation: restored.recommendation,
      };
}

interface AuditConclusionDraft {
  readonly conclusionCategory: AuditConclusionCategoryV1;
  readonly scopeSummary: string;
  readonly materialFindingsSummary: string;
  readonly nonMaterialFindingsSummary: string;
  readonly limitations: string;
  readonly uncertainty: string;
  readonly recommendations: string;
  readonly confidence: number;
}

function initialConclusion(
  audit: AuditLearnerProjectionV1,
): AuditConclusionDraft {
  return {
    conclusionCategory:
      audit.conclusionCategories[0]?.conclusionCategory ??
      "INSUFFICIENT_EVIDENCE",
    scopeSummary: "",
    materialFindingsSummary: "",
    nonMaterialFindingsSummary: "",
    limitations: "",
    uncertainty: "",
    recommendations: "",
    confidence: 50,
  };
}

export function HostedAuditWorkspace({
  audit,
  completed,
  busy,
  onSubmit,
}: {
  readonly audit: AuditLearnerProjectionV1;
  readonly completed: boolean;
  readonly busy: boolean;
  readonly onSubmit: (
    input: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  const [draft, setDraft] = useState<AuditFindingDraft>(() =>
    initialDraft(audit),
  );
  const [amending, setAmending] = useState(false);
  const [conclusion, setConclusion] =
    useState<AuditConclusionDraft>(() => initialConclusion(audit));
  const [recordFilter, setRecordFilter] = useState("");

  const activeFindings = audit.findings.filter(
    (finding) => finding.status === "SUBMITTED",
  );
  const filteredRecords = useMemo(() => {
    const normalized = recordFilter.trim().toLocaleLowerCase();
    if (normalized.length === 0) return audit.sourceRecords;
    return audit.sourceRecords.filter((record) =>
      [
        record.sourceRecordId,
        record.recordKind,
        record.organizationId,
        ...record.entityIds,
        ...record.evidenceIds,
        ...record.policyIds,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [audit.sourceRecords, recordFilter]);

  const submitFinding = async (): Promise<void> => {
    await onSubmit({
      commandType: amending
        ? "AMEND_AUDIT_FINDING"
        : "SUBMIT_AUDIT_FINDING",
      finding: draft,
    });
    setDraft(blankDraft(audit));
    setAmending(false);
  };

  const evidenceTab = (
    <div className="audit-evidence-grid">
      {audit.evidence.map((evidence) => (
        <article
          key={evidence.evidenceId}
          className="card card--reference stack"
        >
          <div>
            <p className="eyebrow">{evidence.evidenceType}</p>
            <h3>{localized(evidence.title, t)}</h3>
            <code>{evidence.evidenceId}</code>
          </div>
          <dl className="instructor-review__facts">
            <div>
              <dt>{t("hostedAudit.sourceOrganization")}</dt>
              <dd><code>{evidence.sourceOrganizationId}</code></dd>
            </div>
            <div>
              <dt>{t("hostedAudit.reviewStatus")}</dt>
              <dd>
                {t(
                  evidence.inspected
                    ? "hostedAudit.inspected"
                    : "hostedAudit.notInspected",
                )}
              </dd>
            </div>
          </dl>
          <details>
            <summary>{t("hostedAudit.viewEvidence")}</summary>
            <pre className="audit-json-evidence">
              {JSON.stringify(evidence.content, null, 2)}
            </pre>
          </details>
          <div className="audit-inline-actions">
            <button
              type="button"
              className="button button--secondary"
              disabled={busy || completed}
              onClick={() =>
                void onSubmit({
                  commandType: "INSPECT_AUDIT_EVIDENCE",
                  evidenceId: evidence.evidenceId,
                })
              }
            >
              {t("hostedAudit.recordInspection")}
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={busy || completed || evidence.bookmarked}
              onClick={() =>
                void onSubmit({
                  commandType: "BOOKMARK_AUDIT_EVIDENCE",
                  evidenceId: evidence.evidenceId,
                })
              }
            >
              {t(
                evidence.bookmarked
                  ? "hostedAudit.bookmarked"
                  : "hostedAudit.bookmark",
              )}
            </button>
          </div>
        </article>
      ))}
    </div>
  );

  const sourceTab = (
    <div className="stack">
      <label className="field">
        <span>{t("hostedAudit.filterRecords")}</span>
        <input
          value={recordFilter}
          onChange={(event) => setRecordFilter(event.target.value)}
        />
      </label>
      <p>{t("hostedAudit.ledgerBoundary")}</p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("hostedAudit.record")}</th>
              <th scope="col">{t("hostedAudit.recordKind")}</th>
              <th scope="col">{t("hostedAudit.organization")}</th>
              <th scope="col">{t("hostedAudit.occurredAt")}</th>
              <th scope="col">{t("hostedAudit.action")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((record) => (
              <tr key={record.sourceRecordId}>
                <th scope="row">
                  {localized(record.title, t)}
                  <br />
                  <code>{record.sourceRecordId}</code>
                </th>
                <td>
                  {t(
                    `hostedAudit.recordKind.${record.recordKind}`,
                  )}
                </td>
                <td><code>{record.organizationId}</code></td>
                <td>{record.occurredAt}</td>
                <td>
                  <details>
                    <summary>{t("hostedAudit.details")}</summary>
                    <pre className="audit-json-evidence">
                      {JSON.stringify(record.details, null, 2)}
                    </pre>
                    <p>
                      <strong>{t("hostedAudit.linkedEvidence")}</strong>{" "}
                      {record.evidenceIds.join(", ") || "—"}
                    </p>
                    <p>
                      <strong>{t("hostedAudit.linkedPolicy")}</strong>{" "}
                      {record.policyIds.join(", ") || "—"}
                    </p>
                  </details>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={busy || completed || record.inspected}
                    onClick={() =>
                      void onSubmit({
                        commandType:
                          "INSPECT_AUDIT_SOURCE_RECORD",
                        sourceRecordId: record.sourceRecordId,
                      })
                    }
                  >
                    {t(
                      record.inspected
                        ? "hostedAudit.inspected"
                        : "hostedAudit.recordInspection",
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const findingsTab = (
    <div className="stack">
      <section className="card card--reference">
        <h3>{t("hostedAudit.submittedFindings")}</h3>
        {audit.findings.length === 0 ? (
          <p>{t("hostedAudit.noFindings")}</p>
        ) : (
          <ol className="audit-finding-list">
            {audit.findings.map((finding) => (
              <li key={finding.findingId}>
                <article className="stack">
                  <div>
                    <strong>{finding.title}</strong>{" "}
                    <code>{finding.findingId}</code>
                  </div>
                  <p>{finding.observation}</p>
                  <p>
                    {t("hostedAudit.findingClassification", {
                      severity: t(
                        `hostedAudit.severity.${finding.severity}`,
                      ),
                      materiality: t(
                        `hostedAudit.materiality.${finding.materiality}`,
                      ),
                      confidence: finding.confidence,
                    })}
                  </p>
                  {finding.feedback === undefined ? null : (
                    <PersistentResult
                      tone={
                        finding.feedback.classification === "CONFIRMED"
                          ? "pass"
                          : finding.feedback.classification ===
                              "LEGITIMATE_EXCEPTION"
                            ? "warn"
                            : "fail"
                      }
                      status={t(
                        `hostedAudit.feedback.${finding.feedback.classification}`,
                      )}
                      title={t("hostedAudit.feedbackTitle")}
                      summary={localized(
                        finding.feedback.explanation,
                        t,
                      )}
                    />
                  )}
                  {finding.status === "SUBMITTED" && !completed ? (
                    <div className="audit-inline-actions">
                      <button
                        type="button"
                        className="button button--secondary"
                        disabled={busy}
                        onClick={() => {
                          setDraft({
                            findingId: finding.findingId,
                            categoryId: finding.categoryId,
                            entityId: finding.entityId,
                            title: finding.title,
                            observation: finding.observation,
                            severity: finding.severity,
                            materiality: finding.materiality,
                            confidence: finding.confidence,
                            evidenceIds: finding.evidenceIds,
                            policyIds: finding.policyIds,
                            rootCauseCode: finding.rootCauseCode,
                            recommendationCode:
                              finding.recommendationCode,
                            recommendation: finding.recommendation,
                          });
                          setAmending(true);
                        }}
                      >
                        {t("hostedAudit.amend")}
                      </button>
                      <button
                        type="button"
                        className="button button--secondary"
                        disabled={busy}
                        onClick={() =>
                          void onSubmit({
                            commandType:
                              "WITHDRAW_AUDIT_FINDING",
                            findingId: finding.findingId,
                          })
                        }
                      >
                        {t("hostedAudit.withdraw")}
                      </button>
                    </div>
                  ) : null}
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>
      {completed ? null : (
        <AuditFindingBuilder
          eyebrow={t("hostedAudit.findingEyebrow")}
          title={t(
            amending
              ? "hostedAudit.amendFinding"
              : "hostedAudit.newFinding",
          )}
          description={t("hostedAudit.findingHelp")}
          labels={{
            category: t("hostedAudit.category"),
            entity: t("hostedAudit.entity"),
            findingTitle: t("hostedAudit.findingTitle"),
            observation: t("hostedAudit.observation"),
            severity: t("hostedAudit.severity"),
            materiality: t("hostedAudit.materiality"),
            confidence: t("hostedAudit.confidence"),
            evidence: t("hostedAudit.evidenceCitations"),
            policy: t("hostedAudit.policyCitations"),
            rootCause: t("hostedAudit.rootCause"),
            recommendationChoice: t(
              "hostedAudit.recommendationChoice",
            ),
            recommendation: t("hostedAudit.recommendation"),
            saveDraft: t("hostedAudit.saveDraft"),
            submit: t(
              amending
                ? "hostedAudit.submitAmendment"
                : "hostedAudit.submitFinding",
            ),
          }}
          categoryOptions={audit.categories.map((choice) => ({
            choiceId: choice.choiceId,
            label: localized(choice.label, t),
          }))}
          entityOptions={audit.entities.map((choice) => ({
            choiceId: choice.choiceId,
            label: localized(choice.label, t),
          }))}
          severityOptions={{
            LOW: t("hostedAudit.severity.LOW"),
            MODERATE: t("hostedAudit.severity.MODERATE"),
            HIGH: t("hostedAudit.severity.HIGH"),
            CRITICAL: t("hostedAudit.severity.CRITICAL"),
          }}
          materialityOptions={{
            NON_MATERIAL: t(
              "hostedAudit.materiality.NON_MATERIAL",
            ),
            MATERIAL: t("hostedAudit.materiality.MATERIAL"),
          }}
          evidenceOptions={audit.evidence.map((evidence) => ({
            evidenceId: evidence.evidenceId,
            label: localized(evidence.title, t),
          }))}
          policyOptions={audit.policies.map((policy) => ({
            evidenceId: policy.policyId,
            label: localized(policy.title, t),
          }))}
          rootCauseOptions={audit.rootCauses.map((choice) => ({
            choiceId: choice.choiceId,
            label: localized(choice.label, t),
          }))}
          recommendationOptions={audit.recommendations.map(
            (choice) => ({
              choiceId: choice.choiceId,
              label: localized(choice.label, t),
            }),
          )}
          draft={draft}
          disabled={busy}
          onChange={setDraft}
          onSaveDraft={() =>
            void onSubmit({
              commandType: "SAVE_AUDIT_FINDING_DRAFT",
              finding: draft,
            })
          }
          onSubmit={() => void submitFinding()}
        />
      )}
    </div>
  );

  const conclusionTab = (
    <div className="stack">
      {audit.report === undefined ? null : (
        <HostedAuditReport report={audit.report} />
      )}
      {completed ? null : (
        <AuditConclusionForm
          audit={audit}
          draft={conclusion}
          busy={busy}
          onChange={setConclusion}
          onSubmit={() =>
            onSubmit({
              commandType: "SUBMIT_AUDIT_CONCLUSION",
              conclusion,
            })
          }
        />
      )}
    </div>
  );

  return (
    <AuditWorkbenchShell
      eyebrow={t("hostedAudit.eyebrow")}
      title={t("hostedAudit.title")}
      description={localized(audit.objective, t)}
      context={[
        {
          id: "case",
          label: t("hostedAudit.case"),
          value: `${audit.auditCaseId}@${audit.auditCaseVersion}`,
          monospace: true,
        },
        {
          id: "source",
          label: t("hostedAudit.sourceProcess"),
          value: `${audit.sourceProcessId}@${audit.sourceProcessVersion}`,
          monospace: true,
        },
        {
          id: "status",
          label: t("hostedAudit.status"),
          value: t(
            completed
              ? "hostedAudit.completed"
              : "hostedAudit.inProgress",
          ),
        },
      ]}
      tabLabel={t("hostedAudit.tabs")}
      initialTabId="scope"
      tabs={[
        {
          id: "scope",
          label: t("hostedAudit.tab.scope"),
          status: t("hostedAudit.fixed"),
          content: (
            <section className="card card--brief stack">
              <h3>{localized(audit.scope.title, t)}</h3>
              <p>
                {t("hostedAudit.period", {
                  start: audit.scope.periodStart,
                  end: audit.scope.periodEnd,
                })}
              </p>
              <p>{t("hostedAudit.scopeGuidance")}</p>
              <button
                type="button"
                className="button button--secondary"
                disabled={busy || completed}
                onClick={() =>
                  void onSubmit({
                    commandType: "VIEW_AUDIT_SCOPE",
                  })
                }
              >
                {t("hostedAudit.confirmScopeReview")}
              </button>
            </section>
          ),
        },
        {
          id: "evidence",
          label: t("hostedAudit.tab.evidence"),
          status: t("hostedAudit.count", {
            count: audit.evidence.length,
          }),
          content: evidenceTab,
        },
        {
          id: "ledger",
          label: t("hostedAudit.tab.ledger"),
          status: t("hostedAudit.count", {
            count: audit.sourceRecords.length,
          }),
          content: sourceTab,
        },
        {
          id: "findings",
          label: t("hostedAudit.tab.findings"),
          status: t("hostedAudit.count", {
            count: activeFindings.length,
          }),
          content: findingsTab,
        },
        {
          id: "conclusion",
          label: t("hostedAudit.tab.conclusion"),
          status: t(
            completed
              ? "hostedAudit.completed"
              : "hostedAudit.pending",
          ),
          content: conclusionTab,
        },
      ]}
    />
  );
}

function AuditConclusionForm({
  audit,
  draft,
  busy,
  onChange,
  onSubmit,
}: {
  readonly audit: AuditLearnerProjectionV1;
  readonly draft: AuditConclusionDraft;
  readonly busy: boolean;
  readonly onChange: (draft: AuditConclusionDraft) => void;
  readonly onSubmit: () => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void onSubmit();
  };
  const fields = [
    ["scopeSummary", "hostedAudit.conclusion.scope"],
    [
      "materialFindingsSummary",
      "hostedAudit.conclusion.material",
    ],
    [
      "nonMaterialFindingsSummary",
      "hostedAudit.conclusion.nonMaterial",
    ],
    ["limitations", "hostedAudit.conclusion.limitations"],
    ["uncertainty", "hostedAudit.conclusion.uncertainty"],
    [
      "recommendations",
      "hostedAudit.conclusion.recommendations",
    ],
  ] as const;
  return (
    <form className="card card--work stack" onSubmit={submit}>
      <h3>{t("hostedAudit.conclusion.title")}</h3>
      <p>{t("hostedAudit.conclusion.help")}</p>
      <label className="field">
        <span>{t("hostedAudit.conclusion.opinion")}</span>
        <select
          value={draft.conclusionCategory}
          disabled={busy}
          onChange={(event) =>
            onChange({
              ...draft,
              conclusionCategory: event.target
                .value as AuditConclusionCategoryV1,
            })
          }
        >
          {audit.conclusionCategories.map((option) => (
            <option
              key={option.conclusionCategory}
              value={option.conclusionCategory}
            >
              {localized(option.label, t)}
            </option>
          ))}
        </select>
      </label>
      {fields.map(([field, key]) => (
        <label key={field} className="field">
          <span>{t(key)}</span>
          <textarea
            rows={3}
            maxLength={1_000}
            required
            value={draft[field]}
            disabled={busy}
            onChange={(event) =>
              onChange({
                ...draft,
                [field]: event.target.value,
              })
            }
          />
        </label>
      ))}
      <label className="field">
        <span>{t("hostedAudit.confidence")}</span>
        <input
          type="number"
          min={0}
          max={100}
          value={draft.confidence}
          disabled={busy}
          onChange={(event) =>
            onChange({
              ...draft,
              confidence: Number(event.target.value),
            })
          }
        />
      </label>
      <button
        type="submit"
        className="button button--primary"
        disabled={busy}
      >
        {t("hostedAudit.conclusion.submit")}
      </button>
    </form>
  );
}

export function HostedAuditReport({
  report,
}: {
  readonly report: NonNullable<AuditLearnerProjectionV1["report"]>;
}): ReactNode {
  const t = useTranslator();
  return (
    <PersistentResult
      tone={report.passed ? "pass" : "warn"}
      status={t(
        report.passed
          ? "hostedAudit.report.passed"
          : "hostedAudit.report.notPassed",
      )}
      title={t("hostedAudit.report.title")}
      summary={t("hostedAudit.report.summary", {
        score: report.score,
        maximum: report.maximumScore,
        passScore: report.passScore,
      })}
      facts={[
        {
          id: "confirmed",
          label: t("hostedAudit.report.confirmed"),
          value: report.confirmedFindingIds.length,
        },
        {
          id: "unsupported",
          label: t("hostedAudit.report.unsupported"),
          value: report.unsupportedFindingIds.length,
        },
        {
          id: "missed",
          label: t("hostedAudit.report.missed"),
          value: report.missedFindingDefinitionIds.length,
        },
        {
          id: "source",
          label: t("hostedAudit.report.sourceHash"),
          value: report.sourceStateHash,
          monospace: true,
        },
      ]}
    >
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("hostedAudit.report.dimension")}</th>
              <th scope="col">{t("hostedAudit.report.score")}</th>
            </tr>
          </thead>
          <tbody>
            {report.scoreLines.map((line) => (
              <tr key={line.scorableItemId}>
                <th scope="row">
                  {t(
                    `hostedAudit.score.${line.scorableItemId}`,
                  )}
                </th>
                <td>
                  {line.score}/{line.maximumScore}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PersistentResult>
  );
}
