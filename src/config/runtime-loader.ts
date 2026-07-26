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
import type { ScenarioVariantBank } from "../domain/scenario/variant-bank";
import { validateVariantBank } from "../domain/scenario/variant-bank";

export interface RuntimePackage {
  readonly configuration: TraceChainConfiguration;
  readonly configurationHash: string;
  readonly scenario: ScenarioDefinition;
  readonly cryptographicRuntime: CryptographicRuntime | null;
  readonly variantBank: ScenarioVariantBank | null;
}

interface PortraitMediaManifest {
  readonly schemaVersion: "1";
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly assets: ScenarioDefinition["portraitAssets"];
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
  const [scenarioFile, mediaManifestFile, buildInformationFile] =
    await Promise.all([
      loadJson(fetcher, "./scenario.json"),
      loadJson(fetcher, "./media-manifest.json"),
      loadJson(fetcher, "./build-info.json"),
    ]);
  const variantBankFile =
    configurationFile.configuration.scenarioVariation.strategy ===
    "SEEDED_VARIANT_BANK"
      ? await loadJson(fetcher, "./scenario-variant-bank.json")
      : null;
  const cryptographicFiles =
    configurationFile.configuration.technicalFeatures.digitalSignatures
      ? await Promise.all([
          loadJson(fetcher, "./identity-registry.json"),
          loadJson(fetcher, "./educational-signing-keys.json"),
          loadJson(fetcher, "./authorization-policies.json"),
          loadJson(fetcher, "./endorsement-policies.json"),
        ])
      : null;

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
  const variantBank =
    variantBankFile === null
      ? null
      : (variantBankFile as ScenarioVariantBank);
  if (variantBank !== null) {
    const bankValidation = validateVariantBank({
      bank: variantBank,
      configuration: configurationFile.configuration,
    });
    if (!bankValidation.isValid) {
      throw new ScenarioConfigurationError(
        `scenario-variant-bank.json failed validation: ${bankValidation.issues
          .filter((issue) => issue.severity === "ERROR")
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      );
    }
  }
  const mediaManifest = mediaManifestFile as Partial<PortraitMediaManifest>;
  const buildInformation = buildInformationFile as {
    readonly scenarioHash?: unknown;
    readonly cryptographicEvidenceSchemaVersion?: unknown;
    readonly cryptographicRuntimeHashes?: unknown;
    readonly portraitMediaSchemaVersion?: unknown;
    readonly portraitMediaManifestHash?: unknown;
    readonly portraitMediaHashes?: unknown;
    readonly variantBankId?: unknown;
    readonly variantBankVersion?: unknown;
    readonly variantBankHash?: unknown;
    readonly variantContentHashes?: unknown;
  };
  const mediaManifestSource = `${JSON.stringify(mediaManifestFile, null, 2)}\n`;
  const recordedPortraitHashes =
    typeof buildInformation.portraitMediaHashes === "object" &&
    buildInformation.portraitMediaHashes !== null
      ? (buildInformation.portraitMediaHashes as Readonly<Record<string, unknown>>)
      : null;
  if (
    mediaManifest.schemaVersion !== "1" ||
    mediaManifest.scenarioId !== scenario.scenarioId ||
    mediaManifest.scenarioVersion !== scenario.scenarioVersion ||
    JSON.stringify(mediaManifest.assets) !== JSON.stringify(scenario.portraitAssets) ||
    buildInformation.portraitMediaSchemaVersion !== "1" ||
    buildInformation.portraitMediaManifestHash !== sha256Hex(mediaManifestSource) ||
    recordedPortraitHashes === null ||
    scenario.portraitAssets.some(
      (asset) => recordedPortraitHashes[asset.filePath] !== asset.sha256,
    )
  ) {
    throw new IncompatibleAttemptError(
      "Portrait media manifest does not match the embedded scenario",
    );
  }
  if (variantBank !== null) {
    const bankSource = `${JSON.stringify(variantBank, null, 2)}\n`;
    const recordedVariantHashes =
      typeof buildInformation.variantContentHashes === "object" &&
      buildInformation.variantContentHashes !== null
        ? (buildInformation.variantContentHashes as Readonly<
            Record<string, unknown>
          >)
        : null;
    if (
      buildInformation.variantBankId !== variantBank.bankId ||
      buildInformation.variantBankVersion !==
        variantBank.bankVersion ||
      buildInformation.variantBankHash !== sha256Hex(bankSource) ||
      recordedVariantHashes === null ||
      variantBank.variants.some(
        (variant) =>
          recordedVariantHashes[variant.metadata.variantId] !==
          variant.metadata.contentHash,
      )
    ) {
      throw new IncompatibleAttemptError(
        "Build metadata does not match the embedded scenario variant bank",
      );
    }
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
      const cryptographicScenarios =
        variantBank === null
          ? [scenario]
          : variantBank.variants.map(
              (variant) => variant.scenario,
            );
      for (const cryptographicScenario of cryptographicScenarios) {
        await assertValidCryptographicRuntime({
          runtime: cryptographicRuntime,
          scenario: cryptographicScenario,
          provider: new NobleEd25519Provider(),
        });
      }
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
    variantBank,
  };
}
