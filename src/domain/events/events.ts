/**
 * Committed outcomes (specification section 9.1 and section 11).
 *
 * An event is a fact: it has already been validated and endorsed, and applying
 * it to world state cannot fail. All state change flows through these.
 */

import type {
  AssetType,
  ComplianceStatus,
  LedgerEventType,
  ProvenanceRelationshipType,
  QuantityUnit,
} from "../types/enums";

interface EventBase {
  readonly transactionId: string;
  readonly committedAt: string;
}

export interface BatchCreatedEvent extends EventBase {
  readonly eventType: LedgerEventType.BATCH_CREATED;
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
}

export interface CustodyTransferredEvent extends EventBase {
  readonly eventType: LedgerEventType.CUSTODY_TRANSFERRED;
  readonly assetId: string;
  readonly previousCustodianId: string;
  readonly newCustodianId: string;
  readonly newLocationId: string;
}

export interface OwnershipTransferredEvent extends EventBase {
  readonly eventType: LedgerEventType.OWNERSHIP_TRANSFERRED;
  readonly assetId: string;
  readonly previousOwnerId: string;
  readonly newOwnerId: string;
}

export interface DocumentAnchoredEvent extends EventBase {
  readonly eventType: LedgerEventType.DOCUMENT_ANCHORED;
  readonly assetId: string;
  readonly documentAnchorId: string;
}

export interface CertificateIssuedEvent extends EventBase {
  readonly eventType: LedgerEventType.CERTIFICATE_ISSUED;
  readonly assetId: string;
  readonly certificateId: string;
  readonly complianceStatus: ComplianceStatus;
}

export interface TransportConditionRecordedEvent extends EventBase {
  readonly eventType: LedgerEventType.TRANSPORT_CONDITION_RECORDED;
  readonly assetId: string;
  readonly sensorId: string;
  readonly humidityPercent: number;
  readonly isThresholdViolated: boolean;
  readonly resultingComplianceStatus: ComplianceStatus;
  readonly locationId: string;
}

export interface BatchReceivedEvent extends EventBase {
  readonly eventType: LedgerEventType.BATCH_RECEIVED;
  readonly assetId: string;
  readonly receivingOrganizationId: string;
  readonly locationId: string;
  readonly recordedQuantity: number;
}

export interface CorrectionRecordedEvent extends EventBase {
  readonly eventType: LedgerEventType.CORRECTION_RECORDED;
  readonly assetId: string;
  readonly correctionOfTransactionId: string;
  readonly fieldName: string;
  readonly incorrectValue: string;
  readonly correctedValue: string;
  readonly reason: string;
}

export interface BatchTransformedEvent extends EventBase {
  readonly eventType: LedgerEventType.BATCH_TRANSFORMED;
  readonly inputAssetId: string;
  readonly outputAssetId: string;
  readonly outputAssetType: AssetType;
  readonly outputProductName: string;
  readonly outputQuantity: number;
  readonly outputQuantityUnit: QuantityUnit;
  readonly outputPackageSizeGrams: number | null;
  readonly relationshipType: ProvenanceRelationshipType;
}

export interface BatchPackagedEvent extends EventBase {
  readonly eventType: LedgerEventType.BATCH_PACKAGED;
  readonly inputAssetId: string;
  readonly outputAssetId: string;
  readonly outputProductName: string;
  readonly packageCount: number;
  readonly packageSizeGrams: number;
}

export interface BatchDispatchedEvent extends EventBase {
  readonly eventType: LedgerEventType.BATCH_DISPATCHED;
  readonly assetId: string;
  readonly fromOrganizationId: string;
  readonly toOrganizationId: string;
  readonly toLocationId: string;
}

export interface BatchRecalledEvent extends EventBase {
  readonly eventType: LedgerEventType.BATCH_RECALLED;
  readonly sourceAssetId: string;
  readonly affectedAssetIds: readonly string[];
  readonly reason: string;
  readonly externalEvidenceReference: string;
}

export type LedgerDomainEvent =
  | BatchCreatedEvent
  | CustodyTransferredEvent
  | OwnershipTransferredEvent
  | DocumentAnchoredEvent
  | CertificateIssuedEvent
  | TransportConditionRecordedEvent
  | BatchReceivedEvent
  | CorrectionRecordedEvent
  | BatchTransformedEvent
  | BatchPackagedEvent
  | BatchDispatchedEvent
  | BatchRecalledEvent;
