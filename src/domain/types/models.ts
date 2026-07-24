/**
 * Core domain models (specification section 10).
 *
 * Every learner-facing string is a localization key ending in `Key`. Fields
 * holding raw text (productName, originLocation) carry scenario data that is
 * itself authored in the scenario files, never translated at runtime -- these
 * are ledger values, and a ledger value must not change when the interface
 * language changes, or the hash would change with it.
 */

import type {
  ActorRole,
  AssetLifecycleStatus,
  AssetType,
  ComplianceStatus,
  DocumentType,
  DocumentVerificationStatus,
  LedgerEventType,
  OrganizationType,
  ProvenanceRelationshipType,
  QuantityUnit,
  SaleEligibility,
  TransactionStatus,
  TransactionType,
  ValidationStatus,
} from "./enums";
import type { ValidationRuleId } from "./rule-ids";
import type { DocumentMetadata } from "./document-metadata";
import type { SignatureTrustEvidence } from "../../crypto/signatures/types";

/** Business actions an organization may be authorized to perform. */
export type SupplyChainAction = TransactionType;

export interface Organization {
  organizationId: string;
  organizationType: OrganizationType;
  displayNameKey: string;
  authorizedActions: readonly SupplyChainAction[];
  isActive: boolean;
}

export interface Actor {
  actorId: string;
  actorRole: ActorRole;
  organizationId: string;
  displayNameKey: string;
  isAuthorized: boolean;
}

/**
 * Physical places. The specification referenced `currentLocationId` and
 * `RecallLocation` without ever defining the entity; this closes that gap and
 * adds the `LOC_` identifier prefix.
 */
export interface Location {
  locationId: string;
  displayNameKey: string;
  operatedByOrganizationId: string;
}

export interface SupplyChainAsset {
  assetId: string;
  assetType: AssetType;
  productName: string;
  originLocation: string;
  productionDate: string;
  quantity: number;
  quantityUnit: QuantityUnit;
  /**
   * Grams per unit, for assets measured in UNIT. Required to compare a
   * packaged lot (820 UNIT) against its roasted input (82 KG): without it the
   * transformation quantity rule compares 820 against 82 and rejects a
   * perfectly valid packaging operation.
   */
  packageSizeGrams: number | null;
  currentOwnerId: string;
  currentCustodianId: string;
  currentLocationId: string;
  lifecycleStatus: AssetLifecycleStatus;
  complianceStatus: ComplianceStatus;
  saleEligibility: SaleEligibility;
  certificateIds: readonly string[];
  documentAnchorIds: readonly string[];
  parentAssetIds: readonly string[];
  childAssetIds: readonly string[];
  createdByTransactionId: string;
  lastUpdatedByTransactionId: string;
  stateVersion: number;
}

export interface DocumentAnchor {
  documentAnchorId: string;
  documentType: DocumentType;
  fileName: string;
  contentHash: string;
  metadata: DocumentMetadata;
  hashAlgorithm: "SHA-256";
  issuerOrganizationId: string;
  issuedAt: string;
  expiresAt?: string;
  storageLocationType: "SIMULATED_OFF_CHAIN";
  verificationStatus: DocumentVerificationStatus;
}

export interface SimulatedSignature {
  signatureId: string;
  signedByActorId: string;
  signedByOrganizationId: string;
  signedAt: string;
  signedPayloadHash: string;
  signatureType: "EDUCATIONAL_SIMULATION";
}

export interface ValidationResult {
  ruleId: ValidationRuleId;
  status: ValidationStatus;
  messageKey: string;
  details?: Record<string, string | number | boolean>;
}

export interface EndorsementResult {
  endorsingOrganizationId: string;
  endorsedAt: string;
  isEndorsed: boolean;
  /**
   * True when the simulation generated this endorsement on the learner's
   * behalf. The interface must render these explicitly -- if the counterparty's
   * approval is invisible, learners conclude one signature suffices, which is
   * the opposite of the intended lesson.
   */
  isSimulatedCounterparty: boolean;
  /** Present for a genuine educational Ed25519 endorsement. */
  endorsementId?: string;
  proposalDigest?: string;
  endorsementPolicyId?: string;
  signatureEvidence?: SignatureTrustEvidence;
}

export interface LedgerTransaction {
  transactionId: string;
  transactionType: TransactionType;
  transactionStatus: TransactionStatus;
  commandPayload: unknown;
  proposedByActorId: string;
  proposedByOrganizationId: string;
  simulatedSignature: SimulatedSignature;
  /** Present when the package performed a genuine educational Ed25519 signature. */
  signatureEvidence?: SignatureTrustEvidence;
  validationResults: readonly ValidationResult[];
  endorsementResults: readonly EndorsementResult[];
  createdAt: string;
  submittedAt?: string;
  validatedAt?: string;
  endorsedAt?: string;
  orderedAt?: string;
  committedAt?: string;
  transactionHash?: string;
  /**
   * The asset state digests that went into `transactionHash`. Stored rather
   * than recomputed so that integrity verification is self-contained: the
   * tamper demonstration alters a historical payload and the mismatch is
   * detectable without replaying the whole chain.
   */
  previousAssetStateHash?: string | null;
  resultingAssetStateHash?: string;
  blockId?: string;
  correctionOfTransactionId?: string;
}

export interface LedgerBlock {
  blockId: string;
  blockNumber: number;
  previousBlockHash: string | null;
  transactionIds: readonly string[];
  createdAt: string;
  blockHash: string;
  orderingServiceId: string;
}

export interface ProvenanceEdge {
  provenanceEdgeId: string;
  sourceAssetId: string;
  targetAssetId: string;
  relationshipType: ProvenanceRelationshipType;
  transactionId: string;
}

export interface LedgerEvent {
  eventType: LedgerEventType;
  transactionId: string;
  committedAt: string;
  payload: unknown;
}
