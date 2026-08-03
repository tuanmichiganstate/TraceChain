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

export type AuditFindingSeverity =
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "CRITICAL";

export interface AuditFindingDraft {
  readonly findingId: string;
  readonly categoryId: string;
  readonly entityId: string;
  readonly title: string;
  readonly observation: string;
  readonly severity: AuditFindingSeverity;
  readonly materiality: "NON_MATERIAL" | "MATERIAL";
  readonly confidence: number;
  readonly evidenceIds: readonly string[];
  readonly policyIds: readonly string[];
  readonly rootCauseCode: string;
  readonly recommendationCode: string;
  readonly recommendation: string;
}

export interface AuditEvidenceOption {
  readonly evidenceId: string;
  readonly label: string;
}

export interface AuditChoiceOption {
  readonly choiceId: string;
  readonly label: string;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
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
  materialityOptions,
  categoryOptions,
  entityOptions,
  evidenceOptions,
  policyOptions,
  rootCauseOptions,
  recommendationOptions,
  inputLimits = {
    findingTitleUtf8Bytes: 120,
    findingObservationUtf8Bytes: 500,
    findingRecommendationUtf8Bytes: 500,
    maximumEvidenceCitationsPerFinding: Number.MAX_SAFE_INTEGER,
    maximumPolicyCitationsPerFinding: Number.MAX_SAFE_INTEGER,
  },
  draft,
  disabled = false,
  onChange,
  onSaveDraft,
  onSubmit,
}: {
  readonly eyebrow: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly labels: {
    readonly findingTitle: string;
    readonly category: string;
    readonly entity: string;
    readonly observation: string;
    readonly severity: string;
    readonly materiality: string;
    readonly confidence: string;
    readonly evidence: string;
    readonly policy: string;
    readonly rootCause: string;
    readonly recommendationChoice: string;
    readonly recommendation: string;
    readonly utf8ByteCount: (input: {
      readonly used: number;
      readonly maximum: number;
    }) => string;
    readonly utf8ByteExceeded: string;
    readonly saveDraft?: string;
    readonly submit: string;
  };
  readonly severityOptions: Readonly<
    Record<AuditFindingSeverity, string>
  >;
  readonly materialityOptions: Readonly<
    Record<AuditFindingDraft["materiality"], string>
  >;
  readonly categoryOptions: readonly AuditChoiceOption[];
  readonly entityOptions: readonly AuditChoiceOption[];
  readonly evidenceOptions: readonly AuditEvidenceOption[];
  readonly policyOptions: readonly AuditEvidenceOption[];
  readonly rootCauseOptions: readonly AuditChoiceOption[];
  readonly recommendationOptions: readonly AuditChoiceOption[];
  readonly inputLimits?: {
    readonly findingTitleUtf8Bytes: number;
    readonly findingObservationUtf8Bytes: number;
    readonly findingRecommendationUtf8Bytes: number;
    readonly maximumEvidenceCitationsPerFinding: number;
    readonly maximumPolicyCitationsPerFinding: number;
  };
  readonly draft: AuditFindingDraft;
  readonly disabled?: boolean;
  readonly onChange: (draft: AuditFindingDraft) => void;
  readonly onSaveDraft?: () => void;
  readonly onSubmit: () => void;
}): ReactNode {
  const headingId = useId();
  const titleBytes = utf8ByteLength(draft.title);
  const observationBytes = utf8ByteLength(draft.observation);
  const recommendationBytes = utf8ByteLength(draft.recommendation);
  const titleExceeded =
    titleBytes > inputLimits.findingTitleUtf8Bytes;
  const observationExceeded =
    observationBytes > inputLimits.findingObservationUtf8Bytes;
  const recommendationExceeded =
    recommendationBytes >
    inputLimits.findingRecommendationUtf8Bytes;
  const textWithinLimits =
    !titleExceeded &&
    !observationExceeded &&
    !recommendationExceeded;

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
  const setPolicy = (policyId: string, checked: boolean): void => {
    const policyIds = checked
      ? [...draft.policyIds, policyId]
      : draft.policyIds.filter((candidate) => candidate !== policyId);
    onChange({ ...draft, policyIds });
  };

  return (
    <section className="audit-finding-builder" aria-labelledby={headingId}>
      <header>
        <p className="eyebrow">{eyebrow}</p>
        <h3 id={headingId}>{title}</h3>
        <p>{description}</p>
      </header>
      <form className="audit-finding-builder__form stack" onSubmit={submit}>
        <div className="audit-finding-builder__pair">
          <label className="field">
            <span>{labels.category}</span>
            <select
              value={draft.categoryId}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...draft,
                  categoryId: event.target.value,
                })
              }
            >
              {categoryOptions.map((option) => (
                <option key={option.choiceId} value={option.choiceId}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{labels.entity}</span>
            <select
              value={draft.entityId}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...draft,
                  entityId: event.target.value,
                })
              }
            >
              {entityOptions.map((option) => (
                <option key={option.choiceId} value={option.choiceId}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field">
          <label htmlFor={`${headingId}-title`}>
            <span>{labels.findingTitle}</span>
          </label>
          <input
            id={`${headingId}-title`}
            value={draft.title}
            disabled={disabled}
            aria-invalid={titleExceeded}
            aria-describedby={`${headingId}-title-bytes${
              titleExceeded ? ` ${headingId}-title-error` : ""
            }`}
            onChange={(event) =>
              onChange({ ...draft, title: event.target.value })
            }
          />
          <span className="field__hint" id={`${headingId}-title-bytes`}>
            {labels.utf8ByteCount({
              used: titleBytes,
              maximum: inputLimits.findingTitleUtf8Bytes,
            })}
          </span>
          {titleExceeded ? (
            <span className="field__error" id={`${headingId}-title-error`}>
              {labels.utf8ByteExceeded}
            </span>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor={`${headingId}-observation`}>
            <span>{labels.observation}</span>
          </label>
          <textarea
            id={`${headingId}-observation`}
            value={draft.observation}
            rows={4}
            disabled={disabled}
            aria-invalid={observationExceeded}
            aria-describedby={`${headingId}-observation-bytes${
              observationExceeded
                ? ` ${headingId}-observation-error`
                : ""
            }`}
            onChange={(event) =>
              onChange({ ...draft, observation: event.target.value })
            }
          />
          <span
            className="field__hint"
            id={`${headingId}-observation-bytes`}
          >
            {labels.utf8ByteCount({
              used: observationBytes,
              maximum: inputLimits.findingObservationUtf8Bytes,
            })}
          </span>
          {observationExceeded ? (
            <span
              className="field__error"
              id={`${headingId}-observation-error`}
            >
              {labels.utf8ByteExceeded}
            </span>
          ) : null}
        </div>
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
        <div className="audit-finding-builder__pair">
          <label className="field">
            <span>{labels.materiality}</span>
            <select
              value={draft.materiality}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...draft,
                  materiality: event.target
                    .value as AuditFindingDraft["materiality"],
                })
              }
            >
              {(
                Object.entries(materialityOptions) as Array<
                  [AuditFindingDraft["materiality"], string]
                >
              ).map(([materiality, label]) => (
                <option key={materiality} value={materiality}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{labels.confidence}</span>
            <input
              type="number"
              min={0}
              max={100}
              value={draft.confidence}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...draft,
                  confidence: Number(event.target.value),
                })
              }
            />
          </label>
        </div>
        <fieldset className="fieldset" disabled={disabled}>
          <legend>{labels.evidence}</legend>
          <div className="audit-finding-builder__evidence">
            {evidenceOptions.map((option) => (
              <label key={option.evidenceId} className="choice">
                <input
                  type="checkbox"
                  checked={draft.evidenceIds.includes(option.evidenceId)}
                  disabled={
                    disabled ||
                    (!draft.evidenceIds.includes(option.evidenceId) &&
                      draft.evidenceIds.length >=
                        inputLimits.maximumEvidenceCitationsPerFinding)
                  }
                  onChange={(event) =>
                    setEvidence(option.evidenceId, event.target.checked)
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="fieldset" disabled={disabled}>
          <legend>{labels.policy}</legend>
          <div className="audit-finding-builder__evidence">
            {policyOptions.map((option) => (
              <label key={option.evidenceId} className="choice">
                <input
                  type="checkbox"
                  checked={draft.policyIds.includes(option.evidenceId)}
                  disabled={
                    disabled ||
                    (!draft.policyIds.includes(option.evidenceId) &&
                      draft.policyIds.length >=
                        inputLimits.maximumPolicyCitationsPerFinding)
                  }
                  onChange={(event) =>
                    setPolicy(option.evidenceId, event.target.checked)
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="audit-finding-builder__pair">
          <label className="field">
            <span>{labels.rootCause}</span>
            <select
              value={draft.rootCauseCode}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...draft,
                  rootCauseCode: event.target.value,
                })
              }
            >
              {rootCauseOptions.map((option) => (
                <option key={option.choiceId} value={option.choiceId}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{labels.recommendationChoice}</span>
            <select
              value={draft.recommendationCode}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...draft,
                  recommendationCode: event.target.value,
                })
              }
            >
              {recommendationOptions.map((option) => (
                <option key={option.choiceId} value={option.choiceId}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field">
          <label htmlFor={`${headingId}-recommendation`}>
            <span>{labels.recommendation}</span>
          </label>
          <textarea
            id={`${headingId}-recommendation`}
            value={draft.recommendation}
            rows={3}
            disabled={disabled}
            aria-invalid={recommendationExceeded}
            aria-describedby={`${headingId}-recommendation-bytes${
              recommendationExceeded
                ? ` ${headingId}-recommendation-error`
                : ""
            }`}
            onChange={(event) =>
              onChange({ ...draft, recommendation: event.target.value })
            }
          />
          <span
            className="field__hint"
            id={`${headingId}-recommendation-bytes`}
          >
            {labels.utf8ByteCount({
              used: recommendationBytes,
              maximum:
                inputLimits.findingRecommendationUtf8Bytes,
            })}
          </span>
          {recommendationExceeded ? (
            <span
              className="field__error"
              id={`${headingId}-recommendation-error`}
            >
              {labels.utf8ByteExceeded}
            </span>
          ) : null}
        </div>
        <div className="audit-finding-builder__actions">
          {onSaveDraft === undefined ||
          labels.saveDraft === undefined ? null : (
            <button
              type="button"
              className="button button--secondary"
              disabled={disabled || !textWithinLimits}
              onClick={onSaveDraft}
            >
              {labels.saveDraft}
            </button>
          )}
          <button
            type="submit"
            className="button button--primary"
              disabled={
                disabled ||
                !textWithinLimits ||
                draft.title.trim().length === 0 ||
              draft.observation.trim().length === 0 ||
              draft.evidenceIds.length === 0 ||
              draft.policyIds.length === 0 ||
              draft.recommendation.trim().length === 0
            }
          >
            {labels.submit}
          </button>
        </div>
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
