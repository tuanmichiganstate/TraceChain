import packJson from "../../../scenario-packs/standard-coffee-stage3/simuledger.pack.json";
import type { ScenarioDefinitionV1 } from "../contracts/scenario-pack";
import {
  HostedModeConfigurationError,
  modeConfigurationFor,
} from "./mode-configuration";

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

  it("does not invent defaults for a generic authored scenario", () => {
    const scenario = structuredClone(
      packJson.scenarios[0],
    ) as unknown as {
      modeConfigurations?: unknown;
    };
    delete scenario.modeConfigurations;

    expect(() =>
      modeConfigurationFor(
        scenario as unknown as ScenarioDefinitionV1,
        "standard",
      ),
    ).toThrow(HostedModeConfigurationError);
  });
});
