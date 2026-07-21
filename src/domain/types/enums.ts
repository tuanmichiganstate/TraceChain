/**
 * Domain enumerations (specification sections 7, 10, 11, 12).
 *
 * String enums are used rather than union types because several call sites need
 * the runtime value list -- the scenario validator iterates every
 * TransactionType, and the compact state codec maps enum members to stable
 * positional indices.
 *
 * ORDER IS LOAD-BEARING for any enum consumed by the compact state codec:
 * appending is safe, reordering or removing is a breaking change that requires
 * a schema version bump and a migration.
 */

export enum OrganizationType {
  PRODUCER = "PRODUCER",
  CERTIFIER = "CERTIFIER",
  LOGISTICS_PROVIDER = "LOGISTICS_PROVIDER",
  PROCESSOR = "PROCESSOR",
  DISTRIBUTOR = "DISTRIBUTOR",
  RETAILER = "RETAILER",
  REGULATOR = "REGULATOR",
}

export enum ActorRole {
  PRODUCER_MANAGER = "PRODUCER_MANAGER",
  CERTIFICATION_OFFICER = "CERTIFICATION_OFFICER",
  LOGISTICS_COORDINATOR = "LOGISTICS_COORDINATOR",
  PROCESSING_MANAGER = "PROCESSING_MANAGER",
  DISTRIBUTION_MANAGER = "DISTRIBUTION_MANAGER",
  RETAIL_MANAGER = "RETAIL_MANAGER",
  REGULATORY_AUDITOR = "REGULATORY_AUDITOR",
  /**
   * A non-learner actor. The producer co-operative's shipping clerk files the
   * dispatch manifest that carries the seeded quantity error, so that the
   * mistake arrives from another organization rather than from the learner.
   */
  SHIPPING_CLERK = "SHIPPING_CLERK",
}

export enum AssetType {
  GREEN_COFFEE_BATCH = "GREEN_COFFEE_BATCH",
  ROASTED_COFFEE_BATCH = "ROASTED_COFFEE_BATCH",
  PACKAGED_COFFEE_LOT = "PACKAGED_COFFEE_LOT",
}

export enum QuantityUnit {
  KG = "KG",
  GRAM = "GRAM",
  UNIT = "UNIT",
}

export enum AssetLifecycleStatus {
  CREATED = "CREATED",
  CERTIFIED = "CERTIFIED",
  READY_FOR_SHIPMENT = "READY_FOR_SHIPMENT",
  IN_TRANSIT = "IN_TRANSIT",
  RECEIVED = "RECEIVED",
  CONSUMED_IN_TRANSFORMATION = "CONSUMED_IN_TRANSFORMATION",
  PROCESSED = "PROCESSED",
  PACKAGED = "PACKAGED",
  AVAILABLE_FOR_SALE = "AVAILABLE_FOR_SALE",
  SOLD = "SOLD",
  RECALLED = "RECALLED",
  CLOSED = "CLOSED",
}

export enum ComplianceStatus {
  PENDING_CERTIFICATION = "PENDING_CERTIFICATION",
  COMPLIANT = "COMPLIANT",
  INSPECTION_REQUIRED = "INSPECTION_REQUIRED",
  NON_COMPLIANT = "NON_COMPLIANT",
  RECALLED = "RECALLED",
}

export enum SaleEligibility {
  NOT_YET_ELIGIBLE = "NOT_YET_ELIGIBLE",
  ELIGIBLE = "ELIGIBLE",
  PROHIBITED = "PROHIBITED",
}

export enum DocumentType {
  QUALITY_CERTIFICATE = "QUALITY_CERTIFICATE",
  SHIPPING_MANIFEST = "SHIPPING_MANIFEST",
  SENSOR_DATASET = "SENSOR_DATASET",
  LABORATORY_REPORT = "LABORATORY_REPORT",
}

export enum DocumentVerificationStatus {
  NOT_VERIFIED = "NOT_VERIFIED",
  HASH_MATCHED = "HASH_MATCHED",
  HASH_MISMATCH = "HASH_MISMATCH",
  ISSUER_NOT_AUTHORIZED = "ISSUER_NOT_AUTHORIZED",
}

/**
 * VERIFY_PRODUCT is deliberately absent. Reading the ledger is a query, not a
 * state change: writing a transaction for every consumer scan would have no
 * corresponding past-tense event, would contradict the data-governance lesson
 * in specification section 25, and would pollute the ledger the learner is
 * about to inspect. Consumer verification is a read-only projection.
 */
export enum TransactionType {
  CREATE_BATCH = "CREATE_BATCH",
  ANCHOR_DOCUMENT = "ANCHOR_DOCUMENT",
  ISSUE_CERTIFICATE = "ISSUE_CERTIFICATE",
  TRANSFER_OWNERSHIP = "TRANSFER_OWNERSHIP",
  TRANSFER_CUSTODY = "TRANSFER_CUSTODY",
  RECORD_TRANSPORT_CONDITION = "RECORD_TRANSPORT_CONDITION",
  RECEIVE_BATCH = "RECEIVE_BATCH",
  RECORD_CORRECTION = "RECORD_CORRECTION",
  TRANSFORM_BATCH = "TRANSFORM_BATCH",
  PACKAGE_BATCH = "PACKAGE_BATCH",
  DISPATCH_BATCH = "DISPATCH_BATCH",
  RECALL_BATCH = "RECALL_BATCH",
}

export enum LedgerEventType {
  BATCH_CREATED = "BATCH_CREATED",
  DOCUMENT_ANCHORED = "DOCUMENT_ANCHORED",
  CERTIFICATE_ISSUED = "CERTIFICATE_ISSUED",
  OWNERSHIP_TRANSFERRED = "OWNERSHIP_TRANSFERRED",
  CUSTODY_TRANSFERRED = "CUSTODY_TRANSFERRED",
  TRANSPORT_CONDITION_RECORDED = "TRANSPORT_CONDITION_RECORDED",
  BATCH_RECEIVED = "BATCH_RECEIVED",
  CORRECTION_RECORDED = "CORRECTION_RECORDED",
  BATCH_TRANSFORMED = "BATCH_TRANSFORMED",
  BATCH_PACKAGED = "BATCH_PACKAGED",
  BATCH_DISPATCHED = "BATCH_DISPATCHED",
  BATCH_RECALLED = "BATCH_RECALLED",
}

export enum TransactionStatus {
  DRAFT = "DRAFT",
  SIGNED = "SIGNED",
  SUBMITTED = "SUBMITTED",
  VALIDATED = "VALIDATED",
  ENDORSED = "ENDORSED",
  ORDERED = "ORDERED",
  COMMITTED = "COMMITTED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
}

export enum ProvenanceRelationshipType {
  TRANSFORMED_INTO = "TRANSFORMED_INTO",
  PACKAGED_INTO = "PACKAGED_INTO",
}

export enum ValidationStatus {
  PASSED = "PASSED",
  FAILED = "FAILED",
  WARNING = "WARNING",
  NOT_APPLICABLE = "NOT_APPLICABLE",
}

/**
 * Nine stages, trimmed from the specification's ten. The original stages 4 and
 * 5 are merged into STG_04_SHIP_AND_MONITOR: both are logistics, and the
 * custody handoff is the moment transport begins. This protects the 30-45
 * minute session budget in specification section 2.4 without dropping any of
 * the twelve learning objectives in section 2.2.
 *
 * The enum key is the stable identity; the number is display order only.
 */
export enum ScenarioStageId {
  ORIENTATION = "STG_01_ORIENTATION",
  CREATE_BATCH = "STG_02_CREATE_BATCH",
  ANCHOR_CERTIFICATE = "STG_03_ANCHOR_CERTIFICATE",
  SHIP_AND_MONITOR = "STG_04_SHIP_AND_MONITOR",
  RECEIVE_AND_CORRECT = "STG_05_RECEIVE_AND_CORRECT",
  TRANSFORM_BATCH = "STG_06_TRANSFORM_BATCH",
  PACKAGE_AND_DISTRIBUTE = "STG_07_PACKAGE_AND_DISTRIBUTE",
  VERIFY_AND_TAMPER = "STG_08_VERIFY_AND_TAMPER",
  RECALL_AND_DEBRIEF = "STG_09_RECALL_AND_DEBRIEF",
}

/**
 * Display order for the nine stages. The compact state codec encodes a stage as
 * its index in this array, so the order must not change without a schema
 * version bump.
 */
export const SCENARIO_STAGE_ORDER: readonly ScenarioStageId[] = [
  ScenarioStageId.ORIENTATION,
  ScenarioStageId.CREATE_BATCH,
  ScenarioStageId.ANCHOR_CERTIFICATE,
  ScenarioStageId.SHIP_AND_MONITOR,
  ScenarioStageId.RECEIVE_AND_CORRECT,
  ScenarioStageId.TRANSFORM_BATCH,
  ScenarioStageId.PACKAGE_AND_DISTRIBUTE,
  ScenarioStageId.VERIFY_AND_TAMPER,
  ScenarioStageId.RECALL_AND_DEBRIEF,
];

/**
 * Every transaction type maps to exactly one past-tense event type. Asserted by
 * a test, so that adding a transaction type without its event is caught.
 */
export const TRANSACTION_TO_EVENT: Readonly<Record<TransactionType, LedgerEventType>> = {
  [TransactionType.CREATE_BATCH]: LedgerEventType.BATCH_CREATED,
  [TransactionType.ANCHOR_DOCUMENT]: LedgerEventType.DOCUMENT_ANCHORED,
  [TransactionType.ISSUE_CERTIFICATE]: LedgerEventType.CERTIFICATE_ISSUED,
  [TransactionType.TRANSFER_OWNERSHIP]: LedgerEventType.OWNERSHIP_TRANSFERRED,
  [TransactionType.TRANSFER_CUSTODY]: LedgerEventType.CUSTODY_TRANSFERRED,
  [TransactionType.RECORD_TRANSPORT_CONDITION]: LedgerEventType.TRANSPORT_CONDITION_RECORDED,
  [TransactionType.RECEIVE_BATCH]: LedgerEventType.BATCH_RECEIVED,
  [TransactionType.RECORD_CORRECTION]: LedgerEventType.CORRECTION_RECORDED,
  [TransactionType.TRANSFORM_BATCH]: LedgerEventType.BATCH_TRANSFORMED,
  [TransactionType.PACKAGE_BATCH]: LedgerEventType.BATCH_PACKAGED,
  [TransactionType.DISPATCH_BATCH]: LedgerEventType.BATCH_DISPATCHED,
  [TransactionType.RECALL_BATCH]: LedgerEventType.BATCH_RECALLED,
};
