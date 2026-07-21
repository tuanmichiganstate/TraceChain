import { describe, expect, it } from "vitest";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import { STAGE_COMPONENTS } from "../../features/stage-registry";
import {
  AssetLifecycleStatus,
  SCENARIO_STAGE_ORDER,
  ScenarioStageId,
  TransactionType,
} from "../types/enums";
import { ScoreComponent } from "../types/scoring";
import { KnowledgeCheckType, type ScenarioDefinition } from "../types/scenario";
import { assertValidScenario, validateScenario } from "./validate-scenario";

/** Mutate a copy of the real scenario, so each case tests one broken thing. */
function withScenario(mutate: (draft: ScenarioDefinition) => ScenarioDefinition): ScenarioDefinition {
  return mutate(structuredClone(coffeeScenario) as ScenarioDefinition);
}

function errorMessages(scenario: ScenarioDefinition): string {
  return validateScenario(scenario)
    .issues.filter((issue) => issue.severity === "ERROR")
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join(" | ");
}

describe("the coffee scenario", () => {
  it("is valid", () => {
    const result = validateScenario(coffeeScenario);
    const errors = result.issues.filter((issue) => issue.severity === "ERROR");
    expect(errors, errors.map((e) => `${e.path}: ${e.message}`).join("\n")).toHaveLength(0);
    expect(result.isValid).toBe(true);
  });

  it("runs a substantial number of checks", () => {
    // Guards against a refactor that silently stops validating.
    expect(validateScenario(coffeeScenario).checkedCount).toBeGreaterThan(100);
  });

  it("declares nine stages in the codec's positional order", () => {
    expect(coffeeScenario.stages).toHaveLength(9);
    expect(coffeeScenario.stages.map((stage) => stage.stageId)).toEqual([...SCENARIO_STAGE_ORDER]);
  });

  it("agrees with the stage component registry", () => {
    const implemented = coffeeScenario.stages
      .filter((stage) => stage.isImplemented)
      .map((stage) => stage.stageId);
    expect([...implemented].sort()).toEqual(Object.keys(STAGE_COMPONENTS).sort());
  });

  it("allocates exactly 100 points across the six components", () => {
    const total = Object.values(ScoreComponent).reduce(
      (sum, component) => sum + coffeeScenario.scoringConfiguration.componentPoints[component],
      0,
    );
    expect(total).toBe(100);
    expect(coffeeScenario.scoringConfiguration.passingScore).toBe(70);
  });

  it("seeds a near-miss distractor that only provenance distinguishes", () => {
    const affected = coffeeScenario.seedAssets.find(
      (asset) => asset.assetId === "BAT_PACKAGED_COFFEE_002",
    );
    const unrelated = coffeeScenario.seedAssets.find(
      (asset) => asset.assetId === "BAT_PACKAGED_COFFEE_003",
    );

    // The near miss shares variety and region with the learner's own batch, so
    // name and origin cannot separate it -- only the provenance graph can.
    expect(affected?.originLocation).toBe("Lam Dong");
    expect(affected?.productName).toMatch(/Arabica/);
    // The control is obviously different, catching a learner who over-recalls.
    expect(unrelated?.originLocation).not.toBe("Lam Dong");
    expect(unrelated?.productName).toMatch(/Robusta/);
  });

  it("gives the near-miss chain real provenance edges but leaves the control orphaned", () => {
    const edges = coffeeScenario.seedProvenanceEdges;
    expect(edges.some((edge) => edge.targetAssetId === "BAT_PACKAGED_COFFEE_002")).toBe(true);
    expect(
      edges.some(
        (edge) =>
          edge.sourceAssetId === "BAT_PACKAGED_COFFEE_003" ||
          edge.targetAssetId === "BAT_PACKAGED_COFFEE_003",
      ),
    ).toBe(false);
  });

  it("never links a seeded distractor to the learner's own batch", () => {
    // If it did, a correct recall would sweep up the distractor and the
    // exercise would have no wrong answer.
    for (const edge of coffeeScenario.seedProvenanceEdges) {
      expect(edge.sourceAssetId).not.toBe("BAT_GREEN_COFFEE_001");
      expect(edge.targetAssetId).not.toBe("BAT_GREEN_COFFEE_001");
    }
  });

  it("passes the throwing form used at startup", () => {
    expect(() => assertValidScenario(coffeeScenario)).not.toThrow();
  });
});

describe("scenario validation catches authoring mistakes", () => {
  it("rejects a stage order that disagrees with the codec", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      stages: [...draft.stages].reverse(),
    }));
    expect(errorMessages(broken)).toMatch(/Stage order must match/);
  });

  it("rejects a knowledge check missing from decisionIds", () => {
    // The quiet failure: the answer is collected and scored, then lost on
    // resume because the codec has no slot for it.
    const broken = withScenario((draft) => ({
      ...draft,
      decisionIds: draft.decisionIds.filter((id) => id !== "INT_ORIENTATION_TRUTH_CHECK"),
    }));
    expect(errorMessages(broken)).toMatch(/will not be saved/);
  });

  it("rejects a hint missing from hintIds", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      hintIds: draft.hintIds.filter((id) => id !== "HINT_CREATE_BATCH_FIELDS"),
    }));
    expect(errorMessages(broken)).toMatch(/hints\.HINT_CREATE_BATCH_FIELDS/);
  });

  /**
   * The mistake this catches is a typo in an asset identifier. Nothing crashes;
   * the learner simply arrives at a stage that can never report itself
   * complete, and the cause is three layers away in a condition evaluator.
   */
  it("rejects a completion condition naming an asset no stage creates", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      stages: draft.stages.map((stage) =>
        stage.stageId === ScenarioStageId.TRANSFORM_BATCH
          ? {
              ...stage,
              completionConditions: [
                {
                  conditionType: "ASSET_LIFECYCLE_STATUS" as const,
                  assetId: "BAT_TYPO_001",
                  status: AssetLifecycleStatus.PROCESSED,
                },
              ],
            }
          : stage,
      ),
    }));
    expect(errorMessages(broken)).toMatch(/unknown asset "BAT_TYPO_001"/);
  });

  it("accepts a condition naming an asset a stage declares it produces", () => {
    // The same condition shape is fine once some stage claims to create it.
    const fixed = withScenario((draft) => ({
      ...draft,
      stages: draft.stages.map((stage) =>
        stage.stageId === ScenarioStageId.TRANSFORM_BATCH
          ? {
              ...stage,
              producesAssetIds: [...(stage.producesAssetIds ?? []), "BAT_EXTRA_001"],
              completionConditions: [
                ...stage.completionConditions,
                {
                  conditionType: "ASSET_LIFECYCLE_STATUS" as const,
                  assetId: "BAT_EXTRA_001",
                  status: AssetLifecycleStatus.PROCESSED,
                },
              ],
            }
          : stage,
      ),
    }));
    expect(errorMessages(fixed)).not.toMatch(/BAT_EXTRA_001/);
  });

  it("rejects an actor belonging to an undefined organization", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      actors: draft.actors.map((actor, index) =>
        index === 0 ? { ...actor, organizationId: "ORG_GHOST" } : actor,
      ),
    }));
    expect(errorMessages(broken)).toMatch(/unknown organization "ORG_GHOST"/);
  });

  it("rejects identifiers that break the prefix convention", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      locations: draft.locations.map((location, index) =>
        index === 0 ? { ...location, locationId: "FARM_1" } : location,
      ),
    }));
    expect(errorMessages(broken)).toMatch(/LOC_ prefix/);
  });

  it("rejects component points that do not sum to the maximum score", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      scoringConfiguration: {
        ...draft.scoringConfiguration,
        componentPoints: {
          ...draft.scoringConfiguration.componentPoints,
          [ScoreComponent.RECALL_PERFORMANCE]: 5,
        },
      },
    }));
    expect(errorMessages(broken)).toMatch(/but maxScore is 100/);
  });

  it("rejects a credit ladder that rewards more attempts", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      scoringConfiguration: { ...draft.scoringConfiguration, secondAttemptCredit: 1.2 },
    }));
    expect(errorMessages(broken)).toMatch(/between 0 and 1|must not increase/);
  });

  it("rejects a timeline entry that is not a UTC instant", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      timeline: { ...draft.timeline, batchCreated: "10 December 2025" },
    }));
    expect(errorMessages(broken)).toMatch(/valid ISO 8601 UTC instant/);
  });

  it("rejects a seeded UNIT asset with no package size", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      seedAssets: draft.seedAssets.map((asset) =>
        asset.quantityUnit === "UNIT" ? { ...asset, packageSizeGrams: null } : asset,
      ),
    }));
    expect(errorMessages(broken)).toMatch(/must declare packageSizeGrams/);
  });

  it("rejects a provenance edge pointing at an unseeded asset", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      seedProvenanceEdges: [
        ...draft.seedProvenanceEdges,
        {
          sourceAssetId: "BAT_NOT_SEEDED",
          targetAssetId: "BAT_PACKAGED_COFFEE_002",
          relationshipType: draft.seedProvenanceEdges[0]!.relationshipType,
        },
      ],
    }));
    expect(errorMessages(broken)).toMatch(/is not a seeded asset/);
  });

  it("rejects a stage with no completion condition", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      stages: draft.stages.map((stage) =>
        stage.stageId === ScenarioStageId.CREATE_BATCH
          ? { ...stage, completionConditions: [] }
          : stage,
      ),
    }));
    expect(errorMessages(broken)).toMatch(/can never be finished/);
  });

  it("rejects a single-choice check with two correct answers", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      stages: draft.stages.map((stage) =>
        stage.stageId === ScenarioStageId.ORIENTATION
          ? {
              ...stage,
              knowledgeChecks: stage.knowledgeChecks.map((check) => ({
                ...check,
                checkType: KnowledgeCheckType.SINGLE_CHOICE,
                correctOptionIds: ["OPT_NO_NOT_AUTOMATIC", "OPT_YES_ALWAYS_TRUE"],
              })),
            }
          : stage,
      ),
    }));
    expect(errorMessages(broken)).toMatch(/exactly one correct option/);
  });

  it("rejects a correct option that is not among the options", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      stages: draft.stages.map((stage) =>
        stage.stageId === ScenarioStageId.ORIENTATION
          ? {
              ...stage,
              knowledgeChecks: stage.knowledgeChecks.map((check) => ({
                ...check,
                correctOptionIds: ["OPT_TYPO"],
              })),
            }
          : stage,
      ),
    }));
    expect(errorMessages(broken)).toMatch(/is not among the options/);
  });

  it("rejects a stage claiming to produce an already-seeded asset", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      stages: draft.stages.map((stage) =>
        stage.stageId === ScenarioStageId.CREATE_BATCH
          ? { ...stage, producesAssetIds: ["BAT_PACKAGED_COFFEE_003"] }
          : stage,
      ),
    }));
    expect(errorMessages(broken)).toMatch(/already seeded/);
  });

  it("rejects a required action naming an unknown knowledge check", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      stages: draft.stages.map((stage) =>
        stage.stageId === ScenarioStageId.ORIENTATION
          ? {
              ...stage,
              requiredActions: [
                {
                  actionId: "ACTION_X",
                  descriptionKey: "stage.orientation.instruction",
                  knowledgeCheckId: "INT_NOT_A_CHECK",
                },
              ],
            }
          : stage,
      ),
    }));
    expect(errorMessages(broken)).toMatch(/unknown knowledge check/);
  });

  it("rejects an unknown active actor", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      stages: draft.stages.map((stage) =>
        stage.stageId === ScenarioStageId.CREATE_BATCH
          ? { ...stage, activeActorIds: ["ACT_NOBODY"] }
          : stage,
      ),
    }));
    expect(errorMessages(broken)).toMatch(/Active actor "ACT_NOBODY" is not defined/);
  });

  it("reports every problem at once rather than stopping at the first", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      scenarioId: "COFFEE",
      estimatedMinutes: 0,
      hintIds: [],
    }));
    const errors = validateScenario(broken).issues.filter((issue) => issue.severity === "ERROR");
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it("throws from the startup form when invalid", () => {
    const broken = withScenario((draft) => ({ ...draft, scenarioId: "COFFEE" }));
    expect(() => assertValidScenario(broken)).toThrow(/failed|invalid/i);
  });
});

describe("transaction and event symmetry", () => {
  it("keeps VERIFY_PRODUCT out of the transaction types", () => {
    // Reading the ledger is a query, not a state change: it has no past-tense
    // event and would pollute the ledger the learner is about to inspect.
    expect(Object.values(TransactionType)).not.toContain("VERIFY_PRODUCT");
  });
});
