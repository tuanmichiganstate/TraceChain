import { ScenarioStageId } from "../../domain/types/enums";
import type { ScenarioRuntimeDefinition } from "../../domain/types/scenario";
import {
  anchorCertificateCommand,
  createBatchCommand,
  dispatchToRetailerCommand,
  issueCertificateCommand,
  packageBatchCommand,
  purchaseOnReceiptCommand,
  recallBatchCommand,
  receiveBatchCommand,
  recordCorrectionCommand,
  recordTransportConditionCommand,
  transferCustodyCommand,
  transferOwnershipToDistributorCommand,
  transformBatchCommand,
} from "./commands";
import {
  GREEN_COFFEE_BATCH_ID,
  PACKAGED_COFFEE_LOT_ID,
  ROASTED_COFFEE_BATCH_ID,
} from "./stages";
import { ActorId, OrganizationId } from "./organizations";
import {
  QUALITY_CERTIFICATE_ANCHOR_ID,
  SHIPPING_MANIFEST_ANCHOR_ID,
} from "./commands";
import { DEFAULT_CORRECTION_REASON } from "./facts";

const context = (
  contextId: string,
  actorId: string,
  organizationId: string,
  roleId: string,
) => ({ contextId, actorId, organizationId, roleId });

export const coffeeRuntime: ScenarioRuntimeDefinition = {
  assetRoles: {
    sourceBatchId: GREEN_COFFEE_BATCH_ID,
    transformedBatchId: ROASTED_COFFEE_BATCH_ID,
    primaryPackagedLotId: PACKAGED_COFFEE_LOT_ID,
    recallSourceAssetId: GREEN_COFFEE_BATCH_ID,
  },
  documentRoles: {
    qualityCertificateAnchorId: QUALITY_CERTIFICATE_ANCHOR_ID,
    shippingManifestAnchorId: SHIPPING_MANIFEST_ANCHOR_ID,
  },
  trustedContexts: [
    context("CTX_PRODUCER", ActorId.PRODUCER_MANAGER, OrganizationId.PRODUCER_COOP, "PRODUCER_MANAGER"),
    context(
      "CTX_CERTIFIER",
      ActorId.CERTIFICATION_OFFICER,
      OrganizationId.CERTIFICATION_BODY,
      "CERTIFICATION_OFFICER",
    ),
    context(
      "CTX_LOGISTICS",
      ActorId.LOGISTICS_COORDINATOR,
      OrganizationId.LOGISTICS_PROVIDER,
      "LOGISTICS_COORDINATOR",
    ),
    context(
      "CTX_PROCESSOR",
      ActorId.PROCESSING_MANAGER,
      OrganizationId.COFFEE_PROCESSOR,
      "PROCESSING_MANAGER",
    ),
    context(
      "CTX_DISTRIBUTOR",
      ActorId.DISTRIBUTION_MANAGER,
      OrganizationId.DISTRIBUTOR,
      "DISTRIBUTION_MANAGER",
    ),
    context(
      "CTX_RETAILER",
      ActorId.RETAIL_MANAGER,
      OrganizationId.RETAILER,
      "RETAIL_MANAGER",
    ),
    context(
      "CTX_REGULATOR",
      ActorId.REGULATORY_AUDITOR,
      OrganizationId.REGULATOR,
      "REGULATORY_AUDITOR",
    ),
    // Append-only because SL1 persists trusted contexts by positional index.
    context(
      "CTX_UNRECOGNIZED_CERTIFIER",
      ActorId.UNRECOGNIZED_CERTIFICATION_OFFICER,
      OrganizationId.UNRECOGNIZED_CERTIFIER,
      "CERTIFICATION_OFFICER",
    ),
  ],
  initialContextByStage: {
    [ScenarioStageId.ORIENTATION]: "CTX_PRODUCER",
    [ScenarioStageId.CREATE_BATCH]: "CTX_PRODUCER",
    [ScenarioStageId.ANCHOR_CERTIFICATE]: "CTX_CERTIFIER",
    [ScenarioStageId.SHIP_AND_MONITOR]: "CTX_PRODUCER",
    [ScenarioStageId.RECEIVE_AND_CORRECT]: "CTX_PROCESSOR",
    [ScenarioStageId.TRANSFORM_BATCH]: "CTX_PROCESSOR",
    [ScenarioStageId.PACKAGE_AND_DISTRIBUTE]: "CTX_PROCESSOR",
    [ScenarioStageId.VERIFY_AND_TAMPER]: "CTX_RETAILER",
    // The product holder discovers the problem. Recall authority must be
    // handed to the regulator rather than appearing by magic.
    [ScenarioStageId.RECALL_AND_DEBRIEF]: "CTX_RETAILER",
  },
  roleHandoffs: [
    {
      handoffId: "HANDOFF_PRODUCER_TO_LOGISTICS_CUSTODY",
      stageId: ScenarioStageId.SHIP_AND_MONITOR,
      fromContextId: "CTX_PRODUCER",
      toContextId: "CTX_LOGISTICS",
      labelKey: "endorsement.handoff.custodyReceiver",
    },
    {
      handoffId: "HANDOFF_PROCESSOR_TO_PRODUCER_CORRECTION",
      stageId: ScenarioStageId.RECEIVE_AND_CORRECT,
      fromContextId: "CTX_PROCESSOR",
      toContextId: "CTX_PRODUCER",
      labelKey: "endorsement.handoff.correctionProducer",
    },
    {
      handoffId: "HANDOFF_RETAILER_TO_REGULATOR",
      stageId: ScenarioStageId.RECALL_AND_DEBRIEF,
      fromContextId: "CTX_RETAILER",
      toContextId: "CTX_REGULATOR",
      labelKey: "stage.recallAndDebrief.handoffRegulator",
    },
  ],
  commandContextByAction: {
    CREATE_BATCH: "CTX_PRODUCER",
    ANCHOR_CERTIFICATE: "CTX_CERTIFIER",
    ISSUE_CERTIFICATE: "CTX_CERTIFIER",
    // This authored context creates a genuine, recognized transporter
    // signature that is cryptographically valid but unauthorized for issuing
    // a quality certificate.
    SUSPICIOUS_CERTIFICATE: "CTX_LOGISTICS",
    TRANSFER_CUSTODY: "CTX_PRODUCER",
    RECORD_TRANSPORT: "CTX_LOGISTICS",
    RECEIVE_BATCH: "CTX_PROCESSOR",
    PURCHASE_ON_RECEIPT: "CTX_PRODUCER",
    RECORD_CORRECTION: "CTX_PROCESSOR",
    TRANSFORM_BATCH: "CTX_PROCESSOR",
    PACKAGE_BATCH: "CTX_PROCESSOR",
    TRANSFER_OWNERSHIP: "CTX_PROCESSOR",
    DISPATCH_BATCH: "CTX_DISTRIBUTOR",
    RECALL_BATCH: "CTX_REGULATOR",
  },
  learnerCommandTemplates: {
    CREATE_BATCH: createBatchCommand(),
    ANCHOR_CERTIFICATE: anchorCertificateCommand(),
    ISSUE_CERTIFICATE: issueCertificateCommand(),
    SUSPICIOUS_CERTIFICATE: issueCertificateCommand(),
    TRANSFER_CUSTODY: transferCustodyCommand(false),
    RECORD_TRANSPORT: recordTransportConditionCommand(),
    RECEIVE_BATCH: receiveBatchCommand(),
    PURCHASE_ON_RECEIPT: purchaseOnReceiptCommand(),
    RECORD_CORRECTION: recordCorrectionCommand("TX_PENDING", DEFAULT_CORRECTION_REASON),
    TRANSFORM_BATCH: transformBatchCommand(),
    PACKAGE_BATCH: packageBatchCommand(),
    TRANSFER_OWNERSHIP: transferOwnershipToDistributorCommand(),
    DISPATCH_BATCH: dispatchToRetailerCommand(),
    RECALL_BATCH: recallBatchCommand([]),
  },
  consequentialCases: {
    certificate: {
      certificateAssessment: "VALID",
      issuerAssessment: "RECOGNIZED_AUTHORIZED",
      requiredStorageChoice: "HASH_OFF_CHAIN",
      contentEvidenceKey:
        "stage.anchorCertificate.contentEvidence.standard",
    },
    discrepancy: {
      reasonSuggestionKey: "stage.receiveAndCorrect.reasonSuggestion",
      causeEvidenceKey:
        "stage.receiveAndCorrect.causeEvidence.standard",
      authoredCauseCode: "TYPING_ERROR",
    },
  },
  journalLimits: {
    maximumStage3Mitigations: 3,
    maximumStage5Mitigations: 1,
    maximumStage9Handoffs: 2,
    maximumStage9Resubmissions: 1,
    maximumEndorsementHandoffs: 2,
    maximumEndorsementDeclines: 2,
    correctionReasonMaximumUtf8Bytes: 240,
  },
};
