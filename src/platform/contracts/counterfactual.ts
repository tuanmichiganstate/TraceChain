import type { LocalizedText } from "./content";
import type { JsonValue } from "./json";
import type { LearnerRunProjectionV1 } from "./run-events";
import type {
  CounterfactualDecisionDefinitionV1,
  DecisionFieldV1,
} from "./scenario-pack";

export type CounterfactualComparisonModeV1 =
  | "SINGLE_INTERVENTION"
  | "EXPLORATORY_BRANCH";

export interface CounterfactualRunMetadataV1 {
  readonly schemaVersion: "1.0.0";
  readonly branchRunId: string;
  readonly sourceRunId: string;
  readonly forkSequenceNumber: number;
  readonly forkNodeId: string;
  readonly forkActorId: string;
  readonly forkOrganizationId: string;
  readonly forkRoleId: string;
  readonly sourcePackId: string;
  readonly sourcePackVersion: string;
  readonly sourceScenarioId: string;
  readonly sourceScenarioVersion: string;
  readonly sourceConfigurationHash: string;
  readonly sourceSeed: string;
  readonly sourceStateHash: string;
  readonly sourceInformationStateHash: string;
  readonly counterfactualType: "DECISION";
  readonly interventionId: string;
  readonly comparisonMode: CounterfactualComparisonModeV1;
  readonly createdByUserId: string;
  readonly createdAt: string;
}

export interface CreateCounterfactualBranchRequestV1 {
  readonly branchRunId: string;
  readonly sourceRunId: string;
  readonly forkSequenceNumber: number;
  readonly forkNodeId: string;
  readonly interventionId: string;
  readonly comparisonMode: CounterfactualComparisonModeV1;
  readonly createdByUserId: string;
  readonly createdAt: string;
}

export interface CounterfactualDecisionPointV1 {
  readonly schemaVersion: "1.0.0";
  readonly sourceRunId: string;
  readonly forkSequenceNumber: number;
  readonly forkNodeId: string;
  readonly decisionId: string;
  readonly originalDecisionEventId: string;
  readonly originalOptionIds: readonly string[];
  readonly actorId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly title: LocalizedText;
  readonly fields: readonly DecisionFieldV1[];
  readonly configuration: CounterfactualDecisionDefinitionV1;
}

export interface CounterfactualReflectionResponseV1 {
  readonly evidenceThatMattered: string;
  readonly reasonForDifference: string;
  readonly foreseeableConsequences: string;
  readonly laterInformation: string;
  readonly revisedDecisionRule: string;
}

export interface CounterfactualReflectionV1 {
  readonly schemaVersion: "1.0.0";
  readonly reflectionId: string;
  readonly branchRunId: string;
  readonly response: CounterfactualReflectionResponseV1;
  readonly submittedByUserId: string;
  readonly submittedAt: string;
}

export interface CounterfactualTimelineItemV1 {
  readonly sequenceNumber: number;
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly causationId: string;
}

export interface CounterfactualComparisonDimensionResultV1 {
  readonly dimensionId: string;
  readonly title: LocalizedText;
  readonly description: LocalizedText;
  readonly originalValue: JsonValue | null;
  readonly alternativeValue: JsonValue | null;
  readonly difference: JsonValue | null;
  readonly evaluationStatus:
    "AWAITING_AUTHORED_EVALUATION_RULE";
}

export interface CounterfactualComparisonV1 {
  readonly schemaVersion: "1.0.0";
  readonly interpretation:
    "ORIGINAL_ASSESSED_ALTERNATIVE_EXPLORATORY";
  readonly counterfactualId: string;
  readonly sourceRunId: string;
  readonly forkNodeId: string;
  readonly decisionId: string;
  readonly classification: CounterfactualComparisonModeV1;
  readonly hindsightLimitation:
    "REFLECTIVE_EXPLORATION_AFTER_COMPLETED_ATTEMPT";
  readonly originalAssessedResult: {
    readonly decision: JsonValue | null;
    readonly officialGradePreserved: true;
    readonly projection: LearnerRunProjectionV1;
  };
  readonly alternativeExploratoryResult: {
    readonly decision: JsonValue | null;
    readonly officialGradeChanged: false;
    readonly projection: LearnerRunProjectionV1;
  };
  readonly informationAvailableWhenDecisionWasMade:
    LearnerRunProjectionV1["informationState"];
  readonly informationRevealedLaterRecordIds:
    readonly string[];
  readonly timelines: {
    readonly original: readonly CounterfactualTimelineItemV1[];
    readonly alternative:
      readonly CounterfactualTimelineItemV1[];
  };
  readonly differences: {
    readonly changedBusinessRecordIds: readonly string[];
    readonly ledgerChanged: boolean;
    readonly workflowNodeChanged: boolean;
    readonly attribution:
      | "DOWNSTREAM_STATE_EFFECT"
      | "NOT_ATTRIBUTABLE"
      | "UNCHANGED";
  };
  readonly dimensions:
    readonly CounterfactualComparisonDimensionResultV1[];
}

export interface CounterfactualComparisonExportV1 {
  readonly schemaVersion: "1.0.0";
  readonly exportType: "TRACECHAIN_COUNTERFACTUAL_COMPARISON";
  readonly generatedAt: string;
  readonly metadata: CounterfactualRunMetadataV1;
  readonly comparison: CounterfactualComparisonV1;
  readonly reflection: CounterfactualReflectionV1 | null;
}

export interface AssignmentCounterfactualReportEntryV1 {
  readonly learnerUserId: string;
  readonly metadata: CounterfactualRunMetadataV1;
  readonly branchStatus:
    | "CREATED"
    | "IN_PROGRESS"
    | "COMPLETED";
  readonly comparison: CounterfactualComparisonV1 | null;
  readonly reflection: CounterfactualReflectionV1 | null;
  readonly originalOfficialGradeChanged: false;
}

export interface AssignmentCounterfactualReportV1 {
  readonly schemaVersion: "1.0.0";
  readonly reportType:
    "TRACECHAIN_ASSIGNMENT_COUNTERFACTUAL_REPORT";
  readonly assignmentId: string;
  readonly generatedAt: string;
  readonly branches:
    readonly AssignmentCounterfactualReportEntryV1[];
}
