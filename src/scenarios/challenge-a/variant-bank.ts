import {
  assessmentBlueprintFromScenario,
  hashAnswerPattern,
  hashScenarioVariant,
  type ScenarioVariant,
  type ScenarioVariantBank,
} from "../../domain/scenario/variant-bank";
import { challengeBScenario } from "./challenge-b";
import { challengeCScenario } from "./challenge-c";
import { challengeAScenario } from "./scenario";

function variant(
  options: Omit<
    ScenarioVariant["metadata"],
    "contentHash" | "difficultyBand" | "estimatedMinutes"
  > & {
    readonly scenario: ScenarioVariant["scenario"];
  },
): ScenarioVariant {
  return {
    metadata: {
      variantId: options.variantId,
      variantVersion: options.variantVersion,
      caseReference: options.caseReference,
      contentHash: hashScenarioVariant(options.scenario),
      answerPatternHash: options.answerPatternHash,
      difficultyBand: "INTERMEDIATE",
      estimatedMinutes: options.scenario.estimatedMinutes,
      variationProfile: options.variationProfile,
    },
    scenario: options.scenario,
  };
}

export const challengeVariants = [
  variant({
    variantId: "CHALLENGE_A",
    variantVersion: "1.0.0",
    caseReference: "CH-01",
    scenario: challengeAScenario,
    answerPatternHash: hashAnswerPattern({
      certificate: ["VALID", "UNRECOGNIZED", "HOLD"],
      discrepancy: ["UNKNOWN", "INVESTIGATE_THEN_CORRECT"],
      recall: "PACKAGED_ONLY",
    }),
    variationProfile: {
      certificateCondition: "VALID_UNRECOGNIZED_ISSUER",
      discrepancyPattern: "TENFOLD_UNKNOWN_CAUSE",
      provenancePattern: "PACKAGED_SOURCE",
      recallPattern: "ONE_AFFECTED_PACKAGED_LOT",
      evidencePattern: "MISSING_SOURCE_NOTE",
    },
  }),
  variant({
    variantId: "CHALLENGE_B",
    variantVersion: "1.0.0",
    caseReference: "CH-02",
    scenario: challengeBScenario,
    answerPatternHash: hashAnswerPattern({
      certificate: [
        "EXPIRED",
        "RECOGNIZED_AUTHORIZED",
        "HOLD",
      ],
      discrepancy: ["FRAUD", "APPEND_CORRECTION"],
      recall: "ROASTED_LINEAGE",
    }),
    variationProfile: {
      certificateCondition: "EXPIRED_RECOGNIZED_ISSUER",
      discrepancyPattern: "TENFOLD_CONFIRMED_FRAUD",
      provenancePattern: "ROASTED_SOURCE",
      recallPattern: "TWO_AFFECTED_ASSETS",
      evidencePattern: "CONFLICTING_SIGNED_RECORDS",
    },
  }),
  variant({
    variantId: "CHALLENGE_C",
    variantVersion: "1.0.0",
    caseReference: "CH-03",
    scenario: challengeCScenario,
    answerPatternHash: hashAnswerPattern({
      certificate: [
        "VALID",
        "RECOGNIZED_AUTHORIZED",
        "CONTINUE",
      ],
      discrepancy: ["TYPING_ERROR", "APPEND_CORRECTION"],
      recall: "FULL_LINEAGE",
    }),
    variationProfile: {
      certificateCondition: "VALID_AUTHORIZED_ISSUER",
      discrepancyPattern: "TENFOLD_CONFIRMED_TYPING_ERROR",
      provenancePattern: "GREEN_BATCH_SOURCE",
      recallPattern: "THREE_AFFECTED_LINEAGE_ASSETS",
      evidencePattern: "COMPLETE_CORROBORATING_RECORDS",
    },
  }),
] as const satisfies readonly ScenarioVariant[];

export const challengeVariantBank: ScenarioVariantBank = {
  bankId: "BANK_COFFEE_CHALLENGE_V1",
  bankVersion: "1.0.0",
  status: "DRAFT",
  titleKey: "challenge.bank.title",
  descriptionKey: "challenge.bank.description",
  supportedModes: ["CHALLENGE"],
  blueprint: assessmentBlueprintFromScenario({
    blueprintId: "BLUEPRINT_COFFEE_CHALLENGE_V1",
    blueprintVersion: "1.0.0",
    scenario: challengeAScenario,
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
      feedbackPolicy: "STAGE_END",
      hintPolicy: "LIMITED",
      estimatedMinutes: {
        minimum: 15,
        maximum: 30,
      },
      complexityBand: "INTERMEDIATE",
    },
  }),
  variants: challengeVariants,
};
