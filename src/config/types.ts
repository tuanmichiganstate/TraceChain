import type { LocaleCode } from "../localization/i18n";

export type LearningMode = "guided" | "challenge" | "assessment" | "technical-lab";
export type BusinessLearningMode = Exclude<LearningMode, "technical-lab">;
export type Difficulty = "introductory" | "intermediate";
export type FeedbackTiming = "immediate" | "stage-end" | "final";
export type TechnicalLabFeedbackTiming = "immediate" | "module-end" | "final";
export type HintMode = "enabled" | "limited" | "disabled";
export type FeatureState = "enabled" | "disabled";

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

interface ConfigurationScoring {
  readonly maximumScore: 100;
  readonly passScore: number;
  readonly reportDiagnosticDimensions: boolean;
}

interface TraceChainConfigurationBase {
  readonly configurationVersion: "3";
  readonly mode: LearningMode;
  readonly hints: HintMode;
  readonly referenceWorkspace: FeatureState;
  readonly scoring: ConfigurationScoring;
  readonly locale: LocaleCode;
}

export interface BusinessSimulationConfiguration
  extends TraceChainConfigurationBase {
  readonly applicationCompatibilityVersion: "tc3-v2";
  readonly mode: BusinessLearningMode;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly scenarioSeed: string;
  readonly difficulty: Difficulty;
  readonly feedbackTiming: FeedbackTiming;
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

export interface TechnicalLabConfiguration
  extends TraceChainConfigurationBase {
  readonly applicationCompatibilityVersion: "tl1-v1";
  readonly mode: "technical-lab";
  readonly labPackId: string;
  readonly labPackVersion: string;
  readonly presetId: "permissioned-blockchain-foundations";
  readonly includedModuleIds: readonly string[];
  readonly feedbackTiming: TechnicalLabFeedbackTiming;
  readonly scoringMode: "graded";
}

export type TraceChainConfiguration =
  | BusinessSimulationConfiguration
  | TechnicalLabConfiguration;

export interface EmbeddedTraceChainConfiguration {
  readonly configuration: TraceChainConfiguration;
  readonly configurationHash: string;
}

export function isBusinessSimulationConfiguration(
  configuration: TraceChainConfiguration,
): configuration is BusinessSimulationConfiguration {
  return configuration.mode !== "technical-lab";
}

export function isTechnicalLabConfiguration(
  configuration: TraceChainConfiguration,
): configuration is TechnicalLabConfiguration {
  return configuration.mode === "technical-lab";
}
