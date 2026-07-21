/**
 * The scenario schema (specification sections 17.1, 17.2 and 35).
 *
 * The point of this file is that a content author can build a second scenario
 * -- mango cold-chain, pharmaceutical serialization -- without touching the
 * ledger engine, the rule engine, or any React component. Everything that makes
 * the coffee scenario *the coffee scenario* is data conforming to these types.
 *
 * Three additions to the specification's schema, each closing a gap that made a
 * required feature unbuildable:
 *
 *   - `seedTransactions` and `seedProvenanceEdges`. Section 17.1 offered only
 *     `seedAssets`, which cannot express committed history. Two required
 *     features need it: the dispatch manifest carrying the quantity error must
 *     already be sealed in a block before the learner arrives, and the
 *     distractor lots in section 24.4 need real provenance chains, or
 *     `calculateRecallScope` has nothing to correctly exclude.
 *
 *   - `locations`. Section 10.3 referenced `currentLocationId` and section 24.2
 *     referenced `RecallLocation` without ever defining the entity.
 *
 *   - `timeline`. Three validation rules depend on ordered scenario times, but
 *     the specification contained exactly one concrete timestamp.
 */

import type {
  AssetLifecycleStatus,
  AssetType,
  ComplianceStatus,
  ProvenanceRelationshipType,
  QuantityUnit,
  ScenarioStageId,
  TransactionType,
} from "./enums";
import type { Actor, Location, Organization } from "./models";
import type { SupplyChainCommand } from "../commands/commands";
import type { LedgerConfiguration } from "../ledger/ledger-engine";
import { ScoreComponent } from "./scoring";
import type { ScoringConfiguration } from "./scoring";

/** A pre-existing asset, present before the learner acts. */
export interface SupplyChainAssetSeed {
  readonly assetId: string;
  readonly assetType: AssetType;
  readonly productName: string;
  readonly originLocation: string;
  readonly productionDate: string;
  readonly quantity: number;
  readonly quantityUnit: QuantityUnit;
  readonly packageSizeGrams: number | null;
  readonly ownerOrganizationId: string;
  readonly custodianOrganizationId: string;
  readonly locationId: string;
  readonly lifecycleStatus: AssetLifecycleStatus;
  readonly complianceStatus: ComplianceStatus;
}

/**
 * A transaction that is already committed when the learner arrives.
 *
 * Seeds replay through the identical command -> validate -> event -> commit
 * pipeline as learner transactions, so seeded history is hash-linked and
 * indistinguishable from history the learner created. A seed that fails
 * validation is a scenario authoring error, and the validator says so.
 */
export interface SeedTransactionDefinition {
  readonly seedId: string;
  readonly command: SupplyChainCommand;
  readonly actorId: string;
  readonly organizationId: string;
}

export interface SeedProvenanceEdgeDefinition {
  readonly sourceAssetId: string;
  readonly targetAssetId: string;
  readonly relationshipType: ProvenanceRelationshipType;
}

// ---- Knowledge checks (section 20) -------------------------------------

export enum KnowledgeCheckType {
  SINGLE_CHOICE = "SINGLE_CHOICE",
  MULTIPLE_CHOICE = "MULTIPLE_CHOICE",
  CLASSIFICATION = "CLASSIFICATION",
  ORDERED_STEPS = "ORDERED_STEPS",
}

export interface KnowledgeCheckOption {
  readonly optionId: string;
  readonly labelKey: string;
  /** For CLASSIFICATION: which category this item belongs in. */
  readonly categoryId?: string;
}

export interface KnowledgeCheckCategory {
  readonly categoryId: string;
  readonly labelKey: string;
}

export interface KnowledgeCheckDefinition {
  /**
   * Also the decision identifier used by the compact state codec, so it must
   * appear in DECISION_IDS. The validator enforces that.
   */
  readonly knowledgeCheckId: string;
  readonly checkType: KnowledgeCheckType;
  readonly questionKey: string;
  readonly options: readonly KnowledgeCheckOption[];
  /** Present for CLASSIFICATION checks only. */
  readonly categories?: readonly KnowledgeCheckCategory[];
  readonly correctOptionIds: readonly string[];
  readonly feedbackKey: string;
  /** Ties the answer back to what the learner just did (section 20.3). */
  readonly scenarioConnectionKey: string;
  readonly glossaryTermKey?: string;
  readonly scoreComponent: ScoreComponent;
  readonly points: number;
  /**
   * False for the stage 1 diagnostic. Section 8.1 requires it be unscored --
   * penalising a starting assumption teaches defensive guessing rather than
   * honest self-assessment.
   */
  readonly isScored: boolean;
}

// ---- Stages (section 17.2) ---------------------------------------------

export interface ScenarioHint {
  readonly hintId: string;
  readonly textKey: string;
  /** Applied to the stage's items, capped by the scoring configuration. */
  readonly penaltyPercent: number;
}

export interface RequiredScenarioAction {
  readonly actionId: string;
  readonly descriptionKey: string;
  readonly transactionType?: TransactionType;
  readonly knowledgeCheckId?: string;
}

/**
 * A procedural action that carries marks: composing and committing a
 * transaction correctly, as opposed to answering a question about it.
 *
 * Scored separately from knowledge checks because the deduction ladder treats
 * them differently. Section 19.4 floors a required procedural action at 60% once
 * the learner eventually completes it -- you cannot finish the activity without
 * doing it, so grinding a learner down to zero for taking three attempts at a
 * form would punish exactly the exploration the simulation is for.
 */
export interface ScoredAction {
  /** Must appear in `decisionIds`; the codec stores the outcome positionally. */
  readonly decisionId: string;
  readonly descriptionKey: string;
  readonly transactionType: TransactionType;
  readonly scoreComponent: ScoreComponent;
  readonly points: number;
}

/**
 * Evaluated against world state and the learner's decisions, so stage
 * completion is data rather than a hand-written check per screen.
 *
 * EVERY CONDITION HERE IS MONOTONIC: once true it stays true. That is a hard
 * requirement, not a coincidence.
 *
 * An earlier version included an `ASSET_LIFECYCLE_STATUS` condition, and it was
 * a real defect. Stage 7 required the packaged lot to be AVAILABLE_FOR_SALE and
 * stage 6 required the green batch to be CONSUMED_IN_TRANSFORMATION -- both
 * true at the time, both overwritten when the stage 9 recall set those assets
 * to RECALLED. Three completed stages silently un-completed themselves at the
 * end of the activity, and the learner could never finish.
 *
 * So conditions read history and existence, never mutable status:
 * transactions are never unmade, answers are never unanswered, and assets are
 * never deleted. If you need to express "the batch reached this state", assert
 * the transaction that put it there.
 */
export type StageCompletionCondition =
  | { readonly conditionType: "TRANSACTION_COMMITTED"; readonly transactionType: TransactionType }
  | { readonly conditionType: "KNOWLEDGE_CHECK_ANSWERED"; readonly knowledgeCheckId: string }
  | { readonly conditionType: "ASSET_EXISTS"; readonly assetId: string }
  | { readonly conditionType: "DECISION_RECORDED"; readonly decisionId: string };

export interface ScenarioStageDefinition {
  readonly stageId: ScenarioStageId;
  readonly titleKey: string;
  readonly instructionKey: string;
  /**
   * The specification declared a single `activeActorId`. Two stages need a
   * sequence: stage 4 begins with the producer transferring custody and
   * continues with the carrier recording transport conditions, and stage 7
   * moves from processor to distributor. The first entry is the role the
   * learner starts the stage in, and is what the top bar shows.
   */
  readonly activeActorIds: readonly string[];
  readonly requiredActions: readonly RequiredScenarioAction[];
  readonly completionConditions: readonly StageCompletionCondition[];
  readonly availableHints: readonly ScenarioHint[];
  readonly knowledgeChecks: readonly KnowledgeCheckDefinition[];
  readonly scoredActions: readonly ScoredAction[];
  /**
   * Assets this stage brings into existence. Declaring them lets the validator
   * confirm that every asset a completion condition names is actually created
   * by some stage -- otherwise a typo produces a stage that can never be
   * finished, and the cause is invisible until a learner is stuck in it.
   */
  readonly producesAssetIds?: readonly string[];
  readonly unlocksStageId?: ScenarioStageId;
  /**
   * False while a stage's interface is still to be built. The router shows a
   * placeholder rather than a blank screen, and the learner's progress is
   * still saved.
   */
  readonly isImplemented: boolean;
}

// ---- The scenario ------------------------------------------------------

export interface ScenarioTimeline {
  readonly [eventKey: string]: string;
}

export interface ScenarioDefinition {
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly estimatedMinutes: number;
  readonly organizations: readonly Organization[];
  readonly actors: readonly Actor[];
  readonly locations: readonly Location[];
  readonly timeline: ScenarioTimeline;
  readonly seedAssets: readonly SupplyChainAssetSeed[];
  readonly seedTransactions: readonly SeedTransactionDefinition[];
  readonly seedProvenanceEdges: readonly SeedProvenanceEdgeDefinition[];
  readonly stages: readonly ScenarioStageDefinition[];
  readonly scoringConfiguration: ScoringConfiguration;
  readonly ledgerConfiguration: LedgerConfiguration;
  /** Positional key for the compact state codec. Append-only. */
  readonly decisionIds: readonly string[];
  readonly hintIds: readonly string[];
}

// ---- Lookup helpers ----------------------------------------------------

export function findStage(
  scenario: ScenarioDefinition,
  stageId: ScenarioStageId,
): ScenarioStageDefinition | undefined {
  return scenario.stages.find((stage) => stage.stageId === stageId);
}

export function allKnowledgeChecks(
  scenario: ScenarioDefinition,
): readonly KnowledgeCheckDefinition[] {
  return scenario.stages.flatMap((stage) => stage.knowledgeChecks);
}

export function allHints(scenario: ScenarioDefinition): readonly ScenarioHint[] {
  return scenario.stages.flatMap((stage) => stage.availableHints);
}

export function allScoredActions(scenario: ScenarioDefinition): readonly ScoredAction[] {
  return scenario.stages.flatMap((stage) => stage.scoredActions);
}

/** Every scorable thing, whichever kind it is, in one shape. */
export interface ScorableItem {
  readonly decisionId: string;
  readonly scoreComponent: ScoreComponent;
  readonly points: number;
  /** Procedural items get the minimum-credit floor; questions do not. */
  readonly isProcedural: boolean;
  readonly stageId: ScenarioStageId;
}

export function allScorableItems(scenario: ScenarioDefinition): readonly ScorableItem[] {
  return scenario.stages.flatMap((stage) => [
    ...stage.knowledgeChecks
      .filter((check) => check.isScored)
      .map((check) => ({
        decisionId: check.knowledgeCheckId,
        scoreComponent: check.scoreComponent,
        points: check.points,
        isProcedural: false,
        stageId: stage.stageId,
      })),
    ...stage.scoredActions.map((action) => ({
      decisionId: action.decisionId,
      scoreComponent: action.scoreComponent,
      points: action.points,
      isProcedural: true,
      stageId: stage.stageId,
    })),
  ]);
}
