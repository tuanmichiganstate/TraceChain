import type { ScenarioDefinition } from "../domain/types/scenario";
import { validateScenario } from "../domain/scenario/validate-scenario";
import { IncompatibleAttemptError, ScenarioConfigurationError } from "../domain/errors";
import { hashConfiguration } from "./hash";
import type {
  EmbeddedTraceChainConfiguration,
  TraceChainConfiguration,
} from "./types";
import { assertValidConfiguration } from "./validation";
import type { CryptographicRuntime } from "../crypto/signatures/types";
import { NobleEd25519Provider } from "../crypto/signatures/noble-ed25519-provider";
import { assertValidCryptographicRuntime } from "../crypto/signatures/validation";
import { sha256Hex } from "../infrastructure/hashing/sha256";

export interface RuntimePackage {
  readonly configuration: TraceChainConfiguration;
  readonly configurationHash: string;
  readonly scenario: ScenarioDefinition;
  readonly cryptographicRuntime: CryptographicRuntime | null;
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
  const configurationFile = await loadJson(
    fetcher,
    "./tracechain.config.json",
  );

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
  const cryptographicFiles =
    configurationFile.configuration.technicalFeatures.digitalSignatures
      ? await Promise.all([
          loadJson(fetcher, "./identity-registry.json"),
          loadJson(fetcher, "./educational-signing-keys.json"),
          loadJson(fetcher, "./authorization-policies.json"),
          loadJson(fetcher, "./endorsement-policies.json"),
          loadJson(fetcher, "./build-info.json"),
        ])
      : null;
  const scenarioFile = await loadJson(fetcher, "./scenario.json");

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
  const cryptographicRuntime =
    cryptographicFiles === null
      ? null
      : {
          identityRegistry: cryptographicFiles[0],
          signingKeys: cryptographicFiles[1],
          authorizationPolicies: cryptographicFiles[2],
          endorsementPolicies: cryptographicFiles[3],
        } as CryptographicRuntime;
  if (cryptographicRuntime !== null) {
    const buildInformation = cryptographicFiles?.[4] as {
      readonly scenarioHash?: unknown;
      readonly cryptographicEvidenceSchemaVersion?: unknown;
      readonly cryptographicRuntimeHashes?: unknown;
    };
    if (
      buildInformation.scenarioHash !==
        sha256Hex(`${JSON.stringify(scenario, null, 2)}\n`) ||
      buildInformation.cryptographicEvidenceSchemaVersion !==
        (configurationFile.configuration.technicalFeatures
          .endorsementPolicies
          ? "2"
          : "1") ||
      typeof buildInformation.cryptographicRuntimeHashes !== "object" ||
      buildInformation.cryptographicRuntimeHashes === null
    ) {
      throw new IncompatibleAttemptError(
        "Build metadata does not describe the cryptographic runtime",
      );
    }
    const recorded = buildInformation.cryptographicRuntimeHashes as Readonly<
      Record<string, unknown>
    >;
    const files = [
      ["identity-registry.json", cryptographicRuntime.identityRegistry],
      ["educational-signing-keys.json", cryptographicRuntime.signingKeys],
      [
        "authorization-policies.json",
        cryptographicRuntime.authorizationPolicies,
      ],
      [
        "endorsement-policies.json",
        cryptographicRuntime.endorsementPolicies,
      ],
    ] as const;
    for (const [fileName, value] of files) {
      const calculated = sha256Hex(`${JSON.stringify(value, null, 2)}\n`);
      if (recorded[fileName] !== calculated) {
        throw new IncompatibleAttemptError(
          `Cryptographic runtime hash does not match "${fileName}"`,
        );
      }
    }
    try {
      await assertValidCryptographicRuntime({
        runtime: cryptographicRuntime,
        scenario,
        provider: new NobleEd25519Provider(),
      });
    } catch (error) {
      throw new ScenarioConfigurationError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return {
    configuration: configurationFile.configuration,
    configurationHash: configurationFile.configurationHash,
    scenario,
    cryptographicRuntime,
  };
}
