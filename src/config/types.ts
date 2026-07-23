import type { LocaleCode } from "../localization/i18n";

export type LearningMode = "guided" | "challenge" | "assessment" | "technical-lab";
export type Difficulty = "introductory" | "intermediate";
export type FeedbackTiming = "immediate" | "stage-end" | "final";
export type HintMode = "enabled" | "limited" | "disabled";
export type FeatureState = "enabled" | "disabled";

export interface TraceChainConfiguration {
  readonly configurationVersion: string;
  readonly applicationCompatibilityVersion: string;
  readonly mode: LearningMode;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly scenarioSeed: string;
  readonly difficulty: Difficulty;
  readonly feedbackTiming: FeedbackTiming;
  readonly hints: HintMode;
  readonly referenceWorkspace: FeatureState;
  readonly technicalFeatures: {
    readonly hashInspection: boolean;
    readonly digitalSignatures: boolean;
    readonly endorsementPolicies: boolean;
    readonly stateVersionConflicts: boolean;
    readonly merkleLab: boolean;
    readonly proofOfWorkLab: boolean;
  };
  readonly scoring: {
    readonly maximumScore: number;
    readonly passScore: number;
    readonly reportDiagnosticDimensions: boolean;
  };
  readonly locale: LocaleCode;
}

export interface EmbeddedTraceChainConfiguration {
  readonly configuration: TraceChainConfiguration;
  readonly configurationHash: string;
}
