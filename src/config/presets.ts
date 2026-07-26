import type { TraceChainConfiguration } from "./types";

export type LecturerPresetId =
  | "guided"
  | "challenge"
  | "assessment";

const COMMON = {
  configurationVersion: "1",
  applicationCompatibilityVersion: "tc3-v1",
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
};

export const CHALLENGE_PRESET: TraceChainConfiguration = {
  ...COMMON,
  mode: "challenge",
  scenarioId: "SCN_COFFEE_CHALLENGE_A",
  scenarioVersion: "1.2.0",
  scenarioSeed: "challenge-a-v1",
  difficulty: "intermediate",
  feedbackTiming: "stage-end",
  hints: "limited",
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
