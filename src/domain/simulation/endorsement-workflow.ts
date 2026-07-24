import {
  EndorsementValidationRule,
  type CryptographicRuntime,
  type EndorsementPolicyDefinition,
  type EndorsementRecord,
  type SignatureProvider,
  type SignatureTrustEvidence,
} from "../../crypto/signatures/types";
import {
  endorsementAuthorizationCommandType,
  endorsementPolicyFor,
  evaluateEndorsementPolicy,
} from "../../crypto/endorsements/policy-evaluator";
import {
  signAndVerifyProposal,
  signatureAttemptFailures,
} from "../../crypto/signatures/signing-service";
import type { EndorsementResult } from "../types/models";
import type { SimulatedLedger } from "../ledger/ledger-engine";
import { evaluateRules } from "../rules/registry";
import type { ValidationRegistries } from "../rules/types";
import type { SimulationEnvironment } from "./environment";
import {
  handleSimulationCommand,
  recordRejectedAttempt,
  stateVersionFailures,
  trustedContextFailures,
} from "./command-handler";
import type {
  AttemptAuditEvent,
  AttemptValidationFailure,
  CommitEndorsedTransactionCommand,
  DeclineTransactionProposalCommand,
  DomainSimulationCommand,
  EndorsementWorkflowOutcome,
  EndorseTransactionProposalCommand,
  PendingTransactionProposal,
  SimulationCommand,
  SimulationDecisionEvent,
  SimulationRuntimeState,
  TrustedExecutionContext,
} from "./types";

const ENDORSEMENT_FAILURE_MESSAGES = {
  RULE_ENDORSEMENT_POLICY_NOT_SATISFIED:
    "endorsement.failure.policyNotSatisfied",
  RULE_ENDORSEMENT_SIGNATURE_INVALID:
    "endorsement.failure.signatureInvalid",
  RULE_ENDORSER_NOT_AUTHORIZED:
    "endorsement.failure.endorserNotAuthorized",
  RULE_ENDORSEMENT_PROPOSAL_MISMATCH:
    "endorsement.failure.proposalMismatch",
  RULE_DUPLICATE_ENDORSER:
    "endorsement.failure.duplicateEndorser",
  RULE_ENDORSED_STATE_VERSION_STALE:
    "endorsement.failure.stateVersionStale",
} as const;

function eventFor(
  command: SimulationCommand,
  decisionType: string,
  payload: unknown,
  environment: SimulationEnvironment,
): SimulationDecisionEvent {
  return {
    kind: "SIMULATION_DECISION",
    eventId: environment.ids.nextId("EVT"),
    commandId: command.metadata.commandId,
    sessionId: command.metadata.sessionId,
    actorId: command.metadata.actorId,
    organizationId: command.metadata.organizationId,
    roleId: command.metadata.roleId,
    occurredAt: environment.clock.now(),
    decisionType,
    payload,
  };
}

function existingOutcome(
  runtime: SimulationRuntimeState,
  commandId: string,
): EndorsementWorkflowOutcome | null {
  const auditEvent = runtime.attemptAuditEvents.find(
    (candidate) => candidate.commandId === commandId,
  );
  if (auditEvent !== undefined) {
    const proposalId = (
      auditEvent.submittedCommand.payload as {
        readonly proposalId?: string;
      }
    ).proposalId;
    return {
      isAccepted: false,
      commandId,
      state: runtime,
      pendingProposal:
        proposalId === undefined
          ? null
          : (runtime.pendingProposalsById[proposalId] ?? null),
      auditEvent,
    };
  }
  const event = runtime.acceptedEvents.find(
    (candidate) =>
      candidate.kind === "SIMULATION_DECISION" &&
      candidate.commandId === commandId,
  );
  if (event?.kind !== "SIMULATION_DECISION") return null;
  const proposalId = (
    event.payload as { readonly proposalId?: string }
  ).proposalId;
  const pendingProposal =
    proposalId === undefined
      ? null
      : runtime.pendingProposalsById[proposalId];
  if (pendingProposal === undefined || pendingProposal === null) {
    return null;
  }
  return {
    isAccepted: true,
    commandId,
    state: runtime,
    pendingProposal,
    event,
  };
}

function rejectWorkflow(options: {
  readonly runtime: SimulationRuntimeState;
  readonly command: SimulationCommand;
  readonly failures: readonly AttemptValidationFailure[];
  readonly environment: SimulationEnvironment;
  readonly pendingProposal: PendingTransactionProposal | null;
  readonly signatureEvidence?: SignatureTrustEvidence;
  readonly status?: PendingTransactionProposal["status"];
}): EndorsementWorkflowOutcome {
  const auditEvent: AttemptAuditEvent = {
    kind: "COMMAND_REJECTED",
    auditEventId: options.environment.ids.nextId("AUD"),
    commandId: options.command.metadata.commandId,
    sessionId: options.command.metadata.sessionId,
    actorId: options.command.metadata.actorId,
    organizationId: options.command.metadata.organizationId,
    roleId: options.command.metadata.roleId,
    occurredAt: options.environment.clock.now(),
    submittedCommand: options.command,
    validationFailures: options.failures,
    ...(options.signatureEvidence === undefined
      ? {}
      : { signatureEvidence: options.signatureEvidence }),
  };
  const pendingProposal =
    options.pendingProposal === null || options.status === undefined
      ? options.pendingProposal
      : {
          ...options.pendingProposal,
          status: options.status,
        };
  const state: SimulationRuntimeState = {
    ...options.runtime,
    attemptAuditEvents: [
      ...options.runtime.attemptAuditEvents,
      auditEvent,
    ],
    ...(pendingProposal === null
      ? {}
      : {
          pendingProposalsById: {
            ...options.runtime.pendingProposalsById,
            [pendingProposal.proposalId]: pendingProposal,
          },
        }),
  };
  return {
    isAccepted: false,
    commandId: options.command.metadata.commandId,
    state,
    pendingProposal,
    auditEvent,
  };
}

function workflowFailures(
  ruleIds: readonly (keyof typeof ENDORSEMENT_FAILURE_MESSAGES)[],
): readonly AttemptValidationFailure[] {
  return ruleIds.map((ruleId) => ({
    code: ruleId,
    messageKey: ENDORSEMENT_FAILURE_MESSAGES[ruleId],
    details: { ruleId },
  }));
}

function recordFromEvidence(
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

function supersedePriorProposal(
  runtime: SimulationRuntimeState,
  actionId: string,
  proposalId: string,
): SimulationRuntimeState["pendingProposalsById"] {
  return Object.fromEntries(
    Object.entries(runtime.pendingProposalsById).map(
      ([candidateId, candidate]) => [
        candidateId,
        candidate.actionId === actionId &&
        candidate.proposalId !== proposalId &&
        candidate.status !== "COMMITTED"
          ? { ...candidate, status: "SUPERSEDED" as const }
          : candidate,
      ],
    ),
  );
}

export function createEndorsedProposal(options: {
  readonly runtime: SimulationRuntimeState;
  readonly actionId: string;
  readonly command: DomainSimulationCommand;
  readonly trustedContext: TrustedExecutionContext;
  readonly signatureEvidence: SignatureTrustEvidence;
  readonly signatureFailures: readonly AttemptValidationFailure[];
  readonly policies: readonly EndorsementPolicyDefinition[];
  readonly registries: ValidationRegistries;
  readonly environment: SimulationEnvironment;
}): EndorsementWorkflowOutcome {
  const duplicate = existingOutcome(
    options.runtime,
    options.command.metadata.commandId,
  );
  if (duplicate !== null) return duplicate;

  const policy = endorsementPolicyFor(
    options.policies,
    options.command.payload.commandType,
  );
  if (policy === null) {
    throw new Error(
      `No endorsement policy applies to "${options.command.payload.commandType}"`,
    );
  }
  const boundaryFailures = [
    ...trustedContextFailures(
      options.command,
      options.trustedContext,
    ),
    ...stateVersionFailures(options.command, options.runtime.domain),
    ...options.signatureFailures,
  ];
  const validation = evaluateRules(options.command.payload, {
    ...options.registries,
    state: options.runtime.domain,
    actorId: options.trustedContext.actorId,
    organizationId: options.trustedContext.organizationId,
  });
  const failures = [
    ...boundaryFailures,
    ...validation.failures.map((failure) => ({
      code: "DOMAIN_RULE_FAILED" as const,
      messageKey: failure.messageKey,
      details: { ruleId: failure.ruleId },
    })),
  ];
  if (failures.length > 0) {
    const rejected = recordRejectedAttempt(
      options.runtime,
      options.command,
      failures,
      options.environment,
      validation,
      null,
      options.signatureEvidence,
    );
    if (rejected.isAccepted) {
      throw new Error("Rejected proposal unexpectedly entered the ledger");
    }
    return {
      isAccepted: false,
      commandId: rejected.commandId,
      state: rejected.state,
      pendingProposal: null,
      auditEvent: rejected.auditEvent,
    };
  }

  const proposerRecord = recordFromEvidence(
    `END_${options.command.metadata.commandId}_SUBMITTER`,
    options.signatureEvidence,
  );
  const evaluation = evaluateEndorsementPolicy({
    policy,
    proposalId: options.signatureEvidence.proposal.proposalId,
    proposalDigest: options.signatureEvidence.proposalDigest,
    records: [proposerRecord],
  });
  const pendingProposal: PendingTransactionProposal = {
    proposalId: options.signatureEvidence.proposal.proposalId,
    actionId: options.actionId,
    command: options.command,
    proposerContext: options.trustedContext,
    proposalEvidence: options.signatureEvidence,
    policy,
    endorsements: [proposerRecord],
    evaluation,
    status: evaluation.satisfied
      ? "POLICY_SATISFIED"
      : "AWAITING_ENDORSEMENTS",
    declineCommandIds: [],
    transactionId: null,
  };
  const event = eventFor(
    options.command,
    "TRANSACTION_PROPOSAL_CREATED",
    {
      proposalId: pendingProposal.proposalId,
      proposalDigest: pendingProposal.proposalEvidence.proposalDigest,
      actionId: pendingProposal.actionId,
      commandType: options.command.payload.commandType,
      endorsementPolicyId: policy.endorsementPolicyId,
    },
    options.environment,
  );
  const state: SimulationRuntimeState = {
    ...options.runtime,
    acceptedEvents: [...options.runtime.acceptedEvents, event],
    pendingProposalsById: {
      ...supersedePriorProposal(
        options.runtime,
        options.actionId,
        pendingProposal.proposalId,
      ),
      [pendingProposal.proposalId]: pendingProposal,
    },
  };
  return {
    isAccepted: true,
    commandId: options.command.metadata.commandId,
    state,
    pendingProposal,
    event,
  };
}

export async function endorsePendingProposal(options: {
  readonly runtime: SimulationRuntimeState;
  readonly command: SimulationCommand & {
    readonly payload: EndorseTransactionProposalCommand;
  };
  readonly trustedContext: TrustedExecutionContext;
  readonly cryptographicRuntime: CryptographicRuntime;
  readonly provider: SignatureProvider;
  readonly environment: SimulationEnvironment;
}): Promise<EndorsementWorkflowOutcome> {
  const duplicate = existingOutcome(
    options.runtime,
    options.command.metadata.commandId,
  );
  if (duplicate !== null) return duplicate;
  const pending =
    options.runtime.pendingProposalsById[
      options.command.payload.proposalId
    ];
  if (pending === undefined) {
    throw new Error(
      `Unknown pending proposal "${options.command.payload.proposalId}"`,
    );
  }
  const evidence = await signAndVerifyProposal({
    proposal: pending.proposalEvidence.proposal,
    trustedContext: options.trustedContext,
    authorizationCommandType: endorsementAuthorizationCommandType(
      pending.command.payload.commandType,
    ),
    signedAt: options.command.metadata.submittedAt,
    purpose: "ENDORSEMENT",
    runtime: options.cryptographicRuntime,
    provider: options.provider,
  });
  const contextMatches =
    options.command.metadata.actorId ===
      options.trustedContext.actorId &&
    options.command.metadata.organizationId ===
      options.trustedContext.organizationId &&
    options.command.metadata.roleId === options.trustedContext.roleId;
  const record = recordFromEvidence(
    `END_${options.command.metadata.commandId}`,
    evidence,
  );
  const evaluation = evaluateEndorsementPolicy({
    policy: pending.policy,
    proposalId: pending.proposalId,
    proposalDigest: pending.proposalEvidence.proposalDigest,
    records: [...pending.endorsements, record],
  });
  const endorsementFailures = evaluation.failureRuleIds.filter(
    (ruleId) =>
      ruleId !==
      EndorsementValidationRule.POLICY_NOT_SATISFIED,
  );
  const failures: AttemptValidationFailure[] = [
    ...(contextMatches
      ? []
      : [
          {
            code: "TRUSTED_CONTEXT_MISMATCH" as const,
            messageKey: "errors.trustedContextMismatch",
            details: {
              trustedContextId: options.trustedContext.contextId,
            },
          },
        ]),
    ...signatureAttemptFailures(evidence.failureRuleIds),
    ...workflowFailures(endorsementFailures),
  ];
  if (failures.length > 0) {
    return rejectWorkflow({
      runtime: options.runtime,
      command: options.command,
      failures,
      environment: options.environment,
      pendingProposal: pending,
      signatureEvidence: evidence,
    });
  }

  const nextPending: PendingTransactionProposal = {
    ...pending,
    endorsements: [...pending.endorsements, record],
    evaluation,
    status: evaluation.satisfied
      ? "POLICY_SATISFIED"
      : "AWAITING_ENDORSEMENTS",
  };
  const event = eventFor(
    options.command,
    "TRANSACTION_PROPOSAL_ENDORSED",
    {
      proposalId: pending.proposalId,
      proposalDigest: pending.proposalEvidence.proposalDigest,
      endorsementId: record.endorsementId,
      organizationId: record.organizationId,
      endorsementPolicyId: pending.policy.endorsementPolicyId,
      policySatisfied: evaluation.satisfied,
    },
    options.environment,
  );
  const state: SimulationRuntimeState = {
    ...options.runtime,
    acceptedEvents: [...options.runtime.acceptedEvents, event],
    pendingProposalsById: {
      ...options.runtime.pendingProposalsById,
      [pending.proposalId]: nextPending,
    },
  };
  return {
    isAccepted: true,
    commandId: options.command.metadata.commandId,
    state,
    pendingProposal: nextPending,
    event,
  };
}

export function declinePendingProposal(options: {
  readonly runtime: SimulationRuntimeState;
  readonly command: SimulationCommand & {
    readonly payload: DeclineTransactionProposalCommand;
  };
  readonly trustedContext: TrustedExecutionContext;
  readonly environment: SimulationEnvironment;
}): EndorsementWorkflowOutcome {
  const duplicate = existingOutcome(
    options.runtime,
    options.command.metadata.commandId,
  );
  if (duplicate !== null) return duplicate;
  const pending =
    options.runtime.pendingProposalsById[
      options.command.payload.proposalId
    ];
  if (pending === undefined) {
    throw new Error(
      `Unknown pending proposal "${options.command.payload.proposalId}"`,
    );
  }
  const contextMatches =
    options.command.metadata.actorId ===
      options.trustedContext.actorId &&
    options.command.metadata.organizationId ===
      options.trustedContext.organizationId &&
    options.command.metadata.roleId === options.trustedContext.roleId;
  if (!contextMatches) {
    return rejectWorkflow({
      runtime: options.runtime,
      command: options.command,
      failures: [
        {
          code: "TRUSTED_CONTEXT_MISMATCH",
          messageKey: "errors.trustedContextMismatch",
          details: {
            trustedContextId: options.trustedContext.contextId,
          },
        },
      ],
      environment: options.environment,
      pendingProposal: pending,
    });
  }
  const nextPending: PendingTransactionProposal = {
    ...pending,
    status: "DECLINED",
    declineCommandIds: [
      ...pending.declineCommandIds,
      options.command.metadata.commandId,
    ],
  };
  const event = eventFor(
    options.command,
    "TRANSACTION_PROPOSAL_DECLINED",
    {
      proposalId: pending.proposalId,
      proposalDigest: pending.proposalEvidence.proposalDigest,
      organizationId: options.trustedContext.organizationId,
    },
    options.environment,
  );
  const state: SimulationRuntimeState = {
    ...options.runtime,
    acceptedEvents: [...options.runtime.acceptedEvents, event],
    pendingProposalsById: {
      ...options.runtime.pendingProposalsById,
      [pending.proposalId]: nextPending,
    },
  };
  return {
    isAccepted: true,
    commandId: options.command.metadata.commandId,
    state,
    pendingProposal: nextPending,
    event,
  };
}

function genuineEndorsementResults(
  pending: PendingTransactionProposal,
): readonly EndorsementResult[] {
  const validIds = new Set(
    pending.evaluation.validEndorsementIds,
  );
  return pending.endorsements
    .filter((record) => validIds.has(record.endorsementId))
    .map((record) => ({
      endorsingOrganizationId: record.organizationId,
      endorsedAt: record.endorsedAt,
      isEndorsed: true,
      isSimulatedCounterparty: false,
      endorsementId: record.endorsementId,
      proposalDigest: record.proposalDigest,
      endorsementPolicyId:
        pending.policy.endorsementPolicyId,
      signatureEvidence: record.verification,
    }));
}

export function commitPendingProposal(options: {
  readonly runtime: SimulationRuntimeState;
  readonly command: SimulationCommand & {
    readonly payload: CommitEndorsedTransactionCommand;
  };
  readonly trustedContext: TrustedExecutionContext;
  readonly ledger: SimulatedLedger;
  readonly registries: ValidationRegistries;
  readonly environment: SimulationEnvironment;
}): {
  readonly workflow: EndorsementWorkflowOutcome;
  readonly transactionOutcome:
    | ReturnType<typeof handleSimulationCommand>
    | null;
} {
  const duplicate = existingOutcome(
    options.runtime,
    options.command.metadata.commandId,
  );
  if (duplicate !== null) {
    return { workflow: duplicate, transactionOutcome: null };
  }
  const pending =
    options.runtime.pendingProposalsById[
      options.command.payload.proposalId
    ];
  if (pending === undefined) {
    throw new Error(
      `Unknown pending proposal "${options.command.payload.proposalId}"`,
    );
  }
  const contextMatches =
    options.command.metadata.actorId ===
      options.trustedContext.actorId &&
    options.command.metadata.organizationId ===
      options.trustedContext.organizationId &&
    options.command.metadata.roleId ===
      options.trustedContext.roleId;
  if (!contextMatches) {
    return {
      workflow: rejectWorkflow({
        runtime: options.runtime,
        command: options.command,
        failures: [
          {
            code: "TRUSTED_CONTEXT_MISMATCH",
            messageKey: "errors.trustedContextMismatch",
            details: {
              trustedContextId:
                options.trustedContext.contextId,
            },
          },
        ],
        environment: options.environment,
        pendingProposal: pending,
      }),
      transactionOutcome: null,
    };
  }
  const evaluation = evaluateEndorsementPolicy({
    policy: pending.policy,
    proposalId: pending.proposalId,
    proposalDigest: pending.proposalEvidence.proposalDigest,
    records: pending.endorsements,
  });
  if (!evaluation.satisfied) {
    return {
      workflow: rejectWorkflow({
        runtime: options.runtime,
        command: options.command,
        failures: workflowFailures([
          EndorsementValidationRule.POLICY_NOT_SATISFIED,
        ]),
        environment: options.environment,
        pendingProposal: {
          ...pending,
          evaluation,
        },
      }),
      transactionOutcome: null,
    };
  }
  const staleFailures = stateVersionFailures(
    pending.command,
    options.runtime.domain,
  );
  if (staleFailures.length > 0) {
    return {
      workflow: rejectWorkflow({
        runtime: options.runtime,
        command: options.command,
        failures: workflowFailures([
          EndorsementValidationRule.ENDORSED_STATE_VERSION_STALE,
        ]),
        environment: options.environment,
        pendingProposal: {
          ...pending,
          evaluation,
        },
        status: "STALE",
      }),
      transactionOutcome: null,
    };
  }

  const transactionOutcome = handleSimulationCommand({
    runtime: options.runtime,
    command: pending.command,
    trustedContext: pending.proposerContext,
    ledger: options.ledger,
    registries: options.registries,
    environment: options.environment,
    signatureEvidence: pending.proposalEvidence,
    signatureFailures: signatureAttemptFailures(
      pending.proposalEvidence.failureRuleIds,
    ),
    verifiedEndorsements: genuineEndorsementResults({
      ...pending,
      evaluation,
    }),
  });
  if (!transactionOutcome.isAccepted) {
    return {
      workflow: {
        isAccepted: false,
        commandId: options.command.metadata.commandId,
        state: transactionOutcome.state,
        pendingProposal: pending,
        auditEvent: transactionOutcome.auditEvent,
      },
      transactionOutcome,
    };
  }
  const event = eventFor(
    options.command,
    "ENDORSED_TRANSACTION_COMMITTED",
    {
      proposalId: pending.proposalId,
      proposalDigest: pending.proposalEvidence.proposalDigest,
      transactionId:
        transactionOutcome.transaction?.transactionId ?? null,
      endorsementPolicyId: pending.policy.endorsementPolicyId,
      endorsingOrganizationIds: genuineEndorsementResults({
        ...pending,
        evaluation,
      }).map((result) => result.endorsingOrganizationId),
    },
    options.environment,
  );
  const nextPending: PendingTransactionProposal = {
    ...pending,
    evaluation,
    status: "COMMITTED",
    transactionId:
      transactionOutcome.transaction?.transactionId ?? null,
  };
  const state: SimulationRuntimeState = {
    ...transactionOutcome.state,
    acceptedEvents: [
      ...transactionOutcome.state.acceptedEvents,
      event,
    ],
    pendingProposalsById: {
      ...transactionOutcome.state.pendingProposalsById,
      [pending.proposalId]: nextPending,
    },
  };
  return {
    workflow: {
      isAccepted: true,
      commandId: options.command.metadata.commandId,
      state,
      pendingProposal: nextPending,
      event,
    },
    transactionOutcome: {
      ...transactionOutcome,
      state,
    },
  };
}
