import { describe, expect, it } from "vitest";
import {
  anchorCertificateCommand,
  issueCertificateCommand,
  recallBatchCommand,
} from "../../scenarios/coffee-traceability/commands";
import { coffeeCryptographicRuntime } from "../../scenarios/coffee-traceability/cryptographic-runtime";
import {
  ActorId,
  OrganizationId,
} from "../../scenarios/coffee-traceability/organizations";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import type {
  DomainSimulationCommand,
  TrustedExecutionContext,
} from "../../domain/simulation/types";
import { decodeBase64Url } from "./base64url";
import { NobleEd25519Provider } from "./noble-ed25519-provider";
import {
  canonicalBytes,
  proposalDigest,
  signatureStatement,
} from "./proposal";
import {
  demonstrateSignatureTamper,
  signAndVerifyCommand,
} from "./signing-service";
import {
  SignatureValidationRule,
  type CryptographicRuntime,
  type EndorsementPolicyExpression,
} from "./types";
import { validateCryptographicRuntime } from "./validation";

const provider = new NobleEd25519Provider();

function context(
  contextId: string,
  actorId: string,
  organizationId: string,
  roleId: string,
): TrustedExecutionContext {
  return { contextId, actorId, organizationId, roleId };
}

function command(
  trusted: TrustedExecutionContext,
  payload: DomainSimulationCommand["payload"],
): DomainSimulationCommand {
  const subjectAssetId =
    "assetId" in payload
      ? payload.assetId
      : "sourceAssetId" in payload
        ? payload.sourceAssetId
        : payload.inputAssetId;
  return {
    metadata: {
      commandId: "CMD_000003",
      sessionId: "SES_TEST_001",
      actorId: trusted.actorId,
      organizationId: trusted.organizationId,
      roleId: trusted.roleId,
      submittedAt: payload.scenarioTimestamp,
      expectedStateVersions: {
        [subjectAssetId]: 4,
      },
    },
    payload: { ...payload, initiatedByActorId: trusted.actorId },
  };
}

async function signed(
  trusted: TrustedExecutionContext,
  payload: DomainSimulationCommand["payload"],
  runtime: CryptographicRuntime = coffeeCryptographicRuntime,
  tamperSignature = false,
) {
  return signAndVerifyCommand({
    command: command(trusted, payload),
    trustedContext: trusted,
    configurationHash: "a".repeat(64),
    scenarioId: coffeeScenario.scenarioId,
    scenarioVersion: coffeeScenario.scenarioVersion,
    runtime,
    provider,
    tamperSignature,
  });
}

describe("signature and authorization service", () => {
  it("validates every fixed educational key pair and authored policy", async () => {
    await expect(
      validateCryptographicRuntime({
        runtime: coffeeCryptographicRuntime,
        scenario: coffeeScenario,
        provider,
      }),
    ).resolves.toEqual({ isValid: true, issues: [] });
  });

  it("rejects cyclic endorsement-policy expressions without recursing forever", async () => {
    const cyclicExpression: {
      kind: "ALL_OF";
      policies: EndorsementPolicyExpression[];
    } = {
      kind: "ALL_OF",
      policies: [],
    };
    cyclicExpression.policies.push(cyclicExpression);
    const [firstPolicy, ...remainingPolicies] =
      coffeeCryptographicRuntime.endorsementPolicies.policies;
    expect(firstPolicy).toBeDefined();
    const runtime: CryptographicRuntime = {
      ...coffeeCryptographicRuntime,
      endorsementPolicies: {
        ...coffeeCryptographicRuntime.endorsementPolicies,
        policies: [
          {
            ...firstPolicy!,
            expression: cyclicExpression,
          },
          ...remainingPolicies,
        ],
      },
    };

    const result = await validateCryptographicRuntime({
      runtime,
      scenario: coffeeScenario,
      provider,
    });

    expect(result.isValid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        message: "must not contain cyclic policy expressions",
      }),
    );
  });

  it("rejects an organization repeated across one endorsement policy", async () => {
    const [firstPolicy, ...remainingPolicies] =
      coffeeCryptographicRuntime.endorsementPolicies.policies;
    expect(firstPolicy).toBeDefined();
    const repeatedOrganization =
      OrganizationId.PRODUCER_COOP;
    const runtime: CryptographicRuntime = {
      ...coffeeCryptographicRuntime,
      endorsementPolicies: {
        ...coffeeCryptographicRuntime.endorsementPolicies,
        policies: [
          {
            ...firstPolicy!,
            expression: {
              kind: "ALL_OF",
              policies: [
                {
                  kind: "SIGNED_BY",
                  organizationId: repeatedOrganization,
                },
                {
                  kind: "SIGNED_BY",
                  organizationId: repeatedOrganization,
                },
              ],
            },
          },
          ...remainingPolicies,
        ],
      },
    };

    const result = await validateCryptographicRuntime({
      runtime,
      scenario: coffeeScenario,
      provider,
    });

    expect(result.isValid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        message: "must not repeat an organization",
      }),
    );
  });

  it("authorizes a recognized certifier with an active key", async () => {
    const trusted = context(
      "CTX_CERTIFIER",
      ActorId.CERTIFICATION_OFFICER,
      OrganizationId.CERTIFICATION_BODY,
      "CERTIFICATION_OFFICER",
    );
    const result = await signed(trusted, anchorCertificateCommand());

    expect(result.envelope).not.toBeNull();
    expect(result.evidence.signatureValid).toBe(true);
    expect(result.evidence.authorization).toMatchObject({
      recognizedIdentity: true,
      keyActive: true,
      organizationAllowed: true,
      roleAllowed: true,
      contextMatches: true,
      authorized: true,
    });
    expect(result.failureRuleIds).toEqual([]);
  });

  it("keeps a transporter's valid signature distinct from certificate authorization", async () => {
    const trusted = context(
      "CTX_LOGISTICS",
      ActorId.LOGISTICS_COORDINATOR,
      OrganizationId.LOGISTICS_PROVIDER,
      "LOGISTICS_COORDINATOR",
    );
    const result = await signed(trusted, issueCertificateCommand());

    expect(result.evidence.signatureValid).toBe(true);
    expect(result.evidence.authorization.recognizedIdentity).toBe(true);
    expect(result.evidence.authorization.authorized).toBe(false);
    expect(result.failureRuleIds).toEqual(
      expect.arrayContaining([
        SignatureValidationRule.ORGANIZATION_NOT_AUTHORIZED,
        SignatureValidationRule.ROLE_NOT_AUTHORIZED,
      ]),
    );
  });

  it("fails an unknown educational identity even when its signature is valid", async () => {
    const trusted = context(
      "CTX_UNRECOGNIZED",
      "ACT_UNRECOGNIZED_CERTIFIER",
      OrganizationId.UNRECOGNIZED_CERTIFIER,
      "CERTIFICATION_OFFICER",
    );
    const result = await signed(trusted, issueCertificateCommand());

    expect(result.evidence.signatureValid).toBe(true);
    expect(result.evidence.authorization.recognizedIdentity).toBe(false);
    expect(result.envelope).toBeNull();
    expect(result.failureRuleIds).toContain(
      SignatureValidationRule.SIGNER_IDENTITY_UNKNOWN,
    );
  });

  it("rejects expired and revoked signing keys", async () => {
    const certifier = context(
      "CTX_CERTIFIER",
      ActorId.CERTIFICATION_OFFICER,
      OrganizationId.CERTIFICATION_BODY,
      "CERTIFICATION_OFFICER",
    );
    const logistics = context(
      "CTX_LOGISTICS",
      ActorId.LOGISTICS_COORDINATOR,
      OrganizationId.LOGISTICS_PROVIDER,
      "LOGISTICS_COORDINATOR",
    );
    const withKey = (
      organizationId: string,
      keyId: string,
    ): CryptographicRuntime => ({
      ...coffeeCryptographicRuntime,
      identityRegistry: {
        ...coffeeCryptographicRuntime.identityRegistry,
        identities: coffeeCryptographicRuntime.identityRegistry.identities.map(
          (identity) =>
            identity.organizationId === organizationId
              ? { ...identity, activeKeyIds: [keyId] }
              : identity,
        ),
      },
    });

    const expired = await signed(
      certifier,
      issueCertificateCommand(),
      withKey(
        OrganizationId.CERTIFICATION_BODY,
        "KEY_CERTIFIER_EXPIRED_001",
      ),
    );
    const revoked = await signed(
      logistics,
      anchorCertificateCommand(OrganizationId.LOGISTICS_PROVIDER),
      withKey(
        OrganizationId.LOGISTICS_PROVIDER,
        "KEY_LOGISTICS_REVOKED_001",
      ),
    );

    expect(expired.failureRuleIds).toContain(
      SignatureValidationRule.SIGNING_KEY_EXPIRED,
    );
    expect(revoked.failureRuleIds).toContain(
      SignatureValidationRule.SIGNING_KEY_REVOKED,
    );
  });

  it("detects key substitution and trusted-context role mismatch", async () => {
    const logistics = context(
      "CTX_LOGISTICS",
      ActorId.LOGISTICS_COORDINATOR,
      OrganizationId.LOGISTICS_PROVIDER,
      "CERTIFICATION_OFFICER",
    );
    const substituted: CryptographicRuntime = {
      ...coffeeCryptographicRuntime,
      identityRegistry: {
        ...coffeeCryptographicRuntime.identityRegistry,
        identities: coffeeCryptographicRuntime.identityRegistry.identities.map(
          (identity) =>
            identity.organizationId === OrganizationId.LOGISTICS_PROVIDER
              ? { ...identity, activeKeyIds: ["KEY_CERTIFIER_001"] }
              : identity,
        ),
      },
    };
    const result = await signed(
      logistics,
      issueCertificateCommand(),
      substituted,
    );

    expect(result.evidence.signatureValid).toBe(true);
    expect(result.evidence.authorization.contextMatches).toBe(false);
    expect(result.failureRuleIds).toContain(
      SignatureValidationRule.SIGNER_CONTEXT_MISMATCH,
    );
  });

  it("makes proposal identity, session, and state versions signature-bound", async () => {
    const regulator = context(
      "CTX_REGULATOR",
      ActorId.REGULATORY_AUDITOR,
      OrganizationId.REGULATOR,
      "REGULATORY_AUDITOR",
    );
    const result = await signed(
      regulator,
      recallBatchCommand(["BAT_PACKAGED_COFFEE_001"]),
    );
    const tamperedProposal = {
      ...result.evidence.proposal,
      sessionId: "SES_OTHER",
      expectedStateVersions: {
        ...result.evidence.proposal.expectedStateVersions,
        BAT_PACKAGED_COFFEE_001: 5,
      },
    };
    const tamperedStatement = signatureStatement({
      ...result.evidence.signatureStatement,
      proposalDigest: proposalDigest(tamperedProposal),
    });
    const key = coffeeCryptographicRuntime.signingKeys.keys.find(
      (candidate) =>
        candidate.keyId === result.evidence.signature.keyId,
    );
    expect(key).toBeDefined();
    await expect(
      provider.verify(
        {
          algorithm: "Ed25519",
          spkiBase64Url: key?.publicKeySpkiBase64Url ?? "",
        },
        canonicalBytes(tamperedStatement),
        decodeBase64Url(result.evidence.signature.signatureBase64Url),
      ),
    ).resolves.toBe(false);
  });

  it("keeps the original signature valid and rejects a one-character proposal change", async () => {
    const certifier = context(
      "CTX_CERTIFIER",
      ActorId.CERTIFICATION_OFFICER,
      OrganizationId.CERTIFICATION_BODY,
      "CERTIFICATION_OFFICER",
    );
    const result = await signed(certifier, issueCertificateCommand());

    await expect(
      demonstrateSignatureTamper({
        evidence: result.evidence,
        provider,
      }),
    ).resolves.toMatchObject({
      proposalId: "CMD_000003",
      originalSignatureValid: true,
      modifiedProposalSignatureValid: false,
    });
  });

  it("reports a modified signature without weakening authorization evidence", async () => {
    const trusted = context(
      "CTX_CERTIFIER",
      ActorId.CERTIFICATION_OFFICER,
      OrganizationId.CERTIFICATION_BODY,
      "CERTIFICATION_OFFICER",
    );
    const result = await signed(
      trusted,
      anchorCertificateCommand(),
      coffeeCryptographicRuntime,
      true,
    );

    expect(result.evidence.signatureValid).toBe(false);
    expect(result.evidence.authorization.authorized).toBe(true);
    expect(result.envelope).toBeNull();
    expect(result.failureRuleIds).toContain(
      SignatureValidationRule.SIGNATURE_INVALID,
    );
  });
});
