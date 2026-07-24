import type {
  SubmitCertificateDecisionCommand,
  SimulationRuntimeState,
  TrustedExecutionContext,
} from "../../domain/simulation/types";
import type { HostedRunMode } from "../contracts/scenario-pack";

export type Stage3CaseVariant =
  | "authorized-certifier"
  | "unauthorized-transporter";

export type Stage3WorkflowStep =
  | "certificate-evidence"
  | "certificate-decision"
  | "certificate-transaction"
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
  readonly scenarioSeed: string;
  readonly caseVariant: Stage3CaseVariant;
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
  readonly competencyEvidence: readonly HostedCompetencyEvidence[];
  readonly simulation: SimulationRuntimeState;
}

export interface CreateHostedStage3RunRequest {
  readonly commandId: string;
  readonly runId: string;
  readonly assignmentId: string;
  readonly learnerUserId: string;
  readonly mode: HostedRunMode;
  readonly scenarioSeed: string;
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

export type HostedStage3Command =
  | InspectStage3EvidenceCommand
  | SubmitHostedStage3DecisionCommand
  | SubmitHostedStage3TransactionCommand;

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
  readonly criterionId: string;
  readonly evidenceRuleIds: readonly string[];
  readonly observedEvidenceIds: readonly string[];
  readonly status: "observed" | "not-observed";
}
