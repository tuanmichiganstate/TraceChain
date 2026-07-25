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
  readonly runConfiguration: HostedRunModeConfigurationV1;
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
  readonly runConfiguration: HostedRunModeConfigurationV1;
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

export interface SaveRubricModerationRequest {
  readonly commandId: string;
  readonly runId: string;
  readonly rubricId: string;
  readonly rubricVersion: string;
  readonly criterionId: string;
  readonly levelValue: number;
  readonly comment: string;
  readonly sourceRatingIds: readonly string[];
  readonly expectedRevision: number;
}

/**
 * Append-only instructor resolution of one or more manual ratings.
 *
 * A resolution is assessment evidence only. It never mutates the learner's
 * simulation events, academic simulation score, or realized outcome.
 */
export interface RubricModerationResolutionV1 {
  readonly schemaVersion: "1.0.0";
  readonly resolutionId: string;
  readonly assignmentId: string;
  readonly runId: string;
  readonly rubricId: string;
  readonly rubricVersion: string;
  readonly criterionId: string;
  readonly levelValue: number;
  readonly comment: string;
  readonly sourceRatingIds: readonly string[];
  readonly revision: number;
  readonly moderatorUserId: string;
  readonly resolvedAt: string;
}

export interface RubricModerationResult {
  readonly resolution: RubricModerationResolutionV1;
  readonly wasIdempotentReplay: boolean;
}

export interface HostedRunActivitySummaryV1 {
  readonly evidenceInspectionCount: number;
  readonly policyConsultationCount: number;
  readonly citedEvidenceCount: number;
  readonly decisionAttemptCount: number;
  readonly rejectedAttemptCount: number;
  readonly mitigationCount: number;
  readonly rejectionFindings: readonly {
    readonly findingCode: string;
    readonly count: number;
  }[];
}

export interface HostedAssignmentRunSummary {
  readonly runId: string;
  readonly learnerUserId: string;
  readonly status: "active" | "completed";
  readonly eventCount: number;
  readonly startedAt: string;
  readonly lastActivityAt: string;
  readonly completedAt: string | null;
  readonly elapsedSeconds: number;
  readonly activity: HostedRunActivitySummaryV1;
  readonly ratings: readonly ManualRubricRatingV1[];
  readonly moderationResolutions:
    readonly RubricModerationResolutionV1[];
}

export interface HostedAssignmentLearnerReport {
  readonly learnerUserId: string;
  readonly runs: readonly HostedAssignmentRunSummary[];
}

export interface HostedAssignmentReportV1 {
  readonly schemaVersion: "1.3.0";
  readonly assignment: HostedAssignmentV1;
  readonly learners: readonly HostedAssignmentLearnerReport[];
}

export interface HostedRunMonitorStatusV1 {
  readonly runId: string;
  readonly learnerUserId: string;
  readonly status: "active" | "completed";
  readonly eventCount: number;
  readonly currentStageId: string;
  readonly activeRoleId: string;
  readonly elapsedSeconds: number;
  readonly lastActivityAt: string;
  readonly pendingActionIds: readonly string[];
  readonly technicalStatus: "ok";
}

export interface HostedRunMonitorErrorV1 {
  readonly runId: string;
  readonly learnerUserId: string;
  readonly status: "active" | "completed";
  readonly eventCount: number;
  readonly currentStageId: null;
  readonly activeRoleId: null;
  readonly elapsedSeconds: null;
  readonly lastActivityAt: null;
  readonly pendingActionIds: readonly [];
  readonly technicalStatus: "error";
}

export type HostedRunMonitorV1 =
  | HostedRunMonitorStatusV1
  | HostedRunMonitorErrorV1;

export interface HostedAssignmentLearnerMonitorV1 {
  readonly learnerUserId: string;
  readonly runs: readonly HostedRunMonitorV1[];
}

export interface HostedAssignmentMonitorV1 {
  readonly schemaVersion: "1.0.0";
  readonly assignmentId: string;
  readonly generatedAt: string;
  readonly learners: readonly HostedAssignmentLearnerMonitorV1[];
}

export interface HostedLearnerAssignmentV1 {
  readonly assignment: HostedAssignmentV1;
  readonly runs: readonly HostedAssignmentRunSummary[];
}
import type { HostedRunModeConfigurationV1 } from "./scenario-pack";
