import { describe, expect, it } from "vitest";
import { AttemptRecorder, correctAnswerFor } from "../../../test/support/attempt-driver";
import {
  ActorId,
  SCENARIO_TIMELINE,
  commands,
  contextFor,
  runUpTo,
} from "../../../test/support/scenario-driver";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import { SCENARIO_STAGE_ORDER, ScenarioStageId } from "../types/enums";
import { encodeAttemptState, decodeAttemptState } from "../../infrastructure/persistence/state-codec";
import { calculateScore } from "../scoring/score-engine";
import { deriveCorrectness, deriveDecisions } from "./interaction-log";
import { currentStage } from "./stage-completion";

const codecSchema = {
  decisionIds: coffeeScenario.decisionIds,
  hintIds: coffeeScenario.hintIds,
};

/** A learner who did everything, correctly, first time. */
async function playFlawlessAttempt(): Promise<{
  recorder: AttemptRecorder;
  state: Awaited<ReturnType<typeof runUpTo>>;
}> {
  const ledger = await runUpTo("sold", { withSeed: true });
  await ledger.submitCommand(commands.recallBatch(), contextFor(ActorId.REGULATORY_AUDITOR));
  await ledger.sealPendingTransactions(SCENARIO_TIMELINE.laboratoryResult);

  const recorder = new AttemptRecorder();
  recorder.answerEveryCheckCorrectly().completeEveryAction();

  return { recorder, state: ledger };
}

/**
 * THE MILESTONE 3 EXIT CONDITION.
 *
 * The full scenario runs headless: all nine stages complete, every knowledge
 * check answered, a score calculated, and completion reached -- with no
 * interface involved at all.
 */
describe("a complete attempt, headless", () => {
  it("completes all nine stages", async () => {
    const { recorder, state } = await playFlawlessAttempt();
    const progress = recorder.progress(state.getState());

    expect(progress.completed).toHaveLength(9);
    expect([...progress.completed]).toEqual([...SCENARIO_STAGE_ORDER]);
    expect(progress.isFinished).toBe(true);
  });

  it("scores 100 and passes", async () => {
    const { recorder } = await playFlawlessAttempt();
    const { score } = recorder.score();

    expect(score.totalScore).toBe(100);
    expect(score.maxScore).toBe(100);
    expect(recorder.isPassing()).toBe(true);
    expect(score.invalidAttempts).toBe(0);
    expect(score.hintsUsed).toBe(0);
  });

  it("answers every required concept", async () => {
    const { recorder } = await playFlawlessAttempt();
    const answered = Object.keys(recorder.decisions);

    // Section 20.1 lists nine concepts; the scenario adds the diagnostic.
    const allCheckIds = coffeeScenario.stages.flatMap((stage) =>
      stage.knowledgeChecks.map((check) => check.knowledgeCheckId),
    );
    expect(allCheckIds.length).toBeGreaterThanOrEqual(10);
    for (const checkId of allCheckIds) {
      expect(answered, checkId).toContain(checkId);
    }
  });

  it("fits the whole attempt inside the SCORM budget", async () => {
    const { recorder, state } = await playFlawlessAttempt();
    const progress = recorder.progress(state.getState());

    const encoded = encodeAttemptState(
      {
        currentStageId: progress.current,
        completedStageIds: progress.completed,
        decisions: recorder.decisions,
        hintsUsed: recorder.hintsUsed,
        isCompleted: progress.isFinished,
        isPassed: recorder.isPassing(),
      },
      codecSchema,
    );

    expect(encoded.length).toBeLessThan(3800);
    expect(encoded.length).toBeLessThan(200);
  });

  /**
   * The reproducibility requirement in section 19.3, tested where it actually
   * matters: across a save and reload, not merely within one session.
   */
  it("recomputes the identical score after a save and restore", async () => {
    const { recorder, state } = await playFlawlessAttempt();
    const progress = recorder.progress(state.getState());
    const before = recorder.score().score;

    const encoded = encodeAttemptState(
      {
        currentStageId: progress.current,
        completedStageIds: progress.completed,
        decisions: recorder.decisions,
        hintsUsed: recorder.hintsUsed,
        isCompleted: progress.isFinished,
        isPassed: recorder.isPassing(),
      },
      codecSchema,
    );

    const restored = decodeAttemptState(encoded, codecSchema);
    const after = calculateScore(
      {
        decisions: restored.decisions,
        hintsUsed: restored.hintsUsed,
        correctness: deriveCorrectness(recorder.interactions),
      },
      coffeeScenario,
    ).score;

    expect(after).toEqual(before);
  });
});

describe("stage progression", () => {
  it("keeps a learner on stage 1 until they answer the diagnostic", async () => {
    const ledger = await runUpTo("created");
    const recorder = new AttemptRecorder();

    expect(currentStage(coffeeScenario, {
      state: ledger.getState(),
      decisions: {},
    })).toBe(ScenarioStageId.ORIENTATION);

    const check = coffeeScenario.stages[0]?.knowledgeChecks[0];
    if (check === undefined) throw new Error("orientation check missing");
    recorder.answerCheck(ScenarioStageId.ORIENTATION, check, correctAnswerFor(check).optionIds);

    // Stage 2's work is already done, so answering unlocks straight past it.
    expect(recorder.progress(ledger.getState()).completed).toContain(
      ScenarioStageId.ORIENTATION,
    );
  });

  it("does not complete a stage whose transaction is missing", async () => {
    const ledger = await runUpTo("created");
    const recorder = new AttemptRecorder().answerEveryCheckCorrectly();

    const shipping = recorder.stageStatus(
      ledger.getState(),
      ScenarioStageId.SHIP_AND_MONITOR,
    );
    expect(shipping.isComplete).toBe(false);
    expect(shipping.unsatisfiedCount).toBeGreaterThan(0);
  });

  it("does not complete a stage whose knowledge check is unanswered", async () => {
    const ledger = await runUpTo("sold");
    const recorder = new AttemptRecorder(); // no checks answered

    const orientation = recorder.stageStatus(ledger.getState(), ScenarioStageId.ORIENTATION);
    expect(orientation.isComplete).toBe(false);
  });

  /** Section 19.6: completion cannot occur before the final debrief. */
  it("blocks completion until the debrief question is answered", async () => {
    const ledger = await runUpTo("sold", { withSeed: true });
    await ledger.submitCommand(commands.recallBatch(), contextFor(ActorId.REGULATORY_AUDITOR));
    await ledger.sealPendingTransactions(SCENARIO_TIMELINE.laboratoryResult);

    const recorder = new AttemptRecorder().completeEveryAction();
    // Answer everything except the debrief.
    for (const stage of coffeeScenario.stages) {
      for (const check of stage.knowledgeChecks) {
        if (check.knowledgeCheckId === "INT_BLOCKCHAIN_NECESSITY") continue;
        const answer = correctAnswerFor(check);
        recorder.answerCheck(stage.stageId, check, answer.optionIds, answer.categoryByItem);
      }
    }

    expect(recorder.progress(ledger.getState()).isFinished).toBe(false);

    const debrief = coffeeScenario.stages
      .flatMap((stage) => stage.knowledgeChecks)
      .find((check) => check.knowledgeCheckId === "INT_BLOCKCHAIN_NECESSITY");
    if (debrief === undefined) throw new Error("debrief check missing");

    recorder.answerCheck(
      ScenarioStageId.RECALL_AND_DEBRIEF,
      debrief,
      correctAnswerFor(debrief).optionIds,
    );

    expect(recorder.progress(ledger.getState()).isFinished).toBe(true);
  });

  it("rebuilds progress from replayed state rather than a stored list", async () => {
    // A resuming learner has their ledger replayed; progression falls out of
    // the same evaluation, so there is nothing to disagree with.
    const ledger = await runUpTo("roasted");
    const recorder = new AttemptRecorder().answerEveryCheckCorrectly();

    const progress = recorder.progress(ledger.getState());
    expect(progress.completed).toContain(ScenarioStageId.TRANSFORM_BATCH);
    expect(progress.completed).not.toContain(ScenarioStageId.PACKAGE_AND_DISTRIBUTE);
  });
});

describe("a learner who makes mistakes", () => {
  it("loses recall marks for sweeping up the lookalike lot", async () => {
    const recorder = new AttemptRecorder().completeEveryAction();
    for (const stage of coffeeScenario.stages) {
      for (const check of stage.knowledgeChecks) {
        const answer = correctAnswerFor(check);
        if (check.knowledgeCheckId === "INT_RECALL_SCOPE") {
          // Includes the near-miss lot: pattern-matched rather than traced.
          recorder.answerCheck(stage.stageId, check, [
            ...answer.optionIds,
            "BAT_PACKAGED_COFFEE_002",
          ]);
          continue;
        }
        recorder.answerCheck(stage.stageId, check, answer.optionIds, answer.categoryByItem);
      }
    }

    const { score } = recorder.score();
    expect(score.recallPerformance).toBeLessThan(20);
    expect(score.totalScore).toBeLessThan(100);
    // Still comfortably passing: one wrong answer must not sink an attempt.
    expect(recorder.isPassing()).toBe(true);
  });

  it("still passes after retrying several transactions", async () => {
    const recorder = new AttemptRecorder().answerEveryCheckCorrectly();
    for (const stage of coffeeScenario.stages) {
      for (const action of stage.scoredActions) {
        recorder.recordAction(stage.stageId, action.decisionId, false);
        recorder.recordAction(stage.stageId, action.decisionId, true);
      }
    }

    const { score } = recorder.score();
    expect(score.invalidAttempts).toBeGreaterThan(0);
    expect(recorder.isPassing()).toBe(true);
  });

  it("can fail while still completing the activity", async () => {
    // Section 19.6 permits completing without passing.
    const ledger = await runUpTo("sold", { withSeed: true });
    await ledger.submitCommand(commands.recallBatch(), contextFor(ActorId.REGULATORY_AUDITOR));
    await ledger.sealPendingTransactions(SCENARIO_TIMELINE.laboratoryResult);

    const recorder = new AttemptRecorder().completeEveryAction();
    for (const stage of coffeeScenario.stages) {
      for (const check of stage.knowledgeChecks) {
        // Answer everything, all wrong: the first option is never correct for
        // the scored checks in this scenario.
        recorder.answerCheck(stage.stageId, check, [check.options[0]?.optionId as string]);
      }
    }

    expect(recorder.progress(ledger.getState()).isFinished).toBe(true);
    expect(recorder.isPassing()).toBe(false);
  });
});

describe("the interaction record", () => {
  it("numbers attempts per target", () => {
    const recorder = new AttemptRecorder();
    recorder.recordAction(ScenarioStageId.CREATE_BATCH, "INT_CREATE_BATCH", false);
    recorder.recordAction(ScenarioStageId.CREATE_BATCH, "INT_CREATE_BATCH", true);

    expect(recorder.decisions["INT_CREATE_BATCH"]?.attemptCount).toBe(2);
  });

  it("lets the last attempt decide correctness", () => {
    // A learner who fixes their mistake has got it right; the cost of having
    // been wrong is carried by the attempt count.
    const recorder = new AttemptRecorder();
    recorder.recordAction(ScenarioStageId.CREATE_BATCH, "INT_CREATE_BATCH", false);
    recorder.recordAction(ScenarioStageId.CREATE_BATCH, "INT_CREATE_BATCH", true);

    expect(deriveCorrectness(recorder.interactions)["INT_CREATE_BATCH"]).toBe(true);
  });

  it("compresses to exactly what the codec persists", () => {
    const recorder = new AttemptRecorder().answerEveryCheckCorrectly();
    const decisions = deriveDecisions(recorder.interactions);

    for (const record of Object.values(decisions)) {
      expect(Number.isInteger(record.encodedValue)).toBe(true);
      expect(record.encodedValue).toBeGreaterThanOrEqual(0);
      expect(record.attemptCount).toBeGreaterThan(0);
    }
  });
});
