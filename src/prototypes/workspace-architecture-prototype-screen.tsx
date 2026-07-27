import { useMemo, useState, type ReactNode } from "react";
import { useTranslator } from "../app/providers/locale-provider";
import { useNotifications } from "../app/providers/notification-provider";
import {
  AuditFindingBuilder,
  AuditWorkbenchShell,
  BlockchainInspector,
  LearningCheckpoint,
  LearningShell,
  PersistentResult,
  ProfessionalDecisionConsole,
  type AuditFindingDraft,
  type WorkspaceFact,
} from "../components/product-mode-workspaces";
import {
  CaseWorkspaceTabs,
  RoleApplicationShell,
} from "../components/simulation-workspace";
import { StatusPill } from "../components/status-pill";

type PrototypeId =
  | "certificate"
  | "discrepancy"
  | "audit-ledger"
  | "audit-finding"
  | "audit-conclusion"
  | "blockchain-inspector"
  | "mobile-handoff"
  | "mobile-finding";

const PROTOTYPE_IDS: readonly PrototypeId[] = [
  "certificate",
  "discrepancy",
  "audit-ledger",
  "audit-finding",
  "audit-conclusion",
  "blockchain-inspector",
  "mobile-handoff",
  "mobile-finding",
];

export function WorkspaceArchitecturePrototypeScreen(): ReactNode {
  const t = useTranslator();
  const [activeId, setActiveId] = useState<PrototypeId>("certificate");

  return (
    <main className="workspace-prototypes" id="main-content">
      <header className="workspace-prototypes__masthead">
        <div>
          <p className="eyebrow">{t("prototype.workspace.eyebrow")}</p>
          <h1>{t("prototype.workspace.title")}</h1>
          <p>{t("prototype.workspace.description")}</p>
        </div>
        <p className="notice">{t("prototype.workspace.boundary")}</p>
      </header>

      <nav
        className="workspace-prototypes__navigation"
        aria-label={t("prototype.workspace.navigationLabel")}
      >
        {PROTOTYPE_IDS.map((prototypeId, index) => (
          <button
            type="button"
            key={prototypeId}
            className={`workspace-prototypes__navigation-item${
              activeId === prototypeId
                ? " workspace-prototypes__navigation-item--active"
                : ""
            }`}
            aria-current={activeId === prototypeId ? "page" : undefined}
            onClick={() => setActiveId(prototypeId)}
          >
            <span aria-hidden="true">{index + 1}</span>
            {t(`prototype.workspace.nav.${prototypeId}`)}
          </button>
        ))}
      </nav>

      <div className="workspace-prototypes__canvas">
        <Prototype activeId={activeId} />
      </div>
    </main>
  );
}

function Prototype({ activeId }: { readonly activeId: PrototypeId }): ReactNode {
  switch (activeId) {
    case "certificate":
      return <CertificateVerificationPrototype />;
    case "discrepancy":
      return <DiscrepancyManagementPrototype />;
    case "audit-ledger":
      return <AuditLedgerPrototype />;
    case "audit-finding":
      return <AuditFindingPrototype />;
    case "audit-conclusion":
      return <AuditConclusionPrototype />;
    case "blockchain-inspector":
      return <BlockchainInspectorPrototype />;
    case "mobile-handoff":
      return <MobileHandoffPrototype />;
    case "mobile-finding":
      return <MobileFindingPrototype />;
  }
}

function CertificateVerificationPrototype(): ReactNode {
  const t = useTranslator();
  const { notify } = useNotifications();
  const [decision, setDecision] = useState("hold");
  const [submitted, setSubmitted] = useState(false);

  const submit = (): void => {
    setSubmitted(true);
    notify({
      notificationId: "prototype-certificate-decision",
      tone: "success",
      titleKey: "prototype.notification.recorded.title",
      messageKey: "prototype.notification.recorded.message",
    });
  };

  return (
    <LearningShell
      eyebrow={t("prototype.certificate.shellEyebrow")}
      title={t("prototype.certificate.shellTitle")}
      description={t("prototype.certificate.shellDescription")}
      supportTitle={t("prototype.common.learningSupport")}
      support={
        <>
          <p>{t("prototype.certificate.support")}</p>
          <LearningCheckpoint
            eyebrow={t("prototype.checkpoint.eyebrow")}
            title={t("prototype.certificate.checkpointTitle")}
            description={t("prototype.certificate.checkpointDescription")}
          >
            <p className="muted">
              {t("prototype.checkpoint.unscoredNotice")}
            </p>
          </LearningCheckpoint>
        </>
      }
      context={[
        {
          id: "role",
          label: t("prototype.common.role"),
          value: t("prototype.certificate.role"),
        },
        {
          id: "progress",
          label: t("prototype.common.progress"),
          value: t("prototype.certificate.progress"),
        },
      ]}
    >
      <RoleApplicationShell
        eyebrow={t("prototype.common.operationsApplication")}
        title={t("prototype.certificate.applicationTitle")}
        description={t("prototype.certificate.applicationDescription")}
        statusLabel={t("prototype.common.caseStatus")}
        status={
          <StatusPill tone={submitted ? "pass" : "neutral"}>
            {t(
              submitted
                ? "prototype.common.recorded"
                : "prototype.common.awaitingDecision",
            )}
          </StatusPill>
        }
      >
        <section className="prototype-evidence-grid">
          <EvidenceCard
            eyebrow={t("prototype.common.sourceDocument")}
            title={t("prototype.certificate.documentTitle")}
            facts={[
              {
                id: "issuer",
                label: t("prototype.certificate.issuer"),
                value: t("prototype.certificate.issuerValue"),
              },
              {
                id: "validity",
                label: t("prototype.certificate.validity"),
                value: t("prototype.certificate.expired"),
              },
            ]}
          />
          <EvidenceCard
            eyebrow={t("prototype.common.networkRegistry")}
            title={t("prototype.certificate.registryTitle")}
            facts={[
              {
                id: "recognized",
                label: t("prototype.certificate.recognition"),
                value: t("prototype.certificate.recognized"),
              },
              {
                id: "authority",
                label: t("prototype.certificate.authority"),
                value: t("prototype.certificate.authorized"),
              },
            ]}
          />
        </section>

        <ProfessionalDecisionConsole
          eyebrow={t("prototype.common.professionalDecision")}
          title={t("prototype.certificate.decisionTitle")}
          description={t("prototype.certificate.decisionDescription")}
          evidenceTitle={t("prototype.common.evidenceUsed")}
          evidence={<p>{t("prototype.certificate.evidenceSummary")}</p>}
          submitLabel={t("prototype.common.recordDecision")}
          disabled={submitted}
          onSubmit={submit}
        >
          <fieldset className="fieldset" disabled={submitted}>
            <legend>{t("prototype.certificate.optionsLegend")}</legend>
            {(["continue", "hold", "verify"] as const).map((optionId) => (
              <label className="choice" key={optionId}>
                <input
                  type="radio"
                  name="prototype-certificate-decision"
                  checked={decision === optionId}
                  onChange={() => setDecision(optionId)}
                />
                <span>{t(`prototype.certificate.option.${optionId}`)}</span>
              </label>
            ))}
          </fieldset>
        </ProfessionalDecisionConsole>

        {submitted ? (
          <PersistentResult
            tone="pass"
            status={t("prototype.common.recorded")}
            title={t("prototype.certificate.resultTitle")}
            summary={t("prototype.certificate.resultSummary")}
            facts={[
              {
                id: "ledger",
                label: t("prototype.common.ledgerEffect"),
                value: t("prototype.certificate.resultLedger"),
              },
              {
                id: "business",
                label: t("prototype.common.businessEffect"),
                value: t("prototype.certificate.resultBusiness"),
              },
            ]}
          />
        ) : null}
      </RoleApplicationShell>
    </LearningShell>
  );
}

function DiscrepancyManagementPrototype(): ReactNode {
  const t = useTranslator();
  const [submitted, setSubmitted] = useState(false);
  const { notify } = useNotifications();

  return (
    <LearningShell
      eyebrow={t("prototype.discrepancy.shellEyebrow")}
      title={t("prototype.discrepancy.shellTitle")}
      description={t("prototype.discrepancy.shellDescription")}
      supportTitle={t("prototype.common.learningSupport")}
      support={<p>{t("prototype.discrepancy.support")}</p>}
      context={[
        {
          id: "role",
          label: t("prototype.common.role"),
          value: t("prototype.discrepancy.role"),
        },
        {
          id: "progress",
          label: t("prototype.common.progress"),
          value: t("prototype.discrepancy.progress"),
        },
      ]}
    >
      <RoleApplicationShell
        eyebrow={t("prototype.common.operationsApplication")}
        title={t("prototype.discrepancy.applicationTitle")}
        description={t("prototype.discrepancy.applicationDescription")}
        statusLabel={t("prototype.common.caseStatus")}
        status={
          <StatusPill tone={submitted ? "pass" : "warn"}>
            {t(
              submitted
                ? "prototype.common.recorded"
                : "prototype.discrepancy.reviewRequired",
            )}
          </StatusPill>
        }
      >
        <div className="prototype-quantity-comparison">
          <Metric
            label={t("prototype.discrepancy.ledgerQuantity")}
            value={t("prototype.discrepancy.ledgerQuantityValue")}
          />
          <Metric
            label={t("prototype.discrepancy.measuredQuantity")}
            value={t("prototype.discrepancy.measuredQuantityValue")}
          />
          <Metric
            label={t("prototype.discrepancy.difference")}
            value={t("prototype.discrepancy.differenceValue")}
          />
        </div>
        <ProfessionalDecisionConsole
          eyebrow={t("prototype.common.professionalDecision")}
          title={t("prototype.discrepancy.decisionTitle")}
          description={t("prototype.discrepancy.decisionDescription")}
          evidenceTitle={t("prototype.common.evidenceUsed")}
          evidence={<p>{t("prototype.discrepancy.evidenceSummary")}</p>}
          submitLabel={t("prototype.common.recordDecision")}
          disabled={submitted}
          onSubmit={() => {
            setSubmitted(true);
            notify({
              notificationId: "prototype-discrepancy-decision",
              tone: "success",
              titleKey: "prototype.notification.recorded.title",
              messageKey: "prototype.notification.recorded.message",
            });
          }}
        >
          <fieldset className="fieldset" disabled={submitted}>
            <legend>{t("prototype.discrepancy.optionsLegend")}</legend>
            <label className="choice">
              <input type="radio" name="prototype-discrepancy" defaultChecked />
              <span>{t("prototype.discrepancy.option.investigate")}</span>
            </label>
            <label className="choice">
              <input type="radio" name="prototype-discrepancy" />
              <span>{t("prototype.discrepancy.option.overwrite")}</span>
            </label>
          </fieldset>
        </ProfessionalDecisionConsole>
        {submitted ? (
          <PersistentResult
            tone="pass"
            status={t("prototype.common.recorded")}
            title={t("prototype.discrepancy.resultTitle")}
            summary={t("prototype.discrepancy.resultSummary")}
            facts={[
              {
                id: "history",
                label: t("prototype.common.ledgerEffect"),
                value: t("prototype.discrepancy.resultLedger"),
              },
            ]}
          />
        ) : null}
      </RoleApplicationShell>
    </LearningShell>
  );
}

function AuditLedgerPrototype(): ReactNode {
  const t = useTranslator();
  const auditContext = useAuditContext();

  return (
    <AuditWorkbenchShell
      eyebrow={t("prototype.common.auditWorkbench")}
      title={t("prototype.auditLedger.title")}
      description={t("prototype.auditLedger.description")}
      context={auditContext}
      tabLabel={t("prototype.audit.tabsLabel")}
      initialTabId="ledger"
      tabs={[
        {
          id: "scope",
          label: t("prototype.audit.tab.scope"),
          status: t("prototype.common.complete"),
          content: <p>{t("prototype.auditLedger.scope")}</p>,
        },
        {
          id: "evidence",
          label: t("prototype.audit.tab.evidence"),
          status: t("prototype.auditLedger.evidenceCount"),
          content: <EvidenceList />,
        },
        {
          id: "ledger",
          label: t("prototype.audit.tab.ledger"),
          status: t("prototype.common.reviewing"),
          content: <LedgerInspection />,
        },
        {
          id: "findings",
          label: t("prototype.audit.tab.findings"),
          status: t("prototype.auditLedger.findingsCount"),
          content: <p>{t("prototype.auditLedger.findingsEmpty")}</p>,
        },
      ]}
    />
  );
}

function AuditFindingPrototype(): ReactNode {
  const t = useTranslator();
  const { notify } = useNotifications();
  const [submitted, setSubmitted] = useState(false);
  const [draft, setDraft] = useState<AuditFindingDraft>({
    title: t("prototype.auditFinding.initialTitle"),
    observation: t("prototype.auditFinding.initialObservation"),
    severity: "HIGH",
    evidenceIds: ["TX-018", "DOC-009"],
    recommendation: t("prototype.auditFinding.initialRecommendation"),
  });

  const builder = (
    <>
      <AuditFindingBuilder
        eyebrow={t("prototype.auditFinding.eyebrow")}
        title={t("prototype.auditFinding.title")}
        description={t("prototype.auditFinding.description")}
        labels={{
          findingTitle: t("prototype.auditFinding.field.title"),
          observation: t("prototype.auditFinding.field.observation"),
          severity: t("prototype.auditFinding.field.severity"),
          evidence: t("prototype.auditFinding.field.evidence"),
          recommendation: t("prototype.auditFinding.field.recommendation"),
          submit: t("prototype.auditFinding.submit"),
        }}
        severityOptions={{
          LOW: t("prototype.auditFinding.severity.low"),
          MEDIUM: t("prototype.auditFinding.severity.medium"),
          HIGH: t("prototype.auditFinding.severity.high"),
        }}
        evidenceOptions={[
          {
            evidenceId: "TX-018",
            label: t("prototype.auditFinding.evidence.transaction"),
          },
          {
            evidenceId: "DOC-009",
            label: t("prototype.auditFinding.evidence.document"),
          },
          {
            evidenceId: "POL-004",
            label: t("prototype.auditFinding.evidence.policy"),
          },
        ]}
        draft={draft}
        disabled={submitted}
        onChange={setDraft}
        onSubmit={() => {
          setSubmitted(true);
          notify({
            notificationId: "prototype-audit-finding",
            tone: "success",
            titleKey: "prototype.notification.finding.title",
            messageKey: "prototype.notification.finding.message",
          });
        }}
      />
      {submitted ? (
        <PersistentResult
          tone="pass"
          status={t("prototype.common.recorded")}
          title={t("prototype.auditFinding.resultTitle")}
          summary={t("prototype.auditFinding.resultSummary")}
          facts={[
            {
              id: "evidence",
              label: t("prototype.auditFinding.field.evidence"),
              value: draft.evidenceIds.join(", "),
              monospace: true,
            },
          ]}
        />
      ) : null}
    </>
  );

  return (
    <AuditWorkbenchShell
      eyebrow={t("prototype.common.auditWorkbench")}
      title={t("prototype.auditFinding.workbenchTitle")}
      description={t("prototype.auditFinding.workbenchDescription")}
      context={useAuditContext()}
      tabLabel={t("prototype.audit.tabsLabel")}
      initialTabId="findings"
      tabs={[
        {
          id: "evidence",
          label: t("prototype.audit.tab.evidence"),
          status: t("prototype.auditLedger.evidenceCount"),
          content: <EvidenceList />,
        },
        {
          id: "ledger",
          label: t("prototype.audit.tab.ledger"),
          status: t("prototype.common.complete"),
          content: <LedgerInspection />,
        },
        {
          id: "findings",
          label: t("prototype.audit.tab.findings"),
          status: t("prototype.auditFinding.draftStatus"),
          content: builder,
        },
      ]}
    />
  );
}

function AuditConclusionPrototype(): ReactNode {
  const t = useTranslator();
  const [submitted, setSubmitted] = useState(false);
  const { notify } = useNotifications();

  return (
    <AuditWorkbenchShell
      eyebrow={t("prototype.common.auditWorkbench")}
      title={t("prototype.auditConclusion.title")}
      description={t("prototype.auditConclusion.description")}
      context={useAuditContext()}
      tabLabel={t("prototype.audit.tabsLabel")}
      initialTabId="conclusion"
      tabs={[
        {
          id: "findings",
          label: t("prototype.audit.tab.findings"),
          status: t("prototype.auditConclusion.findingsStatus"),
          content: <p>{t("prototype.auditConclusion.findingsSummary")}</p>,
        },
        {
          id: "conclusion",
          label: t("prototype.audit.tab.conclusion"),
          status: t(
            submitted
              ? "prototype.common.complete"
              : "prototype.common.actionRequired",
          ),
          content: (
            <>
              <ProfessionalDecisionConsole
                eyebrow={t("prototype.auditConclusion.eyebrow")}
                title={t("prototype.auditConclusion.decisionTitle")}
                description={t("prototype.auditConclusion.decisionDescription")}
                evidenceTitle={t("prototype.common.evidenceUsed")}
                evidence={<p>{t("prototype.auditConclusion.evidenceSummary")}</p>}
                submitLabel={t("prototype.auditConclusion.submit")}
                disabled={submitted}
                onSubmit={() => {
                  setSubmitted(true);
                  notify({
                    notificationId: "prototype-audit-conclusion",
                    tone: "success",
                    titleKey: "prototype.notification.conclusion.title",
                    messageKey: "prototype.notification.conclusion.message",
                  });
                }}
              >
                <fieldset className="fieldset" disabled={submitted}>
                  <legend>{t("prototype.auditConclusion.optionsLegend")}</legend>
                  <label className="choice">
                    <input
                      type="radio"
                      name="prototype-audit-conclusion"
                      defaultChecked
                    />
                    <span>{t("prototype.auditConclusion.option.qualified")}</span>
                  </label>
                  <label className="choice">
                    <input type="radio" name="prototype-audit-conclusion" />
                    <span>{t("prototype.auditConclusion.option.unqualified")}</span>
                  </label>
                </fieldset>
              </ProfessionalDecisionConsole>
              {submitted ? (
                <PersistentResult
                  tone="warn"
                  status={t("prototype.auditConclusion.qualified")}
                  title={t("prototype.auditConclusion.resultTitle")}
                  summary={t("prototype.auditConclusion.resultSummary")}
                />
              ) : null}
            </>
          ),
        },
      ]}
    />
  );
}

function BlockchainInspectorPrototype(): ReactNode {
  const t = useTranslator();

  return (
    <BlockchainInspector
      eyebrow={t("prototype.common.blockchainInspector")}
      title={t("prototype.inspector.title")}
      description={t("prototype.inspector.description")}
      facts={[
        {
          id: "transaction",
          label: t("prototype.inspector.transaction"),
          value: "TX-018",
          monospace: true,
        },
        {
          id: "block",
          label: t("prototype.inspector.block"),
          value: "BLOCK-0007",
          monospace: true,
        },
        {
          id: "version",
          label: t("prototype.inspector.stateVersion"),
          value: "4 → 5",
          monospace: true,
        },
        {
          id: "status",
          label: t("prototype.inspector.validation"),
          value: (
            <StatusPill tone="pass">
              {t("prototype.inspector.valid")}
            </StatusPill>
          ),
        },
      ]}
    >
      <details className="card card--reference" open>
        <summary>{t("prototype.inspector.technicalEvidence")}</summary>
        <dl className="prototype-code-list">
          <div>
            <dt>{t("prototype.inspector.proposalDigest")}</dt>
            <dd className="mono">
              47ab9c2de6f0a18c7135f853e1bc15f12d62143655f834ccf7357dbd95de40a1
            </dd>
          </div>
          <div>
            <dt>{t("prototype.inspector.endorsementPolicy")}</dt>
            <dd className="mono">ALL_OF(PRODUCER, PROCESSOR)</dd>
          </div>
          <div>
            <dt>{t("prototype.inspector.authorization")}</dt>
            <dd>{t("prototype.inspector.authorizationValue")}</dd>
          </div>
        </dl>
      </details>
    </BlockchainInspector>
  );
}

function MobileHandoffPrototype(): ReactNode {
  const t = useTranslator();

  return (
    <MobileFrame label={t("prototype.mobileHandoff.frameLabel")}>
      <RoleApplicationShell
        eyebrow={t("prototype.mobileHandoff.eyebrow")}
        title={t("prototype.mobileHandoff.title")}
        description={t("prototype.mobileHandoff.description")}
        statusLabel={t("prototype.common.caseStatus")}
        status={
          <StatusPill tone="warn">
            {t("prototype.mobileHandoff.awaiting")}
          </StatusPill>
        }
      >
        <CaseWorkspaceTabs
          label={t("prototype.mobileHandoff.tabsLabel")}
          initialTabId="handoff"
          tabs={[
            {
              id: "shipment",
              label: t("prototype.mobileHandoff.tab.shipment"),
              status: t("prototype.common.complete"),
              content: <p>{t("prototype.mobileHandoff.shipmentSummary")}</p>,
            },
            {
              id: "evidence",
              label: t("prototype.mobileHandoff.tab.evidence"),
              status: t("prototype.mobileHandoff.evidenceStatus"),
              content: <p>{t("prototype.mobileHandoff.evidenceSummary")}</p>,
            },
            {
              id: "handoff",
              label: t("prototype.mobileHandoff.tab.handoff"),
              status: t("prototype.common.actionRequired"),
              content: (
                <ProfessionalDecisionConsole
                  eyebrow={t("prototype.common.professionalDecision")}
                  title={t("prototype.mobileHandoff.decisionTitle")}
                  description={t("prototype.mobileHandoff.decisionDescription")}
                  evidenceTitle={t("prototype.common.evidenceUsed")}
                  evidence={<p>{t("prototype.mobileHandoff.evidenceSummary")}</p>}
                  submitLabel={t("prototype.mobileHandoff.submit")}
                  onSubmit={() => undefined}
                >
                  <label className="field">
                    <span>{t("prototype.mobileHandoff.receiptNote")}</span>
                    <textarea className="field__control" rows={3} />
                  </label>
                </ProfessionalDecisionConsole>
              ),
            },
          ]}
        />
      </RoleApplicationShell>
    </MobileFrame>
  );
}

function MobileFindingPrototype(): ReactNode {
  const t = useTranslator();
  const [draft, setDraft] = useState<AuditFindingDraft>({
    title: t("prototype.mobileFinding.initialTitle"),
    observation: t("prototype.mobileFinding.initialObservation"),
    severity: "MEDIUM",
    evidenceIds: ["TX-018"],
    recommendation: "",
  });

  return (
    <MobileFrame label={t("prototype.mobileFinding.frameLabel")}>
      <AuditWorkbenchShell
        eyebrow={t("prototype.common.auditWorkbench")}
        title={t("prototype.mobileFinding.title")}
        description={t("prototype.mobileFinding.description")}
        context={[
          {
            id: "case",
            label: t("prototype.common.case"),
            value: "AUD-2026-014",
          },
        ]}
        tabLabel={t("prototype.audit.tabsLabel")}
        initialTabId="finding"
        tabs={[
          {
            id: "evidence",
            label: t("prototype.audit.tab.evidence"),
            status: t("prototype.mobileFinding.evidenceStatus"),
            content: <EvidenceList />,
          },
          {
            id: "finding",
            label: t("prototype.audit.tab.findings"),
            status: t("prototype.auditFinding.draftStatus"),
            content: (
              <AuditFindingBuilder
                eyebrow={t("prototype.auditFinding.eyebrow")}
                title={t("prototype.mobileFinding.builderTitle")}
                description={t("prototype.mobileFinding.builderDescription")}
                labels={{
                  findingTitle: t("prototype.auditFinding.field.title"),
                  observation: t("prototype.auditFinding.field.observation"),
                  severity: t("prototype.auditFinding.field.severity"),
                  evidence: t("prototype.auditFinding.field.evidence"),
                  recommendation: t(
                    "prototype.auditFinding.field.recommendation",
                  ),
                  submit: t("prototype.auditFinding.submit"),
                }}
                severityOptions={{
                  LOW: t("prototype.auditFinding.severity.low"),
                  MEDIUM: t("prototype.auditFinding.severity.medium"),
                  HIGH: t("prototype.auditFinding.severity.high"),
                }}
                evidenceOptions={[
                  {
                    evidenceId: "TX-018",
                    label: t("prototype.auditFinding.evidence.transaction"),
                  },
                  {
                    evidenceId: "POL-004",
                    label: t("prototype.auditFinding.evidence.policy"),
                  },
                ]}
                draft={draft}
                onChange={setDraft}
                onSubmit={() => undefined}
              />
            ),
          },
        ]}
      />
    </MobileFrame>
  );
}

function EvidenceCard({
  eyebrow,
  title,
  facts,
}: {
  readonly eyebrow: ReactNode;
  readonly title: ReactNode;
  readonly facts: readonly WorkspaceFact[];
}): ReactNode {
  return (
    <article className="card card--reference prototype-evidence-card">
      <p className="eyebrow">{eyebrow}</p>
      <h4>{title}</h4>
      <dl className="workspace-facts prototype-evidence-card__facts">
        {facts.map((fact) => (
          <div key={fact.id}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function Metric({
  label,
  value,
}: {
  readonly label: ReactNode;
  readonly value: ReactNode;
}): ReactNode {
  return (
    <div className="prototype-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EvidenceList(): ReactNode {
  const t = useTranslator();

  return (
    <ul className="prototype-evidence-list">
      <li>
        <strong>TX-018</strong>
        <span>{t("prototype.audit.evidence.transaction")}</span>
      </li>
      <li>
        <strong>DOC-009</strong>
        <span>{t("prototype.audit.evidence.document")}</span>
      </li>
      <li>
        <strong>POL-004</strong>
        <span>{t("prototype.audit.evidence.policy")}</span>
      </li>
    </ul>
  );
}

function LedgerInspection(): ReactNode {
  const t = useTranslator();

  return (
    <BlockchainInspector
      eyebrow={t("prototype.common.blockchainInspector")}
      title={t("prototype.auditLedger.inspectorTitle")}
      description={t("prototype.auditLedger.inspectorDescription")}
      facts={[
        {
          id: "transaction",
          label: t("prototype.inspector.transaction"),
          value: "TX-018",
          monospace: true,
        },
        {
          id: "signatures",
          label: t("prototype.auditLedger.signatures"),
          value: t("prototype.auditLedger.signaturesValue"),
        },
        {
          id: "state",
          label: t("prototype.inspector.stateVersion"),
          value: "4 → 5",
          monospace: true,
        },
      ]}
    />
  );
}

function MobileFrame({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section className="prototype-mobile-frame" aria-label={label}>
      <div className="prototype-mobile-frame__screen">{children}</div>
    </section>
  );
}

function useAuditContext(): readonly WorkspaceFact[] {
  const t = useTranslator();

  return useMemo(
    () => [
      {
        id: "case",
        label: t("prototype.common.case"),
        value: "AUD-2026-014",
        monospace: true,
      },
      {
        id: "scope",
        label: t("prototype.common.scope"),
        value: t("prototype.audit.scopeValue"),
      },
      {
        id: "status",
        label: t("prototype.common.caseStatus"),
        value: t("prototype.common.inProgress"),
      },
    ],
    [t],
  );
}
