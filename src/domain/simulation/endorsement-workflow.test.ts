import { describe, expect, it } from "vitest";
import { runUpTo } from "../../../test/support/scenario-driver";
import { GUIDED_PRESET } from "../../config/presets";
import { hashConfiguration } from "../../config/hash";
import { NobleEd25519Provider } from "../../crypto/signatures/noble-ed25519-provider";
import {
  signAndVerifyCommand,
  signatureAttemptFailures,
} from "../../crypto/signatures/signing-service";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type { TransferCustodyCommand } from "../commands/commands";
import { SimulatedLedger } from "../ledger/ledger-engine";
import { runtimeCommand } from "../scenario/runtime";
import { TransactionType } from "../types/enums";
import { coffeeCryptographicRuntime } from "../../scenarios/coffee-traceability/cryptographic-runtime";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import {
  createSimulationRuntimeState,
  expectedStateVersionsFor,
  handleSimulationCommand,
} from "./command-handler";
import {
  FixedClock,
  SeededRandomSource,
  SequenceIdGenerator,
  type SimulationEnvironment,
} from "./environment";
import {
  commitPendingProposal,
  createEndorsedProposal,
  declinePendingProposal,
  endorsePendingProposal,
} from "./endorsement-workflow";
import type {
  CommitEndorsedTransactionCommand,
  DeclineTransactionProposalCommand,
  DomainSimulationCommand,
  EndorseTransactionProposalCommand,
  SimulationCommand,
  TrustedExecutionContext,
} from "./types";

const registries = {
  organizationsById: Object.fromEntries(
    coffeeScenario.organizations.map((organization) => [
      organization.organizationId,
      organization,
    ]),
  ),
  actorsById: Object.fromEntries(
    coffeeScenario.actors.map((actor) => [
      actor.actorId,
      actor,
    ]),
  ),
};

function trusted(contextId: string): TrustedExecutionContext {
  const context = coffeeScenario.runtime.trustedContexts.find(
    (candidate) => candidate.contextId === contextId,
  );
  if (context === undefined) {
    throw new Error(`Missing trusted context "${contextId}"`);
  }
  return context;
}

function environment(instant: string): SimulationEnvironment {
  return {
    clock: new FixedClock(instant),
    random: new SeededRandomSource("endorsement-workflow-test"),
    ids: new SequenceIdGenerator(100),
  };
}

function workflowCommand<
  T extends SimulationCommand["payload"],
>(
  commandId: string,
  context: TrustedExecutionContext,
  submittedAt: string,
  payload: T,
): SimulationCommand & { readonly payload: T } {
  return {
    metadata: {
      commandId,
      sessionId: "SES_ENDORSEMENT_WORKFLOW",
      actorId: context.actorId,
      organizationId: context.organizationId,
      roleId: context.roleId,
      submittedAt,
      expectedStateVersions: {},
    },
    payload,
  } as SimulationCommand & { readonly payload: T };
}

async function pendingCustodyProposal() {
  const certified = await runUpTo("certified", {
    withSeed: true,
  });
  const producer = trusted("CTX_PRODUCER");
  const logistics = trusted("CTX_LOGISTICS");
  const payload = runtimeCommand<TransferCustodyCommand>(
    coffeeScenario,
    "TRANSFER_CUSTODY",
  );
  const runtime = createSimulationRuntimeState(
    certified.getState(),
  );
  const command: DomainSimulationCommand = {
    metadata: {
      commandId: "CMD_PROPOSAL",
      sessionId: "SES_ENDORSEMENT_WORKFLOW",
      actorId: producer.actorId,
      organizationId: producer.organizationId,
      roleId: producer.roleId,
      submittedAt: payload.scenarioTimestamp,
      expectedStateVersions: expectedStateVersionsFor(
        payload,
        runtime.domain,
      ),
    },
    payload,
  };
  const provider = new NobleEd25519Provider();
  const signed = await signAndVerifyCommand({
    command,
    trustedContext: producer,
    configurationHash: hashConfiguration(GUIDED_PRESET),
    scenarioId: coffeeScenario.scenarioId,
    scenarioVersion: coffeeScenario.scenarioVersion,
    runtime: coffeeCryptographicRuntime,
    provider,
  });
  const env = environment(payload.scenarioTimestamp);
  const created = createEndorsedProposal({
    runtime,
    actionId: "TRANSFER_CUSTODY",
    command,
    trustedContext: producer,
    signatureEvidence: signed.evidence,
    signatureFailures: signatureAttemptFailures(
      signed.failureRuleIds,
    ),
    policies:
      coffeeCryptographicRuntime.endorsementPolicies.policies,
    registries,
    environment: env,
  });
  if (!created.isAccepted) {
    throw new Error("The authored custody proposal was rejected");
  }
  return {
    command,
    created,
    env,
    ledger: new SimulatedLedger(
      sha256Hex,
      coffeeScenario.ledgerConfiguration,
    ),
    logistics,
    producer,
    provider,
  };
}

describe("pending endorsed transaction lifecycle", () => {
  it("retains a decline as decision history and permits later genuine endorsement", async () => {
    const setup = await pendingCustodyProposal();
    const proposalId = setup.created.pendingProposal.proposalId;
    const declined = declinePendingProposal({
      runtime: setup.created.state,
      command: workflowCommand<DeclineTransactionProposalCommand>(
        "CMD_DECLINE",
        setup.logistics,
        setup.command.metadata.submittedAt,
        {
          commandType: "DECLINE_TRANSACTION_PROPOSAL",
          proposalId,
        },
      ),
      trustedContext: setup.logistics,
      environment: setup.env,
    });
    if (!declined.isAccepted) {
      throw new Error("The authored decline was rejected");
    }

    expect(declined.pendingProposal.status).toBe("DECLINED");
    expect(declined.state.domain).toEqual(
      setup.created.state.domain,
    );
    expect(declined.event.decisionType).toBe(
      "TRANSACTION_PROPOSAL_DECLINED",
    );

    const endorsed = await endorsePendingProposal({
      runtime: declined.state,
      command: workflowCommand<EndorseTransactionProposalCommand>(
        "CMD_ENDORSE",
        setup.logistics,
        setup.command.metadata.submittedAt,
        {
          commandType: "ENDORSE_TRANSACTION_PROPOSAL",
          proposalId,
        },
      ),
      trustedContext: setup.logistics,
      cryptographicRuntime: coffeeCryptographicRuntime,
      provider: setup.provider,
      environment: setup.env,
    });
    if (!endorsed.isAccepted) {
      throw new Error("The genuine endorsement was rejected");
    }

    expect(endorsed.pendingProposal.status).toBe(
      "POLICY_SATISFIED",
    );
    expect(endorsed.pendingProposal.declineCommandIds).toEqual([
      "CMD_DECLINE",
    ]);
    expect(
      endorsed.pendingProposal.endorsements.every(
        (record) =>
          record.verification.signatureValid &&
          record.verification.authorization.authorized,
      ),
    ).toBe(true);

    const committed = commitPendingProposal({
      runtime: endorsed.state,
      command: workflowCommand<CommitEndorsedTransactionCommand>(
        "CMD_COMMIT",
        setup.logistics,
        setup.command.metadata.submittedAt,
        {
          commandType: "COMMIT_ENDORSED_TRANSACTION",
          proposalId,
        },
      ),
      trustedContext: setup.logistics,
      ledger: setup.ledger,
      registries,
      environment: setup.env,
    });
    expect(committed.workflow.isAccepted).toBe(true);
    if (!committed.workflow.isAccepted) {
      throw new Error("The endorsed transaction was rejected");
    }
    expect(
      committed.workflow.pendingProposal.status,
    ).toBe("COMMITTED");
    expect(
      Object.values(
        committed.workflow.state.domain.transactionsById,
      ).filter(
        (transaction) =>
          transaction.transactionType ===
          TransactionType.TRANSFER_CUSTODY,
      ),
    ).toHaveLength(1);
  });

  it("rejects a cryptographically satisfied proposal when its state version becomes stale", async () => {
    const setup = await pendingCustodyProposal();
    const proposalId = setup.created.pendingProposal.proposalId;
    const endorsed = await endorsePendingProposal({
      runtime: setup.created.state,
      command: workflowCommand<EndorseTransactionProposalCommand>(
        "CMD_ENDORSE",
        setup.logistics,
        setup.command.metadata.submittedAt,
        {
          commandType: "ENDORSE_TRANSACTION_PROPOSAL",
          proposalId,
        },
      ),
      trustedContext: setup.logistics,
      cryptographicRuntime: coffeeCryptographicRuntime,
      provider: setup.provider,
      environment: setup.env,
    });
    if (!endorsed.isAccepted) {
      throw new Error("The genuine endorsement was rejected");
    }

    const competingCommand: DomainSimulationCommand = {
      ...setup.command,
      metadata: {
        ...setup.command.metadata,
        commandId: "CMD_COMPETING_TRANSFER",
      },
    };
    const competing = handleSimulationCommand({
      runtime: endorsed.state,
      command: competingCommand,
      trustedContext: setup.producer,
      ledger: setup.ledger,
      registries,
      environment: setup.env,
    });
    if (!competing.isAccepted) {
      throw new Error(
        "The deterministic competing transaction was rejected",
      );
    }
    const transactionCountAfterCompetition =
      competing.state.domain.transactionOrder.length;

    const stale = commitPendingProposal({
      runtime: competing.state,
      command: workflowCommand<CommitEndorsedTransactionCommand>(
        "CMD_STALE_COMMIT",
        setup.logistics,
        setup.command.metadata.submittedAt,
        {
          commandType: "COMMIT_ENDORSED_TRANSACTION",
          proposalId,
        },
      ),
      trustedContext: setup.logistics,
      ledger: setup.ledger,
      registries,
      environment: setup.env,
    });

    expect(stale.workflow.isAccepted).toBe(false);
    expect(stale.transactionOutcome).toBeNull();
    expect(
      stale.workflow.state.domain.transactionOrder,
    ).toHaveLength(transactionCountAfterCompetition);
    expect(
      stale.workflow.state.pendingProposalsById[proposalId]
        ?.status,
    ).toBe("STALE");
    if (stale.workflow.isAccepted) {
      throw new Error("The stale commitment was accepted");
    }
    expect(
      stale.workflow.auditEvent.validationFailures.map(
        (failure) => failure.code,
      ),
    ).toContain("RULE_ENDORSED_STATE_VERSION_STALE");
  });

  it("rejects commit metadata that does not match the active trusted context", async () => {
    const setup = await pendingCustodyProposal();
    const proposalId = setup.created.pendingProposal.proposalId;
    const forged = commitPendingProposal({
      runtime: setup.created.state,
      command: workflowCommand<CommitEndorsedTransactionCommand>(
        "CMD_FORGED_COMMIT",
        setup.producer,
        setup.command.metadata.submittedAt,
        {
          commandType: "COMMIT_ENDORSED_TRANSACTION",
          proposalId,
        },
      ),
      trustedContext: setup.logistics,
      ledger: setup.ledger,
      registries,
      environment: setup.env,
    });

    expect(forged.workflow.isAccepted).toBe(false);
    if (forged.workflow.isAccepted) {
      throw new Error("The forged commit context was accepted");
    }
    expect(
      forged.workflow.auditEvent.validationFailures[0]?.code,
    ).toBe("TRUSTED_CONTEXT_MISMATCH");
    expect(forged.workflow.state.domain).toEqual(
      setup.created.state.domain,
    );
  });
});
