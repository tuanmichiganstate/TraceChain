import { describe, expect, it } from "vitest";
import { canonicalize } from "../infrastructure/hashing/canonicalize";
import {
  ASSESSMENT_PRESET,
  CHALLENGE_PRESET,
  GUIDED_PRESET,
  LECTURER_PRESETS,
  PRACTICE_PRESET,
} from "./presets";
import { embedConfiguration, hashConfiguration } from "./hash";
import { validateConfiguration } from "./validation";
import { loadRuntimePackage, type RuntimeFetch } from "./runtime-loader";
import { coffeeScenario } from "../scenarios/coffee-traceability/scenario";
import { coffeeCryptographicRuntime } from "../scenarios/coffee-traceability/cryptographic-runtime";
import { sha256Hex } from "../infrastructure/hashing/sha256";
import { challengeAScenario } from "../scenarios/challenge-a/scenario";
import { challengeVariantBank } from "../scenarios/challenge-a/variant-bank";

function portraitMediaFiles(): Readonly<Record<string, unknown>> {
  const mediaManifest = {
    schemaVersion: "1",
    scenarioId: coffeeScenario.scenarioId,
    scenarioVersion: coffeeScenario.scenarioVersion,
    assets: coffeeScenario.portraitAssets,
  };
  return {
    "./media-manifest.json": mediaManifest,
    "./build-info.json": {
      scenarioHash: sha256Hex(
        `${JSON.stringify(coffeeScenario, null, 2)}\n`,
      ),
      portraitMediaSchemaVersion: "1",
      portraitMediaManifestHash: sha256Hex(
        `${JSON.stringify(mediaManifest, null, 2)}\n`,
      ),
      portraitMediaHashes: Object.fromEntries(
        coffeeScenario.portraitAssets.map((asset) => [
          asset.filePath,
          asset.sha256,
        ]),
      ),
    },
  };
}

function cryptographicFiles(): Readonly<Record<string, unknown>> {
  const values: Readonly<Record<string, unknown>> = {
    "identity-registry.json":
      coffeeCryptographicRuntime.identityRegistry,
    "educational-signing-keys.json":
      coffeeCryptographicRuntime.signingKeys,
    "authorization-policies.json":
      coffeeCryptographicRuntime.authorizationPolicies,
    "endorsement-policies.json":
      coffeeCryptographicRuntime.endorsementPolicies,
  };
  return {
    "./identity-registry.json": values["identity-registry.json"],
    "./educational-signing-keys.json":
      values["educational-signing-keys.json"],
    "./authorization-policies.json":
      values["authorization-policies.json"],
    "./endorsement-policies.json":
      values["endorsement-policies.json"],
    "./build-info.json": {
      ...(portraitMediaFiles()["./build-info.json"] as object),
      scenarioHash: sha256Hex(
        `${JSON.stringify(coffeeScenario, null, 2)}\n`,
      ),
      cryptographicEvidenceSchemaVersion: "2",
      cryptographicRuntimeHashes: Object.fromEntries(
        Object.entries(values).map(([fileName, value]) => [
          fileName,
          sha256Hex(`${JSON.stringify(value, null, 2)}\n`),
        ]),
      ),
    },
  };
}

describe("SimuLedger configuration", () => {
  it("validates every shipped preset", () => {
    for (const preset of Object.values(LECTURER_PRESETS)) {
      expect(validateConfiguration(preset)).toEqual({ isValid: true, issues: [] });
    }
  });

  it("hashes canonical content deterministically", () => {
    const first = hashConfiguration(GUIDED_PRESET);
    const reordered = JSON.parse(canonicalize(GUIDED_PRESET));
    expect(hashConfiguration(reordered)).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(embedConfiguration(GUIDED_PRESET).configurationHash).toBe(first);
  });

  it("makes every shipped configuration identity distinct", () => {
    expect(hashConfiguration(GUIDED_PRESET)).not.toBe(hashConfiguration(CHALLENGE_PRESET));
    expect(hashConfiguration(PRACTICE_PRESET)).not.toBe(
      hashConfiguration(GUIDED_PRESET),
    );
    expect(hashConfiguration(PRACTICE_PRESET)).not.toBe(
      hashConfiguration(CHALLENGE_PRESET),
    );
    expect(hashConfiguration(ASSESSMENT_PRESET)).not.toBe(
      hashConfiguration(GUIDED_PRESET),
    );
    expect(hashConfiguration(ASSESSMENT_PRESET)).not.toBe(
      hashConfiguration(CHALLENGE_PRESET),
    );
  });

  it("fixes assessment feedback, hints, seed, and scoring", () => {
    expect(ASSESSMENT_PRESET).toMatchObject({
      configurationSchemaVersion: "2",
      presetId: "assessment",
      activityType: "OPERATIONS",
      supportProfile: "CHALLENGE",
      deliveryPurpose: "ASSESSMENT",
      outcomeStrategy: "FIXED",
      scenarioId: coffeeScenario.scenarioId,
      scenarioVersion: coffeeScenario.scenarioVersion,
      feedback: {
        timing: "FINAL",
      },
      hints: {
        availability: "DISABLED",
      },
      scoring: {
        maximumScore: 100,
        passScore: 70,
        official: true,
      },
    });
    expect(ASSESSMENT_PRESET.scenarioSeed).toBe(
      "assessment-standard-v1",
    );
  });

  it("rejects assessment configurations that reveal feedback or hints", () => {
    const result = validateConfiguration({
      ...ASSESSMENT_PRESET,
      scenarioId: CHALLENGE_PRESET.scenarioId,
      scenarioVersion: CHALLENGE_PRESET.scenarioVersion,
      content: {
        ...ASSESSMENT_PRESET.content,
        scenarioId: CHALLENGE_PRESET.scenarioId,
        scenarioVersion: CHALLENGE_PRESET.scenarioVersion,
      },
      feedback: {
        ...ASSESSMENT_PRESET.feedback,
        timing: "IMMEDIATE",
      },
      hints: {
        ...ASSESSMENT_PRESET.hints,
        availability: "LIMITED",
      },
    });

    expect(result.isValid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "scenarioId",
        "feedback.timing",
        "hints.availability",
      ]),
    );
  });

  it("rejects unavailable content and invalid scoring", () => {
    const result = validateConfiguration({
      ...GUIDED_PRESET,
      technicalFeatures: {
        ...GUIDED_PRESET.technicalFeatures,
        proofOfWorkLab: true,
        undocumentedFeature: true,
      },
      scoring: {
        ...GUIDED_PRESET.scoring,
        passScore: 101,
        undocumentedRule: true,
      },
      undocumentedOverride: true,
    });
    expect(result.isValid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "technicalFeatures.proofOfWorkLab",
        "technicalFeatures.undocumentedFeature",
        "scoring.passScore",
        "scoring.undocumentedRule",
        "undocumentedOverride",
      ]),
    );
  });

  it("loads configuration and scenario from separate runtime files", async () => {
    const files: Readonly<Record<string, unknown>> = {
      "./simuledger.config.json": embedConfiguration(GUIDED_PRESET),
      "./scenario.json": coffeeScenario,
      ...portraitMediaFiles(),
      ...cryptographicFiles(),
    };
    const fetcher: RuntimeFetch = async (path) => ({
      ok: path in files,
      status: path in files ? 200 : 404,
      json: async () => files[path],
    });
    const runtime = await loadRuntimePackage(fetcher);
    expect(runtime.configuration).toEqual(GUIDED_PRESET);
    expect(runtime.scenario).toEqual(coffeeScenario);
    expect(runtime.cryptographicRuntime).toEqual(
      coffeeCryptographicRuntime,
    );
  });

  it("loads and verifies the complete curated Challenge variant bank", async () => {
    const mediaManifest = {
      schemaVersion: "1",
      scenarioId: challengeAScenario.scenarioId,
      scenarioVersion: challengeAScenario.scenarioVersion,
      assets: challengeAScenario.portraitAssets,
    };
    const variantBankSource = `${JSON.stringify(
      challengeVariantBank,
      null,
      2,
    )}\n`;
    const files: Readonly<Record<string, unknown>> = {
      "./simuledger.config.json":
        embedConfiguration(CHALLENGE_PRESET),
      "./scenario.json": challengeAScenario,
      "./scenario-variant-bank.json": challengeVariantBank,
      "./media-manifest.json": mediaManifest,
      ...cryptographicFiles(),
      "./build-info.json": {
        ...(cryptographicFiles()["./build-info.json"] as object),
        scenarioHash: sha256Hex(
          `${JSON.stringify(challengeAScenario, null, 2)}\n`,
        ),
        portraitMediaManifestHash: sha256Hex(
          `${JSON.stringify(mediaManifest, null, 2)}\n`,
        ),
        variantBankId: challengeVariantBank.bankId,
        variantBankVersion:
          challengeVariantBank.bankVersion,
        variantBankHash: sha256Hex(variantBankSource),
        variantContentHashes: Object.fromEntries(
          challengeVariantBank.variants.map((variant) => [
            variant.metadata.variantId,
            variant.metadata.contentHash,
          ]),
        ),
      },
    };
    const requested: string[] = [];
    const runtime = await loadRuntimePackage(async (path) => {
      requested.push(path);
      return {
        ok: path in files,
        status: path in files ? 200 : 404,
        json: async () => files[path],
      };
    });

    expect(runtime.variantBank).toEqual(challengeVariantBank);
    expect(runtime.scenario).toEqual(challengeAScenario);
    expect(requested).toContain("./scenario-variant-bank.json");
  });

  it("lets the resolved package pass score override the scenario baseline", async () => {
    const configuration = {
      ...GUIDED_PRESET,
      scoring: { ...GUIDED_PRESET.scoring, passScore: 80 },
    };
    const files: Readonly<Record<string, unknown>> = {
      "./simuledger.config.json": embedConfiguration(configuration),
      "./scenario.json": coffeeScenario,
      ...portraitMediaFiles(),
      ...cryptographicFiles(),
    };
    const runtime = await loadRuntimePackage(async (path) => ({
      ok: path in files,
      status: path in files ? 200 : 404,
      json: async () => files[path],
    }));

    expect(runtime.configuration.scoring.passScore).toBe(80);
    expect(runtime.scenario.scoringConfiguration.passingScore).toBe(70);
  });

  it("does not request cryptographic runtime files when signatures are disabled", async () => {
    const configuration = {
      ...GUIDED_PRESET,
      technicalFeatures: {
        ...GUIDED_PRESET.technicalFeatures,
        digitalSignatures: false,
        endorsementPolicies: false,
      },
    };
    const requested: string[] = [];
    const files: Readonly<Record<string, unknown>> = {
      "./simuledger.config.json": embedConfiguration(configuration),
      "./scenario.json": coffeeScenario,
      ...portraitMediaFiles(),
    };
    const runtime = await loadRuntimePackage(async (path) => {
      requested.push(path);
      return {
        ok: path in files,
        status: path in files ? 200 : 404,
        json: async () => files[path],
      };
    });

    expect(runtime.cryptographicRuntime).toBeNull();
    expect(requested).toEqual([
      "./simuledger.config.json",
      "./scenario.json",
      "./media-manifest.json",
      "./build-info.json",
    ]);
  });

  it("rejects portrait media metadata bound to different scenario content", async () => {
    const media = portraitMediaFiles();
    const files: Readonly<Record<string, unknown>> = {
      "./simuledger.config.json": embedConfiguration(GUIDED_PRESET),
      "./scenario.json": coffeeScenario,
      ...media,
      ...cryptographicFiles(),
      "./media-manifest.json": {
        ...(media["./media-manifest.json"] as object),
        assets: [],
      },
    };

    await expect(
      loadRuntimePackage(async (path) => ({
        ok: path in files,
        status: path in files ? 200 : 404,
        json: async () => files[path],
      })),
    ).rejects.toThrow(
      "Portrait media manifest does not match the embedded scenario",
    );
  });

  it("rejects cryptographic runtime metadata bound to different scenario content", async () => {
    const crypto = cryptographicFiles();
    const files: Readonly<Record<string, unknown>> = {
      "./simuledger.config.json": embedConfiguration(GUIDED_PRESET),
      "./scenario.json": coffeeScenario,
      ...portraitMediaFiles(),
      ...crypto,
      "./build-info.json": {
        ...(crypto["./build-info.json"] as object),
        scenarioHash: "0".repeat(64),
      },
    };

    await expect(
      loadRuntimePackage(async (path) => ({
        ok: path in files,
        status: path in files ? 200 : 404,
        json: async () => files[path],
      })),
    ).rejects.toThrow(
      "Build metadata does not describe the cryptographic runtime",
    );
  });
});
