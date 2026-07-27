import type { CompetencyFrameworkV1, CompetencyTargetV1 } from "./competency";
import type {
  ContentPublication,
  LocalizedText,
  VersionLifecycleStatus,
} from "./content";
import type { JsonObject, JsonValue } from "./json";
import type {
  AutomatedEvidenceRuleV1,
  RubricDefinitionV1,
} from "./rubric";
import type { AuditCaseDefinitionV1 } from "./audit";

export type HostedRunMode =
  | "tutorial"
  | "standard"
  | "sandbox"
  | "configured";

export type HostedFeedbackTiming =
  | "immediate"
  | "stage-end"
  | "final";

export type HostedOutcomeStrategy =
  | "forced"
  | "probabilistic";

export type HostedSeedPolicy =
  | "supplied"
  | "generated";

export interface HostedRunModeConfigurationV1 {
  readonly mode: HostedRunMode;
  readonly allowHints: boolean;
  readonly allowRetry: boolean;
  readonly allowBacktracking: boolean;
  readonly feedbackTiming: HostedFeedbackTiming;
  readonly showScores: boolean;
  readonly outcomeStrategy: HostedOutcomeStrategy;
  readonly seedPolicy: HostedSeedPolicy;
  readonly timeLimitMinutes?: number;
  readonly allowCommunication: boolean;
  readonly allowEvidenceRequests: boolean;
  readonly outcomeModelId?: string;
  readonly forcedOutcomeCode?: string;
}

export interface BernoulliOutcomeModelV1 {
  readonly outcomeModelId: string;
  readonly distribution: "bernoulli";
  readonly randomStreamId: string;
  readonly probability: number;
  readonly onTrue: string;
  readonly onFalse: string;
}

export interface WeightedCategoricalOutcomeV1 {
  readonly outcomeCode: string;
  readonly weight: number;
}

export interface WeightedCategoricalOutcomeModelV1 {
  readonly outcomeModelId: string;
  readonly distribution: "weighted-categorical";
  readonly randomStreamId: string;
  readonly outcomes: readonly WeightedCategoricalOutcomeV1[];
}

export type StochasticOutcomeModelV1 =
  | BernoulliOutcomeModelV1
  | WeightedCategoricalOutcomeModelV1;

export interface ScenarioPackManifestV1 {
  readonly title: LocalizedText;
  readonly description: LocalizedText;
  readonly domain: string;
  readonly educationalPurpose: LocalizedText;
}

export interface ScenarioOrganizationV1 {
  readonly organizationId: string;
  readonly displayName: LocalizedText;
}

export interface ScenarioRoleV1 {
  readonly roleId: string;
  readonly organizationId: string;
  readonly displayName: LocalizedText;
}

export interface ScenarioPortraitAssetV1 {
  readonly assetId: string;
  readonly sourceType:
    | "AI_GENERATED"
    | "LICENSED_STOCK"
    | "ORIGINAL_WITH_RELEASE";
  readonly licenseOrApprovalReference: string;
  readonly fictionalSubject: true;
  readonly filePath: string;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly format: "webp";
  readonly developmentPlaceholder: false;
}

export interface ScenarioStaffProfileV1 {
  readonly staffProfileId: string;
  readonly roleId: string;
  readonly organizationId: string;
  readonly displayName: LocalizedText;
  readonly roleTitle: LocalizedText;
  readonly portraitAssetId: string;
  readonly portraitAlt: LocalizedText;
  readonly shortProfile?: LocalizedText;
  readonly professionalResponsibility?: LocalizedText;
  readonly visibility: "LEARNER_VISIBLE" | "INSTRUCTOR_ONLY";
  readonly fictional: true;
}

export interface ScenarioAssetTypeV1 {
  readonly assetTypeId: string;
  readonly displayName: LocalizedText;
  readonly schema: JsonObject;
}

export interface ScenarioEvidenceItemV1 {
  readonly evidenceId: string;
  readonly evidenceType: string;
  readonly title: LocalizedText;
  readonly sourceOrganizationId: string;
  readonly staffProfileId?: string;
  readonly visibleToRoleIds: readonly string[];
  readonly content: JsonObject;
}

export interface ScenarioInstructorIncidentV1 {
  readonly incidentId: string;
  readonly version: string;
  readonly title: LocalizedText;
  readonly message: LocalizedText;
  readonly visibleToRoleIds: readonly string[];
  readonly releaseAtNodeIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly professionalConsequenceEffects: Readonly<
    Record<string, number>
  >;
}

export interface ScenarioPolicyV1 {
  readonly policyId: string;
  readonly policyType:
    | "AUTHORIZATION"
    | "BUSINESS_RULE"
    | "RUNTIME_POLICY";
  readonly title: LocalizedText;
  readonly configuration: JsonObject;
}

export type TransitionConditionV1 =
  | { readonly kind: "ALWAYS" }
  | {
      readonly kind: "DECISION_OPTION_SELECTED";
      readonly decisionId: string;
      readonly optionId: string;
    }
  | {
      readonly kind: "POLICY_RESULT";
      readonly policyId: string;
      readonly outcome: "pass" | "fail";
    }
  | {
      readonly kind: "EVENT_OCCURRED";
      readonly eventType: string;
    };

export interface ScenarioTransitionV1 {
  readonly transitionId: string;
  readonly toNodeId: string;
  readonly when: TransitionConditionV1;
}

interface ScenarioNodeBaseV1 {
  readonly nodeId: string;
  readonly title: LocalizedText;
  readonly transitions: readonly ScenarioTransitionV1[];
}

export interface BriefingNodeV1 extends ScenarioNodeBaseV1 {
  readonly nodeType: "BRIEFING";
  readonly body: LocalizedText;
}

export interface EvidenceReleaseNodeV1 extends ScenarioNodeBaseV1 {
  readonly nodeType: "EVIDENCE_RELEASE";
  readonly evidenceIds: readonly string[];
}

export interface DecisionOptionV1 {
  readonly optionId: string;
  readonly label: LocalizedText;
  readonly authoredValue: JsonValue;
  readonly professionalConsequenceEffects?: Readonly<
    Record<string, number>
  >;
}

export interface DecisionFieldV1 {
  readonly fieldId: string;
  readonly prompt: LocalizedText;
  readonly selection: "single" | "multiple";
  readonly options: readonly DecisionOptionV1[];
}

export interface DecisionEvidenceCitationConfigurationV1 {
  readonly required: boolean;
  readonly minimumItems: number;
  readonly maximumItems: number;
}

export interface DecisionPolicyCitationConfigurationV1 {
  readonly required: boolean;
  readonly minimumItems: number;
  readonly maximumItems: number;
}

export interface DecisionNumericResponseConfigurationV1 {
  readonly required: boolean;
  readonly minimum: number;
  readonly maximum: number;
}

export interface StructuredDecisionResponseConfigurationV1 {
  readonly evidenceCitations?: DecisionEvidenceCitationConfigurationV1;
  readonly policyCitations?: DecisionPolicyCitationConfigurationV1;
  readonly confidenceRating?: DecisionNumericResponseConfigurationV1;
  readonly adverseEventProbabilityPercent?:
    DecisionNumericResponseConfigurationV1;
}

export type CounterfactualAvailabilityV1 =
  | "AFTER_RUN_COMPLETION"
  | "AFTER_FEEDBACK_RELEASE"
  | "INSTRUCTOR_ONLY";

export type CounterfactualCreatorV1 =
  | "LEARNER"
  | "INSTRUCTOR"
  | "RATER";

export type CounterfactualDownstreamPolicyV1 =
  | "REUSE_BASELINE_WHERE_VALID"
  | "INTERACTIVE_AFTER_FORK";

export interface CounterfactualDecisionDefinitionV1 {
  readonly enabled: boolean;
  readonly availability: CounterfactualAvailabilityV1;
  readonly permittedCreators: readonly CounterfactualCreatorV1[];
  readonly allowedAlternativeOptionIds: readonly string[];
  readonly comparisonDimensionIds: readonly string[];
  readonly downstreamPolicy: CounterfactualDownstreamPolicyV1;
  readonly maxBranchesPerLearner?: number;
  readonly reflectionRequired?: boolean;
  readonly localizationKey: string;
}

export interface CounterfactualConditionValueV1 {
  readonly conditionValueId: string;
  readonly runtimeValue: string;
  readonly label: LocalizedText;
}

export interface CounterfactualConditionDefinitionV1 {
  readonly enabled: boolean;
  readonly conditionId: string;
  readonly availability: CounterfactualAvailabilityV1;
  readonly permittedCreators: readonly CounterfactualCreatorV1[];
  readonly forkNodeId: string;
  readonly runtimeConditionKey: "COFFEE_CASE_VARIANT";
  readonly allowedValues: readonly CounterfactualConditionValueV1[];
  readonly affectsInformationBeforeFork: boolean;
  readonly comparisonDimensionIds: readonly string[];
  readonly maxBranchesPerLearner?: number;
  readonly reflectionRequired?: boolean;
  readonly localizationKey: string;
}

export type CounterfactualComparisonValueTypeV1 =
  | "NUMBER"
  | "ORDINAL"
  | "CATEGORICAL";

export type CounterfactualComparisonDirectionV1 =
  | "HIGHER_IS_BETTER"
  | "LOWER_IS_BETTER"
  | "CONTEXT_DEPENDENT";

export type CounterfactualCausalAttributionV1 =
  | "DIRECT_INTERVENTION_EFFECT"
  | "DOWNSTREAM_STATE_EFFECT"
  | "LATER_DECISION_EFFECT"
  | "STOCHASTIC_OUTCOME_EFFECT"
  | "CONDITION_OVERRIDE_EFFECT"
  | "UNCHANGED"
  | "NOT_ATTRIBUTABLE";

export interface CounterfactualRuntimeMetricEvaluationV1 {
  readonly kind: "RUNTIME_METRIC";
  readonly metricId: string;
  readonly changedValueAttribution:
    Exclude<
      CounterfactualCausalAttributionV1,
      "UNCHANGED" | "NOT_ATTRIBUTABLE"
    >;
}

export interface CounterfactualComparisonDimensionV1 {
  readonly dimensionId: string;
  readonly title: LocalizedText;
  readonly description: LocalizedText;
  readonly valueType: CounterfactualComparisonValueTypeV1;
  readonly direction: CounterfactualComparisonDirectionV1;
  readonly unit?: string;
  readonly evaluation: CounterfactualRuntimeMetricEvaluationV1;
}

export interface DecisionNodeV1 extends ScenarioNodeBaseV1 {
  readonly nodeType: "DECISION";
  readonly decisionId: string;
  readonly prompt: LocalizedText;
  readonly fields: readonly DecisionFieldV1[];
  readonly justification?: {
    readonly required: boolean;
    readonly maximumLength: number;
  };
  readonly structuredResponse?:
    StructuredDecisionResponseConfigurationV1;
  readonly counterfactual?: CounterfactualDecisionDefinitionV1;
}

export interface TransactionProposalNodeV1 extends ScenarioNodeBaseV1 {
  readonly nodeType: "TRANSACTION_PROPOSAL";
  readonly proposalType: string;
  readonly sourceDecisionId: string;
  readonly policyIds: readonly string[];
  readonly runtimeActionBindingId?: string;
}

export interface EndorsementNodeV1 extends ScenarioNodeBaseV1 {
  readonly nodeType: "ENDORSEMENT";
  readonly proposalNodeId: string;
  readonly policyId: string;
  readonly permittedRoleIds: readonly string[];
}

export interface PolicyCheckNodeV1 extends ScenarioNodeBaseV1 {
  readonly nodeType: "POLICY_CHECK";
  readonly policyId: string;
  readonly proposalNodeId: string;
}

export interface CommunicationNodeV1 extends ScenarioNodeBaseV1 {
  readonly nodeType: "COMMUNICATION";
  readonly messageId: string;
  readonly message: LocalizedText;
  readonly visibleToRoleIds: readonly string[];
}

export interface StochasticOutcomeV1 {
  readonly outcomeId: string;
  readonly weight: number;
  readonly resultCode: string;
}

export interface StochasticEventNodeV1 extends ScenarioNodeBaseV1 {
  readonly nodeType: "STOCHASTIC_EVENT";
  readonly randomStreamId: string;
  readonly outcomes: readonly StochasticOutcomeV1[];
}

export interface ConsequenceNodeV1 extends ScenarioNodeBaseV1 {
  readonly nodeType: "CONSEQUENCE";
  readonly consequenceCode: string;
  readonly message: LocalizedText;
}

export interface FeedbackNodeV1 extends ScenarioNodeBaseV1 {
  readonly nodeType: "FEEDBACK";
  readonly feedbackCode: string;
  readonly message: LocalizedText;
}

export interface ReflectionNodeV1 extends ScenarioNodeBaseV1 {
  readonly nodeType: "REFLECTION";
  readonly reflectionId: string;
  readonly prompt: LocalizedText;
  readonly maximumLength: number;
}

export interface CompletionNodeV1 extends ScenarioNodeBaseV1 {
  readonly nodeType: "COMPLETION";
  readonly outcomeCode: string;
}

export type ScenarioNodeV1 =
  | BriefingNodeV1
  | EvidenceReleaseNodeV1
  | DecisionNodeV1
  | TransactionProposalNodeV1
  | EndorsementNodeV1
  | PolicyCheckNodeV1
  | CommunicationNodeV1
  | StochasticEventNodeV1
  | ConsequenceNodeV1
  | FeedbackNodeV1
  | ReflectionNodeV1
  | CompletionNodeV1;

export interface HostedRuntimeActionBindingV1 {
  readonly bindingId: string;
  readonly nodeId: string;
  readonly commandType: string;
  readonly domainActionId: string;
}

export interface CoffeeHostedRuntimeProfileV1 {
  readonly runtimeId: "tracechain-coffee-v2";
  readonly domainScenarioId: string;
  readonly domainScenarioVersion: string;
  readonly entryStageId: string;
  readonly actionBindings: readonly HostedRuntimeActionBindingV1[];
}

export interface AuditHostedRuntimeProfileV1 {
  readonly runtimeId: "tracechain-audit-v1";
  readonly auditCaseId: string;
}

export type HostedRuntimeProfileV1 =
  | CoffeeHostedRuntimeProfileV1
  | AuditHostedRuntimeProfileV1;

export interface ScenarioDefinitionV1 {
  readonly scenarioId: string;
  readonly version: string;
  readonly status: VersionLifecycleStatus;
  readonly title: LocalizedText;
  readonly supportedModes: readonly HostedRunMode[];
  readonly modeConfigurations:
    readonly HostedRunModeConfigurationV1[];
  readonly outcomeModels: readonly StochasticOutcomeModelV1[];
  readonly competencyTargets: readonly CompetencyTargetV1[];
  readonly organizations: readonly ScenarioOrganizationV1[];
  readonly roles: readonly ScenarioRoleV1[];
  readonly staffProfiles: readonly ScenarioStaffProfileV1[];
  readonly assetTypes: readonly ScenarioAssetTypeV1[];
  readonly initialState: {
    readonly actualState: JsonObject;
    readonly businessState: JsonObject;
    readonly ledgerState: JsonObject;
    readonly informationState: JsonObject;
  };
  readonly policies: readonly ScenarioPolicyV1[];
  readonly evidenceItems: readonly ScenarioEvidenceItemV1[];
  readonly instructorIncidents:
    readonly ScenarioInstructorIncidentV1[];
  readonly counterfactualComparisonDimensions:
    readonly CounterfactualComparisonDimensionV1[];
  readonly counterfactualConditions:
    readonly CounterfactualConditionDefinitionV1[];
  readonly entryNodeId: string;
  readonly nodes: readonly ScenarioNodeV1[];
  readonly rubricIds: readonly string[];
  readonly evidenceRuleIds: readonly string[];
  readonly hostedRuntime?: HostedRuntimeProfileV1;
  readonly auditCase?: AuditCaseDefinitionV1;
}

export interface ScenarioPackV1 {
  readonly $schema?: string;
  readonly schemaVersion: "1.8.0";
  readonly packId: string;
  readonly version: string;
  readonly status: VersionLifecycleStatus;
  readonly supportedLocales: readonly string[];
  readonly localizationCatalogs?: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
  readonly manifest: ScenarioPackManifestV1;
  readonly competencyFrameworks: readonly CompetencyFrameworkV1[];
  readonly rubrics: readonly RubricDefinitionV1[];
  readonly evidenceRules: readonly AutomatedEvidenceRuleV1[];
  readonly portraitAssets: readonly ScenarioPortraitAssetV1[];
  readonly scenarios: readonly ScenarioDefinitionV1[];
  readonly assetHashes: Readonly<Record<string, string>>;
  readonly publication?: ContentPublication;
}
