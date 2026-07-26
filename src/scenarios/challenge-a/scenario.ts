import type {
  AnchorDocumentCommand,
  RecallBatchCommand,
} from "../../domain/commands/commands";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import {
  ScenarioStageId,
} from "../../domain/types/enums";
import type {
  KnowledgeCheckDefinition,
  ScenarioDefinition,
  ScenarioStageDefinition,
} from "../../domain/types/scenario";
import { OrganizationId } from "../coffee-traceability/organizations";
import { coffeeScenario } from "../coffee-traceability/scenario";

const IDENTIFIER_REPLACEMENTS: Readonly<Record<string, string>> = {
  BAT_GREEN_COFFEE_001: "BAT_GREEN_COFFEE_CA01",
  BAT_ROASTED_COFFEE_001: "BAT_ROASTED_COFFEE_CA01",
  BAT_PACKAGED_COFFEE_001: "BAT_PACKAGED_COFFEE_CA01",
  BAT_GREEN_COFFEE_002: "BAT_GREEN_COFFEE_CA02",
  BAT_ROASTED_COFFEE_002: "BAT_ROASTED_COFFEE_CA02",
  BAT_PACKAGED_COFFEE_002: "BAT_PACKAGED_COFFEE_CA02",
  BAT_PACKAGED_COFFEE_003: "BAT_PACKAGED_COFFEE_CA03",
  DOC_QUALITY_CERTIFICATE_001: "DOC_QUALITY_CERTIFICATE_CA01",
  CERT_QUALITY_001: "CERT_QUALITY_CA01",
  DOC_SHIPPING_MANIFEST_001: "DOC_SHIPPING_MANIFEST_CA01",
  SENSOR_HUMIDITY_001: "SENSOR_HUMIDITY_CA01",
};

function replaceIdentifiers(value: string): string {
  return Object.entries(IDENTIFIER_REPLACEMENTS).reduce(
    (result, [from, to]) => result.split(from).join(to),
    value,
  );
}

function transformScenarioValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") return replaceIdentifiers(value);
  if (typeof value === "number") {
    if (key === "amount" && value === 1000) return 1200;
    if (key === "amount" && value === 100) return 120;
    if (key === "observedQuantity" && value === 100) return 120;
    if (key === "quantity" && value === 100) return 120;
    if (key === "outputQuantity" && value === 82) return 96;
    if (key === "packageCount" && value === 820) return 960;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => transformScenarioValue(item));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        transformScenarioValue(childValue, childKey),
      ]),
    );
  }
  return value;
}

function challengeRecallCheck(
  check: KnowledgeCheckDefinition,
  primaryPackagedLotId: string,
): KnowledgeCheckDefinition {
  if (check.knowledgeCheckId !== "INT_RECALL_SCOPE") return check;
  const labelByAssetId: Readonly<Record<string, string>> = {
    BAT_PACKAGED_COFFEE_CA01: "check.challengeRecall.optionPrimary",
    BAT_ROASTED_COFFEE_CA01: "check.challengeRecall.optionAncestor",
    BAT_PACKAGED_COFFEE_CA02: "check.challengeRecall.optionNearMiss",
    BAT_PACKAGED_COFFEE_CA03: "check.challengeRecall.optionControl",
  };
  return {
    ...check,
    questionKey: "check.challengeRecall.question",
    options: check.options.map((option) => ({
      ...option,
      labelKey:
        labelByAssetId[option.optionId] ??
        "check.challengeRecall.optionControl",
    })),
    correctOptionIds: [primaryPackagedLotId],
  };
}

function challengeStage(
  stage: ScenarioStageDefinition,
  primaryPackagedLotId: string,
): ScenarioStageDefinition {
  const knowledgeChecks = stage.knowledgeChecks.map((check) =>
    challengeRecallCheck(check, primaryPackagedLotId),
  );
  if (stage.stageId === ScenarioStageId.CREATE_BATCH) {
    return {
      ...stage,
      instructionKey: "stage.challenge.createBatch.instruction",
      requiredActions: stage.requiredActions.map((action) => ({
        ...action,
        descriptionKey: "stage.challenge.createBatch.action",
      })),
      availableHints: [],
      knowledgeChecks,
    };
  }
  if (stage.stageId === ScenarioStageId.RECEIVE_AND_CORRECT) {
    return {
      ...stage,
      instructionKey: "stage.challenge.receiveAndCorrect.instruction",
      requiredActions: stage.requiredActions.map((action, index) => ({
        ...action,
        descriptionKey:
          index === 0
            ? "stage.challenge.receiveAndCorrect.actionReceive"
            : "stage.challenge.receiveAndCorrect.actionCorrect",
      })),
      knowledgeChecks,
    };
  }
  if (stage.stageId === ScenarioStageId.TRANSFORM_BATCH) {
    return {
      ...stage,
      instructionKey: "stage.challenge.transform.instruction",
      requiredActions: stage.requiredActions.map((action) => ({
        ...action,
        descriptionKey: "stage.challenge.transform.action",
      })),
      availableHints: [],
      knowledgeChecks,
    };
  }
  if (stage.stageId === ScenarioStageId.PACKAGE_AND_DISTRIBUTE) {
    return {
      ...stage,
      instructionKey: "stage.challenge.package.instruction",
      requiredActions: stage.requiredActions.map((action, index) => ({
        ...action,
        ...(index === 0
          ? { descriptionKey: "stage.challenge.package.action" }
          : {}),
      })),
      knowledgeChecks,
    };
  }
  if (stage.stageId === ScenarioStageId.RECALL_AND_DEBRIEF) {
    return {
      ...stage,
      activeActorIds: [
        "ACT_RETAIL_MANAGER",
        "ACT_PROCESSING_MANAGER",
        "ACT_REGULATORY_AUDITOR",
      ],
      knowledgeChecks,
    };
  }
  return {
    ...stage,
    availableHints: [],
    knowledgeChecks,
  };
}

const transformed = transformScenarioValue(
  coffeeScenario,
) as ScenarioDefinition;
const sourceBatchId = transformed.runtime.assetRoles.sourceBatchId;
const primaryPackagedLotId =
  transformed.runtime.assetRoles.primaryPackagedLotId;
const initialAnchor = transformed.runtime.learnerCommandTemplates[
  "ANCHOR_CERTIFICATE"
] as AnchorDocumentCommand;
const remediatedAnchor: AnchorDocumentCommand = {
  ...initialAnchor,
  issuerOrganizationId: OrganizationId.CERTIFICATION_BODY,
  contentHash: sha256Hex(
    `Challenge A authorized certificate for ${sourceBatchId}`,
  ),
};
const challengeAnchor: AnchorDocumentCommand = {
  ...initialAnchor,
  issuerOrganizationId: OrganizationId.UNRECOGNIZED_CERTIFIER,
  contentHash: sha256Hex(
    `Challenge A unrecognized certificate for ${sourceBatchId}`,
  ),
};
const recall = transformed.runtime.learnerCommandTemplates[
  "RECALL_BATCH"
] as RecallBatchCommand;
const scripts = transformed.scriptedTransactions.map((script) => {
  const command = script.command as AnchorDocumentCommand;
  if (command.documentType !== "SHIPPING_MANIFEST") return script;
  return {
    ...script,
    command: {
      ...command,
      contentHash: sha256Hex(
        `Challenge A manifest for ${sourceBatchId}: declared 1200 KG`,
      ),
    },
  };
});

export const challengeAScenario: ScenarioDefinition = {
  ...transformed,
  scenarioId: "SCN_COFFEE_CHALLENGE_A",
  scenarioVersion: "1.2.0",
  titleKey: "challenge.title",
  descriptionKey: "challenge.description",
  estimatedMinutes: 22,
  scriptedTransactions: scripts,
  stages: transformed.stages.map((stage) =>
    challengeStage(stage, primaryPackagedLotId),
  ),
  runtime: {
    ...transformed.runtime,
    learnerCommandTemplates: {
      ...transformed.runtime.learnerCommandTemplates,
      ANCHOR_CERTIFICATE: challengeAnchor,
      RECALL_BATCH: {
        ...recall,
        sourceAssetId: primaryPackagedLotId,
      },
    },
    commandContextByAction: {
      ...transformed.runtime.commandContextByAction,
      // Challenge A demonstrates a genuine signature from a
      // scenario-controlled but unrecognized educational identity.
      SUSPICIOUS_CERTIFICATE: "CTX_UNRECOGNIZED_CERTIFIER",
    },
    mitigationCommandTemplates: {
      ANCHOR_CERTIFICATE: remediatedAnchor,
    },
    consequentialCases: {
      certificate: {
        certificateAssessment: "VALID",
        issuerAssessment: "UNRECOGNIZED",
        requiredStorageChoice: "HASH_OFF_CHAIN",
      },
      discrepancy: {
        reasonSuggestionKey:
          "stage.challenge.receiveAndCorrect.reasonSuggestion",
        authoredCauseCode: "UNKNOWN",
      },
    },
    roleHandoffs: [
      ...transformed.runtime.roleHandoffs.filter(
        (handoff) =>
          handoff.stageId !== ScenarioStageId.RECALL_AND_DEBRIEF,
      ),
      {
        handoffId: "HANDOFF_RETAILER_TO_INTERNAL_REVIEW",
        stageId: ScenarioStageId.RECALL_AND_DEBRIEF,
        fromContextId: "CTX_RETAILER",
        toContextId: "CTX_PROCESSOR",
        labelKey: "stage.recallAndDebrief.handoffInternalReview",
      },
      {
        handoffId: "HANDOFF_RETAILER_TO_EXTERNAL_AUTHORITY",
        stageId: ScenarioStageId.RECALL_AND_DEBRIEF,
        fromContextId: "CTX_RETAILER",
        toContextId: "CTX_REGULATOR",
        labelKey: "stage.recallAndDebrief.handoffExternalAuthority",
      },
      {
        handoffId: "HANDOFF_INTERNAL_TO_EXTERNAL_AUTHORITY",
        stageId: ScenarioStageId.RECALL_AND_DEBRIEF,
        fromContextId: "CTX_PROCESSOR",
        toContextId: "CTX_REGULATOR",
        labelKey: "stage.recallAndDebrief.handoffEscalateExternal",
      },
    ],
    journalLimits: {
      ...transformed.runtime.journalLimits,
      maximumStage9Handoffs: 2,
    },
    assetRoles: {
      ...transformed.runtime.assetRoles,
      recallSourceAssetId: primaryPackagedLotId,
    },
  },
};
