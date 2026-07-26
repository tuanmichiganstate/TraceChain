import { describe, expect, it } from "vitest";
import { CHALLENGE_PRESET } from "../../config/presets";
import {
  validateVariantBank,
} from "../../domain/scenario/variant-bank";
import { ScenarioStageId } from "../../domain/types/enums";
import { challengeVariantBank } from "./variant-bank";

describe("curated Challenge variant bank", () => {
  it("uses one exact scoring and replay structure across three cases", () => {
    const result = validateVariantBank({
      bank: challengeVariantBank,
      configuration: CHALLENGE_PRESET,
    });
    expect(result.issues).toEqual([]);
    expect(result.isValid).toBe(true);
    expect(challengeVariantBank.blueprint).toMatchObject({
      maximumScore: 100,
      passingScore: 70,
      operationalPoints: 39,
      knowledgePoints: 61,
    });
  });

  it("changes consequential conclusions rather than identifiers alone", () => {
    expect(
      new Set(
        challengeVariantBank.variants.map(
          (variant) => variant.metadata.answerPatternHash,
        ),
      ).size,
    ).toBe(3);
  });

  it("authors a visible incident source that agrees with each recall answer", () => {
    const recallStages = challengeVariantBank.variants.map(
      (variant) =>
        variant.scenario.stages.find(
          (stage) =>
            stage.stageId ===
            ScenarioStageId.RECALL_AND_DEBRIEF,
        ),
    );

    expect(
      recallStages.map((stage) => stage?.instructionKey),
    ).toEqual([
      "stage.challengeA.recall.instruction",
      "stage.challengeB.recall.instruction",
      "stage.challengeC.recall.instruction",
    ]);
    challengeVariantBank.variants.forEach((variant, index) => {
      const stage = recallStages[index];
      const scopeCheck = stage?.knowledgeChecks.find(
        (check) => check.knowledgeCheckId === "INT_RECALL_SCOPE",
      );
      expect(scopeCheck?.correctOptionIds).toContain(
        variant.scenario.runtime.assetRoles
          .recallSourceAssetId,
      );
      expect(
        stage?.requiredActions.find(
          (action) =>
            action.actionId === "ACTION_DETERMINE_SCOPE",
        )?.descriptionKey,
      ).toBe(
        `stage.challenge${String.fromCharCode(65 + index)}.recall.actionScope`,
      );
    });
  });
});
