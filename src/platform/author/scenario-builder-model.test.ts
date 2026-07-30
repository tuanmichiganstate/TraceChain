import pharmaceuticalPackJson from "../../../scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json";
import type {
  ScenarioNodeV1,
  ScenarioPackV1,
} from "../contracts/scenario-pack";
import { validateScenarioPack } from "../scenario-packs/validation";
import {
  createScenarioBuilderStarter,
  defaultScenarioNode,
  uniqueIdentifier,
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
    expect(starter.scenarios[0]?.hostedRuntime).toBeUndefined();
    expect(starter.scenarios[0]?.auditCase).toBeUndefined();
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
});
