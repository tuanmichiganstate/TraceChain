import { createChallengeScenario } from "./variant-builder";

export const challengeBScenario = createChallengeScenario({
  identifierSuffix: "CB01",
  manifestQuantityKg: 750,
  receivedQuantityKg: 75,
  roastedQuantityKg: 60,
  packageCount: 600,
  instructionKeyPrefix: "stage.challengeB",
  certificate: {
    assessment: "EXPIRED",
    issuerAssessment: "RECOGNIZED_AUTHORIZED",
    issuerKind: "AUTHORIZED",
    expiresBeforeReview: true,
    contentEvidenceKey:
      "stage.anchorCertificate.contentEvidence.challengeB",
  },
  discrepancy: {
    causeCode: "FRAUD",
    causeEvidenceKey:
      "stage.receiveAndCorrect.causeEvidence.challengeB",
    reasonSuggestionKey:
      "stage.challengeB.receiveAndCorrect.reasonSuggestion",
  },
  recallPattern: "ROASTED_LINEAGE",
});
