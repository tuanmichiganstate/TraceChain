import type { TrustedExecutionContext } from "../../domain/simulation/types";
import type { JsonObject } from "../contracts/json";
import type {
  HostedRunMode,
  HostedRunModeConfigurationV1,
} from "../contracts/scenario-pack";
import type { StochasticOutcomeResolutionV1 } from "../runs/stochastic-outcomes";
import type { HostedCompetencyEvidence } from "./stage3-types";
import type { TraceChainExperienceConfigurationV2 } from "../../config/types";

export interface GenericDecisionSubmission {
  readonly decisionId: string;
  readonly responses: Readonly<
    Record<string, readonly string[]>
  >;
  readonly justification: string;
  readonly citedEvidenceIds: readonly string[];
  readonly citedPolicyIds: readonly string[];
  readonly confidenceRating: number | null;
  readonly adverseEventProbabilityPercent: number | null;
  readonly submittedAt: string;
}

export interface GenericEvidenceRequestRecord {
  readonly evidenceId: string;
  readonly requestEventId: string;
  readonly requestSequenceNumber: number;
  readonly requestCommandId: string;
  readonly requestedAt: string;
  readonly simulatedAvailableAt: string;
  readonly delayMinutes: number;
  readonly costUnits: number;
  readonly permissionPolicyId?: string;
}

export interface GenericTransactionProposalRecord {
  readonly proposalNodeId: string;
  readonly proposalId: string;
  readonly proposalType: string;
  readonly sourceDecisionId: string;
  readonly policyIds: readonly string[];
  readonly sourceDecisionHash: string;
  readonly proposalDigest: string;
  readonly expectedRunVersion: number;
  readonly proposedAt: string;
  readonly organizationId: string;
  readonly roleId: string;
}

export interface GenericEndorsementRecord {
  readonly endorsementNodeId: string;
  readonly proposalNodeId: string;
  readonly proposalId: string;
  readonly proposalDigest: string;
  readonly policyId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly endorsedAt: string;
  /**
   * Generic authored packs record an organizational approval. They do not
   * claim a cryptographic signature unless a native runtime supplies one.
   */
  readonly assurance: "SCENARIO_APPROVAL_RECORD";
}

export interface GenericPolicyEvaluationRecord {
  readonly policyCheckNodeId: string;
  readonly policyId: string;
  readonly proposalNodeId: string;
  readonly outcome: "pass" | "fail";
  readonly reasonCodes: readonly string[];
  readonly evaluatedAt: string;
}

export interface GenericCommunicationRecord {
  readonly communicationNodeId: string;
  readonly messageId: string;
  readonly visibleToRoleIds: readonly string[];
  readonly acknowledgedAt: string;
  readonly acknowledgedByRoleId: string;
}

export interface GenericStochasticEventRecord {
  readonly stochasticNodeId: string;
  readonly outcomeId: string;
  readonly resultCode: string;
  readonly resolution: StochasticOutcomeResolutionV1;
  readonly resolvedAt: string;
}

export interface GenericReflectionSubmission {
  readonly reflectionId: string;
  readonly response: string;
  readonly submittedAt: string;
}

export interface GenericHostedRunState {
  readonly schemaVersion: "2.0.0";
  readonly runtimeKind: "generic-v1";
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
  readonly experienceConfiguration:
    TraceChainExperienceConfigurationV2;
  readonly experienceConfigurationHash: string;
  readonly scenarioSeed: string;
  readonly outcomeResolution: StochasticOutcomeResolutionV1 | null;
  readonly activeTrustedContext: TrustedExecutionContext;
  readonly version: number;
  readonly status: "active" | "completed";
  readonly actualState: JsonObject;
  readonly businessState: JsonObject;
  readonly ledgerState: JsonObject;
  readonly releasedEvidenceIds: readonly string[];
  readonly inspectedEvidenceIds: readonly string[];
  readonly consultedPolicyIds: readonly string[];
  readonly evidenceRequests:
    readonly GenericEvidenceRequestRecord[];
  readonly releasedInstructorIncidents: readonly {
    readonly incidentId: string;
    readonly releasedAt: string;
    readonly releasedByUserId: string;
  }[];
  readonly decisions: Readonly<
    Record<string, GenericDecisionSubmission>
  >;
  readonly transactionProposals: Readonly<
    Record<string, GenericTransactionProposalRecord>
  >;
  readonly endorsements: Readonly<
    Record<string, GenericEndorsementRecord>
  >;
  readonly policyEvaluations:
    readonly GenericPolicyEvaluationRecord[];
  readonly communications: Readonly<
    Record<string, GenericCommunicationRecord>
  >;
  readonly stochasticEvents: Readonly<
    Record<string, GenericStochasticEventRecord>
  >;
  readonly reflections: Readonly<
    Record<string, GenericReflectionSubmission>
  >;
  readonly occurredEventTypes: readonly string[];
  readonly competencyEvidence: readonly HostedCompetencyEvidence[];
  readonly workflowState: {
    readonly currentNodeId: string;
    readonly completedNodeIds: readonly string[];
    readonly permittedActionIdsByRole: Readonly<
      Record<string, readonly string[]>
    >;
  };
  readonly rngState: {
    readonly seed: string;
    readonly streamPosition: number;
    readonly recordedDraws: readonly number[];
  };
}

export interface CreateGenericHostedRunRequest {
  readonly commandId: string;
  readonly runId: string;
  readonly assignmentId: string;
  readonly learnerUserId: string;
  readonly mode: HostedRunMode;
  readonly modeConfiguration?: HostedRunModeConfigurationV1;
  readonly scenarioSeed?: string;
}

interface GenericHostedCommandBase {
  readonly commandId: string;
  readonly runId: string;
  readonly expectedRunVersion: number;
}

export interface AdvanceGenericWorkflowCommand
  extends GenericHostedCommandBase {
  readonly commandType: "ADVANCE_WORKFLOW";
}

export interface InspectGenericEvidenceCommand
  extends GenericHostedCommandBase {
  readonly commandType: "INSPECT_EVIDENCE";
  readonly evidenceId: string;
}

export interface RequestGenericEvidenceCommand
  extends GenericHostedCommandBase {
  readonly commandType: "REQUEST_EVIDENCE";
  readonly evidenceId: string;
}

export interface ConsultGenericPolicyCommand
  extends GenericHostedCommandBase {
  readonly commandType: "CONSULT_POLICY";
  readonly policyId: string;
}

export interface SubmitGenericDecisionCommand
  extends GenericHostedCommandBase {
  readonly commandType: "SUBMIT_STRUCTURED_DECISION";
  readonly decisionId: string;
  readonly responses: Readonly<
    Record<string, readonly string[]>
  >;
  readonly justification?: string;
  readonly citedEvidenceIds?: readonly string[];
  readonly citedPolicyIds?: readonly string[];
  readonly confidenceRating?: number;
  readonly adverseEventProbabilityPercent?: number;
}

export interface CreateGenericTransactionProposalCommand
  extends GenericHostedCommandBase {
  readonly commandType: "CREATE_TRANSACTION_PROPOSAL";
}

export interface RecordGenericEndorsementCommand
  extends GenericHostedCommandBase {
  readonly commandType: "RECORD_ENDORSEMENT";
}

export interface AcknowledgeGenericCommunicationCommand
  extends GenericHostedCommandBase {
  readonly commandType: "ACKNOWLEDGE_COMMUNICATION";
}

export interface SubmitGenericReflectionCommand
  extends GenericHostedCommandBase {
  readonly commandType: "SUBMIT_REFLECTION";
  readonly reflectionId: string;
  readonly response: string;
}

export type GenericHostedCommand =
  | AdvanceGenericWorkflowCommand
  | InspectGenericEvidenceCommand
  | RequestGenericEvidenceCommand
  | ConsultGenericPolicyCommand
  | SubmitGenericDecisionCommand
  | CreateGenericTransactionProposalCommand
  | RecordGenericEndorsementCommand
  | AcknowledgeGenericCommunicationCommand
  | SubmitGenericReflectionCommand;

export interface GenericHostedRunResult {
  readonly state: GenericHostedRunState;
  readonly appendedEventIds: readonly string[];
  readonly wasIdempotentReplay: boolean;
}
