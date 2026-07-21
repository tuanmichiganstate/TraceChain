/**
 * Scoring configuration for the coffee scenario (specification section 19).
 *
 * The allocation is by *competency*, not by stage, which is why merging stages
 * 4 and 5 into nine stages left it untouched.
 */

import { ScoreComponent, type ScoringConfiguration } from "../../domain/types/scoring";

export const coffeeScoringConfiguration: ScoringConfiguration = {
  maxScore: 100,
  passingScore: 70,

  componentPoints: {
    [ScoreComponent.TRANSACTION_ACCURACY]: 25,
    [ScoreComponent.TRACEABILITY_COMPLETENESS]: 20,
    [ScoreComponent.DATA_GOVERNANCE]: 15,
    [ScoreComponent.COMPLIANCE_AND_CORRECTION]: 15,
    [ScoreComponent.RECALL_PERFORMANCE]: 20,
    [ScoreComponent.CONCEPTUAL_UNDERSTANDING]: 5,
  },

  /*
   * The deduction ladder from section 19.4. It is deliberately shallow:
   * exploration is the point of a simulation, and a learner who gets something
   * wrong once should still be able to finish well. A required procedural
   * action the learner eventually completes never falls below 60 percent.
   */
  firstAttemptCredit: 1.0,
  secondAttemptCredit: 0.8,
  afterHintCredit: 0.7,
  multipleAttemptCredit: 0.6,
  minimumProceduralCredit: 0.6,

  /* Total points recoverable by repeated invalid attempts is capped, so a
   * learner who struggles early is not mathematically locked out of passing. */
  maxInvalidAttemptPenalty: 40,
};
