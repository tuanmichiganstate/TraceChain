import packJson from "../../../scenario-packs/standard-coffee-stage3/tracechain.pack.json";
import pharmaceuticalPackJson from "../../../scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json";
import { coffeeCryptographicRuntime } from "../../scenarios/coffee-traceability/cryptographic-runtime";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import en from "../../locales/en.json";
import vi from "../../locales/vi.json";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import { validateScenarioPack } from "./validation";

const validate = (value: unknown) =>
  validateScenarioPack(value, {
    localizationCatalogs: { en, vi },
  });

function validPack(): ScenarioPackV1 {
  const result = validate(structuredClone(packJson));
  if (!result.isValid) {
    throw new Error(
      result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("\n"),
    );
  }
  return result.pack;
}

describe("scenario-pack validation", () => {
  it("validates the bilingual Stage 3 compatibility pack", () => {
    const result = validate(structuredClone(packJson));

    expect(result.isValid).toBe(true);
    expect(result.checkedCount).toBeGreaterThan(2_000);
    if (result.isValid) {
      const competencies =
        result.pack.competencyFrameworks[0]?.competencies ?? [];
      expect(competencies.map((item) => item.competencyId)).toEqual([
        "BC1",
        "BC2",
        "BC3",
        "BC4",
        "BC5",
        "BC6",
        "BC7",
        "BC8",
        "PC1",
        "PC2",
        "PC3",
        "PC4",
        "PC5",
        "PC6",
        "PC7",
        "PC8",
        "PC9",
        "PC10",
      ]);
    }
  });

  it("validates a self-localized disciplinary starter without source catalog changes", () => {
    const result = validateScenarioPack(
      structuredClone(pharmaceuticalPackJson),
    );

    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.pack.manifest.domain).toBe(
        "pharmaceutical-cold-chain",
      );
      expect(
        result.pack.competencyFrameworks[0]?.competencies[0]
          ?.competencyId,
      ).toBe("PHARMA.COLD_CHAIN");
      expect(result.pack.localizationCatalogs?.vi).toBeDefined();
    }
  });

  it("returns path-specific diagnostics for missing locale content", () => {
    const invalid = structuredClone(packJson) as {
      manifest: { title: { localizationKey: string } };
    };
    invalid.manifest.title.localizationKey = "platformPack.missing.title";

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "MISSING_LOCALIZATION_KEY",
          path: "$.manifest.title.localizationKey",
        }),
      );
    }
  });

  it("requires exactly one published configuration for every supported mode", () => {
    const invalid = structuredClone(packJson);
    const scenario = invalid.scenarios[0];
    if (scenario === undefined) throw new Error("Expected scenario.");
    scenario.modeConfigurations =
      scenario.modeConfigurations.filter(
        (configuration) => configuration.mode !== "sandbox",
      );

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "MODE_CONFIGURATION_MISMATCH",
          path: "$.scenarios[0].modeConfigurations",
        }),
      );
    }
  });

  it("accepts the pre-mode-config coffee pack only through its registered legacy adapter", () => {
    const legacy = structuredClone(packJson) as unknown as {
      scenarios: {
        supportedModes: string[];
        modeConfigurations?: unknown;
        outcomeModels?: unknown;
      }[];
    };
    const scenario = legacy.scenarios[0];
    if (scenario === undefined) throw new Error("Expected scenario.");
    scenario.supportedModes = [
      "tutorial",
      "standard",
      "configured",
    ];
    delete scenario.modeConfigurations;
    delete scenario.outcomeModels;

    const result = validate(legacy);

    expect(result.isValid).toBe(true);
  });

  it("rejects missing mode contracts for scenarios without the registered legacy adapter", () => {
    const invalid = structuredClone(pharmaceuticalPackJson) as unknown as {
      scenarios: {
        modeConfigurations?: unknown;
        outcomeModels?: unknown;
      }[];
    };
    const scenario = invalid.scenarios[0];
    if (scenario === undefined) throw new Error("Expected scenario.");
    delete scenario.modeConfigurations;
    delete scenario.outcomeModels;

    const result = validateScenarioPack(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "$.scenarios[0].modeConfigurations",
          }),
          expect.objectContaining({
            path: "$.scenarios[0].outcomeModels",
          }),
        ]),
      );
    }
  });

  it("rejects non-positive weighted outcome probabilities", () => {
    const invalid = structuredClone(packJson);
    const scenario = invalid.scenarios[0];
    const model = scenario?.outcomeModels[0];
    if (
      scenario === undefined ||
      model === undefined ||
      model.distribution !== "weighted-categorical"
    ) {
      throw new Error("Expected weighted certificate outcome model.");
    }
    const outcome = model.outcomes[0];
    if (outcome === undefined) throw new Error("Expected outcome.");
    outcome.weight = 0;

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "NUMBER_BELOW_MINIMUM",
          path: "$.scenarios[0].outcomeModels[0].outcomes[0].weight",
        }),
      );
    }
  });

  it("rejects inconsistent structured decision response bounds", () => {
    const invalid = structuredClone(packJson);
    const decisionNode = invalid.scenarios[0]?.nodes.find(
      (node) =>
        node.nodeType === "DECISION" &&
        node.decisionId === "INT_CERTIFICATE_INITIAL_SUBMITTED",
    );
    if (
      decisionNode === undefined ||
      decisionNode.nodeType !== "DECISION" ||
      decisionNode.structuredResponse === undefined
    ) {
      throw new Error("Expected structured certificate decision.");
    }
    decisionNode.structuredResponse.evidenceCitations.minimumItems = 2;
    decisionNode.structuredResponse.evidenceCitations.maximumItems = 1;

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "INVALID_DECISION_RESPONSE_RANGE",
          path:
            "$.scenarios[0].nodes[2].structuredResponse.evidenceCitations",
        }),
      );
    }
  });

  it("rejects inconsistent policy-citation bounds", () => {
    const invalid = structuredClone(packJson);
    const decisionNode = invalid.scenarios[0]?.nodes.find(
      (node) =>
        node.nodeType === "DECISION" &&
        node.decisionId === "INT_CERTIFICATE_INITIAL_SUBMITTED",
    );
    if (
      decisionNode === undefined ||
      decisionNode.nodeType !== "DECISION" ||
      decisionNode.structuredResponse === undefined
    ) {
      throw new Error("Expected structured certificate decision.");
    }
    decisionNode.structuredResponse.policyCitations.minimumItems = 2;
    decisionNode.structuredResponse.policyCitations.maximumItems = 1;

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "INVALID_DECISION_RESPONSE_RANGE",
          path:
            "$.scenarios[0].nodes[2].structuredResponse.policyCitations",
        }),
      );
    }
  });

  it("rejects unknown competency references", () => {
    const invalid = structuredClone(packJson) as {
      scenarios: {
        competencyTargets: {
          competencyId: string;
          indicatorIds: string[];
        }[];
      }[];
    };
    const firstTarget = invalid.scenarios[0]?.competencyTargets[0];
    if (firstTarget === undefined) throw new Error("Fixture target missing.");
    firstTarget.competencyId = "BC99";
    firstTarget.indicatorIds = ["BC99.PI1"];

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues.map((issue) => issue.code)).toContain(
        "UNKNOWN_COMPETENCY_REFERENCE",
      );
      expect(result.issues.map((issue) => issue.code)).toContain(
        "UNKNOWN_INDICATOR_REFERENCE",
      );
    }
  });

  it("detects unreachable workflow nodes and missing completion paths", () => {
    const invalid = structuredClone(packJson) as {
      scenarios: { nodes: { transitions: unknown[] }[] }[];
    };
    const entryNode = invalid.scenarios[0]?.nodes[0];
    if (entryNode === undefined) throw new Error("Fixture entry node missing.");
    entryNode.transitions = [];

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues.map((issue) => issue.code)).toContain(
        "UNREACHABLE_NODE",
      );
      expect(result.issues.map((issue) => issue.code)).toContain(
        "MISSING_COMPLETION_PATH",
      );
    }
  });

  it("rejects executable content in imported data", () => {
    const invalid = structuredClone(packJson) as {
      scenarios: {
        policies: { configuration: Record<string, unknown> }[];
      }[];
    };
    const configuration = invalid.scenarios[0]?.policies[0]?.configuration;
    if (configuration === undefined) {
      throw new Error("Fixture policy missing.");
    }
    configuration.script = "return true";

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "EXECUTABLE_CONTENT_FORBIDDEN",
          path:
            "$.scenarios[0].policies[0].configuration.script",
        }),
      );
    }
  });

  it("binds the vertical slice to the current coffee scenario contract", () => {
    const pack = validPack();
    const scenario = pack.scenarios[0];
    const compatibility = scenario?.legacyCompatibility;
    expect(compatibility).toBeDefined();
    if (scenario === undefined || compatibility === undefined) return;

    expect(compatibility.scenarioId).toBe(coffeeScenario.scenarioId);
    expect(compatibility.scenarioVersion).toBe(
      coffeeScenario.scenarioVersion,
    );
    expect(
      coffeeScenario.stages.some(
        (stage) => stage.stageId === compatibility.stageId,
      ),
    ).toBe(true);
    for (const binding of compatibility.actionBindings) {
      expect(
        coffeeScenario.runtime.learnerCommandTemplates[
          binding.legacyActionId
        ],
      ).toBeDefined();
    }
    expect(
      coffeeCryptographicRuntime.authorizationPolicies.policies.some(
        (policy) => policy.authorizationPolicyId === "AUTH_ISSUE_CERTIFICATE",
      ),
    ).toBe(true);
    expect(coffeeScenario.decisionIds).toContain(
      "INT_CERTIFICATE_INITIAL_SUBMITTED",
    );
  });
});
