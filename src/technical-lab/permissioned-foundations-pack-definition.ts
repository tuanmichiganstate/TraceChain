import type { LocalizedText } from "../platform/contracts/content";
import type { JsonObject } from "../platform/contracts/json";
import {
  FIRST_TECHNICAL_LAB_MODULE_IDS,
  type GenuineTechnicalMechanismId,
  type SimulatedTechnicalMechanismId,
  type TechnicalExperimentActionType,
  type TechnicalLabCheckpointDefinition,
  type TechnicalLabModuleDefinition,
  type TechnicalLabPackBundle,
  type TechnicalLabRendererId,
} from "./contracts";
import { calculateTechnicalLabContentHash } from "./content-hash";

const localize = (localizationKey: string): LocalizedText => ({
  localizationKey,
});

const SCORE_POINTS = [
  [4, 4, 2],
  [4, 4, 2],
  [6, 6, 3],
  [6, 6, 3],
  [6, 6, 3],
  [6, 6, 3],
  [8, 8, 4],
] as const;

interface ModuleContent {
  readonly rendererId: TechnicalLabRendererId;
  readonly estimatedMinutes: number;
  readonly actions: readonly {
    readonly actionType: TechnicalExperimentActionType;
    readonly maximumOccurrences?: number;
    readonly editable?: boolean;
  }[];
  readonly realMechanismIds:
    readonly GenuineTechnicalMechanismId[];
  readonly simulatedMechanismIds:
    readonly SimulatedTechnicalMechanismId[];
  readonly fixture: JsonObject;
}

const MODULE_CONTENT: readonly ModuleContent[] = [
  {
    rendererId: "hash-avalanche",
    estimatedMinutes: 8,
    actions: [
      { actionType: "VIEW_INPUT" },
      { actionType: "HASH" },
      { actionType: "EDIT_INPUT", editable: true },
      { actionType: "HASH" },
      { actionType: "COMPARE_DIGESTS" },
    ],
    realMechanismIds: ["SHA_256", "INTEGRITY_VERIFICATION"],
    simulatedMechanismIds: [],
    fixture: {
      content:
        "certificate=CERT-2026-014;lot=BAT-GREEN-001;status=APPROVED",
    },
  },
  {
    rendererId: "canonical-serialization",
    estimatedMinutes: 8,
    actions: [
      { actionType: "VIEW_INPUT" },
      { actionType: "HASH" },
      { actionType: "CANONICALIZE" },
      { actionType: "HASH" },
      { actionType: "COMPARE_DIGESTS" },
      { actionType: "EDIT_INPUT", editable: true },
    ],
    realMechanismIds: ["CANONICAL_SERIALIZATION", "SHA_256"],
    simulatedMechanismIds: [],
    fixture: {
      recordA: {
        assetId: "BAT-GREEN-001",
        quantityKg: 100,
        status: "CERTIFIED",
      },
      recordB: {
        status: "CERTIFIED",
        quantityKg: 100,
        assetId: "BAT-GREEN-001",
      },
      unsupportedNumber: "Infinity",
    },
  },
  {
    rendererId: "digital-signature",
    estimatedMinutes: 10,
    actions: [
      { actionType: "VIEW_INPUT" },
      { actionType: "CANONICALIZE" },
      { actionType: "HASH" },
      { actionType: "SIGN" },
      { actionType: "VERIFY_SIGNATURE" },
      { actionType: "EDIT_INPUT", editable: true },
      { actionType: "VERIFY_SIGNATURE" },
      { actionType: "VERIFY_SIGNATURE" },
    ],
    realMechanismIds: [
      "CANONICAL_SERIALIZATION",
      "SHA_256",
      "DIGITAL_SIGNATURE",
      "SIGNATURE_VERIFICATION",
      "PUBLIC_KEY_FINGERPRINT",
    ],
    simulatedMechanismIds: [
      "PRODUCTION_PKI",
      "PRIVATE_KEY_CUSTODY",
      "ORGANIZATIONAL_IDENTITY_PROOFING",
    ],
    fixture: {
      proposalId: "LAB_PROPOSAL_SIGNATURE_001",
      commandType: "LAB_TRANSFER_CUSTODY",
      assetId: "BAT-GREEN-001",
      expectedStateVersion: 4,
    },
  },
  {
    rendererId: "identity-authorization",
    estimatedMinutes: 8,
    actions: [
      { actionType: "VIEW_INPUT" },
      { actionType: "VERIFY_SIGNATURE" },
      { actionType: "RESOLVE_IDENTITY" },
      { actionType: "CHECK_AUTHORIZATION" },
      { actionType: "COMMIT_TRANSACTION" },
    ],
    realMechanismIds: [
      "DIGITAL_SIGNATURE",
      "SIGNATURE_VERIFICATION",
      "IDENTITY_KEY_ASSOCIATION",
      "AUTHORIZATION_EVALUATION",
    ],
    simulatedMechanismIds: [
      "PRODUCTION_PKI",
      "ORGANIZATIONAL_IDENTITY_PROOFING",
      "LEGAL_EFFECT_OF_SIGNATURES",
    ],
    fixture: {
      proposalId: "LAB_PROPOSAL_CERTIFICATE_001",
      commandType: "LAB_ISSUE_CERTIFICATE",
      signerOrganizationId: "ORG_LOGISTICS_PROVIDER",
      signerRoleId: "LOGISTICS_COORDINATOR",
    },
  },
  {
    rendererId: "endorsement-policy",
    estimatedMinutes: 10,
    actions: [
      { actionType: "VIEW_INPUT" },
      { actionType: "SIGN", maximumOccurrences: 3 },
      { actionType: "VERIFY_SIGNATURE", maximumOccurrences: 3 },
      { actionType: "ADD_ENDORSEMENT", maximumOccurrences: 3 },
      { actionType: "EVALUATE_POLICY", maximumOccurrences: 4 },
    ],
    realMechanismIds: [
      "DIGITAL_SIGNATURE",
      "SIGNATURE_VERIFICATION",
      "AUTHORIZATION_EVALUATION",
      "ENDORSEMENT_POLICY_EVALUATION",
    ],
    simulatedMechanismIds: [
      "PRIVATE_KEY_CUSTODY",
      "EXTERNAL_ORGANIZATIONS",
      "DISTRIBUTED_CONSENSUS",
    ],
    fixture: {
      proposalId: "LAB_PROPOSAL_POLICY_001",
      commandType: "LAB_POLICY_DEMO",
      policyIds: [
        "LAB_SIGNED_BY_PRODUCER",
        "LAB_ALL_PRODUCER_PROCESSOR",
        "LAB_ANY_PRODUCER_CERTIFIER",
        "LAB_THRESHOLD_TWO_OF_THREE",
      ],
    },
  },
  {
    rendererId: "proposal-mismatch",
    estimatedMinutes: 10,
    actions: [
      { actionType: "VIEW_INPUT" },
      { actionType: "CANONICALIZE", maximumOccurrences: 2 },
      { actionType: "HASH", maximumOccurrences: 2 },
      { actionType: "SIGN", maximumOccurrences: 2 },
      { actionType: "VERIFY_SIGNATURE", maximumOccurrences: 2 },
      { actionType: "ADD_ENDORSEMENT", maximumOccurrences: 2 },
      { actionType: "COMPARE_DIGESTS" },
      { actionType: "EVALUATE_POLICY" },
      { actionType: "EDIT_INPUT", editable: true },
      { actionType: "RESET_EXPERIMENT_COPY" },
      { actionType: "SIGN", maximumOccurrences: 2 },
      { actionType: "VERIFY_SIGNATURE", maximumOccurrences: 2 },
      { actionType: "ADD_ENDORSEMENT", maximumOccurrences: 2 },
      { actionType: "EVALUATE_POLICY" },
    ],
    realMechanismIds: [
      "CANONICAL_SERIALIZATION",
      "SHA_256",
      "DIGITAL_SIGNATURE",
      "SIGNATURE_VERIFICATION",
      "ENDORSEMENT_POLICY_EVALUATION",
      "PROPOSAL_DIGEST_MATCHING",
    ],
    simulatedMechanismIds: [
      "PRIVATE_KEY_CUSTODY",
      "EXTERNAL_ORGANIZATIONS",
    ],
    fixture: {
      producerQuantityKg: 100,
      processorQuantityKg: 105,
      revisedQuantityKg: 100,
      expectedStateVersion: 4,
    },
  },
  {
    rendererId: "state-version-conflict",
    estimatedMinutes: 12,
    actions: [
      { actionType: "VIEW_INPUT" },
      { actionType: "SIGN", maximumOccurrences: 2 },
      { actionType: "VERIFY_SIGNATURE", maximumOccurrences: 2 },
      { actionType: "ADD_ENDORSEMENT", maximumOccurrences: 2 },
      { actionType: "EVALUATE_POLICY" },
      { actionType: "ADVANCE_ASSET_VERSION" },
      { actionType: "VALIDATE_STATE_VERSION" },
      { actionType: "COMMIT_TRANSACTION" },
      { actionType: "EDIT_INPUT", editable: true },
      { actionType: "RESET_EXPERIMENT_COPY" },
      { actionType: "SIGN", maximumOccurrences: 2 },
      { actionType: "VERIFY_SIGNATURE", maximumOccurrences: 2 },
      { actionType: "ADD_ENDORSEMENT", maximumOccurrences: 2 },
      { actionType: "EVALUATE_POLICY" },
      { actionType: "VALIDATE_STATE_VERSION" },
      { actionType: "COMMIT_TRANSACTION" },
    ],
    realMechanismIds: [
      "CANONICAL_SERIALIZATION",
      "SHA_256",
      "DIGITAL_SIGNATURE",
      "SIGNATURE_VERIFICATION",
      "AUTHORIZATION_EVALUATION",
      "ENDORSEMENT_POLICY_EVALUATION",
      "STATE_VERSION_VALIDATION",
    ],
    simulatedMechanismIds: [
      "PRIVATE_KEY_CUSTODY",
      "ORDERING_SERVICE_INFRASTRUCTURE",
      "DISTRIBUTED_CONSENSUS",
    ],
    fixture: {
      assetId: "BAT-GREEN-001",
      proposedVersion: 4,
      interveningVersion: 5,
      committedVersion: 6,
    },
  },
] as const;

function checkpoint(
  moduleId: string,
  kind: "interpretation" | "application",
): TechnicalLabCheckpointDefinition {
  const itemId = `${moduleId}_${kind === "interpretation" ? "INTERPRETATION" : "APPLICATION"}`;
  return {
    itemId,
    prompt: localize(`technicalLab.${moduleId}.${kind}.prompt`),
    options: ["A", "B", "C"].map((optionId) => ({
      optionId,
      label: localize(
        `technicalLab.${moduleId}.${kind}.option${optionId}`,
      ),
    })),
    correctOptionId: "A",
    explanation: localize(
      `technicalLab.${moduleId}.${kind}.explanation`,
    ),
    maximumAttempts: 3,
  };
}

function moduleDefinition(
  index: number,
): TechnicalLabModuleDefinition {
  const moduleId = FIRST_TECHNICAL_LAB_MODULE_IDS[index];
  const content = MODULE_CONTENT[index];
  if (moduleId === undefined || content === undefined) {
    throw new Error("The Technical Laboratory module set is incomplete");
  }
  const interpretationItem = checkpoint(moduleId, "interpretation");
  const applicationItem = checkpoint(moduleId, "application");
  return {
    moduleId,
    moduleVersion: "1.0.0",
    title: localize(`technicalLab.${moduleId}.title`),
    summary: localize(`technicalLab.${moduleId}.summary`),
    concept: localize(`technicalLab.${moduleId}.concept`),
    observation: localize(`technicalLab.${moduleId}.observation`),
    professionalContext: localize(
      `technicalLab.${moduleId}.professionalContext`,
    ),
    learningOutcomes: [
      localize(`technicalLab.${moduleId}.outcome`),
    ],
    prerequisiteModuleIds:
      index === 0
        ? []
        : [FIRST_TECHNICAL_LAB_MODULE_IDS[index - 1]!],
    estimatedMinutes: content.estimatedMinutes,
    rendererId: content.rendererId,
    experimentDefinitions: [
      {
        experimentId: `${moduleId}_EXPERIMENT`,
        fixtureId: `${moduleId}_FIXTURE`,
        steps: content.actions.map((action, stepIndex) => ({
          stepId: `${moduleId}_STEP_${String(stepIndex + 1)}`,
          actionType: action.actionType,
          maximumOccurrences: action.maximumOccurrences ?? 1,
          ...(action.editable === true
            ? {
                editConstraint: {
                  maximumInputUtf8Bytes: 256,
                  maximumMutations: 1,
                },
              }
            : {}),
        })),
        expectedObservationIds: [`${moduleId}_OBSERVATION`],
        interpretationItemIds: [interpretationItem.itemId],
        applicationItemIds: [applicationItem.itemId],
        evidencePanelIds: [`${moduleId}_EVIDENCE`],
      },
    ],
    scorableItemIds: [
      `${moduleId}_EXPERIMENT_SCORE`,
      interpretationItem.itemId,
      applicationItem.itemId,
    ],
    hintIds: [`${moduleId}_HINT`],
    glossaryTermIds: [`${moduleId}_TERM`],
    interpretationItem,
    applicationItem,
    hint: {
      hintId: `${moduleId}_HINT`,
      targetItemId: interpretationItem.itemId,
      body: localize(`technicalLab.${moduleId}.hint`),
      maximumAwardFraction: 0.5,
    },
    realMechanismIds: content.realMechanismIds,
    simulatedMechanismIds: content.simulatedMechanismIds,
  };
}

const modules = FIRST_TECHNICAL_LAB_MODULE_IDS.map(
  (_moduleId, index) => moduleDefinition(index),
);

function referencedLocalizationKeys(): readonly string[] {
  return [
    "technicalLab.pack.title",
    "technicalLab.pack.description",
    "technicalLab.pack.authenticity",
    ...modules.flatMap((module) => [
      module.title.localizationKey,
      module.summary.localizationKey,
      module.concept.localizationKey,
      module.observation.localizationKey,
      module.professionalContext.localizationKey,
      ...module.learningOutcomes.map(
        (outcome) => outcome.localizationKey,
      ),
      module.interpretationItem.prompt.localizationKey,
      module.interpretationItem.explanation.localizationKey,
      ...module.interpretationItem.options.map(
        (option) => option.label.localizationKey,
      ),
      module.applicationItem.prompt.localizationKey,
      module.applicationItem.explanation.localizationKey,
      ...module.applicationItem.options.map(
        (option) => option.label.localizationKey,
      ),
      module.hint.body.localizationKey,
    ]),
  ];
}

function localizationCatalog(
  locale: "vi" | "en",
  catalogues: Readonly<
    Record<"vi" | "en", Readonly<Record<string, string>>>
  >,
): Readonly<Record<string, string>> {
  const catalogue = catalogues[locale];
  return Object.fromEntries(
    referencedLocalizationKeys().map((key) => {
      const value = catalogue[key];
      if (value === undefined) {
        throw new Error(
          `The Technical Laboratory catalogue is missing "${key}"`,
        );
      }
      return [key, value];
    }),
  );
}

export function createPermissionedFoundationsLabBundle(
  catalogues: Readonly<
    Record<"vi" | "en", Readonly<Record<string, string>>>
  >,
): TechnicalLabPackBundle {
const validatedPermissionedFoundationsLabBundle: TechnicalLabPackBundle =
  {
    pack: {
      schemaVersion: "1.0.0",
      evidenceSchemaVersion: "1",
      labPackId: "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS",
      labPackVersion: "1.0.0",
      presetId: "permissioned-blockchain-foundations",
      title: localize("technicalLab.pack.title"),
      description: localize("technicalLab.pack.description"),
      authenticityDisclosure: localize(
        "technicalLab.pack.authenticity",
      ),
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
                throw new Error(
                  "The Technical Laboratory score contract is incomplete",
                );
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
    fixtures: FIRST_TECHNICAL_LAB_MODULE_IDS.map(
      (moduleId, index) => ({
        fixtureId: `${moduleId}_FIXTURE`,
        fixtureVersion: "1.0.0",
        educationalOnly: true,
        initialInput: MODULE_CONTENT[index]!.fixture,
        identityIds: [
          "ORG_PRODUCER_COOP",
          "ORG_COFFEE_PROCESSOR",
          "ORG_CERTIFICATION_BODY",
          "ORG_LOGISTICS_PROVIDER",
        ],
        keyIds: [
          "KEY_PRODUCER_001",
          "KEY_PROCESSOR_001",
          "KEY_CERTIFIER_001",
          "KEY_LOGISTICS_001",
        ],
        policyIds: [
          "LAB_SIGNED_BY_PRODUCER",
          "LAB_ALL_PRODUCER_PROCESSOR",
          "LAB_ANY_PRODUCER_CERTIFIER",
          "LAB_THRESHOLD_TWO_OF_THREE",
        ],
      }),
    ),
    localizationCatalogs: {
      vi: localizationCatalog("vi", catalogues),
      en: localizationCatalog("en", catalogues),
    },
  };

const publicationMetadata = {
  contentHash: "",
  publishedAt: "2026-07-27T00:00:00.000Z",
  publishedBy: "SIMULEDGER",
} as const;

const publishingPermissionedFoundationsLabBundle: TechnicalLabPackBundle =
  {
    ...validatedPermissionedFoundationsLabBundle,
    pack: {
      ...validatedPermissionedFoundationsLabBundle.pack,
      status: "published",
      publication: publicationMetadata,
    },
  };

return (
  {
    ...publishingPermissionedFoundationsLabBundle,
    pack: {
      ...publishingPermissionedFoundationsLabBundle.pack,
      publication: {
        ...publicationMetadata,
        contentHash: calculateTechnicalLabContentHash(
          publishingPermissionedFoundationsLabBundle,
        ),
      },
    },
  }
);
}
