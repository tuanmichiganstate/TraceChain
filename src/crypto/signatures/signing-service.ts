import type {
  DomainSimulationCommand,
  AttemptValidationFailure,
  TrustedExecutionContext,
} from "../../domain/simulation/types";
import { encodeBase64Url, decodeBase64Url } from "./base64url";
import { evaluateAuthorization } from "./authorization";
import {
  canonicalBytes,
  createTransactionProposal,
  proposalDigest,
  signatureStatement,
} from "./proposal";
import {
  SignatureValidationRule,
  type CryptographicRuntime,
  type EducationalKeyRecord,
  type SignatureEnvelope,
  type SignatureProvider,
  type SignatureTamperDemonstration,
  type SignatureTrustEvidence,
  type SignatureValidationRuleId,
  type SignatureVerificationBundleV1,
} from "./types";

declare const verifiedCommandBrand: unique symbol;

export interface VerifiedCommandEnvelope {
  readonly command: DomainSimulationCommand;
  readonly evidence: SignatureTrustEvidence;
  readonly [verifiedCommandBrand]: true;
}

export interface SignedCommandResult {
  readonly envelope: VerifiedCommandEnvelope | null;
  readonly evidence: SignatureTrustEvidence;
  readonly failureRuleIds: readonly SignatureValidationRuleId[];
}

function activeKeyFor(
  runtime: CryptographicRuntime,
  organizationId: string,
): EducationalKeyRecord {
  const identity = runtime.identityRegistry.identities.find(
    (candidate) => candidate.organizationId === organizationId,
  );
  const keyId = identity?.activeKeyIds[0];
  const key = runtime.signingKeys.keys.find(
    (candidate) => candidate.keyId === keyId,
  );
  if (key === undefined) {
    throw new Error(
      `No educational signing key is configured for "${organizationId}"`,
    );
  }
  return key;
}

export async function signAndVerifyCommand(options: {
  readonly command: DomainSimulationCommand;
  readonly trustedContext: TrustedExecutionContext;
  readonly configurationHash: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly runtime: CryptographicRuntime;
  readonly provider: SignatureProvider;
  readonly tamperSignature?: boolean;
}): Promise<SignedCommandResult> {
  const proposal = createTransactionProposal(options);
  const digest = proposalDigest(proposal);
  const key = activeKeyFor(
    options.runtime,
    options.trustedContext.organizationId,
  );
  const statement = signatureStatement({
    proposalDigest: digest,
    sessionId: options.command.metadata.sessionId,
    organizationId: options.trustedContext.organizationId,
    roleId: options.trustedContext.roleId,
    keyId: key.keyId,
    signedAt: options.command.metadata.submittedAt,
  });
  const statementBytes = canonicalBytes(statement);
  const signatureBytes = await options.provider.sign(
    {
      algorithm: key.algorithm,
      pkcs8Base64Url: key.privateKeyPkcs8Base64Url,
    },
    statementBytes,
  );
  if (options.tamperSignature === true) {
    signatureBytes[0] = (signatureBytes[0] as number) ^ 1;
  }
  const signature: SignatureEnvelope = {
    algorithm: "Ed25519",
    purpose: statement.purpose,
    proposalDigest: digest,
    organizationId: statement.organizationId,
    roleId: statement.roleId,
    keyId: statement.keyId,
    signedAt: statement.signedAt,
    signatureBase64Url: encodeBase64Url(signatureBytes),
  };
  const identity = options.runtime.identityRegistry.identities.find(
    (candidate) =>
      candidate.organizationId === signature.organizationId,
  );
  const publicKey = options.runtime.signingKeys.keys.find(
    (candidate) => candidate.keyId === signature.keyId,
  );
  const signatureValid =
    publicKey !== undefined &&
    (await options.provider.verify(
      {
        algorithm: publicKey.algorithm,
        spkiBase64Url: publicKey.publicKeySpkiBase64Url,
      },
      statementBytes,
      decodeBase64Url(signature.signatureBase64Url),
    ));
  const authorization = evaluateAuthorization({
    commandType: options.command.payload.commandType,
    trustedContext: options.trustedContext,
    signedOrganizationId: signature.organizationId,
    signedRoleId: signature.roleId,
    identity,
    key: publicKey,
    signedAt: signature.signedAt,
    policies: options.runtime.authorizationPolicies,
  });
  const failureRuleIds = [
    ...(signatureValid ? [] : [SignatureValidationRule.SIGNATURE_INVALID]),
    ...authorization.failureRuleIds,
  ].filter(
    (ruleId, index, all) => all.indexOf(ruleId) === index,
  );
  const evidence: SignatureTrustEvidence = {
    proposal,
    proposalCanonicalBytesBase64Url: encodeBase64Url(
      canonicalBytes(proposal),
    ),
    proposalDigest: digest,
    signatureStatement: statement,
    signature,
    publicKeySpkiBase64Url:
      publicKey?.publicKeySpkiBase64Url ?? null,
    publicKeyFingerprint:
      publicKey === undefined
        ? null
        : await options.provider.fingerprint({
            algorithm: publicKey.algorithm,
            spkiBase64Url: publicKey.publicKeySpkiBase64Url,
          }),
    signatureValid,
    authorization,
    failureRuleIds,
  };

  return {
    envelope:
      signatureValid && authorization.authorized
        ? ({
            command: options.command,
            evidence,
          } as VerifiedCommandEnvelope)
        : null,
    evidence,
    failureRuleIds,
  };
}

/**
 * Recheck an existing genuine signature against a one-character proposal
 * modification. The original envelope is never changed; only the prospective
 * statement used for verification refers to the modified digest.
 */
export async function demonstrateSignatureTamper(options: {
  readonly evidence: SignatureTrustEvidence;
  readonly provider: SignatureProvider;
}): Promise<SignatureTamperDemonstration> {
  const publicKey = options.evidence.publicKeySpkiBase64Url;
  if (publicKey === null) {
    throw new Error("Signature tamper demonstration requires a public key");
  }
  const signature = decodeBase64Url(
    options.evidence.signature.signatureBase64Url,
  );
  const originalSignatureValid = await options.provider.verify(
    {
      algorithm: "Ed25519",
      spkiBase64Url: publicKey,
    },
    canonicalBytes(options.evidence.signatureStatement),
    signature,
  );
  const modifiedProposal = {
    ...options.evidence.proposal,
    commandType: `${options.evidence.proposal.commandType}!`,
  };
  const modifiedProposalDigest = proposalDigest(modifiedProposal);
  const modifiedStatement = {
    ...options.evidence.signatureStatement,
    proposalDigest: modifiedProposalDigest,
  };
  const modifiedProposalSignatureValid = await options.provider.verify(
    {
      algorithm: "Ed25519",
      spkiBase64Url: publicKey,
    },
    canonicalBytes(modifiedStatement),
    signature,
  );
  return {
    proposalId: options.evidence.proposal.proposalId,
    originalProposalDigest: options.evidence.proposalDigest,
    modifiedProposalDigest,
    originalSignatureValid,
    modifiedProposalSignatureValid,
  };
}

export function verificationBundle(
  evidence: SignatureTrustEvidence,
  runtime: CryptographicRuntime,
): SignatureVerificationBundleV1 {
  const key = runtime.signingKeys.keys.find(
    (candidate) => candidate.keyId === evidence.signature.keyId,
  );
  if (key === undefined) {
    throw new Error(`Unknown educational key "${evidence.signature.keyId}"`);
  }
  return {
    schemaVersion: "1",
    proposal: evidence.proposal,
    proposalDigest: evidence.proposalDigest,
    signatureStatement: evidence.signatureStatement,
    signature: evidence.signature,
    publicKeySpkiBase64Url: key.publicKeySpkiBase64Url,
  };
}

export function verificationBundleFromEvidence(
  evidence: SignatureTrustEvidence,
): SignatureVerificationBundleV1 {
  if (evidence.publicKeySpkiBase64Url === null) {
    throw new Error(
      `Signature evidence for "${evidence.signature.keyId}" has no public key`,
    );
  }
  return {
    schemaVersion: "1",
    proposal: evidence.proposal,
    proposalDigest: evidence.proposalDigest,
    signatureStatement: evidence.signatureStatement,
    signature: evidence.signature,
    publicKeySpkiBase64Url: evidence.publicKeySpkiBase64Url,
  };
}

const FAILURE_MESSAGE_KEYS: Readonly<
  Record<SignatureValidationRuleId, string>
> = {
  RULE_SIGNATURE_MISSING: "signature.failure.missing",
  RULE_SIGNATURE_INVALID: "signature.failure.invalid",
  RULE_SIGNER_IDENTITY_UNKNOWN: "signature.failure.identityUnknown",
  RULE_SIGNING_KEY_EXPIRED: "signature.failure.keyExpired",
  RULE_SIGNING_KEY_REVOKED: "signature.failure.keyRevoked",
  RULE_SIGNER_CONTEXT_MISMATCH: "signature.failure.contextMismatch",
  RULE_ORGANIZATION_NOT_AUTHORIZED:
    "signature.failure.organizationNotAuthorized",
  RULE_ROLE_NOT_AUTHORIZED: "signature.failure.roleNotAuthorized",
};

export function signatureAttemptFailures(
  ruleIds: readonly SignatureValidationRuleId[],
): readonly AttemptValidationFailure[] {
  return ruleIds.map((ruleId) => ({
    code: ruleId,
    messageKey: FAILURE_MESSAGE_KEYS[ruleId],
    details: { ruleId },
  }));
}
