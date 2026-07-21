/**
 * Re-export surface for `npm run validate:scenario`.
 *
 * The validator bundles this file so it can inspect the real compiled scenario
 * values rather than parsing the source text. Keeping the entry point separate
 * means the validator never dictates the shape of the scenario modules
 * themselves.
 */

export {
  SCENARIO_TIMELINE,
  TIMELINE_ORDERING_CONSTRAINTS,
} from "../src/scenarios/coffee-traceability/timeline";

export {
  organizations,
  actors,
  locations,
} from "../src/scenarios/coffee-traceability/organizations";

export { DECISION_IDS, HINT_IDS } from "../src/scenarios/coffee-traceability/decisions";

export { STAGE_ACTOR, STAGE_TITLE_KEY } from "../src/scenarios/coffee-traceability/stages";

export {
  SCENARIO_STAGE_ORDER,
  TRANSACTION_TO_EVENT,
  TransactionType,
} from "../src/domain/types/enums";
