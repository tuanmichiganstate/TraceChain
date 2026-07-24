import { describe, expect, it } from "vitest";
import { GUIDED_PRESET } from "../../config/presets";
import { hashConfiguration } from "../../config/hash";
import { runtimeCommand } from "../../domain/scenario/runtime";
import type {
  DomainSimulationCommand,
  TrustedExecutionContext,
} from "../../domain/simulation/types";
import type { TransferCustodyCommand } from "../../domain/commands/commands";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import { coffeeCryptographicRuntime } from "../../scenarios/coffee-traceability/cryptographic-runtime";
import { NobleEd25519Provider } from "../signatures/noble-ed25519-provider";
import {
  signAndVerifyCommand,
  signAndVerifyProposal,
} from "../signatures/signing-service";
import type {
  EndorsementPolicyDefinition,
  EndorsementRecord,
  SignatureTrustEvidence,
} from "../signatures/types";
import {
  endorsementAuthorizationCommandType,
  evaluateEndorsementPolicy,
} from "./policy-evaluator";

const provider = new NobleEd25519Provider();

function context(contextId: string): TrustedExecutionContext {
  const value =
    coffeeScenario.runtime.trustedContexts.find(
      (candidate) => candidate.contextId === contextId,
    );
  if (value === undefined) {
    throw new Error(`Missing context "${contextId}"`);
  }
  return value;
}

function record(
  endorsementId: string,
  evidence: SignatureTrustEvidence,
): EndorsementRecord {
  return {
    endorsementId,
    proposalId: evidence.proposal.proposalId,
    proposalDigest: evidence.proposalDigest,
    organizationId: evidence.signature.organizationId,
    roleId: evidence.signature.roleId,
    keyId: evidence.signature.keyId,
    signature: evidence.signature,
    endorsedAt: evidence.signature.signedAt,
    verification: evidence,
  };
}

async function evidence() {
  const producer = context("CTX_PRODUCER");
  const logistics = context("CTX_LOGISTICS");
  const payload = runtimeCommand<TransferCustodyCommand>(
    coffeeScenario,
    "TRANSFER_CUSTODY",
  );
  const command: DomainSimulationCommand = {
    metadata: {
      commandId: "CMD_000010",
      sessionId: "SES_ENDORSEMENT_TEST",
      actorId: producer.actorId,
      organizationId: producer.organizationId,
      roleId: producer.roleId,
      submittedAt: payload.scenarioTimestamp,
      expectedStateVersions: {
        [payload.assetId]: 4,
      },
    },
    payload,
  };
  const submission = await signAndVerifyCommand({
    command,
    trustedContext: producer,
    configurationHash: hashConfiguration(GUIDED_PRESET),
    scenarioId: coffeeScenario.scenarioId,
    scenarioVersion: coffeeScenario.scenarioVersion,
    runtime: coffeeCryptographicRuntime,
    provider,
  });
  const endorsement = await signAndVerifyProposal({
    proposal: submission.evidence.proposal,
    trustedContext: logistics,
    authorizationCommandType:
      endorsementAuthorizationCommandType(
        payload.commandType,
      ),
    signedAt: payload.scenarioTimestamp,
    purpose: "ENDORSEMENT",
    runtime: coffeeCryptographicRuntime,
    provider,
  });
  return {
    proposal: submission.evidence,
    producer: record(
      "END_PRODUCER",
      submission.evidence,
    ),
    logistics: record("END_LOGISTICS", endorsement),
    logisticsContext: logistics,
  };
}

function policy(
  expression: EndorsementPolicyDefinition["expression"],
): EndorsementPolicyDefinition {
  return {
    endorsementPolicyId: "POLICY_TEST",
    appliesToCommandTypes: ["TRANSFER_CUSTODY"],
    expression,
    localizationKey: "endorsement.policy.custody",
  };
}

describe("genuine endorsement policy evaluation", () => {
  it("supports SIGNED_BY, ALL_OF, ANY_OF, and THRESHOLD", async () => {
    const values = await evidence();
    const records = [values.producer, values.logistics];
    const producerId = values.producer.organizationId;
    const logisticsId = values.logistics.organizationId;
    const expressions: EndorsementPolicyDefinition["expression"][] =
      [
        {
          kind: "SIGNED_BY",
          organizationId: producerId,
        },
        {
          kind: "ALL_OF",
          policies: [
            {
              kind: "SIGNED_BY",
              organizationId: producerId,
            },
            {
              kind: "SIGNED_BY",
              organizationId: logisticsId,
            },
          ],
        },
        {
          kind: "ANY_OF",
          policies: [
            {
              kind: "SIGNED_BY",
              organizationId: "ORG_NOT_PRESENT",
            },
            {
              kind: "SIGNED_BY",
              organizationId: logisticsId,
            },
          ],
        },
        {
          kind: "THRESHOLD",
          required: 2,
          organizationIds: [producerId, logisticsId],
        },
      ];

    for (const expression of expressions) {
      expect(
        evaluateEndorsementPolicy({
          policy: policy(expression),
          proposalId: values.proposal.proposal.proposalId,
          proposalDigest: values.proposal.proposalDigest,
          records,
        }).satisfied,
      ).toBe(true);
    }
  });

  it("does not count one organization twice", async () => {
    const values = await evidence();
    const duplicate = {
      ...values.producer,
      endorsementId: "END_PRODUCER_DUPLICATE",
    };
    const evaluation = evaluateEndorsementPolicy({
      policy: policy({
        kind: "THRESHOLD",
        required: 2,
        organizationIds: [
          values.producer.organizationId,
          values.logistics.organizationId,
        ],
      }),
      proposalId: values.proposal.proposal.proposalId,
      proposalDigest: values.proposal.proposalDigest,
      records: [values.producer, duplicate],
    });

    expect(evaluation.satisfied).toBe(false);
    expect(evaluation.duplicateOrganizationIds).toEqual([
      values.producer.organizationId,
    ]);
    expect(evaluation.validEndorsementIds).toEqual([
      values.producer.endorsementId,
    ]);
  });

  it("rejects valid signatures over different proposal contents", async () => {
    const values = await evidence();
    const modifiedProposal = {
      ...values.proposal.proposal,
      commandPayload: {
        ...(values.proposal.proposal.commandPayload as object),
        alsoTransfersOwnership: true,
      },
    };
    const mismatchEvidence = await signAndVerifyProposal({
      proposal: modifiedProposal,
      trustedContext: values.logisticsContext,
      authorizationCommandType:
        endorsementAuthorizationCommandType(
          values.proposal.proposal.commandType,
        ),
      signedAt: values.proposal.signature.signedAt,
      purpose: "ENDORSEMENT",
      runtime: coffeeCryptographicRuntime,
      provider,
    });
    const mismatch = record(
      "END_LOGISTICS_MISMATCH",
      mismatchEvidence,
    );
    const evaluation = evaluateEndorsementPolicy({
      policy: policy({
        kind: "ALL_OF",
        policies: [
          {
            kind: "SIGNED_BY",
            organizationId: values.producer.organizationId,
          },
          {
            kind: "SIGNED_BY",
            organizationId: values.logistics.organizationId,
          },
        ],
      }),
      proposalId: values.proposal.proposal.proposalId,
      proposalDigest: values.proposal.proposalDigest,
      records: [values.producer, mismatch],
    });

    expect(mismatch.verification.signatureValid).toBe(true);
    expect(evaluation.satisfied).toBe(false);
    expect(evaluation.proposalMismatchIds).toEqual([
      mismatch.endorsementId,
    ]);
    expect(evaluation.failureRuleIds).toContain(
      "RULE_ENDORSEMENT_PROPOSAL_MISMATCH",
    );
  });

  it("excludes a tampered endorsement signature", async () => {
    const values = await evidence();
    const tampered = await signAndVerifyProposal({
      proposal: values.proposal.proposal,
      trustedContext: values.logisticsContext,
      authorizationCommandType:
        endorsementAuthorizationCommandType(
          values.proposal.proposal.commandType,
        ),
      signedAt: values.proposal.signature.signedAt,
      purpose: "ENDORSEMENT",
      runtime: coffeeCryptographicRuntime,
      provider,
      tamperSignature: true,
    });
    const tamperedRecord = record(
      "END_LOGISTICS_TAMPERED",
      tampered,
    );
    const evaluation = evaluateEndorsementPolicy({
      policy: policy({
        kind: "ALL_OF",
        policies: [
          {
            kind: "SIGNED_BY",
            organizationId: values.producer.organizationId,
          },
          {
            kind: "SIGNED_BY",
            organizationId: values.logistics.organizationId,
          },
        ],
      }),
      proposalId: values.proposal.proposal.proposalId,
      proposalDigest: values.proposal.proposalDigest,
      records: [values.producer, tamperedRecord],
    });

    expect(tampered.signatureValid).toBe(false);
    expect(evaluation.satisfied).toBe(false);
    expect(evaluation.invalidEndorsementIds).toContain(
      tamperedRecord.endorsementId,
    );
    expect(evaluation.failureRuleIds).toContain(
      "RULE_ENDORSEMENT_SIGNATURE_INVALID",
    );
  });
});
