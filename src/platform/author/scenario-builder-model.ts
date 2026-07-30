import type {
  HostedRunMode,
  ScenarioDefinitionV1,
  ScenarioNodeV1,
  ScenarioPackV1,
} from "../contracts/scenario-pack";
import en from "../../locales/en.json";
import vi from "../../locales/vi.json";

export type DeepMutable<Value> =
  Value extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : Value extends object
      ? {
          -readonly [Key in keyof Value]: DeepMutable<Value[Key]>;
        }
      : Value;

export function changeScenarioPack(
  pack: ScenarioPackV1,
  mutation: (draft: DeepMutable<ScenarioPackV1>) => void,
): ScenarioPackV1 {
  const draft = structuredClone(pack) as DeepMutable<ScenarioPackV1>;
  mutation(draft);
  return draft;
}

function catalogValue(
  draft: DeepMutable<ScenarioPackV1>,
  locale: string,
  localizationKey: string,
  value: string,
): void {
  if (draft.localizationCatalogs === undefined) {
    draft.localizationCatalogs = {};
  }
  const localeCatalog =
    draft.localizationCatalogs[locale] ?? {};
  localeCatalog[localizationKey] = value;
  draft.localizationCatalogs[locale] = localeCatalog;
}

export function updateLocalizedValue(
  pack: ScenarioPackV1,
  localizationKey: string,
  locale: string,
  value: string,
): ScenarioPackV1 {
  return changeScenarioPack(pack, (draft) => {
    catalogValue(draft, locale, localizationKey, value);
  });
}

export function uniqueIdentifier(
  existing: readonly string[],
  prefix: string,
): string {
  const normalized = prefix
    .trim()
    .replaceAll(/[^A-Za-z0-9_]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "")
    .toUpperCase();
  const base = normalized.length === 0 ? "ITEM" : normalized;
  let candidate = base;
  let suffix = 2;
  while (existing.includes(candidate)) {
    candidate = `${base}_${String(suffix)}`;
    suffix += 1;
  }
  return candidate;
}

function setStarterText(
  draft: DeepMutable<ScenarioPackV1>,
  localizationKey: string,
  catalogKey: keyof typeof en,
): void {
  catalogValue(draft, "en", localizationKey, en[catalogKey]);
  catalogValue(draft, "vi", localizationKey, vi[catalogKey]);
}

export function createScenarioBuilderStarter(
  source: ScenarioPackV1,
): ScenarioPackV1 {
  const draft = structuredClone(source) as DeepMutable<ScenarioPackV1>;
  const firstScenario = draft.scenarios[0];
  if (firstScenario === undefined) {
    throw new Error("The Scenario Builder starter requires one scenario.");
  }

  draft.packId = "PACK_NEW_SCENARIO";
  draft.version = "1.0.0";
  draft.status = "draft";
  delete draft.publication;
  draft.manifest.domain = "professional-decision";
  draft.auditVariantBanks = [];
  draft.scenarios = [firstScenario];

  firstScenario.scenarioId = "SCENARIO_NEW";
  firstScenario.version = "1.0.0";
  firstScenario.status = "draft";
  delete firstScenario.auditCase;
  delete firstScenario.hostedRuntime;

  setStarterText(
    draft,
    draft.manifest.title.localizationKey,
    "scenarioAuthor.builder.default.packTitle",
  );
  setStarterText(
    draft,
    draft.manifest.description.localizationKey,
    "scenarioAuthor.builder.default.packDescription",
  );
  setStarterText(
    draft,
    draft.manifest.educationalPurpose.localizationKey,
    "scenarioAuthor.builder.default.educationalPurpose",
  );
  setStarterText(
    draft,
    firstScenario.title.localizationKey,
    "scenarioAuthor.builder.default.scenarioTitle",
  );
  return draft;
}

export function defaultModeConfiguration(mode: HostedRunMode) {
  return {
    mode,
    allowHints: mode === "tutorial",
    allowRetry: mode === "tutorial" || mode === "sandbox",
    allowBacktracking: mode !== "configured",
    feedbackTiming:
      mode === "configured" ? "final" as const : "immediate" as const,
    showScores: mode !== "configured",
    outcomeStrategy:
      mode === "sandbox" ? "probabilistic" as const : "forced" as const,
    seedPolicy:
      mode === "configured" ? "supplied" as const : "generated" as const,
    allowCommunication: false,
    allowEvidenceRequests: false,
    ...(mode === "sandbox"
      ? { outcomeModelId: "OUTCOME_MODEL_DEFAULT" }
      : { forcedOutcomeCode: "OUTCOME_DEFAULT" }),
  };
}

export function defaultScenarioNode(
  type: ScenarioNodeV1["nodeType"],
  scenario: ScenarioDefinitionV1,
): ScenarioNodeV1 {
  const existingIds = scenario.nodes.map((node) => node.nodeId);
  const nodeId = uniqueIdentifier(existingIds, `NODE_${type}`);
  const localizationKey = `builder.${scenario.scenarioId}.${nodeId}`;
  const common = {
    nodeId,
    nodeType: type,
    title: { localizationKey: `${localizationKey}.title` },
    transitions: [],
  } as const;

  switch (type) {
    case "BRIEFING":
      return {
        ...common,
        nodeType: type,
        body: { localizationKey: `${localizationKey}.body` },
      };
    case "EVIDENCE_RELEASE":
      return { ...common, nodeType: type, evidenceIds: [] };
    case "DECISION":
      return {
        ...common,
        nodeType: type,
        decisionId: uniqueIdentifier(
          scenario.nodes.flatMap((node) =>
            node.nodeType === "DECISION" ? [node.decisionId] : [],
          ),
          "DECISION",
        ),
        prompt: { localizationKey: `${localizationKey}.prompt` },
        fields: [
          {
            fieldId: "CHOICE",
            prompt: {
              localizationKey: `${localizationKey}.field.choice`,
            },
            selection: "single",
            options: [
              {
                optionId: "OPTION_A",
                label: {
                  localizationKey: `${localizationKey}.option.a`,
                },
                authoredValue: "OPTION_A",
              },
              {
                optionId: "OPTION_B",
                label: {
                  localizationKey: `${localizationKey}.option.b`,
                },
                authoredValue: "OPTION_B",
              },
            ],
          },
        ],
        justification: { required: false, maximumLength: 500 },
      };
    case "TRANSACTION_PROPOSAL":
      return {
        ...common,
        nodeType: type,
        proposalType: "BUSINESS_ACTION",
        sourceDecisionId: "",
        policyIds: [],
      };
    case "ENDORSEMENT":
      return {
        ...common,
        nodeType: type,
        proposalNodeId: "",
        policyId: "",
        permittedRoleIds: [],
      };
    case "POLICY_CHECK":
      return {
        ...common,
        nodeType: type,
        policyId: "",
        proposalNodeId: "",
      };
    case "COMMUNICATION":
      return {
        ...common,
        nodeType: type,
        messageId: uniqueIdentifier([], "MESSAGE"),
        message: { localizationKey: `${localizationKey}.message` },
        visibleToRoleIds: [],
      };
    case "STOCHASTIC_EVENT":
      return {
        ...common,
        nodeType: type,
        randomStreamId: "RANDOM_STREAM_DEFAULT",
        outcomes: [
          { outcomeId: "OUTCOME_A", weight: 1, resultCode: "RESULT_A" },
          { outcomeId: "OUTCOME_B", weight: 1, resultCode: "RESULT_B" },
        ],
      };
    case "CONSEQUENCE":
      return {
        ...common,
        nodeType: type,
        consequenceCode: "CONSEQUENCE_DEFAULT",
        message: { localizationKey: `${localizationKey}.message` },
      };
    case "FEEDBACK":
      return {
        ...common,
        nodeType: type,
        feedbackCode: "FEEDBACK_DEFAULT",
        message: { localizationKey: `${localizationKey}.message` },
      };
    case "REFLECTION":
      return {
        ...common,
        nodeType: type,
        reflectionId: uniqueIdentifier([], "REFLECTION"),
        prompt: { localizationKey: `${localizationKey}.prompt` },
        maximumLength: 1_000,
      };
    case "COMPLETION":
      return {
        ...common,
        nodeType: type,
        outcomeCode: "OUTCOME_COMPLETE",
      };
  }
}
