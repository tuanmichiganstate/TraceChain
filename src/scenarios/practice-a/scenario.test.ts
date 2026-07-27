import { describe, expect, it } from "vitest";
import { PRACTICE_PRESET } from "../../config/presets";
import {
  validateVariantBank,
} from "../../domain/scenario/variant-bank";
import { validateScenario } from "../../domain/scenario/validate-scenario";
import { ScenarioStageId } from "../../domain/types/enums";
import { coffeeScenario } from "../coffee-traceability/scenario";
import { practiceAScenario } from "./scenario";
import { practiceVariantBank } from "./variant-bank";

describe("curated Practice Operations case", () => {
  it("passes the shared scenario and variant-bank contracts", () => {
    expect(validateScenario(practiceAScenario).isValid).toBe(true);
    expect(
      validateVariantBank({
        bank: practiceVariantBank,
        configuration: PRACTICE_PRESET,
      }).isValid,
    ).toBe(true);
    expect(practiceVariantBank.variants).toHaveLength(1);
  });

  it("changes meaningful facts while preserving the score blueprint", () => {
    expect(
      practiceAScenario.runtime.consequentialCases.certificate
        .certificateAssessment,
    ).toBe("CONTENT_INVALID");
    expect(
      practiceAScenario.runtime.consequentialCases.discrepancy
        .authoredCauseCode,
    ).toBe("UNIT_MISMATCH");
    expect(
      practiceAScenario.runtime.assetRoles.recallSourceAssetId,
    ).toBe(practiceAScenario.runtime.assetRoles.transformedBatchId);
    expect(practiceVariantBank.blueprint).toMatchObject({
      maximumScore: 100,
      operationalPoints: 39,
      knowledgePoints: 61,
    });
  });

  it("restores on-request hints and uses concise authored missions", () => {
    for (const stage of practiceAScenario.stages) {
      const standard = coffeeScenario.stages.find(
        (candidate) => candidate.stageId === stage.stageId,
      );
      expect(stage.availableHints).toEqual(
        standard?.availableHints,
      );
      expect(stage.instructionKey).toMatch(
        /^stage\.practiceA\./u,
      );
    }
    expect(
      practiceAScenario.stages.find(
        (stage) =>
          stage.stageId ===
          ScenarioStageId.ANCHOR_CERTIFICATE,
      )?.instructionKey,
    ).toBe("stage.practiceA.anchorCertificate.instruction");
  });
});
