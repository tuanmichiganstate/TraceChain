import type { JsonObject, JsonValue } from "./json";
import type {
  HostedRunModeConfigurationV1,
  StructuredDecisionResponseConfigurationV1,
} from "./scenario-pack";
import type { AuditLearnerProjectionV1 } from "./audit";

export type ApplicationRole =
  | "learner"
  | "instructor"
  | "scenario-author"
  | "administrator"
  | "rater";

export type PlatformRunEventType =
  | "RUN_CREATED"
  | "RANDOM_DRAW_MADE"
  | "OUTCOME_REALIZED"
  | "INSTRUCTOR_INCIDENT_RELEASED"
  | "EVIDENCE_REQUESTED"
  | "EVIDENCE_RELEASED"
  | "EVIDENCE_INSPECTED"
  | "POLICY_CONSULTED"
  | "DECISION_SUBMITTED"
  | "DECISION_REJECTED"
  | "MITIGATION_RECORDED"
  | "TRANSACTION_PROPOSED"
  | "ENDORSEMENT_PROPOSAL_CREATED"
  | "ENDORSEMENT_PROPOSAL_REJECTED"
  | "ENDORSEMENT_RECORDED"
  | "ENDORSEMENT_REJECTED"
  | "ENDORSED_TRANSACTION_COMMITTED"
  | "ENDORSED_TRANSACTION_REJECTED"
  | "TRANSACTION_COMMITTED"
  | "TRANSACTION_REJECTED"
  | "POLICY_EVALUATED"
  | "COMMUNICATION_ACKNOWLEDGED"
  | "STOCHASTIC_EVENT_RESOLVED"
  | "WORKFLOW_ADVANCED"
  | "COMPETENCY_EVIDENCE_RECORDED"
  | "FEEDBACK_RELEASED"
  | "FEEDBACK_VIEWED"
  | "REFLECTION_SUBMITTED"
  | "RUBRIC_RATED"
  | "AUDIT_CASE_OPENED"
  | "AUDIT_SCOPE_VIEWED"
  | "AUDIT_EVIDENCE_INSPECTED"
  | "AUDIT_EVIDENCE_BOOKMARKED"
  | "AUDIT_HINT_VIEWED"
  | "AUDIT_SOURCE_RECORD_INSPECTED"
  | "AUDIT_FINDING_DRAFT_SAVED"
  | "AUDIT_FINDING_SUBMITTED"
  | "AUDIT_FINDING_AMENDED"
  | "AUDIT_FINDING_WITHDRAWN"
  | "AUDIT_CONCLUSION_SUBMITTED"
  | "AUDIT_FEEDBACK_VIEWED"
  | "TECHNICAL_LAB_ACTION_PERFORMED"
  | "TECHNICAL_LAB_RESPONSE_SUBMITTED"
  | "TECHNICAL_LAB_HINT_OPENED"
  | "TECHNICAL_LAB_MODULE_ADVANCED"
  | "RUN_TIME_LIMIT_EXCEEDED"
  | "RUN_COMPLETED";

export interface UnsequencedRunEventV1 {
  readonly eventId: string;
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly serverTimestampUtc: string;
  readonly clientTimestamp?: string;
  readonly authenticatedUserId: string;
  readonly simulationActorId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly eventType: PlatformRunEventType;
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly payload: JsonObject;
  readonly causationId: string;
  readonly correlationId: string;
  readonly previousStateHash: string;
  readonly resultingStateHash: string;
}

export interface RunEventV1 extends UnsequencedRunEventV1 {
  readonly schemaVersion: "1.0.0";
  readonly sequenceNumber: number;
}

export interface VisibleStateRecordV1 {
  readonly recordId: string;
  readonly visibleToRoleIds: readonly string[];
  readonly value: JsonValue;
}

export interface HostedRunStateV1 {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly version: number;
  readonly actualState: JsonObject;
  readonly businessState: readonly VisibleStateRecordV1[];
  readonly ledgerState: JsonObject;
  readonly informationState: readonly VisibleStateRecordV1[];
  readonly policyState: readonly VisibleStateRecordV1[];
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

export interface LearnerRunProjectionV1 {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly version: number;
  readonly roleId: string;
  readonly staffProfile?: LearnerRunStaffProfileV1 | undefined;
  readonly businessState: readonly {
    readonly recordId: string;
    readonly value: JsonValue;
  }[];
  readonly ledgerState: JsonObject;
  readonly informationState: readonly {
    readonly recordId: string;
    readonly value: JsonValue;
  }[];
  readonly policyState: readonly {
    readonly recordId: string;
    readonly value: JsonValue;
  }[];
  readonly workflowState: {
    readonly currentNodeId: string;
    readonly completedNodeIds: readonly string[];
    readonly permittedActionIds: readonly string[];
  };
  readonly timing?: {
    readonly status:
      | "unlimited"
      | "active"
      | "expired"
      | "completed";
    readonly startedAt: string;
    readonly observedAt: string;
    readonly deadline?: string;
    readonly timeLimitMinutes?: number;
  };
  readonly presentation?: LearnerRunPresentationV1;
  readonly audit?: AuditLearnerProjectionV1;
  readonly technicalLab?: HostedTechnicalLabProjectionV1;
}

export interface HostedTechnicalLabProjectionV1 {
  readonly schemaVersion: "1.0.0";
  readonly configurationHash: string;
  readonly labPackId: string;
  readonly labPackVersion: string;
  readonly locale: "vi" | "en";
  readonly replay: import("../../technical-lab/engine").TechnicalLabReplay;
}

export interface LearnerRunLocalizedTextV1 {
  readonly localizationKey: string;
  readonly valuesByLocale: Readonly<Record<string, string>>;
}

export interface LearnerRunStaffProfileV1 {
  readonly staffProfileId: string;
  readonly displayName: LearnerRunLocalizedTextV1;
  readonly roleTitle: LearnerRunLocalizedTextV1;
  readonly organizationName: LearnerRunLocalizedTextV1;
  readonly portraitPath: string;
  readonly portraitAlt: LearnerRunLocalizedTextV1;
  readonly shortProfile?: LearnerRunLocalizedTextV1;
  readonly professionalResponsibility?: LearnerRunLocalizedTextV1;
  readonly fictional: true;
}

export interface LearnerRunDecisionOptionV1 {
  readonly optionId: string;
  readonly label: LearnerRunLocalizedTextV1;
}

export interface LearnerRunDecisionFieldV1 {
  readonly fieldId: string;
  readonly prompt: LearnerRunLocalizedTextV1;
  readonly selection: "single" | "multiple";
  readonly options: readonly LearnerRunDecisionOptionV1[];
}

export interface LearnerRunNodePresentationV1 {
  readonly nodeId: string;
  readonly nodeType:
    | "BRIEFING"
    | "EVIDENCE_RELEASE"
    | "DECISION"
    | "TRANSACTION_PROPOSAL"
    | "ENDORSEMENT"
    | "POLICY_CHECK"
    | "COMMUNICATION"
    | "STOCHASTIC_EVENT"
    | "CONSEQUENCE"
    | "FEEDBACK"
    | "REFLECTION"
    | "COMPLETION";
  readonly title: LearnerRunLocalizedTextV1;
  readonly body?: LearnerRunLocalizedTextV1;
  readonly decisionId?: string;
  readonly prompt?: LearnerRunLocalizedTextV1;
  readonly fields?: readonly LearnerRunDecisionFieldV1[];
  readonly justification?: {
    readonly required: boolean;
    readonly maximumLength: number;
  };
  readonly structuredResponse?:
    StructuredDecisionResponseConfigurationV1;
  readonly proposalType?: string;
  readonly sourceDecisionId?: string;
  readonly policyIds?: readonly string[];
  readonly proposalNodeId?: string;
  readonly policyId?: string;
  readonly permittedRoleIds?: readonly string[];
  readonly messageId?: string;
  readonly visibleToRoleIds?: readonly string[];
  readonly randomStreamId?: string;
  readonly reflectionId?: string;
  readonly maximumLength?: number;
  readonly consequenceCode?: string;
  readonly feedbackCode?: string;
  readonly message?: LearnerRunLocalizedTextV1;
}

export interface LearnerRunAuthoredFeedbackV1 {
  readonly feedbackCode: string;
  readonly title: LearnerRunLocalizedTextV1;
  readonly message: LearnerRunLocalizedTextV1;
}

export interface LearnerRunEvidenceRequestV1 {
  readonly evidenceId: string;
  readonly status: "REQUESTABLE" | "FULFILLED";
  readonly learnerMetadata: JsonObject;
  readonly requestedAt?: string;
  readonly simulatedAvailableAt?: string;
  readonly delayMinutes: number;
  readonly costUnits: number;
}

export type LearnerRunPolicyReferenceV1 =
  | {
      readonly policyId: string;
      readonly status: "AVAILABLE";
    }
  | {
      readonly policyId: string;
      readonly status: "CONSULTED";
      readonly learnerStatement: LearnerRunLocalizedTextV1;
    };

export interface LearnerRunPresentationV1 {
  readonly scenarioTitle: LearnerRunLocalizedTextV1;
  readonly roleName: LearnerRunLocalizedTextV1;
  readonly currentNode: LearnerRunNodePresentationV1;
  readonly evidenceTitles: Readonly<
    Record<string, LearnerRunLocalizedTextV1>
  >;
  readonly evidenceRequests?:
    readonly LearnerRunEvidenceRequestV1[];
  readonly policyTitles: Readonly<
    Record<string, LearnerRunLocalizedTextV1>
  >;
  readonly policyReferences?:
    readonly LearnerRunPolicyReferenceV1[];
  readonly instructorIncidents: readonly {
    readonly incidentId: string;
    readonly title: LearnerRunLocalizedTextV1;
    readonly message: LearnerRunLocalizedTextV1;
    readonly releasedAt: string;
  }[];
  readonly professionalConsequences: readonly {
    readonly dimensionId: string;
    readonly title: LearnerRunLocalizedTextV1;
    readonly description: LearnerRunLocalizedTextV1;
    readonly value: number;
    readonly unit?: string;
    readonly direction:
      | "HIGHER_IS_BETTER"
      | "LOWER_IS_BETTER"
      | "CONTEXT_DEPENDENT";
    readonly diagnosticOnly: true;
  }[];
  readonly modeConfiguration: HostedRunModeConfigurationV1;
}
