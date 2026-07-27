import { ScenarioStageId } from "../../domain/types/enums";
import type {
  ScenarioDefinition,
  ScenarioStageDefinition,
} from "../../domain/types/scenario";
import { coffeeScenario } from "../coffee-traceability/scenario";
import { createChallengeScenario } from "../challenge-a/variant-builder";

const instructionKeys = {
  [ScenarioStageId.ORIENTATION]:
    "stage.practiceA.orientation.instruction",
  [ScenarioStageId.CREATE_BATCH]:
    "stage.practiceA.createBatch.instruction",
  [ScenarioStageId.ANCHOR_CERTIFICATE]:
    "stage.practiceA.anchorCertificate.instruction",
  [ScenarioStageId.SHIP_AND_MONITOR]:
    "stage.practiceA.shipAndMonitor.instruction",
  [ScenarioStageId.RECEIVE_AND_CORRECT]:
    "stage.practiceA.receiveAndCorrect.instruction",
  [ScenarioStageId.TRANSFORM_BATCH]:
    "stage.practiceA.transform.instruction",
  [ScenarioStageId.PACKAGE_AND_DISTRIBUTE]:
    "stage.practiceA.package.instruction",
  [ScenarioStageId.VERIFY_AND_TAMPER]:
    "stage.practiceA.verifyAndTamper.instruction",
  [ScenarioStageId.RECALL_AND_DEBRIEF]:
    "stage.practiceA.recall.instruction",
} as const satisfies Readonly<
  Record<ScenarioStageId, string>
>;

function practiceStage(
  stage: ScenarioStageDefinition,
): ScenarioStageDefinition {
  const standardStage = coffeeScenario.stages.find(
    (candidate) => candidate.stageId === stage.stageId,
  );
  if (standardStage === undefined) {
    throw new Error(
      `Practice case cannot resolve stage ${stage.stageId}`,
    );
  }
  return {
    ...stage,
    instructionKey: instructionKeys[stage.stageId],
    availableHints: standardStage.availableHints,
  };
}

const practiceCase = createChallengeScenario({
  identifierSuffix: "PA01",
  manifestQuantityKg: 680,
  receivedQuantityKg: 85,
  roastedQuantityKg: 68,
  packageCount: 680,
  instructionKeyPrefix: "stage.practiceA",
  certificate: {
    assessment: "CONTENT_INVALID",
    issuerAssessment: "RECOGNIZED_AUTHORIZED",
    issuerKind: "AUTHORIZED",
    contentEvidenceKey:
      "stage.anchorCertificate.contentEvidence.practiceA",
  },
  discrepancy: {
    causeCode: "UNIT_MISMATCH",
    causeEvidenceKey:
      "stage.receiveAndCorrect.causeEvidence.practiceA",
    reasonSuggestionKey:
      "stage.practiceA.receiveAndCorrect.reasonSuggestion",
  },
  recallPattern: "ROASTED_LINEAGE",
});

export const practiceAScenario: ScenarioDefinition = {
  ...practiceCase,
  scenarioId: "SCN_COFFEE_PRACTICE",
  scenarioVersion: "1.0.0",
  titleKey: "practice.title",
  descriptionKey: "practice.description",
  estimatedMinutes: 28,
  stages: practiceCase.stages.map(practiceStage),
};
