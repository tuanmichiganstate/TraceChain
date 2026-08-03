import type { LtiLearningContextV2 } from "./lti";
import type { HostedRunModeConfigurationV1 } from "./scenario-pack";
import type { SimuLedgerExperienceConfigurationV2 } from "../../config/types";
import type { VersionLifecycleStatus } from "./content";

export type AssignmentRunMode =
  | "tutorial"
  | "standard"
  | "sandbox"
  | "configured";

export type AssignmentStartAvailabilityStatus =
  | "available"
  | "not-yet-open"
  | "ended"
  | "closed";

export interface AssignmentStartAvailabilityV1 {
  readonly status: AssignmentStartAvailabilityStatus;
  readonly observedAt: string;
}

export type CounterfactualLearnerAvailabilityV1 =
  | "DISABLED"
  | "AFTER_RUN_COMPLETION"
  | "AFTER_FEEDBACK_RELEASE";

export interface AssignmentCounterfactualConfigurationV1 {
  readonly enabled: boolean;
  readonly allowedDecisionNodeIds: readonly string[];
  readonly maximumBranchesPerLearner: number;
  readonly learnerAvailability:
    CounterfactualLearnerAvailabilityV1;
  readonly requireReflection: boolean;
}

export type AssignmentResearchConfigurationV1 =
  | {
      readonly enabled: false;
    }
  | {
      readonly enabled: true;
      readonly experimentalConditionId: string;
      readonly randomAssignmentRecordId: string;
      readonly fixedScenarioSeed: string;
      readonly consentStatusReference: string;
      readonly preTestLinkageId?: string;
      readonly postTestLinkageId?: string;
      readonly blindedRaters: boolean;
      readonly interventionVersion: string;
      readonly retentionPolicyReference: string;
    };

export interface HostedAssignmentV1 {
  readonly schemaVersion: "2.0.0";
  readonly assignmentId: string;
  readonly title: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly mode: AssignmentRunMode;
  readonly runConfiguration: HostedRunModeConfigurationV1;
  readonly experienceConfiguration:
    SimuLedgerExperienceConfigurationV2;
  readonly experienceConfigurationHash: string;
  readonly counterfactualReplay:
    AssignmentCounterfactualConfigurationV1;
  readonly research: AssignmentResearchConfigurationV1;
  readonly learningContext?: LtiLearningContextV2;
  readonly learnerUserIds: readonly string[];
  /**
   * The assessment-only accounts allowed to read this assignment's evidence
   * and record rubric ratings against it. A rater has no course relation of
   * its own, so an empty roster means no rater reaches this assignment.
   */
  readonly raterUserIds: readonly string[];
  readonly status: "active" | "closed";
  readonly availableFrom?: string;
  readonly availableUntil?: string;
  readonly closedAt?: string;
  readonly closedByUserId?: string;
  readonly feedbackReleaseStatus: "withheld" | "released";
  readonly feedbackReleasedAt?: string;
  readonly feedbackReleasedByUserId?: string;
  readonly createdAt: string;
  readonly createdByUserId: string;
}

/**
 * Bounded staff-facing assignment discovery record.
 *
 * The directory deliberately omits learner and rater identities, research
 * metadata, and configuration payloads. Those remain available only after an
 * authorized staff member opens the exact assignment report.
 */
export interface HostedAssignmentDirectoryItemV1 {
  readonly schemaVersion: "1.0.0";
  readonly assignmentId: string;
  readonly title: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly mode: AssignmentRunMode;
  readonly status: "active" | "closed";
  readonly assignedLearnerCount: number;
  readonly assignedRaterCount: number;
  readonly createdAt: string;
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
  readonly experienceConfiguration:
    SimuLedgerExperienceConfigurationV2;
  readonly experienceConfigurationHash: string;
  readonly counterfactualReplay:
    AssignmentCounterfactualConfigurationV1;
  readonly research: AssignmentResearchConfigurationV1;
  /**
   * Server-derived from an authenticated LTI launch. Browser request bodies
   * cannot select or replace this context.
   */
  readonly learningContext?: LtiLearningContextV2;
  readonly learnerUserIds: readonly string[];
  /** Optional. Omitted or empty leaves the assignment closed to raters. */
  readonly raterUserIds?: readonly string[];
  readonly availableFrom?: string;
  readonly availableUntil?: string;
}

export type HostedScenarioActivitySummaryV1 =
  | {
      readonly kind: "WORKFLOW";
      readonly decisionCount: number;
      readonly reflectionCount: number;
      readonly learningStageCount?: number;
    }
  | {
      readonly kind: "AUDIT";
      readonly sourceRecordCount: number;
      readonly maximumFindingCount: number;
      readonly conclusionRequired: true;
    }
  | {
      readonly kind: "TECHNICAL_LAB";
      readonly moduleCount: number;
    };

export interface HostedAssignmentScenarioSummaryV1 {
  readonly schemaVersion: "1.0.0";
  readonly domain: string;
  readonly scenarioStatus: VersionLifecycleStatus;
  readonly runtimeKind:
    | "OPERATIONS"
    | "AUDIT"
    | "TECHNICAL_LAB"
    | "GENERIC";
  readonly authoredNodeCount: number;
  readonly organizationIds: readonly string[];
  readonly roleIds: readonly string[];
  readonly evidenceItems: readonly {
    readonly evidenceId: string;
    readonly evidenceType: string;
  }[];
  readonly policyIds: readonly string[];
  readonly learnerVisibleStaffCount: number;
  readonly referencedImageCount: number;
  readonly competencyTargetCount: number;
  readonly rubricCount: number;
  readonly requiredResponses: {
    readonly writtenJustification: boolean;
    readonly evidenceCitations: boolean;
    readonly policyCitations: boolean;
    readonly confidenceRating: boolean;
    readonly adverseEventProbability: boolean;
  };
  readonly assessment: {
    readonly scoredElementCount: number;
    readonly maximumScore?: number;
  };
  readonly activity: HostedScenarioActivitySummaryV1;
  readonly instructorOnly: {
    readonly stochasticOutcomeModelCount: number;
    readonly instructorIncidentCount: number;
    readonly counterfactualDecisionCount: number;
    readonly counterfactualConditionCount: number;
    readonly auditVariantCalibrationStatus?:
      | "DRAFT"
      | "EXPERT_REVIEWED"
      | "PILOT_CALIBRATED"
      | "RETIRED";
  };
}

export interface HostedAssignmentScenarioOptionV1 {
  readonly schemaVersion: "3.0.0";
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly packTitleKey: string;
  readonly scenarioTitleKey: string;
  readonly labelsByLocale: Readonly<
    Record<
      string,
      {
        readonly packTitle: string;
        readonly scenarioTitle: string;
        readonly description: string;
        readonly educationalPurpose: string;
        readonly organizationTitles:
          Readonly<Record<string, string>>;
        readonly roleTitles: Readonly<Record<string, string>>;
        readonly evidenceTitles: Readonly<Record<string, string>>;
        readonly policyTitles: Readonly<Record<string, string>>;
        readonly counterfactualDecisionTitles:
          Readonly<Record<string, string>>;
      }
    >
  >;
  readonly supportedModes: readonly AssignmentRunMode[];
  readonly modeConfigurations:
    readonly HostedRunModeConfigurationV1[];
  readonly experienceConfigurations: readonly {
    readonly mode: AssignmentRunMode;
    readonly configuration:
      SimuLedgerExperienceConfigurationV2;
    readonly configurationHash: string;
  }[];
  readonly summary: HostedAssignmentScenarioSummaryV1;
  readonly counterfactualDecisionPoints: readonly {
    readonly nodeId: string;
    readonly decisionId: string;
    readonly titleKey: string;
    readonly availability:
      | "AFTER_RUN_COMPLETION"
      | "AFTER_FEEDBACK_RELEASE"
      | "INSTRUCTOR_ONLY";
    readonly maximumBranchesPerLearner: number;
    readonly reflectionRequired: boolean;
  }[];
}

export interface HostedAssignmentLearnerOptionV2 {
  readonly schemaVersion: "2.0.0";
  readonly userId: string;
  readonly displayName: string;
  readonly email?: string;
  readonly source: "APPLICATION_ACCESS" | "LTI_NRPS";
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
  readonly schemaVersion: "2.0.0";
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
  readonly startAvailability: AssignmentStartAvailabilityV1;
  readonly runs: readonly HostedAssignmentRunSummary[];
}
