import { createChallengeScenario } from "./variant-builder";

export const challengeAScenario = createChallengeScenario({
  identifierSuffix: "CA01",
  manifestQuantityKg: 1200,
  receivedQuantityKg: 120,
  roastedQuantityKg: 96,
  packageCount: 960,
  instructionKeyPrefix: "stage.challengeA",
  certificate: {
    assessment: "VALID",
    issuerAssessment: "UNRECOGNIZED",
    issuerKind: "UNRECOGNIZED",
    contentEvidenceKey:
      "stage.anchorCertificate.contentEvidence.challengeA",
  },
  discrepancy: {
    causeCode: "UNKNOWN",
    causeEvidenceKey:
      "stage.receiveAndCorrect.causeEvidence.challengeA",
    reasonSuggestionKey:
      "stage.challengeA.receiveAndCorrect.reasonSuggestion",
  },
  recallPattern: "PACKAGED_ONLY",
});
