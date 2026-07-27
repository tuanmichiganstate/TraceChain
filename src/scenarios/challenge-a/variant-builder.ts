import type {
  AnchorDocumentCommand,
  RecallBatchCommand,
} from "../../domain/commands/commands";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import { ScenarioStageId } from "../../domain/types/enums";
import type {
  KnowledgeCheckDefinition,
  ScenarioDefinition,
  ScenarioStageDefinition,
} from "../../domain/types/scenario";
import type {
  CertificateAssessment,
  IssuerAssessment,
  SubmitDiscrepancyDecisionCommand,
} from "../../domain/simulation/types";
import { OrganizationId } from "../coffee-traceability/organizations";
import { coffeeScenario } from "../coffee-traceability/scenario";

type DiscrepancyCause =
  SubmitDiscrepancyDecisionCommand["causeCode"];

export interface ChallengeVariantSpec {
  readonly identifierSuffix:
    | "PA01"
    | "CA01"
    | "CB01"
    | "CC01";
  readonly manifestQuantityKg: number;
  readonly receivedQuantityKg: number;
  readonly roastedQuantityKg: number;
  readonly packageCount: number;
  readonly instructionKeyPrefix:
    | "stage.practiceA"
    | "stage.challengeA"
    | "stage.challengeB"
    | "stage.challengeC";
  readonly certificate: {
    readonly assessment: CertificateAssessment;
    readonly issuerAssessment: IssuerAssessment;
    readonly issuerKind: "AUTHORIZED" | "UNRECOGNIZED";
    readonly expiresBeforeReview?: boolean;
    readonly contentEvidenceKey: string;
  };
  readonly discrepancy: {
    readonly causeCode: DiscrepancyCause;
    readonly causeEvidenceKey: string;
    readonly reasonSuggestionKey: string;
  };
  readonly recallPattern:
    | "PACKAGED_ONLY"
    | "ROASTED_LINEAGE"
    | "FULL_LINEAGE";
}

function identifierReplacements(
  suffix: ChallengeVariantSpec["identifierSuffix"],
): Readonly<Record<string, string>> {
  return {
    BAT_GREEN_COFFEE_001: `BAT_GREEN_COFFEE_${suffix}`,
    BAT_ROASTED_COFFEE_001: `BAT_ROASTED_COFFEE_${suffix}`,
    BAT_PACKAGED_COFFEE_001: `BAT_PACKAGED_COFFEE_${suffix}`,
    BAT_GREEN_COFFEE_002: `BAT_GREEN_COFFEE_${suffix.slice(0, 2)}02`,
    BAT_ROASTED_COFFEE_002: `BAT_ROASTED_COFFEE_${suffix.slice(0, 2)}02`,
    BAT_PACKAGED_COFFEE_002: `BAT_PACKAGED_COFFEE_${suffix.slice(0, 2)}02`,
    BAT_PACKAGED_COFFEE_003: `BAT_PACKAGED_COFFEE_${suffix.slice(0, 2)}03`,
    DOC_QUALITY_CERTIFICATE_001:
      `DOC_QUALITY_CERTIFICATE_${suffix}`,
    CERT_QUALITY_001: `CERT_QUALITY_${suffix}`,
    DOC_SHIPPING_MANIFEST_001:
      `DOC_SHIPPING_MANIFEST_${suffix}`,
    SENSOR_HUMIDITY_001: `SENSOR_HUMIDITY_${suffix}`,
  };
}

function replaceIdentifiers(
  value: string,
  replacements: Readonly<Record<string, string>>,
): string {
  return Object.entries(replacements).reduce(
    (result, [from, to]) => result.split(from).join(to),
    value,
  );
}

function transformScenarioValue(
  value: unknown,
  spec: ChallengeVariantSpec,
  replacements: Readonly<Record<string, string>>,
  key = "",
): unknown {
  if (typeof value === "string") {
    return replaceIdentifiers(value, replacements);
  }
  if (typeof value === "number") {
    if (key === "amount" && value === 1000) {
      return spec.manifestQuantityKg;
    }
    if (key === "amount" && value === 100) {
      return spec.receivedQuantityKg;
    }
    if (key === "observedQuantity" && value === 100) {
      return spec.receivedQuantityKg;
    }
    if (key === "quantity" && value === 100) {
      return spec.receivedQuantityKg;
    }
    if (key === "outputQuantity" && value === 82) {
      return spec.roastedQuantityKg;
    }
    if (key === "packageCount" && value === 820) {
      return spec.packageCount;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      transformScenarioValue(item, spec, replacements),
    );
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        transformScenarioValue(
          childValue,
          spec,
          replacements,
          childKey,
        ),
      ]),
    );
  }
  return value;
}

function challengeRecallCheck(
  check: KnowledgeCheckDefinition,
  spec: ChallengeVariantSpec,
  roles: ScenarioDefinition["runtime"]["assetRoles"],
): KnowledgeCheckDefinition {
  if (check.knowledgeCheckId !== "INT_RECALL_SCOPE") return check;
  const prefix = spec.identifierSuffix.slice(0, 2);
  const nearMissId = `BAT_PACKAGED_COFFEE_${prefix}02`;
  const controlId = `BAT_PACKAGED_COFFEE_${prefix}03`;
  const labels = {
    [roles.primaryPackagedLotId]:
      "check.challengeRecall.optionPrimary",
    [roles.transformedBatchId]:
      "check.challengeRecall.optionAncestor",
    [roles.sourceBatchId]: "check.challengeRecall.optionSource",
    [nearMissId]: "check.challengeRecall.optionNearMiss",
    [controlId]: "check.challengeRecall.optionControl",
  } as const;
  const optionIds =
    spec.recallPattern === "FULL_LINEAGE"
      ? [
          roles.primaryPackagedLotId,
          roles.transformedBatchId,
          roles.sourceBatchId,
          nearMissId,
        ]
      : [
          roles.primaryPackagedLotId,
          roles.transformedBatchId,
          nearMissId,
          controlId,
        ];
  const correctOptionIds =
    spec.recallPattern === "PACKAGED_ONLY"
      ? [roles.primaryPackagedLotId]
      : spec.recallPattern === "ROASTED_LINEAGE"
        ? [roles.transformedBatchId, roles.primaryPackagedLotId]
        : [
            roles.sourceBatchId,
            roles.transformedBatchId,
            roles.primaryPackagedLotId,
          ];
  return {
    ...check,
    questionKey: "check.challengeRecall.question",
    options: optionIds.map((optionId) => ({
      optionId,
      labelKey: labels[optionId] as string,
    })),
    correctOptionIds,
  };
}

function challengeStage(
  stage: ScenarioStageDefinition,
  spec: ChallengeVariantSpec,
  roles: ScenarioDefinition["runtime"]["assetRoles"],
): ScenarioStageDefinition {
  const knowledgeChecks = stage.knowledgeChecks.map((check) =>
    challengeRecallCheck(check, spec, roles),
  );
  const key = (suffix: string): string =>
    `${spec.instructionKeyPrefix}.${suffix}`;
  if (stage.stageId === ScenarioStageId.CREATE_BATCH) {
    return {
      ...stage,
      instructionKey: key("createBatch.instruction"),
      requiredActions: stage.requiredActions.map((action) => ({
        ...action,
        descriptionKey: key("createBatch.action"),
      })),
      availableHints: [],
      knowledgeChecks,
    };
  }
  if (stage.stageId === ScenarioStageId.RECEIVE_AND_CORRECT) {
    return {
      ...stage,
      instructionKey: key("receiveAndCorrect.instruction"),
      requiredActions: stage.requiredActions.map((action, index) => ({
        ...action,
        descriptionKey:
          index === 0
            ? key("receiveAndCorrect.actionReceive")
            : key("receiveAndCorrect.actionCorrect"),
      })),
      knowledgeChecks,
    };
  }
  if (stage.stageId === ScenarioStageId.TRANSFORM_BATCH) {
    return {
      ...stage,
      instructionKey: key("transform.instruction"),
      requiredActions: stage.requiredActions.map((action) => ({
        ...action,
        descriptionKey: key("transform.action"),
      })),
      availableHints: [],
      knowledgeChecks,
    };
  }
  if (stage.stageId === ScenarioStageId.PACKAGE_AND_DISTRIBUTE) {
    return {
      ...stage,
      instructionKey: key("package.instruction"),
      requiredActions: stage.requiredActions.map((action, index) => ({
        ...action,
        ...(index === 0
          ? { descriptionKey: key("package.action") }
          : {}),
      })),
      knowledgeChecks,
    };
  }
  if (stage.stageId === ScenarioStageId.RECALL_AND_DEBRIEF) {
    return {
      ...stage,
      instructionKey: key("recall.instruction"),
      activeActorIds: [
        "ACT_RETAIL_MANAGER",
        "ACT_PROCESSING_MANAGER",
        "ACT_REGULATORY_AUDITOR",
      ],
      requiredActions: stage.requiredActions.map((action) =>
        action.actionId === "ACTION_DETERMINE_SCOPE"
          ? {
              ...action,
              descriptionKey: key("recall.actionScope"),
            }
          : action,
      ),
      knowledgeChecks,
    };
  }
  return {
    ...stage,
    availableHints: [],
    knowledgeChecks,
  };
}

function recallSource(
  spec: ChallengeVariantSpec,
  roles: ScenarioDefinition["runtime"]["assetRoles"],
): string {
  if (spec.recallPattern === "PACKAGED_ONLY") {
    return roles.primaryPackagedLotId;
  }
  if (spec.recallPattern === "ROASTED_LINEAGE") {
    return roles.transformedBatchId;
  }
  return roles.sourceBatchId;
}

export function createChallengeScenario(
  spec: ChallengeVariantSpec,
): ScenarioDefinition {
  const transformed = transformScenarioValue(
    coffeeScenario,
    spec,
    identifierReplacements(spec.identifierSuffix),
  ) as ScenarioDefinition;
  const roles = transformed.runtime.assetRoles;
  const sourceBatchId = roles.sourceBatchId;
  const initialAnchor = transformed.runtime.learnerCommandTemplates[
    "ANCHOR_CERTIFICATE"
  ] as AnchorDocumentCommand;
  const remediatedAnchor: AnchorDocumentCommand = {
    ...initialAnchor,
    issuerOrganizationId: OrganizationId.CERTIFICATION_BODY,
    contentHash: sha256Hex(
      `${spec.identifierSuffix} authorized certificate for ${sourceBatchId}`,
    ),
  };
  const challengeAnchor: AnchorDocumentCommand = {
    ...initialAnchor,
    issuerOrganizationId:
      spec.certificate.issuerKind === "UNRECOGNIZED"
        ? OrganizationId.UNRECOGNIZED_CERTIFIER
        : OrganizationId.CERTIFICATION_BODY,
    ...(spec.certificate.expiresBeforeReview === true
      ? {
          issuedAt: "2025-01-15T03:00:00.000Z",
          expiresAt: "2026-01-14T03:00:00.000Z",
        }
      : {}),
    contentHash: sha256Hex(
      `${spec.identifierSuffix} reviewed certificate for ${sourceBatchId}`,
    ),
  };
  const recall = transformed.runtime.learnerCommandTemplates[
    "RECALL_BATCH"
  ] as RecallBatchCommand;
  const selectedRecallSource = recallSource(spec, roles);
  const scripts = transformed.scriptedTransactions.map((script) => {
    const command = script.command as AnchorDocumentCommand;
    if (command.documentType !== "SHIPPING_MANIFEST") return script;
    return {
      ...script,
      command: {
        ...command,
        contentHash: sha256Hex(
          `${spec.identifierSuffix} manifest for ${sourceBatchId}: declared ${String(spec.manifestQuantityKg)} KG`,
        ),
      },
    };
  });

  return {
    ...transformed,
    scenarioId: "SCN_COFFEE_CHALLENGE",
    scenarioVersion: "2.0.0",
    titleKey: "challenge.title",
    descriptionKey: "challenge.description",
    estimatedMinutes: 22,
    scriptedTransactions: scripts,
    stages: transformed.stages.map((stage) =>
      challengeStage(stage, spec, roles),
    ),
    runtime: {
      ...transformed.runtime,
      learnerCommandTemplates: {
        ...transformed.runtime.learnerCommandTemplates,
        ANCHOR_CERTIFICATE: challengeAnchor,
        RECALL_BATCH: {
          ...recall,
          sourceAssetId: selectedRecallSource,
        },
      },
      commandContextByAction: {
        ...transformed.runtime.commandContextByAction,
        SUSPICIOUS_CERTIFICATE:
          spec.certificate.issuerKind === "UNRECOGNIZED"
            ? "CTX_UNRECOGNIZED_CERTIFIER"
            : "CTX_LOGISTICS",
      },
      mitigationCommandTemplates: {
        ANCHOR_CERTIFICATE: remediatedAnchor,
      },
      consequentialCases: {
        certificate: {
          certificateAssessment: spec.certificate.assessment,
          issuerAssessment: spec.certificate.issuerAssessment,
          requiredStorageChoice: "HASH_OFF_CHAIN",
          contentEvidenceKey:
            spec.certificate.contentEvidenceKey,
        },
        discrepancy: {
          reasonSuggestionKey:
            spec.discrepancy.reasonSuggestionKey,
          causeEvidenceKey: spec.discrepancy.causeEvidenceKey,
          authoredCauseCode: spec.discrepancy.causeCode,
        },
      },
      roleHandoffs: [
        ...transformed.runtime.roleHandoffs.filter(
          (handoff) =>
            handoff.stageId !==
            ScenarioStageId.RECALL_AND_DEBRIEF,
        ),
        {
          handoffId: "HANDOFF_RETAILER_TO_INTERNAL_REVIEW",
          stageId: ScenarioStageId.RECALL_AND_DEBRIEF,
          fromContextId: "CTX_RETAILER",
          toContextId: "CTX_PROCESSOR",
          labelKey:
            "stage.recallAndDebrief.handoffInternalReview",
        },
        {
          handoffId:
            "HANDOFF_RETAILER_TO_EXTERNAL_AUTHORITY",
          stageId: ScenarioStageId.RECALL_AND_DEBRIEF,
          fromContextId: "CTX_RETAILER",
          toContextId: "CTX_REGULATOR",
          labelKey:
            "stage.recallAndDebrief.handoffExternalAuthority",
        },
        {
          handoffId:
            "HANDOFF_INTERNAL_TO_EXTERNAL_AUTHORITY",
          stageId: ScenarioStageId.RECALL_AND_DEBRIEF,
          fromContextId: "CTX_PROCESSOR",
          toContextId: "CTX_REGULATOR",
          labelKey:
            "stage.recallAndDebrief.handoffEscalateExternal",
        },
      ],
      journalLimits: {
        ...transformed.runtime.journalLimits,
        maximumStage9Handoffs: 2,
      },
      assetRoles: {
        ...roles,
        recallSourceAssetId: selectedRecallSource,
      },
    },
  };
}
