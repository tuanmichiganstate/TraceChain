import pharmaceuticalPackJson from "../../../scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json";
import challengeAuditPackJson from "../../../scenario-packs/challenge-coffee-audit/tracechain.pack.json";
import type {
  ScenarioNodeV1,
  ScenarioPackV1,
} from "../contracts/scenario-pack";
import { validateScenarioPack } from "../scenario-packs/validation";
import {
  appendIndependentScenarioCopy,
  changeScenarioPack,
  countExactIdentifierOccurrences,
  createScenarioBuilderStarter,
  defaultScenarioNode,
  reconcileScenarioPackReferences,
  uniqueIdentifier,
  uniqueLocalizationPrefix,
} from "./scenario-builder-model";

describe("Scenario Builder model", () => {
  it("creates a complete valid draft without changing its source", () => {
    const source = structuredClone(
      pharmaceuticalPackJson,
    ) as ScenarioPackV1;
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

  it("provides a schema-shaped starting node for every workflow type", () => {
    const scenario = createScenarioBuilderStarter(
      structuredClone(pharmaceuticalPackJson) as ScenarioPackV1,
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
  });

  it("normalizes and de-duplicates generated identifiers", () => {
    expect(
      uniqueIdentifier(["POLICY_NEW", "POLICY_NEW_2"], "policy new"),
    ).toBe("POLICY_NEW_3");
  });

  it("does not reuse an authored localization reference without an inline catalog", () => {
    const starter = createScenarioBuilderStarter(
      structuredClone(pharmaceuticalPackJson) as ScenarioPackV1,
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
      structuredClone(pharmaceuticalPackJson) as ScenarioPackV1,
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
    ) as ScenarioPackV1;
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
});
