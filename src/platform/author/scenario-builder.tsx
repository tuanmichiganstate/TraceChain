import {
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import type { JsonObject, JsonValue } from "../contracts/json";
import type {
  CompetencyDefinitionV1,
  CompetencyFrameworkV1,
  CompetencyTargetV1,
  PerformanceIndicatorV1,
} from "../contracts/competency";
import type {
  AutomatedEvidenceRuleV1,
  EvidenceRuleOperator,
  RubricCriterionV1,
  RubricDefinitionV1,
} from "../contracts/rubric";
import type {
  DecisionNodeV1,
  HostedRunMode,
  ScenarioDefinitionV1,
  ScenarioEvidenceItemV1,
  ScenarioNodeV1,
  ScenarioPackV1,
  ScenarioPolicyV1,
} from "../contracts/scenario-pack";
import {
  appendIndependentScenarioCopy,
  changeScenarioPack,
  countExactIdentifierOccurrences,
  defaultModeConfiguration,
  defaultScenarioNode,
  reconcileScenarioPackReferences,
  type DeepMutable,
  uniqueIdentifier,
  uniqueLocalizationPrefix,
  updateLocalizedValue,
} from "./scenario-builder-model";
import { validateScenarioPack } from "../scenario-packs/validation";
import { createScenarioRolePreview } from "../scenario-packs/authoring";

const BUILDER_STEPS = [
  "identity",
  "delivery",
  "participants",
  "evidence",
  "workflow",
  "assessment",
  "review",
] as const;

export type ScenarioBuilderStep = (typeof BUILDER_STEPS)[number];

const NODE_TYPES: readonly ScenarioNodeV1["nodeType"][] = [
  "BRIEFING",
  "EVIDENCE_RELEASE",
  "DECISION",
  "TRANSACTION_PROPOSAL",
  "ENDORSEMENT",
  "POLICY_CHECK",
  "COMMUNICATION",
  "STOCHASTIC_EVENT",
  "CONSEQUENCE",
  "FEEDBACK",
  "REFLECTION",
  "COMPLETION",
];

const HOSTED_MODES: readonly HostedRunMode[] = [
  "tutorial",
  "standard",
  "sandbox",
  "configured",
];

export function ScenarioBuilder({
  pack,
  onChange,
  initialStep,
  focusRequestId,
}: {
  readonly pack: ScenarioPackV1;
  readonly onChange: (pack: ScenarioPackV1) => void;
  readonly initialStep?: ScenarioBuilderStep | undefined;
  readonly focusRequestId?: number | undefined;
}): ReactNode {
  const t = useTranslator();
  const [navigation, setNavigation] = useState<{
    readonly step: ScenarioBuilderStep;
    readonly focusRequestId: number | undefined;
  }>({
    step: initialStep ?? "identity",
    focusRequestId,
  });
  if (navigation.focusRequestId !== focusRequestId) {
    setNavigation({
      step: initialStep ?? navigation.step,
      focusRequestId,
    });
  }
  const step = navigation.step;
  function setStep(nextStep: ScenarioBuilderStep): void {
    setNavigation((current) => ({
      ...current,
      step: nextStep,
    }));
  }
  const [selectedScenarioIndex, setScenarioIndex] = useState(0);
  const undoHistory = useRef<ScenarioPackV1[]>([]);
  const redoHistory = useRef<ScenarioPackV1[]>([]);
  const [historyCounts, setHistoryCounts] = useState({
    undo: 0,
    redo: 0,
  });
  const scenarioIndex =
    pack.scenarios[selectedScenarioIndex] === undefined
      ? 0
      : selectedScenarioIndex;
  const scenario = pack.scenarios[scenarioIndex] ?? pack.scenarios[0];

  if (scenario === undefined) {
    return (
      <p className="notice notice--standalone" role="alert">
        {t("scenarioAuthor.builder.noScenario")}
      </p>
    );
  }
  const scenarioIsReferenced =
    countExactIdentifierOccurrences(
      {
        ...pack,
        scenarios: pack.scenarios.filter(
          (_candidate, index) => index !== scenarioIndex,
        ),
      },
      scenario.scenarioId,
    ) > 0;

  function commitChange(updated: ScenarioPackV1): void {
    const reconciled = reconcileScenarioPackReferences(pack, updated);
    if (JSON.stringify(reconciled) === JSON.stringify(pack)) return;
    undoHistory.current = [
      ...undoHistory.current.slice(-99),
      structuredClone(pack),
    ];
    redoHistory.current = [];
    setHistoryCounts({
      undo: undoHistory.current.length,
      redo: 0,
    });
    onChange(reconciled);
  }

  function undo(): void {
    const previous = undoHistory.current.pop();
    if (previous === undefined) return;
    redoHistory.current.push(structuredClone(pack));
    setHistoryCounts({
      undo: undoHistory.current.length,
      redo: redoHistory.current.length,
    });
    onChange(previous);
  }

  function redo(): void {
    const next = redoHistory.current.pop();
    if (next === undefined) return;
    undoHistory.current.push(structuredClone(pack));
    setHistoryCounts({
      undo: undoHistory.current.length,
      redo: redoHistory.current.length,
    });
    onChange(next);
  }

  function addScenario(): void {
    const nextIndex = pack.scenarios.length;
    const next = appendIndependentScenarioCopy(pack, scenarioIndex);
    commitChange(next);
    setScenarioIndex(nextIndex);
  }

  function removeScenario(): void {
    if (
      pack.scenarios.length <= 1 ||
      scenarioIsReferenced
    ) {
      return;
    }
    commitChange(
      changeScenarioPack(pack, (draft) => {
        draft.scenarios.splice(scenarioIndex, 1);
      }),
    );
    setScenarioIndex(Math.max(0, scenarioIndex - 1));
  }

  const activeStepIndex = BUILDER_STEPS.indexOf(step);

  return (
    <section
      id="scenario-builder"
      className="scenario-builder"
      aria-labelledby="scenario-builder-heading"
      tabIndex={-1}
    >
      <header className="scenario-builder__header">
        <div>
          <p className="eyebrow">
            {t("scenarioAuthor.builder.eyebrow")}
          </p>
          <h3 id="scenario-builder-heading">
            {t("scenarioAuthor.builder.heading")}
          </h3>
          <p>{t("scenarioAuthor.builder.help")}</p>
        </div>
        <div className="field scenario-builder__scenario-selector">
          <label
            className="field__label"
            htmlFor="scenario-builder-scenario"
          >
            {t("scenarioAuthor.builder.activeScenario")}
          </label>
          <select
            className="field__control"
            id="scenario-builder-scenario"
            value={scenarioIndex}
            onChange={(event) =>
              setScenarioIndex(Number(event.target.value))
            }
          >
            {pack.scenarios.map((candidate, index) => (
              <option
                key={`${candidate.scenarioId}:${String(index)}`}
                value={index}
              >
                {candidate.scenarioId}
              </option>
            ))}
          </select>
          <div className="scenario-builder__compact-actions">
            <button
              className="button button--quiet"
              type="button"
              disabled={historyCounts.undo === 0}
              onClick={undo}
            >
              {t("scenarioAuthor.builder.undo")}
            </button>
            <button
              className="button button--quiet"
              type="button"
              disabled={historyCounts.redo === 0}
              onClick={redo}
            >
              {t("scenarioAuthor.builder.redo")}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={addScenario}
            >
              {t("scenarioAuthor.builder.addScenario")}
            </button>
            <button
              className="button button--quiet"
              type="button"
              disabled={
                pack.scenarios.length <= 1 ||
                scenarioIsReferenced
              }
              title={
                scenarioIsReferenced
                  ? t(
                      "scenarioAuthor.builder.removeReferenced",
                    )
                  : undefined
              }
              onClick={removeScenario}
            >
              {t("scenarioAuthor.builder.removeScenario")}
            </button>
          </div>
        </div>
      </header>

      <nav
        className="scenario-builder__steps"
        aria-label={t("scenarioAuthor.builder.steps")}
      >
        {BUILDER_STEPS.map((candidate, index) => (
          <button
            className={
              candidate === step
                ? "scenario-builder__step scenario-builder__step--active"
                : "scenario-builder__step"
            }
            type="button"
            key={candidate}
            aria-current={candidate === step ? "step" : undefined}
            onClick={() => setStep(candidate)}
          >
            <span aria-hidden="true">{index + 1}</span>
            {t(`scenarioAuthor.builder.step.${candidate}`)}
          </button>
        ))}
      </nav>

      <div className="scenario-builder__workspace">
        {step === "identity" ? (
          <IdentityStep
            pack={pack}
            scenario={scenario}
            scenarioIndex={scenarioIndex}
            onChange={commitChange}
          />
        ) : null}
        {step === "delivery" ? (
          <DeliveryStep
            pack={pack}
            scenario={scenario}
            scenarioIndex={scenarioIndex}
            onChange={commitChange}
          />
        ) : null}
        {step === "participants" ? (
          <ParticipantsStep
            pack={pack}
            scenario={scenario}
            scenarioIndex={scenarioIndex}
            onChange={commitChange}
          />
        ) : null}
        {step === "evidence" ? (
          <EvidenceStep
            pack={pack}
            scenario={scenario}
            scenarioIndex={scenarioIndex}
            onChange={commitChange}
          />
        ) : null}
        {step === "workflow" ? (
          <WorkflowStep
            pack={pack}
            scenario={scenario}
            scenarioIndex={scenarioIndex}
            onChange={commitChange}
          />
        ) : null}
        {step === "assessment" ? (
          <AssessmentStep
            pack={pack}
            scenario={scenario}
            scenarioIndex={scenarioIndex}
            onChange={commitChange}
          />
        ) : null}
        {step === "review" ? (
          <ReviewStep
            pack={pack}
            scenario={scenario}
            scenarioIndex={scenarioIndex}
            onChange={commitChange}
          />
        ) : null}
      </div>

      <div className="scenario-builder__navigation">
        <button
          className="button button--secondary"
          type="button"
          disabled={activeStepIndex === 0}
          onClick={() =>
            setStep(BUILDER_STEPS[activeStepIndex - 1] ?? "identity")
          }
        >
          {t("scenarioAuthor.builder.previous")}
        </button>
        <span>
          {t("scenarioAuthor.builder.progress", {
            current: activeStepIndex + 1,
            total: BUILDER_STEPS.length,
          })}
        </span>
        <button
          className="button button--primary"
          type="button"
          disabled={activeStepIndex === BUILDER_STEPS.length - 1}
          onClick={() =>
            setStep(BUILDER_STEPS[activeStepIndex + 1] ?? "review")
          }
        >
          {t("scenarioAuthor.builder.next")}
        </button>
      </div>
    </section>
  );
}

function IdentityStep({
  pack,
  scenario,
  scenarioIndex,
  onChange,
}: BuilderStepProps): ReactNode {
  const t = useTranslator();
  return (
    <section aria-labelledby="builder-identity-heading">
      <h4 id="builder-identity-heading">
        {t("scenarioAuthor.builder.identity.heading")}
      </h4>
      <p>{t("scenarioAuthor.builder.identity.help")}</p>
      <div className="instructor-review__form-grid">
        <TextControl
          id="draft-pack-id"
          label={t("scenarioAuthor.editor.packId")}
          value={pack.packId}
          onChange={(value) =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                draft.packId = value;
              }),
            )
          }
        />
        <TextControl
          id="draft-pack-version"
          label={t("scenarioAuthor.editor.packVersion")}
          value={pack.version}
          onChange={(value) =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                draft.version = value;
              }),
            )
          }
        />
        <TextControl
          id="draft-domain"
          label={t("scenarioAuthor.editor.domain")}
          value={pack.manifest.domain}
          onChange={(value) =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                draft.manifest.domain = value;
              }),
            )
          }
        />
        <TextControl
          id="draft-scenario-id"
          label={t("scenarioAuthor.editor.scenarioId")}
          value={scenario.scenarioId}
          onChange={(value) =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                const target = draft.scenarios[scenarioIndex];
                if (target !== undefined) target.scenarioId = value;
              }),
            )
          }
        />
        <TextControl
          id="draft-scenario-version"
          label={t("scenarioAuthor.editor.scenarioVersion")}
          value={scenario.version}
          onChange={(value) =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                const target = draft.scenarios[scenarioIndex];
                if (target !== undefined) target.version = value;
              }),
            )
          }
        />
        <SelectControl
          id="builder-entry-node"
          label={t("scenarioAuthor.builder.entryNode")}
          value={scenario.entryNodeId}
          options={scenario.nodes.map((node) => ({
            value: node.nodeId,
            label: node.nodeId,
          }))}
          onChange={(value) =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                const target = draft.scenarios[scenarioIndex];
                if (target !== undefined) target.entryNodeId = value;
              }),
            )
          }
        />
      </div>
      <LocalizedTextControl
        heading={t("scenarioAuthor.builder.packTitle")}
        pack={pack}
        localizationKey={pack.manifest.title.localizationKey}
        onChange={onChange}
      />
      <LocalizedTextControl
        heading={t("scenarioAuthor.builder.packDescription")}
        pack={pack}
        localizationKey={pack.manifest.description.localizationKey}
        multiline
        onChange={onChange}
      />
      <LocalizedTextControl
        heading={t("scenarioAuthor.builder.educationalPurpose")}
        pack={pack}
        localizationKey={pack.manifest.educationalPurpose.localizationKey}
        multiline
        onChange={onChange}
      />
      <LocalizedTextControl
        heading={t("scenarioAuthor.builder.scenarioTitle")}
        pack={pack}
        localizationKey={scenario.title.localizationKey}
        onChange={onChange}
      />
    </section>
  );
}

interface BuilderStepProps {
  readonly pack: ScenarioPackV1;
  readonly scenario: ScenarioDefinitionV1;
  readonly scenarioIndex: number;
  readonly onChange: (pack: ScenarioPackV1) => void;
}

interface Option {
  readonly value: string;
  readonly label: string;
}

function TextControl({
  id,
  label,
  value,
  multiline = false,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly multiline?: boolean;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea
          className="field__control scenario-builder__textarea"
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className="field__control"
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

function NumberControl({
  id,
  label,
  value,
  minimum,
  maximum,
  disabled = false,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
}): ReactNode {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        className="field__control"
        id={id}
        type="number"
        value={value}
        min={minimum}
        max={maximum}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function SelectControl({
  id,
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly Option[];
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select
        className="field__control"
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleControl({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}): ReactNode {
  return (
    <label className="scenario-builder__toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function LocalizedTextControl({
  heading,
  pack,
  localizationKey,
  multiline = false,
  onChange,
}: {
  readonly heading: string;
  readonly pack: ScenarioPackV1;
  readonly localizationKey: string;
  readonly multiline?: boolean;
  readonly onChange: (pack: ScenarioPackV1) => void;
}): ReactNode {
  const idPrefix = useId();
  return (
    <fieldset className="scenario-builder__localized">
      <legend>{heading}</legend>
      <div className="instructor-review__form-grid">
        {pack.supportedLocales.map((locale) => (
          <TextControl
            key={locale}
            id={`${idPrefix}-${locale}`}
            label={locale}
            value={
              pack.localizationCatalogs?.[locale]?.[
                localizationKey
              ] ?? ""
            }
            multiline={multiline}
            onChange={(value) =>
              onChange(
                updateLocalizedValue(
                  pack,
                  localizationKey,
                  locale,
                  value,
                ),
              )
            }
          />
        ))}
      </div>
    </fieldset>
  );
}

function outcomeCodes(
  model: ScenarioDefinitionV1["outcomeModels"][number],
): readonly string[] {
  return model.distribution === "bernoulli"
    ? [model.onTrue, model.onFalse]
    : model.outcomes.map((outcome) => outcome.outcomeCode);
}

function DeliveryStep({
  pack,
  scenario,
  scenarioIndex,
  onChange,
}: BuilderStepProps): ReactNode {
  const t = useTranslator();
  const [selectedMode, setActiveMode] = useState<HostedRunMode>(
    scenario.supportedModes[0] ?? "tutorial",
  );
  const activeMode = scenario.supportedModes.includes(selectedMode)
    ? selectedMode
    : scenario.supportedModes[0] ?? "tutorial";
  const configuration =
    scenario.modeConfigurations.find(
      (candidate) => candidate.mode === activeMode,
    ) ?? scenario.modeConfigurations[0];
  const selectedOutcomeModel = scenario.outcomeModels.find(
    (model) =>
      model.outcomeModelId === configuration?.outcomeModelId,
  );
  const selectedOutcomeCodes =
    selectedOutcomeModel === undefined
      ? []
      : outcomeCodes(selectedOutcomeModel);

  function setModeEnabled(mode: HostedRunMode, enabled: boolean): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target = draft.scenarios[scenarioIndex];
        if (target === undefined) return;
        if (enabled) {
          if (!target.supportedModes.includes(mode)) {
            target.supportedModes.push(mode);
            const modeConfiguration = defaultModeConfiguration(mode);
            const outcomeModel = target.outcomeModels[0];
            modeConfiguration.outcomeModelId =
              outcomeModel?.outcomeModelId ?? "";
            if (modeConfiguration.outcomeStrategy === "forced") {
              modeConfiguration.forcedOutcomeCode =
                outcomeModel === undefined
                  ? ""
                  : outcomeCodes(outcomeModel)[0] ?? "";
            }
            target.modeConfigurations.push(modeConfiguration);
          }
        } else if (target.supportedModes.length > 1) {
          target.supportedModes =
            target.supportedModes.filter(
              (candidate) => candidate !== mode,
            );
          target.modeConfigurations =
            target.modeConfigurations.filter(
              (candidate) => candidate.mode !== mode,
            );
        }
      }),
    );
  }

  function updateConfiguration(
    mutation: (
      target: ScenarioDefinitionV1["modeConfigurations"][number],
    ) => void,
  ): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target = draft.scenarios[scenarioIndex];
        const modeConfiguration =
          target?.modeConfigurations.find(
            (candidate) => candidate.mode === activeMode,
          );
        if (modeConfiguration !== undefined) {
          mutation(
            modeConfiguration as unknown as ScenarioDefinitionV1["modeConfigurations"][number],
          );
        }
      }),
    );
  }

  return (
    <section aria-labelledby="builder-delivery-heading">
      <h4 id="builder-delivery-heading">
        {t("scenarioAuthor.builder.delivery.heading")}
      </h4>
      <p>{t("scenarioAuthor.builder.delivery.help")}</p>
      <fieldset className="scenario-builder__choice-group">
        <legend>{t("scenarioAuthor.builder.supportedModes")}</legend>
        {HOSTED_MODES.map((mode) => (
          <ToggleControl
            key={mode}
            label={t(`scenarioAuthor.mode.${mode}`)}
            checked={scenario.supportedModes.includes(mode)}
            onChange={(enabled) => setModeEnabled(mode, enabled)}
          />
        ))}
      </fieldset>
      <SelectControl
        id="builder-active-mode"
        label={t("scenarioAuthor.builder.editMode")}
        value={activeMode}
        options={scenario.supportedModes.map((mode) => ({
          value: mode,
          label: t(`scenarioAuthor.mode.${mode}`),
        }))}
        onChange={(value) => setActiveMode(value as HostedRunMode)}
      />
      {configuration === undefined ? null : (
        <section className="scenario-builder__collection-card">
          <h5>
            {t("scenarioAuthor.builder.modeConfiguration", {
              mode: t(`scenarioAuthor.mode.${activeMode}`),
            })}
          </h5>
          <div className="scenario-builder__toggle-grid">
            <ToggleControl
              label={t("scenarioAuthor.builder.allowHints")}
              checked={configuration.allowHints}
              onChange={(value) =>
                updateConfiguration((target) => {
                  (
                    target as unknown as {
                      allowHints: boolean;
                    }
                  ).allowHints = value;
                })
              }
            />
            <ToggleControl
              label={t("scenarioAuthor.builder.allowRetry")}
              checked={configuration.allowRetry}
              onChange={(value) =>
                updateConfiguration((target) => {
                  (
                    target as unknown as {
                      allowRetry: boolean;
                    }
                  ).allowRetry = value;
                })
              }
            />
            <ToggleControl
              label={t("scenarioAuthor.builder.allowBacktracking")}
              checked={configuration.allowBacktracking}
              onChange={(value) =>
                updateConfiguration((target) => {
                  (
                    target as unknown as {
                      allowBacktracking: boolean;
                    }
                  ).allowBacktracking = value;
                })
              }
            />
            <ToggleControl
              label={t("scenarioAuthor.builder.showScores")}
              checked={configuration.showScores}
              onChange={(value) =>
                updateConfiguration((target) => {
                  (
                    target as unknown as {
                      showScores: boolean;
                    }
                  ).showScores = value;
                })
              }
            />
            <ToggleControl
              label={t("scenarioAuthor.builder.allowCommunication")}
              checked={configuration.allowCommunication}
              onChange={(value) =>
                updateConfiguration((target) => {
                  (
                    target as unknown as {
                      allowCommunication: boolean;
                    }
                  ).allowCommunication = value;
                })
              }
            />
            <ToggleControl
              label={t("scenarioAuthor.builder.allowEvidenceRequests")}
              checked={configuration.allowEvidenceRequests}
              onChange={(value) =>
                updateConfiguration((target) => {
                  (
                    target as unknown as {
                      allowEvidenceRequests: boolean;
                    }
                  ).allowEvidenceRequests = value;
                })
              }
            />
          </div>
          <div className="instructor-review__form-grid">
            <SelectControl
              id="builder-feedback-timing"
              label={t("scenarioAuthor.builder.feedbackTiming")}
              value={configuration.feedbackTiming}
              options={["immediate", "stage-end", "final"].map(
                (value) => ({
                  value,
                  label: t(
                    `instructorReview.feedbackTiming.${value}`,
                  ),
                }),
              )}
              onChange={(value) =>
                updateConfiguration((target) => {
                  (
                    target as unknown as {
                      feedbackTiming:
                        | "immediate"
                        | "stage-end"
                        | "final";
                    }
                  ).feedbackTiming = value as
                    | "immediate"
                    | "stage-end"
                    | "final";
                })
              }
            />
            <SelectControl
              id="builder-outcome-strategy"
              label={t("scenarioAuthor.builder.outcomeStrategy")}
              value={configuration.outcomeStrategy}
              options={["forced", "probabilistic"].map((value) => ({
                value,
                label: t(
                  `instructorReview.outcomeStrategy.${value}`,
                ),
              }))}
              onChange={(value) =>
                onChange(
                  changeScenarioPack(pack, (draft) => {
                    const target = draft.scenarios[scenarioIndex];
                    const modeConfiguration =
                      target?.modeConfigurations.find(
                        (candidate) => candidate.mode === activeMode,
                      );
                    if (
                      target === undefined ||
                      modeConfiguration === undefined
                    ) {
                      return;
                    }
                    modeConfiguration.outcomeStrategy = value as
                      | "forced"
                      | "probabilistic";
                    const outcomeModel =
                      target.outcomeModels.find(
                        (model) =>
                          model.outcomeModelId ===
                          modeConfiguration.outcomeModelId,
                      ) ?? target.outcomeModels[0];
                    modeConfiguration.outcomeModelId =
                      outcomeModel?.outcomeModelId ?? "";
                    if (value === "forced") {
                      const codes =
                        outcomeModel === undefined
                          ? []
                          : outcomeCodes(outcomeModel);
                      if (
                        !codes.includes(
                          modeConfiguration.forcedOutcomeCode ?? "",
                        )
                      ) {
                        modeConfiguration.forcedOutcomeCode =
                          codes[0] ?? "";
                      }
                    } else {
                      delete modeConfiguration.forcedOutcomeCode;
                    }
                  }),
                )
              }
            />
            <SelectControl
              id="builder-seed-policy"
              label={t("scenarioAuthor.builder.seedPolicy")}
              value={configuration.seedPolicy}
              options={["generated", "supplied"].map((value) => ({
                value,
                label: t(`instructorReview.seedPolicy.${value}`),
              }))}
              onChange={(value) =>
                updateConfiguration((target) => {
                  (
                    target as unknown as {
                      seedPolicy: "generated" | "supplied";
                    }
                  ).seedPolicy = value as "generated" | "supplied";
                })
              }
            />
            <NumberControl
              id="builder-time-limit"
              label={t("scenarioAuthor.builder.timeLimit")}
              value={configuration.timeLimitMinutes ?? 0}
              minimum={0}
              maximum={1_440}
              onChange={(value) =>
                updateConfiguration((target) => {
                  const mutable = target as unknown as {
                    timeLimitMinutes?: number;
                  };
                  if (value <= 0) {
                    delete mutable.timeLimitMinutes;
                  } else {
                    mutable.timeLimitMinutes = value;
                  }
                })
              }
            />
            <SelectControl
              id="builder-outcome-model"
              label={t("scenarioAuthor.builder.outcomeModel")}
              value={configuration.outcomeModelId ?? ""}
              options={[
                {
                  value: "",
                  label: t("scenarioAuthor.builder.selectOne"),
                },
                ...scenario.outcomeModels.map((model) => ({
                  value: model.outcomeModelId,
                  label: model.outcomeModelId,
                })),
              ]}
              onChange={(value) =>
                updateConfiguration((target) => {
                  const mutable = target as unknown as {
                    outcomeModelId?: string;
                    forcedOutcomeCode?: string;
                    outcomeStrategy: "forced" | "probabilistic";
                  };
                  mutable.outcomeModelId = value;
                  if (mutable.outcomeStrategy === "forced") {
                    const model = scenario.outcomeModels.find(
                      (candidate) =>
                        candidate.outcomeModelId === value,
                    );
                    const codes =
                      model === undefined ? [] : outcomeCodes(model);
                    if (
                      !codes.includes(
                        mutable.forcedOutcomeCode ?? "",
                      )
                    ) {
                      mutable.forcedOutcomeCode = codes[0] ?? "";
                    }
                  }
                })
              }
            />
            {configuration.outcomeStrategy === "forced" ? (
              <SelectControl
                id="builder-forced-outcome"
                label={t("scenarioAuthor.builder.forcedOutcome")}
                value={configuration.forcedOutcomeCode ?? ""}
                options={[
                  {
                    value: "",
                    label: t("scenarioAuthor.builder.selectOne"),
                  },
                  ...selectedOutcomeCodes.map((outcomeCode) => ({
                    value: outcomeCode,
                    label: outcomeCode,
                  })),
                ]}
                onChange={(value) =>
                  updateConfiguration((target) => {
                    (
                      target as unknown as {
                        forcedOutcomeCode?: string;
                      }
                    ).forcedOutcomeCode = value;
                  })
                }
              />
            ) : null}
          </div>
        </section>
      )}
      <OutcomeModelEditor
        pack={pack}
        scenario={scenario}
        scenarioIndex={scenarioIndex}
        onChange={onChange}
      />
    </section>
  );
}

function OutcomeModelEditor({
  pack,
  scenario,
  scenarioIndex,
  onChange,
}: BuilderStepProps): ReactNode {
  const t = useTranslator();
  function addModel(): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target = draft.scenarios[scenarioIndex];
        if (target === undefined) return;
        target.outcomeModels.push({
          outcomeModelId: uniqueIdentifier(
            target.outcomeModels.map(
              (model) => model.outcomeModelId,
            ),
            "OUTCOME_MODEL",
          ),
          distribution: "bernoulli",
          randomStreamId: "RANDOM_STREAM_DEFAULT",
          probability: 0.5,
          onTrue: "OUTCOME_TRUE",
          onFalse: "OUTCOME_FALSE",
        });
      }),
    );
  }
  return (
    <section className="scenario-builder__subsection">
      <div className="scenario-builder__section-heading">
        <div>
          <h5>{t("scenarioAuthor.builder.outcomeModels")}</h5>
          <p>{t("scenarioAuthor.builder.outcomeModelsHelp")}</p>
        </div>
        <button
          className="button button--secondary"
          type="button"
          onClick={addModel}
        >
          {t("scenarioAuthor.builder.addOutcomeModel")}
        </button>
      </div>
      {scenario.outcomeModels.map((model, modelIndex) => (
        <article
          className="scenario-builder__collection-card"
          key={`outcome-model-${String(modelIndex)}`}
        >
          <div className="scenario-builder__collection-heading">
            <code>{model.outcomeModelId}</code>
            <button
              className="button button--quiet"
              type="button"
              disabled={scenario.modeConfigurations.some(
                (configuration) =>
                  configuration.outcomeModelId ===
                  model.outcomeModelId,
              )}
              title={
                scenario.modeConfigurations.some(
                  (configuration) =>
                    configuration.outcomeModelId ===
                    model.outcomeModelId,
                )
                  ? t("scenarioAuthor.builder.removeReferenced")
                  : undefined
              }
              onClick={() =>
                onChange(
                  changeScenarioPack(pack, (draft) => {
                    draft.scenarios[
                      scenarioIndex
                    ]?.outcomeModels.splice(modelIndex, 1);
                  }),
                )
              }
            >
              {t("scenarioAuthor.builder.remove")}
            </button>
          </div>
          <ReferenceHint
            references={scenario.modeConfigurations
              .filter(
                (configuration) =>
                  configuration.outcomeModelId ===
                  model.outcomeModelId,
              )
              .map(
                (configuration) =>
                  `MODE:${configuration.mode}`,
              )}
          />
          <div className="instructor-review__form-grid">
            <TextControl
              id={`outcome-model-id-${String(modelIndex)}`}
              label={t("scenarioAuthor.builder.outcomeModelId")}
              value={model.outcomeModelId}
              onChange={(value) =>
                onChange(
                  changeScenarioPack(pack, (draft) => {
                    const target =
                      draft.scenarios[scenarioIndex]
                        ?.outcomeModels[modelIndex];
                    if (target !== undefined) {
                      target.outcomeModelId = value;
                    }
                  }),
                )
              }
            />
            <TextControl
              id={`outcome-stream-${String(modelIndex)}`}
              label={t("scenarioAuthor.builder.randomStream")}
              value={model.randomStreamId}
              onChange={(value) =>
                onChange(
                  changeScenarioPack(pack, (draft) => {
                    const target =
                      draft.scenarios[scenarioIndex]
                        ?.outcomeModels[modelIndex];
                    if (target !== undefined) {
                      target.randomStreamId = value;
                    }
                  }),
                )
              }
            />
            {model.distribution === "bernoulli" ? (
              <>
                <NumberControl
                  id={`outcome-probability-${String(modelIndex)}`}
                  label={t("scenarioAuthor.builder.probability")}
                  value={model.probability}
                  minimum={0}
                  maximum={1}
                  onChange={(value) =>
                    onChange(
                      changeScenarioPack(pack, (draft) => {
                        const target =
                          draft.scenarios[scenarioIndex]
                            ?.outcomeModels[modelIndex];
                        if (
                          target?.distribution === "bernoulli"
                        ) {
                          target.probability = value;
                        }
                      }),
                    )
                  }
                />
                <TextControl
                  id={`outcome-true-${String(modelIndex)}`}
                  label={t("scenarioAuthor.builder.onTrue")}
                  value={model.onTrue}
                  onChange={(value) =>
                    onChange(
                      changeScenarioPack(pack, (draft) => {
                        const target =
                          draft.scenarios[scenarioIndex]
                            ?.outcomeModels[modelIndex];
                        if (
                          target?.distribution === "bernoulli"
                        ) {
                          target.onTrue = value;
                        }
                      }),
                    )
                  }
                />
                <TextControl
                  id={`outcome-false-${String(modelIndex)}`}
                  label={t("scenarioAuthor.builder.onFalse")}
                  value={model.onFalse}
                  onChange={(value) =>
                    onChange(
                      changeScenarioPack(pack, (draft) => {
                        const target =
                          draft.scenarios[scenarioIndex]
                            ?.outcomeModels[modelIndex];
                        if (
                          target?.distribution === "bernoulli"
                        ) {
                          target.onFalse = value;
                        }
                      }),
                    )
                  }
                />
              </>
            ) : (
              <WeightedOutcomeEditor
                pack={pack}
                scenarioIndex={scenarioIndex}
                modelIndex={modelIndex}
                outcomes={model.outcomes}
                onChange={onChange}
              />
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

function WeightedOutcomeEditor({
  pack,
  scenarioIndex,
  modelIndex,
  outcomes,
  onChange,
}: {
  readonly pack: ScenarioPackV1;
  readonly scenarioIndex: number;
  readonly modelIndex: number;
  readonly outcomes: readonly {
    readonly outcomeCode: string;
    readonly weight: number;
  }[];
  readonly onChange: (pack: ScenarioPackV1) => void;
}): ReactNode {
  const t = useTranslator();
  function update(
    mutation: (
      values: {
        outcomeCode: string;
        weight: number;
      }[],
    ) => void,
  ): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const model =
          draft.scenarios[scenarioIndex]?.outcomeModels[modelIndex];
        if (model?.distribution !== "weighted-categorical") return;
        mutation(model.outcomes);
      }),
    );
  }
  return (
    <fieldset className="scenario-builder__choice-group">
      <legend>{t("scenarioAuthor.builder.weightedOutcomes")}</legend>
      {outcomes.map((outcome, outcomeIndex) => (
        <div
          className="scenario-builder__nested-card"
          key={`weighted-outcome-${String(outcomeIndex)}`}
        >
          <div className="instructor-review__form-grid">
            <TextControl
              id={`outcome-code-${String(modelIndex)}-${String(outcomeIndex)}`}
              label={t("scenarioAuthor.builder.outcomeCode")}
              value={outcome.outcomeCode}
              onChange={(value) =>
                update((values) => {
                  const target = values[outcomeIndex];
                  if (target !== undefined) target.outcomeCode = value;
                })
              }
            />
            <NumberControl
              id={`outcome-weight-${String(modelIndex)}-${String(outcomeIndex)}`}
              label={t("scenarioAuthor.builder.outcomeWeight")}
              value={outcome.weight}
              minimum={0.000_001}
              onChange={(value) =>
                update((values) => {
                  const target = values[outcomeIndex];
                  if (target !== undefined) target.weight = value;
                })
              }
            />
          </div>
          <button
            className="button button--quiet"
            type="button"
            disabled={outcomes.length <= 2}
            onClick={() =>
              update((values) => {
                values.splice(outcomeIndex, 1);
              })
            }
          >
            {t("scenarioAuthor.builder.remove")}
          </button>
        </div>
      ))}
      <button
        className="button button--secondary"
        type="button"
        onClick={() =>
          update((values) => {
            values.push({
              outcomeCode: uniqueIdentifier(
                values.map((outcome) => outcome.outcomeCode),
                "OUTCOME_NEW",
              ),
              weight: 1,
            });
          })
        }
      >
        {t("scenarioAuthor.builder.addOutcome")}
      </button>
    </fieldset>
  );
}

function organizationDependents(
  scenario: ScenarioDefinitionV1,
  organizationId: string,
): readonly string[] {
  return [
    ...scenario.roles
      .filter((role) => role.organizationId === organizationId)
      .map((role) => role.roleId),
    ...scenario.evidenceItems
      .filter(
        (evidence) =>
          evidence.sourceOrganizationId === organizationId,
      )
      .map((evidence) => evidence.evidenceId),
  ];
}

function roleDependents(
  scenario: ScenarioDefinitionV1,
  roleId: string,
): readonly string[] {
  return [
    ...scenario.evidenceItems
      .filter((evidence) => evidence.visibleToRoleIds.includes(roleId))
      .map((evidence) => evidence.evidenceId),
    ...scenario.instructorIncidents
      .filter((incident) => incident.visibleToRoleIds.includes(roleId))
      .map((incident) => incident.incidentId),
    ...scenario.nodes
      .filter(
        (node) =>
          (node.nodeType === "ENDORSEMENT" &&
            node.permittedRoleIds.includes(roleId)) ||
          (node.nodeType === "COMMUNICATION" &&
            node.visibleToRoleIds.includes(roleId)),
      )
      .map((node) => node.nodeId),
  ];
}

function evidenceDependents(
  scenario: ScenarioDefinitionV1,
  evidenceId: string,
): readonly string[] {
  return [
    ...scenario.nodes
      .filter(
        (node) =>
          node.nodeType === "EVIDENCE_RELEASE" &&
          node.evidenceIds.includes(evidenceId),
      )
      .map((node) => node.nodeId),
    ...scenario.instructorIncidents
      .filter((incident) => incident.evidenceIds.includes(evidenceId))
      .map((incident) => incident.incidentId),
  ];
}

function policyDependents(
  scenario: ScenarioDefinitionV1,
  policyId: string,
): readonly string[] {
  return scenario.nodes
    .filter(
      (node) =>
        (node.nodeType === "TRANSACTION_PROPOSAL" &&
          node.policyIds.includes(policyId)) ||
        ((node.nodeType === "ENDORSEMENT" ||
          node.nodeType === "POLICY_CHECK") &&
          node.policyId === policyId) ||
        node.transitions.some(
          (transition) =>
            transition.when.kind === "POLICY_RESULT" &&
            transition.when.policyId === policyId,
        ),
    )
    .map((node) => node.nodeId);
}

function nodeDependents(
  scenario: ScenarioDefinitionV1,
  nodeId: string,
): readonly string[] {
  return [
    ...(scenario.entryNodeId === nodeId ? ["ENTRY_NODE"] : []),
    ...scenario.nodes
      .filter(
        (node) =>
          node.transitions.some(
            (transition) => transition.toNodeId === nodeId,
          ) ||
          ((node.nodeType === "ENDORSEMENT" ||
            node.nodeType === "POLICY_CHECK") &&
            node.proposalNodeId === nodeId),
      )
      .map((node) => node.nodeId),
    ...scenario.instructorIncidents
      .filter((incident) => incident.releaseAtNodeIds.includes(nodeId))
      .map((incident) => incident.incidentId),
  ];
}

function competencyDependents(
  pack: ScenarioPackV1,
  competencyId: string,
): readonly string[] {
  return pack.scenarios
    .filter((scenario) =>
      scenario.competencyTargets.some(
        (target) => target.competencyId === competencyId,
      ),
    )
    .map((scenario) => scenario.scenarioId);
}

function indicatorDependents(
  pack: ScenarioPackV1,
  indicatorId: string,
): readonly string[] {
  return [
    ...pack.scenarios
      .filter((scenario) =>
        scenario.competencyTargets.some((target) =>
          target.indicatorIds.includes(indicatorId),
        ),
      )
      .map((scenario) => scenario.scenarioId),
    ...pack.rubrics
      .flatMap((rubric) => rubric.criteria)
      .filter((criterion) =>
        criterion.indicatorIds.includes(indicatorId),
      )
      .map((criterion) => criterion.criterionId),
    ...pack.evidenceRules
      .filter((rule) => rule.indicatorIds.includes(indicatorId))
      .map((rule) => rule.evidenceRuleId),
  ];
}

function rubricDependents(
  pack: ScenarioPackV1,
  rubricId: string,
): readonly string[] {
  return pack.scenarios
    .filter((scenario) => scenario.rubricIds.includes(rubricId))
    .map((scenario) => scenario.scenarioId);
}

function evidenceRuleDependents(
  pack: ScenarioPackV1,
  evidenceRuleId: string,
): readonly string[] {
  return [
    ...pack.scenarios
      .filter((scenario) =>
        scenario.evidenceRuleIds.includes(evidenceRuleId),
      )
      .map((scenario) => scenario.scenarioId),
    ...pack.rubrics
      .flatMap((rubric) => rubric.criteria)
      .filter((criterion) =>
        criterion.evidenceRuleIds.includes(evidenceRuleId),
      )
      .map((criterion) => criterion.criterionId),
  ];
}

function ReferenceHint({
  references,
}: {
  readonly references: readonly string[];
}): ReactNode {
  const t = useTranslator();
  const distinct = [...new Set(references)];
  return distinct.length === 0 ? null : (
    <p className="field__hint">
      {t("scenarioAuthor.builder.referenceHint", {
        dependents: distinct.join(", "),
      })}
    </p>
  );
}

function ParticipantsStep({
  pack,
  scenario,
  scenarioIndex,
  onChange,
}: BuilderStepProps): ReactNode {
  const t = useTranslator();
  function addOrganization(): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target = draft.scenarios[scenarioIndex];
        if (target === undefined) return;
        const organizationId = uniqueIdentifier(
          target.organizations.map(
            (organization) => organization.organizationId,
          ),
          "ORG_NEW",
        );
        const localizationPrefix = uniqueLocalizationPrefix(
          draft as unknown as ScenarioPackV1,
          `builder.${target.scenarioId}.organization`,
          [".name"],
        );
        const localizationKey = `${localizationPrefix}.name`;
        target.organizations.push({
          organizationId,
          displayName: { localizationKey },
        });
        draft.localizationCatalogs ??= {};
        for (const locale of draft.supportedLocales) {
          const catalog =
            draft.localizationCatalogs[locale] ?? {};
          catalog[localizationKey] = organizationId;
          draft.localizationCatalogs[locale] = catalog;
        }
      }),
    );
  }
  function addRole(): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target = draft.scenarios[scenarioIndex];
        const organization = target?.organizations[0];
        if (target === undefined || organization === undefined) {
          return;
        }
        const roleId = uniqueIdentifier(
          target.roles.map((role) => role.roleId),
          "ROLE_NEW",
        );
        const localizationPrefix = uniqueLocalizationPrefix(
          draft as unknown as ScenarioPackV1,
          `builder.${target.scenarioId}.role`,
          [".name"],
        );
        const localizationKey = `${localizationPrefix}.name`;
        target.roles.push({
          roleId,
          organizationId: organization.organizationId,
          displayName: { localizationKey },
        });
        draft.localizationCatalogs ??= {};
        for (const locale of draft.supportedLocales) {
          const catalog =
            draft.localizationCatalogs[locale] ?? {};
          catalog[localizationKey] = roleId;
          draft.localizationCatalogs[locale] = catalog;
        }
      }),
    );
  }
  return (
    <section aria-labelledby="builder-participants-heading">
      <h4 id="builder-participants-heading">
        {t("scenarioAuthor.builder.participants.heading")}
      </h4>
      <p>{t("scenarioAuthor.builder.participants.help")}</p>
      <CollectionSection
        heading={t("scenarioAuthor.builder.organizations")}
        help={t("scenarioAuthor.builder.organizationsHelp")}
        addLabel={t("scenarioAuthor.builder.addOrganization")}
        onAdd={addOrganization}
      >
        {scenario.organizations.map((organization, index) => (
          <article
            className="scenario-builder__collection-card"
            key={organization.displayName.localizationKey}
          >
            <div className="scenario-builder__collection-heading">
              <code>{organization.organizationId}</code>
              <button
                className="button button--quiet"
                type="button"
                disabled={
                  scenario.organizations.length <= 1 ||
                  countExactIdentifierOccurrences(
                    scenario,
                    organization.organizationId,
                  ) > 1
                }
                title={
                  countExactIdentifierOccurrences(
                    scenario,
                    organization.organizationId,
                  ) > 1
                    ? t(
                        "scenarioAuthor.builder.removeReferenced",
                      )
                    : undefined
                }
                onClick={() =>
                  onChange(
                    changeScenarioPack(pack, (draft) => {
                      draft.scenarios[
                        scenarioIndex
                      ]?.organizations.splice(index, 1);
                    }),
                  )
                }
              >
                {t("scenarioAuthor.builder.remove")}
              </button>
            </div>
            <ReferenceHint
              references={organizationDependents(
                scenario,
                organization.organizationId,
              )}
            />
            <TextControl
              id={`organization-id-${String(index)}`}
              label={t("scenarioAuthor.builder.organizationId")}
              value={organization.organizationId}
              onChange={(value) =>
                onChange(
                  changeScenarioPack(pack, (draft) => {
                    const target =
                      draft.scenarios[scenarioIndex]
                        ?.organizations[index];
                    if (target !== undefined) {
                      target.organizationId = value;
                    }
                  }),
                )
              }
            />
            <LocalizedTextControl
              heading={t("scenarioAuthor.builder.displayName")}
              pack={pack}
              localizationKey={
                organization.displayName.localizationKey
              }
              onChange={onChange}
            />
          </article>
        ))}
      </CollectionSection>
      <CollectionSection
        heading={t("scenarioAuthor.builder.roles")}
        help={t("scenarioAuthor.builder.rolesHelp")}
        addLabel={t("scenarioAuthor.builder.addRole")}
        onAdd={addRole}
      >
        {scenario.roles.map((role, index) => (
          <article
            className="scenario-builder__collection-card"
            key={role.displayName.localizationKey}
          >
            <div className="scenario-builder__collection-heading">
              <code>{role.roleId}</code>
              <button
                className="button button--quiet"
                type="button"
                disabled={
                  scenario.roles.length <= 1 ||
                  countExactIdentifierOccurrences(
                    scenario,
                    role.roleId,
                  ) > 1
                }
                title={
                  countExactIdentifierOccurrences(
                    scenario,
                    role.roleId,
                  ) > 1
                    ? t(
                        "scenarioAuthor.builder.removeReferenced",
                      )
                    : undefined
                }
                onClick={() =>
                  onChange(
                    changeScenarioPack(pack, (draft) => {
                      draft.scenarios[
                        scenarioIndex
                      ]?.roles.splice(index, 1);
                    }),
                  )
                }
              >
                {t("scenarioAuthor.builder.remove")}
              </button>
            </div>
            <ReferenceHint
              references={roleDependents(scenario, role.roleId)}
            />
            <div className="instructor-review__form-grid">
              <TextControl
                id={`role-id-${String(index)}`}
                label={t("scenarioAuthor.builder.roleId")}
                value={role.roleId}
                onChange={(value) =>
                  onChange(
                    changeScenarioPack(pack, (draft) => {
                      const target =
                        draft.scenarios[scenarioIndex]?.roles[index];
                      if (target !== undefined) target.roleId = value;
                    }),
                  )
                }
              />
              <SelectControl
                id={`role-organization-${String(index)}`}
                label={t("scenarioAuthor.builder.organization")}
                value={role.organizationId}
                options={scenario.organizations.map(
                  (organization) => ({
                    value: organization.organizationId,
                    label: organization.organizationId,
                  }),
                )}
                onChange={(value) =>
                  onChange(
                    changeScenarioPack(pack, (draft) => {
                      const target =
                        draft.scenarios[scenarioIndex]?.roles[index];
                      if (target !== undefined) {
                        target.organizationId = value;
                      }
                    }),
                  )
                }
              />
            </div>
            <LocalizedTextControl
              heading={t("scenarioAuthor.builder.displayName")}
              pack={pack}
              localizationKey={role.displayName.localizationKey}
              onChange={onChange}
            />
          </article>
        ))}
      </CollectionSection>
      <section className="scenario-builder__subsection">
        <h5>{t("scenarioAuthor.builder.initialState")}</h5>
        <p>{t("scenarioAuthor.builder.initialStateHelp")}</p>
        {(
          [
            "actualState",
            "businessState",
            "ledgerState",
            "informationState",
          ] as const
        ).map((stateName) => (
          <JsonValueEditor
            key={stateName}
            idPrefix={`initial-${stateName}`}
            label={t(
              `scenarioAuthor.builder.state.${stateName}`,
            )}
            value={scenario.initialState[stateName]}
            onChange={(value) =>
              onChange(
                changeScenarioPack(pack, (draft) => {
                  const target = draft.scenarios[scenarioIndex];
                  if (
                    target !== undefined &&
                    typeof value === "object" &&
                    value !== null &&
                    !Array.isArray(value)
                  ) {
                    target.initialState[stateName] =
                      value as unknown as typeof target.initialState[typeof stateName];
                  }
                }),
              )
            }
          />
        ))}
      </section>
    </section>
  );
}

function CollectionSection({
  heading,
  help,
  addLabel,
  onAdd,
  addDisabled = false,
  addHint,
  children,
}: {
  readonly heading: string;
  readonly help: string;
  readonly addLabel: string;
  readonly onAdd: () => void;
  readonly addDisabled?: boolean;
  readonly addHint?: string | undefined;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section className="scenario-builder__subsection">
      <div className="scenario-builder__section-heading">
        <div>
          <h5>{heading}</h5>
          <p>{help}</p>
        </div>
        <button
          className="button button--secondary"
          type="button"
          disabled={addDisabled}
          onClick={onAdd}
        >
          {addLabel}
        </button>
      </div>
      {addHint === undefined ? null : (
        <p className="field__hint">{addHint}</p>
      )}
      <div className="scenario-builder__collection">{children}</div>
    </section>
  );
}

function EvidenceStep({
  pack,
  scenario,
  scenarioIndex,
  onChange,
}: BuilderStepProps): ReactNode {
  const t = useTranslator();

  function addPolicy(): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target = draft.scenarios[scenarioIndex];
        if (target === undefined) return;
        const policyId = uniqueIdentifier(
          target.policies.map((policy) => policy.policyId),
          "POLICY_NEW",
        );
        const key = uniqueLocalizationPrefix(
          draft as unknown as ScenarioPackV1,
          `builder.${target.scenarioId}.policy`,
          [".title", ".statement"],
        );
        target.policies.push({
          policyId,
          policyType: "BUSINESS_RULE",
          title: { localizationKey: `${key}.title` },
          learnerStatement: {
            localizationKey: `${key}.statement`,
          },
          configuration: {},
        });
        seedLocalizedKeys(
          draft as unknown as ScenarioPackV1,
          [`${key}.title`, `${key}.statement`],
        );
      }),
    );
  }

  function addEvidence(): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target = draft.scenarios[scenarioIndex];
        const organization = target?.organizations[0];
        const role = target?.roles[0];
        if (
          target === undefined ||
          organization === undefined ||
          role === undefined
        ) {
          return;
        }
        const evidenceId = uniqueIdentifier(
          target.evidenceItems.map(
            (evidence) => evidence.evidenceId,
          ),
          "EVIDENCE_NEW",
        );
        const key = uniqueLocalizationPrefix(
          draft as unknown as ScenarioPackV1,
          `builder.${target.scenarioId}.evidence`,
          [".title"],
        );
        target.evidenceItems.push({
          evidenceId,
          evidenceType: "DOCUMENT",
          title: { localizationKey: `${key}.title` },
          sourceOrganizationId: organization.organizationId,
          learnerMetadata: {
            ownerOrganizationId: organization.organizationId,
            signatureStatus: "NOT_CHECKED",
            ledgerStatus: "OFF_CHAIN",
            completeness: "UNKNOWN",
            access: {
              classification: "SHARED",
              acquisitionMode: "AVAILABLE",
              delayMinutes: 0,
              costUnits: 0,
            },
          },
          visibleToRoleIds: [role.roleId],
          assessmentMetadata: {
            reliability: "NOT_ASSESSED",
            contentStatus: "NOT_ASSESSED",
            limitationCodes: [],
            hiddenConditionReferences: [],
          },
          content: {},
        });
        seedLocalizedKeys(
          draft as unknown as ScenarioPackV1,
          [`${key}.title`],
        );
      }),
    );
  }

  return (
    <section aria-labelledby="builder-evidence-heading">
      <h4 id="builder-evidence-heading">
        {t("scenarioAuthor.builder.evidence.heading")}
      </h4>
      <p>{t("scenarioAuthor.builder.evidence.help")}</p>
      <CollectionSection
        heading={t("scenarioAuthor.builder.policies")}
        help={t("scenarioAuthor.builder.policiesHelp")}
        addLabel={t("scenarioAuthor.builder.addPolicy")}
        onAdd={addPolicy}
      >
        {scenario.policies.map((policy, index) => (
          <PolicyEditor
            key={policy.title.localizationKey}
            pack={pack}
            scenario={scenario}
            scenarioIndex={scenarioIndex}
            policy={policy}
            policyIndex={index}
            onChange={onChange}
          />
        ))}
      </CollectionSection>
      <CollectionSection
        heading={t("scenarioAuthor.builder.evidenceItems")}
        help={t("scenarioAuthor.builder.evidenceItemsHelp")}
        addLabel={t("scenarioAuthor.builder.addEvidence")}
        onAdd={addEvidence}
      >
        {scenario.evidenceItems.map((evidence, index) => (
          <EvidenceItemEditor
            key={evidence.title.localizationKey}
            pack={pack}
            scenario={scenario}
            scenarioIndex={scenarioIndex}
            evidence={evidence}
            evidenceIndex={index}
            onChange={onChange}
          />
        ))}
      </CollectionSection>
    </section>
  );
}

function PolicyEditor({
  pack,
  scenario,
  scenarioIndex,
  policy,
  policyIndex,
  onChange,
}: BuilderStepProps & {
  readonly policy: ScenarioPolicyV1;
  readonly policyIndex: number;
}): ReactNode {
  const t = useTranslator();
  function update(
    mutation: (policy: {
      policyId: string;
      policyType: ScenarioPolicyV1["policyType"];
      configuration: JsonObject;
    }) => void,
  ): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target =
          draft.scenarios[scenarioIndex]?.policies[policyIndex];
        if (target !== undefined) {
          mutation(target);
        }
      }),
    );
  }
  return (
    <article className="scenario-builder__collection-card">
      <div className="scenario-builder__collection-heading">
        <code>{policy.policyId}</code>
        <button
          className="button button--quiet"
          type="button"
          disabled={
            countExactIdentifierOccurrences(
              scenario,
              policy.policyId,
            ) > 1
          }
          title={
            countExactIdentifierOccurrences(
              scenario,
              policy.policyId,
            ) > 1
              ? t("scenarioAuthor.builder.removeReferenced")
              : undefined
          }
          onClick={() =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                draft.scenarios[
                  scenarioIndex
                ]?.policies.splice(policyIndex, 1);
              }),
            )
          }
        >
          {t("scenarioAuthor.builder.remove")}
        </button>
      </div>
      <ReferenceHint
        references={policyDependents(scenario, policy.policyId)}
      />
      <div className="instructor-review__form-grid">
        <TextControl
          id={`policy-id-${String(policyIndex)}`}
          label={t("scenarioAuthor.builder.policyId")}
          value={policy.policyId}
          onChange={(value) =>
            update((target) => {
              target.policyId = value;
            })
          }
        />
        <SelectControl
          id={`policy-type-${String(policyIndex)}`}
          label={t("scenarioAuthor.builder.policyType")}
          value={policy.policyType}
          options={[
            "AUTHORIZATION",
            "BUSINESS_RULE",
            "RUNTIME_POLICY",
          ].map((value) => ({
            value,
            label: t(
              `scenarioAuthor.builder.policyType.${value}`,
            ),
          }))}
          onChange={(value) =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                const targetScenario =
                  draft.scenarios[scenarioIndex];
                const target =
                  targetScenario?.policies[policyIndex];
                if (
                  targetScenario === undefined ||
                  target === undefined
                ) {
                  return;
                }
                target.policyType =
                  value as ScenarioPolicyV1["policyType"];
                if (value === "AUTHORIZATION") {
                  target.configuration = {
                    authorizedRoleId:
                      targetScenario.roles[0]?.roleId ?? "",
                    authorizedOrganizationId:
                      targetScenario.organizations[0]
                        ?.organizationId ?? "",
                  };
                  return;
                }
                target.configuration = {};
                targetScenario.evidenceItems.forEach((evidence) => {
                  if (
                    evidence.learnerMetadata.access
                      .permissionPolicyId === target.policyId
                  ) {
                    delete evidence.learnerMetadata.access
                      .permissionPolicyId;
                  }
                });
              }),
            )
          }
        />
      </div>
      <LocalizedTextControl
        heading={t("scenarioAuthor.builder.policyTitle")}
        pack={pack}
        localizationKey={policy.title.localizationKey}
        onChange={onChange}
      />
      <LocalizedTextControl
        heading={t("scenarioAuthor.builder.policyStatement")}
        pack={pack}
        localizationKey={
          policy.learnerStatement.localizationKey
        }
        multiline
        onChange={onChange}
      />
      <JsonValueEditor
        idPrefix={`policy-config-${String(policyIndex)}`}
        label={t("scenarioAuthor.builder.policyConfiguration")}
        value={policy.configuration}
        onChange={(value) => {
          if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
          ) {
            update((target) => {
              target.configuration = value as JsonObject;
            });
          }
        }}
      />
      <p className="field__hint">
        {t("scenarioAuthor.builder.policyReferenceHelp", {
          roles: scenario.roles.length,
        })}
      </p>
    </article>
  );
}

function EvidenceItemEditor({
  pack,
  scenario,
  scenarioIndex,
  evidence,
  evidenceIndex,
  onChange,
}: BuilderStepProps & {
  readonly evidence: ScenarioEvidenceItemV1;
  readonly evidenceIndex: number;
}): ReactNode {
  const t = useTranslator();
  function update(
    mutation: (
      target: DeepMutable<ScenarioEvidenceItemV1>,
    ) => void,
  ): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target =
          draft.scenarios[scenarioIndex]?.evidenceItems[
            evidenceIndex
          ];
        if (target !== undefined) {
          mutation(target);
        }
      }),
    );
  }
  return (
    <article className="scenario-builder__collection-card">
      <div className="scenario-builder__collection-heading">
        <code>{evidence.evidenceId}</code>
        <button
          className="button button--quiet"
          type="button"
          disabled={
            countExactIdentifierOccurrences(
              scenario,
              evidence.evidenceId,
            ) > 1
          }
          title={
            countExactIdentifierOccurrences(
              scenario,
              evidence.evidenceId,
            ) > 1
              ? t("scenarioAuthor.builder.removeReferenced")
              : undefined
          }
          onClick={() =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                draft.scenarios[
                  scenarioIndex
                ]?.evidenceItems.splice(evidenceIndex, 1);
              }),
            )
          }
        >
          {t("scenarioAuthor.builder.remove")}
        </button>
      </div>
      <ReferenceHint
        references={evidenceDependents(
          scenario,
          evidence.evidenceId,
        )}
      />
      <div className="instructor-review__form-grid">
        <TextControl
          id={`evidence-id-${String(evidenceIndex)}`}
          label={t("scenarioAuthor.builder.evidenceId")}
          value={evidence.evidenceId}
          onChange={(value) =>
            update((target) => {
              target.evidenceId = value;
            })
          }
        />
        <TextControl
          id={`evidence-type-${String(evidenceIndex)}`}
          label={t("scenarioAuthor.builder.evidenceType")}
          value={evidence.evidenceType}
          onChange={(value) =>
            update((target) => {
              target.evidenceType = value;
            })
          }
        />
        <SelectControl
          id={`evidence-source-${String(evidenceIndex)}`}
          label={t("scenarioAuthor.builder.sourceOrganization")}
          value={evidence.sourceOrganizationId}
          options={scenario.organizations.map((organization) => ({
            value: organization.organizationId,
            label: organization.organizationId,
          }))}
          onChange={(value) =>
            update((target) => {
              target.sourceOrganizationId = value;
            })
          }
        />
        <SelectControl
          id={`evidence-owner-${String(evidenceIndex)}`}
          label={t(
            "scenarioAuthor.builder.evidenceOwnerOrganization",
          )}
          value={
            evidence.learnerMetadata.ownerOrganizationId ?? ""
          }
          options={[
            {
              value: "",
              label: t(
                "scenarioAuthor.builder.optionalNotSpecified",
              ),
            },
            ...scenario.organizations.map((organization) => ({
              value: organization.organizationId,
              label: organization.organizationId,
            })),
          ]}
          onChange={(value) =>
            update((target) => {
              if (value.length === 0) {
                delete target.learnerMetadata.ownerOrganizationId;
              } else {
                target.learnerMetadata.ownerOrganizationId = value;
              }
            })
          }
        />
        <TextControl
          id={`evidence-created-${String(evidenceIndex)}`}
          label={t("scenarioAuthor.builder.evidenceCreatedAt")}
          value={evidence.learnerMetadata.createdAt ?? ""}
          onChange={(value) =>
            update((target) => {
              if (value.trim().length === 0) {
                delete target.learnerMetadata.createdAt;
              } else {
                target.learnerMetadata.createdAt = value;
              }
            })
          }
        />
        <TextControl
          id={`evidence-effective-${String(evidenceIndex)}`}
          label={t("scenarioAuthor.builder.evidenceEffectiveFrom")}
          value={evidence.learnerMetadata.effectiveFrom ?? ""}
          onChange={(value) =>
            update((target) => {
              if (value.trim().length === 0) {
                delete target.learnerMetadata.effectiveFrom;
              } else {
                target.learnerMetadata.effectiveFrom = value;
              }
            })
          }
        />
        <SelectControl
          id={`evidence-signature-${String(evidenceIndex)}`}
          label={t("scenarioAuthor.builder.signatureStatus")}
          value={evidence.learnerMetadata.signatureStatus}
          options={[
            "VALID",
            "INVALID",
            "NOT_SIGNED",
            "NOT_CHECKED",
            "NOT_APPLICABLE",
          ].map((value) => ({
            value,
            label: t(`evidenceMetadata.signatureStatus.${value}`),
          }))}
          onChange={(value) =>
            update((target) => {
              target.learnerMetadata.signatureStatus =
                value as ScenarioEvidenceItemV1["learnerMetadata"]["signatureStatus"];
            })
          }
        />
        <SelectControl
          id={`evidence-ledger-${String(evidenceIndex)}`}
          label={t("scenarioAuthor.builder.ledgerStatus")}
          value={evidence.learnerMetadata.ledgerStatus}
          options={[
            "FULL_RECORD_ON_LEDGER",
            "HASH_ANCHORED",
            "OFF_CHAIN",
            "NOT_APPLICABLE",
          ].map((value) => ({
            value,
            label: t(`evidenceMetadata.ledgerStatus.${value}`),
          }))}
          onChange={(value) =>
            update((target) => {
              target.learnerMetadata.ledgerStatus =
                value as ScenarioEvidenceItemV1["learnerMetadata"]["ledgerStatus"];
            })
          }
        />
        <SelectControl
          id={`evidence-completeness-${String(evidenceIndex)}`}
          label={t("scenarioAuthor.builder.completeness")}
          value={evidence.learnerMetadata.completeness}
          options={["COMPLETE", "PARTIAL", "UNKNOWN"].map(
            (value) => ({
              value,
              label: t(
                `evidenceMetadata.completenessStatus.${value}`,
              ),
            }),
          )}
          onChange={(value) =>
            update((target) => {
              target.learnerMetadata.completeness =
                value as ScenarioEvidenceItemV1["learnerMetadata"]["completeness"];
            })
          }
        />
        <SelectControl
          id={`evidence-reliability-${String(evidenceIndex)}`}
          label={t("scenarioAuthor.builder.reliability")}
          value={evidence.assessmentMetadata.reliability}
          options={[
            "RELIABLE",
            "CONTESTED",
            "UNRELIABLE",
            "NOT_ASSESSED",
          ].map((value) => ({
            value,
            label: t(
              `evidenceAssessment.reliabilityStatus.${value}`,
            ),
          }))}
          onChange={(value) =>
            update((target) => {
              target.assessmentMetadata.reliability =
                value as ScenarioEvidenceItemV1["assessmentMetadata"]["reliability"];
            })
          }
        />
        <SelectControl
          id={`evidence-content-status-${String(evidenceIndex)}`}
          label={t("scenarioAuthor.builder.contentStatus")}
          value={evidence.assessmentMetadata.contentStatus}
          options={[
            "ACCURATE",
            "INACCURATE",
            "MISLEADING",
            "INCOMPLETE",
            "NOT_ASSESSED",
          ].map((value) => ({
            value,
            label: t(
              `evidenceAssessment.contentStatusValue.${value}`,
            ),
          }))}
          onChange={(value) =>
            update((target) => {
              target.assessmentMetadata.contentStatus =
                value as ScenarioEvidenceItemV1["assessmentMetadata"]["contentStatus"];
            })
          }
        />
        <SelectControl
          id={`evidence-access-classification-${String(
            evidenceIndex,
          )}`}
          label={t(
            "scenarioAuthor.builder.accessClassification",
          )}
          value={
            evidence.learnerMetadata.access.classification
          }
          options={[
            "SHARED",
            "ROLE_RESTRICTED",
            "CONFIDENTIAL",
          ].map((value) => ({
            value,
            label: t(
              `evidenceMetadata.accessClassification.${value}`,
            ),
          }))}
          onChange={(value) =>
            update((target) => {
              target.learnerMetadata.access.classification =
                value as ScenarioEvidenceItemV1["learnerMetadata"]["access"]["classification"];
            })
          }
        />
        <SelectControl
          id={`evidence-acquisition-${String(evidenceIndex)}`}
          label={t("scenarioAuthor.builder.acquisitionMode")}
          value={
            evidence.learnerMetadata.access.acquisitionMode
          }
          options={["AVAILABLE", "REQUEST_REQUIRED"].map(
            (value) => ({
              value,
              label: t(
                `evidenceMetadata.acquisitionMode.${value}`,
                {
                  delayMinutes:
                    evidence.learnerMetadata.access.delayMinutes,
                  costUnits:
                    evidence.learnerMetadata.access.costUnits,
                },
              ),
            }),
          )}
          onChange={(value) =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                const targetScenario =
                  draft.scenarios[scenarioIndex];
                const target =
                  targetScenario?.evidenceItems[evidenceIndex];
                if (
                  targetScenario === undefined ||
                  target === undefined
                ) {
                  return;
                }
                target.learnerMetadata.access.acquisitionMode =
                  value as ScenarioEvidenceItemV1["learnerMetadata"]["access"]["acquisitionMode"];
                if (value === "AVAILABLE") {
                  target.learnerMetadata.access.delayMinutes = 0;
                  target.learnerMetadata.access.costUnits = 0;
                  delete target.learnerMetadata.access
                    .permissionPolicyId;
                  return;
                }
                targetScenario.modeConfigurations.forEach(
                  (configuration) => {
                    configuration.allowEvidenceRequests = true;
                  },
                );
                const authorizationPolicy =
                  targetScenario.policies.find(
                    (policy) =>
                      policy.policyType === "AUTHORIZATION",
                  );
                if (
                  target.learnerMetadata.access
                    .permissionPolicyId === undefined &&
                  authorizationPolicy !== undefined
                ) {
                  target.learnerMetadata.access
                    .permissionPolicyId =
                    authorizationPolicy.policyId;
                }
              }),
            )
          }
        />
        <NumberControl
          id={`evidence-delay-${String(evidenceIndex)}`}
          label={t("scenarioAuthor.builder.accessDelayMinutes")}
          value={evidence.learnerMetadata.access.delayMinutes}
          minimum={0}
          disabled={
            evidence.learnerMetadata.access.acquisitionMode ===
            "AVAILABLE"
          }
          onChange={(value) =>
            update((target) => {
              target.learnerMetadata.access.delayMinutes = value;
            })
          }
        />
        <NumberControl
          id={`evidence-cost-${String(evidenceIndex)}`}
          label={t("scenarioAuthor.builder.accessCostUnits")}
          value={evidence.learnerMetadata.access.costUnits}
          minimum={0}
          disabled={
            evidence.learnerMetadata.access.acquisitionMode ===
            "AVAILABLE"
          }
          onChange={(value) =>
            update((target) => {
              target.learnerMetadata.access.costUnits = value;
            })
          }
        />
        <SelectControl
          id={`evidence-permission-policy-${String(
            evidenceIndex,
          )}`}
          label={t(
            "scenarioAuthor.builder.accessPermissionPolicy",
          )}
          value={
            evidence.learnerMetadata.access.permissionPolicyId ??
            ""
          }
          options={[
            {
              value: "",
              label: t(
                "scenarioAuthor.builder.optionalNotSpecified",
              ),
            },
            ...scenario.policies
              .filter(
                (policy) =>
                  policy.policyType === "AUTHORIZATION",
              )
              .map((policy) => ({
                value: policy.policyId,
                label: policy.policyId,
              })),
          ]}
          disabled={
            evidence.learnerMetadata.access.acquisitionMode ===
            "AVAILABLE"
          }
          onChange={(value) =>
            update((target) => {
              if (value.length === 0) {
                delete target.learnerMetadata.access
                  .permissionPolicyId;
              } else {
                target.learnerMetadata.access.permissionPolicyId =
                  value;
              }
            })
          }
        />
      </div>
      <LocalizedTextControl
        heading={t("scenarioAuthor.builder.evidenceTitle")}
        pack={pack}
        localizationKey={evidence.title.localizationKey}
        onChange={onChange}
      />
      <CheckboxList
        legend={t("scenarioAuthor.builder.visibleRoles")}
        options={scenario.roles.map((role) => ({
          value: role.roleId,
          label: role.roleId,
        }))}
        selected={evidence.visibleToRoleIds}
        onChange={(values) =>
          update((target) => {
            target.visibleToRoleIds = [...values];
          })
        }
      />
      <CheckboxList
        legend={t(
          "scenarioAuthor.builder.hiddenConditionReferences",
        )}
        options={Object.keys(
          scenario.initialState.actualState,
        ).map((field) => ({ value: field, label: field }))}
        selected={
          evidence.assessmentMetadata.hiddenConditionReferences
        }
        onChange={(values) =>
          update((target) => {
            target.assessmentMetadata.hiddenConditionReferences = [
              ...values,
            ];
          })
        }
      />
      <TextControl
        id={`evidence-limitations-${String(evidenceIndex)}`}
        label={t("scenarioAuthor.builder.limitationCodes")}
        value={evidence.assessmentMetadata.limitationCodes.join(
          ", ",
        )}
        onChange={(value) =>
          update((target) => {
            target.assessmentMetadata.limitationCodes = value
              .split(",")
              .map((item) => item.trim())
              .filter((item) => item.length > 0);
          })
        }
      />
      <JsonValueEditor
        idPrefix={`evidence-content-${String(evidenceIndex)}`}
        label={t("scenarioAuthor.builder.evidenceContent")}
        value={evidence.content}
        onChange={(value) => {
          if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
          ) {
            update((target) => {
              target.content = value as DeepMutable<JsonObject>;
            });
          }
        }}
      />
    </article>
  );
}

function IncidentEditor({
  pack,
  scenario,
  scenarioIndex,
  onChange,
}: BuilderStepProps): ReactNode {
  const t = useTranslator();
  return (
    <CollectionSection
      heading={t("scenarioAuthor.builder.incidents")}
      help={t("scenarioAuthor.builder.incidentsHelp")}
      addLabel={t("scenarioAuthor.builder.addIncident")}
      addDisabled={scenario.evidenceItems.length === 0}
      addHint={
        scenario.evidenceItems.length === 0
          ? t("scenarioAuthor.builder.incidentNeedsEvidence")
          : undefined
      }
      onAdd={() =>
        onChange(
          changeScenarioPack(pack, (draft) => {
            const target = draft.scenarios[scenarioIndex];
            if (target === undefined) return;
            const incidentId = uniqueIdentifier(
              target.instructorIncidents.map(
                (incident) => incident.incidentId,
              ),
              "INCIDENT_NEW",
            );
            const key = uniqueLocalizationPrefix(
              draft as unknown as ScenarioPackV1,
              `builder.${target.scenarioId}.incident`,
              [".title", ".message"],
            );
            target.instructorIncidents.push({
              incidentId,
              version: "1.0.0",
              title: { localizationKey: `${key}.title` },
              message: { localizationKey: `${key}.message` },
              visibleToRoleIds: target.roles
                .slice(0, 1)
                .map((role) => role.roleId),
              releaseAtNodeIds: [target.entryNodeId],
              evidenceIds: target.evidenceItems
                .slice(0, 1)
                .map((evidence) => evidence.evidenceId),
              professionalConsequenceEffects: {},
            });
            seedLocalizedKeys(
              draft as unknown as ScenarioPackV1,
              [`${key}.title`, `${key}.message`],
            );
          }),
        )
      }
    >
      {scenario.instructorIncidents.map((incident, index) => (
        <article
          className="scenario-builder__collection-card"
          key={incident.title.localizationKey}
        >
          <div className="scenario-builder__collection-heading">
            <code>{incident.incidentId}</code>
            <button
              className="button button--quiet"
              type="button"
              onClick={() =>
                onChange(
                  changeScenarioPack(pack, (draft) => {
                    draft.scenarios[
                      scenarioIndex
                    ]?.instructorIncidents.splice(index, 1);
                  }),
                )
              }
            >
              {t("scenarioAuthor.builder.remove")}
            </button>
          </div>
          <div className="instructor-review__form-grid">
            <TextControl
              id={`incident-id-${String(index)}`}
              label={t("scenarioAuthor.builder.incidentId")}
              value={incident.incidentId}
              onChange={(value) =>
                onChange(
                  changeScenarioPack(pack, (draft) => {
                    const target =
                      draft.scenarios[scenarioIndex]
                        ?.instructorIncidents[index];
                    if (target !== undefined) {
                      target.incidentId = value;
                    }
                  }),
                )
              }
            />
            <TextControl
              id={`incident-version-${String(index)}`}
              label={t("scenarioAuthor.builder.version")}
              value={incident.version}
              onChange={(value) =>
                onChange(
                  changeScenarioPack(pack, (draft) => {
                    const target =
                      draft.scenarios[scenarioIndex]
                        ?.instructorIncidents[index];
                    if (target !== undefined) target.version = value;
                  }),
                )
              }
            />
          </div>
          <LocalizedTextControl
            heading={t("scenarioAuthor.builder.incidentTitle")}
            pack={pack}
            localizationKey={incident.title.localizationKey}
            onChange={onChange}
          />
          <LocalizedTextControl
            heading={t("scenarioAuthor.builder.incidentMessage")}
            pack={pack}
            localizationKey={incident.message.localizationKey}
            multiline
            onChange={onChange}
          />
          <CheckboxList
            legend={t("scenarioAuthor.builder.visibleRoles")}
            options={scenario.roles.map((role) => ({
              value: role.roleId,
              label: role.roleId,
            }))}
            selected={incident.visibleToRoleIds}
            onChange={(values) =>
              onChange(
                changeScenarioPack(pack, (draft) => {
                  const target =
                    draft.scenarios[scenarioIndex]
                      ?.instructorIncidents[index];
                  if (target !== undefined) {
                    target.visibleToRoleIds = [...values];
                  }
                }),
              )
            }
          />
          <CheckboxList
            legend={t("scenarioAuthor.builder.incidentEvidence")}
            options={scenario.evidenceItems.map((evidence) => ({
              value: evidence.evidenceId,
              label: evidence.evidenceId,
            }))}
            selected={incident.evidenceIds}
            onChange={(values) =>
              onChange(
                changeScenarioPack(pack, (draft) => {
                  const target =
                    draft.scenarios[scenarioIndex]
                      ?.instructorIncidents[index];
                  if (target !== undefined) {
                    target.evidenceIds = [...values];
                  }
                }),
              )
            }
          />
          <CheckboxList
            legend={t("scenarioAuthor.builder.incidentReleaseNodes")}
            options={scenario.nodes.map((node) => ({
              value: node.nodeId,
              label: node.nodeId,
            }))}
            selected={incident.releaseAtNodeIds}
            onChange={(values) =>
              onChange(
                changeScenarioPack(pack, (draft) => {
                  const target =
                    draft.scenarios[scenarioIndex]
                      ?.instructorIncidents[index];
                  if (target !== undefined) {
                    target.releaseAtNodeIds = [...values];
                  }
                }),
              )
            }
          />
        </article>
      ))}
    </CollectionSection>
  );
}

function CheckboxList({
  legend,
  options,
  selected,
  onChange,
}: {
  readonly legend: string;
  readonly options: readonly Option[];
  readonly selected: readonly string[];
  readonly onChange: (values: readonly string[]) => void;
}): ReactNode {
  return (
    <fieldset className="scenario-builder__choice-group">
      <legend>{legend}</legend>
      {options.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <label key={option.value}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter(
                        (value) => value !== option.value,
                      ),
                )
              }
            />
            <span>{option.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

function seedLocalizedKeys(
  pack: ScenarioPackV1,
  localizationKeys: readonly string[],
): void {
  const mutable = pack as unknown as {
    localizationCatalogs?: Record<string, Record<string, string>>;
    supportedLocales: readonly string[];
  };
  if (mutable.localizationCatalogs === undefined) {
    mutable.localizationCatalogs = {};
  }
  for (const locale of mutable.supportedLocales) {
    const catalog = mutable.localizationCatalogs[locale] ?? {};
    for (const key of localizationKeys) {
      catalog[key] ??= key.split(".").at(-2) ?? key;
    }
    mutable.localizationCatalogs[locale] = catalog;
  }
}

function nodeLocalizationSuffixes(
  type: ScenarioNodeV1["nodeType"],
): readonly string[] {
  switch (type) {
    case "BRIEFING":
      return [".title", ".body"];
    case "DECISION":
      return [
        ".title",
        ".prompt",
        ".field.choice",
        ".option.a",
        ".option.b",
      ];
    case "COMMUNICATION":
    case "CONSEQUENCE":
    case "FEEDBACK":
      return [".title", ".message"];
    case "REFLECTION":
      return [".title", ".prompt"];
    default:
      return [".title"];
  }
}

function WorkflowStep({
  pack,
  scenario,
  scenarioIndex,
  onChange,
}: BuilderStepProps): ReactNode {
  const t = useTranslator();
  const [newNodeType, setNewNodeType] =
    useState<ScenarioNodeV1["nodeType"]>("BRIEFING");
  const [selectedNodeIndex, setSelectedNodeIndex] = useState(0);
  const activeNodeIndex =
    scenario.nodes[selectedNodeIndex] === undefined
      ? Math.max(0, scenario.nodes.length - 1)
      : selectedNodeIndex;
  const activeNode = scenario.nodes[activeNodeIndex];

  function addNode(): void {
    let insertedIndex = scenario.nodes.length;
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target = draft.scenarios[scenarioIndex];
        if (target === undefined) return;
        const localizationPrefix = uniqueLocalizationPrefix(
          draft as unknown as ScenarioPackV1,
          `builder.${target.scenarioId}.node.${newNodeType.toLowerCase()}`,
          nodeLocalizationSuffixes(newNodeType),
        );
        const node = defaultScenarioNode(
          newNodeType,
          target as unknown as ScenarioDefinitionV1,
          localizationPrefix,
        );
        const mutableNode =
          node as unknown as DeepMutable<ScenarioNodeV1>;
        const completionIndex =
          newNodeType === "COMPLETION"
            ? -1
            : target.nodes.findIndex(
                (candidate) => candidate.nodeType === "COMPLETION",
              );
        if (completionIndex < 0) {
          target.nodes.push(
            node as unknown as (typeof target.nodes)[number],
          );
        } else {
          insertedIndex = completionIndex;
          const completion = target.nodes[completionIndex];
          const predecessor = target.nodes[completionIndex - 1];
          if (
            completion !== undefined &&
            predecessor !== undefined &&
            predecessor.transitions.length === 1 &&
            predecessor.transitions[0]?.toNodeId === completion.nodeId
          ) {
            predecessor.transitions[0]!.toNodeId = node.nodeId;
            mutableNode.transitions.push({
              transitionId: uniqueIdentifier(
                node.transitions.map(
                  (transition) => transition.transitionId,
                ),
                "TRANSITION",
              ),
              toNodeId: completion.nodeId,
              when: { kind: "ALWAYS" },
            });
          }
          target.nodes.splice(
            completionIndex,
            0,
            node as unknown as (typeof target.nodes)[number],
          );
        }
        seedNodeLocalizedText(
          draft as unknown as ScenarioPackV1,
          node,
        );
      }),
    );
    setSelectedNodeIndex(insertedIndex);
  }

  return (
    <section aria-labelledby="builder-workflow-heading">
      <h4 id="builder-workflow-heading">
        {t("scenarioAuthor.builder.workflow.heading")}
      </h4>
      <p>{t("scenarioAuthor.builder.workflow.help")}</p>
      <WorkflowMap
        scenario={scenario}
        activeNodeIndex={activeNodeIndex}
        onSelectNode={setSelectedNodeIndex}
      />
      <div className="scenario-builder__add-row">
        <SelectControl
          id="builder-new-node-type"
          label={t("scenarioAuthor.builder.nodeType")}
          value={newNodeType}
          options={NODE_TYPES.map((type) => ({
            value: type,
            label: t(`scenarioAuthor.builder.nodeType.${type}`),
          }))}
          onChange={(value) =>
            setNewNodeType(value as ScenarioNodeV1["nodeType"])
          }
        />
        <button
          className="button button--secondary"
          type="button"
          onClick={addNode}
        >
          {t("scenarioAuthor.builder.addNode")}
        </button>
      </div>
      <SelectControl
        id="builder-active-node"
        label={t("scenarioAuthor.builder.editNode")}
        value={String(activeNodeIndex)}
        options={scenario.nodes.map((node, index) => ({
          value: String(index),
          label: `${node.nodeId} — ${t(
            `scenarioAuthor.builder.nodeType.${node.nodeType}`,
          )}`,
        }))}
        onChange={(value) => setSelectedNodeIndex(Number(value))}
      />
      <div className="scenario-builder__workflow">
        {activeNode === undefined ? null : (
          <NodeEditor
            key={activeNode.title.localizationKey}
            pack={pack}
            scenario={scenario}
            scenarioIndex={scenarioIndex}
            node={activeNode}
            nodeIndex={activeNodeIndex}
            onChange={onChange}
            onMoved={setSelectedNodeIndex}
          />
        )}
      </div>
      <IncidentEditor
        pack={pack}
        scenario={scenario}
        scenarioIndex={scenarioIndex}
        onChange={onChange}
      />
    </section>
  );
}

function WorkflowMap({
  scenario,
  activeNodeIndex,
  onSelectNode,
}: {
  readonly scenario: ScenarioDefinitionV1;
  readonly activeNodeIndex: number;
  readonly onSelectNode: (index: number) => void;
}): ReactNode {
  const t = useTranslator();
  const reachable = reachableNodes(scenario);
  return (
    <section
      className="scenario-builder__workflow-map"
      aria-labelledby="scenario-builder-workflow-map-heading"
    >
      <div>
        <h5 id="scenario-builder-workflow-map-heading">
          {t("scenarioAuthor.builder.workflowMap")}
        </h5>
        <p>{t("scenarioAuthor.builder.workflowMapHelp")}</p>
      </div>
      <ol>
        {scenario.nodes.map((node, index) => (
          <li key={node.title.localizationKey}>
            <div className="scenario-builder__workflow-map-node">
              <code>{node.nodeId}</code>
              <span className="status status--neutral">
                {t(
                  `scenarioAuthor.builder.nodeType.${node.nodeType}`,
                )}
              </span>
              {node.nodeId === scenario.entryNodeId ? (
                <span className="status status--neutral">
                  {t("scenarioAuthor.builder.workflowEntry")}
                </span>
              ) : null}
              <span
                className={
                  reachable.has(node.nodeId)
                    ? "status status--pass"
                    : "status status--warn"
                }
              >
                {reachable.has(node.nodeId)
                  ? t("scenarioAuthor.builder.workflowReachable")
                  : t("scenarioAuthor.builder.workflowDisconnected")}
              </span>
              <button
                className="button button--quiet"
                type="button"
                aria-current={
                  index === activeNodeIndex ? "true" : undefined
                }
                onClick={() => onSelectNode(index)}
              >
                {index === activeNodeIndex
                  ? t("scenarioAuthor.builder.editingNode")
                  : t("scenarioAuthor.builder.editThisNode")}
              </button>
            </div>
            <p>
              {node.transitions.length === 0
                ? t("scenarioAuthor.builder.workflowStops")
                : node.transitions
                    .map(
                      (transition) =>
                        `${node.nodeId} → ${transition.toNodeId}`,
                    )
                    .join("; ")}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function seedNodeLocalizedText(
  pack: ScenarioPackV1,
  node: ScenarioNodeV1,
): void {
  const keys = [node.title.localizationKey];
  switch (node.nodeType) {
    case "BRIEFING":
      keys.push(node.body.localizationKey);
      break;
    case "DECISION":
      keys.push(node.prompt.localizationKey);
      for (const field of node.fields) {
        keys.push(field.prompt.localizationKey);
        keys.push(
          ...field.options.map(
            (option) => option.label.localizationKey,
          ),
        );
      }
      break;
    case "COMMUNICATION":
    case "CONSEQUENCE":
    case "FEEDBACK":
      keys.push(node.message.localizationKey);
      break;
    case "REFLECTION":
      keys.push(node.prompt.localizationKey);
      break;
    default:
      break;
  }
  seedLocalizedKeys(pack, keys);
}

function NodeEditor({
  pack,
  scenario,
  scenarioIndex,
  node,
  nodeIndex,
  onChange,
  onMoved,
}: BuilderStepProps & {
  readonly node: ScenarioNodeV1;
  readonly nodeIndex: number;
  readonly onMoved?: (index: number) => void;
}): ReactNode {
  const t = useTranslator();
  function updateRecord(
    mutation: (record: Record<string, unknown>) => void,
  ): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target =
          draft.scenarios[scenarioIndex]?.nodes[nodeIndex];
        if (target !== undefined) {
          mutation(target as unknown as Record<string, unknown>);
        }
      }),
    );
  }
  function changeType(value: string): void {
    const nextType = value as ScenarioNodeV1["nodeType"];
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target = draft.scenarios[scenarioIndex];
        const current = target?.nodes[nodeIndex];
        if (target === undefined || current === undefined) return;
        const replacement = defaultScenarioNode(
          nextType,
          target as unknown as ScenarioDefinitionV1,
        );
        const retained = {
          ...replacement,
          nodeId: current.nodeId,
          title: current.title,
          transitions: current.transitions,
        };
        target.nodes[nodeIndex] =
          retained as unknown as (typeof target.nodes)[number];
        seedNodeLocalizedText(
          draft as unknown as ScenarioPackV1,
          retained,
        );
      }),
    );
  }
  function move(offset: -1 | 1): void {
    const destination = nodeIndex + offset;
    if (destination < 0 || destination >= scenario.nodes.length) {
      return;
    }
    onChange(
      changeScenarioPack(pack, (draft) => {
        const nodes = draft.scenarios[scenarioIndex]?.nodes;
        if (nodes === undefined) return;
        const [moved] = nodes.splice(nodeIndex, 1);
        if (moved !== undefined) nodes.splice(destination, 0, moved);
      }),
    );
    onMoved?.(destination);
  }
  return (
    <article className="scenario-builder__node">
      <header className="scenario-builder__collection-heading">
        <div>
          <span className="status status--neutral">
            {t(`scenarioAuthor.builder.nodeType.${node.nodeType}`)}
          </span>
          <code>{node.nodeId}</code>
        </div>
        <div className="scenario-builder__compact-actions">
          <button
            className="button button--quiet"
            type="button"
            disabled={nodeIndex === 0}
            aria-label={t("scenarioAuthor.builder.moveUp", {
              id: node.nodeId,
            })}
            onClick={() => move(-1)}
          >
            ↑
          </button>
          <button
            className="button button--quiet"
            type="button"
            disabled={nodeIndex === scenario.nodes.length - 1}
            aria-label={t("scenarioAuthor.builder.moveDown", {
              id: node.nodeId,
            })}
            onClick={() => move(1)}
          >
            ↓
          </button>
          <button
            className="button button--quiet"
            type="button"
            disabled={
              scenario.nodes.length <= 1 ||
              countExactIdentifierOccurrences(
                scenario,
                node.nodeId,
              ) > 1
            }
            title={
              countExactIdentifierOccurrences(
                scenario,
                node.nodeId,
              ) > 1
                ? t("scenarioAuthor.builder.removeReferenced")
                : undefined
            }
            onClick={() =>
              onChange(
                changeScenarioPack(pack, (draft) => {
                  draft.scenarios[
                    scenarioIndex
                  ]?.nodes.splice(nodeIndex, 1);
                }),
              )
            }
          >
            {t("scenarioAuthor.builder.remove")}
          </button>
        </div>
      </header>
      <ReferenceHint
        references={nodeDependents(scenario, node.nodeId)}
      />
      <div className="instructor-review__form-grid">
        <TextControl
          id={`node-id-${String(nodeIndex)}`}
          label={t("scenarioAuthor.builder.nodeId")}
          value={node.nodeId}
          onChange={(value) =>
            updateRecord((record) => {
              record.nodeId = value;
            })
          }
        />
        <SelectControl
          id={`node-type-${String(nodeIndex)}`}
          label={t("scenarioAuthor.builder.nodeType")}
          value={node.nodeType}
          options={NODE_TYPES.map((type) => ({
            value: type,
            label: t(`scenarioAuthor.builder.nodeType.${type}`),
          }))}
          onChange={changeType}
        />
      </div>
      <LocalizedTextControl
        heading={t("scenarioAuthor.builder.nodeTitle")}
        pack={pack}
        localizationKey={node.title.localizationKey}
        onChange={onChange}
      />
      <NodeSpecificEditor
        pack={pack}
        scenario={scenario}
        scenarioIndex={scenarioIndex}
        node={node}
        nodeIndex={nodeIndex}
        onChange={onChange}
      />
      <TransitionEditor
        pack={pack}
        scenario={scenario}
        scenarioIndex={scenarioIndex}
        node={node}
        nodeIndex={nodeIndex}
        onChange={onChange}
      />
    </article>
  );
}

function NodeSpecificEditor(
  props: BuilderStepProps & {
    readonly node: ScenarioNodeV1;
    readonly nodeIndex: number;
  },
): ReactNode {
  const { pack, scenario, scenarioIndex, node, nodeIndex, onChange } =
    props;
  const t = useTranslator();
  function updateRecord(
    mutation: (record: Record<string, unknown>) => void,
  ): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target =
          draft.scenarios[scenarioIndex]?.nodes[nodeIndex];
        if (target !== undefined) {
          mutation(target as unknown as Record<string, unknown>);
        }
      }),
    );
  }
  switch (node.nodeType) {
    case "BRIEFING":
      return (
        <LocalizedTextControl
          heading={t("scenarioAuthor.builder.briefingBody")}
          pack={pack}
          localizationKey={node.body.localizationKey}
          multiline
          onChange={onChange}
        />
      );
    case "EVIDENCE_RELEASE":
      return (
        <CheckboxList
          legend={t("scenarioAuthor.builder.releasedEvidence")}
          options={scenario.evidenceItems.map((evidence) => ({
            value: evidence.evidenceId,
            label: evidence.evidenceId,
          }))}
          selected={node.evidenceIds}
          onChange={(values) =>
            updateRecord((record) => {
              record.evidenceIds = [...values];
            })
          }
        />
      );
    case "DECISION":
      return <DecisionEditor {...props} node={node} />;
    case "TRANSACTION_PROPOSAL":
      return (
        <>
          <div className="instructor-review__form-grid">
            <TextControl
              id={`proposal-type-${String(nodeIndex)}`}
              label={t("scenarioAuthor.builder.proposalType")}
              value={node.proposalType}
              onChange={(value) =>
                updateRecord((record) => {
                  record.proposalType = value;
                })
              }
            />
            <SelectControl
              id={`proposal-decision-${String(nodeIndex)}`}
              label={t("scenarioAuthor.builder.sourceDecision")}
              value={node.sourceDecisionId}
              options={[
                {
                  value: "",
                  label: t("scenarioAuthor.builder.selectOne"),
                },
                ...scenario.nodes.flatMap((candidate) =>
                  candidate.nodeType === "DECISION"
                    ? [
                        {
                          value: candidate.decisionId,
                          label: candidate.decisionId,
                        },
                      ]
                    : [],
                ),
              ]}
              onChange={(value) =>
                updateRecord((record) => {
                  record.sourceDecisionId = value;
                })
              }
            />
          </div>
          <CheckboxList
            legend={t("scenarioAuthor.builder.appliedPolicies")}
            options={scenario.policies.map((policy) => ({
              value: policy.policyId,
              label: policy.policyId,
            }))}
            selected={node.policyIds}
            onChange={(values) =>
              updateRecord((record) => {
                record.policyIds = [...values];
              })
            }
          />
        </>
      );
    case "ENDORSEMENT":
      return (
        <>
          <div className="instructor-review__form-grid">
            <SelectControl
              id={`endorsement-proposal-${String(nodeIndex)}`}
              label={t("scenarioAuthor.builder.proposalNode")}
              value={node.proposalNodeId}
              options={proposalNodeOptions(scenario, t(
                "scenarioAuthor.builder.selectOne",
              ))}
              onChange={(value) =>
                updateRecord((record) => {
                  record.proposalNodeId = value;
                })
              }
            />
            <SelectControl
              id={`endorsement-policy-${String(nodeIndex)}`}
              label={t("scenarioAuthor.builder.policy")}
              value={node.policyId}
              options={policyOptions(scenario, t(
                "scenarioAuthor.builder.selectOne",
              ))}
              onChange={(value) =>
                updateRecord((record) => {
                  record.policyId = value;
                })
              }
            />
          </div>
          <CheckboxList
            legend={t("scenarioAuthor.builder.permittedRoles")}
            options={scenario.roles.map((role) => ({
              value: role.roleId,
              label: role.roleId,
            }))}
            selected={node.permittedRoleIds}
            onChange={(values) =>
              updateRecord((record) => {
                record.permittedRoleIds = [...values];
              })
            }
          />
        </>
      );
    case "POLICY_CHECK":
      return (
        <div className="instructor-review__form-grid">
          <SelectControl
            id={`policy-check-policy-${String(nodeIndex)}`}
            label={t("scenarioAuthor.builder.policy")}
            value={node.policyId}
            options={policyOptions(scenario, t(
              "scenarioAuthor.builder.selectOne",
            ))}
            onChange={(value) =>
              updateRecord((record) => {
                record.policyId = value;
              })
            }
          />
          <SelectControl
            id={`policy-check-proposal-${String(nodeIndex)}`}
            label={t("scenarioAuthor.builder.proposalNode")}
            value={node.proposalNodeId}
            options={proposalNodeOptions(scenario, t(
              "scenarioAuthor.builder.selectOne",
            ))}
            onChange={(value) =>
              updateRecord((record) => {
                record.proposalNodeId = value;
              })
            }
          />
        </div>
      );
    case "COMMUNICATION":
      return (
        <>
          <TextControl
            id={`message-id-${String(nodeIndex)}`}
            label={t("scenarioAuthor.builder.messageId")}
            value={node.messageId}
            onChange={(value) =>
              updateRecord((record) => {
                record.messageId = value;
              })
            }
          />
          <LocalizedTextControl
            heading={t("scenarioAuthor.builder.message")}
            pack={pack}
            localizationKey={node.message.localizationKey}
            multiline
            onChange={onChange}
          />
          <CheckboxList
            legend={t("scenarioAuthor.builder.visibleRoles")}
            options={scenario.roles.map((role) => ({
              value: role.roleId,
              label: role.roleId,
            }))}
            selected={node.visibleToRoleIds}
            onChange={(values) =>
              updateRecord((record) => {
                record.visibleToRoleIds = [...values];
              })
            }
          />
        </>
      );
    case "STOCHASTIC_EVENT":
      return (
        <>
          <TextControl
            id={`stochastic-stream-${String(nodeIndex)}`}
            label={t("scenarioAuthor.builder.randomStream")}
            value={node.randomStreamId}
            onChange={(value) =>
              updateRecord((record) => {
                record.randomStreamId = value;
              })
            }
          />
          <JsonValueEditor
            idPrefix={`stochastic-outcomes-${String(nodeIndex)}`}
            label={t("scenarioAuthor.builder.weightedOutcomes")}
            value={node.outcomes as unknown as JsonValue}
            onChange={(value) =>
              updateRecord((record) => {
                if (Array.isArray(value)) {
                  record.outcomes = value;
                }
              })
            }
          />
        </>
      );
    case "CONSEQUENCE":
      return (
        <>
          <TextControl
            id={`consequence-code-${String(nodeIndex)}`}
            label={t("scenarioAuthor.builder.consequenceCode")}
            value={node.consequenceCode}
            onChange={(value) =>
              updateRecord((record) => {
                record.consequenceCode = value;
              })
            }
          />
          <LocalizedTextControl
            heading={t("scenarioAuthor.builder.message")}
            pack={pack}
            localizationKey={node.message.localizationKey}
            multiline
            onChange={onChange}
          />
        </>
      );
    case "FEEDBACK":
      return (
        <>
          <TextControl
            id={`feedback-code-${String(nodeIndex)}`}
            label={t("scenarioAuthor.builder.feedbackCode")}
            value={node.feedbackCode}
            onChange={(value) =>
              updateRecord((record) => {
                record.feedbackCode = value;
              })
            }
          />
          <LocalizedTextControl
            heading={t("scenarioAuthor.builder.message")}
            pack={pack}
            localizationKey={node.message.localizationKey}
            multiline
            onChange={onChange}
          />
        </>
      );
    case "REFLECTION":
      return (
        <>
          <div className="instructor-review__form-grid">
            <TextControl
              id={`reflection-id-${String(nodeIndex)}`}
              label={t("scenarioAuthor.builder.reflectionId")}
              value={node.reflectionId}
              onChange={(value) =>
                updateRecord((record) => {
                  record.reflectionId = value;
                })
              }
            />
            <NumberControl
              id={`reflection-limit-${String(nodeIndex)}`}
              label={t("scenarioAuthor.builder.maximumLength")}
              value={node.maximumLength}
              minimum={1}
              maximum={10_000}
              onChange={(value) =>
                updateRecord((record) => {
                  record.maximumLength = value;
                })
              }
            />
          </div>
          <LocalizedTextControl
            heading={t("scenarioAuthor.builder.reflectionPrompt")}
            pack={pack}
            localizationKey={node.prompt.localizationKey}
            multiline
            onChange={onChange}
          />
        </>
      );
    case "COMPLETION":
      return (
        <TextControl
          id={`completion-outcome-${String(nodeIndex)}`}
          label={t("scenarioAuthor.builder.completionOutcome")}
          value={node.outcomeCode}
          onChange={(value) =>
            updateRecord((record) => {
              record.outcomeCode = value;
            })
          }
        />
      );
  }
}

function proposalNodeOptions(
  scenario: ScenarioDefinitionV1,
  emptyLabel: string,
): readonly Option[] {
  return [
    { value: "", label: emptyLabel },
    ...scenario.nodes
      .filter(
        (node) => node.nodeType === "TRANSACTION_PROPOSAL",
      )
      .map((node) => ({
        value: node.nodeId,
        label: node.nodeId,
      })),
  ];
}

function policyOptions(
  scenario: ScenarioDefinitionV1,
  emptyLabel: string,
): readonly Option[] {
  return [
    { value: "", label: emptyLabel },
    ...scenario.policies.map((policy) => ({
      value: policy.policyId,
      label: policy.policyId,
    })),
  ];
}

function DecisionEditor({
  pack,
  scenario,
  scenarioIndex,
  node,
  nodeIndex,
  onChange,
}: BuilderStepProps & {
  readonly node: DecisionNodeV1;
  readonly nodeIndex: number;
}): ReactNode {
  const t = useTranslator();
  function update(
    mutation: (target: {
      decisionId: string;
      fields: {
        fieldId: string;
        selection: "single" | "multiple";
        prompt: { localizationKey: string };
        options: {
          optionId: string;
          label: { localizationKey: string };
          authoredValue: JsonValue;
          professionalConsequenceEffects?: Record<string, number>;
        }[];
      }[];
      justification?: {
        required: boolean;
        maximumLength: number;
      };
    }) => void,
  ): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target =
          draft.scenarios[scenarioIndex]?.nodes[nodeIndex];
        if (target?.nodeType === "DECISION") {
          mutation(target as unknown as Parameters<typeof mutation>[0]);
        }
      }),
    );
  }
  function addFieldAtomic(): void {
    const fieldId = uniqueIdentifier(
      node.fields.map((field) => field.fieldId),
      "FIELD_NEW",
    );
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target =
          draft.scenarios[scenarioIndex]?.nodes[nodeIndex];
        if (target?.nodeType !== "DECISION") return;
        const key = uniqueLocalizationPrefix(
          draft as unknown as ScenarioPackV1,
          `builder.${scenario.scenarioId}.${node.nodeId}.field`,
          [".prompt", ".option.a"],
        );
        target.fields.push({
          fieldId,
          selection: "single",
          prompt: { localizationKey: `${key}.prompt` },
          options: [
            {
              optionId: "OPTION_A",
              label: {
                localizationKey: `${key}.option.a`,
              },
              authoredValue: "OPTION_A",
            },
          ],
        });
        seedLocalizedKeys(
          draft as unknown as ScenarioPackV1,
          [`${key}.prompt`, `${key}.option.a`],
        );
      }),
    );
  }
  return (
    <section className="scenario-builder__subsection">
      <div className="instructor-review__form-grid">
        <TextControl
          id={`decision-id-${String(nodeIndex)}`}
          label={t("scenarioAuthor.builder.decisionId")}
          value={node.decisionId}
          onChange={(value) =>
            update((target) => {
              target.decisionId = value;
            })
          }
        />
        <ToggleControl
          label={t("scenarioAuthor.builder.requireJustification")}
          checked={node.justification?.required ?? false}
          onChange={(checked) =>
            update((target) => {
              target.justification = {
                required: checked,
                maximumLength:
                  target.justification?.maximumLength ?? 500,
              };
            })
          }
        />
        <NumberControl
          id={`decision-justification-limit-${String(nodeIndex)}`}
          label={t("scenarioAuthor.builder.maximumLength")}
          value={node.justification?.maximumLength ?? 500}
          minimum={1}
          maximum={10_000}
          onChange={(value) =>
            update((target) => {
              target.justification = {
                required: target.justification?.required ?? false,
                maximumLength: value,
              };
            })
          }
        />
      </div>
      <LocalizedTextControl
        heading={t("scenarioAuthor.builder.decisionPrompt")}
        pack={pack}
        localizationKey={node.prompt.localizationKey}
        multiline
        onChange={onChange}
      />
      <CollectionSection
        heading={t("scenarioAuthor.builder.decisionFields")}
        help={t("scenarioAuthor.builder.decisionFieldsHelp")}
        addLabel={t("scenarioAuthor.builder.addDecisionField")}
        onAdd={addFieldAtomic}
      >
        {node.fields.map((field, fieldIndex) => (
          <article
            className="scenario-builder__collection-card"
            key={field.prompt.localizationKey}
          >
            <div className="scenario-builder__collection-heading">
              <code>{field.fieldId}</code>
              <button
                className="button button--quiet"
                type="button"
                disabled={node.fields.length <= 1}
                onClick={() =>
                  update((target) => {
                    target.fields.splice(fieldIndex, 1);
                  })
                }
              >
                {t("scenarioAuthor.builder.remove")}
              </button>
            </div>
            <div className="instructor-review__form-grid">
              <TextControl
                id={`decision-field-id-${String(nodeIndex)}-${String(fieldIndex)}`}
                label={t("scenarioAuthor.builder.fieldId")}
                value={field.fieldId}
                onChange={(value) =>
                  update((target) => {
                    const selected = target.fields[fieldIndex];
                    if (selected !== undefined) {
                      selected.fieldId = value;
                    }
                  })
                }
              />
              <SelectControl
                id={`decision-selection-${String(nodeIndex)}-${String(fieldIndex)}`}
                label={t("scenarioAuthor.builder.selection")}
                value={field.selection}
                options={[
                  {
                    value: "single",
                    label: t(
                      "scenarioAuthor.builder.selection.single",
                    ),
                  },
                  {
                    value: "multiple",
                    label: t(
                      "scenarioAuthor.builder.selection.multiple",
                    ),
                  },
                ]}
                onChange={(value) =>
                  update((target) => {
                    const selected = target.fields[fieldIndex];
                    if (selected !== undefined) {
                      selected.selection = value as
                        | "single"
                        | "multiple";
                    }
                  })
                }
              />
            </div>
            <LocalizedTextControl
              heading={t("scenarioAuthor.builder.fieldPrompt")}
              pack={pack}
              localizationKey={field.prompt.localizationKey}
              onChange={onChange}
            />
            <div className="scenario-builder__section-heading">
              <h6>{t("scenarioAuthor.builder.options")}</h6>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  const optionId = uniqueIdentifier(
                    field.options.map(
                      (option) => option.optionId,
                    ),
                    "OPTION_NEW",
                  );
                  onChange(
                    changeScenarioPack(pack, (draft) => {
                      const target =
                        draft.scenarios[scenarioIndex]?.nodes[
                          nodeIndex
                        ];
                      if (target?.nodeType !== "DECISION") {
                        return;
                      }
                      const key = uniqueLocalizationPrefix(
                        draft as unknown as ScenarioPackV1,
                        `builder.${scenario.scenarioId}.${node.nodeId}.${field.fieldId}.option`,
                        [".label"],
                      );
                      target.fields[fieldIndex]?.options.push({
                        optionId,
                        label: {
                          localizationKey: `${key}.label`,
                        },
                        authoredValue: optionId,
                      });
                      seedLocalizedKeys(
                        draft as unknown as ScenarioPackV1,
                        [`${key}.label`],
                      );
                    }),
                  );
                }}
              >
                {t("scenarioAuthor.builder.addOption")}
              </button>
            </div>
            {field.options.map((option, optionIndex) => (
              <div
                className="scenario-builder__nested-card"
                key={option.label.localizationKey}
              >
                <div className="instructor-review__form-grid">
                  <TextControl
                    id={`decision-option-id-${String(nodeIndex)}-${String(fieldIndex)}-${String(optionIndex)}`}
                    label={t("scenarioAuthor.builder.optionId")}
                    value={option.optionId}
                    onChange={(value) =>
                      update((target) => {
                        const selected =
                          target.fields[fieldIndex]?.options[
                            optionIndex
                          ];
                        if (selected !== undefined) {
                          selected.optionId = value;
                        }
                      })
                    }
                  />
                  <TextControl
                    id={`decision-authored-value-${String(nodeIndex)}-${String(fieldIndex)}-${String(optionIndex)}`}
                    label={t(
                      "scenarioAuthor.builder.authoredValue",
                    )}
                    value={String(option.authoredValue)}
                    onChange={(value) =>
                      update((target) => {
                        const selected =
                          target.fields[fieldIndex]?.options[
                            optionIndex
                          ];
                        if (selected !== undefined) {
                          selected.authoredValue = value;
                        }
                      })
                    }
                  />
                </div>
                <LocalizedTextControl
                  heading={t("scenarioAuthor.builder.optionLabel")}
                  pack={pack}
                  localizationKey={option.label.localizationKey}
                  onChange={onChange}
                />
                <button
                  className="button button--quiet"
                  type="button"
                  disabled={field.options.length <= 1}
                  onClick={() =>
                    update((target) => {
                      target.fields[fieldIndex]?.options.splice(
                        optionIndex,
                        1,
                      );
                    })
                  }
                >
                  {t("scenarioAuthor.builder.removeOption")}
                </button>
              </div>
            ))}
          </article>
        ))}
      </CollectionSection>
    </section>
  );
}

function TransitionEditor({
  pack,
  scenario,
  scenarioIndex,
  node,
  nodeIndex,
  onChange,
}: BuilderStepProps & {
  readonly node: ScenarioNodeV1;
  readonly nodeIndex: number;
}): ReactNode {
  const t = useTranslator();
  return (
    <section className="scenario-builder__transitions">
      <div className="scenario-builder__section-heading">
        <div>
          <h6>{t("scenarioAuthor.builder.transitions")}</h6>
          <p>{t("scenarioAuthor.builder.transitionsHelp")}</p>
        </div>
        <button
          className="button button--secondary"
          type="button"
          disabled={node.nodeType === "COMPLETION"}
          onClick={() =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                const nodes =
                  draft.scenarios[scenarioIndex]?.nodes;
                const target = nodes?.[nodeIndex];
                if (target === undefined) return;
                const destination = nodes?.[nodeIndex + 1];
                target.transitions.push({
                  transitionId: uniqueIdentifier(
                    target.transitions.map(
                      (transition) => transition.transitionId,
                    ),
                    "TRANSITION",
                  ),
                  toNodeId: destination?.nodeId ?? "",
                  when: { kind: "ALWAYS" },
                });
              }),
            )
          }
        >
          {t("scenarioAuthor.builder.addTransition")}
        </button>
      </div>
      {node.transitions.length === 0 ? (
        <p className="field__hint">
          {t(
            node.nodeType === "COMPLETION"
              ? "scenarioAuthor.builder.noTransitionsTerminal"
              : "scenarioAuthor.builder.noTransitionsPending",
          )}
        </p>
      ) : null}
      {node.transitions.map((transition, transitionIndex) => (
        <div
          className="scenario-builder__nested-card"
          key={`transition-${String(transitionIndex)}`}
        >
          <div className="instructor-review__form-grid">
            <TextControl
              id={`transition-id-${String(nodeIndex)}-${String(transitionIndex)}`}
              label={t("scenarioAuthor.builder.transitionId")}
              value={transition.transitionId}
              onChange={(value) =>
                updateTransition(pack, onChange, {
                  scenarioIndex,
                  nodeIndex,
                  transitionIndex,
                  mutation(record) {
                    record.transitionId = value;
                  },
                })
              }
            />
            <SelectControl
              id={`transition-target-${String(nodeIndex)}-${String(transitionIndex)}`}
              label={t("scenarioAuthor.builder.transitionTarget")}
              value={transition.toNodeId}
              options={[
                {
                  value: "",
                  label: t("scenarioAuthor.builder.selectOne"),
                },
                ...scenario.nodes
                  .filter(
                    (candidate) => candidate.nodeId.length > 0,
                  )
                  .map((candidate) => ({
                    value: candidate.nodeId,
                    label: candidate.nodeId,
                  })),
              ]}
              onChange={(value) =>
                updateTransition(pack, onChange, {
                  scenarioIndex,
                  nodeIndex,
                  transitionIndex,
                  mutation(record) {
                    record.toNodeId = value;
                  },
                })
              }
            />
            <SelectControl
              id={`transition-kind-${String(nodeIndex)}-${String(transitionIndex)}`}
              label={t("scenarioAuthor.builder.transitionCondition")}
              value={transition.when.kind}
              options={[
                "ALWAYS",
                "DECISION_OPTION_SELECTED",
                "POLICY_RESULT",
                "EVENT_OCCURRED",
              ].map((value) => ({
                value,
                label: t(
                  `scenarioAuthor.builder.transitionCondition.${value}`,
                ),
              }))}
              onChange={(value) =>
                updateTransition(pack, onChange, {
                  scenarioIndex,
                  nodeIndex,
                  transitionIndex,
                  mutation(record) {
                    record.when =
                      value === "DECISION_OPTION_SELECTED"
                        ? {
                            kind: value,
                            decisionId: "",
                            optionId: "",
                          }
                        : value === "POLICY_RESULT"
                          ? {
                              kind: value,
                              policyId: "",
                              outcome: "pass",
                            }
                          : value === "EVENT_OCCURRED"
                            ? {
                                kind: value,
                                eventType: "",
                              }
                            : { kind: "ALWAYS" };
                  },
                })
              }
            />
          </div>
          <TransitionConditionFields
            pack={pack}
            scenario={scenario}
            scenarioIndex={scenarioIndex}
            nodeIndex={nodeIndex}
            transitionIndex={transitionIndex}
            transition={transition}
            onChange={onChange}
          />
          <button
            className="button button--quiet"
            type="button"
            onClick={() =>
              onChange(
                changeScenarioPack(pack, (draft) => {
                  draft.scenarios[scenarioIndex]?.nodes[
                    nodeIndex
                  ]?.transitions.splice(transitionIndex, 1);
                }),
              )
            }
          >
            {t("scenarioAuthor.builder.removeTransition")}
          </button>
        </div>
      ))}
    </section>
  );
}

function updateTransition(
  pack: ScenarioPackV1,
  onChange: (pack: ScenarioPackV1) => void,
  options: {
    readonly scenarioIndex: number;
    readonly nodeIndex: number;
    readonly transitionIndex: number;
    readonly mutation: (record: Record<string, unknown>) => void;
  },
): void {
  onChange(
    changeScenarioPack(pack, (draft) => {
      const transition =
        draft.scenarios[options.scenarioIndex]?.nodes[
          options.nodeIndex
        ]?.transitions[options.transitionIndex];
      if (transition !== undefined) {
        options.mutation(
          transition as unknown as Record<string, unknown>,
        );
      }
    }),
  );
}

function TransitionConditionFields({
  pack,
  scenario,
  scenarioIndex,
  nodeIndex,
  transitionIndex,
  transition,
  onChange,
}: BuilderStepProps & {
  readonly nodeIndex: number;
  readonly transitionIndex: number;
  readonly transition: ScenarioNodeV1["transitions"][number];
}): ReactNode {
  const t = useTranslator();
  const when = transition.when;
  if (when.kind === "ALWAYS") return null;
  if (when.kind === "DECISION_OPTION_SELECTED") {
    const decisions = scenario.nodes.filter(
      (candidate): candidate is DecisionNodeV1 =>
        candidate.nodeType === "DECISION",
    );
    const selected = decisions.find(
      (candidate) => candidate.decisionId === when.decisionId,
    );
    return (
      <div className="instructor-review__form-grid">
        <SelectControl
          id={`transition-decision-${String(nodeIndex)}-${String(transitionIndex)}`}
          label={t("scenarioAuthor.builder.decision")}
          value={when.decisionId}
          options={[
            {
              value: "",
              label: t("scenarioAuthor.builder.selectOne"),
            },
            ...decisions.map((decision) => ({
              value: decision.decisionId,
              label: decision.decisionId,
            })),
          ]}
          onChange={(value) =>
            updateTransition(pack, onChange, {
              scenarioIndex,
              nodeIndex,
              transitionIndex,
              mutation(record) {
                const condition = record.when as Record<
                  string,
                  unknown
                >;
                condition.decisionId = value;
                condition.optionId = "";
              },
            })
          }
        />
        <SelectControl
          id={`transition-option-${String(nodeIndex)}-${String(transitionIndex)}`}
          label={t("scenarioAuthor.builder.option")}
          value={when.optionId}
          options={[
            {
              value: "",
              label: t("scenarioAuthor.builder.selectOne"),
            },
            ...(selected?.fields.flatMap((field) =>
              field.options.map((option) => ({
                value: option.optionId,
                label: option.optionId,
              })),
            ) ?? []),
          ]}
          onChange={(value) =>
            updateTransition(pack, onChange, {
              scenarioIndex,
              nodeIndex,
              transitionIndex,
              mutation(record) {
                (
                  record.when as Record<string, unknown>
                ).optionId = value;
              },
            })
          }
        />
      </div>
    );
  }
  if (when.kind === "POLICY_RESULT") {
    return (
      <div className="instructor-review__form-grid">
        <SelectControl
          id={`transition-policy-${String(nodeIndex)}-${String(transitionIndex)}`}
          label={t("scenarioAuthor.builder.policy")}
          value={when.policyId}
          options={policyOptions(
            scenario,
            t("scenarioAuthor.builder.selectOne"),
          )}
          onChange={(value) =>
            updateTransition(pack, onChange, {
              scenarioIndex,
              nodeIndex,
              transitionIndex,
              mutation(record) {
                (
                  record.when as Record<string, unknown>
                ).policyId = value;
              },
            })
          }
        />
        <SelectControl
          id={`transition-policy-result-${String(nodeIndex)}-${String(transitionIndex)}`}
          label={t("scenarioAuthor.builder.policyResult")}
          value={when.outcome}
          options={[
            {
              value: "pass",
              label: t("scenarioAuthor.builder.pass"),
            },
            {
              value: "fail",
              label: t("scenarioAuthor.builder.fail"),
            },
          ]}
          onChange={(value) =>
            updateTransition(pack, onChange, {
              scenarioIndex,
              nodeIndex,
              transitionIndex,
              mutation(record) {
                (
                  record.when as Record<string, unknown>
                ).outcome = value;
              },
            })
          }
        />
      </div>
    );
  }
  return (
    <TextControl
      id={`transition-event-${String(nodeIndex)}-${String(transitionIndex)}`}
      label={t("scenarioAuthor.builder.eventType")}
      value={when.eventType}
      onChange={(value) =>
        updateTransition(pack, onChange, {
          scenarioIndex,
          nodeIndex,
          transitionIndex,
          mutation(record) {
            (record.when as Record<string, unknown>).eventType =
              value;
          },
        })
      }
    />
  );
}

function AssessmentStep({
  pack,
  scenario,
  scenarioIndex,
  onChange,
}: BuilderStepProps): ReactNode {
  const t = useTranslator();
  return (
    <section aria-labelledby="builder-assessment-heading">
      <h4 id="builder-assessment-heading">
        {t("scenarioAuthor.builder.assessment.heading")}
      </h4>
      <p>{t("scenarioAuthor.builder.assessment.help")}</p>
      <section className="scenario-builder__assessment-section">
        <h5>{t("scenarioAuthor.builder.assessment.useHeading")}</h5>
        <p>{t("scenarioAuthor.builder.assessment.useHelp")}</p>
        <CheckboxList
          legend={t("scenarioAuthor.builder.appliedRubrics")}
          options={pack.rubrics.map((rubric) => ({
            value: rubric.rubricId,
            label: rubric.rubricId,
          }))}
          selected={scenario.rubricIds}
          onChange={(values) =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                const target = draft.scenarios[scenarioIndex];
                if (target !== undefined) {
                  target.rubricIds = [...values];
                }
              }),
            )
          }
        />
        <CheckboxList
          legend={t("scenarioAuthor.builder.appliedEvidenceRules")}
          options={pack.evidenceRules.map((rule) => ({
            value: rule.evidenceRuleId,
            label: rule.evidenceRuleId,
          }))}
          selected={scenario.evidenceRuleIds}
          onChange={(values) =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                const target = draft.scenarios[scenarioIndex];
                if (target !== undefined) {
                  target.evidenceRuleIds = [...values];
                }
              }),
            )
          }
        />
        <CompetencyTargetEditor
          pack={pack}
          scenario={scenario}
          scenarioIndex={scenarioIndex}
          onChange={onChange}
        />
      </section>
      <section className="scenario-builder__assessment-section">
        <h5>
          {t("scenarioAuthor.builder.assessment.frameworkHeading")}
        </h5>
        <p>{t("scenarioAuthor.builder.assessment.frameworkHelp")}</p>
        <CompetencyFrameworkEditor
          pack={pack}
          onChange={onChange}
        />
      </section>
      <section className="scenario-builder__assessment-section">
        <h5>{t("scenarioAuthor.builder.assessment.rubricHeading")}</h5>
        <p>{t("scenarioAuthor.builder.assessment.rubricHelp")}</p>
        <RubricEditor
          pack={pack}
          onChange={onChange}
        />
      </section>
      <section className="scenario-builder__assessment-section">
        <h5>{t("scenarioAuthor.builder.assessment.rulesHeading")}</h5>
        <p>{t("scenarioAuthor.builder.assessment.rulesHelp")}</p>
        <EvidenceRuleEditor
          pack={pack}
          onChange={onChange}
        />
      </section>
    </section>
  );
}

function competencyDefinitions(
  pack: ScenarioPackV1,
): readonly CompetencyDefinitionV1[] {
  return pack.competencyFrameworks.flatMap(
    (framework) => framework.competencies,
  );
}

function indicatorDefinitions(
  pack: ScenarioPackV1,
): readonly PerformanceIndicatorV1[] {
  return competencyDefinitions(pack).flatMap(
    (competency) => competency.indicators,
  );
}

function CompetencyTargetEditor({
  pack,
  scenario,
  scenarioIndex,
  onChange,
}: BuilderStepProps): ReactNode {
  const t = useTranslator();
  const competencies = competencyDefinitions(pack);
  function update(
    targetIndex: number,
    mutation: (target: DeepMutable<CompetencyTargetV1>) => void,
  ): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target =
          draft.scenarios[scenarioIndex]?.competencyTargets[
            targetIndex
          ];
        if (target !== undefined) mutation(target);
      }),
    );
  }
  return (
    <CollectionSection
      heading={t("scenarioAuthor.builder.competencyTargets")}
      help={t("scenarioAuthor.builder.competencyTargetsHelp")}
      addLabel={t("scenarioAuthor.builder.addCompetencyTarget")}
      addDisabled={competencies.length === 0}
      onAdd={() =>
        onChange(
          changeScenarioPack(pack, (draft) => {
            const target = draft.scenarios[scenarioIndex];
            const competency =
              draft.competencyFrameworks[0]?.competencies[0];
            if (target === undefined || competency === undefined) {
              return;
            }
            target.competencyTargets.push({
              competencyId: competency.competencyId,
              indicatorIds: competency.indicators
                .slice(0, 1)
                .map((indicator) => indicator.indicatorId),
              targetType: "primary",
            });
          }),
        )
      }
    >
      {scenario.competencyTargets.map((target, targetIndex) => {
        const competency =
          competencies.find(
            (candidate) =>
              candidate.competencyId === target.competencyId,
          ) ?? competencies[0];
        return (
          <article
            className="scenario-builder__collection-card"
            key={`competency-target-${String(targetIndex)}`}
          >
            <div className="scenario-builder__collection-heading">
              <code>{target.competencyId}</code>
              <button
                className="button button--quiet"
                type="button"
                disabled={scenario.competencyTargets.length <= 1}
                onClick={() =>
                  onChange(
                    changeScenarioPack(pack, (draft) => {
                      draft.scenarios[
                        scenarioIndex
                      ]?.competencyTargets.splice(targetIndex, 1);
                    }),
                  )
                }
              >
                {t("scenarioAuthor.builder.remove")}
              </button>
            </div>
            <div className="instructor-review__form-grid">
              <SelectControl
                id={`competency-target-id-${String(targetIndex)}`}
                label={t("scenarioAuthor.builder.competency")}
                value={target.competencyId}
                options={competencies.map((candidate) => ({
                  value: candidate.competencyId,
                  label: candidate.competencyId,
                }))}
                onChange={(value) =>
                  update(targetIndex, (mutable) => {
                    mutable.competencyId = value;
                    const selected = competencies.find(
                      (candidate) =>
                        candidate.competencyId === value,
                    );
                    mutable.indicatorIds =
                      selected?.indicators
                        .slice(0, 1)
                        .map((indicator) => indicator.indicatorId) ??
                      [];
                  })
                }
              />
              <SelectControl
                id={`competency-target-type-${String(targetIndex)}`}
                label={t("scenarioAuthor.builder.targetType")}
                value={target.targetType}
                options={[
                  "primary",
                  "supporting",
                  "contextual",
                ].map((value) => ({
                  value,
                  label: t(
                    `scenarioAuthor.builder.targetType.${value}`,
                  ),
                }))}
                onChange={(value) =>
                  update(targetIndex, (mutable) => {
                    mutable.targetType =
                      value as CompetencyTargetV1["targetType"];
                  })
                }
              />
            </div>
            <CheckboxList
              legend={t("scenarioAuthor.builder.targetIndicators")}
              options={(competency?.indicators ?? []).map(
                (indicator) => ({
                  value: indicator.indicatorId,
                  label: indicator.indicatorId,
                }),
              )}
              selected={target.indicatorIds}
              onChange={(values) =>
                update(targetIndex, (mutable) => {
                  mutable.indicatorIds = [...values];
                })
              }
            />
          </article>
        );
      })}
    </CollectionSection>
  );
}

function CompetencyFrameworkEditor({
  pack,
  onChange,
}: {
  readonly pack: ScenarioPackV1;
  readonly onChange: (pack: ScenarioPackV1) => void;
}): ReactNode {
  const t = useTranslator();
  function updateFramework(
    frameworkIndex: number,
    mutation: (
      framework: DeepMutable<CompetencyFrameworkV1>,
    ) => void,
  ): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const framework = draft.competencyFrameworks[frameworkIndex];
        if (framework !== undefined) mutation(framework);
      }),
    );
  }
  function addFramework(): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const frameworkId = uniqueIdentifier(
          draft.competencyFrameworks.map(
            (framework) => framework.frameworkId,
          ),
          "FRAMEWORK_NEW",
        );
        const competencyId = uniqueIdentifier(
          draft.competencyFrameworks.flatMap((framework) =>
            framework.competencies.map(
              (competency) => competency.competencyId,
            ),
          ),
          "COMPETENCY_NEW",
        );
        const key = uniqueLocalizationPrefix(
          draft as unknown as ScenarioPackV1,
          `builder.${frameworkId.toLowerCase()}`,
          [
            ".title",
            ".competency.title",
            ".competency.description",
            ".indicator.statement",
          ],
        );
        draft.competencyFrameworks.push({
          schemaVersion: "1.0.0",
          frameworkId,
          version: "1.0.0",
          status: "draft",
          title: { localizationKey: `${key}.title` },
          competencies: [
            {
              competencyId,
              version: "1.0.0",
              title: {
                localizationKey: `${key}.competency.title`,
              },
              description: {
                localizationKey: `${key}.competency.description`,
              },
              indicators: [
                {
                  indicatorId: `${competencyId}.PI1`,
                  version: "1.0.0",
                  statement: {
                    localizationKey: `${key}.indicator.statement`,
                  },
                },
              ],
            },
          ],
        });
        seedLocalizedKeys(
          draft as unknown as ScenarioPackV1,
          [
            `${key}.title`,
            `${key}.competency.title`,
            `${key}.competency.description`,
            `${key}.indicator.statement`,
          ],
        );
      }),
    );
  }
  return (
    <CollectionSection
      heading={t("scenarioAuthor.builder.competencyFrameworks")}
      help={t("scenarioAuthor.builder.frameworkEditorHelp")}
      addLabel={t("scenarioAuthor.builder.addFramework")}
      onAdd={addFramework}
    >
      {pack.competencyFrameworks.map(
        (framework, frameworkIndex) => (
          <article
            className="scenario-builder__collection-card"
            key={framework.title.localizationKey}
          >
            <div className="scenario-builder__collection-heading">
              <code>{framework.frameworkId}</code>
              <button
                className="button button--quiet"
                type="button"
                disabled={
                  pack.competencyFrameworks.length <= 1 ||
                  countExactIdentifierOccurrences(
                    pack,
                    framework.frameworkId,
                  ) > 1
                }
                onClick={() =>
                  onChange(
                    changeScenarioPack(pack, (draft) => {
                      draft.competencyFrameworks.splice(
                        frameworkIndex,
                        1,
                      );
                    }),
                  )
                }
              >
                {t("scenarioAuthor.builder.remove")}
              </button>
            </div>
            <div className="instructor-review__form-grid">
              <TextControl
                id={`framework-id-${String(frameworkIndex)}`}
                label={t(
                  "scenarioAuthor.builder.schemaField.frameworkId",
                )}
                value={framework.frameworkId}
                onChange={(value) =>
                  updateFramework(frameworkIndex, (mutable) => {
                    mutable.frameworkId = value;
                  })
                }
              />
              <TextControl
                id={`framework-version-${String(frameworkIndex)}`}
                label={t("scenarioAuthor.builder.version")}
                value={framework.version}
                onChange={(value) =>
                  updateFramework(frameworkIndex, (mutable) => {
                    mutable.version = value;
                  })
                }
              />
              <SelectControl
                id={`framework-status-${String(frameworkIndex)}`}
                label={t("scenarioAuthor.builder.lifecycleStatus")}
                value={framework.status}
                options={[
                  "draft",
                  "validated",
                  "published",
                  "retired",
                ].map((value) => ({
                  value,
                  label: t(`scenarioAuthor.status.${value}`),
                }))}
                onChange={(value) =>
                  updateFramework(frameworkIndex, (mutable) => {
                    mutable.status =
                      value as CompetencyFrameworkV1["status"];
                  })
                }
              />
            </div>
            <LocalizedTextControl
              heading={t("scenarioAuthor.builder.frameworkTitle")}
              pack={pack}
              localizationKey={framework.title.localizationKey}
              onChange={onChange}
            />
            <div className="scenario-builder__section-heading">
              <h6>{t("scenarioAuthor.builder.competencies")}</h6>
              <button
                className="button button--secondary"
                type="button"
                onClick={() =>
                  onChange(
                    changeScenarioPack(pack, (draft) => {
                      const selected =
                        draft.competencyFrameworks[frameworkIndex];
                      if (selected === undefined) return;
                      const competencyId = uniqueIdentifier(
                        draft.competencyFrameworks.flatMap(
                          (candidate) =>
                            candidate.competencies.map(
                              (competency) =>
                                competency.competencyId,
                            ),
                        ),
                        "COMPETENCY_NEW",
                      );
                      const key = uniqueLocalizationPrefix(
                        draft as unknown as ScenarioPackV1,
                        `builder.${selected.frameworkId.toLowerCase()}.competency`,
                        [
                          ".title",
                          ".description",
                          ".indicator.statement",
                        ],
                      );
                      selected.competencies.push({
                        competencyId,
                        version: "1.0.0",
                        title: {
                          localizationKey: `${key}.title`,
                        },
                        description: {
                          localizationKey: `${key}.description`,
                        },
                        indicators: [
                          {
                            indicatorId: `${competencyId}.PI1`,
                            version: "1.0.0",
                            statement: {
                              localizationKey:
                                `${key}.indicator.statement`,
                            },
                          },
                        ],
                      });
                      seedLocalizedKeys(
                        draft as unknown as ScenarioPackV1,
                        [
                          `${key}.title`,
                          `${key}.description`,
                          `${key}.indicator.statement`,
                        ],
                      );
                    }),
                  )
                }
              >
                {t("scenarioAuthor.builder.addCompetency")}
              </button>
            </div>
            {framework.competencies.map(
              (competency, competencyIndex) => (
                <CompetencyEditor
                  key={competency.title.localizationKey}
                  pack={pack}
                  frameworkIndex={frameworkIndex}
                  competency={competency}
                  competencyIndex={competencyIndex}
                  onChange={onChange}
                />
              ),
            )}
          </article>
        ),
      )}
    </CollectionSection>
  );
}

function CompetencyEditor({
  pack,
  frameworkIndex,
  competency,
  competencyIndex,
  onChange,
}: {
  readonly pack: ScenarioPackV1;
  readonly frameworkIndex: number;
  readonly competency: CompetencyDefinitionV1;
  readonly competencyIndex: number;
  readonly onChange: (pack: ScenarioPackV1) => void;
}): ReactNode {
  const t = useTranslator();
  function update(
    mutation: (
      competency: DeepMutable<CompetencyDefinitionV1>,
    ) => void,
  ): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target =
          draft.competencyFrameworks[frameworkIndex]?.competencies[
            competencyIndex
          ];
        if (target !== undefined) mutation(target);
      }),
    );
  }
  return (
    <section className="scenario-builder__nested-card">
      <div className="scenario-builder__collection-heading">
        <code>{competency.competencyId}</code>
        <button
          className="button button--quiet"
          type="button"
          disabled={
            (pack.competencyFrameworks[frameworkIndex]?.competencies
              .length ?? 0) <= 1 ||
            countExactIdentifierOccurrences(
              pack,
              competency.competencyId,
            ) > 1
          }
          onClick={() =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                draft.competencyFrameworks[
                  frameworkIndex
                ]?.competencies.splice(competencyIndex, 1);
              }),
            )
          }
        >
          {t("scenarioAuthor.builder.remove")}
        </button>
      </div>
      <ReferenceHint
        references={competencyDependents(
          pack,
          competency.competencyId,
        )}
      />
      <div className="instructor-review__form-grid">
        <TextControl
          id={`competency-id-${String(frameworkIndex)}-${String(competencyIndex)}`}
          label={t(
            "scenarioAuthor.builder.schemaField.competencyId",
          )}
          value={competency.competencyId}
          onChange={(value) =>
            update((mutable) => {
              mutable.competencyId = value;
            })
          }
        />
        <TextControl
          id={`competency-version-${String(frameworkIndex)}-${String(competencyIndex)}`}
          label={t("scenarioAuthor.builder.version")}
          value={competency.version}
          onChange={(value) =>
            update((mutable) => {
              mutable.version = value;
            })
          }
        />
      </div>
      <LocalizedTextControl
        heading={t("scenarioAuthor.builder.competencyTitle")}
        pack={pack}
        localizationKey={competency.title.localizationKey}
        onChange={onChange}
      />
      <LocalizedTextControl
        heading={t("scenarioAuthor.builder.competencyDescription")}
        pack={pack}
        localizationKey={competency.description.localizationKey}
        multiline
        onChange={onChange}
      />
      <div className="scenario-builder__section-heading">
        <h6>{t("scenarioAuthor.builder.performanceIndicators")}</h6>
        <button
          className="button button--secondary"
          type="button"
          onClick={() =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                const target =
                  draft.competencyFrameworks[frameworkIndex]
                    ?.competencies[competencyIndex];
                if (target === undefined) return;
                const indicatorId = uniqueIdentifier(
                  target.indicators.map(
                    (indicator) => indicator.indicatorId,
                  ),
                  `${target.competencyId}.PI`,
                );
                const key = uniqueLocalizationPrefix(
                  draft as unknown as ScenarioPackV1,
                  `builder.${target.competencyId.toLowerCase()}.indicator`,
                  [".statement"],
                );
                target.indicators.push({
                  indicatorId,
                  version: "1.0.0",
                  statement: {
                    localizationKey: `${key}.statement`,
                  },
                });
                seedLocalizedKeys(
                  draft as unknown as ScenarioPackV1,
                  [`${key}.statement`],
                );
              }),
            )
          }
        >
          {t("scenarioAuthor.builder.addIndicator")}
        </button>
      </div>
      {competency.indicators.map((indicator, indicatorIndex) => (
        <section
          className="scenario-builder__nested-card"
          key={indicator.statement.localizationKey}
        >
          <ReferenceHint
            references={indicatorDependents(
              pack,
              indicator.indicatorId,
            )}
          />
          <div className="instructor-review__form-grid">
            <TextControl
              id={`indicator-id-${String(frameworkIndex)}-${String(competencyIndex)}-${String(indicatorIndex)}`}
              label={t(
                "scenarioAuthor.builder.performanceIndicatorId",
              )}
              value={indicator.indicatorId}
              onChange={(value) =>
                update((mutable) => {
                  const selected =
                    mutable.indicators[indicatorIndex];
                  if (selected !== undefined) {
                    selected.indicatorId = value;
                  }
                })
              }
            />
            <TextControl
              id={`indicator-version-${String(frameworkIndex)}-${String(competencyIndex)}-${String(indicatorIndex)}`}
              label={t("scenarioAuthor.builder.version")}
              value={indicator.version}
              onChange={(value) =>
                update((mutable) => {
                  const selected =
                    mutable.indicators[indicatorIndex];
                  if (selected !== undefined) {
                    selected.version = value;
                  }
                })
              }
            />
          </div>
          <LocalizedTextControl
            heading={t("scenarioAuthor.builder.indicatorStatement")}
            pack={pack}
            localizationKey={indicator.statement.localizationKey}
            onChange={onChange}
          />
          <button
            className="button button--quiet"
            type="button"
            disabled={
              competency.indicators.length <= 1 ||
              countExactIdentifierOccurrences(
                pack,
                indicator.indicatorId,
              ) > 1
            }
            onClick={() =>
              update((mutable) => {
                mutable.indicators.splice(indicatorIndex, 1);
              })
            }
          >
            {t("scenarioAuthor.builder.removeIndicator")}
          </button>
        </section>
      ))}
    </section>
  );
}

function RubricEditor({
  pack,
  onChange,
}: {
  readonly pack: ScenarioPackV1;
  readonly onChange: (pack: ScenarioPackV1) => void;
}): ReactNode {
  const t = useTranslator();
  const indicators = indicatorDefinitions(pack);
  function updateRubric(
    rubricIndex: number,
    mutation: (rubric: DeepMutable<RubricDefinitionV1>) => void,
  ): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const rubric = draft.rubrics[rubricIndex];
        if (rubric !== undefined) mutation(rubric);
      }),
    );
  }
  function addRubric(): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const rubricId = uniqueIdentifier(
          draft.rubrics.map((rubric) => rubric.rubricId),
          "RUBRIC_NEW",
        );
        const criterionId = uniqueIdentifier(
          draft.rubrics.flatMap((rubric) =>
            rubric.criteria.map((criterion) => criterion.criterionId),
          ),
          "CRITERION_NEW",
        );
        const key = uniqueLocalizationPrefix(
          draft as unknown as ScenarioPackV1,
          `builder.${rubricId.toLowerCase()}`,
          [
            ".title",
            ".level0",
            ".level1",
            ".criterion.title",
            ".criterion.description",
          ],
        );
        const indicatorId =
          draft.competencyFrameworks[0]?.competencies[0]
            ?.indicators[0]?.indicatorId;
        const evidenceRuleId = draft.evidenceRules[0]?.evidenceRuleId;
        draft.rubrics.push({
          rubricId,
          version: "1.0.0",
          title: { localizationKey: `${key}.title` },
          levels: [
            {
              value: 0,
              label: { localizationKey: `${key}.level0` },
            },
            {
              value: 1,
              label: { localizationKey: `${key}.level1` },
            },
          ],
          criteria: [
            {
              criterionId,
              title: {
                localizationKey: `${key}.criterion.title`,
              },
              description: {
                localizationKey: `${key}.criterion.description`,
              },
              indicatorIds:
                indicatorId === undefined ? [] : [indicatorId],
              evidenceRuleIds:
                evidenceRuleId === undefined ? [] : [evidenceRuleId],
            },
          ],
        });
        seedLocalizedKeys(
          draft as unknown as ScenarioPackV1,
          [
            `${key}.title`,
            `${key}.level0`,
            `${key}.level1`,
            `${key}.criterion.title`,
            `${key}.criterion.description`,
          ],
        );
      }),
    );
  }
  return (
    <CollectionSection
      heading={t("scenarioAuthor.builder.rubrics")}
      help={t("scenarioAuthor.builder.rubricEditorHelp")}
      addLabel={t("scenarioAuthor.builder.addRubric")}
      onAdd={addRubric}
    >
      {pack.rubrics.map((rubric, rubricIndex) => (
        <article
          className="scenario-builder__collection-card"
          key={rubric.title.localizationKey}
        >
          <div className="scenario-builder__collection-heading">
            <code>{rubric.rubricId}</code>
            <button
              className="button button--quiet"
              type="button"
              disabled={
                pack.rubrics.length <= 1 ||
                countExactIdentifierOccurrences(
                  pack,
                  rubric.rubricId,
                ) > 1
              }
              onClick={() =>
                onChange(
                  changeScenarioPack(pack, (draft) => {
                    draft.rubrics.splice(rubricIndex, 1);
                  }),
                )
              }
            >
              {t("scenarioAuthor.builder.remove")}
            </button>
          </div>
          <ReferenceHint
            references={rubricDependents(pack, rubric.rubricId)}
          />
          <div className="instructor-review__form-grid">
            <TextControl
              id={`rubric-id-${String(rubricIndex)}`}
              label={t(
                "scenarioAuthor.builder.schemaField.rubricId",
              )}
              value={rubric.rubricId}
              onChange={(value) =>
                updateRubric(rubricIndex, (mutable) => {
                  mutable.rubricId = value;
                })
              }
            />
            <TextControl
              id={`rubric-version-${String(rubricIndex)}`}
              label={t("scenarioAuthor.builder.version")}
              value={rubric.version}
              onChange={(value) =>
                updateRubric(rubricIndex, (mutable) => {
                  mutable.version = value;
                })
              }
            />
          </div>
          <LocalizedTextControl
            heading={t("scenarioAuthor.builder.rubricTitle")}
            pack={pack}
            localizationKey={rubric.title.localizationKey}
            onChange={onChange}
          />
          <section className="scenario-builder__nested-card">
            <div className="scenario-builder__section-heading">
              <h6>{t("scenarioAuthor.builder.rubricLevels")}</h6>
              <button
                className="button button--secondary"
                type="button"
                onClick={() =>
                  onChange(
                    changeScenarioPack(pack, (draft) => {
                      const target = draft.rubrics[rubricIndex];
                      if (target === undefined) return;
                      const nextValue =
                        Math.max(
                          -1,
                          ...target.levels.map((level) => level.value),
                        ) + 1;
                      const key = uniqueLocalizationPrefix(
                        draft as unknown as ScenarioPackV1,
                        `builder.${target.rubricId.toLowerCase()}.level`,
                        [".label"],
                      );
                      target.levels.push({
                        value: nextValue,
                        label: { localizationKey: `${key}.label` },
                      });
                      seedLocalizedKeys(
                        draft as unknown as ScenarioPackV1,
                        [`${key}.label`],
                      );
                    }),
                  )
                }
              >
                {t("scenarioAuthor.builder.addRubricLevel")}
              </button>
            </div>
            {rubric.levels.map((level, levelIndex) => (
              <section
                className="scenario-builder__nested-card"
                key={level.label.localizationKey}
              >
                <NumberControl
                  id={`rubric-level-${String(rubricIndex)}-${String(levelIndex)}`}
                  label={t("scenarioAuthor.builder.levelValue")}
                  value={level.value}
                  onChange={(value) =>
                    updateRubric(rubricIndex, (mutable) => {
                      const selected = mutable.levels[levelIndex];
                      if (selected !== undefined) {
                        selected.value = value;
                      }
                    })
                  }
                />
                <LocalizedTextControl
                  heading={t("scenarioAuthor.builder.levelLabel")}
                  pack={pack}
                  localizationKey={level.label.localizationKey}
                  onChange={onChange}
                />
                <button
                  className="button button--quiet"
                  type="button"
                  disabled={rubric.levels.length <= 2}
                  onClick={() =>
                    updateRubric(rubricIndex, (mutable) => {
                      mutable.levels.splice(levelIndex, 1);
                    })
                  }
                >
                  {t("scenarioAuthor.builder.removeRubricLevel")}
                </button>
              </section>
            ))}
          </section>
          <section className="scenario-builder__nested-card">
            <div className="scenario-builder__section-heading">
              <h6>{t("scenarioAuthor.builder.rubricCriteria")}</h6>
              <button
                className="button button--secondary"
                type="button"
                onClick={() =>
                  onChange(
                    changeScenarioPack(pack, (draft) => {
                      const target = draft.rubrics[rubricIndex];
                      if (target === undefined) return;
                      const criterionId = uniqueIdentifier(
                        draft.rubrics.flatMap((candidate) =>
                          candidate.criteria.map(
                            (criterion) => criterion.criterionId,
                          ),
                        ),
                        "CRITERION_NEW",
                      );
                      const key = uniqueLocalizationPrefix(
                        draft as unknown as ScenarioPackV1,
                        `builder.${target.rubricId.toLowerCase()}.criterion`,
                        [".title", ".description"],
                      );
                      target.criteria.push({
                        criterionId,
                        title: {
                          localizationKey: `${key}.title`,
                        },
                        description: {
                          localizationKey: `${key}.description`,
                        },
                        indicatorIds:
                          draft.competencyFrameworks[0]
                            ?.competencies[0]?.indicators[0]
                            ?.indicatorId === undefined
                            ? []
                            : [
                                draft.competencyFrameworks[0]
                                  .competencies[0]!.indicators[0]!
                                  .indicatorId,
                              ],
                        evidenceRuleIds:
                          draft.evidenceRules[0]?.evidenceRuleId ===
                          undefined
                            ? []
                            : [
                                draft.evidenceRules[0]
                                  .evidenceRuleId,
                              ],
                      });
                      seedLocalizedKeys(
                        draft as unknown as ScenarioPackV1,
                        [`${key}.title`, `${key}.description`],
                      );
                    }),
                  )
                }
              >
                {t("scenarioAuthor.builder.addCriterion")}
              </button>
            </div>
            {rubric.criteria.map((criterion, criterionIndex) => (
              <RubricCriterionEditor
                key={criterion.title.localizationKey}
                pack={pack}
                rubricIndex={rubricIndex}
                criterion={criterion}
                criterionIndex={criterionIndex}
                indicators={indicators}
                onChange={onChange}
              />
            ))}
          </section>
        </article>
      ))}
    </CollectionSection>
  );
}

function RubricCriterionEditor({
  pack,
  rubricIndex,
  criterion,
  criterionIndex,
  indicators,
  onChange,
}: {
  readonly pack: ScenarioPackV1;
  readonly rubricIndex: number;
  readonly criterion: RubricCriterionV1;
  readonly criterionIndex: number;
  readonly indicators: readonly PerformanceIndicatorV1[];
  readonly onChange: (pack: ScenarioPackV1) => void;
}): ReactNode {
  const t = useTranslator();
  function update(
    mutation: (
      criterion: DeepMutable<RubricCriterionV1>,
    ) => void,
  ): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const target =
          draft.rubrics[rubricIndex]?.criteria[criterionIndex];
        if (target !== undefined) mutation(target);
      }),
    );
  }
  return (
    <section className="scenario-builder__nested-card">
      <div className="scenario-builder__collection-heading">
        <code>{criterion.criterionId}</code>
        <button
          className="button button--quiet"
          type="button"
          disabled={
            (pack.rubrics[rubricIndex]?.criteria.length ?? 0) <= 1 ||
            countExactIdentifierOccurrences(
              pack,
              criterion.criterionId,
            ) > 1
          }
          onClick={() =>
            onChange(
              changeScenarioPack(pack, (draft) => {
                draft.rubrics[rubricIndex]?.criteria.splice(
                  criterionIndex,
                  1,
                );
              }),
            )
          }
        >
          {t("scenarioAuthor.builder.remove")}
        </button>
      </div>
      <TextControl
        id={`criterion-id-${String(rubricIndex)}-${String(criterionIndex)}`}
        label={t("scenarioAuthor.builder.criterionId")}
        value={criterion.criterionId}
        onChange={(value) =>
          update((mutable) => {
            mutable.criterionId = value;
          })
        }
      />
      <LocalizedTextControl
        heading={t("scenarioAuthor.builder.criterionTitle")}
        pack={pack}
        localizationKey={criterion.title.localizationKey}
        onChange={onChange}
      />
      <LocalizedTextControl
        heading={t("scenarioAuthor.builder.criterionDescription")}
        pack={pack}
        localizationKey={criterion.description.localizationKey}
        multiline
        onChange={onChange}
      />
      <CheckboxList
        legend={t("scenarioAuthor.builder.criterionIndicators")}
        options={indicators.map((indicator) => ({
          value: indicator.indicatorId,
          label: indicator.indicatorId,
        }))}
        selected={criterion.indicatorIds}
        onChange={(values) =>
          update((mutable) => {
            mutable.indicatorIds = [...values];
          })
        }
      />
      <CheckboxList
        legend={t("scenarioAuthor.builder.criterionEvidenceRules")}
        options={pack.evidenceRules.map((rule) => ({
          value: rule.evidenceRuleId,
          label: rule.evidenceRuleId,
        }))}
        selected={criterion.evidenceRuleIds}
        onChange={(values) =>
          update((mutable) => {
            mutable.evidenceRuleIds = [...values];
          })
        }
      />
    </section>
  );
}

function EvidenceRuleEditor({
  pack,
  onChange,
}: {
  readonly pack: ScenarioPackV1;
  readonly onChange: (pack: ScenarioPackV1) => void;
}): ReactNode {
  const t = useTranslator();
  const indicators = indicatorDefinitions(pack);
  function updateRule(
    ruleIndex: number,
    mutation: (
      rule: DeepMutable<AutomatedEvidenceRuleV1>,
    ) => void,
  ): void {
    onChange(
      changeScenarioPack(pack, (draft) => {
        const rule = draft.evidenceRules[ruleIndex];
        if (rule !== undefined) mutation(rule);
      }),
    );
  }
  return (
    <CollectionSection
      heading={t("scenarioAuthor.builder.evidenceRules")}
      help={t("scenarioAuthor.builder.evidenceRuleEditorHelp")}
      addLabel={t("scenarioAuthor.builder.addEvidenceRule")}
      addDisabled={indicators.length === 0}
      onAdd={() =>
        onChange(
          changeScenarioPack(pack, (draft) => {
            const evidenceRuleId = uniqueIdentifier(
              draft.evidenceRules.map(
                (rule) => rule.evidenceRuleId,
              ),
              "EVIDENCE_RULE_NEW",
            );
            const indicatorId =
              draft.competencyFrameworks[0]?.competencies[0]
                ?.indicators[0]?.indicatorId;
            draft.evidenceRules.push({
              evidenceRuleId,
              version: "1.0.0",
              indicatorIds:
                indicatorId === undefined ? [] : [indicatorId],
              operator: "EVENT_OCCURRED",
              eventType: "DECISION_SUBMITTED",
            });
          }),
        )
      }
    >
      {pack.evidenceRules.map((rule, ruleIndex) => (
        <article
          className="scenario-builder__collection-card"
          key={`evidence-rule-${String(ruleIndex)}`}
        >
          <div className="scenario-builder__collection-heading">
            <code>{rule.evidenceRuleId}</code>
            <button
              className="button button--quiet"
              type="button"
              disabled={
                pack.evidenceRules.length <= 1 ||
                countExactIdentifierOccurrences(
                  pack,
                  rule.evidenceRuleId,
                ) > 1
              }
              onClick={() =>
                onChange(
                  changeScenarioPack(pack, (draft) => {
                    draft.evidenceRules.splice(ruleIndex, 1);
                  }),
                )
              }
            >
              {t("scenarioAuthor.builder.remove")}
            </button>
          </div>
          <ReferenceHint
            references={evidenceRuleDependents(
              pack,
              rule.evidenceRuleId,
            )}
          />
          <div className="instructor-review__form-grid">
            <TextControl
              id={`evidence-rule-id-${String(ruleIndex)}`}
              label={t(
                "scenarioAuthor.builder.schemaField.evidenceRuleId",
              )}
              value={rule.evidenceRuleId}
              onChange={(value) =>
                updateRule(ruleIndex, (mutable) => {
                  mutable.evidenceRuleId = value;
                })
              }
            />
            <TextControl
              id={`evidence-rule-version-${String(ruleIndex)}`}
              label={t("scenarioAuthor.builder.version")}
              value={rule.version}
              onChange={(value) =>
                updateRule(ruleIndex, (mutable) => {
                  mutable.version = value;
                })
              }
            />
            <SelectControl
              id={`evidence-rule-operator-${String(ruleIndex)}`}
              label={t("scenarioAuthor.builder.evidenceRuleOperator")}
              value={rule.operator}
              options={(
                [
                  "EVENT_OCCURRED",
                  "FIELD_EQUALS",
                  "FIELD_IN",
                ] as const
              ).map((operator) => ({
                value: operator,
                label: t(
                  `scenarioAuthor.builder.evidenceRuleOperator.${operator}`,
                ),
              }))}
              onChange={(value) =>
                updateRule(ruleIndex, (mutable) => {
                  mutable.operator = value as EvidenceRuleOperator;
                  if (value === "EVENT_OCCURRED") {
                    delete mutable.fieldPath;
                    delete mutable.expectedValue;
                    delete mutable.expectedValues;
                  } else if (value === "FIELD_EQUALS") {
                    mutable.fieldPath ??= "payload.value";
                    mutable.expectedValue ??= "EXPECTED_VALUE";
                    delete mutable.expectedValues;
                  } else {
                    mutable.fieldPath ??= "payload.value";
                    mutable.expectedValues ??= ["EXPECTED_VALUE"];
                    delete mutable.expectedValue;
                  }
                })
              }
            />
            <TextControl
              id={`evidence-rule-event-${String(ruleIndex)}`}
              label={t("scenarioAuthor.builder.eventType")}
              value={rule.eventType}
              onChange={(value) =>
                updateRule(ruleIndex, (mutable) => {
                  mutable.eventType = value;
                })
              }
            />
          </div>
          <CheckboxList
            legend={t("scenarioAuthor.builder.ruleIndicators")}
            options={indicators.map((indicator) => ({
              value: indicator.indicatorId,
              label: indicator.indicatorId,
            }))}
            selected={rule.indicatorIds}
            onChange={(values) =>
              updateRule(ruleIndex, (mutable) => {
                mutable.indicatorIds = [...values];
              })
            }
          />
          {rule.operator === "EVENT_OCCURRED" ? null : (
            <div className="instructor-review__form-grid">
              <TextControl
                id={`evidence-rule-path-${String(ruleIndex)}`}
                label={t("scenarioAuthor.builder.fieldPath")}
                value={rule.fieldPath ?? ""}
                onChange={(value) =>
                  updateRule(ruleIndex, (mutable) => {
                    mutable.fieldPath = value;
                  })
                }
              />
              {rule.operator === "FIELD_EQUALS" ? (
                <TextControl
                  id={`evidence-rule-value-${String(ruleIndex)}`}
                  label={t("scenarioAuthor.builder.expectedValue")}
                  value={String(rule.expectedValue ?? "")}
                  onChange={(value) =>
                    updateRule(ruleIndex, (mutable) => {
                      mutable.expectedValue = value;
                    })
                  }
                />
              ) : (
                <TextControl
                  id={`evidence-rule-values-${String(ruleIndex)}`}
                  label={t("scenarioAuthor.builder.expectedValues")}
                  value={(rule.expectedValues ?? []).join(", ")}
                  onChange={(value) =>
                    updateRule(ruleIndex, (mutable) => {
                      mutable.expectedValues = value
                        .split(",")
                        .map((entry) => entry.trim())
                        .filter((entry) => entry.length > 0);
                    })
                  }
                />
              )}
            </div>
          )}
        </article>
      ))}
    </CollectionSection>
  );
}

function ReviewStep({
  pack,
  scenario,
  scenarioIndex,
  onChange,
}: BuilderStepProps): ReactNode {
  const t = useTranslator();
  const [selectedPreviewRole, setSelectedPreviewRole] = useState(
    scenario.roles[0]?.roleId ?? "",
  );
  const [selectedPreviewMode, setSelectedPreviewMode] =
    useState<HostedRunMode>(
      scenario.supportedModes[0] ?? "tutorial",
    );
  const [selectedPreviewLocale, setSelectedPreviewLocale] = useState(
    pack.supportedLocales[0] ?? "en",
  );
  const previewRole = scenario.roles.some(
    (role) => role.roleId === selectedPreviewRole,
  )
    ? selectedPreviewRole
    : scenario.roles[0]?.roleId ?? "";
  const previewMode = scenario.supportedModes.includes(
    selectedPreviewMode,
  )
    ? selectedPreviewMode
    : scenario.supportedModes[0] ?? "tutorial";
  const previewLocale = pack.supportedLocales.includes(
    selectedPreviewLocale as (typeof pack.supportedLocales)[number],
  )
    ? selectedPreviewLocale
    : pack.supportedLocales[0] ?? "en";
  const workingPreview = useMemo(() => {
    if (previewRole.length === 0) return null;
    try {
      return createScenarioRolePreview({
        pack,
        scenarioId: scenario.scenarioId,
        scenarioVersion: scenario.version,
        locale: previewLocale,
        mode: previewMode,
        roleId: previewRole,
        localizationCatalogs: {},
      });
    } catch {
      return null;
    }
  }, [
    pack,
    previewLocale,
    previewMode,
    previewRole,
    scenario.scenarioId,
    scenario.version,
  ]);
  const reachableNodeIds = useMemo(
    () => reachableNodes(scenario),
    [scenario],
  );
  const localizedMissing = localizedTextGaps(pack);
  const contractReview = useMemo(
    () => validateScenarioPack(pack),
    [pack],
  );
  const disconnected = scenario.nodes.filter(
    (node) => !reachableNodeIds.has(node.nodeId),
  );
  const summary = [
    {
      label: t("scenarioAuthor.builder.summary.scenarios"),
      value: pack.scenarios.length,
    },
    {
      label: t("scenarioAuthor.builder.summary.organizations"),
      value: scenario.organizations.length,
    },
    {
      label: t("scenarioAuthor.builder.summary.roles"),
      value: scenario.roles.length,
    },
    {
      label: t("scenarioAuthor.builder.summary.evidence"),
      value: scenario.evidenceItems.length,
    },
    {
      label: t("scenarioAuthor.builder.summary.policies"),
      value: scenario.policies.length,
    },
    {
      label: t("scenarioAuthor.builder.summary.nodes"),
      value: scenario.nodes.length,
    },
    {
      label: t("scenarioAuthor.builder.summary.rubrics"),
      value: scenario.rubricIds.length,
    },
    {
      label: t("scenarioAuthor.builder.summary.modes"),
      value: scenario.supportedModes.length,
    },
  ];
  return (
    <section aria-labelledby="builder-review-heading">
      <h4 id="builder-review-heading">
        {t("scenarioAuthor.builder.review.heading")}
      </h4>
      <p>{t("scenarioAuthor.builder.review.help")}</p>
      <dl className="instructor-review__facts scenario-builder__summary">
        {summary.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <div
        className={
          localizedMissing.length === 0
            ? "notice"
            : "notice notice--standalone"
        }
      >
        <h5>{t("scenarioAuthor.builder.localizationCheck")}</h5>
        <p>
          {localizedMissing.length === 0
            ? t("scenarioAuthor.builder.localizationComplete")
            : t("scenarioAuthor.builder.localizationMissing", {
                count: localizedMissing.length,
              })}
        </p>
        {localizedMissing.length === 0 ? null : (
          <ul>
            {localizedMissing.slice(0, 20).map((gap) => (
              <li key={gap}>
                <code>{gap}</code>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        className={
          disconnected.length === 0
            ? "notice"
            : "notice notice--standalone"
        }
      >
        <h5>{t("scenarioAuthor.builder.reachabilityCheck")}</h5>
        <p>
          {disconnected.length === 0
            ? t("scenarioAuthor.builder.reachabilityComplete")
            : t("scenarioAuthor.builder.reachabilityMissing", {
                count: disconnected.length,
              })}
        </p>
        {disconnected.length === 0 ? null : (
          <ul>
            {disconnected.map((node) => (
              <li key={node.nodeId}>
                <code>{node.nodeId}</code>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        className={
          contractReview.isValid
            ? "notice"
            : "notice notice--standalone"
        }
      >
        <h5>{t("scenarioAuthor.builder.contractCheck")}</h5>
        <p>
          {contractReview.isValid
            ? t("scenarioAuthor.builder.contractComplete", {
                count: contractReview.checkedCount,
              })
            : t("scenarioAuthor.builder.contractIssues", {
                count: contractReview.issues.length,
                checkedCount: contractReview.checkedCount,
              })}
        </p>
        {contractReview.isValid ? null : (
          <ul>
            {contractReview.issues.slice(0, 30).map((issue) => (
              <li key={`${issue.path}:${issue.code}`}>
                <code>{issue.path}</code>
                {": "}
                <strong>{issue.code}</strong>
                {": "}
                {issue.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="notice notice--standalone">
        {t("scenarioAuthor.builder.serverValidation")}
      </p>
      <section
        className="scenario-builder__workflow-map"
        aria-labelledby="scenario-builder-working-preview-heading"
      >
        <div>
          <h5 id="scenario-builder-working-preview-heading">
            {t("scenarioAuthor.builder.workingPreview")}
          </h5>
          <p>{t("scenarioAuthor.builder.workingPreviewHelp")}</p>
        </div>
        <div className="instructor-review__form-grid">
          <SelectControl
            id="builder-preview-role"
            label={t("scenarioAuthor.builder.previewRole")}
            value={previewRole}
            options={scenario.roles.map((role) => ({
              value: role.roleId,
              label: role.roleId,
            }))}
            onChange={setSelectedPreviewRole}
          />
          <SelectControl
            id="builder-preview-mode"
            label={t("scenarioAuthor.builder.previewMode")}
            value={previewMode}
            options={scenario.supportedModes.map((mode) => ({
              value: mode,
              label: t(`scenarioAuthor.mode.${mode}`),
            }))}
            onChange={(value) =>
              setSelectedPreviewMode(value as HostedRunMode)
            }
          />
          <SelectControl
            id="builder-preview-locale"
            label={t("scenarioAuthor.builder.previewLocale")}
            value={previewLocale}
            options={pack.supportedLocales.map((locale) => ({
              value: locale,
              label: locale,
            }))}
            onChange={setSelectedPreviewLocale}
          />
        </div>
        {workingPreview === null ? (
          <p className="notice notice--standalone">
            {t("scenarioAuthor.builder.workingPreviewUnavailable")}
          </p>
        ) : (
          <>
            <p>
              {t("scenarioAuthor.builder.workingPreviewSummary", {
                title: workingPreview.scenarioTitle,
                count: workingPreview.nodes.length,
              })}
            </p>
            <ol>
              {workingPreview.nodes.map((node) => (
                <li key={node.nodeId}>
                  <div className="scenario-builder__workflow-map-node">
                    <code>{node.nodeId}</code>
                    <span className="status status--neutral">
                      {t(
                        `scenarioAuthor.builder.nodeType.${node.nodeType}`,
                      )}
                    </span>
                  </div>
                  <p>{node.title}</p>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
      <details className="scenario-builder__advanced">
        <summary>{t("scenarioAuthor.builder.advanced")}</summary>
        <p>{t("scenarioAuthor.builder.advancedHelp")}</p>
        <AdvancedCoverageSummary pack={pack} scenario={scenario} />
        <StructuredValueEditor
          path="scenarios[].assetTypes"
          idPrefix="builder-asset-types"
          label={t("scenarioAuthor.builder.assetTypes")}
          value={scenario.assetTypes as unknown as JsonValue}
          pack={pack}
          onPackChange={onChange}
          onChange={(value) => {
            if (!Array.isArray(value)) return;
            onChange(
              changeScenarioPack(pack, (draft) => {
                const target = draft.scenarios[scenarioIndex];
                if (target !== undefined) {
                  target.assetTypes =
                    value as unknown as typeof target.assetTypes;
                }
              }),
            );
          }}
        />
        <StructuredValueEditor
          path="scenarios[].staffProfiles"
          idPrefix="builder-staff-profiles"
          label={t("scenarioAuthor.builder.staffProfiles")}
          value={scenario.staffProfiles as unknown as JsonValue}
          pack={pack}
          onPackChange={onChange}
          onChange={(value) => {
            if (!Array.isArray(value)) return;
            onChange(
              changeScenarioPack(pack, (draft) => {
                const target = draft.scenarios[scenarioIndex];
                if (target !== undefined) {
                  target.staffProfiles =
                    value as unknown as typeof target.staffProfiles;
                }
              }),
            );
          }}
        />
        <StructuredValueEditor
          path="scenarios[].counterfactualComparisonDimensions"
          idPrefix="builder-counterfactual-dimensions"
          label={t(
            "scenarioAuthor.builder.counterfactualDimensions",
          )}
          value={
            scenario.counterfactualComparisonDimensions as unknown as JsonValue
          }
          pack={pack}
          onPackChange={onChange}
          onChange={(value) => {
            if (!Array.isArray(value)) return;
            onChange(
              changeScenarioPack(pack, (draft) => {
                const target = draft.scenarios[scenarioIndex];
                if (target !== undefined) {
                  target.counterfactualComparisonDimensions =
                    value as unknown as typeof target.counterfactualComparisonDimensions;
                }
              }),
            );
          }}
        />
        <StructuredValueEditor
          path="scenarios[].counterfactualConditions"
          idPrefix="builder-counterfactual-conditions"
          label={t(
            "scenarioAuthor.builder.counterfactualConditions",
          )}
          value={
            scenario.counterfactualConditions as unknown as JsonValue
          }
          pack={pack}
          onPackChange={onChange}
          onChange={(value) => {
            if (!Array.isArray(value)) return;
            onChange(
              changeScenarioPack(pack, (draft) => {
                const target = draft.scenarios[scenarioIndex];
                if (target !== undefined) {
                  target.counterfactualConditions =
                    value as unknown as typeof target.counterfactualConditions;
                }
              }),
            );
          }}
        />
        <StructuredValueEditor
          path="portraitAssets"
          idPrefix="builder-portrait-assets"
          label={t("scenarioAuthor.builder.portraitAssets")}
          value={pack.portraitAssets as unknown as JsonValue}
          pack={pack}
          onPackChange={onChange}
          onChange={(value) => {
            if (!Array.isArray(value)) return;
            onChange(
              changeScenarioPack(pack, (draft) => {
                draft.portraitAssets =
                  value as unknown as typeof draft.portraitAssets;
              }),
            );
          }}
        />
        <StructuredValueEditor
          path="auditVariantBanks"
          idPrefix="builder-audit-variant-banks"
          label={t("scenarioAuthor.builder.auditVariantBanks")}
          value={pack.auditVariantBanks as unknown as JsonValue}
          pack={pack}
          onPackChange={onChange}
          onChange={(value) => {
            if (!Array.isArray(value)) return;
            onChange(
              changeScenarioPack(pack, (draft) => {
                draft.auditVariantBanks =
                  value as unknown as typeof draft.auditVariantBanks;
              }),
            );
          }}
        />
        <StructuredValueEditor
          path="assetHashes"
          idPrefix="builder-asset-hashes"
          label={t("scenarioAuthor.builder.assetHashes")}
          value={pack.assetHashes as JsonObject}
          onChange={(value) => {
            if (
              typeof value !== "object" ||
              value === null ||
              Array.isArray(value)
            ) {
              return;
            }
            onChange(
              changeScenarioPack(pack, (draft) => {
                draft.assetHashes = value as Record<string, string>;
              }),
            );
          }}
        />
        {scenario.hostedRuntime === undefined ? (
          <p>{t("scenarioAuthor.builder.noHostedRuntime")}</p>
        ) : (
          <StructuredValueEditor
            path="scenarios[].hostedRuntime"
            idPrefix="builder-hosted-runtime"
            label={t("scenarioAuthor.builder.hostedRuntime")}
            value={scenario.hostedRuntime as unknown as JsonValue}
            onChange={(value) =>
              onChange(
                changeScenarioPack(pack, (draft) => {
                  const target = draft.scenarios[scenarioIndex];
                  if (
                    target !== undefined &&
                    typeof value === "object" &&
                    value !== null &&
                    !Array.isArray(value)
                  ) {
                    target.hostedRuntime =
                      value as unknown as NonNullable<
                        typeof target.hostedRuntime
                      >;
                  }
                }),
              )
            }
          />
        )}
        {scenario.auditCase === undefined ? (
          <p>{t("scenarioAuthor.builder.noAuditCase")}</p>
        ) : (
          <StructuredValueEditor
            path="scenarios[].auditCase"
            idPrefix="builder-audit-case"
            label={t("scenarioAuthor.builder.auditCase")}
            value={scenario.auditCase as unknown as JsonValue}
            pack={pack}
            onPackChange={onChange}
            onChange={(value) =>
              onChange(
                changeScenarioPack(pack, (draft) => {
                  const target = draft.scenarios[scenarioIndex];
                  if (
                    target !== undefined &&
                    typeof value === "object" &&
                    value !== null &&
                    !Array.isArray(value)
                  ) {
                    target.auditCase =
                      value as unknown as NonNullable<
                        typeof target.auditCase
                      >;
                  }
                }),
              )
            }
          />
        )}
      </details>
    </section>
  );
}

function AdvancedCoverageSummary({
  pack,
  scenario,
}: {
  readonly pack: ScenarioPackV1;
  readonly scenario: ScenarioDefinitionV1;
}): ReactNode {
  const t = useTranslator();
  const entries = [
    {
      label: t("scenarioAuthor.builder.assetTypes"),
      value: scenario.assetTypes.length,
    },
    {
      label: t("scenarioAuthor.builder.staffProfiles"),
      value: scenario.staffProfiles.length,
    },
    {
      label: t("scenarioAuthor.builder.counterfactualDimensions"),
      value: scenario.counterfactualComparisonDimensions.length,
    },
    {
      label: t("scenarioAuthor.builder.counterfactualConditions"),
      value: scenario.counterfactualConditions.length,
    },
    {
      label: t("scenarioAuthor.builder.portraitAssets"),
      value: pack.portraitAssets.length,
    },
    {
      label: t("scenarioAuthor.builder.auditVariantBanks"),
      value: pack.auditVariantBanks.length,
    },
    {
      label: t("scenarioAuthor.builder.hostedRuntime"),
      value: scenario.hostedRuntime === undefined ? 0 : 1,
    },
    {
      label: t("scenarioAuthor.builder.auditCase"),
      value: scenario.auditCase === undefined ? 0 : 1,
    },
  ];
  return (
    <dl className="instructor-review__facts">
      {entries.map((entry) => (
        <div key={entry.label}>
          <dt>{entry.label}</dt>
          <dd>{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function reachableNodes(
  scenario: ScenarioDefinitionV1,
): ReadonlySet<string> {
  const visited = new Set<string>();
  const pending = [scenario.entryNodeId];
  while (pending.length > 0) {
    const nodeId = pending.shift();
    if (nodeId === undefined || visited.has(nodeId)) continue;
    visited.add(nodeId);
    const node = scenario.nodes.find(
      (candidate) => candidate.nodeId === nodeId,
    );
    if (node !== undefined) {
      pending.push(
        ...node.transitions.map(
          (transition) => transition.toNodeId,
        ),
      );
    }
  }
  return visited;
}

function localizedTextGaps(pack: ScenarioPackV1): readonly string[] {
  const keys = new Set<string>();
  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const record = value as Readonly<Record<string, unknown>>;
    if (
      Object.keys(record).length === 1 &&
      typeof record.localizationKey === "string"
    ) {
      keys.add(record.localizationKey);
      return;
    }
    Object.values(record).forEach(visit);
  }
  visit(pack);
  return [...keys].flatMap((key) =>
    pack.supportedLocales.flatMap((locale) =>
      (pack.localizationCatalogs?.[locale]?.[key] ?? "").trim()
        .length === 0
        ? [`${locale}:${key}`]
        : [],
    ),
  );
}

function JsonValueEditor({
  idPrefix,
  label,
  value,
  onChange,
}: {
  readonly idPrefix: string;
  readonly label: string;
  readonly value: JsonValue;
  readonly onChange: (value: JsonValue) => void;
}): ReactNode {
  return (
    <StructuredValueEditor
      path={idPrefix}
      idPrefix={idPrefix}
      label={label}
      value={value}
      onChange={onChange}
      openByDefault
    />
  );
}

function StructuredValueEditor({
  path,
  idPrefix,
  label,
  value,
  pack,
  onPackChange,
  onChange,
  openByDefault = false,
}: {
  readonly path: string;
  readonly idPrefix: string;
  readonly label: string;
  readonly value: JsonValue;
  readonly pack?: ScenarioPackV1;
  readonly onPackChange?: (pack: ScenarioPackV1) => void;
  readonly onChange: (value: JsonValue) => void;
  readonly openByDefault?: boolean;
}): ReactNode {
  if (
    pack !== undefined &&
    onPackChange !== undefined &&
    isLocalizedTextReference(value)
  ) {
    return (
      <LocalizedTextControl
        heading={label}
        pack={pack}
        localizationKey={value.localizationKey}
        onChange={onPackChange}
      />
    );
  }
  if (isJsonArray(value)) {
    return (
      <StructuredArrayEditor
        path={path}
        idPrefix={idPrefix}
        label={label}
        value={value}
        {...(pack === undefined ? {} : { pack })}
        {...(onPackChange === undefined ? {} : { onPackChange })}
        onChange={onChange}
        openByDefault={openByDefault}
      />
    );
  }
  if (isJsonObject(value)) {
    return (
      <StructuredObjectEditor
        path={path}
        idPrefix={idPrefix}
        label={label}
        value={value}
        {...(pack === undefined ? {} : { pack })}
        {...(onPackChange === undefined ? {} : { onPackChange })}
        onChange={onChange}
        openByDefault={openByDefault}
      />
    );
  }
  return (
    <StructuredPrimitiveEditor
      id={idPrefix}
      label={label}
      value={value}
      onChange={onChange}
    />
  );
}

function isLocalizedTextReference(
  value: JsonValue,
): value is { readonly localizationKey: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !isJsonArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as Readonly<Record<string, JsonValue>>)
      .localizationKey === "string"
  );
}

function isJsonArray(
  value: JsonValue,
): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function isJsonObject(
  value: JsonValue,
): value is Readonly<Record<string, JsonValue>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !isJsonArray(value)
  );
}

function StructuredArrayEditor({
  path,
  idPrefix,
  label,
  value,
  pack,
  onPackChange,
  onChange,
  openByDefault,
}: {
  readonly path: string;
  readonly idPrefix: string;
  readonly label: string;
  readonly value: readonly JsonValue[];
  readonly pack?: ScenarioPackV1;
  readonly onPackChange?: (pack: ScenarioPackV1) => void;
  readonly onChange: (value: JsonValue) => void;
  readonly openByDefault: boolean;
}): ReactNode {
  const t = useTranslator();
  return (
    <details
      className="scenario-builder__structured"
      open={openByDefault || undefined}
    >
      <summary>
        <span>{label}</span>
        <span className="status status--neutral">
          {t("scenarioAuthor.builder.itemCount", {
            count: value.length,
          })}
        </span>
      </summary>
      <div className="scenario-builder__structured-body">
        {value.map((item, index) => (
          <section
            className="scenario-builder__nested-card"
            key={`${idPrefix}:${String(index)}`}
          >
            <div className="scenario-builder__collection-heading">
              <strong>
                {t("scenarioAuthor.builder.item", {
                  number: index + 1,
                })}
              </strong>
              <div className="scenario-builder__compact-actions">
                <button
                  className="button button--quiet"
                  type="button"
                  disabled={index === 0}
                  onClick={() => {
                    const next = [...value];
                    const previous = next[index - 1];
                    if (previous === undefined) return;
                    next[index - 1] = item;
                    next[index] = previous;
                    onChange(next);
                  }}
                >
                  {t("scenarioAuthor.builder.up")}
                </button>
                <button
                  className="button button--quiet"
                  type="button"
                  disabled={index === value.length - 1}
                  onClick={() => {
                    const next = [...value];
                    const following = next[index + 1];
                    if (following === undefined) return;
                    next[index + 1] = item;
                    next[index] = following;
                    onChange(next);
                  }}
                >
                  {t("scenarioAuthor.builder.down")}
                </button>
                <button
                  className="button button--quiet"
                  type="button"
                  onClick={() =>
                    onChange(
                      value.filter(
                        (_candidate, candidateIndex) =>
                          candidateIndex !== index,
                      ),
                    )
                  }
                >
                  {t("scenarioAuthor.builder.remove")}
                </button>
              </div>
            </div>
            <StructuredValueEditor
              path={`${path}[]`}
              idPrefix={`${idPrefix}-${String(index)}`}
              label={t("scenarioAuthor.builder.value")}
              value={item}
              {...(pack === undefined ? {} : { pack })}
              {...(onPackChange === undefined
                ? {}
                : { onPackChange })}
              onChange={(nextValue) =>
                onChange(
                  value.map((candidate, candidateIndex) =>
                    candidateIndex === index
                      ? nextValue
                      : candidate,
                  ),
                )
              }
            />
          </section>
        ))}
        <button
          className="button button--secondary"
          type="button"
          onClick={() =>
            onChange([
              ...value,
              structuredArrayDefault(path, value.at(-1)),
            ])
          }
        >
          {t("scenarioAuthor.builder.addItem")}
        </button>
      </div>
    </details>
  );
}

function StructuredObjectEditor({
  path,
  idPrefix,
  label,
  value,
  pack,
  onPackChange,
  onChange,
  openByDefault,
}: {
  readonly path: string;
  readonly idPrefix: string;
  readonly label: string;
  readonly value: Readonly<Record<string, JsonValue>>;
  readonly pack?: ScenarioPackV1;
  readonly onPackChange?: (pack: ScenarioPackV1) => void;
  readonly onChange: (value: JsonValue) => void;
  readonly openByDefault: boolean;
}): ReactNode {
  const t = useTranslator();
  const [newProperty, setNewProperty] = useState("");
  return (
    <details
      className="scenario-builder__structured"
      open={openByDefault || undefined}
    >
      <summary>
        <span>{label}</span>
        <span className="status status--neutral">
          {t("scenarioAuthor.builder.propertyCount", {
            count: Object.keys(value).length,
          })}
        </span>
      </summary>
      <div className="scenario-builder__structured-body">
        {Object.entries(value).map(([key, childValue], index) => (
          <section
            className="scenario-builder__property"
            key={`${key}:${String(index)}`}
          >
            <div className="scenario-builder__property-name">
              <code>{key}</code>
              <button
                className="button button--quiet"
                type="button"
                onClick={() => {
                  const next = { ...value };
                  delete next[key];
                  onChange(next);
                }}
              >
                {t("scenarioAuthor.builder.remove")}
              </button>
            </div>
            <StructuredValueEditor
              path={`${path}.${key}`}
              idPrefix={`${idPrefix}-${key}`}
              label={schemaFieldLabel(key, t)}
              value={childValue}
              {...(pack === undefined ? {} : { pack })}
              {...(onPackChange === undefined
                ? {}
                : { onPackChange })}
              onChange={(nextValue) =>
                onChange({ ...value, [key]: nextValue })
              }
            />
          </section>
        ))}
        <div className="scenario-builder__add-property">
          <TextControl
            id={`${idPrefix}-new-property`}
            label={t("scenarioAuthor.builder.newProperty")}
            value={newProperty}
            onChange={setNewProperty}
          />
          <button
            className="button button--secondary"
            type="button"
            disabled={
              newProperty.trim().length === 0 ||
              Object.hasOwn(value, newProperty.trim())
            }
            onClick={() => {
              const key = newProperty.trim();
              if (key.length === 0) return;
              onChange({ ...value, [key]: "" });
              setNewProperty("");
            }}
          >
            {t("scenarioAuthor.builder.addProperty")}
          </button>
        </div>
      </div>
    </details>
  );
}

function StructuredPrimitiveEditor({
  id,
  label,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string | number | boolean | null;
  readonly onChange: (value: JsonValue) => void;
}): ReactNode {
  const t = useTranslator();
  const type =
    value === null ? "null" : typeof value;
  return (
    <div className="scenario-builder__primitive">
      <SelectControl
        id={`${id}-type`}
        label={t("scenarioAuthor.builder.valueType")}
        value={type}
        options={[
          {
            value: "string",
            label: t("scenarioAuthor.builder.valueType.string"),
          },
          {
            value: "number",
            label: t("scenarioAuthor.builder.valueType.number"),
          },
          {
            value: "boolean",
            label: t("scenarioAuthor.builder.valueType.boolean"),
          },
          {
            value: "null",
            label: t("scenarioAuthor.builder.valueType.null"),
          },
          {
            value: "object",
            label: t("scenarioAuthor.builder.valueType.object"),
          },
          {
            value: "array",
            label: t("scenarioAuthor.builder.valueType.array"),
          },
        ]}
        onChange={(nextType) =>
          onChange(
            nextType === "number"
              ? 0
              : nextType === "boolean"
                ? false
                : nextType === "null"
                  ? null
                  : nextType === "object"
                    ? {}
                    : nextType === "array"
                      ? []
                      : "",
          )
        }
      />
      {typeof value === "string" ? (
        <TextControl
          id={id}
          label={label}
          value={value}
          onChange={onChange}
        />
      ) : typeof value === "number" ? (
        <NumberControl
          id={id}
          label={label}
          value={value}
          onChange={onChange}
        />
      ) : typeof value === "boolean" ? (
        <ToggleControl
          label={label}
          checked={value}
          onChange={onChange}
        />
      ) : (
        <p className="field__hint">{label}: null</p>
      )}
    </div>
  );
}

function structuredArrayDefault(
  path: string,
  previous: JsonValue | undefined,
): JsonValue {
  if (previous !== undefined) return structuredClone(previous);
  if (
    path.endsWith("indicatorIds") ||
    path.endsWith("rubricIds") ||
    path.endsWith("evidenceRuleIds") ||
    path.endsWith("limitationCodes") ||
    path.endsWith("hiddenConditionReferences")
  ) {
    return "";
  }
  if (path.endsWith("competencyTargets")) {
    return {
      competencyId: "COMPETENCY_NEW",
      indicatorIds: ["INDICATOR_NEW"],
      targetType: "primary",
    };
  }
  if (path.endsWith("evidenceRules")) {
    return {
      evidenceRuleId: "EVIDENCE_RULE_NEW",
      version: "1.0.0",
      indicatorIds: ["INDICATOR_NEW"],
      operator: "EVENT_OCCURRED",
      eventType: "EVENT_TYPE",
    };
  }
  return "";
}

const SCHEMA_FIELD_LABELS: Readonly<Record<string, string>> = {
  frameworkId: "scenarioAuthor.builder.schemaField.frameworkId",
  competencyId: "scenarioAuthor.builder.schemaField.competencyId",
  competencies: "scenarioAuthor.builder.schemaField.competencies",
  description: "scenarioAuthor.builder.schemaField.description",
  indicators: "scenarioAuthor.builder.schemaField.indicators",
  indicatorId: "scenarioAuthor.builder.schemaField.indicatorId",
  statement: "scenarioAuthor.builder.schemaField.statement",
  rubricId: "scenarioAuthor.builder.schemaField.rubricId",
  levels: "scenarioAuthor.builder.schemaField.levels",
  value: "scenarioAuthor.builder.schemaField.levelValue",
  label: "scenarioAuthor.builder.schemaField.label",
  criteria: "scenarioAuthor.builder.schemaField.criteria",
  criterionId: "scenarioAuthor.builder.schemaField.criterionId",
  indicatorIds: "scenarioAuthor.builder.schemaField.indicatorIds",
  evidenceRuleIds:
    "scenarioAuthor.builder.schemaField.evidenceRuleIds",
  evidenceRuleId:
    "scenarioAuthor.builder.schemaField.evidenceRuleId",
  operator: "scenarioAuthor.builder.schemaField.operator",
  eventType: "scenarioAuthor.builder.schemaField.eventType",
  fieldPath: "scenarioAuthor.builder.schemaField.fieldPath",
  expectedValue:
    "scenarioAuthor.builder.schemaField.expectedValue",
  expectedValues:
    "scenarioAuthor.builder.schemaField.expectedValues",
  targetType: "scenarioAuthor.builder.schemaField.targetType",
  version: "scenarioAuthor.builder.schemaField.version",
  status: "scenarioAuthor.builder.schemaField.status",
  title: "scenarioAuthor.builder.schemaField.title",
};

function schemaFieldLabel(
  key: string,
  translate: (localizationKey: string) => string,
): string {
  const localizationKey = SCHEMA_FIELD_LABELS[key];
  return localizationKey === undefined
    ? key
    : translate(localizationKey);
}
