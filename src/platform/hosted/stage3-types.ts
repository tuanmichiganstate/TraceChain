import type {
  SubmitDiscrepancyDecisionCommand,
  SubmitCertificateDecisionCommand,
  SimulationRuntimeState,
  TrustedExecutionContext,
} from "../../domain/simulation/types";
import type {
  HostedRunMode,
  HostedRunModeConfigurationV1,
} from "../contracts/scenario-pack";
import type { StochasticOutcomeResolutionV1 } from "../runs/stochastic-outcomes";

export type Stage3CaseVariant =
  | "authorized-certifier"
  | "unauthorized-transporter";

export type Stage3WorkflowStep =
  | "certificate-evidence"
  | "certificate-decision"
  | "certificate-transaction"
  | "custody-proposal"
  | "custody-endorsement"
  | "custody-commit"
  | "transport-transaction"
  | "receipt-transaction"
  | "ownership-transaction"
  | "discrepancy-decision"
  | "discrepancy-mitigation"
  | "correction-proposal"
  | "correction-endorsement"
  | "correction-commit"
  | "transformation-transaction"
  | "transformation-knowledge"
  | "packaging-transaction"
  | "distribution-ownership-transaction"
  | "dispatch-transaction"
  | "tamper-demonstration"
  | "tamper-knowledge"
  | "data-governance-decision"
  | "recall-scope-decision"
  | "recall-transaction"
  | "recall-handoff"
  | "recall-authorized-transaction"
  | "blockchain-necessity-decision"
  | "complete";

export interface HostedStage3Decision {
  readonly decision: SubmitCertificateDecisionCommand;
  readonly justification: string;
  readonly isAuthoredCorrect: boolean;
}

export interface HostedTransactionSummary {
  readonly actionId: string;
  readonly coreCommandId: string;
  readonly isAccepted: boolean;
  readonly transactionId: string | null;
  readonly signatureValid: boolean;
  readonly recognizedIdentity: boolean;
  readonly authorized: boolean;
  readonly validationRuleIds: readonly string[];
}

export interface HostedCustodyProposalSummary {
  readonly actionId: "TRANSFER_CUSTODY";
  readonly coreCommandId: string;
  readonly isAccepted: boolean;
  readonly proposalId: string | null;
  readonly proposalDigest: string | null;
  readonly endorsementPolicyId: string | null;
  readonly policySatisfied: boolean;
  readonly validationRuleIds: readonly string[];
}

export interface HostedEndorsementSummary {
  readonly coreCommandId: string;
  readonly isAccepted: boolean;
  readonly proposalId: string;
  readonly organizationId: string;
  readonly policySatisfied: boolean;
  readonly validationRuleIds: readonly string[];
}

export interface HostedDiscrepancyDecision {
  readonly decision: SubmitDiscrepancyDecisionCommand;
  readonly isRejectedAttempt: boolean;
  readonly isScorableCorrect: boolean;
  readonly requiresMitigation: boolean;
}

export interface HostedCorrectionProposalSummary {
  readonly actionId: "RECORD_CORRECTION";
  readonly coreCommandId: string;
  readonly isAccepted: boolean;
  readonly proposalId: string | null;
  readonly proposalDigest: string | null;
  readonly endorsementPolicyId: string | null;
  readonly policySatisfied: boolean;
  readonly validationRuleIds: readonly string[];
}

export interface HostedKnowledgeDecision {
  readonly decisionId: string;
  readonly selectedOptionId: string;
  readonly isAuthoredCorrect: boolean;
}

export interface HostedClassificationDecision {
  readonly decisionId: string;
  readonly categoryByItem: Readonly<Record<string, string>>;
  readonly isAuthoredCorrect: boolean;
}

export interface HostedRecallScopeDecision {
  readonly decisionId: "INT_RECALL_SCOPE";
  readonly selectedAssetIds: readonly string[];
  readonly isAuthoredCorrect: boolean;
}

export interface HostedTamperSummary {
  readonly transactionId: string;
  readonly originalQuantity: number;
  readonly tamperedQuantity: number;
  readonly beforeValid: boolean;
  readonly invalidTransactionIdsAfterEdit: readonly string[];
  readonly invalidBlockIdsAfterForgingTransaction: readonly string[];
  readonly invalidBlockIdsAfterForgingBlock: readonly string[];
  readonly cascadingBlockIds: readonly string[];
  readonly realLedgerIntact: boolean;
}

export interface HostedCompetencyEvidence {
  readonly competencyEvidenceId: string;
  readonly evidenceRuleId: string;
  readonly indicatorIds: readonly string[];
  readonly sourceEventIds: readonly string[];
  readonly observedAt: string;
}

export interface HostedStage3RunState {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly assignmentId: string;
  readonly learnerUserId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly packContentHash: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly mode: HostedRunMode;
  readonly modeConfiguration: HostedRunModeConfigurationV1;
  readonly scenarioSeed: string;
  readonly caseVariant: Stage3CaseVariant;
  readonly outcomeResolution: StochasticOutcomeResolutionV1;
  readonly outcomeEvidenceStatus:
    | "not-required"
    | "awaiting-draw"
    | "awaiting-outcome"
    | "recorded";
  readonly activeTrustedContext: TrustedExecutionContext;
  readonly version: number;
  readonly status: "active" | "completed";
  readonly workflowStep: Stage3WorkflowStep;
  readonly releasedEvidenceIds: readonly string[];
  readonly inspectedEvidenceIds: readonly string[];
  readonly decision: HostedStage3Decision | null;
  readonly transactionStatus:
    | "not-started"
    | "proposed"
    | "committed"
    | "rejected";
  readonly transactions: readonly HostedTransactionSummary[];
  readonly custodyStatus:
    | "not-started"
    | "rejected"
    | "awaiting-endorsement"
    | "policy-satisfied"
    | "committed";
  readonly custodyProposal: HostedCustodyProposalSummary | null;
  readonly custodyEndorsement: HostedEndorsementSummary | null;
  readonly pendingProposalId: string | null;
  readonly transportStatus: "not-started" | "committed" | "rejected";
  readonly receiptStatus: "not-started" | "committed" | "rejected";
  readonly ownershipStatus: "not-started" | "committed" | "rejected";
  readonly discrepancyDecision: HostedDiscrepancyDecision | null;
  readonly discrepancyMitigationStatus:
    | "not-started"
    | "not-required"
    | "required"
    | "completed";
  readonly correctionStatus:
    | "not-started"
    | "rejected"
    | "awaiting-endorsement"
    | "policy-satisfied"
    | "committed";
  readonly correctionProposal: HostedCorrectionProposalSummary | null;
  readonly correctionEndorsement: HostedEndorsementSummary | null;
  readonly correctionPendingProposalId: string | null;
  readonly transformationStatus:
    | "not-started"
    | "committed"
    | "rejected";
  readonly knowledgeDecisions: Readonly<
    Record<string, HostedKnowledgeDecision>
  >;
  readonly packagingStatus:
    | "not-started"
    | "committed"
    | "rejected";
  readonly distributionOwnershipStatus:
    | "not-started"
    | "committed"
    | "rejected";
  readonly dispatchStatus:
    | "not-started"
    | "committed"
    | "rejected";
  readonly tamperDemonstration: HostedTamperSummary | null;
  readonly dataGovernanceDecision:
    | HostedClassificationDecision
    | null;
  readonly recallScopeDecision: HostedRecallScopeDecision | null;
  readonly recallStatus:
    | "not-started"
    | "rejected"
    | "committed";
  readonly recallHandoffStatus: "not-started" | "completed";
  readonly competencyEvidence: readonly HostedCompetencyEvidence[];
  readonly simulation: SimulationRuntimeState;
}

export interface CreateHostedStage3RunRequest {
  readonly commandId: string;
  readonly runId: string;
  readonly assignmentId: string;
  readonly learnerUserId: string;
  readonly mode: HostedRunMode;
  readonly modeConfiguration?: HostedRunModeConfigurationV1;
  readonly scenarioSeed?: string;
  readonly caseVariant: Stage3CaseVariant;
}

interface HostedStage3CommandBase {
  readonly commandId: string;
  readonly runId: string;
  readonly expectedRunVersion: number;
}

export interface InspectStage3EvidenceCommand
  extends HostedStage3CommandBase {
  readonly commandType: "INSPECT_EVIDENCE";
  readonly evidenceId: string;
}

export interface SubmitHostedStage3DecisionCommand
  extends HostedStage3CommandBase {
  readonly commandType: "SUBMIT_CERTIFICATE_DECISION";
  readonly decision: Omit<
    SubmitCertificateDecisionCommand,
    "commandType"
  >;
  readonly justification: string;
}

export interface SubmitHostedStage3TransactionCommand
  extends HostedStage3CommandBase {
  readonly commandType: "SUBMIT_CERTIFICATE_TRANSACTION";
}

export interface CreateHostedCustodyProposalCommand
  extends HostedStage3CommandBase {
  readonly commandType: "CREATE_CUSTODY_TRANSFER_PROPOSAL";
  readonly alsoTransfersOwnership: boolean;
}

export interface EndorseHostedCustodyProposalCommand
  extends HostedStage3CommandBase {
  readonly commandType: "ENDORSE_CUSTODY_TRANSFER";
  readonly proposalId: string;
}

export interface CommitHostedCustodyProposalCommand
  extends HostedStage3CommandBase {
  readonly commandType: "COMMIT_CUSTODY_TRANSFER";
  readonly proposalId: string;
}

export interface RecordHostedTransportConditionCommand
  extends HostedStage3CommandBase {
  readonly commandType: "RECORD_TRANSPORT_CONDITION";
}

export interface ReceiveHostedBatchCommand
  extends HostedStage3CommandBase {
  readonly commandType: "RECEIVE_BATCH";
}

export interface PurchaseHostedBatchCommand
  extends HostedStage3CommandBase {
  readonly commandType: "PURCHASE_ON_RECEIPT";
}

export interface SubmitHostedDiscrepancyDecisionCommand
  extends HostedStage3CommandBase {
  readonly commandType: "SUBMIT_DISCREPANCY_DECISION";
  readonly decision: Omit<
    SubmitDiscrepancyDecisionCommand,
    "commandType"
  >;
}

export interface InvestigateHostedDiscrepancyCommand
  extends HostedStage3CommandBase {
  readonly commandType: "INVESTIGATE_DISCREPANCY";
}

export interface CreateHostedCorrectionProposalCommand
  extends HostedStage3CommandBase {
  readonly commandType: "CREATE_CORRECTION_PROPOSAL";
  readonly reason: string;
}

export interface EndorseHostedCorrectionProposalCommand
  extends HostedStage3CommandBase {
  readonly commandType: "ENDORSE_CORRECTION";
  readonly proposalId: string;
}

export interface CommitHostedCorrectionProposalCommand
  extends HostedStage3CommandBase {
  readonly commandType: "COMMIT_CORRECTION";
  readonly proposalId: string;
}

export interface TransformHostedBatchCommand
  extends HostedStage3CommandBase {
  readonly commandType: "TRANSFORM_BATCH";
}

export interface SubmitHostedKnowledgeDecisionCommand
  extends HostedStage3CommandBase {
  readonly commandType: "SUBMIT_KNOWLEDGE_DECISION";
  readonly decisionId: string;
  readonly selectedOptionId: string;
}

export interface PackageHostedBatchCommand
  extends HostedStage3CommandBase {
  readonly commandType: "PACKAGE_BATCH";
}

export interface TransferHostedDistributionOwnershipCommand
  extends HostedStage3CommandBase {
  readonly commandType: "TRANSFER_DISTRIBUTION_OWNERSHIP";
}

export interface DispatchHostedBatchCommand
  extends HostedStage3CommandBase {
  readonly commandType: "DISPATCH_BATCH";
}

export interface RunHostedTamperDemonstrationCommand
  extends HostedStage3CommandBase {
  readonly commandType: "RUN_TAMPER_DEMONSTRATION";
}

export interface SubmitHostedDataGovernanceDecisionCommand
  extends HostedStage3CommandBase {
  readonly commandType: "SUBMIT_DATA_GOVERNANCE_DECISION";
  readonly decisionId: "INT_DATA_GOVERNANCE_CLASSIFICATION";
  readonly categoryByItem: Readonly<Record<string, string>>;
}

export interface SubmitHostedRecallScopeDecisionCommand
  extends HostedStage3CommandBase {
  readonly commandType: "SUBMIT_RECALL_SCOPE_DECISION";
  readonly decisionId: "INT_RECALL_SCOPE";
  readonly selectedAssetIds: readonly string[];
}

export interface RequestHostedRecallHandoffCommand
  extends HostedStage3CommandBase {
  readonly commandType: "REQUEST_RECALL_HANDOFF";
}

export interface SubmitHostedRecallTransactionCommand
  extends HostedStage3CommandBase {
  readonly commandType: "SUBMIT_RECALL_TRANSACTION";
}

export interface ResubmitHostedAuthorizedRecallCommand
  extends HostedStage3CommandBase {
  readonly commandType: "RESUBMIT_AUTHORIZED_RECALL";
}

export type HostedStage3Command =
  | InspectStage3EvidenceCommand
  | SubmitHostedStage3DecisionCommand
  | SubmitHostedStage3TransactionCommand
  | CreateHostedCustodyProposalCommand
  | EndorseHostedCustodyProposalCommand
  | CommitHostedCustodyProposalCommand
  | RecordHostedTransportConditionCommand
  | ReceiveHostedBatchCommand
  | PurchaseHostedBatchCommand
  | SubmitHostedDiscrepancyDecisionCommand
  | InvestigateHostedDiscrepancyCommand
  | CreateHostedCorrectionProposalCommand
  | EndorseHostedCorrectionProposalCommand
  | CommitHostedCorrectionProposalCommand
  | TransformHostedBatchCommand
  | SubmitHostedKnowledgeDecisionCommand
  | PackageHostedBatchCommand
  | TransferHostedDistributionOwnershipCommand
  | DispatchHostedBatchCommand
  | RunHostedTamperDemonstrationCommand
  | SubmitHostedDataGovernanceDecisionCommand
  | SubmitHostedRecallScopeDecisionCommand
  | RequestHostedRecallHandoffCommand
  | SubmitHostedRecallTransactionCommand
  | ResubmitHostedAuthorizedRecallCommand;

export interface HostedStage3RunResult {
  readonly state: HostedStage3RunState;
  readonly appendedEventIds: readonly string[];
  readonly wasIdempotentReplay: boolean;
}

export interface InstructorTimelineItem {
  readonly sequenceNumber: number;
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly authenticatedUserId: string;
  readonly simulationActorId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly causationId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface CompetencyEvidenceProjection {
  readonly indicatorId: string;
  readonly evidence: readonly HostedCompetencyEvidence[];
}

export interface RubricEvidenceProjection {
  readonly rubricId: string;
  readonly rubricVersion: string;
  readonly criterionId: string;
  readonly allowedLevelValues: readonly number[];
  readonly evidenceRuleIds: readonly string[];
  readonly observedEvidenceIds: readonly string[];
  readonly status: "observed" | "not-observed";
}
