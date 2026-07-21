/**
 * The nine stages, as data (specification sections 17.2 and 41 step 4).
 *
 * Nine rather than ten: the original stages 4 and 5 are merged into
 * SHIP_AND_MONITOR, because both are logistics and the custody handoff *is* the
 * moment transport begins. All twelve learning objectives in section 2.2
 * survive; what was cut is repetition, to protect the 30-45 minute budget.
 *
 * Stages carrying `isImplemented: false` have their metadata declared but no
 * interface yet. Their content -- knowledge checks, hints, required actions --
 * arrives with Milestone 3, alongside the domain rules that give it meaning.
 * Declaring them now means the router, the progress indicator and the state
 * codec are all driven by this file rather than by a switch statement.
 */

import {
  AssetLifecycleStatus,
  ScenarioStageId,
  TransactionType,
} from "../../domain/types/enums";
import { ScoreComponent } from "../../domain/types/scoring";
import {
  KnowledgeCheckType,
  type ScenarioStageDefinition,
} from "../../domain/types/scenario";
import { ActorId } from "./organizations";

export const GREEN_COFFEE_BATCH_ID = "BAT_GREEN_COFFEE_001";
export const ROASTED_COFFEE_BATCH_ID = "BAT_ROASTED_COFFEE_001";
export const PACKAGED_COFFEE_LOT_ID = "BAT_PACKAGED_COFFEE_001";

export const coffeeStages: readonly ScenarioStageDefinition[] = [
  {
    stageId: ScenarioStageId.ORIENTATION,
    titleKey: "stage.orientation.title",
    instructionKey: "stage.orientation.instruction",
    // No role yet: the learner is observing, not acting. The top bar says so
    // rather than inventing a role they have not been given.
    activeActorIds: [ActorId.PRODUCER_MANAGER],
    requiredActions: [
      {
        actionId: "ACTION_ORIENTATION_ANSWER",
        descriptionKey: "stage.orientation.checkQuestion",
        knowledgeCheckId: "INT_ORIENTATION_TRUTH_CHECK",
      },
    ],
    completionConditions: [
      { conditionType: "KNOWLEDGE_CHECK_ANSWERED", knowledgeCheckId: "INT_ORIENTATION_TRUTH_CHECK" },
    ],
    availableHints: [],
    knowledgeChecks: [
      {
        knowledgeCheckId: "INT_ORIENTATION_TRUTH_CHECK",
        checkType: KnowledgeCheckType.SINGLE_CHOICE,
        questionKey: "stage.orientation.checkQuestion",
        options: [
          { optionId: "OPT_YES_ALWAYS_TRUE", labelKey: "stage.orientation.checkOptionYes" },
          { optionId: "OPT_NO_NOT_AUTOMATIC", labelKey: "stage.orientation.checkOptionNo" },
          { optionId: "OPT_YES_IF_ENDORSED", labelKey: "stage.orientation.checkOptionPartly" },
        ],
        correctOptionIds: ["OPT_NO_NOT_AUTOMATIC"],
        feedbackKey: "stage.orientation.checkFeedback",
        scenarioConnectionKey: "message.inputTruth",
        glossaryTermKey: "terms.permissionedBlockchain",
        scoreComponent: ScoreComponent.CONCEPTUAL_UNDERSTANDING,
        points: 0,
        // Diagnostic only. Section 8.1 requires this not be scored: penalising
        // a starting assumption teaches defensive guessing, not honesty.
        isScored: false,
      },
    ],
    unlocksStageId: ScenarioStageId.CREATE_BATCH,
    isImplemented: true,
  },

  {
    stageId: ScenarioStageId.CREATE_BATCH,
    titleKey: "stage.createBatch.title",
    instructionKey: "stage.createBatch.instruction",
    activeActorIds: [ActorId.PRODUCER_MANAGER],
    requiredActions: [
      {
        actionId: "ACTION_CREATE_BATCH",
        descriptionKey: "stage.createBatch.instruction",
        transactionType: TransactionType.CREATE_BATCH,
      },
    ],
    completionConditions: [
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.CREATE_BATCH },
      { conditionType: "ASSET_EXISTS", assetId: GREEN_COFFEE_BATCH_ID },
    ],
    availableHints: [
      {
        hintId: "HINT_CREATE_BATCH_FIELDS",
        textKey: "hint.createBatchFields",
        penaltyPercent: 10,
      },
    ],
    knowledgeChecks: [],
    producesAssetIds: [GREEN_COFFEE_BATCH_ID],
    unlocksStageId: ScenarioStageId.ANCHOR_CERTIFICATE,
    isImplemented: true,
  },

  {
    stageId: ScenarioStageId.ANCHOR_CERTIFICATE,
    titleKey: "stage.anchorCertificate.title",
    instructionKey: "stage.anchorCertificate.instruction",
    activeActorIds: [ActorId.CERTIFICATION_OFFICER],
    requiredActions: [],
    completionConditions: [
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.ISSUE_CERTIFICATE },
    ],
    availableHints: [],
    knowledgeChecks: [],
    unlocksStageId: ScenarioStageId.SHIP_AND_MONITOR,
    isImplemented: false,
  },

  {
    stageId: ScenarioStageId.SHIP_AND_MONITOR,
    titleKey: "stage.shipAndMonitor.title",
    instructionKey: "stage.shipAndMonitor.instruction",
    // The role switches mid-stage: the producer hands over custody, then the
    // carrier records transport conditions. That handoff is the lesson.
    activeActorIds: [ActorId.PRODUCER_MANAGER, ActorId.LOGISTICS_COORDINATOR],
    requiredActions: [],
    completionConditions: [
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.TRANSFER_CUSTODY },
      {
        conditionType: "TRANSACTION_COMMITTED",
        transactionType: TransactionType.RECORD_TRANSPORT_CONDITION,
      },
    ],
    availableHints: [],
    knowledgeChecks: [],
    unlocksStageId: ScenarioStageId.RECEIVE_AND_CORRECT,
    isImplemented: false,
  },

  {
    stageId: ScenarioStageId.RECEIVE_AND_CORRECT,
    titleKey: "stage.receiveAndCorrect.title",
    instructionKey: "stage.receiveAndCorrect.instruction",
    activeActorIds: [ActorId.PROCESSING_MANAGER],
    requiredActions: [],
    // The correction is mandatory, not optional: the erroneous dispatch
    // manifest is already committed when the learner arrives, so every learner
    // meets the mechanic rather than only those who fail to spot a typo.
    completionConditions: [
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.RECEIVE_BATCH },
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.RECORD_CORRECTION },
    ],
    availableHints: [],
    knowledgeChecks: [],
    unlocksStageId: ScenarioStageId.TRANSFORM_BATCH,
    isImplemented: false,
  },

  {
    stageId: ScenarioStageId.TRANSFORM_BATCH,
    titleKey: "stage.transformBatch.title",
    instructionKey: "stage.transformBatch.instruction",
    activeActorIds: [ActorId.PROCESSING_MANAGER],
    requiredActions: [],
    completionConditions: [
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.TRANSFORM_BATCH },
      {
        conditionType: "ASSET_LIFECYCLE_STATUS",
        assetId: GREEN_COFFEE_BATCH_ID,
        status: AssetLifecycleStatus.CONSUMED_IN_TRANSFORMATION,
      },
    ],
    availableHints: [],
    knowledgeChecks: [],
    producesAssetIds: [ROASTED_COFFEE_BATCH_ID],
    unlocksStageId: ScenarioStageId.PACKAGE_AND_DISTRIBUTE,
    isImplemented: false,
  },

  {
    stageId: ScenarioStageId.PACKAGE_AND_DISTRIBUTE,
    titleKey: "stage.packageAndDistribute.title",
    instructionKey: "stage.packageAndDistribute.instruction",
    activeActorIds: [ActorId.PROCESSING_MANAGER, ActorId.DISTRIBUTION_MANAGER],
    requiredActions: [],
    completionConditions: [
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.PACKAGE_BATCH },
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.DISPATCH_BATCH },
      {
        conditionType: "ASSET_LIFECYCLE_STATUS",
        assetId: PACKAGED_COFFEE_LOT_ID,
        status: AssetLifecycleStatus.AVAILABLE_FOR_SALE,
      },
    ],
    availableHints: [],
    knowledgeChecks: [],
    producesAssetIds: [PACKAGED_COFFEE_LOT_ID],
    unlocksStageId: ScenarioStageId.VERIFY_AND_TAMPER,
    isImplemented: false,
  },

  {
    stageId: ScenarioStageId.VERIFY_AND_TAMPER,
    titleKey: "stage.verifyAndTamper.title",
    instructionKey: "stage.verifyAndTamper.instruction",
    // A public QR view, inspected by the retail manager. There is no consumer
    // role, and inventing one would misrepresent who can write to the ledger.
    activeActorIds: [ActorId.RETAIL_MANAGER],
    requiredActions: [],
    completionConditions: [
      { conditionType: "DECISION_RECORDED", decisionId: "INT_TAMPER_DEMONSTRATION" },
    ],
    availableHints: [],
    knowledgeChecks: [],
    unlocksStageId: ScenarioStageId.RECALL_AND_DEBRIEF,
    isImplemented: false,
  },

  {
    stageId: ScenarioStageId.RECALL_AND_DEBRIEF,
    titleKey: "stage.recallAndDebrief.title",
    instructionKey: "stage.recallAndDebrief.instruction",
    activeActorIds: [ActorId.REGULATORY_AUDITOR],
    requiredActions: [],
    completionConditions: [
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.RECALL_BATCH },
      { conditionType: "DECISION_RECORDED", decisionId: "INT_RECALL_SCOPE" },
    ],
    availableHints: [],
    knowledgeChecks: [],
    isImplemented: false,
  },
];
