import type { LocaleCode } from "../localization/i18n";

export type ActivityType =
  | "OPERATIONS"
  | "AUDIT"
  | "TECHNICAL_LAB";
export type SupportProfile =
  | "GUIDED"
  | "PRACTICE"
  | "CHALLENGE";
export type DeliveryPurpose =
  | "FORMATIVE"
  | "ASSESSMENT"
  | "SANDBOX";
export type OutcomeStrategy =
  | "FIXED"
  | "CURATED_VARIANT"
  | "SEEDED_STOCHASTIC"
  | "FORCED_CONDITION";

export type LearningPresetId =
  | "guided"
  | "practice"
  | "challenge"
  | "assessment"
  | "audit-guided"
  | "audit-practice"
  | "audit-challenge"
  | "audit-assessment"
  | "technical-lab";
export type BusinessPresetId =
  | "guided"
  | "practice"
  | "challenge"
  | "assessment";
export type AuditPresetId =
  | "audit-guided"
  | "audit-practice"
  | "audit-challenge"
  | "audit-assessment";
export type Difficulty = "introductory" | "intermediate";
export type FeedbackTiming =
  | "IMMEDIATE"
  | "STAGE_END"
  | "MODULE_END"
  | "FINAL";
export type HintAvailability =
  | "ENABLED"
  | "LIMITED"
  | "DISABLED";
export type DeliveryChannel = "HOSTED" | "SCORM";

export interface ExperienceContentReference {
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId?: string;
  readonly scenarioVersion?: string;
  readonly variantBankId?: string;
  readonly variantBankVersion?: string;
  readonly laboratoryPackId?: string;
  readonly laboratoryPackVersion?: string;
}

export interface GuidancePolicy {
  readonly missionDetail: "FULL" | "CONCISE" | "MINIMAL";
  readonly evidenceGuidance: "DIRECT" | "SUGGESTED" | "NONE";
  readonly policyGuidance: "DIRECT" | "SUGGESTED" | "NONE";
  readonly nextActionGuidance:
    | "EXPLICIT"
    | "GOAL_ONLY"
    | "NONE";
  readonly fadeByProgress: boolean;
  readonly showWorkedExamples: boolean;
  readonly referenceWorkspace: boolean;
}

export interface FeedbackPolicy {
  readonly timing: FeedbackTiming;
  readonly showCorrectness: boolean;
  readonly showCausalConsequences: boolean;
  readonly showWorkedExplanation: boolean;
  readonly releaseRuleId?: string;
}

export interface HintPolicy {
  readonly availability: HintAvailability;
  readonly proactiveOffer:
    | "OFFERED"
    | "AVAILABLE_ON_REQUEST"
    | "NOT_AVAILABLE";
  readonly itemScoped: true;
  readonly disclosureRequired: boolean;
  readonly maximumHintsPerRun?: number;
}

export interface RetryPolicy {
  readonly knowledgeRetry: "ENABLED" | "LIMITED" | "DISABLED";
  readonly professionalDecisionRevision:
    | "APPEND_ONLY_MITIGATION"
    | "ONE_SHOT"
    | "FREE_REVISION";
  readonly maximumKnowledgeAttempts?: number;
  readonly maximumMitigationActions?: number;
}

export interface DecisionPolicy {
  readonly requireRationale: boolean;
  readonly requireEvidenceCitations: boolean;
  readonly requirePolicyCitations: boolean;
  readonly requireConfidence: boolean;
  readonly requireRiskEstimate: boolean;
  readonly allowDrafts: boolean;
}

export interface ExperienceScoringConfiguration {
  readonly scoringBlueprintId: string;
  readonly scoringBlueprintVersion: string;
  readonly maximumScore: number;
  readonly passScore: number;
  readonly official: boolean;
  readonly competencyEvidenceEnabled: boolean;
  readonly reportDiagnosticDimensions: boolean;
}

export interface ReportingConfiguration {
  readonly causalReport: boolean;
  readonly auditReport: boolean;
  readonly competencyReport: boolean;
  readonly activitySummary: boolean;
  readonly showTechnicalMetadataToLearner: boolean;
}

export interface DeliveryConfiguration {
  readonly channel: DeliveryChannel;
  readonly persistencePolicyId: string;
  readonly attemptPolicyId: string;
  readonly timeLimitMinutes?: number;
  readonly availabilityRuleId?: string;
}

export interface TraceChainExperienceConfigurationV2 {
  readonly configurationSchemaVersion: "2";
  readonly presetId: string;
  readonly activityType: ActivityType;
  readonly supportProfile: SupportProfile;
  readonly deliveryPurpose: DeliveryPurpose;
  readonly outcomeStrategy: OutcomeStrategy;
  readonly content: ExperienceContentReference;
  readonly guidance: GuidancePolicy;
  readonly feedback: FeedbackPolicy;
  readonly hints: HintPolicy;
  readonly retries: RetryPolicy;
  readonly decisions: DecisionPolicy;
  readonly scoring: ExperienceScoringConfiguration;
  readonly reporting: ReportingConfiguration;
  readonly delivery: DeliveryConfiguration;
  readonly locale: LocaleCode;
}

export type ScenarioVariationConfiguration =
  | {
      readonly strategy: "FIXED";
      readonly optionOrdering: "FIXED";
      readonly attemptPolicy: "STABLE_WITHIN_ATTEMPT";
      readonly displayCaseReferenceToLearner: false;
    }
  | {
      readonly strategy: "SEEDED_VARIANT_BANK";
      readonly bankId: string;
      readonly bankVersion: string;
      readonly selectionAlgorithmVersion: "1";
      readonly optionOrdering: "FIXED";
      readonly attemptPolicy: "STABLE_WITHIN_ATTEMPT";
      readonly displayCaseReferenceToLearner: boolean;
    };

interface TraceChainConfigurationBase
  extends TraceChainExperienceConfigurationV2 {
  readonly presetId: LearningPresetId;
}

export interface BusinessSimulationConfiguration
  extends TraceChainConfigurationBase {
  readonly applicationCompatibilityVersion: "tc3-v2";
  readonly presetId: BusinessPresetId;
  readonly activityType: "OPERATIONS";
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly scenarioSeed: string;
  readonly difficulty: Difficulty;
  readonly scenarioVariation: ScenarioVariationConfiguration;
  readonly technicalFeatures: {
    readonly hashInspection: boolean;
    readonly digitalSignatures: boolean;
    readonly endorsementPolicies: boolean;
    readonly stateVersionConflicts: boolean;
    readonly merkleLab: boolean;
    readonly proofOfWorkLab: boolean;
  };
}

export interface AuditSimulationConfiguration
  extends TraceChainConfigurationBase {
  readonly applicationCompatibilityVersion: "ta2-v1";
  readonly presetId: AuditPresetId;
  readonly activityType: "AUDIT";
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly auditCaseId: string;
  readonly auditCaseVersion: string;
  readonly scenarioSeed: string;
  readonly scenarioVariation: ScenarioVariationConfiguration;
}

export interface TechnicalLabConfiguration
  extends TraceChainConfigurationBase {
  readonly applicationCompatibilityVersion: "tl1-v1";
  readonly presetId: "technical-lab";
  readonly activityType: "TECHNICAL_LAB";
  readonly labPackId: string;
  readonly labPackVersion: string;
  readonly laboratoryPresetId:
    "permissioned-blockchain-foundations";
  readonly includedModuleIds: readonly string[];
  readonly scoringMode: "graded";
}

export type TraceChainConfiguration =
  | BusinessSimulationConfiguration
  | AuditSimulationConfiguration
  | TechnicalLabConfiguration;

export interface EmbeddedTraceChainConfiguration {
  readonly configuration: TraceChainConfiguration;
  readonly configurationHash: string;
}

export function isBusinessSimulationConfiguration(
  configuration: TraceChainConfiguration,
): configuration is BusinessSimulationConfiguration {
  return configuration.activityType === "OPERATIONS";
}

export function isTechnicalLabConfiguration(
  configuration: TraceChainConfiguration,
): configuration is TechnicalLabConfiguration {
  return configuration.activityType === "TECHNICAL_LAB";
}

export function isAuditSimulationConfiguration(
  configuration: TraceChainConfiguration,
): configuration is AuditSimulationConfiguration {
  return configuration.activityType === "AUDIT";
}
