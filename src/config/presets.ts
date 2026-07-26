import type { TraceChainConfiguration } from "./types";

export type LecturerPresetId =
  | "guided"
  | "challenge"
  | "assessment";

const COMMON = {
  configurationVersion: "2",
  applicationCompatibilityVersion: "tc3-v2",
  referenceWorkspace: "enabled",
  technicalFeatures: {
    hashInspection: true,
    digitalSignatures: true,
    endorsementPolicies: true,
    stateVersionConflicts: false,
    merkleLab: false,
    proofOfWorkLab: false,
  },
  scoring: {
    maximumScore: 100,
    passScore: 70,
    reportDiagnosticDimensions: true,
  },
  locale: "vi",
} as const;

export const GUIDED_PRESET: TraceChainConfiguration = {
  ...COMMON,
  mode: "guided",
  scenarioId: "SCN_COFFEE_001",
  scenarioVersion: "2.3.0",
  scenarioSeed: "guided-standard-v1",
  difficulty: "introductory",
  feedbackTiming: "immediate",
  hints: "enabled",
  scenarioVariation: {
    strategy: "FIXED",
    optionOrdering: "FIXED",
    attemptPolicy: "STABLE_WITHIN_ATTEMPT",
    displayCaseReferenceToLearner: false,
  },
};

export const CHALLENGE_PRESET: TraceChainConfiguration = {
  ...COMMON,
  mode: "challenge",
  scenarioId: "SCN_COFFEE_CHALLENGE",
  scenarioVersion: "2.0.0",
  scenarioSeed: "challenge-bank-v1",
  difficulty: "intermediate",
  feedbackTiming: "stage-end",
  hints: "limited",
  scenarioVariation: {
    strategy: "SEEDED_VARIANT_BANK",
    bankId: "BANK_COFFEE_CHALLENGE_V1",
    bankVersion: "1.0.0",
    selectionAlgorithmVersion: "1",
    optionOrdering: "FIXED",
    attemptPolicy: "STABLE_WITHIN_ATTEMPT",
    displayCaseReferenceToLearner: true,
  },
};

export const ASSESSMENT_PRESET: TraceChainConfiguration = {
  ...COMMON,
  mode: "assessment",
  scenarioId: "SCN_COFFEE_001",
  scenarioVersion: "2.3.0",
  scenarioSeed: "assessment-standard-v1",
  difficulty: "intermediate",
  feedbackTiming: "final",
  hints: "disabled",
  scenarioVariation: {
    strategy: "FIXED",
    optionOrdering: "FIXED",
    attemptPolicy: "STABLE_WITHIN_ATTEMPT",
    displayCaseReferenceToLearner: false,
  },
};

export const LECTURER_PRESETS: Readonly<
  Record<LecturerPresetId, TraceChainConfiguration>
> = {
  guided: GUIDED_PRESET,
  challenge: CHALLENGE_PRESET,
  assessment: ASSESSMENT_PRESET,
};

export function resolvePreset(presetId: LecturerPresetId): TraceChainConfiguration {
  return structuredClone(LECTURER_PRESETS[presetId]);
}
