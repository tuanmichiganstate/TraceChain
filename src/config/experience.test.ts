import { describe, expect, it } from "vitest";
import packJson from "../../scenario-packs/standard-coffee-stage3/tracechain.pack.json";
import auditPackJson from "../../scenario-packs/guided-coffee-audit/tracechain.pack.json";
import practiceAuditPackJson from "../../scenario-packs/practice-coffee-audit/tracechain.pack.json";
import type {
  ScenarioPackV1,
} from "../platform/contracts/scenario-pack";
import {
  resolveHostedExperienceConfiguration,
} from "../platform/runs/experience-configuration";
import {
  ASSESSMENT_PRESET,
  AUDIT_GUIDED_PRESET,
  AUDIT_PRACTICE_PRESET,
  CHALLENGE_PRESET,
  GUIDED_PRESET,
  PRACTICE_PRESET,
} from "./presets";
import {
  experienceConfigurationHash,
  isAllowedExperienceCombination,
  resolveProductDimensions,
  validateExperienceConfiguration,
} from "./experience";
import { validateConfiguration } from "./validation";

const pack = packJson as ScenarioPackV1;
const scenario = pack.scenarios[0];
const auditPack = auditPackJson as ScenarioPackV1;
const auditScenario = auditPack.scenarios[0];
const practiceAuditPack = practiceAuditPackJson as ScenarioPackV1;
const practiceAuditScenario = practiceAuditPack.scenarios[0];

if (
  scenario === undefined ||
  auditScenario === undefined ||
  practiceAuditScenario === undefined
) {
  throw new Error("Expected the hosted coffee and Audit scenarios.");
}

describe("Configuration Schema V2 product dimensions", () => {
  it("maps every current SCORM selector through one resolver", () => {
    expect(resolveProductDimensions("guided")).toEqual({
      activityType: "OPERATIONS",
      supportProfile: "GUIDED",
      deliveryPurpose: "FORMATIVE",
      outcomeStrategy: "FIXED",
    });
    expect(resolveProductDimensions("practice")).toEqual({
      activityType: "OPERATIONS",
      supportProfile: "PRACTICE",
      deliveryPurpose: "FORMATIVE",
      outcomeStrategy: "CURATED_VARIANT",
    });
    expect(resolveProductDimensions("challenge")).toEqual({
      activityType: "OPERATIONS",
      supportProfile: "CHALLENGE",
      deliveryPurpose: "FORMATIVE",
      outcomeStrategy: "CURATED_VARIANT",
    });
    expect(resolveProductDimensions("assessment")).toEqual({
      activityType: "OPERATIONS",
      supportProfile: "CHALLENGE",
      deliveryPurpose: "ASSESSMENT",
      outcomeStrategy: "FIXED",
    });
    expect(resolveProductDimensions("audit-guided")).toEqual({
      activityType: "AUDIT",
      supportProfile: "GUIDED",
      deliveryPurpose: "FORMATIVE",
      outcomeStrategy: "FIXED",
    });
    expect(resolveProductDimensions("audit-practice")).toEqual({
      activityType: "AUDIT",
      supportProfile: "PRACTICE",
      deliveryPurpose: "FORMATIVE",
      outcomeStrategy: "CURATED_VARIANT",
    });
    expect(resolveProductDimensions("technical-lab")).toEqual({
      activityType: "TECHNICAL_LAB",
      supportProfile: "PRACTICE",
      deliveryPurpose: "FORMATIVE",
      outcomeStrategy: "FIXED",
    });
  });

  it("preserves accepted behavior and resolves the Practice bridge", () => {
    expect(GUIDED_PRESET).toMatchObject({
      configurationSchemaVersion: "2",
      scenarioId: "SCN_COFFEE_001",
      scenarioVersion: "2.3.0",
      feedback: { timing: "IMMEDIATE" },
      hints: { availability: "ENABLED" },
      scoring: { maximumScore: 100, passScore: 70 },
    });
    expect(CHALLENGE_PRESET).toMatchObject({
      scenarioId: "SCN_COFFEE_CHALLENGE",
      scenarioVersion: "2.0.0",
      feedback: { timing: "STAGE_END" },
      hints: { availability: "LIMITED" },
      scenarioVariation: {
        strategy: "SEEDED_VARIANT_BANK",
      },
    });
    expect(PRACTICE_PRESET).toMatchObject({
      scenarioId: "SCN_COFFEE_PRACTICE",
      scenarioVersion: "1.0.0",
      supportProfile: "PRACTICE",
      feedback: { timing: "IMMEDIATE" },
      hints: {
        availability: "ENABLED",
        proactiveOffer: "AVAILABLE_ON_REQUEST",
      },
      retries: {
        professionalDecisionRevision:
          "APPEND_ONLY_MITIGATION",
        maximumMitigationActions: 1,
      },
      scenarioVariation: {
        strategy: "SEEDED_VARIANT_BANK",
      },
    });
    expect(ASSESSMENT_PRESET).toMatchObject({
      scenarioId: "SCN_COFFEE_001",
      scenarioVersion: "2.3.0",
      feedback: { timing: "FINAL" },
      hints: { availability: "DISABLED" },
      scoring: { official: true },
    });
    expect(AUDIT_GUIDED_PRESET).toMatchObject({
      applicationCompatibilityVersion: "ta1-v1",
      activityType: "AUDIT",
      supportProfile: "GUIDED",
      scenarioId: "SCN_GUIDED_COFFEE_AUDIT",
      scenarioVersion: "2.0.0",
    });
    expect(AUDIT_PRACTICE_PRESET).toMatchObject({
      applicationCompatibilityVersion: "ta1-v1",
      activityType: "AUDIT",
      supportProfile: "PRACTICE",
      outcomeStrategy: "CURATED_VARIANT",
      scenarioId: "SCN_PRACTICE_COFFEE_AUDIT",
      scenarioVersion: "1.0.0",
    });
  });

  it("rejects invalid dimension combinations and preset drift", () => {
    expect(
      isAllowedExperienceCombination({
        activityType: "OPERATIONS",
        supportProfile: "GUIDED",
        deliveryPurpose: "ASSESSMENT",
        outcomeStrategy: "FIXED",
      }),
    ).toBe(false);
    const invalid = validateConfiguration({
      ...GUIDED_PRESET,
      deliveryPurpose: "ASSESSMENT",
    });
    expect(invalid.isValid).toBe(false);
    expect(invalid.issues.map((entry) => entry.path)).toContain(
      "deliveryPurpose",
    );
    const incompleteHostedConfiguration = structuredClone(
      GUIDED_PRESET,
    ) as unknown as {
      guidance: Record<string, unknown>;
    };
    delete incompleteHostedConfiguration.guidance.referenceWorkspace;
    expect(
      validateExperienceConfiguration(
        incompleteHostedConfiguration,
      ).map((entry) => entry.path),
    ).toContain("guidance.referenceWorkspace");

    const invalidPractice = validateConfiguration({
      ...PRACTICE_PRESET,
      feedback: {
        ...PRACTICE_PRESET.feedback,
        timing: "STAGE_END",
      },
      hints: {
        ...PRACTICE_PRESET.hints,
        availability: "LIMITED",
      },
    });
    expect(invalidPractice.isValid).toBe(false);
    expect(
      invalidPractice.issues.map((entry) => entry.path),
    ).toEqual(
      expect.arrayContaining([
        "feedback.timing",
        "hints.availability",
      ]),
    );
  });

  it("resolves every hosted behavior profile into stable product metadata", () => {
    const configurations = scenario.modeConfigurations.map(
      (runtimeConfiguration) =>
        resolveHostedExperienceConfiguration({
          packId: pack.packId,
          packVersion: pack.version,
          scenario,
          runtimeConfiguration,
          locale: "vi",
        }),
    );
    expect(configurations).toHaveLength(
      scenario.supportedModes.length,
    );
    expect(
      configurations.map(
        (entry) => entry.configuration.presetId,
      ),
    ).toEqual([
      "hosted-tutorial",
      "hosted-standard",
      "hosted-sandbox",
      "hosted-configured",
    ]);
    for (const entry of configurations) {
      expect(validateExperienceConfiguration(entry.configuration)).toEqual(
        [],
      );
      expect(
        experienceConfigurationHash(entry.configuration),
      ).toBe(entry.configurationHash);
    }
    expect(configurations[0]?.configuration).toMatchObject({
      supportProfile: "GUIDED",
      deliveryPurpose: "FORMATIVE",
      outcomeStrategy: "FIXED",
    });
    expect(configurations[1]?.configuration).toMatchObject({
      supportProfile: "CHALLENGE",
      deliveryPurpose: "ASSESSMENT",
      outcomeStrategy: "FIXED",
    });
    expect(configurations[2]?.configuration).toMatchObject({
      supportProfile: "PRACTICE",
      deliveryPurpose: "SANDBOX",
      outcomeStrategy: "SEEDED_STOCHASTIC",
    });
    expect(configurations[2]?.configuration).toMatchObject({
      guidance: PRACTICE_PRESET.guidance,
      feedback: PRACTICE_PRESET.feedback,
      hints: PRACTICE_PRESET.hints,
      retries: PRACTICE_PRESET.retries,
    });
  });

  it("resolves Guided Audit as one hosted formative configuration", () => {
    const runtimeConfiguration =
      auditScenario.modeConfigurations[0];
    if (runtimeConfiguration === undefined) {
      throw new Error("Expected the Guided Audit runtime profile.");
    }
    const resolved = resolveHostedExperienceConfiguration({
      packId: auditPack.packId,
      packVersion: auditPack.version,
      scenario: auditScenario,
      runtimeConfiguration,
      locale: "en",
    });

    expect(resolved.configuration).toMatchObject({
      presetId: "hosted-audit-guided",
      activityType: "AUDIT",
      supportProfile: "GUIDED",
      deliveryPurpose: "FORMATIVE",
      outcomeStrategy: "FIXED",
      feedback: { timing: "IMMEDIATE" },
      decisions: {
        requireEvidenceCitations: true,
        requirePolicyCitations: true,
        requireConfidence: true,
        allowDrafts: true,
      },
      scoring: {
        scoringBlueprintId: "AUDIT_COFFEE_100",
        maximumScore: 100,
        passScore: 70,
        official: false,
      },
      reporting: {
        causalReport: false,
        auditReport: true,
        competencyReport: true,
      },
      delivery: {
        channel: "HOSTED",
        persistencePolicyId:
          "SERVER_APPEND_ONLY_EVENT_STREAM",
      },
    });
    expect(
      experienceConfigurationHash(resolved.configuration),
    ).toBe(resolved.configurationHash);
  });

  it("resolves Practice Audit with reduced support and stable identity", () => {
    const runtimeConfiguration =
      practiceAuditScenario.modeConfigurations[0];
    if (runtimeConfiguration === undefined) {
      throw new Error("Expected the Practice Audit runtime profile.");
    }
    const resolved = resolveHostedExperienceConfiguration({
      packId: practiceAuditPack.packId,
      packVersion: practiceAuditPack.version,
      scenario: practiceAuditScenario,
      runtimeConfiguration,
      locale: "vi",
    });

    expect(resolved.configuration).toMatchObject({
      presetId: "hosted-audit-practice",
      activityType: "AUDIT",
      supportProfile: "PRACTICE",
      deliveryPurpose: "FORMATIVE",
      outcomeStrategy: "CURATED_VARIANT",
      guidance: {
        missionDetail: "CONCISE",
        evidenceGuidance: "SUGGESTED",
        policyGuidance: "SUGGESTED",
        nextActionGuidance: "GOAL_ONLY",
        showWorkedExamples: false,
      },
      hints: {
        availability: "ENABLED",
        proactiveOffer: "AVAILABLE_ON_REQUEST",
      },
      scoring: {
        scoringBlueprintId: "AUDIT_COFFEE_100",
        maximumScore: 100,
        official: false,
      },
    });
    expect(
      experienceConfigurationHash(resolved.configuration),
    ).toBe(resolved.configurationHash);
    expect(resolved.configurationHash).not.toBe(
      experienceConfigurationHash(AUDIT_GUIDED_PRESET),
    );
  });
});
