import type {
  HostedAssignmentV1,
  HostedRunActivitySummaryV1,
  ManualRubricRatingV1,
  RubricModerationResolutionV1,
} from "./assessment";
import type { RunEventV1 } from "./run-events";

export type AssignmentExportIdentityMode =
  | "identified"
  | "pseudonymous";

export interface AssignmentExportParticipantV1 {
  readonly assignmentId: string;
  readonly learnerUserId: string;
  readonly researchParticipantId?: string;
}

export interface AssignmentExportRunV1 {
  readonly assignmentId: string;
  readonly runId: string;
  readonly learnerUserId: string;
  readonly status: "active" | "completed";
  readonly eventCount: number;
  readonly startedAt: string;
  readonly lastActivityAt: string;
  readonly completedAt: string | null;
  readonly elapsedSeconds: number;
  readonly activity: HostedRunActivitySummaryV1;
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
  readonly schemaVersion: "1.5.0";
  readonly csvLayout: "TRACECHAIN_ASSIGNMENT_EVIDENCE_FLAT_V1";
  readonly datasets: readonly ExportDatasetDefinitionV1[];
}

export interface AssignmentEvidenceExportV1 {
  readonly schemaVersion: "1.5.0";
  readonly exportType: "TRACECHAIN_ASSIGNMENT_EVIDENCE";
  readonly identityMode: AssignmentExportIdentityMode;
  readonly researchMetadata:
    | null
    | {
        readonly experimentalConditionId: string;
        readonly randomAssignmentRecordId: string;
        readonly fixedScenarioSeed: string;
        readonly consentStatusReference: string;
        readonly preTestLinkageId?: string;
        readonly postTestLinkageId?: string;
        readonly blindedRaters: boolean;
        readonly interventionVersion: string;
        readonly retentionPolicyReference: string;
        readonly deidentified: boolean;
      };
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
