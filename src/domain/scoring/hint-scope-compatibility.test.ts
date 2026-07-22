import { describe, expect, it } from "vitest";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import { allScorableItems } from "../types/scenario";
import {
  decodeAttemptState,
  encodeAttemptState,
  STATE_SCHEMA_MAGIC,
  type AttemptSnapshot,
} from "../../infrastructure/persistence/state-codec";
import { ScenarioStageId } from "../types/enums";
import { calculateScore, isPassing } from "./score-engine";

/**
 * Moving from a stage-wide hint cap to a per-item one changes what a saved
 * attempt is worth, so the question is what happens to attempts that already
 * exist. Nothing in the saved format moves: `HINT_IDS` is unchanged, so the hint
 * bitmap means what it always meant, and the score was never stored -- it is
 * recomputed from decisions and hints on every load, which is what makes the
 * recalculation safe rather than a migration.
 *
 * The one thing that must never happen is a learner losing marks they were
 * already awarded.
 */
const schema = { decisionIds: coffeeScenario.decisionIds, hintIds: coffeeScenario.hintIds };
const items = allScorableItems(coffeeScenario);

function perfectDecisions(): Record<string, { encodedValue: number; attemptCount: number }> {
  return Object.fromEntries(
    items.map((item) => [item.decisionId, { encodedValue: 1, attemptCount: 1 }]),
  );
}

const correctness = Object.fromEntries(items.map((item) => [item.decisionId, true]));

function scoreOf(hintsUsed: readonly string[]): number {
  return calculateScore({ decisions: perfectDecisions(), hintsUsed, correctness }, coffeeScenario)
    .score.totalScore;
}

describe("attempts saved before hint scope became explicit", () => {
  it("still decodes: neither the format nor the hint order moved", () => {
    const snapshot: AttemptSnapshot = {
      currentStageId: ScenarioStageId.RECALL_AND_DEBRIEF,
      completedStageIds: [ScenarioStageId.ORIENTATION, ScenarioStageId.CREATE_BATCH],
      decisions: { INT_RECALL_SCOPE: { encodedValue: 7, attemptCount: 1 } },
      hintsUsed: ["HINT_RECALL_PROVENANCE"],
      isCompleted: false,
      isPassed: false,
    };

    const encoded = encodeAttemptState(snapshot, schema);
    expect(encoded.startsWith(`${STATE_SCHEMA_MAGIC}.`)).toBe(true);
    expect(decodeAttemptState(encoded, schema)).toEqual(snapshot);
  });

  it("recomputes to the same score on every reload", () => {
    const snapshot: AttemptSnapshot = {
      currentStageId: ScenarioStageId.RECALL_AND_DEBRIEF,
      completedStageIds: [],
      decisions: perfectDecisions(),
      hintsUsed: ["HINT_RECALL_PROVENANCE"],
      isCompleted: false,
      isPassed: false,
    };
    const restored = decodeAttemptState(encodeAttemptState(snapshot, schema), schema);

    const first = calculateScore(
      { decisions: restored.decisions, hintsUsed: restored.hintsUsed, correctness },
      coffeeScenario,
    ).score;
    const second = calculateScore(
      { decisions: restored.decisions, hintsUsed: restored.hintsUsed, correctness },
      coffeeScenario,
    ).score;

    expect(second).toEqual(first);
    expect(first.totalScore).toBe(95.5);
  });

  it("can only raise the score of an in-progress attempt, never lower it", () => {
    // The old policy capped the whole stage; the new one caps a subset of it.
    // Recomputing therefore removes caps and can never add one.
    const stageWideLoss = items
      .filter((item) => item.stageId === ScenarioStageId.RECALL_AND_DEBRIEF)
      .reduce((total, item) => total + item.points, 0) *
      (1 - coffeeScenario.scoringConfiguration.afterHintCredit);

    const underOldPolicy = 100 - stageWideLoss;
    const underNewPolicy = scoreOf(["HINT_RECALL_PROVENANCE"]);

    expect(underOldPolicy).toBeCloseTo(92.5, 5);
    expect(underNewPolicy).toBe(95.5);
    expect(underNewPolicy).toBeGreaterThan(underOldPolicy);
  });

  it("never turns a pass into a failure", () => {
    // Every hint combination, against the configured pass mark.
    const hintIds = coffeeScenario.hintIds;
    for (let mask = 0; mask < 1 << hintIds.length; mask += 1) {
      const used = hintIds.filter((_hintId, index) => (mask & (1 << index)) !== 0);
      const score = calculateScore(
        { decisions: perfectDecisions(), hintsUsed: used, correctness },
        coffeeScenario,
      ).score;
      expect(score.totalScore, used.join(",")).toBeGreaterThanOrEqual(100 - 13.2);
      expect(isPassing(score, coffeeScenario.scoringConfiguration), used.join(",")).toBe(true);
    }
  });

  it("takes at most 13.2 points across every hint, where the stage-wide rule took 22.5", () => {
    const all = scoreOf([...coffeeScenario.hintIds]);
    expect(100 - all).toBeCloseTo(13.2, 5);
  });
});
