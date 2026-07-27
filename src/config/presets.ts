import type {
  AuditSimulationConfiguration,
  BusinessSimulationConfiguration,
  TechnicalLabConfiguration,
  TraceChainConfiguration,
} from "./types";
import { FIRST_TECHNICAL_LAB_MODULE_IDS } from "../technical-lab/contracts";
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
  | "audit-practice"
  | "audit-challenge"
  | "audit-assessment"
  | "technical-lab";

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
  applicationCompatibilityVersion: "ta2-v1",
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
    persistencePolicyId: "TA2_COMPACT_WORKPAPER",
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
  scenarioVariation: {
    strategy: "FIXED",
    optionOrdering: "FIXED",
    attemptPolicy: "STABLE_WITHIN_ATTEMPT",
    displayCaseReferenceToLearner: false,
  },
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
  scenarioVariation: {
    strategy: "FIXED",
    optionOrdering: "FIXED",
    attemptPolicy: "STABLE_WITHIN_ATTEMPT",
    displayCaseReferenceToLearner: false,
  },
};

const AUDIT_CHALLENGE_DIMENSIONS =
  resolveProductDimensions("audit-challenge");

export const AUDIT_CHALLENGE_PRESET: AuditSimulationConfiguration = {
  ...AUDIT_COMMON,
  presetId: "audit-challenge",
  ...AUDIT_CHALLENGE_DIMENSIONS,
  content: {
    packId: "PACK_CHALLENGE_COFFEE_AUDIT",
    packVersion: "1.0.0",
    scenarioId: "SCN_COFFEE_AUDIT_CHALLENGE_BANK",
    scenarioVersion: "1.0.0",
    variantBankId: "BANK_COFFEE_AUDIT_CHALLENGE_V1",
    variantBankVersion: "1.0.0",
  },
  guidance: guidancePolicyFor("CHALLENGE"),
  feedback: feedbackPolicyFor("STAGE_END"),
  hints: {
    ...hintPolicyFor("LIMITED", "CHALLENGE"),
    maximumHintsPerRun: 1,
  },
  retries: {
    knowledgeRetry: "DISABLED",
    professionalDecisionRevision: "FREE_REVISION",
    maximumKnowledgeAttempts: 1,
    maximumMitigationActions: 0,
  },
  scenarioId: "SCN_COFFEE_AUDIT_CHALLENGE_BANK",
  scenarioVersion: "1.0.0",
  auditCaseId: "AUDIT_COFFEE_CHALLENGE_BANK",
  auditCaseVersion: "1.0.0",
  scenarioSeed: "audit-challenge-bank-v1",
  scenarioVariation: {
    strategy: "SEEDED_VARIANT_BANK",
    bankId: "BANK_COFFEE_AUDIT_CHALLENGE_V1",
    bankVersion: "1.0.0",
    selectionAlgorithmVersion: "1",
    optionOrdering: "FIXED",
    attemptPolicy: "STABLE_WITHIN_ATTEMPT",
    displayCaseReferenceToLearner: true,
  },
};

const AUDIT_ASSESSMENT_DIMENSIONS =
  resolveProductDimensions("audit-assessment");

export const AUDIT_ASSESSMENT_PRESET: AuditSimulationConfiguration = {
  ...AUDIT_COMMON,
  presetId: "audit-assessment",
  ...AUDIT_ASSESSMENT_DIMENSIONS,
  content: {
    packId: "PACK_CHALLENGE_COFFEE_AUDIT",
    packVersion: "1.0.0",
    scenarioId: "SCN_COFFEE_AUDIT_CHALLENGE_BANK",
    scenarioVersion: "1.0.0",
    variantBankId: "BANK_COFFEE_AUDIT_CHALLENGE_V1",
    variantBankVersion: "1.0.0",
  },
  guidance: guidancePolicyFor("CHALLENGE"),
  feedback: feedbackPolicyFor("FINAL"),
  hints: hintPolicyFor("DISABLED", "CHALLENGE"),
  retries: {
    knowledgeRetry: "DISABLED",
    professionalDecisionRevision: "ONE_SHOT",
    maximumKnowledgeAttempts: 1,
    maximumMitigationActions: 0,
  },
  scoring: {
    ...AUDIT_COMMON.scoring,
    official: true,
  },
  scenarioId: "SCN_COFFEE_AUDIT_CHALLENGE_BANK",
  scenarioVersion: "1.0.0",
  auditCaseId: "AUDIT_COFFEE_CHALLENGE_BANK",
  auditCaseVersion: "1.0.0",
  scenarioSeed: "audit-assessment-bank-v1",
  scenarioVariation: {
    strategy: "SEEDED_VARIANT_BANK",
    bankId: "BANK_COFFEE_AUDIT_CHALLENGE_V1",
    bankVersion: "1.0.0",
    selectionAlgorithmVersion: "1",
    optionOrdering: "FIXED",
    attemptPolicy: "STABLE_WITHIN_ATTEMPT",
    displayCaseReferenceToLearner: true,
  },
};

const TECHNICAL_LAB_DIMENSIONS =
  resolveProductDimensions("technical-lab");

export const TECHNICAL_LAB_PRESET: TechnicalLabConfiguration = {
  configurationSchemaVersion: "2",
  applicationCompatibilityVersion: "tl1-v1",
  presetId: "technical-lab",
  ...TECHNICAL_LAB_DIMENSIONS,
  content: {
    packId: "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS",
    packVersion: "1.0.0",
    laboratoryPackId:
      "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS",
    laboratoryPackVersion: "1.0.0",
  },
  guidance: guidancePolicyFor(
    TECHNICAL_LAB_DIMENSIONS.supportProfile,
  ),
  feedback: feedbackPolicyFor("IMMEDIATE"),
  hints: hintPolicyFor(
    "ENABLED",
    TECHNICAL_LAB_DIMENSIONS.supportProfile,
  ),
  retries: retryPolicyFor(
    TECHNICAL_LAB_DIMENSIONS.supportProfile,
    TECHNICAL_LAB_DIMENSIONS.deliveryPurpose,
  ),
  decisions: {
    requireRationale: false,
    requireEvidenceCitations: false,
    requirePolicyCitations: false,
    requireConfidence: false,
    requireRiskEstimate: false,
    allowDrafts: false,
  },
  labPackId: "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS",
  labPackVersion: "1.0.0",
  laboratoryPresetId:
    "permissioned-blockchain-foundations",
  includedModuleIds: FIRST_TECHNICAL_LAB_MODULE_IDS,
  scoringMode: "graded",
  scoring: {
    scoringBlueprintId: "LAB_FOUNDATIONS_100",
    scoringBlueprintVersion: "1.0.0",
    maximumScore: 100,
    passScore: 70,
    official: false,
    competencyEvidenceEnabled: true,
    reportDiagnosticDimensions: true,
  },
  reporting: {
    causalReport: false,
    auditReport: false,
    competencyReport: true,
    activitySummary: true,
    showTechnicalMetadataToLearner: true,
  },
  delivery: {
    channel: "SCORM",
    persistencePolicyId: "TL1_COMPACT_JOURNAL",
    attemptPolicyId: "LMS_MANAGED",
  },
  locale: "vi",
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
  "audit-challenge": AUDIT_CHALLENGE_PRESET,
  "audit-assessment": AUDIT_ASSESSMENT_PRESET,
  "technical-lab": TECHNICAL_LAB_PRESET,
};

export function resolvePreset(
  presetId: LecturerPresetId,
): TraceChainConfiguration {
  return structuredClone(LECTURER_PRESETS[presetId]);
}
