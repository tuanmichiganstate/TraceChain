/**
 * Knowledge checks, one per required concept (specification section 20.1).
 *
 * Each is placed in the stage where the learner has just *done* the thing it
 * asks about, so the question tests understanding of an experience rather than
 * recall of an instruction panel. Every check carries a
 * `scenarioConnectionKey` tying the answer back to what just happened, which is
 * section 20.3's requirement and the difference between feedback and a mark.
 *
 * The nine concepts:
 *   1. Blockchain and truthfulness of input      stage 1 (diagnostic, unscored)
 *   2. On-chain versus off-chain storage         stage 3
 *   3. Authorized certificate issuer             stage 3
 *   4. Ownership versus custody                  stage 4
 *   5. Sensor thresholds and oracles             stage 4
 *   6. Transformation provenance                 stage 6
 *   7. Hash-chain integrity                      stage 8
 *   8. Data governance classification            stage 8
 *   9. Recall scope                              stage 9
 *  10. Blockchain versus a centralized database  stage 9
 */

import { ScoreComponent } from "../../domain/types/scoring";
import {
  KnowledgeCheckType,
  type KnowledgeCheckDefinition,
} from "../../domain/types/scenario";

/** Stage 1 -- diagnostic only. Section 8.1 requires this not be scored. */
export const orientationTruthCheck: KnowledgeCheckDefinition = {
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
  isScored: false,
};

/** Stage 3 -- where a large document actually belongs. */
export const certificateStorageCheck: KnowledgeCheckDefinition = {
  knowledgeCheckId: "INT_CERTIFICATE_STORAGE_CHOICE",
  nameKey: "activity.certificateStorage",
  checkType: KnowledgeCheckType.SINGLE_CHOICE,
  questionKey: "check.certificateStorage.question",
  options: [
    { optionId: "OPT_WHOLE_FILE_ON_CHAIN", labelKey: "check.certificateStorage.optionWholeFile" },
    { optionId: "OPT_OFF_CHAIN_WITH_HASH", labelKey: "check.certificateStorage.optionHash" },
    { optionId: "OPT_NO_EVIDENCE", labelKey: "check.certificateStorage.optionNone" },
    { optionId: "OPT_FILENAME_ONLY", labelKey: "check.certificateStorage.optionFilename" },
  ],
  correctOptionIds: ["OPT_OFF_CHAIN_WITH_HASH"],
  feedbackKey: "check.certificateStorage.feedback",
  scenarioConnectionKey: "check.certificateStorage.connection",
  glossaryTermKey: "terms.hash",
  scoreComponent: ScoreComponent.DATA_GOVERNANCE,
  points: 5,
  isScored: true,
};

/** Stage 3 -- a valid hash from an issuer with no standing. */
export const certificateIssuerCheck: KnowledgeCheckDefinition = {
  knowledgeCheckId: "INT_CERTIFICATE_ISSUER_CHECK",
  checkType: KnowledgeCheckType.SINGLE_CHOICE,
  questionKey: "check.certificateIssuer.question",
  options: [
    {
      optionId: "OPT_ISSUER_RECOGNIZED_AUTHORIZED",
      labelKey: "check.certificateIssuer.optionRecognizedAuthorized",
    },
    {
      optionId: "OPT_ISSUER_RECOGNIZED_UNAUTHORIZED",
      labelKey: "check.certificateIssuer.optionRecognizedUnauthorized",
    },
    {
      optionId: "OPT_ISSUER_UNRECOGNIZED",
      labelKey: "check.certificateIssuer.optionUnrecognized",
    },
  ],
  correctOptionIds: ["OPT_ISSUER_RECOGNIZED_AUTHORIZED"],
  feedbackKey: "check.certificateIssuer.feedback",
  scenarioConnectionKey: "check.certificateIssuer.connection",
  scoreComponent: ScoreComponent.DATA_GOVERNANCE,
  points: 5,
  isScored: true,
};

/**
 * Stage 4 -- the central distinction, asked at the moment it bites.
 *
 * The learner's answer drives the actual transaction, so choosing "both" is not
 * a wrong tick on a quiz: it produces a transaction the rule engine rejects,
 * with a teaching message. The mark and the mechanic agree.
 */
export const custodyTransferScopeCheck: KnowledgeCheckDefinition = {
  knowledgeCheckId: "INT_CUSTODY_TRANSFER_SCOPE",
  nameKey: "activity.custodyScope",
  checkType: KnowledgeCheckType.SINGLE_CHOICE,
  questionKey: "check.custodyScope.question",
  options: [
    { optionId: "OPT_OWNERSHIP_ONLY", labelKey: "check.custodyScope.optionOwnershipOnly" },
    { optionId: "OPT_CUSTODY_ONLY", labelKey: "check.custodyScope.optionCustodyOnly" },
    { optionId: "OPT_BOTH", labelKey: "check.custodyScope.optionBoth" },
    { optionId: "OPT_NEITHER", labelKey: "check.custodyScope.optionNeither" },
  ],
  correctOptionIds: ["OPT_CUSTODY_ONLY"],
  feedbackKey: "check.custodyScope.feedback",
  scenarioConnectionKey: "check.custodyScope.connection",
  glossaryTermKey: "terms.custody",
  scoreComponent: ScoreComponent.TRANSACTION_ACCURACY,
  points: 6,
  isScored: true,
};

/** Stage 4 -- what a threshold breach means, and who says so. */
export const transportConditionCheck: KnowledgeCheckDefinition = {
  knowledgeCheckId: "INT_TRANSPORT_CONDITION",
  checkType: KnowledgeCheckType.SINGLE_CHOICE,
  questionKey: "check.transportCondition.question",
  options: [
    { optionId: "OPT_IGNORE_READING", labelKey: "check.transportCondition.optionIgnore" },
    { optionId: "OPT_MARK_NON_COMPLIANT", labelKey: "check.transportCondition.optionCondemn" },
    { optionId: "OPT_FLAG_FOR_INSPECTION", labelKey: "check.transportCondition.optionInspect" },
    { optionId: "OPT_STORE_WHOLE_DATASET", labelKey: "check.transportCondition.optionWholeFile" },
  ],
  correctOptionIds: ["OPT_FLAG_FOR_INSPECTION"],
  feedbackKey: "check.transportCondition.feedback",
  scenarioConnectionKey: "check.transportCondition.connection",
  glossaryTermKey: "terms.oracle",
  scoreComponent: ScoreComponent.COMPLIANCE_AND_CORRECTION,
  points: 5,
  isScored: true,
};

/** Stage 6 -- why the output remembers where it came from. */
export const transformationProvenanceCheck: KnowledgeCheckDefinition = {
  knowledgeCheckId: "INT_TRANSFORMATION_PROVENANCE",
  checkType: KnowledgeCheckType.SINGLE_CHOICE,
  questionKey: "check.transformationProvenance.question",
  options: [
    { optionId: "OPT_NEW_INDEPENDENT_BATCH", labelKey: "check.transformationProvenance.optionIndependent" },
    { optionId: "OPT_LINKED_TO_INPUT", labelKey: "check.transformationProvenance.optionLinked" },
    { optionId: "OPT_INPUT_DELETED", labelKey: "check.transformationProvenance.optionDeleted" },
  ],
  correctOptionIds: ["OPT_LINKED_TO_INPUT"],
  feedbackKey: "check.transformationProvenance.feedback",
  scenarioConnectionKey: "check.transformationProvenance.connection",
  glossaryTermKey: "terms.provenance",
  scoreComponent: ScoreComponent.TRACEABILITY_COMPLETENESS,
  points: 8,
  isScored: true,
};

/** Stage 8 -- what the broken chain actually proved. */
export const tamperIntegrityCheck: KnowledgeCheckDefinition = {
  knowledgeCheckId: "INT_TAMPER_DEMONSTRATION",
  checkType: KnowledgeCheckType.SINGLE_CHOICE,
  questionKey: "check.tamperIntegrity.question",
  options: [
    { optionId: "OPT_PREVENTS_EDITING", labelKey: "check.tamperIntegrity.optionPrevents" },
    { optionId: "OPT_MAKES_EDIT_DETECTABLE", labelKey: "check.tamperIntegrity.optionDetectable" },
    { optionId: "OPT_ONLY_LAST_BLOCK", labelKey: "check.tamperIntegrity.optionLastBlock" },
  ],
  correctOptionIds: ["OPT_MAKES_EDIT_DETECTABLE"],
  feedbackKey: "check.tamperIntegrity.feedback",
  scenarioConnectionKey: "check.tamperIntegrity.connection",
  glossaryTermKey: "terms.hash",
  scoreComponent: ScoreComponent.TRACEABILITY_COMPLETENESS,
  points: 7,
  isScored: true,
};

/**
 * Stage 8 -- the data governance classification (specification section 25).
 *
 * Trimmed from eleven items to six, keeping all four categories and two items
 * in the subtlest one. Every item is something the learner has actually
 * handled, so the exercise is a reflection rather than a new topic.
 *
 * The encoded answer packs six base-4 digits (one category per item) into a
 * single integer, which is why it fits the compact state codec.
 */
export const dataGovernanceCheck: KnowledgeCheckDefinition = {
  knowledgeCheckId: "INT_DATA_GOVERNANCE_CLASSIFICATION",
  checkType: KnowledgeCheckType.CLASSIFICATION,
  questionKey: "check.dataGovernance.question",
  categories: [
    { categoryId: "CAT_ON_CHAIN", labelKey: "check.dataGovernance.categoryOnChain" },
    { categoryId: "CAT_OFF_CHAIN_HASH", labelKey: "check.dataGovernance.categoryOffChainHash" },
    { categoryId: "CAT_AUTHORIZED_ONLY", labelKey: "check.dataGovernance.categoryAuthorizedOnly" },
    { categoryId: "CAT_DO_NOT_COLLECT", labelKey: "check.dataGovernance.categoryDoNotCollect" },
  ],
  options: [
    { optionId: "ITEM_BATCH_ID", labelKey: "check.dataGovernance.itemBatchId", categoryId: "CAT_ON_CHAIN" },
    { optionId: "ITEM_RECALL_STATUS", labelKey: "check.dataGovernance.itemRecallStatus", categoryId: "CAT_ON_CHAIN" },
    { optionId: "ITEM_CERTIFICATE_PDF", labelKey: "check.dataGovernance.itemCertificatePdf", categoryId: "CAT_OFF_CHAIN_HASH" },
    { optionId: "ITEM_SENSOR_DATASET", labelKey: "check.dataGovernance.itemSensorDataset", categoryId: "CAT_OFF_CHAIN_HASH" },
    { optionId: "ITEM_WHOLESALE_PRICE", labelKey: "check.dataGovernance.itemWholesalePrice", categoryId: "CAT_AUTHORIZED_ONLY" },
    { optionId: "ITEM_CUSTOMER_ADDRESS", labelKey: "check.dataGovernance.itemCustomerAddress", categoryId: "CAT_DO_NOT_COLLECT" },
  ],
  // Every item correctly placed; the option's own categoryId is the answer key.
  correctOptionIds: [
    "ITEM_BATCH_ID",
    "ITEM_RECALL_STATUS",
    "ITEM_CERTIFICATE_PDF",
    "ITEM_SENSOR_DATASET",
    "ITEM_WHOLESALE_PRICE",
    "ITEM_CUSTOMER_ADDRESS",
  ],
  feedbackKey: "check.dataGovernance.feedback",
  scenarioConnectionKey: "message.sharedLedger",
  scoreComponent: ScoreComponent.DATA_GOVERNANCE,
  points: 5,
  isScored: true,
};

/**
 * Stage 9 -- which lots the recall covers.
 *
 * A multiple choice over the four packaged lots on the shelf. The near-miss
 * distractor is deliberately indistinguishable by name, region, plant and
 * roasting date; only the provenance graph separates it.
 */
export const recallScopeCheck: KnowledgeCheckDefinition = {
  knowledgeCheckId: "INT_RECALL_SCOPE",
  nameKey: "activity.recallScope",
  checkType: KnowledgeCheckType.MULTIPLE_CHOICE,
  questionKey: "check.recallScope.question",
  options: [
    { optionId: "BAT_PACKAGED_COFFEE_001", labelKey: "check.recallScope.optionAffectedLot" },
    { optionId: "BAT_PACKAGED_COFFEE_002", labelKey: "check.recallScope.optionNearMissLot" },
    { optionId: "BAT_PACKAGED_COFFEE_003", labelKey: "check.recallScope.optionUnrelatedLot" },
    { optionId: "BAT_ROASTED_COFFEE_001", labelKey: "check.recallScope.optionRoastedBatch" },
  ],
  correctOptionIds: ["BAT_PACKAGED_COFFEE_001", "BAT_ROASTED_COFFEE_001"],
  feedbackKey: "check.recallScope.feedback",
  scenarioConnectionKey: "check.recallScope.connection",
  glossaryTermKey: "terms.provenance",
  scoreComponent: ScoreComponent.RECALL_PERFORMANCE,
  points: 15,
  isScored: true,
};

/** Stage 9 -- the debrief question: when is any of this warranted? */
export const blockchainNecessityCheck: KnowledgeCheckDefinition = {
  knowledgeCheckId: "INT_BLOCKCHAIN_NECESSITY",
  checkType: KnowledgeCheckType.SINGLE_CHOICE,
  questionKey: "check.blockchainNecessity.question",
  options: [
    { optionId: "OPT_ALWAYS_BETTER", labelKey: "check.blockchainNecessity.optionAlwaysBetter" },
    { optionId: "OPT_INDEPENDENT_ORGANIZATIONS", labelKey: "check.blockchainNecessity.optionIndependent" },
    { optionId: "OPT_FASTER_THAN_DATABASE", labelKey: "check.blockchainNecessity.optionFaster" },
    { optionId: "OPT_GUARANTEES_TRUTH", labelKey: "check.blockchainNecessity.optionGuarantees" },
  ],
  correctOptionIds: ["OPT_INDEPENDENT_ORGANIZATIONS"],
  feedbackKey: "check.blockchainNecessity.feedback",
  scenarioConnectionKey: "message.blockchainNecessity",
  scoreComponent: ScoreComponent.CONCEPTUAL_UNDERSTANDING,
  points: 5,
  isScored: true,
};
