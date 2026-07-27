import type {
  AuditSimulationConfiguration,
  BusinessSimulationConfiguration,
  TraceChainConfiguration,
} from "./types";
import {
  feedbackPolicyFor,
  guidancePolicyFor,
  hintPolicyFor,
  resolveProductDimensions,
  retryPolicyFor,
} from "./experience";

export type LecturerPresetId =
  | "guided"
  | "practice"
  | "challenge"
  | "assessment"
  | "audit-guided"
  | "audit-practice";

const COMMON = {
  configurationSchemaVersion: "2",
  applicationCompatibilityVersion: "tc3-v2",
  technicalFeatures: {
    hashInspection: true,
    digitalSignatures: true,
    endorsementPolicies: true,
    stateVersionConflicts: false,
    merkleLab: false,
    proofOfWorkLab: false,
  },
  scoring: {
    scoringBlueprintId: "SCORING_COFFEE_100",
    scoringBlueprintVersion: "1.0.0",
    maximumScore: 100,
    passScore: 70,
    official: false,
    competencyEvidenceEnabled: true,
    reportDiagnosticDimensions: true,
  },
  reporting: {
    causalReport: true,
    auditReport: false,
    competencyReport: true,
    activitySummary: true,
    showTechnicalMetadataToLearner: false,
  },
  decisions: {
    requireRationale: false,
    requireEvidenceCitations: false,
    requirePolicyCitations: false,
    requireConfidence: false,
    requireRiskEstimate: false,
    allowDrafts: false,
  },
  locale: "vi",
} as const;

const GUIDED_DIMENSIONS = resolveProductDimensions("guided");

export const GUIDED_PRESET: BusinessSimulationConfiguration = {
  ...COMMON,
  presetId: "guided",
  ...GUIDED_DIMENSIONS,
  content: {
    packId: "PACK_SCORM_STANDARD_COFFEE",
    packVersion: "2.3.0",
    scenarioId: "SCN_COFFEE_001",
    scenarioVersion: "2.3.0",
  },
  guidance: guidancePolicyFor(GUIDED_DIMENSIONS.supportProfile),
  feedback: feedbackPolicyFor("IMMEDIATE"),
  hints: hintPolicyFor("ENABLED", GUIDED_DIMENSIONS.supportProfile),
  retries: retryPolicyFor(
    GUIDED_DIMENSIONS.supportProfile,
    GUIDED_DIMENSIONS.deliveryPurpose,
  ),
  delivery: {
    channel: "SCORM",
    persistencePolicyId: "TC3_COMPACT_JOURNAL",
    attemptPolicyId: "LMS_MANAGED",
  },
  scenarioId: "SCN_COFFEE_001",
  scenarioVersion: "2.3.0",
  scenarioSeed: "guided-standard-v1",
  difficulty: "introductory",
  scenarioVariation: {
    strategy: "FIXED",
    optionOrdering: "FIXED",
    attemptPolicy: "STABLE_WITHIN_ATTEMPT",
    displayCaseReferenceToLearner: false,
  },
};

const PRACTICE_DIMENSIONS =
  resolveProductDimensions("practice");

export const PRACTICE_PRESET: BusinessSimulationConfiguration = {
  ...COMMON,
  presetId: "practice",
  ...PRACTICE_DIMENSIONS,
  content: {
    packId: "PACK_SCORM_PRACTICE_COFFEE",
    packVersion: "1.0.0",
    scenarioId: "SCN_COFFEE_PRACTICE",
    scenarioVersion: "1.0.0",
    variantBankId: "BANK_COFFEE_PRACTICE_V1",
    variantBankVersion: "1.0.0",
  },
  guidance: guidancePolicyFor(
    PRACTICE_DIMENSIONS.supportProfile,
  ),
  feedback: feedbackPolicyFor("IMMEDIATE"),
  hints: hintPolicyFor(
    "ENABLED",
    PRACTICE_DIMENSIONS.supportProfile,
  ),
  retries: retryPolicyFor(
    PRACTICE_DIMENSIONS.supportProfile,
    PRACTICE_DIMENSIONS.deliveryPurpose,
  ),
  delivery: {
    channel: "SCORM",
    persistencePolicyId: "TC3_COMPACT_JOURNAL",
    attemptPolicyId: "LMS_MANAGED",
  },
  scenarioId: "SCN_COFFEE_PRACTICE",
  scenarioVersion: "1.0.0",
  scenarioSeed: "practice-bank-v1",
  difficulty: "intermediate",
  scenarioVariation: {
    strategy: "SEEDED_VARIANT_BANK",
    bankId: "BANK_COFFEE_PRACTICE_V1",
    bankVersion: "1.0.0",
    selectionAlgorithmVersion: "1",
    optionOrdering: "FIXED",
    attemptPolicy: "STABLE_WITHIN_ATTEMPT",
    displayCaseReferenceToLearner: true,
  },
};

const CHALLENGE_DIMENSIONS =
  resolveProductDimensions("challenge");

export const CHALLENGE_PRESET: BusinessSimulationConfiguration = {
  ...COMMON,
  presetId: "challenge",
  ...CHALLENGE_DIMENSIONS,
  content: {
    packId: "PACK_SCORM_CHALLENGE_COFFEE",
    packVersion: "2.0.0",
    scenarioId: "SCN_COFFEE_CHALLENGE",
    scenarioVersion: "2.0.0",
    variantBankId: "BANK_COFFEE_CHALLENGE_V1",
    variantBankVersion: "1.0.0",
  },
  guidance: guidancePolicyFor(
    CHALLENGE_DIMENSIONS.supportProfile,
  ),
  feedback: feedbackPolicyFor("STAGE_END"),
  hints: hintPolicyFor(
    "LIMITED",
    CHALLENGE_DIMENSIONS.supportProfile,
  ),
  retries: retryPolicyFor(
    CHALLENGE_DIMENSIONS.supportProfile,
    CHALLENGE_DIMENSIONS.deliveryPurpose,
  ),
  delivery: {
    channel: "SCORM",
    persistencePolicyId: "TC3_COMPACT_JOURNAL",
    attemptPolicyId: "LMS_MANAGED",
  },
  scenarioId: "SCN_COFFEE_CHALLENGE",
  scenarioVersion: "2.0.0",
  scenarioSeed: "challenge-bank-v1",
  difficulty: "intermediate",
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

const ASSESSMENT_DIMENSIONS =
  resolveProductDimensions("assessment");

export const ASSESSMENT_PRESET: BusinessSimulationConfiguration = {
  ...COMMON,
  presetId: "assessment",
  ...ASSESSMENT_DIMENSIONS,
  content: {
    packId: "PACK_SCORM_STANDARD_COFFEE",
    packVersion: "2.3.0",
    scenarioId: "SCN_COFFEE_001",
    scenarioVersion: "2.3.0",
  },
  guidance: guidancePolicyFor(
    ASSESSMENT_DIMENSIONS.supportProfile,
  ),
  feedback: feedbackPolicyFor("FINAL"),
  hints: hintPolicyFor(
    "DISABLED",
    ASSESSMENT_DIMENSIONS.supportProfile,
  ),
  retries: retryPolicyFor(
    ASSESSMENT_DIMENSIONS.supportProfile,
    ASSESSMENT_DIMENSIONS.deliveryPurpose,
  ),
  scoring: {
    ...COMMON.scoring,
    official: true,
  },
  delivery: {
    channel: "SCORM",
    persistencePolicyId: "TC3_COMPACT_JOURNAL",
    attemptPolicyId: "LMS_MANAGED",
  },
  scenarioId: "SCN_COFFEE_001",
  scenarioVersion: "2.3.0",
  scenarioSeed: "assessment-standard-v1",
  difficulty: "intermediate",
  scenarioVariation: {
    strategy: "FIXED",
    optionOrdering: "FIXED",
    attemptPolicy: "STABLE_WITHIN_ATTEMPT",
    displayCaseReferenceToLearner: false,
  },
};

const AUDIT_COMMON = {
  configurationSchemaVersion: "2",
  applicationCompatibilityVersion: "ta1-v1",
  activityType: "AUDIT",
  deliveryPurpose: "FORMATIVE",
  feedback: feedbackPolicyFor("IMMEDIATE"),
  scoring: {
    scoringBlueprintId: "AUDIT_COFFEE_100",
    scoringBlueprintVersion: "1.0.0",
    maximumScore: 100,
    passScore: 70,
    official: false,
    competencyEvidenceEnabled: true,
    reportDiagnosticDimensions: true,
  },
  reporting: {
    causalReport: false,
    auditReport: true,
    competencyReport: true,
    activitySummary: true,
    showTechnicalMetadataToLearner: false,
  },
  decisions: {
    requireRationale: true,
    requireEvidenceCitations: true,
    requirePolicyCitations: true,
    requireConfidence: true,
    requireRiskEstimate: false,
    allowDrafts: true,
  },
  delivery: {
    channel: "SCORM",
    persistencePolicyId: "TA1_COMPACT_WORKPAPER",
    attemptPolicyId: "LMS_MANAGED",
  },
  locale: "vi",
} as const;

const AUDIT_GUIDED_DIMENSIONS =
  resolveProductDimensions("audit-guided");

export const AUDIT_GUIDED_PRESET: AuditSimulationConfiguration = {
  ...AUDIT_COMMON,
  presetId: "audit-guided",
  ...AUDIT_GUIDED_DIMENSIONS,
  content: {
    packId: "PACK_GUIDED_COFFEE_AUDIT",
    packVersion: "2.0.0",
    scenarioId: "SCN_GUIDED_COFFEE_AUDIT",
    scenarioVersion: "2.0.0",
  },
  guidance: guidancePolicyFor("GUIDED"),
  hints: hintPolicyFor("ENABLED", "GUIDED"),
  retries: {
    knowledgeRetry: "DISABLED",
    professionalDecisionRevision: "FREE_REVISION",
    maximumKnowledgeAttempts: 1,
    maximumMitigationActions: 0,
  },
  scenarioId: "SCN_GUIDED_COFFEE_AUDIT",
  scenarioVersion: "2.0.0",
  auditCaseId: "AUDIT_COFFEE_CONTROLS_001",
  auditCaseVersion: "2.0.0",
  scenarioSeed: "audit-guided-coffee-v1",
};

const AUDIT_PRACTICE_DIMENSIONS =
  resolveProductDimensions("audit-practice");

export const AUDIT_PRACTICE_PRESET: AuditSimulationConfiguration = {
  ...AUDIT_COMMON,
  presetId: "audit-practice",
  ...AUDIT_PRACTICE_DIMENSIONS,
  content: {
    packId: "PACK_PRACTICE_COFFEE_AUDIT",
    packVersion: "1.0.0",
    scenarioId: "SCN_PRACTICE_COFFEE_AUDIT",
    scenarioVersion: "1.0.0",
  },
  guidance: guidancePolicyFor("PRACTICE"),
  hints: hintPolicyFor("ENABLED", "PRACTICE"),
  retries: {
    knowledgeRetry: "DISABLED",
    professionalDecisionRevision: "FREE_REVISION",
    maximumKnowledgeAttempts: 1,
    maximumMitigationActions: 0,
  },
  scenarioId: "SCN_PRACTICE_COFFEE_AUDIT",
  scenarioVersion: "1.0.0",
  auditCaseId: "AUDIT_COFFEE_CONTROLS_PRACTICE_001",
  auditCaseVersion: "1.0.0",
  scenarioSeed: "audit-practice-coffee-v1",
};

export const LECTURER_PRESETS: Readonly<
  Record<LecturerPresetId, TraceChainConfiguration>
> = {
  guided: GUIDED_PRESET,
  practice: PRACTICE_PRESET,
  challenge: CHALLENGE_PRESET,
  assessment: ASSESSMENT_PRESET,
  "audit-guided": AUDIT_GUIDED_PRESET,
  "audit-practice": AUDIT_PRACTICE_PRESET,
};

export function resolvePreset(
  presetId: LecturerPresetId,
): TraceChainConfiguration {
  return structuredClone(LECTURER_PRESETS[presetId]);
}
