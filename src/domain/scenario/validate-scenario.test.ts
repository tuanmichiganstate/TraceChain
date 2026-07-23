import { describe, expect, it } from "vitest";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import { STAGE_COMPONENTS } from "../../features/stage-registry";
import { SCENARIO_STAGE_ORDER, ScenarioStageId, TransactionType } from "../types/enums";
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

  it("names each outstanding step separately from the stage instruction", () => {
    // The "what still needs doing" panel renders one line per required action.
    // Pointing those lines at the stage's own instruction makes the panel
    // repeat a paragraph the learner has already read -- and when a stage has
    // two required actions it prints that paragraph twice, so "2 items
    // remaining" sits under two identical bullets with nothing to distinguish
    // them. Every action must carry its own description.
    const offenders = coffeeScenario.stages.flatMap((stage) =>
      stage.requiredActions
        .filter((action) => action.descriptionKey === stage.instructionKey)
        .map((action) => `${stage.stageId}/${action.actionId}`),
    );
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("gives the outstanding steps of a stage distinct descriptions", () => {
    // Stage 7 shipped two required actions pointing at one key, so the panel
    // said "2 items remaining" above the same sentence printed twice.
    const duplicated = coffeeScenario.stages.flatMap((stage) => {
      const keys = stage.requiredActions.map((action) => action.descriptionKey);
      return keys
        .filter((key, index) => keys.indexOf(key) !== index)
        .map((key) => `${stage.stageId}: ${key}`);
    });
    expect(duplicated, duplicated.join(", ")).toEqual([]);
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
              producesAssetIds: [],
              completionConditions: [
                { conditionType: "ASSET_EXISTS" as const, assetId: "BAT_TYPO_001" },
              ],
            }
          : stage,
      ),
    }));
    expect(errorMessages(broken)).toMatch(/unknown asset "BAT_TYPO_001"/);
  });

  /**
   * Every completion condition must be monotonic: once true, true forever.
   * An earlier `ASSET_LIFECYCLE_STATUS` condition was not, and the stage 9
   * recall retroactively un-completed three finished stages by flipping their
   * assets to RECALLED. The condition union no longer offers that shape.
   */
  it("offers no condition that reads mutable asset state", () => {
    const conditionTypes = new Set(
      coffeeScenario.stages.flatMap((stage) =>
        stage.completionConditions.map((condition) => condition.conditionType),
      ),
    );
    expect(conditionTypes).not.toContain("ASSET_LIFECYCLE_STATUS");
    for (const conditionType of conditionTypes) {
      expect([
        "TRANSACTION_COMMITTED",
        "KNOWLEDGE_CHECK_ANSWERED",
        "ASSET_EXISTS",
        "DECISION_RECORDED",
      ]).toContain(conditionType);
    }
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

  it("rejects a trusted context whose role does not match its actor", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      runtime: {
        ...draft.runtime,
        trustedContexts: draft.runtime.trustedContexts.map((context, index) =>
          index === 0 ? { ...context, roleId: "REGULATORY_AUDITOR" } : context,
        ),
      },
    }));
    expect(errorMessages(broken)).toMatch(/role must match the declared actor role/);
  });

  it("rejects a stage whose initial trusted context is not defined", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      runtime: {
        ...draft.runtime,
        initialContextByStage: {
          ...draft.runtime.initialContextByStage,
          [ScenarioStageId.RECALL_AND_DEBRIEF]: "CTX_GHOST",
        },
      },
    }));
    expect(errorMessages(broken)).toMatch(/initialContextByStage.*defined trusted context/);
  });

  it("rejects a role handoff to an unknown trusted context", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      runtime: {
        ...draft.runtime,
        roleHandoffs: draft.runtime.roleHandoffs.map((handoff, index) =>
          index === 0 ? { ...handoff, toContextId: "CTX_GHOST" } : handoff,
        ),
      },
    }));
    expect(errorMessages(broken)).toMatch(/unknown target context "CTX_GHOST"/);
  });

  it("rejects a Stage 9 handoff graph that cannot reach recall authority", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      runtime: {
        ...draft.runtime,
        roleHandoffs: [],
      },
    }));
    expect(errorMessages(broken)).toMatch(
      /cannot reach the authorized recall context/,
    );
  });

  it("rejects a Stage 9 that starts with recall authority already active", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      runtime: {
        ...draft.runtime,
        initialContextByStage: {
          ...draft.runtime.initialContextByStage,
          [ScenarioStageId.RECALL_AND_DEBRIEF]:
            draft.runtime.commandContextByAction["RECALL_BATCH"] as string,
        },
      },
    }));
    expect(errorMessages(broken)).toMatch(
      /must begin outside the authorized recall context/,
    );
  });

  it("rejects command templates without a scenario-controlled context", () => {
    const broken = withScenario((draft) => {
      const { CREATE_BATCH: _removed, ...contexts } =
        draft.runtime.commandContextByAction;
      return {
        ...draft,
        runtime: { ...draft.runtime, commandContextByAction: contexts },
      };
    });
    expect(errorMessages(broken)).toMatch(/CREATE_BATCH.*matching scenario-controlled command context/);
  });

  it("rejects journal limits that exceed the authored TC3 budget", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      runtime: {
        ...draft.runtime,
        journalLimits: {
          ...draft.runtime.journalLimits,
          correctionReasonMaximumUtf8Bytes: 241,
        },
      },
    }));
    expect(errorMessages(broken)).toMatch(/explicit ceiling of at most 240/);
  });

  it("rejects a runtime asset role that no stage can produce", () => {
    const broken = withScenario((draft) => ({
      ...draft,
      runtime: {
        ...draft.runtime,
        assetRoles: {
          ...draft.runtime.assetRoles,
          recallSourceAssetId: "BAT_GHOST",
        },
      },
    }));
    expect(errorMessages(broken)).toMatch(/neither seeded nor produced/);
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
  /**
   * Hint scope is scoring. A hint that names the wrong item charges the learner
   * for work it did not help with, and nothing on screen would reveal it -- so
   * every way of getting the mapping wrong has to fail the gate instead.
   */
  describe("hint targets", () => {
    const firstHintOf = (draft: ScenarioDefinition, stageId: ScenarioStageId) => {
      const stage = draft.stages.find((candidate) => candidate.stageId === stageId);
      if (stage === undefined || stage.availableHints[0] === undefined) {
        throw new Error(`No hint in ${stageId}`);
      }
      return stage.availableHints[0];
    };
    const retarget = (stageId: ScenarioStageId, targets: readonly string[]) =>
      withScenario((draft) => {
        const hint = firstHintOf(draft, stageId);
        (hint as { targetScorableItemIds: readonly string[] }).targetScorableItemIds = targets;
        return draft;
      });

    it("rejects a hint that names no item at all", () => {
      expect(errorMessages(retarget(ScenarioStageId.RECALL_AND_DEBRIEF, []))).toContain(
        "at least one scorable item",
      );
    });

    it("rejects a hint that names an item twice", () => {
      const broken = retarget(ScenarioStageId.RECALL_AND_DEBRIEF, [
        "INT_RECALL_SCOPE",
        "INT_RECALL_SCOPE",
      ]);
      expect(errorMessages(broken)).toContain("same scorable item twice");
    });

    it("rejects a target that is not a scorable item", () => {
      const broken = retarget(ScenarioStageId.RECALL_AND_DEBRIEF, ["INT_NOT_A_REAL_ITEM"]);
      expect(errorMessages(broken)).toContain("not a scorable item");
    });

    it("rejects a target in another stage", () => {
      // A hint is offered inside one stage; charging it against work elsewhere
      // would be invisible at the moment the learner decides to open it.
      const broken = retarget(ScenarioStageId.RECALL_AND_DEBRIEF, ["INT_CREATE_BATCH"]);
      expect(errorMessages(broken)).toContain("may only cap items in their own stage");
    });

    it("rejects a target the learner could not be shown by name", () => {
      const broken = withScenario((draft) => {
        const hint = firstHintOf(draft, ScenarioStageId.RECALL_AND_DEBRIEF);
        (hint as { targetScorableItemIds: readonly string[] }).targetScorableItemIds = [
          "INT_BLOCKCHAIN_NECESSITY",
        ];
        return draft;
      });
      expect(errorMessages(broken)).toContain("no nameKey");
    });

    it("accepts a hint that genuinely names two items in its own stage", () => {
      const scenario = withScenario((draft) => {
        const stage = draft.stages.find(
          (candidate) => candidate.stageId === ScenarioStageId.RECALL_AND_DEBRIEF,
        );
        const check = stage?.knowledgeChecks.find(
          (candidate) => candidate.knowledgeCheckId === "INT_BLOCKCHAIN_NECESSITY",
        );
        (check as { nameKey?: string }).nameKey = "activity.recallScope";
        const hint = firstHintOf(draft, ScenarioStageId.RECALL_AND_DEBRIEF);
        (hint as { targetScorableItemIds: readonly string[] }).targetScorableItemIds = [
          "INT_RECALL_SCOPE",
          "INT_BLOCKCHAIN_NECESSITY",
        ];
        return draft;
      });
      expect(errorMessages(scenario)).toBe("");
    });
  });
});

describe("transaction and event symmetry", () => {
  it("keeps VERIFY_PRODUCT out of the transaction types", () => {
    // Reading the ledger is a query, not a state change: it has no past-tense
    // event and would pollute the ledger the learner is about to inspect.
    expect(Object.values(TransactionType)).not.toContain("VERIFY_PRODUCT");
  });
});
