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
  const keys = {
    packTitle: "builder.newScenario.manifest.title",
    packDescription: "builder.newScenario.manifest.description",
    educationalPurpose:
      "builder.newScenario.manifest.educationalPurpose",
    scenarioTitle: "builder.newScenario.scenario.title",
    organizationName: "builder.newScenario.organization.name",
    roleName: "builder.newScenario.role.name",
    briefingTitle: "builder.newScenario.node.briefing.title",
    briefingBody: "builder.newScenario.node.briefing.body",
    completionTitle: "builder.newScenario.node.completion.title",
    completionMessage:
      "builder.newScenario.node.completion.message",
    frameworkTitle: "builder.newScenario.framework.title",
    competencyTitle: "builder.newScenario.competency.title",
    competencyDescription:
      "builder.newScenario.competency.description",
    indicatorStatement: "builder.newScenario.indicator.statement",
    rubricTitle: "builder.newScenario.rubric.title",
    rubricLevel0: "builder.newScenario.rubric.level0",
    rubricLevel1: "builder.newScenario.rubric.level1",
    criterionTitle: "builder.newScenario.criterion.title",
    criterionDescription:
      "builder.newScenario.criterion.description",
  } as const;
  const draft = {
    ...(source.$schema === undefined
      ? {}
      : { $schema: source.$schema }),
    schemaVersion: source.schemaVersion,
    packId: "PACK_NEW_SCENARIO",
    version: "1.0.0",
    status: "draft",
    supportedLocales: ["en", "vi"],
    localizationCatalogs: { en: {}, vi: {} },
    manifest: {
      title: { localizationKey: keys.packTitle },
      description: { localizationKey: keys.packDescription },
      domain: "professional-decision",
      educationalPurpose: {
        localizationKey: keys.educationalPurpose,
      },
    },
    competencyFrameworks: [
      {
        schemaVersion: "1.0.0",
        frameworkId: "FRAMEWORK_NEW",
        version: "1.0.0",
        status: "draft",
        title: { localizationKey: keys.frameworkTitle },
        competencies: [
          {
            competencyId: "COMPETENCY_NEW",
            version: "1.0.0",
            title: { localizationKey: keys.competencyTitle },
            description: {
              localizationKey: keys.competencyDescription,
            },
            indicators: [
              {
                indicatorId: "COMPETENCY_NEW.PI1",
                version: "1.0.0",
                statement: {
                  localizationKey: keys.indicatorStatement,
                },
              },
            ],
          },
        ],
      },
    ],
    rubrics: [
      {
        rubricId: "RUBRIC_NEW",
        version: "1.0.0",
        title: { localizationKey: keys.rubricTitle },
        levels: [
          {
            value: 0,
            label: { localizationKey: keys.rubricLevel0 },
          },
          {
            value: 1,
            label: { localizationKey: keys.rubricLevel1 },
          },
        ],
        criteria: [
          {
            criterionId: "CRITERION_NEW",
            title: { localizationKey: keys.criterionTitle },
            description: {
              localizationKey: keys.criterionDescription,
            },
            indicatorIds: ["COMPETENCY_NEW.PI1"],
            evidenceRuleIds: ["EVIDENCE_RULE_NEW"],
          },
        ],
      },
    ],
    evidenceRules: [
      {
        evidenceRuleId: "EVIDENCE_RULE_NEW",
        version: "1.0.0",
        indicatorIds: ["COMPETENCY_NEW.PI1"],
        operator: "EVENT_OCCURRED",
        eventType: "DECISION_SUBMITTED",
      },
    ],
    portraitAssets: [],
    auditVariantBanks: [],
    scenarios: [
      {
        scenarioId: "SCENARIO_NEW",
        version: "1.0.0",
        status: "draft",
        title: { localizationKey: keys.scenarioTitle },
        supportedModes: ["tutorial"],
        modeConfigurations: [
          {
            ...defaultModeConfiguration("tutorial"),
            outcomeModelId: "OUTCOME_MODEL_DEFAULT",
          },
        ],
        outcomeModels: [
          {
            outcomeModelId: "OUTCOME_MODEL_DEFAULT",
            distribution: "weighted-categorical",
            randomStreamId: "new-scenario-outcome",
            outcomes: [
              { outcomeCode: "OUTCOME_DEFAULT", weight: 1 },
              { outcomeCode: "OUTCOME_ALTERNATIVE", weight: 1 },
            ],
          },
        ],
        competencyTargets: [
          {
            competencyId: "COMPETENCY_NEW",
            indicatorIds: ["COMPETENCY_NEW.PI1"],
            targetType: "primary",
          },
        ],
        organizations: [
          {
            organizationId: "ORG_PRIMARY",
            displayName: {
              localizationKey: keys.organizationName,
            },
          },
        ],
        roles: [
          {
            roleId: "ROLE_DECISION_MAKER",
            organizationId: "ORG_PRIMARY",
            displayName: { localizationKey: keys.roleName },
          },
        ],
        staffProfiles: [],
        assetTypes: [],
        initialState: {
          actualState: {},
          businessState: {},
          ledgerState: {},
          informationState: {},
        },
        policies: [],
        evidenceItems: [],
        instructorIncidents: [],
        counterfactualComparisonDimensions: [],
        counterfactualConditions: [],
        entryNodeId: "NODE_BRIEFING",
        nodes: [
          {
            nodeId: "NODE_BRIEFING",
            nodeType: "BRIEFING",
            title: {
              localizationKey: keys.briefingTitle,
            },
            body: { localizationKey: keys.briefingBody },
            transitions: [
              {
                transitionId:
                  "TRANSITION_BRIEFING_COMPLETE",
                toNodeId: "NODE_COMPLETE",
                when: { kind: "ALWAYS" },
              },
            ],
          },
          {
            nodeId: "NODE_COMPLETE",
            nodeType: "COMPLETION",
            title: {
              localizationKey: keys.completionTitle,
            },
            outcomeCode: "SCENARIO_COMPLETED",
            message: {
              localizationKey: keys.completionMessage,
            },
            transitions: [],
          },
        ],
        rubricIds: ["RUBRIC_NEW"],
        evidenceRuleIds: ["EVIDENCE_RULE_NEW"],
      },
    ],
    assetHashes: {},
  } satisfies ScenarioPackV1;

  setStarterText(
    draft,
    keys.packTitle,
    "scenarioAuthor.builder.default.packTitle",
  );
  setStarterText(
    draft,
    keys.packDescription,
    "scenarioAuthor.builder.default.packDescription",
  );
  setStarterText(
    draft,
    keys.educationalPurpose,
    "scenarioAuthor.builder.default.educationalPurpose",
  );
  setStarterText(
    draft,
    keys.scenarioTitle,
    "scenarioAuthor.builder.default.scenarioTitle",
  );
  setStarterText(
    draft,
    keys.organizationName,
    "scenarioAuthor.builder.default.organizationName",
  );
  setStarterText(
    draft,
    keys.roleName,
    "scenarioAuthor.builder.default.roleName",
  );
  setStarterText(
    draft,
    keys.briefingTitle,
    "scenarioAuthor.builder.default.briefingTitle",
  );
  setStarterText(
    draft,
    keys.briefingBody,
    "scenarioAuthor.builder.default.briefingBody",
  );
  setStarterText(
    draft,
    keys.completionTitle,
    "scenarioAuthor.builder.default.completionTitle",
  );
  setStarterText(
    draft,
    keys.completionMessage,
    "scenarioAuthor.builder.default.completionMessage",
  );
  setStarterText(
    draft,
    keys.frameworkTitle,
    "scenarioAuthor.builder.default.frameworkTitle",
  );
  setStarterText(
    draft,
    keys.competencyTitle,
    "scenarioAuthor.builder.default.competencyTitle",
  );
  setStarterText(
    draft,
    keys.competencyDescription,
    "scenarioAuthor.builder.default.competencyDescription",
  );
  setStarterText(
    draft,
    keys.indicatorStatement,
    "scenarioAuthor.builder.default.indicatorStatement",
  );
  setStarterText(
    draft,
    keys.rubricTitle,
    "scenarioAuthor.builder.default.rubricTitle",
  );
  setStarterText(
    draft,
    keys.rubricLevel0,
    "scenarioAuthor.builder.default.rubricLevel0",
  );
  setStarterText(
    draft,
    keys.rubricLevel1,
    "scenarioAuthor.builder.default.rubricLevel1",
  );
  setStarterText(
    draft,
    keys.criterionTitle,
    "scenarioAuthor.builder.default.criterionTitle",
  );
  setStarterText(
    draft,
    keys.criterionDescription,
    "scenarioAuthor.builder.default.criterionDescription",
  );
  return draft;
}

export function uniqueLocalizationPrefix(
  pack: ScenarioPackV1,
  requestedPrefix: string,
  suffixes: readonly string[],
): string {
  const used = new Set(
    [
      ...Object.values(pack.localizationCatalogs ?? {}).flatMap(
        (catalog) => Object.keys(catalog),
      ),
      ...localizedReferenceKeys(pack),
    ],
  );
  let candidate = requestedPrefix;
  let suffix = 2;
  while (
    suffixes.some((ending) => used.has(`${candidate}${ending}`))
  ) {
    candidate = `${requestedPrefix}_${String(suffix)}`;
    suffix += 1;
  }
  return candidate;
}

function localizedReferenceKeys(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(localizedReferenceKeys);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const record = value as Readonly<Record<string, unknown>>;
  return [
    ...(typeof record.localizationKey === "string"
      ? [record.localizationKey]
      : []),
    ...Object.values(record).flatMap(localizedReferenceKeys),
  ];
}

export function countExactIdentifierOccurrences(
  value: unknown,
  identifier: string,
): number {
  if (typeof value === "string") {
    return value === identifier ? 1 : 0;
  }
  if (Array.isArray(value)) {
    return value.reduce(
      (total, child) =>
        total + countExactIdentifierOccurrences(child, identifier),
      0,
    );
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).reduce(
      (total, child) =>
        total + countExactIdentifierOccurrences(child, identifier),
      0,
    );
  }
  return 0;
}

interface StableIdentifier {
  readonly stableKey: string;
  readonly identifier: string;
}

function scenarioIdentifiers(
  scenario: ScenarioDefinitionV1,
): readonly StableIdentifier[] {
  return [
    {
      stableKey: `scenario:${scenario.title.localizationKey}`,
      identifier: scenario.scenarioId,
    },
    ...scenario.organizations.map((organization) => ({
      stableKey: `organization:${organization.displayName.localizationKey}`,
      identifier: organization.organizationId,
    })),
    ...scenario.roles.map((role) => ({
      stableKey: `role:${role.displayName.localizationKey}`,
      identifier: role.roleId,
    })),
    ...scenario.policies.map((policy) => ({
      stableKey: `policy:${policy.title.localizationKey}`,
      identifier: policy.policyId,
    })),
    ...scenario.evidenceItems.map((evidence) => ({
      stableKey: `evidence:${evidence.title.localizationKey}`,
      identifier: evidence.evidenceId,
    })),
    ...scenario.instructorIncidents.map((incident) => ({
      stableKey: `incident:${incident.title.localizationKey}`,
      identifier: incident.incidentId,
    })),
    ...scenario.outcomeModels.map((model) => ({
      stableKey: `outcome-model:${model.randomStreamId}`,
      identifier: model.outcomeModelId,
    })),
    ...scenario.nodes.flatMap((node) => [
      {
        stableKey: `node:${node.title.localizationKey}`,
        identifier: node.nodeId,
      },
      ...(node.nodeType === "DECISION"
        ? [
            {
              stableKey: `decision:${node.title.localizationKey}`,
              identifier: node.decisionId,
            },
            ...node.fields.flatMap((field) => [
              {
                stableKey: `field:${field.prompt.localizationKey}`,
                identifier: field.fieldId,
              },
              ...field.options.map((option) => ({
                stableKey: `option:${option.label.localizationKey}`,
                identifier: option.optionId,
              })),
            ]),
          ]
        : []),
    ]),
  ];
}

function packIdentifiers(
  pack: ScenarioPackV1,
): readonly StableIdentifier[] {
  return [
    ...pack.scenarios.map((scenario) => ({
      stableKey: `scenario:${scenario.title.localizationKey}`,
      identifier: scenario.scenarioId,
    })),
    ...pack.competencyFrameworks.flatMap((framework) => [
      {
        stableKey: `framework:${framework.title.localizationKey}`,
        identifier: framework.frameworkId,
      },
      ...framework.competencies.flatMap((competency) => [
        {
          stableKey: `competency:${competency.title.localizationKey}`,
          identifier: competency.competencyId,
        },
        ...competency.indicators.map((indicator) => ({
          stableKey: `indicator:${indicator.statement.localizationKey}`,
          identifier: indicator.indicatorId,
        })),
      ]),
    ]),
    ...pack.rubrics.flatMap((rubric) => [
      {
        stableKey: `rubric:${rubric.title.localizationKey}`,
        identifier: rubric.rubricId,
      },
      ...rubric.criteria.map((criterion) => ({
        stableKey: `criterion:${criterion.title.localizationKey}`,
        identifier: criterion.criterionId,
      })),
    ]),
    ...pack.evidenceRules.map((rule, index) => ({
      /*
       * Evidence rules have no localized title or other immutable authored
       * key. Their collection position is stable because this editor only
       * appends and removes rules; using the remaining rule content made two
       * newly created, otherwise-identical rules look like one rename.
       */
      stableKey: `evidence-rule:${String(index)}`,
      identifier: rule.evidenceRuleId,
    })),
  ];
}

function changedIdentifierMap(
  previous: readonly StableIdentifier[],
  next: readonly StableIdentifier[],
): ReadonlyMap<string, string> {
  const previousByKey = new Map(
    previous.map((entry) => [entry.stableKey, entry.identifier]),
  );
  const previousIdentifierCounts = new Map<string, number>();
  previous.forEach((entry) => {
    previousIdentifierCounts.set(
      entry.identifier,
      (previousIdentifierCounts.get(entry.identifier) ?? 0) + 1,
    );
  });
  return new Map(
    next.flatMap((entry) => {
      const oldIdentifier = previousByKey.get(entry.stableKey);
      return oldIdentifier !== undefined &&
        oldIdentifier !== entry.identifier &&
        /*
         * A duplicated invalid identifier has no unambiguous reference
         * target. Renaming one occurrence must repair only that record;
         * propagating the edit would rename every duplicate and leave the
         * author unable to recover the draft through the builder.
         */
        previousIdentifierCounts.get(oldIdentifier) === 1
        ? [[oldIdentifier, entry.identifier] as const]
        : [];
    }),
  );
}

const STRUCTURAL_LITERAL_FIELDS = new Set([
  "accessClassification",
  "acquisitionMode",
  "completeness",
  "contentStatus",
  "distribution",
  "feedbackTiming",
  "kind",
  "ledgerStatus",
  "mode",
  "nodeType",
  "operator",
  "outcomeStrategy",
  "reliability",
  "seedPolicy",
  "selection",
  "signatureStatus",
  "status",
  "targetType",
  "type",
]);

function mayContainIdentifierReference(field: string): boolean {
  return (
    field.endsWith("Id") ||
    field.endsWith("Ids") ||
    field === "authoredValue"
  );
}

function replaceExactIdentifiers<Value>(
  value: Value,
  replacements: ReadonlyMap<string, string>,
  parentField?: string,
): Value {
  if (typeof value === "string") {
    const replacement = replacements.get(value);
    if (
      replacement === undefined ||
      (value.length === 0 &&
        (parentField === undefined ||
          !mayContainIdentifierReference(parentField)))
    ) {
      return value;
    }
    return replacement as Value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      replaceExactIdentifiers(item, replacements, parentField),
    ) as Value;
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        STRUCTURAL_LITERAL_FIELDS.has(key)
          ? child
          : replaceExactIdentifiers(child, replacements, key),
      ]),
    ) as Value;
  }
  return value;
}

/**
 * Apply an identifier edit and every exact reference to it as one change.
 *
 * Stable localization references identify authored records across a render,
 * so deleting or reordering a collection cannot be mistaken for a rename.
 */
export function reconcileScenarioPackReferences(
  previous: ScenarioPackV1,
  next: ScenarioPackV1,
): ScenarioPackV1 {
  let reconciled = structuredClone(next);
  const packReplacements = changedIdentifierMap(
    packIdentifiers(previous),
    packIdentifiers(next),
  );
  if (packReplacements.size > 0) {
    const catalogs = reconciled.localizationCatalogs;
    reconciled = replaceExactIdentifiers(
      reconciled,
      packReplacements,
    );
    if (catalogs !== undefined) {
      reconciled = {
        ...reconciled,
        localizationCatalogs: catalogs,
      };
    }
  }

  const previousScenarios = new Map(
    previous.scenarios.map((scenario) => [
      scenario.title.localizationKey,
      scenario,
    ]),
  );
  reconciled = {
    ...reconciled,
    scenarios: reconciled.scenarios.map((scenario) => {
      const previousScenario = previousScenarios.get(
        scenario.title.localizationKey,
      );
      if (previousScenario === undefined) return scenario;
      const replacements = changedIdentifierMap(
        scenarioIdentifiers(previousScenario),
        scenarioIdentifiers(scenario),
      );
      return replacements.size === 0
        ? scenario
        : replaceExactIdentifiers(scenario, replacements);
    }),
  };
  return reconciled;
}

function rekeyLocalizedReferences(
  value: unknown,
  localizationPrefix: string,
): ReadonlyMap<string, string> {
  const replacements = new Map<string, string>();
  function visit(candidate: unknown): void {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (typeof candidate !== "object" || candidate === null) return;
    const record = candidate as Record<string, unknown>;
    if (
      Object.keys(record).length === 1 &&
      typeof record.localizationKey === "string"
    ) {
      const previousKey = record.localizationKey;
      let nextKey = replacements.get(previousKey);
      if (nextKey === undefined) {
        nextKey = `${localizationPrefix}.text.${String(
          replacements.size + 1,
        )}`;
        replacements.set(previousKey, nextKey);
      }
      record.localizationKey = nextKey;
      return;
    }
    Object.values(record).forEach(visit);
  }
  visit(value);
  return replacements;
}

export function appendIndependentScenarioCopy(
  pack: ScenarioPackV1,
  sourceScenarioIndex: number,
): ScenarioPackV1 {
  return changeScenarioPack(pack, (draft) => {
    const source = draft.scenarios[sourceScenarioIndex];
    if (source === undefined) return;
    const scenarioId = uniqueIdentifier(
      draft.scenarios.map((scenario) => scenario.scenarioId),
      "SCENARIO_NEW",
    );
    let copy = structuredClone(source);
    copy = replaceExactIdentifiers(
      copy,
      new Map([[copy.scenarioId, scenarioId]]),
    );
    copy.scenarioId = scenarioId;
    copy.version = "1.0.0";
    copy.status = "draft";
    delete copy.hostedRuntime;
    delete copy.auditCase;
    const localizedReplacements = rekeyLocalizedReferences(
      copy,
      `builder.${scenarioId}`,
    );
    draft.localizationCatalogs ??= {};
    for (const locale of draft.supportedLocales) {
      const catalog = draft.localizationCatalogs[locale] ?? {};
      for (const [previousKey, nextKey] of localizedReplacements) {
        catalog[nextKey] = catalog[previousKey] ?? "";
      }
      draft.localizationCatalogs[locale] = catalog;
    }
    draft.scenarios.push(copy);
  });
}

export function defaultModeConfiguration(mode: HostedRunMode) {
  return {
    mode,
    allowHints: mode === "tutorial",
    allowRetry: mode === "tutorial" || mode === "sandbox",
    allowBacktracking: mode !== "configured",
    feedbackTiming:
      mode === "standard" || mode === "configured"
        ? "final" as const
        : "immediate" as const,
    showScores: false,
    outcomeStrategy:
      mode === "sandbox" ? "probabilistic" as const : "forced" as const,
    seedPolicy:
      mode === "configured" ? "supplied" as const : "generated" as const,
    allowCommunication: false,
    allowEvidenceRequests: false,
    outcomeModelId: "OUTCOME_MODEL_DEFAULT",
    ...(mode === "sandbox"
      ? {}
      : { forcedOutcomeCode: "OUTCOME_DEFAULT" }),
  };
}

export function defaultScenarioNode(
  type: ScenarioNodeV1["nodeType"],
  scenario: ScenarioDefinitionV1,
  authoredLocalizationPrefix?: string,
): ScenarioNodeV1 {
  const existingIds = scenario.nodes.map((node) => node.nodeId);
  const nodeId = uniqueIdentifier(existingIds, `NODE_${type}`);
  const localizationKey =
    authoredLocalizationPrefix ??
    `builder.${scenario.scenarioId}.${nodeId}`;
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
      {
        const model = scenario.outcomeModels[0];
        const resultCodes =
          model === undefined
            ? ["OUTCOME_A", "OUTCOME_B"]
            : model.distribution === "bernoulli"
              ? [model.onTrue, model.onFalse]
              : model.outcomes.map((outcome) => outcome.outcomeCode);
        return {
          ...common,
          nodeType: type,
          randomStreamId:
            model?.randomStreamId ?? "RANDOM_STREAM_DEFAULT",
          outcomes: resultCodes.map((resultCode, index) => ({
            outcomeId: `DRAW_${String(index + 1)}`,
            weight: 1,
            resultCode,
            label: {
              localizationKey:
                `${localizationKey}.outcome.${String(index + 1)}`,
            },
          })),
        };
      }
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
        message: { localizationKey: `${localizationKey}.message` },
      };
  }
}
