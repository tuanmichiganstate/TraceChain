import { createChallengeScenario } from "./variant-builder";

export const challengeCScenario = createChallengeScenario({
  identifierSuffix: "CC01",
  manifestQuantityKg: 900,
  receivedQuantityKg: 90,
  roastedQuantityKg: 72,
  packageCount: 720,
  instructionKeyPrefix: "stage.challengeC",
  certificate: {
    assessment: "VALID",
    issuerAssessment: "RECOGNIZED_AUTHORIZED",
    issuerKind: "AUTHORIZED",
    contentEvidenceKey:
      "stage.anchorCertificate.contentEvidence.challengeC",
  },
  discrepancy: {
    causeCode: "TYPING_ERROR",
    causeEvidenceKey:
      "stage.receiveAndCorrect.causeEvidence.challengeC",
    reasonSuggestionKey:
      "stage.challengeC.receiveAndCorrect.reasonSuggestion",
  },
  recallPattern: "FULL_LINEAGE",
});
