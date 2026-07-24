export type AssignmentRunMode =
  | "tutorial"
  | "standard"
  | "sandbox"
  | "configured";

export interface HostedAssignmentV1 {
  readonly schemaVersion: "1.0.0";
  readonly assignmentId: string;
  readonly title: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly mode: AssignmentRunMode;
  readonly learnerUserIds: readonly string[];
  readonly status: "active" | "closed";
  readonly feedbackReleaseStatus: "withheld" | "released";
  readonly feedbackReleasedAt?: string;
  readonly feedbackReleasedByUserId?: string;
  readonly createdAt: string;
  readonly createdByUserId: string;
}

export interface CreateHostedAssignmentRequest {
  readonly commandId: string;
  readonly assignmentId: string;
  readonly title: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly mode: AssignmentRunMode;
  readonly learnerUserIds: readonly string[];
}

export interface HostedAssignmentCreationResult {
  readonly assignment: HostedAssignmentV1;
  readonly wasIdempotentReplay: boolean;
}

export interface SaveManualRubricRatingRequest {
  readonly commandId: string;
  readonly runId: string;
  readonly rubricId: string;
  readonly rubricVersion: string;
  readonly criterionId: string;
  readonly levelValue: number;
  readonly comment: string;
  readonly linkedEvidenceIds: readonly string[];
  readonly expectedRevision: number;
}

export interface ManualRubricRatingV1 {
  readonly schemaVersion: "1.0.0";
  readonly ratingId: string;
  readonly assignmentId: string;
  readonly runId: string;
  readonly rubricId: string;
  readonly rubricVersion: string;
  readonly criterionId: string;
  readonly levelValue: number;
  readonly comment: string;
  readonly linkedEvidenceIds: readonly string[];
  readonly revision: number;
  readonly raterUserId: string;
  readonly ratedAt: string;
}

export interface ManualRubricRatingResult {
  readonly rating: ManualRubricRatingV1;
  readonly wasIdempotentReplay: boolean;
}

export interface HostedAssignmentRunSummary {
  readonly runId: string;
  readonly learnerUserId: string;
  readonly status: "active" | "completed";
  readonly eventCount: number;
  readonly ratings: readonly ManualRubricRatingV1[];
}

export interface HostedAssignmentLearnerReport {
  readonly learnerUserId: string;
  readonly runs: readonly HostedAssignmentRunSummary[];
}

export interface HostedAssignmentReportV1 {
  readonly schemaVersion: "1.0.0";
  readonly assignment: HostedAssignmentV1;
  readonly learners: readonly HostedAssignmentLearnerReport[];
}
