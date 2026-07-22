/**
 * Learner actions, expressed as commands (specification section 9.1).
 *
 * A command is a *request*: it may be rejected. Only an event, emitted after
 * validation and endorsement, changes world state. React components construct
 * commands and never touch state directly.
 *
 * Milestone 0 implements CREATE_BATCH end to end. The remaining command shapes
 * are declared now so that the union, the rule registry and the reducer all
 * grow by addition rather than by rewrite.
 */

import type {
  AssetType,
  DocumentType,
  QuantityUnit,
  TransactionType,
} from "../types/enums";
import type { CorrectionTarget, CorrectionValue } from "../types/correction";
import type { DocumentMetadata } from "../types/document-metadata";

/** Fields every command carries. */
interface CommandBase {
  readonly initiatedByActorId: string;
  /**
   * From the deterministic scenario clock, never from the learner's system
   * clock (specification section 17.3). Learner timezone must not affect a hash.
   */
  readonly scenarioTimestamp: string;
}

export interface CreateBatchCommand extends CommandBase {
  readonly commandType: TransactionType.CREATE_BATCH;
  readonly assetId: string;
  readonly assetType: AssetType;
  readonly productName: string;
  readonly originLocation: string;
  readonly productionDate: string;
  readonly quantity: number;
  readonly quantityUnit: QuantityUnit;
  readonly packageSizeGrams: number | null;
  readonly producerOrganizationId: string;
  readonly locationId: string;
}

export interface TransferCustodyCommand extends CommandBase {
  readonly commandType: TransactionType.TRANSFER_CUSTODY;
  readonly assetId: string;
  readonly fromOrganizationId: string;
  readonly toOrganizationId: string;
  readonly toLocationId: string;
  /**
   * The learner's answer to "what does this transaction move?". A custody
   * transfer that also moves ownership must be rejected -- that rejection is
   * the entire teaching point of the stage -- so the intent is captured
   * explicitly rather than inferred.
   */
  readonly alsoTransfersOwnership: boolean;
}

export interface TransferOwnershipCommand extends CommandBase {
  readonly commandType: TransactionType.TRANSFER_OWNERSHIP;
  readonly assetId: string;
  readonly fromOrganizationId: string;
  readonly toOrganizationId: string;
  readonly alsoTransfersCustody: boolean;
}

/**
 * Anchoring carries the document's metadata, rather than referencing an anchor
 * that already exists. Anchoring is the act that *creates* the on-chain record;
 * requiring the anchor beforehand would be circular.
 *
 * The file itself is never uploaded. `contentHash` is computed from bundled
 * scenario content -- what goes on chain is the digest and the metadata, which
 * is the entire point of stage 3.
 */
export interface AnchorDocumentCommand extends CommandBase {
  readonly commandType: TransactionType.ANCHOR_DOCUMENT;
  readonly assetId: string;
  readonly documentAnchorId: string;
  readonly documentType: DocumentType;
  readonly fileName: string;
  readonly contentHash: string;
  readonly metadata: DocumentMetadata;
  readonly issuerOrganizationId: string;
  readonly issuedAt: string;
  readonly expiresAt?: string;
}

export interface IssueCertificateCommand extends CommandBase {
  readonly commandType: TransactionType.ISSUE_CERTIFICATE;
  readonly assetId: string;
  readonly certificateId: string;
  readonly documentAnchorId: string;
  readonly issuerOrganizationId: string;
}

export interface RecordTransportConditionCommand extends CommandBase {
  readonly commandType: TransactionType.RECORD_TRANSPORT_CONDITION;
  readonly assetId: string;
  readonly sensorId: string;
  readonly humidityPercent: number;
  readonly allowedMaximumHumidityPercent: number;
  readonly locationId: string;
  readonly datasetAnchorId: string | null;
}

export interface ReceiveBatchCommand extends CommandBase {
  readonly commandType: TransactionType.RECEIVE_BATCH;
  readonly assetId: string;
  readonly receivingOrganizationId: string;
  readonly locationId: string;
  readonly observedQuantity: number;
  readonly quantityUnit: QuantityUnit;
}

export interface RecordCorrectionCommand extends CommandBase {
  readonly commandType: TransactionType.RECORD_CORRECTION;
  /** The asset this correction concerns, for history association. */
  readonly assetId: string;
  readonly correctionOfTransactionId: string;
  readonly target: CorrectionTarget;
  readonly incorrectValue: CorrectionValue;
  readonly correctedValue: CorrectionValue;
  readonly reason: string;
}

export interface TransformBatchCommand extends CommandBase {
  readonly commandType: TransactionType.TRANSFORM_BATCH;
  readonly inputAssetId: string;
  readonly outputAssetId: string;
  readonly outputAssetType: AssetType;
  readonly outputProductName: string;
  readonly outputQuantity: number;
  readonly outputQuantityUnit: QuantityUnit;
  readonly outputPackageSizeGrams: number | null;
}

export interface PackageBatchCommand extends CommandBase {
  readonly commandType: TransactionType.PACKAGE_BATCH;
  readonly inputAssetId: string;
  readonly outputAssetId: string;
  readonly outputProductName: string;
  readonly packageCount: number;
  readonly packageSizeGrams: number;
}

export interface DispatchBatchCommand extends CommandBase {
  readonly commandType: TransactionType.DISPATCH_BATCH;
  readonly assetId: string;
  readonly fromOrganizationId: string;
  readonly toOrganizationId: string;
  readonly toLocationId: string;
}

export interface RecallBatchCommand extends CommandBase {
  readonly commandType: TransactionType.RECALL_BATCH;
  readonly sourceAssetId: string;
  /** The lots the learner believes are affected. Precision is scored. */
  readonly selectedAssetIds: readonly string[];
  readonly reason: string;
  readonly externalEvidenceReference: string;
}

export type SupplyChainCommand =
  | CreateBatchCommand
  | TransferCustodyCommand
  | TransferOwnershipCommand
  | AnchorDocumentCommand
  | IssueCertificateCommand
  | RecordTransportConditionCommand
  | ReceiveBatchCommand
  | RecordCorrectionCommand
  | TransformBatchCommand
  | PackageBatchCommand
  | DispatchBatchCommand
  | RecallBatchCommand;

/** Context supplied by the application layer, not chosen by the learner. */
export interface CommandContext {
  readonly actorId: string;
  readonly organizationId: string;
}
