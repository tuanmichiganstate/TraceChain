import type { ScenarioDefinition } from "../domain/types/scenario";
import { validateScenario } from "../domain/scenario/validate-scenario";
import { IncompatibleAttemptError, ScenarioConfigurationError } from "../domain/errors";
import { hashConfiguration } from "./hash";
import type {
  EmbeddedTraceChainConfiguration,
  TraceChainConfiguration,
} from "./types";
import { assertValidConfiguration } from "./validation";

export interface RuntimePackage {
  readonly configuration: TraceChainConfiguration;
  readonly configurationHash: string;
  readonly scenario: ScenarioDefinition;
}

export type RuntimeFetch = (input: string) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}>;

async function loadJson(fetcher: RuntimeFetch, path: string): Promise<unknown> {
  const response = await fetcher(path);
  if (!response.ok) {
    throw new ScenarioConfigurationError(
      `Could not load package runtime file "${path}" (HTTP ${response.status})`,
    );
  }
  return response.json();
}

function isEmbeddedConfiguration(value: unknown): value is EmbeddedTraceChainConfiguration {
  return (
    typeof value === "object" &&
    value !== null &&
    "configuration" in value &&
    "configurationHash" in value
  );
}

export async function loadRuntimePackage(
  fetcher: RuntimeFetch,
): Promise<RuntimePackage> {
  const [configurationFile, scenarioFile] = await Promise.all([
    loadJson(fetcher, "./tracechain.config.json"),
    loadJson(fetcher, "./scenario.json"),
  ]);

  if (!isEmbeddedConfiguration(configurationFile)) {
    throw new ScenarioConfigurationError("tracechain.config.json has an invalid envelope");
  }
  assertValidConfiguration(configurationFile.configuration);
  if (
    typeof configurationFile.configurationHash !== "string" ||
    hashConfiguration(configurationFile.configuration) !==
      configurationFile.configurationHash
  ) {
    throw new IncompatibleAttemptError("Embedded configuration hash does not match its content");
  }

  let scenarioValidation;
  try {
    scenarioValidation = validateScenario(scenarioFile as ScenarioDefinition);
  } catch (error) {
    throw new ScenarioConfigurationError(
      `scenario.json does not match the scenario schema: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!scenarioValidation.isValid) {
    throw new ScenarioConfigurationError(
      `scenario.json failed validation: ${scenarioValidation.issues
        .filter((issue) => issue.severity === "ERROR")
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  const scenario = scenarioFile as ScenarioDefinition;
  if (
    scenario.scenarioId !== configurationFile.configuration.scenarioId ||
    scenario.scenarioVersion !== configurationFile.configuration.scenarioVersion
  ) {
    throw new IncompatibleAttemptError(
      "Embedded scenario identity does not match tracechain.config.json",
    );
  }
  if (scenario.scoringConfiguration.maxScore !== configurationFile.configuration.scoring.maximumScore) {
    throw new IncompatibleAttemptError("Scenario maximum score does not match package configuration");
  }
  return {
    configuration: configurationFile.configuration,
    configurationHash: configurationFile.configurationHash,
    scenario,
  };
}
