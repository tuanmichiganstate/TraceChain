import type {
  HostedAssignmentV1,
  ManualRubricRatingV1,
  RubricModerationResolutionV1,
} from "./assessment";
import type { RunEventV1 } from "./run-events";

export interface AssignmentExportParticipantV1 {
  readonly assignmentId: string;
  readonly learnerUserId: string;
}

export interface AssignmentExportRunV1 {
  readonly assignmentId: string;
  readonly runId: string;
  readonly learnerUserId: string;
  readonly status: "active" | "completed";
  readonly eventCount: number;
}

export interface ExportFieldDefinitionV1 {
  readonly name: string;
  readonly type: "string" | "integer" | "object" | "array";
  readonly required: boolean;
  readonly description: string;
}

export interface ExportDatasetDefinitionV1 {
  readonly id:
    | "assignment"
    | "participants"
    | "runs"
    | "events"
    | "ratingRevisions"
    | "moderationResolutions";
  readonly description: string;
  readonly fields: readonly ExportFieldDefinitionV1[];
}

export interface AssignmentExportDataDictionaryV1 {
  readonly schemaVersion: "1.0.0";
  readonly csvLayout: "TRACECHAIN_ASSIGNMENT_EVIDENCE_FLAT_V1";
  readonly datasets: readonly ExportDatasetDefinitionV1[];
}

export interface AssignmentEvidenceExportV1 {
  readonly schemaVersion: "1.0.0";
  readonly exportType: "TRACECHAIN_ASSIGNMENT_EVIDENCE";
  readonly generatedAt: string;
  readonly assignment: HostedAssignmentV1;
  readonly participants: readonly AssignmentExportParticipantV1[];
  readonly runs: readonly AssignmentExportRunV1[];
  readonly events: readonly RunEventV1[];
  readonly ratingRevisions: readonly ManualRubricRatingV1[];
  readonly moderationResolutions:
    readonly RubricModerationResolutionV1[];
  readonly dataDictionary: AssignmentExportDataDictionaryV1;
}
