import type { LocalizedText } from "./content";
import type { JsonValue } from "./json";
import type { LearnerRunProjectionV1 } from "./run-events";
import type {
  CounterfactualCausalAttributionV1,
  CounterfactualConditionDefinitionV1,
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
  readonly counterfactualType: "DECISION" | "CONDITION";
  readonly conditionIntervention?: {
    readonly conditionId: string;
    readonly runtimeConditionKey: "COFFEE_CASE_VARIANT";
    readonly originalValueId: string;
    readonly alternativeValueId: string;
    readonly runtimeValue: string;
    readonly affectsInformationBeforeFork: boolean;
  };
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
  readonly conditionIntervention?:
    CounterfactualRunMetadataV1["conditionIntervention"];
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

export interface CounterfactualConditionPointV1 {
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
  readonly originalConditionValueId: string;
  readonly configuration: CounterfactualConditionDefinitionV1;
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
  readonly evaluationStatus: "EVALUATED";
  readonly attribution: CounterfactualCausalAttributionV1;
}

export interface CounterfactualComparisonV1 {
  readonly schemaVersion: "1.0.0";
  readonly interpretation:
    "ORIGINAL_ASSESSED_ALTERNATIVE_EXPLORATORY";
  readonly counterfactualId: string;
  readonly sourceRunId: string;
  readonly counterfactualType: "DECISION" | "CONDITION";
  readonly forkNodeId: string;
  readonly decisionId: string;
  readonly conditionChange?: {
    readonly conditionId: string;
    readonly originalValueId: string;
    readonly alternativeValueId: string;
    readonly affectsInformationBeforeFork: boolean;
  };
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
    readonly attribution: CounterfactualCausalAttributionV1;
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

export interface AssignmentCounterfactualReportSummaryV1 {
  readonly totalBranches: number;
  readonly completedBranches: number;
  readonly reflectedBranches: number;
  readonly decisionBranches: number;
  readonly conditionBranches: number;
  readonly isolatedComparisons: number;
  readonly compoundComparisons: number;
  readonly branchesByForkNode: readonly {
    readonly forkNodeId: string;
    readonly branchCount: number;
  }[];
  readonly averageAcademicScoreDifference: number | null;
  readonly averageProcessScoreDifference: number | null;
}

export interface AssignmentCounterfactualReportV1 {
  readonly schemaVersion: "1.0.0";
  readonly reportType:
    "TRACECHAIN_ASSIGNMENT_COUNTERFACTUAL_REPORT";
  readonly assignmentId: string;
  readonly generatedAt: string;
  readonly summary: AssignmentCounterfactualReportSummaryV1;
  readonly branches:
    readonly AssignmentCounterfactualReportEntryV1[];
}
