import type {
  ContentPublication,
  LocalizedText,
  VersionLifecycleStatus,
} from "../platform/contracts/content";
import type { JsonObject } from "../platform/contracts/json";

export const TECHNICAL_LAB_PACK_SCHEMA_VERSION = "1.0.0" as const;
export const TECHNICAL_LAB_EVIDENCE_SCHEMA_VERSION = "1" as const;

export const FIRST_TECHNICAL_LAB_MODULE_IDS = [
  "TL1",
  "TL2",
  "TL3",
  "TL4",
  "TL5",
  "TL6",
  "TL7",
] as const;

export type FirstTechnicalLabModuleId =
  (typeof FIRST_TECHNICAL_LAB_MODULE_IDS)[number];

export const TECHNICAL_LAB_RENDERER_IDS = [
  "hash-avalanche",
  "canonical-serialization",
  "digital-signature",
  "identity-authorization",
  "endorsement-policy",
  "proposal-mismatch",
  "state-version-conflict",
] as const;

export type TechnicalLabRendererId =
  (typeof TECHNICAL_LAB_RENDERER_IDS)[number];

export const TECHNICAL_EXPERIMENT_ACTION_TYPES = [
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
  "COMPARE_DIGESTS",
  "ADVANCE_ASSET_VERSION",
  "VALIDATE_STATE_VERSION",
  "COMMIT_TRANSACTION",
  "RESET_EXPERIMENT_COPY",
] as const;

export type TechnicalExperimentActionType =
  (typeof TECHNICAL_EXPERIMENT_ACTION_TYPES)[number];

export const GENUINE_TECHNICAL_MECHANISM_IDS = [
  "CANONICAL_SERIALIZATION",
  "SHA_256",
  "DIGITAL_SIGNATURE",
  "SIGNATURE_VERIFICATION",
  "PUBLIC_KEY_FINGERPRINT",
  "IDENTITY_KEY_ASSOCIATION",
  "AUTHORIZATION_EVALUATION",
  "ENDORSEMENT_POLICY_EVALUATION",
  "PROPOSAL_DIGEST_MATCHING",
  "STATE_VERSION_VALIDATION",
  "TRANSACTION_HASHING",
  "BLOCK_HASHING",
  "HASH_CHAINING",
  "INTEGRITY_VERIFICATION",
] as const;

export type GenuineTechnicalMechanismId =
  (typeof GENUINE_TECHNICAL_MECHANISM_IDS)[number];

export const SIMULATED_TECHNICAL_MECHANISM_IDS = [
  "ORGANIZATIONAL_CERTIFICATE_ISSUANCE",
  "PRODUCTION_PKI",
  "PRIVATE_KEY_CUSTODY",
  "SECURE_HARDWARE",
  "ORGANIZATIONAL_IDENTITY_PROOFING",
  "NETWORK_COMMUNICATION",
  "DISTRIBUTED_NODES",
  "ORDERING_SERVICE_INFRASTRUCTURE",
  "DISTRIBUTED_CONSENSUS",
  "EXTERNAL_ORGANIZATIONS",
  "LEGAL_EFFECT_OF_SIGNATURES",
] as const;

export type SimulatedTechnicalMechanismId =
  (typeof SIMULATED_TECHNICAL_MECHANISM_IDS)[number];

export interface TechnicalLabEditConstraint {
  /**
   * The authored source is bounded before the learner can edit it. The journal
   * stores only character-position and replacement-code-point deltas.
   */
  readonly maximumInputUtf8Bytes: number;
  readonly maximumMutations: number;
}

export interface TechnicalExperimentStep {
  readonly stepId: string;
  readonly actionType: TechnicalExperimentActionType;
  readonly maximumOccurrences: number;
  readonly editConstraint?: TechnicalLabEditConstraint;
}

export interface TechnicalExperimentDefinition {
  readonly experimentId: string;
  readonly fixtureId: string;
  readonly steps: readonly TechnicalExperimentStep[];
  readonly expectedObservationIds: readonly string[];
  readonly interpretationItemIds: readonly string[];
  readonly applicationItemIds: readonly string[];
  readonly evidencePanelIds: readonly string[];
}

export interface TechnicalLabModuleDefinition {
  readonly moduleId: FirstTechnicalLabModuleId;
  readonly moduleVersion: string;
  readonly title: LocalizedText;
  readonly summary: LocalizedText;
  readonly learningOutcomes: readonly LocalizedText[];
  readonly prerequisiteModuleIds:
    readonly FirstTechnicalLabModuleId[];
  readonly estimatedMinutes: number;
  readonly rendererId: TechnicalLabRendererId;
  readonly experimentDefinitions:
    readonly TechnicalExperimentDefinition[];
  readonly scorableItemIds: readonly string[];
  readonly hintIds: readonly string[];
  readonly glossaryTermIds: readonly string[];
  readonly realMechanismIds:
    readonly GenuineTechnicalMechanismId[];
  readonly simulatedMechanismIds:
    readonly SimulatedTechnicalMechanismId[];
}

export interface TechnicalLabFixture {
  readonly fixtureId: string;
  readonly fixtureVersion: string;
  readonly educationalOnly: true;
  readonly initialInput: JsonObject;
  readonly identityIds: readonly string[];
  readonly keyIds: readonly string[];
  readonly policyIds: readonly string[];
}

export interface TechnicalLabModuleScoreAllocation {
  readonly moduleId: FirstTechnicalLabModuleId;
  readonly experimentPoints: number;
  readonly interpretationPoints: number;
  readonly applicationPoints: number;
}

export interface TechnicalLabScoringContract {
  readonly scoringContractId: string;
  readonly maximumScore: 100;
  readonly passScore: number;
  readonly moduleAllocations:
    readonly TechnicalLabModuleScoreAllocation[];
}

export interface TechnicalLabPack {
  readonly schemaVersion: typeof TECHNICAL_LAB_PACK_SCHEMA_VERSION;
  readonly evidenceSchemaVersion:
    typeof TECHNICAL_LAB_EVIDENCE_SCHEMA_VERSION;
  readonly labPackId: string;
  readonly labPackVersion: string;
  readonly presetId: "permissioned-blockchain-foundations";
  readonly title: LocalizedText;
  readonly description: LocalizedText;
  readonly authenticityDisclosure: LocalizedText;
  readonly supportedLocales: readonly string[];
  readonly moduleIds: readonly FirstTechnicalLabModuleId[];
  readonly scoringContract: TechnicalLabScoringContract;
  readonly status: VersionLifecycleStatus;
  readonly publication?: ContentPublication;
}

/**
 * Runtime files remain separable for package generation, but validation sees
 * the complete bounded bundle so references cannot drift.
 */
export interface TechnicalLabPackBundle {
  readonly pack: TechnicalLabPack;
  readonly modules: readonly TechnicalLabModuleDefinition[];
  readonly fixtures: readonly TechnicalLabFixture[];
  readonly localizationCatalogs: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
}
