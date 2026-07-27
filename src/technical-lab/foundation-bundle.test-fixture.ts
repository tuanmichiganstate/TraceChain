import type { TechnicalLabConfiguration } from "../config/types";
import {
  feedbackPolicyFor,
  guidancePolicyFor,
  hintPolicyFor,
  resolveProductDimensions,
  retryPolicyFor,
} from "../config/experience";
import {
  FIRST_TECHNICAL_LAB_MODULE_IDS,
  type TechnicalLabPackBundle,
} from "./contracts";
import { permissionedFoundationsLabBundle } from "./permissioned-foundations-pack";

export function validTechnicalLabBundle(): TechnicalLabPackBundle {
  return structuredClone(permissionedFoundationsLabBundle);
}

export function validTechnicalLabConfiguration():
  TechnicalLabConfiguration {
  const dimensions = resolveProductDimensions("technical-lab");
  return {
    configurationSchemaVersion: "2",
    applicationCompatibilityVersion: "tl1-v1",
    presetId: "technical-lab",
    ...dimensions,
    content: {
      packId: "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS",
      packVersion: "1.0.0",
      laboratoryPackId:
        "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS",
      laboratoryPackVersion: "1.0.0",
    },
    guidance: guidancePolicyFor(dimensions.supportProfile),
    feedback: feedbackPolicyFor("IMMEDIATE"),
    hints: hintPolicyFor(
      "ENABLED",
      dimensions.supportProfile,
    ),
    retries: retryPolicyFor(
      dimensions.supportProfile,
      dimensions.deliveryPurpose,
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
}
