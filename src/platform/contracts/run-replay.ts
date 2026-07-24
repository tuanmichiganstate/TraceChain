import type { LearnerRunProjectionV1 } from "./run-events";

export interface InstructorReplayEventV1 {
  readonly sequenceNumber: number;
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly authenticatedUserId: string;
  readonly simulationActorId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly causationId: string;
  readonly resultingStateHash: string;
}

export interface InstructorRunReplayV1 {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly assignmentId: string;
  readonly learnerUserId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly throughSequenceNumber: number;
  readonly totalEventCount: number;
  readonly selectedEvent: InstructorReplayEventV1;
  readonly projection: LearnerRunProjectionV1;
}
