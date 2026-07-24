export interface EducationalPrivateKey {
  readonly algorithm: "Ed25519";
  readonly pkcs8Base64Url: string;
}

export interface EducationalPublicKey {
  readonly algorithm: "Ed25519";
  readonly spkiBase64Url: string;
}

export type EducationalKeyStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface EducationalIdentity {
  readonly organizationId: string;
  readonly recognized: boolean;
  readonly displayNameKey: string;
  readonly activeKeyIds: readonly string[];
}

export interface EducationalKeyRecord {
  readonly keyId: string;
  readonly organizationId: string;
  readonly algorithm: "Ed25519";
  readonly publicKeySpkiBase64Url: string;
  readonly privateKeyPkcs8Base64Url: string;
  readonly status: EducationalKeyStatus;
  readonly validFrom: string;
  readonly validUntil?: string;
  readonly educationalOnly: true;
}

export interface EducationalIdentityRegistry {
  readonly schemaVersion: "1";
  readonly identities: readonly EducationalIdentity[];
}

export interface EducationalSigningKeyRegistry {
  readonly schemaVersion: "1";
  readonly keys: readonly EducationalKeyRecord[];
}

export interface AuthorizationPolicy {
  readonly authorizationPolicyId: string;
  readonly commandTypes: readonly string[];
  readonly allowedOrganizationIds: readonly string[];
  readonly allowedRoleIds: readonly string[];
  readonly signerOrganizationMustMatchActorOrganization: boolean;
  readonly localizationKey: string;
}

export interface AuthorizationPolicyRegistry {
  readonly schemaVersion: "1";
  readonly policies: readonly AuthorizationPolicy[];
}

export type EndorsementPolicyExpression =
  | {
      readonly kind: "SIGNED_BY";
      readonly organizationId: string;
    }
  | {
      readonly kind: "ALL_OF";
      readonly policies: readonly EndorsementPolicyExpression[];
    }
  | {
      readonly kind: "ANY_OF";
      readonly policies: readonly EndorsementPolicyExpression[];
    }
  | {
      readonly kind: "THRESHOLD";
      readonly required: number;
      readonly organizationIds: readonly string[];
    };

export interface EndorsementPolicyDefinition {
  readonly endorsementPolicyId: string;
  readonly appliesToCommandTypes: readonly string[];
  readonly expression: EndorsementPolicyExpression;
  readonly localizationKey: string;
}

export interface EndorsementPolicyRegistry {
  readonly schemaVersion: "1";
  readonly policies: readonly EndorsementPolicyDefinition[];
}

export interface CryptographicRuntime {
  readonly identityRegistry: EducationalIdentityRegistry;
  readonly signingKeys: EducationalSigningKeyRegistry;
  readonly authorizationPolicies: AuthorizationPolicyRegistry;
  readonly endorsementPolicies: EndorsementPolicyRegistry;
}

export interface TransactionProposalV1 {
  readonly domain: "TRACECHAIN_TRANSACTION_PROPOSAL_V1";
  readonly configurationHash: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly sessionId: string;
  readonly proposalId: string;
  readonly commandType: string;
  readonly commandPayload: unknown;
  readonly expectedStateVersions: Readonly<Record<string, number>>;
  readonly proposedAt: string;
}

export type SignaturePurpose = "PROPOSAL_SUBMISSION" | "ENDORSEMENT";

export interface SignatureStatementV1 {
  readonly domain: "TRACECHAIN_SIGNATURE_V1";
  readonly purpose: SignaturePurpose;
  readonly proposalDigest: string;
  readonly sessionId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly keyId: string;
  readonly signedAt: string;
}

export interface SignatureEnvelope {
  readonly algorithm: "Ed25519";
  readonly purpose: SignaturePurpose;
  readonly proposalDigest: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly keyId: string;
  readonly signedAt: string;
  readonly signatureBase64Url: string;
}

export interface AuthorizationResult {
  readonly recognizedIdentity: boolean;
  readonly keyActive: boolean;
  readonly organizationAllowed: boolean;
  readonly roleAllowed: boolean;
  readonly contextMatches: boolean;
  readonly authorized: boolean;
  readonly failureRuleIds: readonly SignatureValidationRuleId[];
}

export const SignatureValidationRule = {
  SIGNATURE_MISSING: "RULE_SIGNATURE_MISSING",
  SIGNATURE_INVALID: "RULE_SIGNATURE_INVALID",
  SIGNER_IDENTITY_UNKNOWN: "RULE_SIGNER_IDENTITY_UNKNOWN",
  SIGNING_KEY_EXPIRED: "RULE_SIGNING_KEY_EXPIRED",
  SIGNING_KEY_REVOKED: "RULE_SIGNING_KEY_REVOKED",
  SIGNER_CONTEXT_MISMATCH: "RULE_SIGNER_CONTEXT_MISMATCH",
  ORGANIZATION_NOT_AUTHORIZED: "RULE_ORGANIZATION_NOT_AUTHORIZED",
  ROLE_NOT_AUTHORIZED: "RULE_ROLE_NOT_AUTHORIZED",
} as const;

export type SignatureValidationRuleId =
  (typeof SignatureValidationRule)[keyof typeof SignatureValidationRule];

export interface SignatureTrustEvidence {
  readonly proposal: TransactionProposalV1;
  readonly proposalCanonicalBytesBase64Url: string;
  readonly proposalDigest: string;
  readonly signatureStatement: SignatureStatementV1;
  readonly signature: SignatureEnvelope;
  readonly publicKeySpkiBase64Url: string | null;
  readonly publicKeyFingerprint: string | null;
  readonly signatureValid: boolean;
  readonly authorization: AuthorizationResult;
  readonly failureRuleIds: readonly SignatureValidationRuleId[];
}

export interface EndorsementRecord {
  readonly endorsementId: string;
  readonly proposalId: string;
  readonly proposalDigest: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly keyId: string;
  readonly signature: SignatureEnvelope;
  readonly endorsedAt: string;
  /**
   * Derived during live execution and deterministic replay. TC3 stores the
   * compact action and trusted context, never this redundant evidence object.
   */
  readonly verification: SignatureTrustEvidence;
}

export const EndorsementValidationRule = {
  POLICY_NOT_SATISFIED: "RULE_ENDORSEMENT_POLICY_NOT_SATISFIED",
  SIGNATURE_INVALID: "RULE_ENDORSEMENT_SIGNATURE_INVALID",
  ENDORSER_NOT_AUTHORIZED: "RULE_ENDORSER_NOT_AUTHORIZED",
  PROPOSAL_MISMATCH: "RULE_ENDORSEMENT_PROPOSAL_MISMATCH",
  DUPLICATE_ENDORSER: "RULE_DUPLICATE_ENDORSER",
  ENDORSED_STATE_VERSION_STALE: "RULE_ENDORSED_STATE_VERSION_STALE",
} as const;

export type EndorsementValidationRuleId =
  (typeof EndorsementValidationRule)[keyof typeof EndorsementValidationRule];

export interface EndorsementEvaluation {
  readonly endorsementPolicyId: string;
  readonly satisfied: boolean;
  readonly validEndorsementIds: readonly string[];
  readonly invalidEndorsementIds: readonly string[];
  readonly missingOrganizationIds: readonly string[];
  readonly duplicateOrganizationIds: readonly string[];
  readonly proposalMismatchIds: readonly string[];
  readonly unauthorizedEndorserIds: readonly string[];
  readonly failureRuleIds: readonly EndorsementValidationRuleId[];
}

export interface SignatureTamperDemonstration {
  readonly proposalId: string;
  readonly originalProposalDigest: string;
  readonly modifiedProposalDigest: string;
  readonly originalSignatureValid: boolean;
  readonly modifiedProposalSignatureValid: boolean;
}

export interface SignatureVerificationBundleV1 {
  readonly schemaVersion: "1";
  readonly proposal: TransactionProposalV1;
  readonly proposalDigest: string;
  readonly signatureStatement: SignatureStatementV1;
  readonly signature: SignatureEnvelope;
  readonly publicKeySpkiBase64Url: string;
}

export interface SignatureProvider {
  readonly algorithm: "Ed25519";

  sign(
    privateKey: EducationalPrivateKey,
    message: Uint8Array,
  ): Promise<Uint8Array>;

  verify(
    publicKey: EducationalPublicKey,
    message: Uint8Array,
    signature: Uint8Array,
  ): Promise<boolean>;

  fingerprint(publicKey: EducationalPublicKey): Promise<string>;
}
