import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import {
  sha256Bytes,
  toHex,
} from "../../infrastructure/hashing/sha256";
import type { DomainSimulationCommand } from "../../domain/simulation/types";
import type {
  SignatureStatementV1,
  TransactionProposalV1,
} from "./types";

const encoder = new TextEncoder();

export function canonicalBytes(value: unknown): Uint8Array {
  return encoder.encode(canonicalize(value));
}

export function createTransactionProposal(options: {
  readonly configurationHash: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly command: DomainSimulationCommand;
}): TransactionProposalV1 {
  const { command } = options;
  return {
    domain: "TRACECHAIN_TRANSACTION_PROPOSAL_V1",
    configurationHash: options.configurationHash,
    scenarioId: options.scenarioId,
    scenarioVersion: options.scenarioVersion,
    sessionId: command.metadata.sessionId,
    proposalId: command.metadata.commandId,
    commandType: command.payload.commandType,
    commandPayload: command.payload,
    expectedStateVersions: command.metadata.expectedStateVersions,
    proposedAt: command.metadata.submittedAt,
  };
}

export function proposalDigest(proposal: TransactionProposalV1): string {
  return toHex(sha256Bytes(canonicalBytes(proposal)));
}

export function signatureStatement(options: {
  readonly proposalDigest: string;
  readonly sessionId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly keyId: string;
  readonly signedAt: string;
  readonly purpose?: SignatureStatementV1["purpose"];
}): SignatureStatementV1 {
  return {
    domain: "TRACECHAIN_SIGNATURE_V1",
    purpose: options.purpose ?? "PROPOSAL_SUBMISSION",
    proposalDigest: options.proposalDigest,
    sessionId: options.sessionId,
    organizationId: options.organizationId,
    roleId: options.roleId,
    keyId: options.keyId,
    signedAt: options.signedAt,
  };
}
