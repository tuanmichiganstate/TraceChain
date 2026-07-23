import { describe, expect, it } from "vitest";
import { canonicalize } from "../infrastructure/hashing/canonicalize";
import { CHALLENGE_PRESET, GUIDED_PRESET, LECTURER_PRESETS } from "./presets";
import { embedConfiguration, hashConfiguration } from "./hash";
import { validateConfiguration } from "./validation";
import { loadRuntimePackage, type RuntimeFetch } from "./runtime-loader";
import { coffeeScenario } from "../scenarios/coffee-traceability/scenario";

describe("TraceChain configuration", () => {
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

  it("makes guided and challenge resolved configurations distinct", () => {
    expect(hashConfiguration(GUIDED_PRESET)).not.toBe(hashConfiguration(CHALLENGE_PRESET));
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
      "./tracechain.config.json": embedConfiguration(GUIDED_PRESET),
      "./scenario.json": coffeeScenario,
    };
    const fetcher: RuntimeFetch = async (path) => ({
      ok: path in files,
      status: path in files ? 200 : 404,
      json: async () => files[path],
    });
    const runtime = await loadRuntimePackage(fetcher);
    expect(runtime.configuration).toEqual(GUIDED_PRESET);
    expect(runtime.scenario).toEqual(coffeeScenario);
  });

  it("lets the resolved package pass score override the scenario baseline", async () => {
    const configuration = {
      ...GUIDED_PRESET,
      scoring: { ...GUIDED_PRESET.scoring, passScore: 80 },
    };
    const files: Readonly<Record<string, unknown>> = {
      "./tracechain.config.json": embedConfiguration(configuration),
      "./scenario.json": coffeeScenario,
    };
    const runtime = await loadRuntimePackage(async (path) => ({
      ok: path in files,
      status: path in files ? 200 : 404,
      json: async () => files[path],
    }));

    expect(runtime.configuration.scoring.passScore).toBe(80);
    expect(runtime.scenario.scoringConfiguration.passingScore).toBe(70);
  });
});
