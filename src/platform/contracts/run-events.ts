import type { JsonObject, JsonValue } from "./json";

export type ApplicationRole =
  | "learner"
  | "instructor"
  | "scenario-author"
  | "administrator"
  | "rater";

export type PlatformRunEventType =
  | "RUN_CREATED"
  | "EVIDENCE_RELEASED"
  | "EVIDENCE_INSPECTED"
  | "POLICY_CONSULTED"
  | "DECISION_SUBMITTED"
  | "TRANSACTION_PROPOSED"
  | "TRANSACTION_COMMITTED"
  | "TRANSACTION_REJECTED"
  | "COMPETENCY_EVIDENCE_RECORDED"
  | "FEEDBACK_RELEASED"
  | "FEEDBACK_VIEWED"
  | "REFLECTION_SUBMITTED"
  | "RUBRIC_RATED"
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
}
