import {
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import type {
  CounterfactualReflectionResponseV1,
} from "../contracts/counterfactual";
import type {
  CounterfactualComparisonViewV1,
  CounterfactualExplorerApi,
  CounterfactualPointViewV1,
  CounterfactualTimelineItemV1,
} from "./counterfactual-api";

function initialSelections(
  point: CounterfactualPointViewV1,
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    point.fields.map((field) => [
      field.fieldId,
      field.options
        .map((option) => option.optionId)
        .filter((optionId) =>
          point.originalOptionIds.includes(optionId),
        ),
    ]),
  );
}

function firstSelection(
  selections: Readonly<Record<string, readonly string[]>>,
  fieldId: string,
): string {
  return selections[fieldId]?.[0] ?? "";
}

function selectionOptionIds(
  selections: Readonly<Record<string, readonly string[]>>,
): readonly string[] {
  return Object.values(selections).flat().sort();
}

function selectionIsDifferent(
  point: CounterfactualPointViewV1,
  selections: Readonly<Record<string, readonly string[]>>,
): boolean {
  const original = [...point.originalOptionIds].sort();
  const alternative = selectionOptionIds(selections);
  return (
    original.length !== alternative.length ||
    original.some(
      (optionId, index) => optionId !== alternative[index],
    )
  );
}

function selectionIsComplete(
  point: CounterfactualPointViewV1,
  selections: Readonly<Record<string, readonly string[]>>,
): boolean {
  return point.fields.every((field) => {
    const selected = selections[field.fieldId] ?? [];
    return (
      selected.length > 0 &&
      (field.selection === "multiple" || selected.length === 1)
    );
  });
}

function commandIntent(
  point: CounterfactualPointViewV1,
  selections: Readonly<Record<string, readonly string[]>>,
  supporting: {
    readonly justification: string;
    readonly evidenceId: string;
    readonly policyId: string;
    readonly confidence: number;
    readonly adverseProbability: number;
  },
): Readonly<Record<string, unknown>> {
  if (point.decisionId === "INT_CERTIFICATE_INITIAL_SUBMITTED") {
    return {
      commandType: "SUBMIT_CERTIFICATE_DECISION",
      decision: {
        certificateAssessment: firstSelection(
          selections,
          "certificateAssessment",
        ),
        issuerAssessment: firstSelection(
          selections,
          "issuerAssessment",
        ),
        storageChoice: firstSelection(
          selections,
          "storageChoice",
        ),
        lotDisposition: firstSelection(
          selections,
          "lotDisposition",
        ),
      },
      justification: supporting.justification,
      citedEvidenceIds: [supporting.evidenceId],
      citedPolicyIds: [supporting.policyId],
      confidenceRating: supporting.confidence,
      adverseEventProbabilityPercent:
        supporting.adverseProbability,
    };
  }
  if (
    point.decisionId === "INT_DISCREPANCY_INITIAL_SUBMITTED"
  ) {
    return {
      commandType: "SUBMIT_DISCREPANCY_DECISION",
      decision: {
        action: firstSelection(selections, "action"),
        causeCode: firstSelection(selections, "causeCode"),
      },
    };
  }
  if (point.decisionId === "INT_RECALL_SCOPE") {
    return {
      commandType: "SUBMIT_RECALL_SCOPE_DECISION",
      decisionId: point.decisionId,
      selectedAssetIds:
        selections.selectedAssetIds ?? [],
    };
  }
  return {
    commandType: "SUBMIT_STRUCTURED_DECISION",
    decisionId: point.decisionId,
    responses: selections,
    justification: supporting.justification,
  };
}

function reflectionResponse(
  form: HTMLFormElement,
): CounterfactualReflectionResponseV1 {
  const data = new FormData(form);
  return {
    evidenceThatMattered: String(
      data.get("evidenceThatMattered") ?? "",
    ),
    reasonForDifference: String(
      data.get("reasonForDifference") ?? "",
    ),
    foreseeableConsequences: String(
      data.get("foreseeableConsequences") ?? "",
    ),
    laterInformation: String(
      data.get("laterInformation") ?? "",
    ),
    revisedDecisionRule: String(
      data.get("revisedDecisionRule") ?? "",
    ),
  };
}

function ContextRecords({
  heading,
  records,
  emptyText,
}: {
  readonly heading: string;
  readonly records: readonly {
    readonly recordId: string;
    readonly value: unknown;
  }[];
  readonly emptyText: string;
}): ReactNode {
  return (
    <section>
      <h4>{heading}</h4>
      {records.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        <div className="counterfactual-explorer__records">
          {records.map((record) => (
            <details key={record.recordId}>
              <summary>
                <code>{record.recordId}</code>
              </summary>
              <pre className="counterfactual-explorer__technical-value">
                <code>
                  {JSON.stringify(record.value, null, 2)}
                </code>
              </pre>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function Timeline({
  items,
}: {
  readonly items: readonly CounterfactualTimelineItemV1[];
}): ReactNode {
  return (
    <ol className="counterfactual-explorer__timeline">
      {items.map((item) => (
        <li key={`${item.sequenceNumber}-${item.eventId}`}>
          <code>{item.eventType}</code>
        </li>
      ))}
    </ol>
  );
}

export function CounterfactualExplorer({
  api,
  sourceRunId,
  renderContinuation,
}: {
  readonly api: CounterfactualExplorerApi;
  readonly sourceRunId: string;
  readonly renderContinuation?: (options: {
    readonly projection:
      CounterfactualComparisonViewV1["alternativeExploratoryResult"]["projection"];
    readonly busy: boolean;
    readonly onSubmit: (
      input: Readonly<Record<string, unknown>>,
    ) => Promise<void>;
  }) => ReactNode;
}): ReactNode {
  const t = useTranslator();
  const [points, setPoints] =
    useState<readonly CounterfactualPointViewV1[] | null>(
      null,
    );
  const [selectedPoint, setSelectedPoint] =
    useState<CounterfactualPointViewV1 | null>(null);
  const [selections, setSelections] = useState<
    Readonly<Record<string, readonly string[]>>
  >({});
  const [justification, setJustification] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [adverseProbability, setAdverseProbability] =
    useState(50);
  const [comparison, setComparison] =
    useState<CounterfactualComparisonViewV1 | null>(null);
  const [reflectionSubmitted, setReflectionSubmitted] =
    useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function loadPoints() {
    setBusy(true);
    setError(false);
    try {
      setPoints(await api.loadPoints(sourceRunId));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  function choosePoint(point: CounterfactualPointViewV1) {
    setSelectedPoint(point);
    setSelections(initialSelections(point));
    setEvidenceId(
      point.forkProjection.informationState[0]?.recordId ?? "",
    );
    setPolicyId(
      point.forkProjection.policyState[0]?.recordId ?? "",
    );
    setJustification("");
    setComparison(null);
    setReflectionSubmitted(false);
    setError(false);
  }

  function changeSelection(
    fieldId: string,
    optionId: string,
    multiple: boolean,
    checked: boolean,
  ) {
    setSelections((current) => {
      if (!multiple) {
        return { ...current, [fieldId]: [optionId] };
      }
      const selected = current[fieldId] ?? [];
      return {
        ...current,
        [fieldId]: checked
          ? [...new Set([...selected, optionId])]
          : selected.filter((value) => value !== optionId),
      };
    });
  }

  async function explore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedPoint === null) return;
    setBusy(true);
    setError(false);
    try {
      setComparison(
        await api.explore(
          sourceRunId,
          selectedPoint,
          commandIntent(selectedPoint, selections, {
            justification,
            evidenceId,
            policyId,
            confidence,
            adverseProbability,
          }),
        ),
      );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function submitReflection(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (comparison === null) return;
    setBusy(true);
    setError(false);
    try {
      await api.submitReflection(
        comparison.counterfactualId,
        reflectionResponse(event.currentTarget),
      );
      setReflectionSubmitted(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function continueBranch(
    input: Readonly<Record<string, unknown>>,
  ) {
    if (comparison === null) return;
    setBusy(true);
    setError(false);
    try {
      setComparison(
        await api.continueBranch(
          comparison.counterfactualId,
          comparison.alternativeExploratoryResult.projection,
          input,
        ),
      );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const needsCertificateSupport =
    selectedPoint?.decisionId ===
    "INT_CERTIFICATE_INITIAL_SUBMITTED";
  const needsJustification =
    needsCertificateSupport ||
    (selectedPoint !== null &&
      !selectedPoint.decisionId.startsWith("INT_"));
  const alternativeCompleted =
    comparison?.alternativeExploratoryResult.projection
      .workflowState.permittedActionIds.length === 0;
  const alternativeChanged =
    selectedPoint !== null &&
    selectionIsDifferent(selectedPoint, selections);
  const alternativeValid =
    selectedPoint !== null &&
    selectionIsComplete(selectedPoint, selections) &&
    alternativeChanged &&
    (!needsJustification || justification.trim().length > 0) &&
    (!needsCertificateSupport ||
      (evidenceId.length > 0 && policyId.length > 0));

  return (
    <section className="card card--work counterfactual-explorer">
      <h2>{t("counterfactual.title")}</h2>
      <p>{t("counterfactual.introduction")}</p>
      <p className="notice notice--standalone">
        {t("counterfactual.hindsight")}
      </p>
      {points === null ? (
        <button
          className="button button--secondary"
          type="button"
          disabled={busy}
          onClick={() => void loadPoints()}
        >
          {busy
            ? t("counterfactual.loading")
            : t("counterfactual.loadPoints")}
        </button>
      ) : points.length === 0 ? (
        <p>{t("counterfactual.noPoints")}</p>
      ) : (
        <>
          <h3>{t("counterfactual.selectPoint")}</h3>
          <ol className="counterfactual-explorer__points">
            {points.map((point) => (
              <li key={point.forkNodeId}>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => choosePoint(point)}
                >
                  {t(point.title.localizationKey)}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      {selectedPoint === null ? null : (
        <form onSubmit={(event) => void explore(event)}>
          <h3>{t("counterfactual.contextHeading")}</h3>
          <p>{t("counterfactual.contextHelp")}</p>
          <div className="counterfactual-explorer__context">
            <ContextRecords
              heading={t("counterfactual.availableEvidence")}
              records={
                selectedPoint.forkProjection.informationState
              }
              emptyText={t("counterfactual.noAvailableEvidence")}
            />
            <ContextRecords
              heading={t("counterfactual.availablePolicies")}
              records={selectedPoint.forkProjection.policyState}
              emptyText={t("counterfactual.noAvailablePolicies")}
            />
          </div>
          <h3>{t("counterfactual.alternativeHeading")}</h3>
          {selectedPoint.fields.map((field) => (
            <fieldset className="fieldset" key={field.fieldId}>
              <legend>{t(field.prompt.localizationKey)}</legend>
              {field.options.map((option) => {
                const selected =
                  selections[field.fieldId]?.includes(
                    option.optionId,
                  ) ?? false;
                const id = `counterfactual-${field.fieldId}-${option.optionId}`;
                return (
                  <label className="choice" htmlFor={id} key={id}>
                    <input
                      id={id}
                      name={field.fieldId}
                      type={
                        field.selection === "multiple"
                          ? "checkbox"
                          : "radio"
                      }
                      checked={selected}
                      onChange={(event) =>
                        changeSelection(
                          field.fieldId,
                          option.optionId,
                          field.selection === "multiple",
                          event.currentTarget.checked,
                        )
                      }
                    />
                    <span>{t(option.label.localizationKey)}</span>
                    {selectedPoint.originalOptionIds.includes(
                      option.optionId,
                    ) ? (
                      <small className="counterfactual-explorer__original-choice">
                        {t("counterfactual.originalChoice")}
                      </small>
                    ) : null}
                  </label>
                );
              })}
            </fieldset>
          ))}
          {needsJustification ? (
            <div className="field">
              <label
                className="field__label"
                htmlFor="counterfactual-justification"
              >
                {t("counterfactual.justification")}
              </label>
              <textarea
                className="field__control"
                id="counterfactual-justification"
                value={justification}
                maxLength={1_000}
                required
                onChange={(event) =>
                  setJustification(event.currentTarget.value)
                }
              />
            </div>
          ) : null}
          {needsCertificateSupport ? (
            <div className="instructor-review__form-grid">
              <label className="field">
                <span className="field__label">
                  {t("counterfactual.evidenceCitation")}
                </span>
                <select
                  className="field__control"
                  value={evidenceId}
                  required
                  onChange={(event) =>
                    setEvidenceId(event.currentTarget.value)
                  }
                >
                  {selectedPoint.forkProjection.informationState.map(
                    (record) => (
                      <option
                        key={record.recordId}
                        value={record.recordId}
                      >
                        {record.recordId}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                <span className="field__label">
                  {t("counterfactual.policyCitation")}
                </span>
                <select
                  className="field__control"
                  value={policyId}
                  required
                  onChange={(event) =>
                    setPolicyId(event.currentTarget.value)
                  }
                >
                  {selectedPoint.forkProjection.policyState.map(
                    (record) => (
                      <option
                        key={record.recordId}
                        value={record.recordId}
                      >
                        {record.recordId}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                <span className="field__label">
                  {t("counterfactual.confidence")}
                </span>
                <input
                  className="field__control"
                  type="number"
                  min={1}
                  max={5}
                  value={confidence}
                  required
                  onChange={(event) =>
                    setConfidence(
                      Number(event.currentTarget.value),
                    )
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">
                  {t("counterfactual.risk")}
                </span>
                <input
                  className="field__control"
                  type="number"
                  min={0}
                  max={100}
                  value={adverseProbability}
                  required
                  onChange={(event) =>
                    setAdverseProbability(
                      Number(event.currentTarget.value),
                    )
                  }
                />
              </label>
            </div>
          ) : null}
          {alternativeChanged ? null : (
            <p className="field__hint">
              {t("counterfactual.chooseDifferent")}
            </p>
          )}
          <button
            className="button button--primary"
            type="submit"
            disabled={busy || !alternativeValid}
          >
            {busy
              ? t("counterfactual.running")
              : t("counterfactual.runAlternative")}
          </button>
        </form>
      )}

      {comparison === null ? null : (
        <div>
          <h3>{t("counterfactual.comparisonHeading")}</h3>
          <p role="status">
            {t("counterfactual.comparisonReady")}
          </p>
          <p>
            {t(
              comparison.classification ===
                "SINGLE_INTERVENTION"
                ? "counterfactual.isolated"
                : "counterfactual.compound",
            )}
          </p>
          <div className="counterfactual-explorer__comparison">
            <section>
              <h4>{t("counterfactual.original")}</h4>
              <p>{t("counterfactual.assessed")}</p>
              <pre className="counterfactual-explorer__technical-value">
                <code>
                {JSON.stringify(
                  comparison.originalAssessedResult.decision,
                  null,
                  2,
                )}
                </code>
              </pre>
            </section>
            <section>
              <h4>{t("counterfactual.alternative")}</h4>
              <p>{t("counterfactual.exploratory")}</p>
              <pre className="counterfactual-explorer__technical-value">
                <code>
                {JSON.stringify(
                  comparison.alternativeExploratoryResult
                    .decision,
                  null,
                  2,
                )}
                </code>
              </pre>
            </section>
          </div>
          <h4>{t("counterfactual.differences")}</h4>
          {comparison.differences.changedBusinessRecordIds
            .length === 0 &&
          !comparison.differences.ledgerChanged ? (
            <p>{t("counterfactual.noStateDifference")}</p>
          ) : (
            <ul>
              {comparison.differences.changedBusinessRecordIds.map(
                (recordId) => (
                  <li key={recordId}>
                    <code>{recordId}</code>
                  </li>
                ),
              )}
              {comparison.differences.ledgerChanged ? (
                <li>{t("counterfactual.ledgerChanged")}</li>
              ) : null}
              {comparison.differences.workflowNodeChanged ? (
                <li>{t("counterfactual.workflowChanged")}</li>
              ) : null}
            </ul>
          )}
          <h4>{t("counterfactual.dimensionsHeading")}</h4>
          <dl className="counterfactual-explorer__dimensions">
            {comparison.dimensions.map((dimension) => (
              <div key={dimension.dimensionId}>
                <dt>
                  {t(dimension.title.localizationKey)}
                </dt>
                <dd>
                  <p>
                    {t(dimension.description.localizationKey)}
                  </p>
                  <p className="field__hint">
                    {t("counterfactual.dimensionPending")}
                  </p>
                </dd>
              </div>
            ))}
          </dl>
          <details>
            <summary>{t("counterfactual.timelinesHeading")}</summary>
            <div className="counterfactual-explorer__comparison">
              <section>
                <h4>{t("counterfactual.originalTimeline")}</h4>
                <Timeline
                  items={comparison.timelines.original}
                />
              </section>
              <section>
                <h4>
                  {t("counterfactual.alternativeTimeline")}
                </h4>
                <Timeline
                  items={comparison.timelines.alternative}
                />
              </section>
            </div>
          </details>
          <h4>{t("counterfactual.revealedLater")}</h4>
          {comparison.informationRevealedLaterRecordIds.length ===
          0 ? (
            <p>{t("counterfactual.noneRevealedLater")}</p>
          ) : (
            <ul>
              {comparison.informationRevealedLaterRecordIds.map(
                (recordId) => (
                  <li key={recordId}>
                    <code>{recordId}</code>
                  </li>
                ),
              )}
            </ul>
          )}
          <div className="instructor-review__export-actions">
            <a
              className="button button--secondary"
              href={`/api/v1/counterfactuals/${encodeURIComponent(comparison.counterfactualId)}/export.json`}
              download
            >
              {t("counterfactual.exportJson")}
            </a>
            <a
              className="button button--secondary"
              href={`/api/v1/counterfactuals/${encodeURIComponent(comparison.counterfactualId)}/export.csv`}
              download
            >
              {t("counterfactual.exportCsv")}
            </a>
          </div>
          <p className="notice notice--standalone">
            {t("counterfactual.gradePreserved")}
          </p>
          {!alternativeCompleted ? (
            <>
              <p className="notice notice--standalone" role="status">
                {t("counterfactual.continuationRequired")}
              </p>
              {renderContinuation === undefined ? null : (
                <section>
                  <h4>
                    {t("counterfactual.continuationHeading")}
                  </h4>
                  {renderContinuation({
                    projection:
                      comparison.alternativeExploratoryResult
                        .projection,
                    busy,
                    onSubmit: continueBranch,
                  })}
                </section>
              )}
            </>
          ) : reflectionSubmitted ? (
            <p role="status">
              {t("counterfactual.reflectionSaved")}
            </p>
          ) : (
            <form
              onSubmit={(event) =>
                void submitReflection(event)
              }
            >
              <h4>{t("counterfactual.reflectHeading")}</h4>
              {[
                "evidenceThatMattered",
                "reasonForDifference",
                "foreseeableConsequences",
                "laterInformation",
                "revisedDecisionRule",
              ].map((fieldName) => (
                <label className="field" key={fieldName}>
                  <span className="field__label">
                    {t(
                      `counterfactual.reflection.${fieldName}`,
                    )}
                  </span>
                  <textarea
                    className="field__control"
                    name={fieldName}
                    maxLength={1_000}
                    required
                  />
                </label>
              ))}
              <button
                className="button button--primary"
                type="submit"
                disabled={busy}
              >
                {t("counterfactual.submitReflection")}
              </button>
            </form>
          )}
        </div>
      )}

      {error ? (
        <p className="notice notice--standalone" role="alert">
          {t("counterfactual.error")}
        </p>
      ) : null}
    </section>
  );
}
