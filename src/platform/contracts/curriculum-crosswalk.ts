import type {
  CompetencyTargetType,
} from "./competency";
import type {
  CompetencyFrameworkReferenceV1,
  CompetencyIndicatorReferenceV1,
  LearnerCompetencyRatingV1,
} from "./competency-report";

export type CurriculumOutcomeTypeV2 =
  | "COURSE_LEARNING_OUTCOME"
  | "PROGRAM_LEARNING_OUTCOME"
  | "PERFORMANCE_INDICATOR"
  | "GRADUATE_ATTRIBUTE"
  | "QUALIFICATION_FRAMEWORK_OUTCOME"
  | "DACUM_TASK"
  | "ACCREDITATION_OUTCOME"
  | "OTHER";

export type CurriculumAlignmentStrengthV2 =
  | "PRIMARY"
  | "SUPPORTING"
  | "CONTEXTUAL";

export type CurriculumOverlayOwnerTypeV2 =
  | "INSTITUTION"
  | "PROGRAM"
  | "COURSE";

export type CurriculumOverlayStatusV2 =
  | "DRAFT"
  | "ADOPTED"
  | "RETIRED";

export interface CurriculumLocalizedValuesV2 {
  readonly valuesByLocale: Readonly<Record<string, string>>;
}

export interface CurriculumOverlayOwnerV2 {
  readonly ownerId: string;
  readonly ownerType: CurriculumOverlayOwnerTypeV2;
  readonly displayName: CurriculumLocalizedValuesV2;
}

export interface ExternalCurriculumOutcomeV2 {
  readonly outcomeId: string;
  readonly outcomeType: CurriculumOutcomeTypeV2;
  readonly title: CurriculumLocalizedValuesV2;
}

export interface ExternalCurriculumFrameworkV2 {
  readonly frameworkId: string;
  readonly version: string;
  readonly title: CurriculumLocalizedValuesV2;
  readonly outcomes: readonly ExternalCurriculumOutcomeV2[];
}

export interface CurriculumIndicatorMappingV2 {
  readonly indicatorId: string;
  readonly outcomeIds: readonly string[];
  readonly alignment: CurriculumAlignmentStrengthV2;
  readonly rationale?: CurriculumLocalizedValuesV2;
}

export interface CurriculumCrosswalkOverlayV2 {
  readonly schemaVersion: "2.0.0";
  readonly overlayId: string;
  readonly version: string;
  readonly status: CurriculumOverlayStatusV2;
  readonly owner: CurriculumOverlayOwnerV2;
  readonly educationalDemoOnly: boolean;
  readonly effectiveFrom: string;
  readonly adoptedAt?: string;
  readonly adoptedBy?: string;
  readonly supportedLocales: readonly string[];
  readonly title: CurriculumLocalizedValuesV2;
  readonly simuLedgerFrameworks:
    readonly CompetencyFrameworkReferenceV1[];
  readonly externalFramework: ExternalCurriculumFrameworkV2;
  readonly mappings: readonly CurriculumIndicatorMappingV2[];
}

export interface CurriculumEvidenceObservationLinkV2 {
  readonly runId: string;
  readonly competencyEvidenceId: string;
  readonly evidenceRuleId: string;
  readonly evidenceRuleVersion: string;
  readonly sourceEventIds: readonly string[];
  readonly observedAt: string;
  readonly mappedIndicatorIds: readonly string[];
}

export interface LearnerCurriculumOutcomeEvidenceV2 {
  readonly outcomeId: string;
  readonly mappedIndicatorIds: readonly string[];
  readonly evidenceObservationCount: number;
  readonly currentRatingCount: number;
  readonly evidenceObservations:
    readonly CurriculumEvidenceObservationLinkV2[];
  readonly currentRatings: readonly LearnerCompetencyRatingV1[];
}

export interface LearnerCurriculumOverlayEvidenceV2 {
  readonly learnerUserId: string;
  readonly outcomes: readonly LearnerCurriculumOutcomeEvidenceV2[];
}

export interface ClassCurriculumOutcomeEvidenceV2 {
  readonly outcomeId: string;
  readonly outcomeType: CurriculumOutcomeTypeV2;
  readonly mappedIndicatorIds: readonly string[];
  readonly primaryIndicatorIds: readonly string[];
  readonly supportingIndicatorIds: readonly string[];
  readonly contextualIndicatorIds: readonly string[];
  readonly targetTypes: readonly CompetencyTargetType[];
  readonly assignedLearnerCount: number;
  readonly learnersWithEvidence: number;
  readonly evidenceObservationCount: number;
  readonly currentRatingCount: number;
}

export interface AssignmentCurriculumOverlayV2 {
  readonly overlayId: string;
  readonly overlayVersion: string;
  readonly status: "ADOPTED";
  readonly owner: CurriculumOverlayOwnerV2;
  readonly educationalDemoOnly: boolean;
  readonly effectiveFrom: string;
  readonly adoptedAt: string;
  readonly adoptedBy: string;
  readonly simuLedgerFrameworks:
    readonly CompetencyFrameworkReferenceV1[];
  readonly externalFrameworkId: string;
  readonly externalFrameworkVersion: string;
  readonly labelsByLocale: Readonly<
    Record<
      string,
      {
        readonly title: string;
        readonly ownerDisplayName: string;
        readonly externalFrameworkTitle: string;
        readonly outcomeTitles: Readonly<Record<string, string>>;
      }
    >
  >;
  readonly learners: readonly LearnerCurriculumOverlayEvidenceV2[];
  readonly classOutcomes: readonly ClassCurriculumOutcomeEvidenceV2[];
}

export interface AssignmentCurriculumOverlayReportV2 {
  readonly schemaVersion: "2.0.0";
  readonly interpretation:
    "EVIDENCE_CROSSWALK_NO_ATTAINMENT_INFERENCE";
  readonly assignmentId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly competencyFrameworks:
    readonly CompetencyFrameworkReferenceV1[];
  readonly competencyIndicators:
    readonly CompetencyIndicatorReferenceV1[];
  readonly overlays: readonly AssignmentCurriculumOverlayV2[];
}
