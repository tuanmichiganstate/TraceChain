/**
 * The coffee traceability scenario, assembled (specification section 35).
 *
 * This object is the single source of truth for everything that makes this
 * scenario *this* scenario. A content author building a mango cold-chain or a
 * pharmaceutical serialization scenario writes another one of these and touches
 * no engine code -- see docs/CONTENT_AUTHORING.md.
 */

import type { ScenarioDefinition } from "../../domain/types/scenario";
import { DEFAULT_LEDGER_CONFIGURATION } from "../../domain/ledger/ledger-engine";
import { actors, locations, organizations } from "./organizations";
import { coffeeStages } from "./stages";
import { coffeeScoringConfiguration } from "./scoring";
import { coffeeSeedAssets, coffeeSeedProvenanceEdges } from "./seed-assets";
import { SCENARIO_TIMELINE } from "./timeline";
import { DECISION_IDS, HINT_IDS } from "./decisions";
import { coffeeScriptedTransactions } from "./scripted-transactions";

export const coffeeScenario: ScenarioDefinition = {
  scenarioId: "SCN_COFFEE_001",
  scenarioVersion: "2.0.0",
  titleKey: "app.title",
  descriptionKey: "app.subtitle",
  // Nine stages rather than ten, to protect this budget (section 2.4).
  estimatedMinutes: 40,

  organizations,
  actors,
  locations,
  timeline: SCENARIO_TIMELINE,

  seedAssets: coffeeSeedAssets,
  /*
   * Empty at startup. The erroneous shipping manifest is a scripted transaction
   * because it depends on the learner's committed custody handoff.
   */
  seedTransactions: [],
  scriptedTransactions: coffeeScriptedTransactions,
  seedProvenanceEdges: coffeeSeedProvenanceEdges,

  stages: coffeeStages,
  scoringConfiguration: coffeeScoringConfiguration,
  ledgerConfiguration: DEFAULT_LEDGER_CONFIGURATION,

  decisionIds: DECISION_IDS,
  hintIds: HINT_IDS,
};
