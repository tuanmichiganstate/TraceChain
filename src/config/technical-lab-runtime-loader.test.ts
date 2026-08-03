import { describe, expect, it } from "vitest";
import { sha256Hex } from "../infrastructure/hashing/sha256";
import { permissionedFoundationsLabBundle } from "../technical-lab/permissioned-foundations-pack";
import { technicalLabCryptographicRuntime } from "../technical-lab/cryptographic-runtime";
import { embedConfiguration } from "./hash";
import { TECHNICAL_LAB_PRESET } from "./presets";
import {
  loadTechnicalLabRuntimePackage,
} from "./technical-lab-runtime-loader";
import type { RuntimeFetch } from "./runtime-loader";

function files(): Readonly<Record<string, unknown>> {
  const cryptographicFiles = {
    "identity-registry.json":
      technicalLabCryptographicRuntime.identityRegistry,
    "educational-signing-keys.json":
      technicalLabCryptographicRuntime.signingKeys,
    "authorization-policies.json":
      technicalLabCryptographicRuntime.authorizationPolicies,
    "endorsement-policies.json":
      technicalLabCryptographicRuntime.endorsementPolicies,
  } as const;
  return {
    "./simuledger.config.json":
      embedConfiguration(TECHNICAL_LAB_PRESET),
    "./technical-lab-pack.json":
      permissionedFoundationsLabBundle,
    "./identity-registry.json":
      cryptographicFiles["identity-registry.json"],
    "./educational-signing-keys.json":
      cryptographicFiles["educational-signing-keys.json"],
    "./authorization-policies.json":
      cryptographicFiles["authorization-policies.json"],
    "./endorsement-policies.json":
      cryptographicFiles["endorsement-policies.json"],
    "./build-info.json": {
      technicalLabPackHash: sha256Hex(
        `${JSON.stringify(
          permissionedFoundationsLabBundle,
          null,
          2,
        )}\n`,
      ),
      technicalLabPackContentHash:
        permissionedFoundationsLabBundle.pack.publication
          ?.contentHash,
      technicalLabPersistenceSchemaVersion: "TL1",
      cryptographicEvidenceSchemaVersion: "2",
      cryptographicRuntimeHashes: Object.fromEntries(
        Object.entries(cryptographicFiles).map(
          ([fileName, value]) => [
            fileName,
            sha256Hex(`${JSON.stringify(value, null, 2)}\n`),
          ],
        ),
      ),
    },
  };
}

function fetcher(
  values: Readonly<Record<string, unknown>>,
): RuntimeFetch {
  return async (path) => ({
    ok: path in values,
    status: path in values ? 200 : 404,
    json: async () => values[path],
  });
}

describe("Technical Laboratory runtime loader", () => {
  it("loads one exact published pack and its educational cryptographic runtime", async () => {
    const runtime = await loadTechnicalLabRuntimePackage(
      fetcher(files()),
    );

    expect(runtime.configuration).toEqual(
      TECHNICAL_LAB_PRESET,
    );
    expect(runtime.bundle.pack.status).toBe("published");
    expect(runtime.bundle.modules.map((module) => module.moduleId)).toEqual(
      ["TL1", "TL2", "TL3", "TL4", "TL5", "TL6", "TL7"],
    );
    expect(runtime.cryptographicRuntime.signingKeys.keys).toHaveLength(
      6,
    );
  });

  it("rejects runtime bytes that disagree with package metadata", async () => {
    const values = files();
    await expect(
      loadTechnicalLabRuntimePackage(
        fetcher({
          ...values,
          "./build-info.json": {
            ...(values["./build-info.json"] as object),
            technicalLabPackHash: "0".repeat(64),
          },
        }),
      ),
    ).rejects.toThrow(/metadata/iu);
  });
});
