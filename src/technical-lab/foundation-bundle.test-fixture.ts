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
  type TechnicalExperimentActionType,
  type TechnicalLabModuleDefinition,
  type TechnicalLabPackBundle,
  type TechnicalLabRendererId,
} from "./contracts";

const RENDERERS: readonly TechnicalLabRendererId[] = [
  "hash-avalanche",
  "canonical-serialization",
  "digital-signature",
  "identity-authorization",
  "endorsement-policy",
  "proposal-mismatch",
  "state-version-conflict",
];

const ACTIONS: readonly (readonly TechnicalExperimentActionType[])[] = [
  [
    "VIEW_INPUT",
    "EDIT_INPUT",
    "HASH",
    "COMPARE_DIGESTS",
    "RESET_EXPERIMENT_COPY",
  ],
  [
    "VIEW_INPUT",
    "EDIT_INPUT",
    "CANONICALIZE",
    "HASH",
    "COMPARE_DIGESTS",
    "RESET_EXPERIMENT_COPY",
  ],
  [
    "VIEW_INPUT",
    "CANONICALIZE",
    "HASH",
    "SIGN",
    "VERIFY_SIGNATURE",
    "EDIT_INPUT",
    "RESET_EXPERIMENT_COPY",
  ],
  [
    "VIEW_INPUT",
    "VERIFY_SIGNATURE",
    "RESOLVE_IDENTITY",
    "CHECK_AUTHORIZATION",
    "COMMIT_TRANSACTION",
    "RESET_EXPERIMENT_COPY",
  ],
  [
    "VIEW_INPUT",
    "SIGN",
    "VERIFY_SIGNATURE",
    "ADD_ENDORSEMENT",
    "EVALUATE_POLICY",
    "RESET_EXPERIMENT_COPY",
  ],
  [
    "VIEW_INPUT",
    "EDIT_INPUT",
    "CANONICALIZE",
    "HASH",
    "SIGN",
    "VERIFY_SIGNATURE",
    "ADD_ENDORSEMENT",
    "EVALUATE_POLICY",
    "COMPARE_DIGESTS",
    "RESET_EXPERIMENT_COPY",
  ],
  [
    "VIEW_INPUT",
    "EDIT_INPUT",
    "CANONICALIZE",
    "HASH",
    "SIGN",
    "VERIFY_SIGNATURE",
    "RESOLVE_IDENTITY",
    "CHECK_AUTHORIZATION",
    "ADD_ENDORSEMENT",
    "EVALUATE_POLICY",
    "ADVANCE_ASSET_VERSION",
    "VALIDATE_STATE_VERSION",
    "COMMIT_TRANSACTION",
    "RESET_EXPERIMENT_COPY",
  ],
];

const SCORE_POINTS = [
  [4, 4, 2],
  [4, 4, 2],
  [6, 6, 3],
  [6, 6, 3],
  [6, 6, 3],
  [6, 6, 3],
  [8, 8, 4],
] as const;

function moduleDefinition(
  index: number,
): TechnicalLabModuleDefinition {
  const moduleId = FIRST_TECHNICAL_LAB_MODULE_IDS[index];
  const rendererId = RENDERERS[index];
  const actions = ACTIONS[index];
  if (
    moduleId === undefined ||
    rendererId === undefined ||
    actions === undefined
  ) {
    throw new Error("The first-release module fixture is incomplete");
  }
  return {
    moduleId,
    moduleVersion: "1.0.0",
    title: {
      localizationKey: `technicalLab.${moduleId}.title`,
    },
    summary: {
      localizationKey: `technicalLab.${moduleId}.summary`,
    },
    learningOutcomes: [
      {
        localizationKey: `technicalLab.${moduleId}.outcome`,
      },
    ],
    prerequisiteModuleIds:
      index === 0
        ? []
        : [FIRST_TECHNICAL_LAB_MODULE_IDS[index - 1]!],
    estimatedMinutes: index === 6 ? 12 : 8,
    rendererId,
    experimentDefinitions: [
      {
        experimentId: `${moduleId}_EXPERIMENT`,
        fixtureId: `${moduleId}_FIXTURE`,
        steps: actions.map((actionType, stepIndex) => ({
          stepId: `${moduleId}_STEP_${stepIndex + 1}`,
          actionType,
          maximumOccurrences: 1,
          ...(actionType === "EDIT_INPUT"
            ? {
                editConstraint: {
                  maximumInputUtf8Bytes: 256,
                  maximumMutations: 1,
                },
              }
            : {}),
        })),
        expectedObservationIds: [`${moduleId}_OBSERVATION`],
        interpretationItemIds: [`${moduleId}_INTERPRETATION`],
        applicationItemIds: [`${moduleId}_APPLICATION`],
        evidencePanelIds: [`${moduleId}_EVIDENCE`],
      },
    ],
    scorableItemIds: [
      `${moduleId}_EXPERIMENT_SCORE`,
      `${moduleId}_INTERPRETATION`,
      `${moduleId}_APPLICATION`,
    ],
    hintIds: [`${moduleId}_HINT`],
    glossaryTermIds: [`${moduleId}_TERM`],
    realMechanismIds: ["SHA_256"],
    simulatedMechanismIds: ["PRODUCTION_PKI"],
  };
}

export function validTechnicalLabBundle(): TechnicalLabPackBundle {
  const modules = FIRST_TECHNICAL_LAB_MODULE_IDS.map(
    (_moduleId, index) => moduleDefinition(index),
  );
  const localizationKeys = [
    "technicalLab.pack.title",
    "technicalLab.pack.description",
    "technicalLab.pack.authenticity",
    ...modules.flatMap((module) => [
      module.title.localizationKey,
      module.summary.localizationKey,
      ...module.learningOutcomes.map(
        (outcome) => outcome.localizationKey,
      ),
    ]),
  ];
  const catalog = Object.fromEntries(
    localizationKeys.map((key) => [key, `Content for ${key}`]),
  );
  return {
    pack: {
      schemaVersion: "1.0.0",
      evidenceSchemaVersion: "1",
      labPackId: "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS",
      labPackVersion: "1.0.0",
      presetId: "permissioned-blockchain-foundations",
      title: { localizationKey: "technicalLab.pack.title" },
      description: {
        localizationKey: "technicalLab.pack.description",
      },
      authenticityDisclosure: {
        localizationKey: "technicalLab.pack.authenticity",
      },
      supportedLocales: ["vi", "en"],
      moduleIds: FIRST_TECHNICAL_LAB_MODULE_IDS,
      scoringContract: {
        scoringContractId:
          "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS_SCORE_V1",
        maximumScore: 100,
        passScore: 70,
        moduleAllocations:
          FIRST_TECHNICAL_LAB_MODULE_IDS.map(
            (moduleId, index) => {
              const points = SCORE_POINTS[index];
              if (points === undefined) {
                throw new Error("The score fixture is incomplete");
              }
              return {
                moduleId,
                experimentPoints: points[0],
                interpretationPoints: points[1],
                applicationPoints: points[2],
              };
            },
          ),
      },
      status: "validated",
    },
    modules,
    fixtures: FIRST_TECHNICAL_LAB_MODULE_IDS.map((moduleId) => ({
      fixtureId: `${moduleId}_FIXTURE`,
      fixtureVersion: "1.0.0",
      educationalOnly: true,
      initialInput: {
        recordId: `${moduleId}_RECORD`,
        value: "fixed educational input",
      },
      identityIds: ["ORG_PRODUCER"],
      keyIds: ["KEY_PRODUCER_EDU_1"],
      policyIds: ["POLICY_EDUCATIONAL"],
    })),
    localizationCatalogs: {
      vi: catalog,
      en: catalog,
    },
  };
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
