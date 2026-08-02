import pharmaceuticalPackJson from "../../../scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json";
import challengeAuditPackJson from "../../../scenario-packs/challenge-coffee-audit/tracechain.pack.json";
import type {
  ScenarioNodeV1,
  ScenarioPackV2,
} from "../contracts/scenario-pack";
import { validateScenarioPack } from "../scenario-packs/validation";
import {
  appendIndependentScenarioCopy,
  changeScenarioPack,
  countExactIdentifierOccurrences,
  createScenarioBuilderStarter,
  defaultModeConfiguration,
  defaultScenarioNode,
  reconcileScenarioPackReferences,
  uniqueIdentifier,
  uniqueLocalizationPrefix,
} from "./scenario-builder-model";

describe("Scenario Builder model", () => {
  it("creates a complete valid draft without changing its source", () => {
    const source = structuredClone(
      pharmaceuticalPackJson,
    ) as ScenarioPackV2;
    const original = structuredClone(source);

    const starter = createScenarioBuilderStarter(source);
    const result = validateScenarioPack(starter);

    expect(source).toEqual(original);
    expect(starter).toMatchObject({
      packId: "PACK_NEW_SCENARIO",
      version: "1.0.0",
      status: "draft",
      manifest: { domain: "professional-decision" },
    });
    expect(starter.scenarios).toHaveLength(1);
    expect(starter.scenarios[0]).toMatchObject({
      scenarioId: "SCENARIO_NEW",
      version: "1.0.0",
      status: "draft",
    });
    expect(JSON.stringify(starter)).not.toContain("PHARMA");
    expect(starter.competencyFrameworks).toHaveLength(1);
    expect(starter.rubrics).toHaveLength(1);
    expect(starter.evidenceRules).toHaveLength(1);
    expect(starter.scenarios[0]?.policies).toEqual([]);
    expect(starter.scenarios[0]?.evidenceItems).toEqual([]);
    expect(starter.scenarios[0]?.instructorIncidents).toEqual([]);
    expect(starter.scenarios[0]?.nodes).toHaveLength(2);
    expect(starter.scenarios[0]?.hostedRuntime).toBeUndefined();
    expect(starter.scenarios[0]?.auditCase).toBeUndefined();
    expect(result.issues).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it("creates assessment-safe defaults for standard mode", () => {
    expect(defaultModeConfiguration("standard")).toMatchObject({
      mode: "standard",
      allowHints: false,
      allowRetry: false,
      feedbackTiming: "final",
      outcomeStrategy: "forced",
    });
    expect(defaultModeConfiguration("tutorial").feedbackTiming).toBe(
      "immediate",
    );
  });

  it("provides a schema-shaped starting node for every workflow type", () => {
    const scenario = createScenarioBuilderStarter(
      structuredClone(pharmaceuticalPackJson) as ScenarioPackV2,
    ).scenarios[0]!;
    const nodeTypes: readonly ScenarioNodeV1["nodeType"][] = [
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

    expect(
      nodeTypes.map((nodeType) =>
        defaultScenarioNode(nodeType, scenario),
      ),
    ).toEqual(
      nodeTypes.map((nodeType) =>
        expect.objectContaining({
          nodeId: expect.stringContaining(`NODE_${nodeType}`),
          nodeType,
          transitions: [],
        }),
      ),
    );
    const stochastic = defaultScenarioNode(
      "STOCHASTIC_EVENT",
      scenario,
    );
    expect(
      stochastic.nodeType === "STOCHASTIC_EVENT" &&
        stochastic.outcomes.every(
          (outcome) => outcome.label !== undefined,
        ),
    ).toBe(true);
    const completion = defaultScenarioNode("COMPLETION", scenario);
    expect(
      completion.nodeType === "COMPLETION" &&
        completion.message !== undefined,
    ).toBe(true);
  });

  it("normalizes and de-duplicates generated identifiers", () => {
    expect(
      uniqueIdentifier(["POLICY_NEW", "POLICY_NEW_2"], "policy new"),
    ).toBe("POLICY_NEW_3");
  });

  it("does not reuse an authored localization reference without an inline catalog", () => {
    const starter = createScenarioBuilderStarter(
      structuredClone(pharmaceuticalPackJson) as ScenarioPackV2,
    );
    const withoutCatalog = changeScenarioPack(starter, (draft) => {
      delete draft.localizationCatalogs;
    });

    expect(
      uniqueLocalizationPrefix(
        withoutCatalog,
        "builder.newScenario.node.briefing",
        [".title", ".body"],
      ),
    ).toBe("builder.newScenario.node.briefing_2");
  });

  it("counts exact identifier references without matching prose", () => {
    expect(
      countExactIdentifierOccurrences(
        {
          evidenceId: "EVIDENCE_A",
          evidenceIds: ["EVIDENCE_A", "EVIDENCE_B"],
          description: "Review EVIDENCE_A before deciding.",
        },
        "EVIDENCE_A",
      ),
    ).toBe(2);
  });

  it("gives a copied scenario independent localized content", () => {
    const starter = createScenarioBuilderStarter(
      structuredClone(pharmaceuticalPackJson) as ScenarioPackV2,
    );
    const copied = appendIndependentScenarioCopy(starter, 0);
    const first = copied.scenarios[0]!;
    const second = copied.scenarios[1]!;

    expect(second.scenarioId).not.toBe(first.scenarioId);
    expect(second.title.localizationKey).not.toBe(
      first.title.localizationKey,
    );
    expect(
      copied.localizationCatalogs?.en?.[
        second.title.localizationKey
      ],
    ).toBe(
      copied.localizationCatalogs?.en?.[
        first.title.localizationKey
      ],
    );
  });

  it("updates pack-level references when a scenario identifier changes", () => {
    const source = structuredClone(
      challengeAuditPackJson,
    ) as ScenarioPackV2;
    const renamed = changeScenarioPack(source, (draft) => {
      draft.scenarios[0]!.scenarioId =
        "SCN_COFFEE_AUDIT_CHALLENGE_RENAMED";
    });
    const reconciled = reconcileScenarioPackReferences(
      source,
      renamed,
    );

    expect(reconciled.scenarios[0]?.scenarioId).toBe(
      "SCN_COFFEE_AUDIT_CHALLENGE_RENAMED",
    );
    expect(
      reconciled.auditVariantBanks[0]?.variants[0]?.scenarioId,
    ).toBe("SCN_COFFEE_AUDIT_CHALLENGE_RENAMED");
  });

  it("updates mode references when an outcome model identifier changes", () => {
    const source = createScenarioBuilderStarter(
      structuredClone(pharmaceuticalPackJson) as ScenarioPackV2,
    );
    const renamed = changeScenarioPack(source, (draft) => {
      draft.scenarios[0]!.outcomeModels[0]!.outcomeModelId =
        "OUTCOME_MODEL_PROCUREMENT_REVIEW";
    });
    const reconciled = reconcileScenarioPackReferences(
      source,
      renamed,
    );

    expect(
      reconciled.scenarios[0]?.modeConfigurations[0]
        ?.outcomeModelId,
    ).toBe("OUTCOME_MODEL_PROCUREMENT_REVIEW");
  });

  it("keeps identical newly added evidence rules independently addressable", () => {
    const source = createScenarioBuilderStarter(
      structuredClone(pharmaceuticalPackJson) as ScenarioPackV2,
    );
    const added = changeScenarioPack(source, (draft) => {
      const first = draft.evidenceRules[0]!;
      draft.evidenceRules.push({
        ...structuredClone(first),
        evidenceRuleId: "EVIDENCE_RULE_NEW_2",
      });
    });
    const reconciled = reconcileScenarioPackReferences(source, added);

    expect(
      reconciled.evidenceRules.map((rule) => rule.evidenceRuleId),
    ).toEqual(["EVIDENCE_RULE_NEW", "EVIDENCE_RULE_NEW_2"]);

    const edited = changeScenarioPack(reconciled, (draft) => {
      draft.evidenceRules[1]!.eventType = "RECALL_INITIATED";
    });
    const editedReconciled = reconcileScenarioPackReferences(
      reconciled,
      edited,
    );
    expect(editedReconciled.evidenceRules[0]?.eventType).toBe(
      "DECISION_SUBMITTED",
    );
    expect(editedReconciled.evidenceRules[1]?.eventType).toBe(
      "RECALL_INITIATED",
    );
  });

  it("lets an author repair one duplicated evidence-rule identifier at a time", () => {
    const starter = createScenarioBuilderStarter(
      structuredClone(pharmaceuticalPackJson) as ScenarioPackV2,
    );
    const duplicated = changeScenarioPack(starter, (draft) => {
      const sourceRule = draft.evidenceRules[0]!;
      sourceRule.evidenceRuleId = "EVIDENCE_RULE_DUPLICATED";
      draft.evidenceRules.push(
        structuredClone(sourceRule),
        structuredClone(sourceRule),
      );
      draft.scenarios[0]!.evidenceRuleIds = [
        "EVIDENCE_RULE_DUPLICATED",
      ];
    });
    const repaired = changeScenarioPack(duplicated, (draft) => {
      draft.evidenceRules[1]!.evidenceRuleId =
        "EVIDENCE_RULE_GOVERNANCE_DECISION";
    });
    const reconciled = reconcileScenarioPackReferences(
      duplicated,
      repaired,
    );

    expect(
      reconciled.evidenceRules.map((rule) => rule.evidenceRuleId),
    ).toEqual([
      "EVIDENCE_RULE_DUPLICATED",
      "EVIDENCE_RULE_GOVERNANCE_DECISION",
      "EVIDENCE_RULE_DUPLICATED",
    ]);
    expect(reconciled.scenarios[0]?.evidenceRuleIds).toEqual([
      "EVIDENCE_RULE_DUPLICATED",
    ]);
  });
});
