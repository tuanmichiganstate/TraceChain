import { IncompatibleAttemptError, ScenarioConfigurationError } from "../domain/errors";
import { sha256Hex } from "../infrastructure/hashing/sha256";
import type {
  AuditCaseDefinitionV1,
} from "../platform/contracts/audit";
import type {
  ScenarioDefinitionV1,
  ScenarioPackV1,
} from "../platform/contracts/scenario-pack";
import {
  verifyScenarioPackContentHash,
} from "../platform/scenario-packs/publication";
import {
  validateScenarioPack,
} from "../platform/scenario-packs/validation";
import { hashConfiguration } from "./hash";
import type {
  AuditSimulationConfiguration,
  EmbeddedTraceChainConfiguration,
} from "./types";
import { isAuditSimulationConfiguration } from "./types";
import { assertValidConfiguration } from "./validation";
import type { RuntimeFetch } from "./runtime-loader";

export interface AuditRuntimePackage {
  readonly configuration: AuditSimulationConfiguration;
  readonly configurationHash: string;
  readonly pack: ScenarioPackV1;
  readonly scenario: ScenarioDefinitionV1;
  readonly auditCase: AuditCaseDefinitionV1;
}

function isEmbeddedConfiguration(
  value: unknown,
): value is EmbeddedTraceChainConfiguration {
  return (
    typeof value === "object" &&
    value !== null &&
    "configuration" in value &&
    "configurationHash" in value
  );
}

async function loadJson(
  fetcher: RuntimeFetch,
  path: string,
): Promise<unknown> {
  const response = await fetcher(path);
  if (!response.ok) {
    throw new ScenarioConfigurationError(
      `Could not load Audit runtime file "${path}" (HTTP ${String(response.status)})`,
    );
  }
  return response.json();
}

export async function loadAuditRuntimePackage(
  fetcher: RuntimeFetch,
): Promise<AuditRuntimePackage> {
  const [configurationFile, packFile, buildInformationFile] =
    await Promise.all([
      loadJson(fetcher, "./tracechain.config.json"),
      loadJson(fetcher, "./audit-scenario-pack.json"),
      loadJson(fetcher, "./build-info.json"),
    ]);
  if (!isEmbeddedConfiguration(configurationFile)) {
    throw new ScenarioConfigurationError(
      "tracechain.config.json has an invalid envelope",
    );
  }
  assertValidConfiguration(configurationFile.configuration);
  const configuration = configurationFile.configuration;
  if (!isAuditSimulationConfiguration(configuration)) {
    throw new ScenarioConfigurationError(
      "This package does not select the Audit SCORM runtime.",
    );
  }
  if (
    typeof configurationFile.configurationHash !== "string" ||
    hashConfiguration(configuration) !==
      configurationFile.configurationHash
  ) {
    throw new IncompatibleAttemptError(
      "Embedded Audit configuration hash does not match its content",
    );
  }
  const validation = validateScenarioPack(packFile);
  if (!validation.isValid) {
    throw new ScenarioConfigurationError(
      `audit-scenario-pack.json failed validation: ${validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  const pack = validation.pack;
  if (
    pack.status !== "published" ||
    !verifyScenarioPackContentHash(pack) ||
    pack.packId !== configuration.content.packId ||
    pack.version !== configuration.content.packVersion
  ) {
    throw new IncompatibleAttemptError(
      "Audit pack identity or immutable content hash does not match the package configuration",
    );
  }
  const scenario = pack.scenarios.find(
    (candidate) =>
      candidate.scenarioId === configuration.scenarioId &&
      candidate.version === configuration.scenarioVersion,
  );
  const auditCase = scenario?.auditCase;
  if (
    scenario === undefined ||
    auditCase === undefined ||
    auditCase.auditCaseId !== configuration.auditCaseId ||
    auditCase.version !== configuration.auditCaseVersion ||
    scenario.hostedRuntime?.runtimeId !== "tracechain-audit-v1" ||
    scenario.hostedRuntime.auditCaseId !== auditCase.auditCaseId
  ) {
    throw new IncompatibleAttemptError(
      "Audit scenario and case identity do not match the package configuration",
    );
  }
  const buildInformation = buildInformationFile as {
    readonly auditScenarioPackHash?: unknown;
    readonly auditScenarioPackContentHash?: unknown;
    readonly auditPersistenceSchemaVersion?: unknown;
  };
  const source = `${JSON.stringify(packFile, null, 2)}\n`;
  if (
    buildInformation.auditScenarioPackHash !== sha256Hex(source) ||
    buildInformation.auditScenarioPackContentHash !==
      pack.publication?.contentHash ||
    buildInformation.auditPersistenceSchemaVersion !== "TA1"
  ) {
    throw new IncompatibleAttemptError(
      "Build metadata does not match the embedded Audit runtime",
    );
  }
  return {
    configuration,
    configurationHash: configurationFile.configurationHash,
    pack,
    scenario,
    auditCase,
  };
}
