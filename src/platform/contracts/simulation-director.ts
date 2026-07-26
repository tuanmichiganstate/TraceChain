import type {
  LearnerRunLocalizedTextV1,
} from "./run-events";

export interface ReleaseInstructorIncidentCommandV1 {
  readonly commandId: string;
  readonly runId: string;
  readonly expectedRunVersion: number;
  readonly incidentId: string;
}

export interface InstructorIncidentStatusV1 {
  readonly schemaVersion: "1.0.0";
  readonly incidentId: string;
  readonly version: string;
  readonly title: LearnerRunLocalizedTextV1;
  readonly message: LearnerRunLocalizedTextV1;
  readonly status: "available" | "released" | "unavailable";
  readonly releasedAt?: string;
  readonly releasedByUserId?: string;
}

export interface InstructorIncidentControlV1 {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly runVersion: number;
  readonly incidents: readonly InstructorIncidentStatusV1[];
}
