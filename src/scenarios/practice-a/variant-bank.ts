import {
  assessmentBlueprintFromScenario,
  hashAnswerPattern,
  hashScenarioVariant,
  type ScenarioVariant,
  type ScenarioVariantBank,
} from "../../domain/scenario/variant-bank";
import { practiceAScenario } from "./scenario";

export const practiceVariants = [
  {
    metadata: {
      variantId: "PRACTICE_A",
      variantVersion: "1.0.0",
      caseReference: "PR-01",
      contentHash: hashScenarioVariant(practiceAScenario),
      answerPatternHash: hashAnswerPattern({
        certificate: [
          "CONTENT_INVALID",
          "RECOGNIZED_AUTHORIZED",
          "HOLD",
        ],
        discrepancy: [
          "UNIT_MISMATCH",
          "APPEND_CORRECTION",
        ],
        recall: "ROASTED_LINEAGE",
      }),
      difficultyBand: "INTERMEDIATE",
      estimatedMinutes: practiceAScenario.estimatedMinutes,
      variationProfile: {
        certificateCondition:
          "CONTENT_INVALID_AUTHORIZED_ISSUER",
        discrepancyPattern:
          "UNIT_SCOPE_MISMATCH_CONFIRMED",
        provenancePattern: "ROASTED_SOURCE",
        recallPattern: "TWO_AFFECTED_ASSETS",
        evidencePattern:
          "SCOPE_AND_MEASUREMENT_RECORDS",
      },
    },
    scenario: practiceAScenario,
  },
] as const satisfies readonly ScenarioVariant[];

export const practiceVariantBank: ScenarioVariantBank = {
  bankId: "BANK_COFFEE_PRACTICE_V1",
  bankVersion: "1.0.0",
  status: "DRAFT",
  titleKey: "practice.bank.title",
  descriptionKey: "practice.bank.description",
  supportedModes: ["PRACTICE"],
  blueprint: assessmentBlueprintFromScenario({
    blueprintId: "BLUEPRINT_COFFEE_PRACTICE_V1",
    blueprintVersion: "1.0.0",
    scenario: practiceAScenario,
    equivalence: {
      targetCompetencyIndicatorIds: [
        "BC3.PI1",
        "BC6.PI1",
        "BC6.PI2",
        "PC5.PI1",
      ],
      evidenceRoles: [
        "CERTIFICATE_AND_ISSUER_REGISTRY",
        "PHYSICAL_RECEIPT_AND_CORRECTION",
        "PROVENANCE_AND_RECALL_SCOPE",
      ],
      consequentialDecisionRoles: [
        "INT_CERTIFICATE_INITIAL_SUBMITTED",
        "INT_DISCREPANCY_INITIAL_SUBMITTED",
        "INT_RECALL_INITIAL_SUBMITTED",
        "INT_RECALL_AUTHORIZATION_RESOLVED",
      ],
      feedbackPolicy: "IMMEDIATE",
      hintPolicy: "ENABLED",
      estimatedMinutes: {
        minimum: 20,
        maximum: 40,
      },
      complexityBand: "INTERMEDIATE",
    },
  }),
  variants: practiceVariants,
};
