/**
 * The transactions this scenario's stages submit.
 *
 * Kept here rather than inside stage components so that the scenario's facts --
 * quantities, identifiers, dates, who acts -- live with the rest of the
 * scenario data. A stage component decides *when* to submit; this decides
 * *what*.
 */

import {
  AssetType,
  DocumentType,
  QuantityUnit,
  TransactionType,
} from "../../domain/types/enums";
import type {
  AnchorDocumentCommand,
  CreateBatchCommand,
  DispatchBatchCommand,
  IssueCertificateCommand,
  PackageBatchCommand,
  RecallBatchCommand,
  RecordCorrectionCommand,
  RecordTransportConditionCommand,
  ReceiveBatchCommand,
  TransferCustodyCommand,
  TransferOwnershipCommand,
} from "../../domain/commands/commands";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import { ActorId, LocationId, OrganizationId } from "./organizations";
import {
  GREEN_COFFEE_BATCH_ID,
  PACKAGED_COFFEE_LOT_ID,
  ROASTED_COFFEE_BATCH_ID,
} from "./stages";
import { SCENARIO_TIMELINE } from "./timeline";

export const QUALITY_CERTIFICATE_ANCHOR_ID = "DOC_QUALITY_CERTIFICATE_001";
export const QUALITY_CERTIFICATE_ID = "CERT_QUALITY_001";
export const SENSOR_ID = "SENSOR_HUMIDITY_001";

/**
 * The certificate's digest, computed from bundled content.
 *
 * No file is ever uploaded (specification section 27 forbids arbitrary file
 * upload). What matters pedagogically is that a digest exists, is stable, and
 * would change if the content did.
 */
export const QUALITY_CERTIFICATE_CONTENT =
  "Giay chung nhan chat luong - Lo ca phe nhan Arabica Lam Dong - BAT_GREEN_COFFEE_001";

export const createBatchCommand = (): CreateBatchCommand => ({
  commandType: TransactionType.CREATE_BATCH,
  assetId: GREEN_COFFEE_BATCH_ID,
  assetType: AssetType.GREEN_COFFEE_BATCH,
  productName: "Arabica green coffee",
  originLocation: "Lam Dong",
  productionDate: SCENARIO_TIMELINE.batchCreated,
  quantity: 100,
  quantityUnit: QuantityUnit.KG,
  packageSizeGrams: null,
  producerOrganizationId: OrganizationId.PRODUCER_COOP,
  locationId: LocationId.PRODUCER_FARM,
  initiatedByActorId: ActorId.PRODUCER_MANAGER,
  scenarioTimestamp: SCENARIO_TIMELINE.batchCreated,
});

export const anchorCertificateCommand = (
  issuerOrganizationId: string = OrganizationId.CERTIFICATION_BODY,
): AnchorDocumentCommand => ({
  commandType: TransactionType.ANCHOR_DOCUMENT,
  assetId: GREEN_COFFEE_BATCH_ID,
  documentAnchorId: QUALITY_CERTIFICATE_ANCHOR_ID,
  documentType: DocumentType.QUALITY_CERTIFICATE,
  fileName: "giay-chung-nhan-chat-luong-001.pdf",
  contentHash: sha256Hex(QUALITY_CERTIFICATE_CONTENT),
  metadata: { kind: DocumentType.QUALITY_CERTIFICATE },
  issuerOrganizationId,
  issuedAt: SCENARIO_TIMELINE.certificateIssued,
  expiresAt: SCENARIO_TIMELINE.certificateExpires,
  initiatedByActorId: ActorId.CERTIFICATION_OFFICER,
  scenarioTimestamp: SCENARIO_TIMELINE.certificateIssued,
});

export const issueCertificateCommand = (): IssueCertificateCommand => ({
  commandType: TransactionType.ISSUE_CERTIFICATE,
  assetId: GREEN_COFFEE_BATCH_ID,
  certificateId: QUALITY_CERTIFICATE_ID,
  documentAnchorId: QUALITY_CERTIFICATE_ANCHOR_ID,
  issuerOrganizationId: OrganizationId.CERTIFICATION_BODY,
  initiatedByActorId: ActorId.CERTIFICATION_OFFICER,
  scenarioTimestamp: SCENARIO_TIMELINE.certificateIssued,
});

/**
 * The learner's answer to "what does this transfer?" becomes the command.
 *
 * Choosing "both" produces a transaction the rule engine rejects with a
 * teaching message, so the quiz answer and the mechanic cannot disagree.
 */
export const transferCustodyCommand = (
  alsoTransfersOwnership: boolean,
): TransferCustodyCommand => ({
  commandType: TransactionType.TRANSFER_CUSTODY,
  assetId: GREEN_COFFEE_BATCH_ID,
  fromOrganizationId: OrganizationId.PRODUCER_COOP,
  toOrganizationId: OrganizationId.LOGISTICS_PROVIDER,
  toLocationId: LocationId.TRANSIT_STATION,
  alsoTransfersOwnership,
  initiatedByActorId: ActorId.PRODUCER_MANAGER,
  scenarioTimestamp: SCENARIO_TIMELINE.custodyTransferred,
});

export const recordTransportConditionCommand = (): RecordTransportConditionCommand => ({
  commandType: TransactionType.RECORD_TRANSPORT_CONDITION,
  assetId: GREEN_COFFEE_BATCH_ID,
  sensorId: SENSOR_ID,
  humidityPercent: 72,
  allowedMaximumHumidityPercent: 70,
  locationId: LocationId.TRANSIT_STATION,
  datasetAnchorId: null,
  initiatedByActorId: ActorId.LOGISTICS_COORDINATOR,
  scenarioTimestamp: SCENARIO_TIMELINE.sensorReading,
});

/**
 * The quantity the processor actually weighs.
 *
 * The dispatch manifest says 1000 kg; the scales say 100. The learner records
 * what they measured, and the discrepancy against the committed record is what
 * the correction then explains.
 */
export const MANIFEST_QUANTITY_KG = 1000;
export const WEIGHED_QUANTITY_KG = 100;
/** Interim (Step 2): a reweigh discrepancy the ASSET_FIELD correction fixes
 *  until Step 3 restores the manifest 1000 -> 100 correction on a document. */
export const REWEIGHED_QUANTITY_KG = 98;

export const receiveBatchCommand = (): ReceiveBatchCommand => ({
  commandType: TransactionType.RECEIVE_BATCH,
  assetId: GREEN_COFFEE_BATCH_ID,
  receivingOrganizationId: OrganizationId.COFFEE_PROCESSOR,
  locationId: LocationId.PROCESSING_PLANT,
  observedQuantity: WEIGHED_QUANTITY_KG,
  quantityUnit: QuantityUnit.KG,
  initiatedByActorId: ActorId.PROCESSING_MANAGER,
  scenarioTimestamp: SCENARIO_TIMELINE.batchReceived,
});

/** The processor buys the batch on delivery: title moves, separately. */
export const purchaseOnReceiptCommand = (): TransferOwnershipCommand => ({
  commandType: TransactionType.TRANSFER_OWNERSHIP,
  assetId: GREEN_COFFEE_BATCH_ID,
  fromOrganizationId: OrganizationId.PRODUCER_COOP,
  toOrganizationId: OrganizationId.COFFEE_PROCESSOR,
  alsoTransfersCustody: false,
  initiatedByActorId: ActorId.PRODUCER_MANAGER,
  scenarioTimestamp: SCENARIO_TIMELINE.batchReceived,
});

/**
 * Interim correction for Step 2, while the shipping manifest does not yet exist.
 *
 * A coherent ASSET_FIELD reweigh: the batch reads 100 kg, a re-weigh finds 98,
 * and the correction states the current value (100) and the corrected one (98).
 * Step 3 replaces this with a DOCUMENT_METADATA_FIELD correction of the
 * manifest's declared 1000 kg, which changes no asset state. Kept an ASSET_FIELD
 * correction here only so stage 5 stays playable before the manifest lands.
 */
export const recordCorrectionCommand = (
  correctionOfTransactionId: string,
  reason: string,
): RecordCorrectionCommand => ({
  commandType: TransactionType.RECORD_CORRECTION,
  assetId: GREEN_COFFEE_BATCH_ID,
  correctionOfTransactionId,
  target: { kind: "ASSET_FIELD", assetId: GREEN_COFFEE_BATCH_ID, field: "quantity" },
  incorrectValue: { kind: "QUANTITY", amount: WEIGHED_QUANTITY_KG, unit: QuantityUnit.KG },
  correctedValue: { kind: "QUANTITY", amount: REWEIGHED_QUANTITY_KG, unit: QuantityUnit.KG },
  reason,
  initiatedByActorId: ActorId.PROCESSING_MANAGER,
  scenarioTimestamp: SCENARIO_TIMELINE.correctionRecorded,
});

export const transformBatchCommand = (): import("../../domain/commands/commands").TransformBatchCommand => ({
  commandType: TransactionType.TRANSFORM_BATCH,
  inputAssetId: GREEN_COFFEE_BATCH_ID,
  outputAssetId: ROASTED_COFFEE_BATCH_ID,
  outputAssetType: AssetType.ROASTED_COFFEE_BATCH,
  outputProductName: "Arabica roasted coffee",
  outputQuantity: 82,
  outputQuantityUnit: QuantityUnit.KG,
  outputPackageSizeGrams: null,
  initiatedByActorId: ActorId.PROCESSING_MANAGER,
  scenarioTimestamp: SCENARIO_TIMELINE.batchRoasted,
});

export const packageBatchCommand = (): PackageBatchCommand => ({
  commandType: TransactionType.PACKAGE_BATCH,
  inputAssetId: ROASTED_COFFEE_BATCH_ID,
  outputAssetId: PACKAGED_COFFEE_LOT_ID,
  outputProductName: "Ca phe Arabica Lam Dong 100g",
  packageCount: 820,
  packageSizeGrams: 100,
  initiatedByActorId: ActorId.PROCESSING_MANAGER,
  scenarioTimestamp: SCENARIO_TIMELINE.batchPackaged,
});

/** Ownership moves to the distributor while the packages stay at the plant. */
export const transferOwnershipToDistributorCommand = (): TransferOwnershipCommand => ({
  commandType: TransactionType.TRANSFER_OWNERSHIP,
  assetId: PACKAGED_COFFEE_LOT_ID,
  fromOrganizationId: OrganizationId.COFFEE_PROCESSOR,
  toOrganizationId: OrganizationId.DISTRIBUTOR,
  alsoTransfersCustody: false,
  initiatedByActorId: ActorId.PROCESSING_MANAGER,
  scenarioTimestamp: SCENARIO_TIMELINE.ownershipTransferred,
});

export const dispatchToRetailerCommand = (): DispatchBatchCommand => ({
  commandType: TransactionType.DISPATCH_BATCH,
  assetId: PACKAGED_COFFEE_LOT_ID,
  fromOrganizationId: OrganizationId.DISTRIBUTOR,
  toOrganizationId: OrganizationId.RETAILER,
  toLocationId: LocationId.RETAIL_STORE,
  initiatedByActorId: ActorId.DISTRIBUTION_MANAGER,
  scenarioTimestamp: SCENARIO_TIMELINE.batchDispatched,
});

/**
 * The recall the learner actually files.
 *
 * `selectedAssetIds` comes from the learner's own scope answer rather than from
 * the correct set, so the recall they submit is the recall they reasoned their
 * way to. Getting the scope wrong is not a wrong tick on a quiz -- it files a
 * recall that misses contaminated stock or destroys good stock, and the
 * precision score reads the transaction.
 */
export const recallBatchCommand = (
  selectedAssetIds: readonly string[],
): RecallBatchCommand => ({
  commandType: TransactionType.RECALL_BATCH,
  sourceAssetId: GREEN_COFFEE_BATCH_ID,
  selectedAssetIds,
  reason: "Phong thi nghiem phat hien du luong thuoc bao ve thuc vat vuot nguong",
  externalEvidenceReference: "LAB_REPORT_2026_0705",
  initiatedByActorId: ActorId.REGULATORY_AUDITOR,
  scenarioTimestamp: SCENARIO_TIMELINE.laboratoryResult,
});

/** Who acts for each transaction, so a stage names only the actor. */
export const contextFor = (actorId: string, organizationId: string) => ({
  actorId,
  organizationId,
});

export const PRODUCER_CONTEXT = contextFor(
  ActorId.PRODUCER_MANAGER,
  OrganizationId.PRODUCER_COOP,
);
export const CERTIFIER_CONTEXT = contextFor(
  ActorId.CERTIFICATION_OFFICER,
  OrganizationId.CERTIFICATION_BODY,
);
export const LOGISTICS_CONTEXT = contextFor(
  ActorId.LOGISTICS_COORDINATOR,
  OrganizationId.LOGISTICS_PROVIDER,
);
export const PROCESSOR_CONTEXT = contextFor(
  ActorId.PROCESSING_MANAGER,
  OrganizationId.COFFEE_PROCESSOR,
);
export const DISTRIBUTOR_CONTEXT = contextFor(
  ActorId.DISTRIBUTION_MANAGER,
  OrganizationId.DISTRIBUTOR,
);
export const REGULATOR_CONTEXT = contextFor(
  ActorId.REGULATORY_AUDITOR,
  OrganizationId.REGULATOR,
);
