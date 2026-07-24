import type { CompetencyTargetType } from "./competency";

export interface CompetencyFrameworkReferenceV1 {
  readonly frameworkId: string;
  readonly frameworkVersion: string;
}

export interface CompetencyIndicatorReferenceV1 {
  readonly frameworkId: string;
  readonly frameworkVersion: string;
  readonly competencyId: string;
  readonly competencyVersion: string;
  readonly competencyTitleKey: string;
  readonly indicatorId: string;
  readonly indicatorVersion: string;
  readonly indicatorStatementKey: string;
  readonly targetType: CompetencyTargetType;
}

export interface LearnerCompetencyObservationV1 {
  readonly runId: string;
  readonly competencyEvidenceId: string;
  readonly evidenceRuleId: string;
  readonly sourceEventIds: readonly string[];
  readonly observedAt: string;
}

export interface LearnerCompetencyRatingV1 {
  readonly runId: string;
  readonly ratingId: string;
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

export interface LearnerCompetencyIndicatorV1
  extends CompetencyIndicatorReferenceV1 {
  readonly evidenceCount: number;
  readonly latestObservedAt?: string;
  readonly observations: readonly LearnerCompetencyObservationV1[];
  readonly currentRatings: readonly LearnerCompetencyRatingV1[];
}

export interface AssignmentLearnerCompetencyReportV1 {
  readonly learnerUserId: string;
  readonly indicators: readonly LearnerCompetencyIndicatorV1[];
}

export interface RatingDistributionEntryV1 {
  readonly levelValue: number;
  readonly count: number;
}

export interface ClassCompetencyIndicatorV1
  extends CompetencyIndicatorReferenceV1 {
  readonly assignedLearnerCount: number;
  readonly learnersWithEvidence: number;
  readonly evidenceCount: number;
  readonly currentRatingCount: number;
  readonly ratingDistribution: readonly RatingDistributionEntryV1[];
}

export interface HostedAssignmentCompetencyReportV1 {
  readonly schemaVersion: "1.0.0";
  readonly interpretation: "EVIDENCE_ONLY_NO_COMPETENCE_INFERENCE";
  readonly assignmentId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly frameworks: readonly CompetencyFrameworkReferenceV1[];
  readonly learners: readonly AssignmentLearnerCompetencyReportV1[];
  readonly classIndicators: readonly ClassCompetencyIndicatorV1[];
}
