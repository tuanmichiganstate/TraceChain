import {
  useId,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CaseWorkspaceTabs,
  InspectorSurface,
  type CaseWorkspaceTab,
} from "./simulation-workspace";
import { StatusPill, type StatusTone } from "./status-pill";

export interface WorkspaceFact {
  readonly id: string;
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly monospace?: boolean;
}

/**
 * A presentation-only shell for guided learning activities.
 *
 * The shell keeps learning support beside the professional task without
 * owning commands, scoring, or progression. Existing stages can adopt it
 * incrementally after the benchmark review rather than being redesigned at
 * once.
 */
export function LearningShell({
  eyebrow,
  title,
  description,
  supportTitle,
  support,
  context,
  children,
}: {
  readonly eyebrow: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly supportTitle: ReactNode;
  readonly support: ReactNode;
  readonly context: readonly WorkspaceFact[];
  readonly children: ReactNode;
}): ReactNode {
  const headingId = useId();
  const supportId = useId();

  return (
    <section className="learning-shell" aria-labelledby={headingId}>
      <header className="learning-shell__header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={headingId}>{title}</h2>
          <p>{description}</p>
        </div>
        <WorkspaceFacts facts={context} className="learning-shell__context" />
      </header>

      <div className="learning-shell__layout">
        <aside
          className="learning-shell__support stack"
          aria-labelledby={supportId}
        >
          <h3 id={supportId}>{supportTitle}</h3>
          {support}
        </aside>
        <div className="learning-shell__activity stack">{children}</div>
      </div>
    </section>
  );
}

/**
 * Evidence-first application shell for audit work.
 *
 * It deliberately reuses the bounded case tabs already used by operational
 * stages. Audit commands and evidence remain outside this presentation layer.
 */
export function AuditWorkbenchShell({
  eyebrow,
  title,
  description,
  context,
  tabLabel,
  initialTabId,
  tabs,
}: {
  readonly eyebrow: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly context: readonly WorkspaceFact[];
  readonly tabLabel: string;
  readonly initialTabId: string;
  readonly tabs: readonly CaseWorkspaceTab[];
}): ReactNode {
  const headingId = useId();

  return (
    <section className="audit-workbench" aria-labelledby={headingId}>
      <header className="audit-workbench__header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={headingId}>{title}</h2>
          <p>{description}</p>
        </div>
        <WorkspaceFacts facts={context} className="audit-workbench__context" />
      </header>
      <div className="audit-workbench__body">
        <CaseWorkspaceTabs
          label={tabLabel}
          initialTabId={initialTabId}
          tabs={tabs}
        />
      </div>
    </section>
  );
}

/**
 * Dense, technical-neutral evidence display. It does not imply that a valid
 * record proves the truth of the underlying business statement.
 */
export function BlockchainInspector({
  eyebrow,
  title,
  description,
  facts,
  children,
}: {
  readonly eyebrow: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly facts: readonly WorkspaceFact[];
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <InspectorSurface
      eyebrow={eyebrow}
      title={title}
      description={description}
    >
      <WorkspaceFacts
        facts={facts}
        className="blockchain-inspector__facts"
      />
      {children}
    </InspectorSurface>
  );
}

/**
 * A business-decision boundary, visually separate from an academic checkpoint.
 */
export function ProfessionalDecisionConsole({
  eyebrow,
  title,
  description,
  evidenceTitle,
  evidence,
  submitLabel,
  disabled = false,
  onSubmit,
  children,
}: {
  readonly eyebrow: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly evidenceTitle: ReactNode;
  readonly evidence: ReactNode;
  readonly submitLabel: ReactNode;
  readonly disabled?: boolean;
  readonly onSubmit: () => void;
  readonly children: ReactNode;
}): ReactNode {
  const headingId = useId();
  const evidenceId = useId();

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!disabled) onSubmit();
  };

  return (
    <section
      className="professional-decision-console"
      aria-labelledby={headingId}
    >
      <header className="professional-decision-console__header">
        <p className="eyebrow">{eyebrow}</p>
        <h3 id={headingId}>{title}</h3>
        <p>{description}</p>
      </header>
      <aside
        className="professional-decision-console__evidence"
        aria-labelledby={evidenceId}
      >
        <h4 id={evidenceId}>{evidenceTitle}</h4>
        {evidence}
      </aside>
      <form
        className="professional-decision-console__form stack"
        onSubmit={submit}
      >
        {children}
        <div className="professional-decision-console__actions">
          <button
            type="submit"
            className="button button--primary"
            disabled={disabled}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
}

/**
 * A quiet academic layer that cannot be mistaken for a business transaction.
 */
export function LearningCheckpoint({
  eyebrow,
  title,
  description,
  children,
}: {
  readonly eyebrow: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  const headingId = useId();

  return (
    <section className="learning-checkpoint" aria-labelledby={headingId}>
      <p className="eyebrow">{eyebrow}</p>
      <h3 id={headingId}>{title}</h3>
      <p>{description}</p>
      <div className="learning-checkpoint__body">{children}</div>
    </section>
  );
}

/**
 * Durable result evidence. Toasts may acknowledge submission, but this region
 * remains in the document and explains the resulting state.
 */
export function PersistentResult({
  tone,
  status,
  title,
  summary,
  facts = [],
  children,
}: {
  readonly tone: StatusTone;
  readonly status: ReactNode;
  readonly title: ReactNode;
  readonly summary: ReactNode;
  readonly facts?: readonly WorkspaceFact[];
  readonly children?: ReactNode;
}): ReactNode {
  const headingId = useId();

  return (
    <section
      className={`persistent-result persistent-result--${tone}`}
      aria-labelledby={headingId}
    >
      <header className="persistent-result__header">
        <StatusPill tone={tone}>{status}</StatusPill>
        <h3 id={headingId}>{title}</h3>
      </header>
      <p>{summary}</p>
      {facts.length > 0 ? (
        <WorkspaceFacts facts={facts} className="persistent-result__facts" />
      ) : null}
      {children}
    </section>
  );
}

export type AuditFindingSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface AuditFindingDraft {
  readonly title: string;
  readonly observation: string;
  readonly severity: AuditFindingSeverity;
  readonly evidenceIds: readonly string[];
  readonly recommendation: string;
}

export interface AuditEvidenceOption {
  readonly evidenceId: string;
  readonly label: string;
}

/**
 * A bounded, evidence-linked audit finding form. It never mutates ledger state
 * and does not decide whether the finding is correct.
 */
export function AuditFindingBuilder({
  eyebrow,
  title,
  description,
  labels,
  severityOptions,
  evidenceOptions,
  draft,
  disabled = false,
  onChange,
  onSubmit,
}: {
  readonly eyebrow: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly labels: {
    readonly findingTitle: string;
    readonly observation: string;
    readonly severity: string;
    readonly evidence: string;
    readonly recommendation: string;
    readonly submit: string;
  };
  readonly severityOptions: Readonly<
    Record<AuditFindingSeverity, string>
  >;
  readonly evidenceOptions: readonly AuditEvidenceOption[];
  readonly draft: AuditFindingDraft;
  readonly disabled?: boolean;
  readonly onChange: (draft: AuditFindingDraft) => void;
  readonly onSubmit: () => void;
}): ReactNode {
  const headingId = useId();

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!disabled) onSubmit();
  };

  const setEvidence = (evidenceId: string, checked: boolean): void => {
    const evidenceIds = checked
      ? [...draft.evidenceIds, evidenceId]
      : draft.evidenceIds.filter((candidate) => candidate !== evidenceId);
    onChange({ ...draft, evidenceIds });
  };

  return (
    <section className="audit-finding-builder" aria-labelledby={headingId}>
      <header>
        <p className="eyebrow">{eyebrow}</p>
        <h3 id={headingId}>{title}</h3>
        <p>{description}</p>
      </header>
      <form className="audit-finding-builder__form stack" onSubmit={submit}>
        <label className="field">
          <span>{labels.findingTitle}</span>
          <input
            value={draft.title}
            maxLength={120}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...draft, title: event.target.value })
            }
          />
        </label>
        <label className="field">
          <span>{labels.observation}</span>
          <textarea
            value={draft.observation}
            maxLength={500}
            rows={4}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...draft, observation: event.target.value })
            }
          />
        </label>
        <fieldset className="fieldset" disabled={disabled}>
          <legend>{labels.severity}</legend>
          <div className="audit-finding-builder__severity">
            {(
              Object.entries(severityOptions) as Array<
                [AuditFindingSeverity, string]
              >
            ).map(([severity, label]) => (
              <label key={severity} className="choice">
                <input
                  type="radio"
                  name={`${headingId}-severity`}
                  value={severity}
                  checked={draft.severity === severity}
                  onChange={() => onChange({ ...draft, severity })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="fieldset" disabled={disabled}>
          <legend>{labels.evidence}</legend>
          <div className="audit-finding-builder__evidence">
            {evidenceOptions.map((option) => (
              <label key={option.evidenceId} className="choice">
                <input
                  type="checkbox"
                  checked={draft.evidenceIds.includes(option.evidenceId)}
                  onChange={(event) =>
                    setEvidence(option.evidenceId, event.target.checked)
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>{labels.recommendation}</span>
          <textarea
            value={draft.recommendation}
            maxLength={500}
            rows={3}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...draft, recommendation: event.target.value })
            }
          />
        </label>
        <button
          type="submit"
          className="button button--primary"
          disabled={
            disabled ||
            draft.title.trim().length === 0 ||
            draft.observation.trim().length === 0 ||
            draft.evidenceIds.length === 0
          }
        >
          {labels.submit}
        </button>
      </form>
    </section>
  );
}

function WorkspaceFacts({
  facts,
  className,
}: {
  readonly facts: readonly WorkspaceFact[];
  readonly className: string;
}): ReactNode {
  if (facts.length === 0) return null;

  return (
    <dl className={`workspace-facts ${className}`}>
      {facts.map((fact) => (
        <div key={fact.id}>
          <dt>{fact.label}</dt>
          <dd className={fact.monospace ? "mono break-anywhere" : undefined}>
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
