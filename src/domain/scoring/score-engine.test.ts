import { describe, expect, it } from "vitest";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import { ScoreComponent } from "../types/scoring";
import { allHints, allScorableItems, type ScenarioDefinition } from "../types/scenario";
import type { DecisionRecord } from "../../infrastructure/persistence/attempt-state";
import {
  calculateScore,
  creditFor,
  hintPointsAtRisk,
  isPassing,
  scoreRecallPrecision,
  weakestComponents,
  type ScoreInputs,
} from "./score-engine";

/** The shipped scenario with one hint re-pointed, for cases it does not cover. */
function withHintTargets(hintId: string, targets: readonly string[]): ScenarioDefinition {
  return {
    ...coffeeScenario,
    stages: coffeeScenario.stages.map((stage) => ({
      ...stage,
      availableHints: stage.availableHints.map((hint) =>
        hint.hintId === hintId ? { ...hint, targetScorableItemIds: targets } : hint,
      ),
    })),
  };
}

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

    it("preserves the published 39 operational / 61 knowledge split", () => {
      const operational = items
        .filter((item) => item.isProcedural)
        .reduce((total, item) => total + item.points, 0);
      const knowledge = items
        .filter((item) => !item.isProcedural)
        .reduce((total, item) => total + item.points, 0);

      expect(operational).toBe(39);
      expect(knowledge).toBe(61);
      expect(operational + knowledge).toBe(100);
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

  /**
   * A hint caps exactly the items it declares it assists, and nothing else.
   *
   * The previous behaviour capped every scorable item in the hint's stage, so
   * the stage 9 provenance hint -- help with one 15-point question -- also
   * repriced the recall transaction and an unrelated question about whether a
   * blockchain is warranted, costing 7.5 points instead of 4.5.
   */
  describe("hints cap only the items they target", () => {
    const item = (inputs: ScoreInputs, decisionId: string) =>
      calculateScore(inputs, coffeeScenario).items.find(
        (entry) => entry.decisionId === decisionId,
      );

    it("caps the knowledge item it targets", () => {
      const scored = item(withOverrides({}, ["HINT_RECALL_PROVENANCE"]), "INT_RECALL_SCOPE");
      expect(scored?.wasHintUsed).toBe(true);
      expect(scored?.creditFraction).toBe(configuration.afterHintCredit);
    });

    it("leaves another knowledge item in the same stage at full credit", () => {
      const scored = item(
        withOverrides({}, ["HINT_RECALL_PROVENANCE"]),
        "INT_BLOCKCHAIN_NECESSITY",
      );
      expect(scored?.wasHintUsed).toBe(false);
      expect(scored?.creditFraction).toBe(1);
    });

    it("leaves an untargeted procedural item in the same stage at full credit", () => {
      const scored = item(withOverrides({}, ["HINT_RECALL_PROVENANCE"]), "INT_RECALL_COMMITTED");
      expect(scored?.wasHintUsed).toBe(false);
      expect(scored?.creditFraction).toBe(1);
    });

    it("caps every item a multi-target hint names", () => {
      // No shipped hint targets two items, so the behaviour is exercised
      // against a scenario that declares one rather than left unproven.
      const scenario = withHintTargets("HINT_RECALL_PROVENANCE", [
        "INT_RECALL_SCOPE",
        "INT_BLOCKCHAIN_NECESSITY",
      ]);
      const scored = calculateScore(withOverrides({}, ["HINT_RECALL_PROVENANCE"]), scenario);
      for (const decisionId of ["INT_RECALL_SCOPE", "INT_BLOCKCHAIN_NECESSITY"]) {
        const entry = scored.items.find((candidate) => candidate.decisionId === decisionId);
        expect(entry?.creditFraction, decisionId).toBe(configuration.afterHintCredit);
      }
      expect(
        scored.items.find((entry) => entry.decisionId === "INT_RECALL_COMMITTED")?.creditFraction,
      ).toBe(1);
    });

    it("does not compound when two hints overlap on the same item", () => {
      const scenario = withHintTargets("HINT_TRANSFORMATION_YIELD", ["INT_RECALL_SCOPE"]);
      const once = calculateScore(withOverrides({}, ["HINT_RECALL_PROVENANCE"]), scenario);
      const twice = calculateScore(
        withOverrides({}, ["HINT_RECALL_PROVENANCE", "HINT_TRANSFORMATION_YIELD"]),
        scenario,
      );
      const creditOf = (breakdown: typeof once) =>
        breakdown.items.find((entry) => entry.decisionId === "INT_RECALL_SCOPE")?.creditFraction;
      expect(creditOf(twice)).toBe(creditOf(once));
      expect(creditOf(twice)).toBe(configuration.afterHintCredit);
    });

    it("keeps two hints with disjoint targets to their own items", () => {
      const inputs = withOverrides({}, ["HINT_RECALL_PROVENANCE", "HINT_CORRECTION_MECHANISM"]);
      expect(item(inputs, "INT_RECALL_SCOPE")?.wasHintUsed).toBe(true);
      expect(item(inputs, "INT_CORRECTION_RECORDED")?.wasHintUsed).toBe(true);
      expect(item(inputs, "INT_RECEIVE_BATCH")?.wasHintUsed).toBe(false);
      expect(item(inputs, "INT_BLOCKCHAIN_NECESSITY")?.wasHintUsed).toBe(false);
    });

    it("caps a targeted item that was already answered correctly", () => {
      // The cap is retroactive by construction: the score is a pure function of
      // decisions and hints, so it cannot depend on which came first.
      const answered = withOverrides({ INT_RECALL_SCOPE: { attempts: 1, correct: true } });
      const before = calculateScore(answered, coffeeScenario).score.totalScore;
      const after = calculateScore(
        { ...answered, hintsUsed: ["HINT_RECALL_PROVENANCE"] },
        coffeeScenario,
      ).score.totalScore;
      expect(after).toBeLessThan(before);
      expect(before - after).toBeCloseTo(15 * (1 - configuration.afterHintCredit), 5);
    });

    it("leaves an untargeted item that was already answered correctly alone", () => {
      const inputs = withOverrides({}, ["HINT_RECALL_PROVENANCE"]);
      expect(item(inputs, "INT_BLOCKCHAIN_NECESSITY")?.pointsEarned).toBe(5);
    });

    it("takes nothing further from a targeted item already below the cap", () => {
      const overrides = { INT_RECALL_SCOPE: { attempts: 3, correct: true } };
      const without = calculateScore(withOverrides(overrides), coffeeScenario).score.totalScore;
      const withHint = calculateScore(
        withOverrides(overrides, ["HINT_RECALL_PROVENANCE"]),
        coffeeScenario,
      ).score.totalScore;
      expect(withHint).toBe(without);
    });

    it("leaves every other stage untouched", () => {
      const breakdown = calculateScore(
        withOverrides({}, ["HINT_RECALL_PROVENANCE"]),
        coffeeScenario,
      );
      const elsewhere = breakdown.items.filter(
        (entry) => entry.decisionId !== "INT_RECALL_SCOPE",
      );
      expect(elsewhere.every((entry) => !entry.wasHintUsed)).toBe(true);
      expect(elsewhere.every((entry) => entry.creditFraction === 1)).toBe(true);
    });

    it("costs 4.5 points on a perfect attempt, not the stage's 7.5", () => {
      const { score } = calculateScore(
        withOverrides({}, ["HINT_RECALL_PROVENANCE"]),
        coffeeScenario,
      );
      expect(score.totalScore).toBe(95.5);
      expect(score.hintsUsed).toBe(1);
    });

    it("reports the same score whichever order the inputs arrive in", () => {
      const inputs = withOverrides({}, ["HINT_CORRECTION_MECHANISM", "HINT_RECALL_PROVENANCE"]);
      const reversed: ScoreInputs = { ...inputs, hintsUsed: [...inputs.hintsUsed].reverse() };
      expect(calculateScore(reversed, coffeeScenario).score).toEqual(
        calculateScore(inputs, coffeeScenario).score,
      );
    });

    it("keeps the pass mark deterministic across a reload", () => {
      const inputs = withOverrides({}, ["HINT_RECALL_PROVENANCE"]);
      const first = calculateScore(inputs, coffeeScenario).score;
      const second = calculateScore({ ...inputs }, coffeeScenario).score;
      expect(second).toEqual(first);
      expect(isPassing(second, configuration)).toBe(isPassing(first, configuration));
    });
  });

  describe("consequential mitigation scoring contract", () => {
    const scoredItem = (
      decisionId: string,
      attempts: number,
      hintsUsed: readonly string[] = [],
    ) =>
      calculateScore(
        withOverrides(
          { [decisionId]: { attempts, correct: true } },
          hintsUsed,
        ),
        coffeeScenario,
      ).items.find((entry) => entry.decisionId === decisionId);

    it("caps remediated certificate storage at the item-scoped hint ceiling", () => {
      const withoutHint = scoredItem(
        "INT_CERTIFICATE_STORAGE_CHOICE",
        2,
      );
      const withHint = scoredItem(
        "INT_CERTIFICATE_STORAGE_CHOICE",
        2,
        ["HINT_CERTIFICATE_STORAGE"],
      );

      expect(withoutHint?.pointsEarned).toBe(4);
      expect(withHint?.pointsEarned).toBe(3.5);
      expect(withHint?.wasHintUsed).toBe(true);
      expect(
        scoredItem("INT_CERTIFICATE_ISSUER_CHECK", 1, [
          "HINT_CERTIFICATE_STORAGE",
        ])?.pointsEarned,
      ).toBe(5);
    });

    it("does not let discrepancy mitigation restore points removed by a hint", () => {
      const withoutHint = scoredItem("INT_CORRECTION_RECORDED", 2);
      const withHint = scoredItem(
        "INT_CORRECTION_RECORDED",
        2,
        ["HINT_CORRECTION_MECHANISM"],
      );

      expect(withoutHint?.pointsEarned).toBe(8);
      expect(withHint?.pointsEarned).toBe(7);
      expect(withHint?.creditFraction).toBe(
        configuration.afterHintCredit,
      );
    });

    it("scores recall scope independently from authorization and resubmission", () => {
      const breakdown = calculateScore(
        withOverrides(
          {
            INT_RECALL_SCOPE: { attempts: 1, correct: true },
            INT_RECALL_COMMITTED: { attempts: 2, correct: true },
          },
          ["HINT_RECALL_PROVENANCE"],
        ),
        coffeeScenario,
      );
      const scope = breakdown.items.find(
        (entry) => entry.decisionId === "INT_RECALL_SCOPE",
      );
      const commitment = breakdown.items.find(
        (entry) => entry.decisionId === "INT_RECALL_COMMITTED",
      );

      expect(scope?.pointsEarned).toBe(10.5);
      expect(commitment?.pointsEarned).toBe(4);
      expect(commitment?.wasHintUsed).toBe(false);
    });
  });

  /**
   * What the hint panel promises: the most opening a hint can *still* cost.
   *
   * The trap is `attemptCount`, which counts attempts already made. An item the
   * learner has not yet got right will be scored on its *next* attempt, so
   * reading attemptCount as the scoring attempt overstates: after one wrong
   * answer the ladder has already dropped to 80%, and the 70% cap can only take
   * the difference. After two it cannot take anything at all.
   */
  describe("the points a hint puts at risk", () => {
    const hintFor = (hintId: string) => {
      const found = allHints(coffeeScenario).find((hint) => hint.hintId === hintId);
      if (found === undefined) throw new Error(`No hint ${hintId}`);
      return found;
    };

    const RECALL_SCOPE = "INT_RECALL_SCOPE";
    const recallHint = () => hintFor("HINT_RECALL_PROVENANCE");
    const scopePoints = items.find((item) => item.decisionId === RECALL_SCOPE)!.points;

    /** The breakdown for a run where one target sits in the given state. */
    const stateOf = (
      decisionId: string,
      attemptCount: number,
      isCorrect: boolean,
      hintsUsed: readonly string[] = [],
    ) => {
      const base = perfectAttempt();
      const decisions = { ...base.decisions };
      const correctness = { ...base.correctness };
      if (attemptCount === 0) {
        delete decisions[decisionId];
        delete correctness[decisionId];
      } else {
        decisions[decisionId] = { encodedValue: 1, attemptCount };
        correctness[decisionId] = isCorrect;
      }
      return calculateScore({ decisions, correctness, hintsUsed }, coffeeScenario);
    };

    /** What the item is actually worth once the learner eventually gets it right. */
    const eventualCredit = (attemptCount: number, isCorrect: boolean, hinted: boolean) => {
      const scoringAttempt = isCorrect ? attemptCount : attemptCount + 1;
      return creditFor(scoringAttempt, hinted, configuration);
    };

    // state, attempts already made, already correct, expected points at risk
    const cases: ReadonlyArray<readonly [string, number, boolean, number]> = [
      ["no attempts yet", 0, false, 4.5],
      ["correct on the first attempt", 1, true, 4.5],
      ["one incorrect attempt, not yet correct", 1, false, 1.5],
      ["two incorrect attempts, not yet correct", 2, false, 0],
      ["correct on the second attempt", 2, true, 1.5],
      ["correct on the third attempt", 3, true, 0],
      ["already below the hint cap", 4, true, 0],
    ];

    for (const [label, attempts, isCorrect, expected] of cases) {
      it(`is ${expected} points when the target is ${label}`, () => {
        const breakdown = stateOf(RECALL_SCOPE, attempts, isCorrect);
        expect(hintPointsAtRisk(recallHint(), coffeeScenario, breakdown)).toBe(expected);

        // The same figure, derived from the credit ladder rather than the
        // function under test, so an off-by-one in either would disagree.
        const without = eventualCredit(attempts, isCorrect, false);
        const withHint = eventualCredit(attempts, isCorrect, true);
        expect(scopePoints * (without - withHint)).toBeCloseTo(expected, 5);

        // And the score difference the learner actually ends up with, once they
        // eventually answer correctly: with the hint against without it.
        const base = perfectAttempt();
        const eventual = (hinted: boolean) =>
          calculateScore(
            {
              decisions: {
                ...base.decisions,
                [RECALL_SCOPE]: {
                  encodedValue: 1,
                  attemptCount: isCorrect ? attempts : attempts + 1,
                },
              },
              correctness: base.correctness,
              hintsUsed: hinted ? [recallHint().hintId] : [],
            },
            coffeeScenario,
          ).score.totalScore;
        expect(eventual(false) - eventual(true)).toBeCloseTo(expected, 5);
      });
    }

    it("is the full cap for a procedural target, and nothing once its floor binds", () => {
      // The correction transaction: 10 points, floored at minimumProceduralCredit.
      const correctionHint = hintFor("HINT_CORRECTION_MECHANISM");
      const untouched = stateOf("INT_CORRECTION_RECORDED", 0, false);
      expect(hintPointsAtRisk(correctionHint, coffeeScenario, untouched)).toBe(3);

      // Two failed attempts put the next success at multipleAttemptCredit, which
      // is already below the cap, and the floor keeps it there either way.
      const struggling = stateOf("INT_CORRECTION_RECORDED", 2, false);
      expect(hintPointsAtRisk(correctionHint, coffeeScenario, struggling)).toBe(0);
    });

    it("counts each target of a multi-item hint in its own state", () => {
      const scenario = withHintTargets("HINT_RECALL_PROVENANCE", [
        RECALL_SCOPE,
        "INT_BLOCKCHAIN_NECESSITY",
      ]);
      const base = perfectAttempt();
      const breakdown = calculateScore(
        {
          decisions: {
            ...base.decisions,
            // One untouched, one already twice wrong: 4.5 + 0.
            [RECALL_SCOPE]: { encodedValue: 1, attemptCount: 1 },
            INT_BLOCKCHAIN_NECESSITY: { encodedValue: 1, attemptCount: 2 },
          },
          correctness: { ...base.correctness, INT_BLOCKCHAIN_NECESSITY: false },
          hintsUsed: [],
        },
        scenario,
      );
      const hint = allHints(scenario).find((entry) => entry.hintId === "HINT_RECALL_PROVENANCE")!;
      expect(hintPointsAtRisk(hint, scenario, breakdown)).toBe(4.5);
    });

    it("is zero once the hint is already open, because the cap is already applied", () => {
      const breakdown = stateOf(RECALL_SCOPE, 1, true, ["HINT_RECALL_PROVENANCE"]);
      expect(hintPointsAtRisk(recallHint(), coffeeScenario, breakdown)).toBe(0);
    });

    it("never goes negative or exceeds what the targets are worth", () => {
      const breakdown = calculateScore(perfectAttempt(), coffeeScenario);
      for (const hint of allHints(coffeeScenario)) {
        const targeted = items
          .filter((entry) => hint.targetScorableItemIds.includes(entry.decisionId))
          .reduce((total, entry) => total + entry.points, 0);
        const risk = hintPointsAtRisk(hint, coffeeScenario, breakdown);
        expect(risk, hint.hintId).toBeGreaterThanOrEqual(0);
        expect(risk, hint.hintId).toBeLessThanOrEqual(targeted);
      }
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
