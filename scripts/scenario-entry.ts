/**
 * Re-export surface for `npm run validate:scenario`.
 *
 * The validator bundles this file so it inspects the real compiled scenario
 * rather than parsing source text, and runs the *same* validator the
 * application runs at startup -- so the build cannot pass a scenario the
 * application would reject.
 */

export { coffeeScenario } from "../src/scenarios/coffee-traceability/scenario";
export { challengeAScenario } from "../src/scenarios/challenge-a/scenario";
export { validateScenario } from "../src/domain/scenario/validate-scenario";
export {
  ALL_SCENARIO_DATES,
  SCENARIO_TIMELINE,
  TIMELINE_ORDERING_CONSTRAINTS,
} from "../src/scenarios/coffee-traceability/timeline";
export { STAGE_COMPONENTS } from "../src/features/stage-registry";
export { SCENARIO_STAGE_ORDER, TRANSACTION_TO_EVENT, TransactionType } from "../src/domain/types/enums";
