/**
 * Future-compatible simulation boundary.
 *
 * The existing supply-chain command union is deliberately kept as the business
 * payload. A submitted simulation command adds attempt identity, trusted actor
 * context and optimistic-version expectations without making those concerns
 * part of the learner-editable form payload.
 */

import type { SupplyChainCommand } from "../commands/commands";
import type { LedgerDomainEvent } from "../events/events";
import type { DomainState } from "../ledger/domain-state";
import type { TransactionResult } from "../ledger/ledger-engine";
import type {
  EndorsementEvaluation,
  EndorsementPolicyDefinition,
  EndorsementRecord,
  EndorsementValidationRuleId,
  SignatureTrustEvidence,
  SignatureValidationRuleId,
} from "../../crypto/signatures/types";

export interface CommandMetadata {
  readonly commandId: string;
  readonly sessionId: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly submittedAt: string;
  readonly expectedStateVersions: Readonly<Record<string, number>>;
}

export interface SimulationCommand {
  readonly metadata: CommandMetadata;
  readonly payload: SimulationCommandPayload;
}

export type CertificateAssessment = "VALID" | "EXPIRED" | "CONTENT_INVALID";
export type IssuerAssessment =
  | "RECOGNIZED_AUTHORIZED"
  | "RECOGNIZED_UNAUTHORIZED"
  | "UNRECOGNIZED";
export type CertificateStorageChoice = "FULL_DOCUMENT_ON_CHAIN" | "HASH_OFF_CHAIN";
export type LotDisposition = "CONTINUE" | "HOLD";

export interface SubmitCertificateDecisionCommand {
  readonly commandType: "SUBMIT_CERTIFICATE_DECISION";
  readonly certificateAssessment: CertificateAssessment;
  readonly issuerAssessment: IssuerAssessment;
  readonly storageChoice: CertificateStorageChoice;
  readonly lotDisposition: LotDisposition;
}

export type DiscrepancyAction =
  | "IGNORE"
  | "OVERWRITE"
  | "DELETE"
  | "APPEND_CORRECTION"
  | "INVESTIGATE_THEN_CORRECT";

export interface SubmitDiscrepancyDecisionCommand {
  readonly commandType: "SUBMIT_DISCREPANCY_DECISION";
  readonly action: DiscrepancyAction;
  readonly causeCode:
    | "TYPING_ERROR"
    | "UNIT_MISMATCH"
    | "PHYSICAL_LOSS"
    | "FRAUD"
    | "UNKNOWN";
}

export interface MitigationDecisionCommand {
  readonly commandType:
    | "REVIEW_ISSUER"
    | "REMEDIATE_STORAGE"
    | "SUSPEND_LOT"
    | "INVESTIGATE_DISCREPANCY";
}

export type ConsequentialDecisionCommand =
  | SubmitCertificateDecisionCommand
  | SubmitDiscrepancyDecisionCommand
  | MitigationDecisionCommand;

export interface SubmitKnowledgeDecisionCommand {
  readonly commandType: "SUBMIT_KNOWLEDGE_DECISION";
  readonly decisionId: string;
  readonly selectedOptionId: string;
}

export interface SubmitClassificationDecisionCommand {
  readonly commandType: "SUBMIT_DATA_GOVERNANCE_DECISION";
  readonly decisionId: string;
  readonly categoryByItem: Readonly<Record<string, string>>;
}

export interface SubmitMultipleChoiceDecisionCommand {
  readonly commandType: "SUBMIT_RECALL_SCOPE_DECISION";
  readonly decisionId: string;
  readonly selectedOptionIds: readonly string[];
}

export interface RunTamperDemonstrationCommand {
  readonly commandType: "RUN_TAMPER_DEMONSTRATION";
  readonly transactionId: string;
  readonly tamperedQuantity: number;
}

export interface CreateTransactionProposalCommand {
  readonly commandType: "CREATE_TRANSACTION_PROPOSAL";
  readonly actionId: string;
  readonly businessCommand: SupplyChainCommand;
}

export interface EndorseTransactionProposalCommand {
  readonly commandType: "ENDORSE_TRANSACTION_PROPOSAL";
  readonly proposalId: string;
}

export interface DeclineTransactionProposalCommand {
  readonly commandType: "DECLINE_TRANSACTION_PROPOSAL";
  readonly proposalId: string;
}

export interface CommitEndorsedTransactionCommand {
  readonly commandType: "COMMIT_ENDORSED_TRANSACTION";
  readonly proposalId: string;
}

export type EndorsementWorkflowCommand =
  | CreateTransactionProposalCommand
  | EndorseTransactionProposalCommand
  | DeclineTransactionProposalCommand
  | CommitEndorsedTransactionCommand;

export type SimulationCommandPayload =
  | SupplyChainCommand
  | ConsequentialDecisionCommand
  | SubmitKnowledgeDecisionCommand
  | SubmitClassificationDecisionCommand
  | SubmitMultipleChoiceDecisionCommand
  | RunTamperDemonstrationCommand
  | EndorsementWorkflowCommand;

export interface DomainSimulationCommand extends SimulationCommand {
  readonly payload: SupplyChainCommand;
}

/**
 * Context selected by scenario-controlled application state. It is not copied
 * from learner-entered command fields.
 */
export interface TrustedExecutionContext {
  readonly contextId: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly roleId: string;
}

export interface AssetVersionTransition {
  readonly assetId: string;
  readonly previousVersion: number | null;
  readonly newVersion: number;
}

export interface LedgerMutationEvent {
  readonly kind: "LEDGER_MUTATION";
  readonly eventId: string;
  readonly commandId: string;
  readonly sessionId: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly occurredAt: string;
  readonly event: LedgerDomainEvent;
  readonly assetVersionTransitions: readonly AssetVersionTransition[];
}

export interface SimulationDecisionEvent {
  readonly kind: "SIMULATION_DECISION";
  readonly eventId: string;
  readonly commandId: string;
  readonly sessionId: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly occurredAt: string;
  readonly decisionType: string;
  readonly payload: unknown;
}

export type AcceptedDomainEvent = LedgerMutationEvent | SimulationDecisionEvent;

export interface AttemptValidationFailure {
  readonly code:
    | "TRUSTED_CONTEXT_MISMATCH"
    | "STALE_STATE_VERSION"
    | "MISSING_STATE_VERSION"
    | "UNEXPECTED_STATE_VERSION"
    | "DOMAIN_RULE_FAILED"
    | SignatureValidationRuleId
    | EndorsementValidationRuleId;
  readonly messageKey: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export interface AttemptAuditEvent {
  readonly kind: "COMMAND_REJECTED";
  readonly auditEventId: string;
  readonly commandId: string;
  readonly sessionId: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly occurredAt: string;
  readonly submittedCommand: SimulationCommand;
  readonly validationFailures: readonly AttemptValidationFailure[];
  readonly signatureEvidence?: SignatureTrustEvidence;
}

export type SimulationEvent = AcceptedDomainEvent | AttemptAuditEvent;

export type PendingProposalStatus =
  | "AWAITING_ENDORSEMENTS"
  | "POLICY_SATISFIED"
  | "COMMITTED"
  | "DECLINED"
  | "STALE"
  | "SUPERSEDED";

export interface PendingTransactionProposal {
  readonly proposalId: string;
  readonly actionId: string;
  readonly command: DomainSimulationCommand;
  readonly proposerContext: TrustedExecutionContext;
  readonly proposalEvidence: SignatureTrustEvidence;
  readonly policy: EndorsementPolicyDefinition;
  readonly endorsements: readonly EndorsementRecord[];
  readonly evaluation: EndorsementEvaluation;
  readonly status: PendingProposalStatus;
  readonly declineCommandIds: readonly string[];
  readonly transactionId: string | null;
}

export interface SimulationRuntimeState {
  readonly domain: DomainState;
  readonly acceptedEvents: readonly AcceptedDomainEvent[];
  readonly attemptAuditEvents: readonly AttemptAuditEvent[];
  readonly pendingProposalsById: Readonly<
    Record<string, PendingTransactionProposal>
  >;
  /**
   * Runtime idempotency cache. TC3 persists the compact command journal and
   * rebuilds this index during replay rather than serializing event objects.
   */
  readonly outcomesByCommandId: Readonly<Record<string, ProcessedCommandOutcome>>;
}

export interface AcceptedSimulationCommandOutcome {
  readonly isAccepted: true;
  readonly commandId: string;
  readonly state: SimulationRuntimeState;
  readonly transaction: TransactionResult["transaction"] | null;
  readonly events: readonly AcceptedDomainEvent[];
  readonly validation: TransactionResult["validation"] | null;
  readonly signatureEvidence?: SignatureTrustEvidence;
}

export interface RejectedSimulationCommandOutcome {
  readonly isAccepted: false;
  readonly commandId: string;
  readonly state: SimulationRuntimeState;
  readonly auditEvent: AttemptAuditEvent;
  /**
   * A transient validation receipt for presentation. It is never reduced into
   * domain state, appended to the ledger, hashed, or persisted as an event.
   * Boundary rejections can occur before a ledger proposal exists.
   */
  readonly transaction: TransactionResult["transaction"] | null;
  readonly validation: TransactionResult["validation"] | null;
  readonly signatureEvidence?: SignatureTrustEvidence;
}

export type SimulationCommandOutcome =
  | AcceptedSimulationCommandOutcome
  | RejectedSimulationCommandOutcome;

export type ProcessedCommandOutcome =
  | Omit<AcceptedSimulationCommandOutcome, "state">
  | Omit<RejectedSimulationCommandOutcome, "state">;

export interface AcceptedEndorsementWorkflowOutcome {
  readonly isAccepted: true;
  readonly commandId: string;
  readonly state: SimulationRuntimeState;
  readonly pendingProposal: PendingTransactionProposal;
  readonly event: SimulationDecisionEvent;
}

export interface RejectedEndorsementWorkflowOutcome {
  readonly isAccepted: false;
  readonly commandId: string;
  readonly state: SimulationRuntimeState;
  readonly pendingProposal: PendingTransactionProposal | null;
  readonly auditEvent: AttemptAuditEvent;
}

export type EndorsementWorkflowOutcome =
  | AcceptedEndorsementWorkflowOutcome
  | RejectedEndorsementWorkflowOutcome;
