import { describe, expect, it } from "vitest";
import { embedConfiguration } from "../config/hash";
import { loadRuntimePackage } from "../config/runtime-loader";
import { validateConfiguration } from "../config/validation";
import {
  FIRST_TECHNICAL_LAB_MODULE_IDS,
  TECHNICAL_LAB_RENDERER_IDS,
} from "./contracts";
import {
  validTechnicalLabBundle,
  validTechnicalLabConfiguration,
} from "./foundation-bundle.test-fixture";
import {
  assertTechnicalLabWorstCaseFits,
  TECHNICAL_LAB_SECTION_BUDGET,
  TECHNICAL_LAB_SUSPEND_DATA_LIMIT,
} from "./persistence-size";
import {
  rendererPermitsAction,
  TECHNICAL_LAB_RENDERER_REGISTRY,
} from "./renderer-registry";
import {
  validateTechnicalLabConfigurationAgainstPack,
  validateTechnicalLabPackBundle,
} from "./validation";

describe("Technical Laboratory foundation", () => {
  it("validates the discriminated laboratory configuration", () => {
    expect(
      validateConfiguration(validTechnicalLabConfiguration()),
    ).toEqual({ isValid: true, issues: [] });

    const invalid = validateConfiguration({
      ...validTechnicalLabConfiguration(),
      scenarioId: "SCN_COFFEE_001",
      scoringMode: "completion",
    });
    expect(invalid.isValid).toBe(false);
    expect(invalid.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["scenarioId", "scoringMode"]),
    );
  });

  it("cannot enter the business runtime before laboratory dispatch exists", async () => {
    const embedded = embedConfiguration(
      validTechnicalLabConfiguration(),
    );
    await expect(
      loadRuntimePackage(async (path) => ({
        ok: path === "./tracechain.config.json",
        status: path === "./tracechain.config.json" ? 200 : 404,
        json: async () => embedded,
      })),
    ).rejects.toThrow(
      "dedicated laboratory runtime loader",
    );
  });

  it("accepts one bounded seven-module pack bundle", () => {
    const result = validateTechnicalLabPackBundle(
      validTechnicalLabBundle(),
    );
    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.bundle.pack.moduleIds).toEqual(
        FIRST_TECHNICAL_LAB_MODULE_IDS,
      );
      expect(result.checkedCount).toBeGreaterThan(300);
    }
  });

  it("rejects executable content and private-key material", () => {
    const bundle = validTechnicalLabBundle();
    const result = validateTechnicalLabPackBundle({
      ...bundle,
      fixtures: [
        {
          ...bundle.fixtures[0],
          privateKeyPkcs8Base64Url: "must-not-enter-content",
        },
        ...bundle.fixtures.slice(1),
      ],
      script: "doSomething()",
    });
    expect(result.isValid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["FORBIDDEN_CONTENT"]),
    );
  });

  it("rejects unknown renderers, unsupported actions, and unbounded edits", () => {
    const bundle = validTechnicalLabBundle();
    const first = bundle.modules[0]!;
    const firstExperiment = first.experimentDefinitions[0]!;
    const firstStep = firstExperiment.steps[0]!;
    const result = validateTechnicalLabPackBundle({
      ...bundle,
      modules: [
        {
          ...first,
          experimentDefinitions: [
            {
              ...firstExperiment,
              steps: [
                {
                  ...firstStep,
                  actionType: "SIGN",
                  maximumOccurrences: 5,
                },
                ...firstExperiment.steps.slice(1),
              ],
            },
          ],
        },
        {
          ...bundle.modules[1],
          rendererId: "arbitrary-code",
        },
        ...bundle.modules.slice(2),
      ],
    });
    expect(result.isValid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "UNKNOWN_RENDERER",
        "ACTION_NOT_PERMITTED",
        "UNBOUNDED_ACTION",
      ]),
    );
  });

  it("pins the approved 100-point module contract", () => {
    const bundle = validTechnicalLabBundle();
    const firstAllocation =
      bundle.pack.scoringContract.moduleAllocations[0]!;
    const result = validateTechnicalLabPackBundle({
      ...bundle,
      pack: {
        ...bundle.pack,
        scoringContract: {
          ...bundle.pack.scoringContract,
          moduleAllocations: [
            {
              ...firstAllocation,
              applicationPoints:
                firstAllocation.applicationPoints + 1,
            },
            ...bundle.pack.scoringContract.moduleAllocations.slice(1),
          ],
        },
      },
    });
    expect(result.isValid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "SCORE_ALLOCATION_MISMATCH",
        "SCORE_TOTAL_MISMATCH",
      ]),
    );
  });

  it("rejects unsupported real-versus-simulated claims", () => {
    const bundle = validTechnicalLabBundle();
    const result = validateTechnicalLabPackBundle({
      ...bundle,
      modules: [
        {
          ...bundle.modules[0],
          realMechanismIds: ["MERKLE_TREE"],
        },
        ...bundle.modules.slice(1),
      ],
    });
    expect(result.isValid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(
      "UNKNOWN_REAL_MECHANISM",
    );
  });

  it("requires configuration to reference the exact complete pack", () => {
    const configuration = validTechnicalLabConfiguration();
    const bundle = validTechnicalLabBundle();
    expect(
      validateTechnicalLabConfigurationAgainstPack(
        configuration,
        bundle,
      ),
    ).toEqual([]);
    expect(
      validateTechnicalLabConfigurationAgainstPack(
        {
          ...configuration,
          includedModuleIds: configuration.includedModuleIds.slice(
            0,
            -1,
          ),
        },
        bundle,
      ).map((issue) => issue.path),
    ).toContain("includedModuleIds");
  });

  it("keeps the authored worst case under every SCORM budget", () => {
    const breakdown = assertTechnicalLabWorstCaseFits(
      validTechnicalLabBundle(),
    );
    expect(breakdown.total).toBeLessThanOrEqual(
      TECHNICAL_LAB_SUSPEND_DATA_LIMIT,
    );
    for (const section of Object.keys(
      TECHNICAL_LAB_SECTION_BUDGET,
    ) as Array<keyof typeof TECHNICAL_LAB_SECTION_BUDGET>) {
      expect(breakdown[section]).toBeLessThanOrEqual(
        TECHNICAL_LAB_SECTION_BUDGET[section],
      );
    }
  });

  it("exposes only the seven reviewed renderer capabilities", () => {
    expect(Object.keys(TECHNICAL_LAB_RENDERER_REGISTRY)).toEqual(
      TECHNICAL_LAB_RENDERER_IDS,
    );
    expect(
      rendererPermitsAction("hash-avalanche", "HASH"),
    ).toBe(true);
    expect(
      rendererPermitsAction("hash-avalanche", "SIGN"),
    ).toBe(false);
    expect(
      rendererPermitsAction(
        "state-version-conflict",
        "VALIDATE_STATE_VERSION",
      ),
    ).toBe(true);
  });
});
