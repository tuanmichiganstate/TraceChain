import { describe, expect, it } from "vitest";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import { ScoreComponent } from "../types/scoring";
import { allScorableItems } from "../types/scenario";
import type { DecisionRecord } from "../../infrastructure/persistence/state-codec";
import {
  calculateScore,
  creditFor,
  isPassing,
  scoreRecallPrecision,
  weakestComponents,
  type ScoreInputs,
} from "./score-engine";

const configuration = coffeeScenario.scoringConfiguration;
const items = allScorableItems(coffeeScenario);

/** Answer every scorable item, first attempt, correctly. */
function perfectAttempt(): ScoreInputs {
  const decisions: Record<string, DecisionRecord> = {};
  const correctness: Record<string, boolean> = {};
  for (const item of items) {
    decisions[item.decisionId] = { encodedValue: 1, attemptCount: 1 };
    correctness[item.decisionId] = true;
  }
  return { decisions, hintsUsed: [], correctness };
}

function withOverrides(
  overrides: Partial<Record<string, { attempts: number; correct: boolean }>>,
  hintsUsed: readonly string[] = [],
): ScoreInputs {
  const base = perfectAttempt();
  const decisions = { ...base.decisions };
  const correctness = { ...base.correctness };
  for (const [decisionId, override] of Object.entries(overrides)) {
    if (override === undefined) continue;
    decisions[decisionId] = { encodedValue: 1, attemptCount: override.attempts };
    correctness[decisionId] = override.correct;
  }
  return { decisions, correctness, hintsUsed };
}

describe("score engine", () => {
  describe("the allocation", () => {
    it("awards exactly 100 for a flawless attempt", () => {
      const { score } = calculateScore(perfectAttempt(), coffeeScenario);
      expect(score.totalScore).toBe(100);
      expect(score.maxScore).toBe(100);
    });

    it("fills every component to its declared budget", () => {
      const { score } = calculateScore(perfectAttempt(), coffeeScenario);
      const points = configuration.componentPoints;
      expect(score.transactionAccuracy).toBe(points[ScoreComponent.TRANSACTION_ACCURACY]);
      expect(score.traceabilityCompleteness).toBe(points[ScoreComponent.TRACEABILITY_COMPLETENESS]);
      expect(score.dataGovernance).toBe(points[ScoreComponent.DATA_GOVERNANCE]);
      expect(score.complianceAndCorrection).toBe(points[ScoreComponent.COMPLIANCE_AND_CORRECTION]);
      expect(score.recallPerformance).toBe(points[ScoreComponent.RECALL_PERFORMANCE]);
      expect(score.conceptualUnderstanding).toBe(points[ScoreComponent.CONCEPTUAL_UNDERSTANDING]);
    });

    it("awards nothing for an attempt that answered nothing", () => {
      const { score } = calculateScore(
        { decisions: {}, hintsUsed: [], correctness: {} },
        coffeeScenario,
      );
      expect(score.totalScore).toBe(0);
      expect(isPassing(score, configuration)).toBe(false);
    });

    it("does not score the stage 1 diagnostic either way", () => {
      // Section 8.1: penalising a starting assumption teaches defensive
      // guessing rather than honest self-assessment.
      const wrongDiagnostic = withOverrides({
        INT_ORIENTATION_TRUTH_CHECK: { attempts: 1, correct: false },
      });
      expect(calculateScore(wrongDiagnostic, coffeeScenario).score.totalScore).toBe(100);
    });
  });

  describe("the deduction ladder", () => {
    it("follows section 19.4", () => {
      expect(creditFor(1, false, configuration)).toBe(1.0);
      expect(creditFor(2, false, configuration)).toBe(0.8);
      expect(creditFor(5, false, configuration)).toBe(0.6);
      expect(creditFor(0, false, configuration)).toBe(0);
    });

    it("treats a hint as no worse than a second attempt", () => {
      // A learner who asks for help before guessing should not do worse than
      // one who guesses twice.
      expect(creditFor(1, true, configuration)).toBe(configuration.afterHintCredit);
      expect(creditFor(1, true, configuration)).toBeGreaterThan(
        creditFor(3, false, configuration),
      );
    });

    it("costs points for a second attempt but not catastrophically", () => {
      const retried = withOverrides({ INT_RECALL_SCOPE: { attempts: 2, correct: true } });
      const { score } = calculateScore(retried, coffeeScenario);
      // 15 points at 80% = 12; three lost out of a hundred.
      expect(score.recallPerformance).toBe(17);
      expect(score.totalScore).toBe(97);
    });

    it("counts retries as invalid attempts for the report", () => {
      const retried = withOverrides({
        INT_RECALL_SCOPE: { attempts: 3, correct: true },
        INT_CREATE_BATCH: { attempts: 2, correct: true },
      });
      expect(calculateScore(retried, coffeeScenario).score.invalidAttempts).toBe(3);
    });
  });

  describe("the procedural floor", () => {
    /**
     * A required action cannot be skipped, so a learner who eventually gets it
     * right keeps at least the floor. Grinding them to zero for taking four
     * attempts at a form would punish exactly the exploration this is for.
     */
    it("keeps a required action at its floor however many attempts it took", () => {
      const struggled = withOverrides({ INT_CREATE_BATCH: { attempts: 9, correct: true } });
      const item = calculateScore(struggled, coffeeScenario).items.find(
        (entry) => entry.decisionId === "INT_CREATE_BATCH",
      );
      expect(item?.creditFraction).toBe(configuration.minimumProceduralCredit);
      expect(item?.pointsEarned).toBeCloseTo(4 * 0.6, 5);
    });

    it("does not extend the floor to a question the learner got wrong", () => {
      // The floor is for actions you must complete, not for guessing.
      const wrong = withOverrides({ INT_RECALL_SCOPE: { attempts: 4, correct: false } });
      const item = calculateScore(wrong, coffeeScenario).items.find(
        (entry) => entry.decisionId === "INT_RECALL_SCOPE",
      );
      expect(item?.pointsEarned).toBe(0);
    });
  });

  describe("the repeated-attempt cap", () => {
    /** Every item eventually correct, but at the worst attempt credit. */
    const everythingRetried: ScoreInputs = {
      decisions: Object.fromEntries(
        items.map((item) => [item.decisionId, { encodedValue: 1, attemptCount: 8 }]),
      ),
      correctness: Object.fromEntries(items.map((item) => [item.decisionId, true])),
      hintsUsed: [],
    };

    it("leaves a learner who retried everything still able to pass nothing short of 60", () => {
      const { score } = calculateScore(everythingRetried, coffeeScenario);
      // 0.6 credit across 100 points. Below the 70 pass mark, but recoverable
      // and nowhere near zero -- which is what section 19.3 asks for.
      expect(score.totalScore).toBe(60);
      expect(score.totalScore).toBeGreaterThanOrEqual(
        configuration.maxScore - configuration.maxInvalidAttemptPenalty,
      );
    });

    /**
     * With the specification's own numbers the cap never actually binds: the
     * 0.6 credit floor already limits retry loss to exactly 40, which is
     * exactly `maxInvalidAttemptPenalty`. So the cap is a guard against a
     * harsher ladder rather than something a learner will ever hit.
     *
     * It is kept because the ladder is configuration, and a content author
     * lowering `multipleAttemptCredit` should not be able to make the activity
     * unpassable by accident. This test proves it would engage.
     */
    it("does not bind under the shipped configuration", () => {
      expect(calculateScore(everythingRetried, coffeeScenario).cappedPenaltyPoints).toBe(0);
    });

    it("engages if the credit ladder is made harsher", () => {
      const harsh = {
        ...coffeeScenario,
        scoringConfiguration: {
          ...configuration,
          multipleAttemptCredit: 0.1,
          minimumProceduralCredit: 0.1,
        },
      };

      const { score, cappedPenaltyPoints } = calculateScore(everythingRetried, harsh);

      // Uncapped this would be 10; the cap restores the excess above 40 lost.
      expect(cappedPenaltyPoints).toBeGreaterThan(0);
      expect(score.totalScore).toBe(configuration.maxScore - configuration.maxInvalidAttemptPenalty);
    });

    it("does not refund points for answers that were simply wrong", () => {
      // Otherwise guessing would pay the same as knowing.
      const allWrong: ScoreInputs = {
        decisions: Object.fromEntries(
          items.map((item) => [item.decisionId, { encodedValue: 0, attemptCount: 1 }]),
        ),
        correctness: Object.fromEntries(items.map((item) => [item.decisionId, false])),
        hintsUsed: [],
      };
      expect(calculateScore(allWrong, coffeeScenario).score.totalScore).toBe(0);
    });
  });

  describe("hints", () => {
    it("reduces credit for items in the stage the hint belongs to", () => {
      const withHint = withOverrides({}, ["HINT_RECALL_PROVENANCE"]);
      const { score } = calculateScore(withHint, coffeeScenario);
      expect(score.totalScore).toBeLessThan(100);
      expect(score.hintsUsed).toBe(1);
    });

    it("leaves other stages untouched", () => {
      const withHint = withOverrides({}, ["HINT_RECALL_PROVENANCE"]);
      const item = calculateScore(withHint, coffeeScenario).items.find(
        (entry) => entry.decisionId === "INT_CREATE_BATCH",
      );
      expect(item?.wasHintUsed).toBe(false);
      expect(item?.creditFraction).toBe(1);
    });
  });

  describe("recall precision", () => {
    const affected = ["BAT_A", "BAT_B", "BAT_C"];

    it("gives full credit for an exact selection", () => {
      expect(scoreRecallPrecision(affected, affected)).toBe(1);
    });

    it("penalises missing an affected lot more than over-recalling", () => {
      // Leaving contaminated product on a shelf is worse than destroying good
      // stock, and the scoring says so.
      const missedOne = scoreRecallPrecision(["BAT_A", "BAT_B"], affected);
      const overByOne = scoreRecallPrecision([...affected, "BAT_OTHER"], affected);
      expect(missedOne).toBeLessThan(overByOne);
    });

    it("gives nothing for selecting none of the affected lots", () => {
      expect(scoreRecallPrecision(["BAT_OTHER"], affected)).toBe(0);
    });

    it("never returns a negative fraction", () => {
      const wildlyWrong = scoreRecallPrecision(
        ["X1", "X2", "X3", "X4", "X5", "X6", "X7", "X8"],
        affected,
      );
      expect(wildlyWrong).toBeGreaterThanOrEqual(0);
    });
  });

  describe("determinism and reproducibility", () => {
    it("produces the same score from the same inputs", () => {
      const inputs = withOverrides({ INT_RECALL_SCOPE: { attempts: 2, correct: true } });
      expect(calculateScore(inputs, coffeeScenario).score).toEqual(
        calculateScore(inputs, coffeeScenario).score,
      );
    });

    it("depends only on decisions and hints, not on order of evaluation", () => {
      const inputs = withOverrides({ INT_CREATE_BATCH: { attempts: 3, correct: true } });
      const reversed: ScoreInputs = {
        decisions: Object.fromEntries(Object.entries(inputs.decisions).reverse()),
        correctness: Object.fromEntries(Object.entries(inputs.correctness).reverse()),
        hintsUsed: inputs.hintsUsed,
      };
      expect(calculateScore(reversed, coffeeScenario).score.totalScore).toBe(
        calculateScore(inputs, coffeeScenario).score.totalScore,
      );
    });
  });

  describe("passing", () => {
    it("passes at the threshold", () => {
      const score = calculateScore(perfectAttempt(), coffeeScenario).score;
      expect(isPassing({ ...score, totalScore: 70 }, configuration)).toBe(true);
      expect(isPassing({ ...score, totalScore: 69 }, configuration)).toBe(false);
    });

    it("lets a learner complete without passing", () => {
      // Section 19.6 permits this explicitly.
      const weak: ScoreInputs = {
        decisions: Object.fromEntries(
          items.map((item) => [item.decisionId, { encodedValue: 0, attemptCount: 1 }]),
        ),
        correctness: Object.fromEntries(
          items.map((item, index) => [item.decisionId, index < 2]),
        ),
        hintsUsed: [],
      };
      const { score } = calculateScore(weak, coffeeScenario);
      expect(score.totalScore).toBeLessThan(configuration.passingScore);
    });
  });

  describe("review suggestions", () => {
    it("names the components where the learner lost most", () => {
      const inputs = withOverrides({
        INT_RECALL_SCOPE: { attempts: 1, correct: false },
        INT_RECALL_COMMITTED: { attempts: 1, correct: false },
      });
      const weakest = weakestComponents(calculateScore(inputs, coffeeScenario), coffeeScenario);
      expect(weakest[0]).toBe(ScoreComponent.RECALL_PERFORMANCE);
    });

    it("names nothing after a flawless attempt", () => {
      expect(
        weakestComponents(calculateScore(perfectAttempt(), coffeeScenario), coffeeScenario),
      ).toEqual([]);
    });
  });
});
