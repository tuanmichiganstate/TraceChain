/**
 * The nine stages, as data (specification sections 17.2 and 41 step 4).
 *
 * Nine rather than ten: the original stages 4 and 5 are merged into
 * SHIP_AND_MONITOR, because both are logistics and the custody handoff *is* the
 * moment transport begins. All twelve learning objectives in section 2.2
 * survive; what was cut is repetition, to protect the 30-45 minute budget.
 *
 * POINTS
 * ------
 * The 100 available points are allocated here, item by item. The scenario
 * validator checks the component totals against `scoring.ts`, so a mistake in
 * this file fails the build rather than quietly changing what the activity is
 * worth:
 *
 *   Transaction accuracy        25   4 + 6 + 3 + 4 + 3 + 5
 *   Traceability completeness   20   8 + 7 + 5
 *   Data governance             15   5 + 5 + 5
 *   Compliance and correction   15   5 + 10
 *   Recall performance          20   15 + 5
 *   Conceptual understanding     5   5
 *
 * Every declared stage has a registered learner interface. The scenario also
 * runs headless through the executable scenario-contract fixture.
 */

import { QuantityUnit, ScenarioStageId, TransactionType } from "../../domain/types/enums";
import { ScoreComponent } from "../../domain/types/scoring";
import type { ScenarioStageDefinition } from "../../domain/types/scenario";
import { ActorId } from "./organizations";
import {
  blockchainNecessityCheck,
  certificateIssuerCheck,
  certificateStorageCheck,
  custodyTransferScopeCheck,
  dataGovernanceCheck,
  orientationTruthCheck,
  recallScopeCheck,
  tamperIntegrityCheck,
  transformationProvenanceCheck,
  transportConditionCheck,
} from "./knowledge-checks";
import { SHIPPING_MANIFEST_ANCHOR_ID, WEIGHED_QUANTITY_KG } from "./facts";
import { StaffProfileId } from "./staff-profiles";

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
        knowledgeCheckId: orientationTruthCheck.knowledgeCheckId,
      },
    ],
    completionConditions: [
      {
        conditionType: "KNOWLEDGE_CHECK_ANSWERED",
        knowledgeCheckId: orientationTruthCheck.knowledgeCheckId,
      },
    ],
    availableHints: [],
    knowledgeChecks: [orientationTruthCheck],
    scoredActions: [],
    unlocksStageId: ScenarioStageId.CREATE_BATCH,
    isImplemented: true,
  },

  {
    stageId: ScenarioStageId.CREATE_BATCH,
    titleKey: "stage.createBatch.title",
    instructionKey: "stage.createBatch.instruction",
    activeActorIds: [ActorId.PRODUCER_MANAGER],
    staffProfileIds: [StaffProfileId.PRODUCER_MANAGER],
    requiredActions: [
      {
        actionId: "ACTION_CREATE_BATCH",
        descriptionKey: "stage.createBatch.action.create",
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
        // Names the two fields the create-batch transaction is rejected on.
        targetScorableItemIds: ["INT_CREATE_BATCH"],
      },
    ],
    knowledgeChecks: [],
    scoredActions: [
      {
        decisionId: "INT_CREATE_BATCH",
        nameKey: "activity.createBatch",
        descriptionKey: "stage.createBatch.instruction",
        transactionType: TransactionType.CREATE_BATCH,
        scoreComponent: ScoreComponent.TRANSACTION_ACCURACY,
        points: 4,
      },
    ],
    producesAssetIds: [GREEN_COFFEE_BATCH_ID],
    unlocksStageId: ScenarioStageId.ANCHOR_CERTIFICATE,
    isImplemented: true,
  },

  {
    stageId: ScenarioStageId.ANCHOR_CERTIFICATE,
    titleKey: "stage.anchorCertificate.title",
    instructionKey: "stage.anchorCertificate.instruction",
    activeActorIds: [ActorId.CERTIFICATION_OFFICER],
    staffProfileIds: [StaffProfileId.CERTIFICATION_OFFICER],
    requiredActions: [
      {
        actionId: "ACTION_CHOOSE_STORAGE",
        descriptionKey: "check.certificateStorage.question",
        knowledgeCheckId: certificateStorageCheck.knowledgeCheckId,
      },
      {
        actionId: "ACTION_REJECT_UNAUTHORIZED",
        descriptionKey: "check.certificateIssuer.question",
        knowledgeCheckId: certificateIssuerCheck.knowledgeCheckId,
      },
    ],
    completionConditions: [
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.ISSUE_CERTIFICATE },
      {
        conditionType: "DECISION_RECORDED",
        decisionId: "INT_CERTIFICATE_INITIAL_SUBMITTED",
      },
      {
        conditionType: "DECISION_RECORDED",
        decisionId: "INT_CERTIFICATE_MITIGATION_COMPLETE",
      },
      {
        conditionType: "KNOWLEDGE_CHECK_ANSWERED",
        knowledgeCheckId: certificateStorageCheck.knowledgeCheckId,
      },
      {
        conditionType: "KNOWLEDGE_CHECK_ANSWERED",
        knowledgeCheckId: certificateIssuerCheck.knowledgeCheckId,
      },
    ],
    availableHints: [
      {
        hintId: "HINT_CERTIFICATE_STORAGE",
        textKey: "hint.certificateStorage",
        // On-chain versus off-chain storage. It says nothing about whether an
        // issuer has standing, so the issuer check keeps its full credit.
        targetScorableItemIds: ["INT_CERTIFICATE_STORAGE_CHOICE"],
      },
    ],
    knowledgeChecks: [certificateStorageCheck, certificateIssuerCheck],
    scoredActions: [],
    unlocksStageId: ScenarioStageId.SHIP_AND_MONITOR,
    isImplemented: true,
  },

  {
    stageId: ScenarioStageId.SHIP_AND_MONITOR,
    titleKey: "stage.shipAndMonitor.title",
    instructionKey: "stage.shipAndMonitor.instruction",
    // The role switches mid-stage: the producer hands over custody, then the
    // carrier records transport conditions. That handoff is the lesson.
    activeActorIds: [ActorId.PRODUCER_MANAGER, ActorId.LOGISTICS_COORDINATOR],
    staffProfileIds: [
      StaffProfileId.PRODUCER_MANAGER,
      StaffProfileId.LOGISTICS_COORDINATOR,
    ],
    requiredActions: [
      {
        actionId: "ACTION_CHOOSE_TRANSFER_SCOPE",
        descriptionKey: "check.custodyScope.question",
        knowledgeCheckId: custodyTransferScopeCheck.knowledgeCheckId,
      },
      {
        actionId: "ACTION_RECORD_TRANSPORT",
        descriptionKey: "check.transportCondition.question",
        transactionType: TransactionType.RECORD_TRANSPORT_CONDITION,
      },
    ],
    completionConditions: [
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.TRANSFER_CUSTODY },
      {
        conditionType: "TRANSACTION_COMMITTED",
        transactionType: TransactionType.RECORD_TRANSPORT_CONDITION,
      },
      {
        conditionType: "KNOWLEDGE_CHECK_ANSWERED",
        knowledgeCheckId: custodyTransferScopeCheck.knowledgeCheckId,
      },
    ],
    availableHints: [
      {
        hintId: "HINT_CUSTODY_VERSUS_OWNERSHIP",
        textKey: "hint.custodyVersusOwnership",
        // "Who may sell it, and who is holding it" is the custody/ownership
        // distinction. The humidity threshold is a separate judgement.
        targetScorableItemIds: ["INT_CUSTODY_TRANSFER_SCOPE"],
      },
    ],
    knowledgeChecks: [custodyTransferScopeCheck, transportConditionCheck],
    scoredActions: [],
    unlocksStageId: ScenarioStageId.RECEIVE_AND_CORRECT,
    isImplemented: true,
  },

  {
    stageId: ScenarioStageId.RECEIVE_AND_CORRECT,
    titleKey: "stage.receiveAndCorrect.title",
    instructionKey: "stage.receiveAndCorrect.instruction",
    activeActorIds: [ActorId.PROCESSING_MANAGER],
    staffProfileIds: [
      StaffProfileId.PROCESSING_MANAGER,
      StaffProfileId.SHIPPING_CLERK,
    ],
    requiredActions: [
      {
        actionId: "ACTION_RECEIVE",
        descriptionKey: "stage.receiveAndCorrect.action.receive",
        transactionType: TransactionType.RECEIVE_BATCH,
      },
      {
        actionId: "ACTION_CORRECT",
        descriptionKey: "stage.receiveAndCorrect.action.correct",
        transactionType: TransactionType.RECORD_CORRECTION,
        transactionEvidence: {
          kind: "CORRECTION_RECORDED",
          target: {
            kind: "DOCUMENT_METADATA_FIELD",
            documentAnchorId: SHIPPING_MANIFEST_ANCHOR_ID,
            field: "declaredQuantity",
          },
          correctedValue: {
            kind: "QUANTITY",
            amount: WEIGHED_QUANTITY_KG,
            unit: QuantityUnit.KG,
          },
        },
      },
    ],
    // The correction is mandatory, not optional: the erroneous dispatch
    // manifest is already committed when the learner arrives, so every learner
    // meets the mechanic rather than only those who fail to spot a typo.
    completionConditions: [
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.RECEIVE_BATCH },
      {
        conditionType: "DECISION_RECORDED",
        decisionId: "INT_DISCREPANCY_INITIAL_SUBMITTED",
      },
      {
        conditionType: "DECISION_RECORDED",
        decisionId: "INT_DISCREPANCY_MITIGATION_COMPLETE",
      },
      {
        conditionType: "TRANSACTION_COMMITTED",
        transactionType: TransactionType.RECORD_CORRECTION,
        evidence: {
          kind: "CORRECTION_RECORDED",
          target: {
            kind: "DOCUMENT_METADATA_FIELD",
            documentAnchorId: SHIPPING_MANIFEST_ANCHOR_ID,
            field: "declaredQuantity",
          },
          correctedValue: {
            kind: "QUANTITY",
            amount: WEIGHED_QUANTITY_KG,
            unit: QuantityUnit.KG,
          },
        },
      },
      // Booking goods in moves custody; buying them moves title. The processor
      // must acquire ownership here, or it cannot later sell what it produced.
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.TRANSFER_OWNERSHIP },
    ],
    availableHints: [
      {
        hintId: "HINT_CORRECTION_MECHANISM",
        textKey: "hint.correctionMechanism",
        // Points at appending a linked record. Booking the batch in is an
        // ordinary receipt and is not made easier by knowing that.
        targetScorableItemIds: ["INT_CORRECTION_RECORDED"],
      },
    ],
    knowledgeChecks: [],
    scoredActions: [
      {
        decisionId: "INT_RECEIVE_BATCH",
        descriptionKey: "stage.receiveAndCorrect.instruction",
        transactionType: TransactionType.RECEIVE_BATCH,
        scoreComponent: ScoreComponent.TRANSACTION_ACCURACY,
        points: 3,
      },
      {
        decisionId: "INT_CORRECTION_RECORDED",
        nameKey: "activity.recordCorrection",
        descriptionKey: "message.correction",
        transactionType: TransactionType.RECORD_CORRECTION,
        scoreComponent: ScoreComponent.COMPLIANCE_AND_CORRECTION,
        points: 10,
        evidence: {
          kind: "EFFECTIVE_VALUE",
          target: {
            kind: "DOCUMENT_METADATA_FIELD",
            documentAnchorId: SHIPPING_MANIFEST_ANCHOR_ID,
            field: "declaredQuantity",
          },
          expectedValue: {
            kind: "QUANTITY",
            amount: WEIGHED_QUANTITY_KG,
            unit: QuantityUnit.KG,
          },
        },
      },
    ],
    unlocksStageId: ScenarioStageId.TRANSFORM_BATCH,
    isImplemented: true,
  },

  {
    stageId: ScenarioStageId.TRANSFORM_BATCH,
    titleKey: "stage.transformBatch.title",
    instructionKey: "stage.transformBatch.instruction",
    activeActorIds: [ActorId.PROCESSING_MANAGER],
    requiredActions: [
      {
        actionId: "ACTION_TRANSFORM",
        descriptionKey: "stage.transformBatch.action.transform",
        transactionType: TransactionType.TRANSFORM_BATCH,
      },
    ],
    completionConditions: [
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.TRANSFORM_BATCH },
      { conditionType: "ASSET_EXISTS", assetId: ROASTED_COFFEE_BATCH_ID },
      {
        conditionType: "KNOWLEDGE_CHECK_ANSWERED",
        knowledgeCheckId: transformationProvenanceCheck.knowledgeCheckId,
      },
    ],
    availableHints: [
      {
        hintId: "HINT_TRANSFORMATION_YIELD",
        textKey: "hint.transformationYield",
        // Output mass is below input mass -- the quantity the transformation
        // transaction carries. Whether the roasted batch is a new asset with a
        // provenance edge is a different question, and unaided by this.
        targetScorableItemIds: ["INT_TRANSFORM_BATCH"],
      },
    ],
    knowledgeChecks: [transformationProvenanceCheck],
    scoredActions: [
      {
        decisionId: "INT_TRANSFORM_BATCH",
        nameKey: "activity.transformBatch",
        descriptionKey: "stage.transformBatch.instruction",
        transactionType: TransactionType.TRANSFORM_BATCH,
        scoreComponent: ScoreComponent.TRANSACTION_ACCURACY,
        points: 4,
      },
    ],
    producesAssetIds: [ROASTED_COFFEE_BATCH_ID],
    unlocksStageId: ScenarioStageId.PACKAGE_AND_DISTRIBUTE,
    isImplemented: true,
  },

  {
    stageId: ScenarioStageId.PACKAGE_AND_DISTRIBUTE,
    titleKey: "stage.packageAndDistribute.title",
    instructionKey: "stage.packageAndDistribute.instruction",
    activeActorIds: [ActorId.PROCESSING_MANAGER, ActorId.DISTRIBUTION_MANAGER],
    requiredActions: [
      {
        actionId: "ACTION_PACKAGE",
        descriptionKey: "stage.packageAndDistribute.action.package",
        transactionType: TransactionType.PACKAGE_BATCH,
      },
      {
        actionId: "ACTION_DISPATCH",
        descriptionKey: "stage.packageAndDistribute.action.dispatch",
        transactionType: TransactionType.DISPATCH_BATCH,
      },
    ],
    completionConditions: [
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.PACKAGE_BATCH },
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.DISPATCH_BATCH },
      { conditionType: "ASSET_EXISTS", assetId: PACKAGED_COFFEE_LOT_ID },
    ],
    availableHints: [],
    knowledgeChecks: [],
    scoredActions: [
      {
        decisionId: "INT_PACKAGE_BATCH",
        descriptionKey: "stage.packageAndDistribute.instruction",
        transactionType: TransactionType.PACKAGE_BATCH,
        scoreComponent: ScoreComponent.TRANSACTION_ACCURACY,
        points: 3,
      },
      {
        // The mirror of stage 4: ownership moves while the goods stay put.
        decisionId: "INT_OWNERSHIP_TRANSFER_SCOPE",
        descriptionKey: "stage.packageAndDistribute.instruction",
        transactionType: TransactionType.TRANSFER_OWNERSHIP,
        scoreComponent: ScoreComponent.TRANSACTION_ACCURACY,
        points: 5,
      },
      {
        decisionId: "INT_DISPATCH_BATCH",
        descriptionKey: "stage.packageAndDistribute.instruction",
        transactionType: TransactionType.DISPATCH_BATCH,
        scoreComponent: ScoreComponent.TRACEABILITY_COMPLETENESS,
        points: 5,
      },
    ],
    producesAssetIds: [PACKAGED_COFFEE_LOT_ID],
    unlocksStageId: ScenarioStageId.VERIFY_AND_TAMPER,
    isImplemented: true,
  },

  {
    stageId: ScenarioStageId.VERIFY_AND_TAMPER,
    titleKey: "stage.verifyAndTamper.title",
    instructionKey: "stage.verifyAndTamper.instruction",
    // A public QR view, inspected by the retail manager. There is no consumer
    // role, and inventing one would misrepresent who can write to the ledger.
    activeActorIds: [ActorId.RETAIL_MANAGER],
    requiredActions: [
      {
        actionId: "ACTION_TAMPER_DEMO",
        descriptionKey: "check.tamperIntegrity.question",
        knowledgeCheckId: tamperIntegrityCheck.knowledgeCheckId,
      },
      {
        actionId: "ACTION_CLASSIFY_DATA",
        descriptionKey: "check.dataGovernance.question",
        knowledgeCheckId: dataGovernanceCheck.knowledgeCheckId,
      },
    ],
    completionConditions: [
      {
        conditionType: "KNOWLEDGE_CHECK_ANSWERED",
        knowledgeCheckId: tamperIntegrityCheck.knowledgeCheckId,
      },
      {
        conditionType: "KNOWLEDGE_CHECK_ANSWERED",
        knowledgeCheckId: dataGovernanceCheck.knowledgeCheckId,
      },
    ],
    availableHints: [],
    knowledgeChecks: [tamperIntegrityCheck, dataGovernanceCheck],
    scoredActions: [],
    unlocksStageId: ScenarioStageId.RECALL_AND_DEBRIEF,
    isImplemented: true,
  },

  {
    stageId: ScenarioStageId.RECALL_AND_DEBRIEF,
    titleKey: "stage.recallAndDebrief.title",
    instructionKey: "stage.recallAndDebrief.instruction",
    activeActorIds: [ActorId.RETAIL_MANAGER, ActorId.REGULATORY_AUDITOR],
    staffProfileIds: [
      StaffProfileId.RETAIL_MANAGER,
      StaffProfileId.REGULATORY_AUDITOR,
    ],
    requiredActions: [
      {
        actionId: "ACTION_DETERMINE_SCOPE",
        descriptionKey: "check.recallScope.question",
        knowledgeCheckId: recallScopeCheck.knowledgeCheckId,
      },
      {
        actionId: "ACTION_RECALL",
        descriptionKey: "stage.recallAndDebrief.action.recall",
        transactionType: TransactionType.RECALL_BATCH,
      },
      {
        actionId: "ACTION_DEBRIEF",
        descriptionKey: "check.blockchainNecessity.question",
        knowledgeCheckId: blockchainNecessityCheck.knowledgeCheckId,
      },
    ],
    completionConditions: [
      { conditionType: "TRANSACTION_COMMITTED", transactionType: TransactionType.RECALL_BATCH },
      {
        conditionType: "DECISION_RECORDED",
        decisionId: "INT_RECALL_INITIAL_SUBMITTED",
      },
      {
        conditionType: "DECISION_RECORDED",
        decisionId: "INT_RECALL_AUTHORIZATION_RESOLVED",
      },
      {
        conditionType: "KNOWLEDGE_CHECK_ANSWERED",
        knowledgeCheckId: recallScopeCheck.knowledgeCheckId,
      },
      // The debrief is the last thing standing between the learner and
      // completion, per specification section 19.6.
      {
        conditionType: "KNOWLEDGE_CHECK_ANSWERED",
        knowledgeCheckId: blockchainNecessityCheck.knowledgeCheckId,
      },
    ],
    availableHints: [
      {
        hintId: "HINT_RECALL_PROVENANCE",
        textKey: "hint.recallProvenance",
        /*
         * The scope question alone. Filing the recall is scored on whether the
         * transaction was accepted -- a regulator authorisation matter that
         * holds whichever lots were chosen -- and the blockchain-versus-database
         * question is an independent evaluative judgement this text does not
         * touch. Capping all three because they share a stage was the old
         * behaviour and cost 7.5 points for help with one 15-point item.
         */
        targetScorableItemIds: ["INT_RECALL_SCOPE"],
      },
    ],
    knowledgeChecks: [recallScopeCheck, blockchainNecessityCheck],
    scoredActions: [
      {
        decisionId: "INT_RECALL_COMMITTED",
        descriptionKey: "stage.recallAndDebrief.instruction",
        transactionType: TransactionType.RECALL_BATCH,
        scoreComponent: ScoreComponent.RECALL_PERFORMANCE,
        points: 5,
      },
    ],
    isImplemented: true,
  },
];
