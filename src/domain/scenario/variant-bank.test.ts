import { describe, expect, it } from "vitest";
import { CHALLENGE_PRESET } from "../../config/presets";
import { challengeAScenario } from "../../scenarios/challenge-a/scenario";
import {
  assessmentBlueprintFromScenario,
  assignmentForVariant,
  BrowserAttemptSeedGenerator,
  hashAnswerPattern,
  hashScenarioVariant,
  selectVariantAssignment,
  selectVariantIndex,
  type ScenarioVariantBank,
} from "./variant-bank";

function bank(): ScenarioVariantBank {
  const variants = ["A", "B", "C"].map((suffix, index) => ({
    metadata: {
      variantId: `CHALLENGE_${suffix}`,
      variantVersion: "1.0.0",
      caseReference: `CH-0${String(index + 1)}`,
      contentHash: hashScenarioVariant(challengeAScenario),
      answerPatternHash: hashAnswerPattern({ suffix }),
      difficultyBand: "INTERMEDIATE" as const,
      estimatedMinutes: 22,
      variationProfile: {
        certificateCondition: `certificate-${suffix}`,
        discrepancyPattern: `discrepancy-${suffix}`,
        provenancePattern: `provenance-${suffix}`,
        recallPattern: `recall-${suffix}`,
        evidencePattern: `evidence-${suffix}`,
      },
    },
    scenario: challengeAScenario,
  }));
  return {
    bankId: "BANK_COFFEE_CHALLENGE_V1",
    bankVersion: "1.0.0",
    status: "DRAFT",
    titleKey: "challenge.title",
    descriptionKey: "challenge.description",
    supportedModes: ["CHALLENGE"],
    blueprint: assessmentBlueprintFromScenario({
      blueprintId: "BLUEPRINT_COFFEE_CHALLENGE_V1",
      blueprintVersion: "1.0.0",
      scenario: challengeAScenario,
      equivalence: {
        targetCompetencyIndicatorIds: ["BC6.PI1"],
        evidenceRoles: ["SOURCE_EVIDENCE"],
        consequentialDecisionRoles: [
          "INT_CERTIFICATE_INITIAL_SUBMITTED",
        ],
        feedbackPolicy: "STAGE_END",
        hintPolicy: "LIMITED",
        estimatedMinutes: {
          minimum: 20,
          maximum: 30,
        },
        complexityBand: "INTERMEDIATE",
      },
    }),
    variants,
  };
}

describe("seeded scenario-variant selection", () => {
  it("generates a 128-bit unpadded base64url attempt seed", () => {
    const seed = new BrowserAttemptSeedGenerator().nextSeed();

    expect(seed).toMatch(/^[A-Za-z0-9_-]{22}$/u);
    expect(seed).not.toContain("=");
  });

  it("selects the same immutable bank member for the same seed", () => {
    const candidate = bank();
    const first = selectVariantIndex({
      bank: candidate,
      attemptSeed: "AAAAAAAAAAAAAAAAAAAAAA",
      selectionAlgorithmVersion: "1",
    });
    const replay = selectVariantIndex({
      bank: candidate,
      attemptSeed: "AAAAAAAAAAAAAAAAAAAAAA",
      selectionAlgorithmVersion: "1",
    });
    expect(replay).toBe(first);
    expect(first).toBe(0);
  });

  it("reconstructs assignment metadata from a compact index and seed", () => {
    const candidate = bank();
    const selected = selectVariantAssignment({
      bank: candidate,
      attemptSeed: "BBBBBBBBBBBBBBBBBBBBBB",
      assignmentSource: "SCORM_ATTEMPT",
    });
    expect(
      assignmentForVariant({
        bank: candidate,
        variantIndex: selected.variantIndex,
        attemptSeed: selected.attemptSeed,
        assignmentSource: "SCORM_ATTEMPT",
      }),
    ).toEqual(selected);
    expect(selected.bankId).toBe(
      CHALLENGE_PRESET.scenarioVariation.strategy ===
        "SEEDED_VARIANT_BANK"
        ? CHALLENGE_PRESET.scenarioVariation.bankId
        : "",
    );
  });

  it("rejects unbounded or non-portable attempt seeds", () => {
    expect(() =>
      selectVariantIndex({
        bank: bank(),
        attemptSeed: "short",
        selectionAlgorithmVersion: "1",
      }),
    ).toThrow(/Attempt seed/u);
  });
});
