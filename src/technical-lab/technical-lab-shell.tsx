import {
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslator } from "../app/providers/locale-provider";
import { useNotifications } from "../app/providers/notification-provider";
import { StatusPill, type StatusTone } from "../components/status-pill";
import type { TechnicalExperimentActionType } from "./contracts";
import type {
  TechnicalLabCheckpointKind,
  TechnicalLabCheckpointProjection,
  TechnicalLabEvidenceField,
  TechnicalLabModuleProjection,
  TechnicalLabReplay,
} from "./engine";
import type { TechnicalLabRuntimePackage } from "../config/technical-lab-runtime-loader";

interface TechnicalLabShellProps {
  readonly runtime: TechnicalLabRuntimePackage;
  readonly replay: TechnicalLabReplay;
  readonly busy: boolean;
  readonly readOnly: boolean;
  readonly embedded?: boolean;
  readonly onAction: (
    actionType: TechnicalExperimentActionType,
    operands?: {
      readonly operandA: number;
      readonly operandB: number;
    },
  ) => Promise<void>;
  readonly onResponse: (
    kind: TechnicalLabCheckpointKind,
    optionId: string,
  ) => Promise<void>;
  readonly onHint: () => Promise<void>;
  readonly onAdvance: () => Promise<void>;
}

const ORGANIZATION_KEYS: Readonly<Record<string, string>> = {
  ORG_PRODUCER_COOP: "organizations.producerCoop.name",
  ORG_COFFEE_PROCESSOR: "organizations.coffeeProcessor.name",
  ORG_CERTIFICATION_BODY: "organizations.certificationBody.name",
  ORG_LOGISTICS_PROVIDER: "organizations.logisticsProvider.name",
};

const RESULT_VALUE_KEYS: Readonly<Record<string, string>> = {
  REJECTED_UNAUTHORIZED:
    "technicalLab.value.REJECTED_UNAUTHORIZED",
  REJECTED_STALE: "technicalLab.value.REJECTED_STALE",
  REJECTED: "technicalLab.value.REJECTED",
  COMMITTED: "technicalLab.value.COMMITTED",
};

function toneFor(
  field: TechnicalLabEvidenceField,
): StatusTone {
  return field.status.toLowerCase() as StatusTone;
}

function displayedValue(
  field: TechnicalLabEvidenceField,
  t: ReturnType<typeof useTranslator>,
): string {
  if (typeof field.value === "boolean") {
    return t(
      field.value
        ? "technicalLab.value.yes"
        : "technicalLab.value.no",
    );
  }
  if (typeof field.value === "number") {
    return t.formatNumber(field.value);
  }
  const organizationKey = ORGANIZATION_KEYS[field.value];
  if (organizationKey !== undefined) return t(organizationKey);
  const resultKey = RESULT_VALUE_KEYS[field.value];
  return resultKey === undefined ? field.value : t(resultKey);
}

function contentText(
  runtime: TechnicalLabRuntimePackage,
  key: string,
): string {
  const catalogue =
    runtime.bundle.localizationCatalogs[
      runtime.configuration.locale
    ];
  const value = catalogue?.[key];
  if (value === undefined) {
    throw new Error(
      `Technical Laboratory content is missing "${key}"`,
    );
  }
  return value;
}

function ModuleStatus({
  module,
}: {
  readonly module: TechnicalLabModuleProjection;
}): ReactNode {
  const t = useTranslator();
  const status = module.complete
    ? "complete"
    : module.current
      ? "current"
      : module.locked
        ? "locked"
        : "ready";
  const tone: StatusTone =
    status === "complete"
      ? "pass"
      : status === "locked"
        ? "neutral"
        : "warn";
  return (
    <StatusPill tone={tone}>
      {t(`technicalLab.shell.status.${status}`)}
    </StatusPill>
  );
}

function EvidenceInspector({
  module,
}: {
  readonly module: TechnicalLabModuleProjection;
}): ReactNode {
  const t = useTranslator();
  const [open, setOpen] = useState(module.experimentComplete);
  const visible =
    module.evidence?.fields.filter(
      (field) =>
        field.revealAfterActionCount <=
        module.experimentActionCount,
    ) ?? [];
  return (
    <details
      className="technical-lab__evidence card card--reference"
      open={open}
      onToggle={(event) =>
        setOpen(event.currentTarget.open)
      }
    >
      <summary>{t("technicalLab.shell.evidenceHeading")}</summary>
      {visible.length === 0 ? (
        <p>{t("technicalLab.shell.noEvidence")}</p>
      ) : (
        <dl className="technical-lab__evidence-list">
          {visible.map((field) => {
            const value = displayedValue(field, t);
            return (
              <div key={field.fieldId}>
                <dt>{t(field.labelKey)}</dt>
                <dd>
                  {field.monospace === true ? (
                    <code className="hash">{value}</code>
                  ) : (
                    <StatusPill tone={toneFor(field)}>
                      {value}
                    </StatusPill>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </details>
  );
}

function CheckpointItem({
  runtime,
  projection,
  kind,
  busy,
  readOnly,
  onSubmit,
}: {
  readonly runtime: TechnicalLabRuntimePackage;
  readonly projection: TechnicalLabCheckpointProjection;
  readonly kind: TechnicalLabCheckpointKind;
  readonly busy: boolean;
  readonly readOnly: boolean;
  readonly onSubmit: (
    kind: TechnicalLabCheckpointKind,
    optionId: string,
  ) => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  const [selection, setSelection] = useState({
    itemId: projection.definition.itemId,
    attempts: projection.attempts,
    value: "",
  });
  const selected =
    selection.itemId === projection.definition.itemId &&
    selection.attempts === projection.attempts
      ? selection.value
      : "";
  const remaining =
    projection.definition.maximumAttempts - projection.attempts;
  const feedbackVisible = projection.attempts > 0;
  const headingKey =
    kind === "INTERPRETATION"
      ? "technicalLab.shell.interpretationHeading"
      : "technicalLab.shell.applicationHeading";

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (selected.length === 0) return;
    void onSubmit(kind, selected);
  }

  return (
    <section className="technical-lab__checkpoint-item">
      <h4>{t(headingKey)}</h4>
      <form onSubmit={submit}>
        <fieldset
          className="technical-lab__choices"
          disabled={busy || readOnly || projection.terminal}
        >
          <legend>
            {contentText(
              runtime,
              projection.definition.prompt.localizationKey,
            )}
          </legend>
          {projection.definition.options.map((option) => (
            <label key={option.optionId}>
              <input
                type="radio"
                name={projection.definition.itemId}
                value={option.optionId}
                checked={selected === option.optionId}
                onChange={() =>
                  setSelection({
                    itemId: projection.definition.itemId,
                    attempts: projection.attempts,
                    value: option.optionId,
                  })
                }
              />
              <span>
                {contentText(
                  runtime,
                  option.label.localizationKey,
                )}
              </span>
            </label>
          ))}
        </fieldset>
        {!projection.terminal ? (
          <button
            className="button button--secondary"
            type="submit"
            disabled={
              busy || readOnly || selected.length === 0
            }
          >
            {t("technicalLab.shell.submitAnswer")}
          </button>
        ) : null}
      </form>
      {feedbackVisible ? (
        <div
          className="technical-lab__checkpoint-feedback"
          role="status"
          aria-live="polite"
        >
          <StatusPill
            tone={projection.correct ? "pass" : "warn"}
          >
            {t(
              projection.correct
                ? "technicalLab.shell.correct"
                : "technicalLab.shell.incorrect",
            )}
          </StatusPill>
          <p>
            {contentText(
              runtime,
              projection.definition.explanation.localizationKey,
            )}
          </p>
          {!projection.terminal ? (
            <p className="muted">
              {t("technicalLab.shell.attemptsRemaining", {
                attempts: remaining,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CheckpointPanel({
  runtime,
  module,
  busy,
  readOnly,
  onResponse,
  onHint,
}: {
  readonly runtime: TechnicalLabRuntimePackage;
  readonly module: TechnicalLabModuleProjection;
  readonly busy: boolean;
  readonly readOnly: boolean;
  readonly onResponse: TechnicalLabShellProps["onResponse"];
  readonly onHint: TechnicalLabShellProps["onHint"];
}): ReactNode {
  const t = useTranslator();
  if (!module.experimentComplete) return null;
  const hintMaximum =
    module.interpretation.maximumPoints *
    module.module.hint.maximumAwardFraction;
  return (
    <section className="technical-lab__checkpoint card card--work">
      <h3>{t("technicalLab.shell.checkpointHeading")}</h3>
      {!module.hintOpened &&
      !module.interpretation.terminal ? (
        <div className="technical-lab__hint-disclosure">
          <p>
            {t("technicalLab.shell.hintRisk", {
              points: hintMaximum,
              maximum: module.interpretation.maximumPoints,
            })}
          </p>
          <button
            className="button button--quiet"
            type="button"
            disabled={busy || readOnly}
            onClick={() => void onHint()}
          >
            {t("technicalLab.shell.hintButton")}
          </button>
        </div>
      ) : null}
      {module.hintOpened ? (
        <aside className="notice">
          <h4>{t("technicalLab.shell.hintHeading")}</h4>
          <p>
            {contentText(
              runtime,
              module.module.hint.body.localizationKey,
            )}
          </p>
        </aside>
      ) : null}
      <CheckpointItem
        runtime={runtime}
        projection={module.interpretation}
        kind="INTERPRETATION"
        busy={busy}
        readOnly={readOnly}
        onSubmit={onResponse}
      />
      <CheckpointItem
        runtime={runtime}
        projection={module.application}
        kind="APPLICATION"
        busy={busy}
        readOnly={readOnly}
        onSubmit={onResponse}
      />
    </section>
  );
}

function FinalReport({
  runtime,
  replay,
}: {
  readonly runtime: TechnicalLabRuntimePackage;
  readonly replay: TechnicalLabReplay;
}): ReactNode {
  const t = useTranslator();
  const hintCount = replay.snapshot.hintModuleIndexes.length;
  const misconceptionCounts = new Map<
    string,
    {
      readonly promptKey: string;
      readonly optionKey: string;
      readonly count: number;
    }
  >();
  for (const response of replay.snapshot.responseJournal) {
    const module = replay.modules[response.moduleIndex]?.module;
    if (module === undefined) continue;
    const definition =
      response.kind === "INTERPRETATION"
        ? module.interpretationItem
        : module.applicationItem;
    const option = definition.options[response.optionIndex];
    if (
      option === undefined ||
      option.optionId === definition.correctOptionId
    ) {
      continue;
    }
    const key = `${definition.itemId}\u0000${option.optionId}`;
    const prior = misconceptionCounts.get(key);
    misconceptionCounts.set(key, {
      promptKey: definition.prompt.localizationKey,
      optionKey: option.label.localizationKey,
      count: (prior?.count ?? 0) + 1,
    });
  }
  const misconceptions = [...misconceptionCounts.values()];
  return (
    <section className="technical-lab__report card">
      <p className="eyebrow">
        {t("technicalLab.shell.eyebrow")}
      </p>
      <h2>{t("technicalLab.shell.reportHeading")}</h2>
      <p>{t("technicalLab.shell.reportLead")}</p>
      <StatusPill
        tone={replay.score.passed ? "pass" : "fail"}
      >
        {t(
          replay.score.passed
            ? "technicalLab.shell.passed"
            : "technicalLab.shell.failed",
        )}
      </StatusPill>
      <div className="technical-lab__report-score">
        <strong>{t("technicalLab.shell.totalScore")}</strong>
        <span>
          {t.formatNumber(replay.score.totalScore)} / 100
        </span>
      </div>
      <p>
        {t("technicalLab.shell.reportPassScore", {
          score: replay.score.passScore,
        })}
      </p>
      <h3>{t("technicalLab.shell.scoreBreakdown")}</h3>
      <dl className="technical-lab__score-grid">
        <div>
          <dt>{t("technicalLab.shell.experimentScore")}</dt>
          <dd>
            {t.formatNumber(replay.score.experimentScore)} / 40
          </dd>
        </div>
        <div>
          <dt>
            {t("technicalLab.shell.interpretationScore")}
          </dt>
          <dd>
            {t.formatNumber(
              replay.score.interpretationScore,
            )}{" "}
            / 40
          </dd>
        </div>
        <div>
          <dt>{t("technicalLab.shell.applicationScore")}</dt>
          <dd>
            {t.formatNumber(replay.score.applicationScore)} / 20
          </dd>
        </div>
      </dl>
      <h3>{t("technicalLab.shell.moduleScores")}</h3>
      <ul className="technical-lab__module-scores">
        {replay.modules.map((module) => (
          <li key={module.module.moduleId}>
            <span>
              {contentText(
                runtime,
                module.module.title.localizationKey,
              )}
            </span>
            <strong>
              {t.formatNumber(module.score)} /{" "}
              {t.formatNumber(module.maximumScore)}
            </strong>
            <small>
              {t("technicalLab.shell.moduleVersion", {
                version: module.module.moduleVersion,
              })}
            </small>
          </li>
        ))}
      </ul>
      <h3>{t("technicalLab.shell.diagnosticsHeading")}</h3>
      <p>{t("technicalLab.shell.diagnosticsHelp")}</p>
      <ul className="technical-lab__module-scores">
        {replay.modules.map((module) => {
          const demonstrated =
            module.experimentComplete &&
            module.interpretation.correct &&
            module.application.correct;
          return (
            <li key={module.module.moduleId}>
              <span>
                {contentText(
                  runtime,
                  module.module.title.localizationKey,
                )}
              </span>
              <StatusPill tone={demonstrated ? "pass" : "warn"}>
                {t(
                  demonstrated
                    ? "technicalLab.shell.diagnosticDemonstrated"
                    : "technicalLab.shell.diagnosticReview",
                )}
              </StatusPill>
            </li>
          );
        })}
      </ul>
      <h3>{t("technicalLab.shell.misconceptionsHeading")}</h3>
      {misconceptions.length === 0 ? (
        <p>{t("technicalLab.shell.noMisconceptions")}</p>
      ) : (
        <ul>
          {misconceptions.map((misconception) => (
            <li
              key={`${misconception.promptKey}\u0000${misconception.optionKey}`}
            >
              <strong>
                {contentText(runtime, misconception.promptKey)}
              </strong>
              <br />
              {t("technicalLab.shell.selectedResponse", {
                response: contentText(
                  runtime,
                  misconception.optionKey,
                ),
                count: misconception.count,
              })}
            </li>
          ))}
        </ul>
      )}
      <p>
        {t("technicalLab.shell.hintsUsed", {
          count: hintCount,
        })}
      </p>
      <h3>{t("technicalLab.shell.trustChainHeading")}</h3>
      <p>{t("technicalLab.shell.trustChainText")}</p>
      <h3>{t("technicalLab.shell.realSimulatedHeading")}</h3>
      <p>{t("technicalLab.shell.realMechanisms")}</p>
      <p>{t("technicalLab.shell.simulatedMechanisms")}</p>
      <p className="muted">
        {runtime.bundle.pack.labPackId} v
        {runtime.bundle.pack.labPackVersion} ·{" "}
        {runtime.configurationHash}
      </p>
    </section>
  );
}

export function TechnicalLabShell({
  runtime,
  replay,
  busy,
  readOnly,
  embedded = false,
  onAction,
  onResponse,
  onHint,
  onAdvance,
}: TechnicalLabShellProps): ReactNode {
  const t = useTranslator();
  const notifications = useNotifications();
  const [moduleView, setModuleView] = useState({
    activeModuleIndex: replay.snapshot.currentModuleIndex,
    viewModuleIndex: replay.snapshot.currentModuleIndex,
  });
  const [replacement, setReplacement] = useState("X");
  const viewModuleIndex =
    moduleView.activeModuleIndex ===
    replay.snapshot.currentModuleIndex
      ? moduleView.viewModuleIndex
      : replay.snapshot.currentModuleIndex;
  const module =
    replay.modules[viewModuleIndex] ??
    replay.modules[replay.snapshot.currentModuleIndex]!;
  const completedCount = replay.modules.filter(
    (candidate) => candidate.complete,
  ).length;
  const isActiveView =
    viewModuleIndex === replay.snapshot.currentModuleIndex;
  const expectedAction =
    isActiveView ? replay.expectedAction : null;
  const actionLabel =
    expectedAction === null
      ? null
      : t(`technicalLab.action.${expectedAction.actionType}`);
  const replacementCharacter = useMemo(
    () => [...replacement][0] ?? "X",
    [replacement],
  );

  async function runAction(): Promise<void> {
    if (expectedAction === null) return;
    await onAction(
      expectedAction.actionType,
      expectedAction.actionType === "EDIT_INPUT"
        ? {
            operandA: 1,
            operandB:
              replacementCharacter.codePointAt(0) ?? 88,
          }
        : undefined,
    );
    notifications.notify({
      notificationId: `TL_ACTION_${module.module.moduleId}_${String(module.experimentActionCount + 1)}`,
      tone: "success",
      titleKey: "technicalLab.notification.actionComplete",
      autoDismissMs: 2_500,
    });
  }

  const Root = embedded ? "section" : "main";
  return (
    <>
      <a className="skip-link" href="#technical-lab-workbench">
        {t("technicalLab.shell.skipToWorkbench")}
      </a>
      <Root
        className="technical-lab"
        {...(embedded ? {} : { id: "main-content" })}
      >
        <header className="technical-lab__header">
          <div>
            <p className="eyebrow">
              {t("technicalLab.shell.eyebrow")}
            </p>
            <h1>
              {contentText(
                runtime,
                runtime.bundle.pack.title.localizationKey,
              )}
            </h1>
            <p>
              {contentText(
                runtime,
                runtime.bundle.pack.description.localizationKey,
              )}
            </p>
          </div>
          <div className="technical-lab__header-progress">
            <strong>
              {t("technicalLab.shell.currentScore", {
                score: replay.score.totalScore,
              })}
            </strong>
            <span>
              {t("technicalLab.shell.moduleProgress", {
                completed: completedCount,
                total: replay.modules.length,
              })}
            </span>
          </div>
        </header>
        <aside className="notice technical-lab__authenticity">
          <p>
            {contentText(
              runtime,
              runtime.bundle.pack.authenticityDisclosure
                .localizationKey,
            )}
          </p>
        </aside>
        {readOnly ? (
          <aside className="notice notice--standalone" role="status">
            <p>{t("technicalLab.shell.readOnly")}</p>
          </aside>
        ) : null}
        <div className="technical-lab__layout">
          <nav
            className="technical-lab__modules"
            aria-label={t("technicalLab.shell.modulesHeading")}
          >
            <h2>{t("technicalLab.shell.modulesHeading")}</h2>
            <ol>
              {replay.modules.map((candidate, index) => (
                <li key={candidate.module.moduleId}>
                  <button
                    type="button"
                    className={
                      index === viewModuleIndex
                        ? "technical-lab__module-button technical-lab__module-button--selected"
                        : "technical-lab__module-button"
                    }
                    disabled={candidate.locked}
                    aria-current={
                      index === viewModuleIndex ? "step" : undefined
                    }
                    onClick={() =>
                      setModuleView({
                        activeModuleIndex:
                          replay.snapshot.currentModuleIndex,
                        viewModuleIndex: index,
                      })
                    }
                  >
                    <span>
                      {candidate.module.moduleId} ·{" "}
                      {contentText(
                        runtime,
                        candidate.module.title.localizationKey,
                      )}
                    </span>
                    <small>
                      {t(
                        "technicalLab.shell.estimatedMinutes",
                        {
                          minutes:
                            candidate.module.estimatedMinutes,
                        },
                      )}
                    </small>
                    <ModuleStatus module={candidate} />
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <div
            className="technical-lab__workspace"
            id="technical-lab-workbench"
          >
            <section className="card card--brief">
              <p className="eyebrow">{module.module.moduleId}</p>
              <h2>
                {contentText(
                  runtime,
                  module.module.title.localizationKey,
                )}
              </h2>
              <p>
                {contentText(
                  runtime,
                  module.module.summary.localizationKey,
                )}
              </p>
              <h3>{t("technicalLab.shell.conceptHeading")}</h3>
              <p>
                {contentText(
                  runtime,
                  module.module.concept.localizationKey,
                )}
              </p>
            </section>
            <section className="technical-lab__experiment card card--work">
              <h3>{t("technicalLab.shell.experimentHeading")}</h3>
              <p>
                {t("technicalLab.shell.actionProgress", {
                  current: Math.min(
                    module.experimentActionCount + 1,
                    module.experimentActionMaximum,
                  ),
                  total: module.experimentActionMaximum,
                })}
              </p>
              {expectedAction?.actionType === "EDIT_INPUT" ? (
                <div className="field technical-lab__edit">
                  <label
                    className="field__label"
                    htmlFor="technical-lab-replacement"
                  >
                    {t(
                      "technicalLab.shell.editCharacterLabel",
                    )}
                  </label>
                  <input
                    className="field__control"
                    id="technical-lab-replacement"
                    value={replacement}
                    maxLength={2}
                    disabled={busy || readOnly}
                    onChange={(event) =>
                      setReplacement(
                        [...event.target.value][0] ?? "",
                      )
                    }
                  />
                  <span className="field__hint">
                    {t(
                      "technicalLab.shell.editCharacterHelp",
                    )}
                  </span>
                </div>
              ) : null}
              {expectedAction !== null && actionLabel !== null ? (
                <button
                  className="button button--primary"
                  type="button"
                  disabled={
                    busy ||
                    readOnly ||
                    (expectedAction.actionType === "EDIT_INPUT" &&
                      replacementCharacter.length === 0)
                  }
                  onClick={() => void runAction()}
                >
                  {busy
                    ? t("technicalLab.shell.runningAction")
                    : t("technicalLab.shell.runAction", {
                        action: actionLabel,
                      })}
                </button>
              ) : null}
              {module.experimentComplete ? (
                <div className="technical-lab__observation">
                  <h4>
                    {t("technicalLab.shell.observationHeading")}
                  </h4>
                  <p>
                    {contentText(
                      runtime,
                      module.module.observation.localizationKey,
                    )}
                  </p>
                  <h4>
                    {t(
                      "technicalLab.shell.professionalContextHeading",
                    )}
                  </h4>
                  <p>
                    {contentText(
                      runtime,
                      module.module.professionalContext
                        .localizationKey,
                    )}
                  </p>
                </div>
              ) : null}
            </section>
            <EvidenceInspector
              key={module.module.moduleId}
              module={module}
            />
            {isActiveView ? (
              <CheckpointPanel
                runtime={runtime}
                module={module}
                busy={busy}
                readOnly={readOnly}
                onResponse={onResponse}
                onHint={onHint}
              />
            ) : null}
            {isActiveView && module.complete ? (
              <section className="notice">
                <p>{t("technicalLab.shell.moduleComplete")}</p>
                {!replay.complete ? (
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={busy || readOnly}
                    onClick={() => void onAdvance()}
                  >
                    {t("technicalLab.shell.nextModule")}
                  </button>
                ) : null}
              </section>
            ) : null}
            {replay.complete ? (
              <FinalReport runtime={runtime} replay={replay} />
            ) : null}
          </div>
        </div>
      </Root>
    </>
  );
}
