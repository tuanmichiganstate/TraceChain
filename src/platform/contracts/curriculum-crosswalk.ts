import type {
  CompetencyTargetType,
} from "./competency";
import type {
  LocalizedText,
  VersionLifecycleStatus,
} from "./content";

export type CurriculumOutcomeTypeV1 =
  | "COURSE_LEARNING_OUTCOME"
  | "PROGRAM_LEARNING_OUTCOME"
  | "PERFORMANCE_INDICATOR"
  | "GRADUATE_ATTRIBUTE"
  | "QUALIFICATION_FRAMEWORK_OUTCOME"
  | "DACUM_TASK"
  | "ACCREDITATION_OUTCOME"
  | "OTHER";

export type CurriculumAlignmentStrengthV1 =
  | "PRIMARY"
  | "SUPPORTING";

export interface ExternalCurriculumOutcomeV1 {
  readonly outcomeId: string;
  readonly outcomeType: CurriculumOutcomeTypeV1;
  readonly title: LocalizedText;
}

export interface ExternalCurriculumFrameworkV1 {
  readonly frameworkId: string;
  readonly version: string;
  readonly title: LocalizedText;
  readonly outcomes: readonly ExternalCurriculumOutcomeV1[];
}

export interface CurriculumIndicatorMappingV1 {
  readonly indicatorId: string;
  readonly outcomeIds: readonly string[];
  readonly alignment: CurriculumAlignmentStrengthV1;
  readonly rationale?: LocalizedText;
}

export interface CurriculumCrosswalkV1 {
  readonly schemaVersion: "1.0.0";
  readonly crosswalkId: string;
  readonly version: string;
  readonly status: VersionLifecycleStatus;
  readonly effectiveFrom: string;
  readonly title: LocalizedText;
  readonly externalFramework: ExternalCurriculumFrameworkV1;
  readonly mappings: readonly CurriculumIndicatorMappingV1[];
}

export interface LearnerCurriculumOutcomeEvidenceV1 {
  readonly outcomeId: string;
  readonly mappedIndicatorIds: readonly string[];
  readonly evidenceObservationCount: number;
  readonly currentRatingCount: number;
}

export interface LearnerCurriculumCrosswalkEvidenceV1 {
  readonly learnerUserId: string;
  readonly outcomes: readonly LearnerCurriculumOutcomeEvidenceV1[];
}

export interface ClassCurriculumOutcomeEvidenceV1 {
  readonly outcomeId: string;
  readonly outcomeType: CurriculumOutcomeTypeV1;
  readonly outcomeTitleKey: string;
  readonly mappedIndicatorIds: readonly string[];
  readonly primaryIndicatorIds: readonly string[];
  readonly supportingIndicatorIds: readonly string[];
  readonly targetTypes: readonly CompetencyTargetType[];
  readonly assignedLearnerCount: number;
  readonly learnersWithEvidence: number;
  readonly evidenceObservationCount: number;
  readonly currentRatingCount: number;
}

export interface AssignmentCurriculumCrosswalkV1 {
  readonly crosswalkId: string;
  readonly crosswalkVersion: string;
  readonly effectiveFrom: string;
  readonly titleKey: string;
  readonly externalFrameworkId: string;
  readonly externalFrameworkVersion: string;
  readonly externalFrameworkTitleKey: string;
  readonly labelsByLocale: Readonly<
    Record<
      string,
      {
        readonly title: string;
        readonly externalFrameworkTitle: string;
        readonly outcomeTitles: Readonly<Record<string, string>>;
      }
    >
  >;
  readonly learners: readonly LearnerCurriculumCrosswalkEvidenceV1[];
  readonly classOutcomes: readonly ClassCurriculumOutcomeEvidenceV1[];
}

export interface AssignmentCurriculumCrosswalkReportV1 {
  readonly schemaVersion: "1.1.0";
  readonly interpretation:
    "EVIDENCE_CROSSWALK_NO_ATTAINMENT_INFERENCE";
  readonly assignmentId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly crosswalks: readonly AssignmentCurriculumCrosswalkV1[];
}
