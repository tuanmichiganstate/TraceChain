/**
 * Score calculation (specification section 19).
 *
 * WHAT THE SCORE IS COMPUTED FROM
 * -------------------------------
 * Decisions and hints, never a running total. The score is a pure function of
 * what the learner chose, so it is recomputed identically on every load and can
 * never drift from the record. That is what makes section 19.3's "the final
 * score must be reproducible" true rather than aspirational -- and it is why the
 * compact state codec persists decisions instead of points.
 *
 * WHAT THE MODEL IS FOR
 * ---------------------
 * The deduction ladder is deliberately shallow, because a simulation whose
 * scoring punishes experimentation stops being a simulation and becomes an exam.
 * Section 19.3 is explicit: one incorrect attempt must not make a high score
 * impossible, and repeated-attempt losses are capped.
 *
 * Two provisions do most of that work:
 *
 *   The procedural floor. A required action -- creating the batch, recording the
 *   correction -- cannot be skipped, so a learner who eventually gets it right
 *   keeps at least `minimumProceduralCredit`. Grinding them to zero for taking
 *   three attempts at a form would penalise exactly the exploration this is for.
 *
 *   The global cap. Total points lost to repeated attempts stop at
 *   `maxInvalidAttemptPenalty`, so a learner who struggles early is never
 *   mathematically locked out of passing while there is still activity left.
 *
 *   Worth knowing: under the shipped configuration the cap never actually
 *   binds. A 0.6 credit floor across 100 points limits retry loss to exactly
 *   40, which is exactly `maxInvalidAttemptPenalty`. The cap is therefore a
 *   guard against a *harsher* ladder rather than something a learner will hit.
 *   It is kept because the ladder is content configuration, and lowering
 *   `multipleAttemptCredit` should not be able to make the activity unpassable
 *   by accident. A test covers both facts.
 *
 * Recall precision is the documented exception, scored strictly -- see
 * `scoreRecallPrecision`.
 */

import { ScoreComponent, type ScoreState, type ScoringConfiguration } from "../types/scoring";
import {
  allHints,
  allScorableItems,
  type ScenarioDefinition,
  type ScenarioHint,
} from "../types/scenario";
import type { DecisionRecord } from "../../infrastructure/persistence/state-codec";

/** How one item scored, for the final report's breakdown. */
export interface ItemScore {
  readonly decisionId: string;
  readonly component: ScoreComponent;
  readonly pointsAvailable: number;
  readonly pointsEarned: number;
  readonly creditFraction: number;
  readonly attemptCount: number;
  readonly wasHintUsed: boolean;
  readonly isAnswered: boolean;
  /** Answered *and* right. Needed to know which attempt an item scores on. */
  readonly isCorrect: boolean;
  readonly isProcedural: boolean;
}

export interface ScoreBreakdown {
  readonly score: ScoreState;
  readonly items: readonly ItemScore[];
  /** Points restored by the repeated-attempt cap, if it applied. */
  readonly cappedPenaltyPoints: number;
}

export interface ScoreInputs {
  readonly decisions: Readonly<Record<string, DecisionRecord>>;
  readonly hintsUsed: readonly string[];
  /**
   * Correctness per decision. Knowledge checks derive this from the recorded
   * option; procedural actions from whether the transaction was accepted.
   * A decision absent here is treated as answered-but-wrong.
   */
  readonly correctness: Readonly<Record<string, boolean>>;
}

/**
 * The credit ladder from section 19.4.
 *
 * Using a hint is treated as no worse than a second attempt: a learner who asks
 * for help before guessing should not do worse than one who guesses twice.
 */
export function creditFor(
  attemptCount: number,
  wasHintUsed: boolean,
  configuration: ScoringConfiguration,
): number {
  if (attemptCount <= 0) return 0;

  const attemptCredit =
    attemptCount === 1
      ? configuration.firstAttemptCredit
      : attemptCount === 2
        ? configuration.secondAttemptCredit
        : configuration.multipleAttemptCredit;

  return wasHintUsed ? Math.min(attemptCredit, configuration.afterHintCredit) : attemptCredit;
}

/**
 * Recall precision, scored strictly (section 19.3 permits this).
 *
 * Both error directions cost, and they are not the same mistake: missing an
 * affected lot leaves contaminated product on a shelf, while recalling an
 * unaffected one destroys good stock. Missing costs more.
 *
 * Returns a fraction of the available recall points.
 */
export function scoreRecallPrecision(
  selectedAssetIds: readonly string[],
  affectedAssetIds: readonly string[],
): number {
  const selected = new Set(selectedAssetIds);
  const affected = new Set(affectedAssetIds);
  if (affected.size === 0) return selected.size === 0 ? 1 : 0;

  const found = [...affected].filter((id) => selected.has(id)).length;
  const missed = affected.size - found;
  const overSelected = [...selected].filter((id) => !affected.has(id)).length;

  const missPenalty = (missed / affected.size) * 1.0;
  const overPenalty = (overSelected / affected.size) * 0.5;

  return Math.max(0, 1 - missPenalty - overPenalty);
}

const COMPONENT_FIELD: Readonly<Record<ScoreComponent, keyof ScoreState>> = {
  [ScoreComponent.TRANSACTION_ACCURACY]: "transactionAccuracy",
  [ScoreComponent.TRACEABILITY_COMPLETENESS]: "traceabilityCompleteness",
  [ScoreComponent.DATA_GOVERNANCE]: "dataGovernance",
  [ScoreComponent.COMPLIANCE_AND_CORRECTION]: "complianceAndCorrection",
  [ScoreComponent.RECALL_PERFORMANCE]: "recallPerformance",
  [ScoreComponent.CONCEPTUAL_UNDERSTANDING]: "conceptualUnderstanding",
};

/**
 * The items an opened hint caps, read from the hint's declared targets.
 *
 * Never inferred from stage membership. A hint used to cap every scorable item
 * in its stage, so the provenance hint in stage 9 -- help with one 15-point
 * question -- also repriced the recall transaction and an unrelated question
 * about whether a blockchain is warranted at all, for 7.5 points against 25.
 * A hint now costs credit on exactly the work it assists.
 *
 * Returned as a set so the caller pays for the lookup once rather than per item.
 */
function hintedItemIds(
  scenario: ScenarioDefinition,
  hintsUsed: readonly string[],
): ReadonlySet<string> {
  const used = new Set(hintsUsed);
  const targeted = new Set<string>();
  for (const hint of allHints(scenario)) {
    if (!used.has(hint.hintId)) continue;
    for (const decisionId of hint.targetScorableItemIds) targeted.add(decisionId);
  }
  return targeted;
}

/**
 * The most that opening a hint can still cost, given where the learner is.
 *
 * The subtlety is `attemptCount`: it counts attempts already made, not the
 * attempt an item will be scored on. Those differ precisely when the learner
 * has not got it right yet, because the next attempt is the one that counts --
 * and reading one for the other overstates the cost of a hint exactly when a
 * struggling learner is most likely to want one. After a single wrong answer
 * the ladder has already dropped to `secondAttemptCredit`, so a 70% cap can
 * only take the difference; after two it is at `multipleAttemptCredit` and the
 * cap can take nothing at all.
 *
 * Reads the breakdown rather than raw decisions so correctness, the procedural
 * floor and any cap already in force come from the engine that applies them,
 * instead of being derived a second time here and drifting.
 */
export function hintPointsAtRisk(
  hint: ScenarioHint,
  scenario: ScenarioDefinition,
  breakdown: ScoreBreakdown,
): number {
  const configuration = scenario.scoringConfiguration;
  const scoredByDecisionId = new Map(
    breakdown.items.map((item) => [item.decisionId, item]),
  );

  let atRisk = 0;
  for (const decisionId of hint.targetScorableItemIds) {
    const item = scoredByDecisionId.get(decisionId);
    if (item === undefined) continue;

    // An open hint already caps this item, so opening another cannot take more.
    // This is also what keeps overlapping hints from compounding.
    if (item.wasHintUsed) continue;

    const scoringAttempt = item.isCorrect ? item.attemptCount : item.attemptCount + 1;
    const floored = (credit: number): number =>
      item.isProcedural ? Math.max(credit, configuration.minimumProceduralCredit) : credit;

    const without = floored(creditFor(scoringAttempt, false, configuration));
    const withHint = floored(creditFor(scoringAttempt, true, configuration));
    atRisk += item.pointsAvailable * Math.max(0, without - withHint);
  }

  return round(atRisk);
}

export function calculateScore(
  inputs: ScoreInputs,
  scenario: ScenarioDefinition,
): ScoreBreakdown {
  const configuration = scenario.scoringConfiguration;
  const items = allScorableItems(scenario);
  const hinted = hintedItemIds(scenario, inputs.hintsUsed);

  const scored: ItemScore[] = items.map((item) => {
    const decision = inputs.decisions[item.decisionId];
    const attemptCount = decision?.attemptCount ?? 0;
    const isAnswered = attemptCount > 0;
    const isCorrect = inputs.correctness[item.decisionId] === true;
    const wasHintUsed = hinted.has(item.decisionId);

    let creditFraction = 0;
    if (isAnswered && isCorrect) {
      creditFraction = creditFor(attemptCount, wasHintUsed, configuration);
      if (item.isProcedural) {
        // A required action the learner eventually completed keeps its floor.
        creditFraction = Math.max(creditFraction, configuration.minimumProceduralCredit);
      }
    }

    return {
      decisionId: item.decisionId,
      component: item.scoreComponent,
      pointsAvailable: item.points,
      pointsEarned: item.points * creditFraction,
      creditFraction,
      attemptCount,
      wasHintUsed,
      isAnswered,
      isCorrect,
      isProcedural: item.isProcedural,
    };
  });

  /*
   * The repeated-attempt cap. Only losses caused by *retrying* are capped --
   * an item the learner never got right is a genuine zero, not a penalty, and
   * refunding it would mean guessing paid the same as knowing.
   */
  const retryLoss = scored
    .filter((item) => item.isAnswered && item.creditFraction > 0)
    .reduce((total, item) => total + (item.pointsAvailable - item.pointsEarned), 0);

  const cappedPenaltyPoints = Math.max(0, retryLoss - configuration.maxInvalidAttemptPenalty);

  const componentTotals: Record<keyof ScoreState, number> = {
    transactionAccuracy: 0,
    traceabilityCompleteness: 0,
    dataGovernance: 0,
    complianceAndCorrection: 0,
    recallPerformance: 0,
    conceptualUnderstanding: 0,
    totalScore: 0,
    maxScore: 0,
    hintsUsed: 0,
    invalidAttempts: 0,
  };

  for (const item of scored) {
    const field = COMPONENT_FIELD[item.component];
    componentTotals[field] += item.pointsEarned;
  }

  // Refund proportionally across components, so no single component absorbs it.
  if (cappedPenaltyPoints > 0 && retryLoss > 0) {
    for (const item of scored) {
      const itemLoss = item.pointsAvailable - item.pointsEarned;
      if (itemLoss <= 0 || item.creditFraction === 0) continue;
      const field = COMPONENT_FIELD[item.component];
      componentTotals[field] += (itemLoss / retryLoss) * cappedPenaltyPoints;
    }
  }

  const invalidAttempts = scored.reduce(
    (total, item) => total + Math.max(0, item.attemptCount - 1),
    0,
  );

  const total =
    componentTotals.transactionAccuracy +
    componentTotals.traceabilityCompleteness +
    componentTotals.dataGovernance +
    componentTotals.complianceAndCorrection +
    componentTotals.recallPerformance +
    componentTotals.conceptualUnderstanding;

  const score: ScoreState = {
    transactionAccuracy: round(componentTotals.transactionAccuracy),
    traceabilityCompleteness: round(componentTotals.traceabilityCompleteness),
    dataGovernance: round(componentTotals.dataGovernance),
    complianceAndCorrection: round(componentTotals.complianceAndCorrection),
    recallPerformance: round(componentTotals.recallPerformance),
    conceptualUnderstanding: round(componentTotals.conceptualUnderstanding),
    totalScore: Math.min(round(total), configuration.maxScore),
    maxScore: configuration.maxScore,
    hintsUsed: inputs.hintsUsed.length,
    invalidAttempts,
  };

  return { score, items: scored, cappedPenaltyPoints };
}

/** One decimal place, so a report never shows 17.999999999. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function isPassing(score: ScoreState, configuration: ScoringConfiguration): boolean {
  return score.totalScore >= configuration.passingScore;
}

/** Components where the learner lost the most, for "suggested review topics". */
export function weakestComponents(
  breakdown: ScoreBreakdown,
  scenario: ScenarioDefinition,
  limit = 3,
): readonly ScoreComponent[] {
  const shortfall = new Map<ScoreComponent, number>();
  for (const item of breakdown.items) {
    const current = shortfall.get(item.component) ?? 0;
    shortfall.set(item.component, current + (item.pointsAvailable - item.pointsEarned));
  }
  return [...shortfall.entries()]
    .filter(([component, lost]) => lost > 0 && scenario.scoringConfiguration.componentPoints[component] > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([component]) => component);
}
