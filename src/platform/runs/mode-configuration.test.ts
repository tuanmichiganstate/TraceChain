import packJson from "../../../scenario-packs/standard-coffee-stage3/tracechain.pack.json";
import type { ScenarioDefinitionV1 } from "../contracts/scenario-pack";
import {
  HostedModeConfigurationError,
  modeConfigurationFor,
} from "./mode-configuration";

function legacyCoffeeScenario(): ScenarioDefinitionV1 {
  const pack = structuredClone(packJson) as unknown as {
    scenarios: {
      supportedModes: string[];
      modeConfigurations?: unknown;
      outcomeModels?: unknown;
    }[];
  };
  const scenario = pack.scenarios[0];
  if (scenario === undefined) throw new Error("Expected coffee scenario.");
  scenario.supportedModes = [
    "tutorial",
    "standard",
    "configured",
  ];
  delete scenario.modeConfigurations;
  delete scenario.outcomeModels;
  return scenario as unknown as ScenarioDefinitionV1;
}

describe("hosted mode configuration", () => {
  it("returns the exact authored configuration", () => {
    const scenario = packJson.scenarios[0];
    if (scenario === undefined) throw new Error("Expected scenario.");

    expect(
      modeConfigurationFor(
        scenario as unknown as ScenarioDefinitionV1,
        "standard",
      ),
    ).toEqual(
      scenario.modeConfigurations.find(
        (configuration) => configuration.mode === "standard",
      ),
    );
  });

  it("reconstructs deterministic pre-Phase-5 coffee behavior", () => {
    const scenario = legacyCoffeeScenario();

    expect(modeConfigurationFor(scenario, "tutorial")).toEqual({
      mode: "tutorial",
      allowHints: true,
      allowRetry: true,
      allowBacktracking: true,
      feedbackTiming: "immediate",
      showScores: true,
      outcomeStrategy: "forced",
      seedPolicy: "supplied",
      allowCommunication: false,
      allowEvidenceRequests: true,
    });
    expect(modeConfigurationFor(scenario, "standard")).toEqual({
      mode: "standard",
      allowHints: false,
      allowRetry: false,
      allowBacktracking: false,
      feedbackTiming: "final",
      showScores: false,
      outcomeStrategy: "forced",
      seedPolicy: "supplied",
      allowCommunication: false,
      allowEvidenceRequests: true,
    });
  });

  it("does not invent defaults for a generic authored scenario", () => {
    const scenario = structuredClone(
      packJson.scenarios[0],
    ) as unknown as {
      legacyCompatibility?: unknown;
      modeConfigurations?: unknown;
    };
    delete scenario.legacyCompatibility;
    delete scenario.modeConfigurations;

    expect(() =>
      modeConfigurationFor(
        scenario as unknown as ScenarioDefinitionV1,
        "standard",
      ),
    ).toThrow(HostedModeConfigurationError);
  });
});
