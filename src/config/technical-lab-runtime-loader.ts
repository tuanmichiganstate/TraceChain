import type { CryptographicRuntime } from "../crypto/signatures/types";
import { NobleEd25519Provider } from "../crypto/signatures/noble-ed25519-provider";
import {
  IncompatibleAttemptError,
  ScenarioConfigurationError,
} from "../domain/errors";
import { sha256Hex } from "../infrastructure/hashing/sha256";
import type {
  TechnicalLabPackBundle,
} from "../technical-lab/contracts";
import type {
  TechnicalLabEngineRuntime,
} from "../technical-lab/engine";
import {
  verifyTechnicalLabContentHash,
} from "../technical-lab/content-hash";
import {
  validateTechnicalLabConfigurationAgainstPack,
  validateTechnicalLabPackBundle,
} from "../technical-lab/validation";
import type { TechnicalLabConfiguration } from "./types";
import { isTechnicalLabConfiguration } from "./types";
import {
  loadEmbeddedConfiguration,
  type RuntimeFetch,
} from "./runtime-loader";

export interface TechnicalLabRuntimePackage
  extends TechnicalLabEngineRuntime {
  readonly configuration: TechnicalLabConfiguration;
}

async function loadJson(
  fetcher: RuntimeFetch,
  path: string,
): Promise<unknown> {
  const response = await fetcher(path);
  if (!response.ok) {
    throw new ScenarioConfigurationError(
      `Could not load Technical Laboratory runtime file "${path}" (HTTP ${String(response.status)})`,
    );
  }
  return response.json();
}

function cryptographicRuntimeFrom(
  values: readonly unknown[],
): CryptographicRuntime {
  return {
    identityRegistry: values[0],
    signingKeys: values[1],
    authorizationPolicies: values[2],
    endorsementPolicies: values[3],
  } as CryptographicRuntime;
}

async function assertValidTechnicalLabCryptographicRuntime(
  runtime: CryptographicRuntime,
  bundle: TechnicalLabPackBundle,
): Promise<void> {
  if (
    runtime.identityRegistry.schemaVersion !== "1" ||
    runtime.signingKeys.schemaVersion !== "1" ||
    runtime.authorizationPolicies.schemaVersion !== "1" ||
    runtime.endorsementPolicies.schemaVersion !== "1"
  ) {
    throw new ScenarioConfigurationError(
      "Technical Laboratory cryptographic registries must use schema version 1.",
    );
  }
  const identities = new Map(
    runtime.identityRegistry.identities.map((identity) => [
      identity.organizationId,
      identity,
    ]),
  );
  const keys = new Map(
    runtime.signingKeys.keys.map((key) => [key.keyId, key]),
  );
  const policyIds = new Set(
    runtime.endorsementPolicies.policies.map(
      (policy) => policy.endorsementPolicyId,
    ),
  );
  for (const fixture of bundle.fixtures) {
    for (const identityId of fixture.identityIds) {
      if (!identities.has(identityId)) {
        throw new ScenarioConfigurationError(
          `Technical Laboratory fixture "${fixture.fixtureId}" references unknown identity "${identityId}".`,
        );
      }
    }
    for (const keyId of fixture.keyIds) {
      if (!keys.has(keyId)) {
        throw new ScenarioConfigurationError(
          `Technical Laboratory fixture "${fixture.fixtureId}" references unknown key "${keyId}".`,
        );
      }
    }
    for (const policyId of fixture.policyIds) {
      if (!policyIds.has(policyId)) {
        throw new ScenarioConfigurationError(
          `Technical Laboratory fixture "${fixture.fixtureId}" references unknown policy "${policyId}".`,
        );
      }
    }
  }
  const provider = new NobleEd25519Provider();
  const probe = new TextEncoder().encode(
    "TRACECHAIN_TECHNICAL_LAB_KEY_PAIR_PROBE_V1",
  );
  for (const key of runtime.signingKeys.keys) {
    const identity = identities.get(key.organizationId);
    if (
      key.algorithm !== "Ed25519" ||
      key.educationalOnly !== true ||
      identity === undefined
    ) {
      throw new ScenarioConfigurationError(
        `Technical Laboratory educational key "${key.keyId}" is invalid.`,
      );
    }
    const signature = await provider.sign(
      {
        algorithm: "Ed25519",
        pkcs8Base64Url: key.privateKeyPkcs8Base64Url,
      },
      probe,
    );
    const valid = await provider.verify(
      {
        algorithm: "Ed25519",
        spkiBase64Url: key.publicKeySpkiBase64Url,
      },
      probe,
      signature,
    );
    if (!valid) {
      throw new ScenarioConfigurationError(
        `Technical Laboratory educational key pair "${key.keyId}" does not match.`,
      );
    }
  }
}

export async function loadTechnicalLabRuntimePackage(
  fetcher: RuntimeFetch,
): Promise<TechnicalLabRuntimePackage> {
  const configurationFile = await loadEmbeddedConfiguration(fetcher);
  const configuration = configurationFile.configuration;
  if (!isTechnicalLabConfiguration(configuration)) {
    throw new ScenarioConfigurationError(
      "This package does not select the Technical Laboratory runtime.",
    );
  }
  const [
    bundleFile,
    buildInformationFile,
    identityRegistry,
    signingKeys,
    authorizationPolicies,
    endorsementPolicies,
  ] = await Promise.all([
    loadJson(fetcher, "./technical-lab-pack.json"),
    loadJson(fetcher, "./build-info.json"),
    loadJson(fetcher, "./identity-registry.json"),
    loadJson(fetcher, "./educational-signing-keys.json"),
    loadJson(fetcher, "./authorization-policies.json"),
    loadJson(fetcher, "./endorsement-policies.json"),
  ]);
  const validation = validateTechnicalLabPackBundle(bundleFile);
  if (!validation.isValid) {
    throw new ScenarioConfigurationError(
      `technical-lab-pack.json failed validation: ${validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  const bundle = validation.bundle;
  const configurationIssues =
    validateTechnicalLabConfigurationAgainstPack(
      configuration,
      bundle,
    );
  if (configurationIssues.length > 0) {
    throw new IncompatibleAttemptError(
      `Technical Laboratory configuration does not match its content: ${configurationIssues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  if (
    bundle.pack.status !== "published" ||
    !verifyTechnicalLabContentHash(bundle)
  ) {
    throw new IncompatibleAttemptError(
      "Technical Laboratory content must be an immutable published pack.",
    );
  }
  const cryptographicRuntime = cryptographicRuntimeFrom([
    identityRegistry,
    signingKeys,
    authorizationPolicies,
    endorsementPolicies,
  ]);
  await assertValidTechnicalLabCryptographicRuntime(
    cryptographicRuntime,
    bundle,
  );
  const buildInformation = buildInformationFile as {
    readonly technicalLabPackHash?: unknown;
    readonly technicalLabPackContentHash?: unknown;
    readonly technicalLabPersistenceSchemaVersion?: unknown;
    readonly cryptographicEvidenceSchemaVersion?: unknown;
    readonly cryptographicRuntimeHashes?: unknown;
  };
  const bundleSource = `${JSON.stringify(bundleFile, null, 2)}\n`;
  if (
    buildInformation.technicalLabPackHash !==
      sha256Hex(bundleSource) ||
    buildInformation.technicalLabPackContentHash !==
      bundle.pack.publication?.contentHash ||
    buildInformation.technicalLabPersistenceSchemaVersion !==
      "TL1" ||
    buildInformation.cryptographicEvidenceSchemaVersion !== "2" ||
    typeof buildInformation.cryptographicRuntimeHashes !==
      "object" ||
    buildInformation.cryptographicRuntimeHashes === null
  ) {
    throw new IncompatibleAttemptError(
      "Build metadata does not match the embedded Technical Laboratory runtime.",
    );
  }
  const recorded =
    buildInformation.cryptographicRuntimeHashes as Readonly<
      Record<string, unknown>
    >;
  for (const [fileName, value] of [
    ["identity-registry.json", identityRegistry],
    ["educational-signing-keys.json", signingKeys],
    ["authorization-policies.json", authorizationPolicies],
    ["endorsement-policies.json", endorsementPolicies],
  ] as const) {
    if (
      recorded[fileName] !==
      sha256Hex(`${JSON.stringify(value, null, 2)}\n`)
    ) {
      throw new IncompatibleAttemptError(
        `Technical Laboratory cryptographic hash does not match "${fileName}".`,
      );
    }
  }
  return {
    configuration,
    configurationHash: configurationFile.configurationHash,
    bundle,
    cryptographicRuntime,
  };
}
