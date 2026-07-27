/**
 * Re-export surface for `npm run validate:scenario`.
 *
 * The validator bundles this file so it inspects the real compiled scenario
 * rather than parsing source text, and runs the *same* validator the
 * application runs at startup -- so the build cannot pass a scenario the
 * application would reject.
 */

export { coffeeScenario } from "../src/scenarios/coffee-traceability/scenario";
export { practiceAScenario } from "../src/scenarios/practice-a/scenario";
export { practiceVariantBank } from "../src/scenarios/practice-a/variant-bank";
export { challengeAScenario } from "../src/scenarios/challenge-a/scenario";
export { challengeBScenario } from "../src/scenarios/challenge-a/challenge-b";
export { challengeCScenario } from "../src/scenarios/challenge-a/challenge-c";
export { challengeVariantBank } from "../src/scenarios/challenge-a/variant-bank";
export { validateScenario } from "../src/domain/scenario/validate-scenario";
export { validateVariantBank } from "../src/domain/scenario/variant-bank";
export { CHALLENGE_PRESET, PRACTICE_PRESET } from "../src/config/presets";
export {
  ALL_SCENARIO_DATES,
  SCENARIO_TIMELINE,
  TIMELINE_ORDERING_CONSTRAINTS,
} from "../src/scenarios/coffee-traceability/timeline";
export { STAGE_COMPONENTS } from "../src/features/stage-registry";
export { SCENARIO_STAGE_ORDER, TRANSACTION_TO_EVENT, TransactionType } from "../src/domain/types/enums";
