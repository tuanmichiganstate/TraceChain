import type {
  AnchorDocumentCommand,
  RecallBatchCommand,
  RecordCorrectionCommand,
  SupplyChainCommand,
} from "../../domain/commands/commands";
import {
  createSimulationRuntimeState,
  expectedStateVersionsFor,
  handleSimulationCommand,
} from "../../domain/simulation/command-handler";
import {
  commitPendingProposal,
  createEndorsedProposal,
  endorsePendingProposal,
} from "../../domain/simulation/endorsement-workflow";
import {
  FixedClock,
  SeededRandomSource,
  SequenceIdGenerator,
} from "../../domain/simulation/environment";
import type {
  DomainSimulationCommand,
  EndorsementWorkflowOutcome,
  SimulationRuntimeState,
  TrustedExecutionContext,
} from "../../domain/simulation/types";
import { SimulatedLedger } from "../../domain/ledger/ledger-engine";
import {
  chainFingerprint,
  demonstrateTamper,
} from "../../domain/ledger/integrity";
import { applyScenarioSeed } from "../../domain/scenario/seed-replay";
import { applyEligibleScriptedTransactions } from "../../domain/scenario/scripted-transactions";
import {
  runtimeCommand,
  trustedContext,
} from "../../domain/scenario/runtime";
import type { ValidationRegistries } from "../../domain/rules/types";
import {
  TransactionStatus,
  TransactionType,
} from "../../domain/types/enums";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import { NobleEd25519Provider } from "../../crypto/signatures/noble-ed25519-provider";
import {
  signAndVerifyCommand,
  signatureAttemptFailures,
} from "../../crypto/signatures/signing-service";
import { coffeeCryptographicRuntime } from "../../scenarios/coffee-traceability/cryptographic-runtime";
import {
  createBatchCommand,
  PRODUCER_CONTEXT,
} from "../../scenarios/coffee-traceability/commands";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import { verifyScenarioPackContentHash } from "../scenario-packs/publication";
import type {
  CreateHostedStage3RunRequest,
  HostedCorrectionProposalSummary,
  HostedCustodyProposalSummary,
  HostedEndorsementSummary,
  HostedTamperSummary,
  HostedTransactionSummary,
  Stage3CaseVariant,
} from "./stage3-types";

function contextIdForCase(caseVariant: Stage3CaseVariant): string {
  return caseVariant === "authorized-certifier"
    ? "CTX_CERTIFIER"
    : "CTX_LOGISTICS";
}

function trustedPayload(
  command: SupplyChainCommand,
  context: TrustedExecutionContext,
): SupplyChainCommand {
  return {
    ...command,
    initiatedByActorId: context.actorId,
  };
}

function failureRuleIds(
  outcome: ReturnType<typeof handleSimulationCommand>,
): readonly string[] {
  if (outcome.isAccepted) {
    return outcome.validation?.failures.map((failure) => failure.ruleId) ?? [];
  }
  return outcome.auditEvent.validationFailures.map((failure) => {
    const detailedRuleId = failure.details?.ruleId;
    return typeof detailedRuleId === "string"
      ? detailedRuleId
      : failure.code;
  });
}

function workflowFailureRuleIds(
  outcome: EndorsementWorkflowOutcome,
): readonly string[] {
  if (outcome.isAccepted) return [];
  return outcome.auditEvent.validationFailures.map((failure) => {
    const detailedRuleId = failure.details?.ruleId;
    return typeof detailedRuleId === "string"
      ? detailedRuleId
      : failure.code;
  });
}

export interface ExecutedStage3Action {
  readonly simulation: SimulationRuntimeState;
  readonly summary: HostedTransactionSummary;
}

export interface ExecutedCustodyProposal {
  readonly simulation: SimulationRuntimeState;
  readonly summary: HostedCustodyProposalSummary;
}

export interface ExecutedCustodyEndorsement {
  readonly simulation: SimulationRuntimeState;
  readonly summary: HostedEndorsementSummary;
}

export interface ExecutedCorrectionProposal {
  readonly simulation: SimulationRuntimeState;
  readonly summary: HostedCorrectionProposalSummary;
}

export class CoffeeHostedDomainRuntime {
  private readonly ledger = new SimulatedLedger(
    sha256Hex,
    coffeeScenario.ledgerConfiguration,
  );
  private readonly provider = new NobleEd25519Provider();
  private readonly registries: ValidationRegistries = {
    organizationsById: Object.fromEntries(
      coffeeScenario.organizations.map((organization) => [
        organization.organizationId,
        organization,
      ]),
    ),
    actorsById: Object.fromEntries(
      coffeeScenario.actors.map((actor) => [actor.actorId, actor]),
    ),
  };
  private readonly hostedScenarioId: string;
  private readonly hostedScenarioVersion: string;
  private readonly configurationHash: string;

  constructor(pack: ScenarioPackV1) {
    if (
      pack.status !== "published" ||
      pack.publication === undefined ||
      !verifyScenarioPackContentHash(pack)
    ) {
      throw new Error(
        "Hosted runs require an immutable published scenario pack.",
      );
    }
    const hostedScenario = pack.scenarios.find(
      (scenario) =>
        scenario.hostedRuntime?.runtimeId ===
          "tracechain-coffee-v2" &&
        scenario.hostedRuntime.entryStageId ===
          "STG_03_ANCHOR_CERTIFICATE",
    );
    if (hostedScenario === undefined) {
      throw new Error(
        "Published pack has no registered native coffee runtime.",
      );
    }
    this.hostedScenarioId = hostedScenario.scenarioId;
    this.hostedScenarioVersion = hostedScenario.version;
    this.configurationHash = pack.publication.contentHash;
  }

  createInitialSimulation(): SimulationRuntimeState {
    const seeded = applyScenarioSeed(
      coffeeScenario,
      sha256Hex,
      this.registries,
    );
    if (seeded.rejectedSeedIds.length > 0) {
      throw new Error(
        `Coffee scenario contains rejected seed transactions: ${seeded.rejectedSeedIds.join(", ")}.`,
      );
    }
    const created = this.ledger.submitCommand(
      seeded.state,
      createBatchCommand(),
      PRODUCER_CONTEXT,
      this.registries,
    );
    if (!created.isAccepted) {
      throw new Error(
        "The native coffee runtime could not create its source batch.",
      );
    }
    return createSimulationRuntimeState(created.state);
  }

  trustedContextFor(request: CreateHostedStage3RunRequest) {
    return trustedContext(
      coffeeScenario,
      contextIdForCase(request.caseVariant),
    );
  }

  trustedContextForId(contextId: string): TrustedExecutionContext {
    return trustedContext(coffeeScenario, contextId);
  }

  actionIdsFor(caseVariant: Stage3CaseVariant): readonly string[] {
    return caseVariant === "authorized-certifier"
      ? ["ANCHOR_CERTIFICATE", "ISSUE_CERTIFICATE"]
      : ["SUSPICIOUS_CERTIFICATE"];
  }

  async executeAction(options: {
    readonly runId: string;
    readonly actionId: string;
    readonly coreCommandId: string;
    readonly eventSequence: number;
    readonly simulation: SimulationRuntimeState;
    readonly trustedContext: TrustedExecutionContext;
    readonly scenarioSeed: string;
    readonly selectedAssetIds?: readonly string[];
  }): Promise<ExecutedStage3Action> {
    if (
      options.actionId === "RECALL_BATCH" &&
      options.selectedAssetIds === undefined
    ) {
      throw new Error("Recall execution requires an authored scope.");
    }
    const authored =
      options.actionId === "RECALL_BATCH"
        ? runtimeCommand<RecallBatchCommand>(
            coffeeScenario,
            options.actionId,
            { selectedAssetIds: options.selectedAssetIds ?? [] },
          )
        : runtimeCommand<SupplyChainCommand>(
            coffeeScenario,
            options.actionId,
          );
    const payload = trustedPayload(authored, options.trustedContext);
    const scriptedDomain = applyEligibleScriptedTransactions(
      options.simulation.domain,
      coffeeScenario.scriptedTransactions,
      this.ledger,
      this.registries,
    ).state;
    const simulation: SimulationRuntimeState = {
      ...options.simulation,
      domain: scriptedDomain,
    };
    const command: DomainSimulationCommand = {
      metadata: {
        commandId: options.coreCommandId,
        sessionId: options.runId,
        actorId: options.trustedContext.actorId,
        organizationId: options.trustedContext.organizationId,
        roleId: options.trustedContext.roleId,
        submittedAt: payload.scenarioTimestamp,
        expectedStateVersions: expectedStateVersionsFor(
          payload,
          scriptedDomain,
        ),
      },
      payload,
    };
    const signed = await signAndVerifyCommand({
      command,
      trustedContext: options.trustedContext,
      configurationHash: this.configurationHash,
      scenarioId: this.hostedScenarioId,
      scenarioVersion: this.hostedScenarioVersion,
      runtime: coffeeCryptographicRuntime,
      provider: this.provider,
    });
    const outcome = handleSimulationCommand({
      runtime: simulation,
      command,
      trustedContext: options.trustedContext,
      ledger: this.ledger,
      registries: this.registries,
      environment: {
        clock: new FixedClock(payload.scenarioTimestamp),
        random: new SeededRandomSource(
          `${options.scenarioSeed}:${options.eventSequence}:${options.actionId}`,
        ),
        ids: new SequenceIdGenerator(options.eventSequence * 100),
      },
      signatureEvidence: signed.evidence,
      signatureFailures: signatureAttemptFailures(signed.failureRuleIds),
    });
    return {
      simulation: this.sealAcceptedSimulation(
        outcome.state,
        outcome.isAccepted,
        payload.scenarioTimestamp,
      ),
      summary: {
        actionId: options.actionId,
        coreCommandId: options.coreCommandId,
        isAccepted: outcome.isAccepted,
        transactionId:
          outcome.isAccepted && outcome.transaction !== null
            ? outcome.transaction.transactionId
            : null,
        signatureValid: signed.evidence.signatureValid,
        recognizedIdentity:
          signed.evidence.authorization.recognizedIdentity,
        authorized: signed.evidence.authorization.authorized,
        validationRuleIds: failureRuleIds(outcome),
      },
    };
  }

  async createCustodyProposal(options: {
    readonly runId: string;
    readonly coreCommandId: string;
    readonly eventSequence: number;
    readonly simulation: SimulationRuntimeState;
    readonly scenarioSeed: string;
    readonly alsoTransfersOwnership: boolean;
  }): Promise<ExecutedCustodyProposal> {
    const trusted = this.trustedContextForId("CTX_PRODUCER");
    const authored = runtimeCommand<SupplyChainCommand>(
      coffeeScenario,
      "TRANSFER_CUSTODY",
      { alsoTransfersOwnership: options.alsoTransfersOwnership },
    );
    const payload = trustedPayload(authored, trusted);
    const command: DomainSimulationCommand = {
      metadata: {
        commandId: options.coreCommandId,
        sessionId: options.runId,
        actorId: trusted.actorId,
        organizationId: trusted.organizationId,
        roleId: trusted.roleId,
        submittedAt: payload.scenarioTimestamp,
        expectedStateVersions: expectedStateVersionsFor(
          payload,
          options.simulation.domain,
        ),
      },
      payload,
    };
    const signed = await signAndVerifyCommand({
      command,
      trustedContext: trusted,
      configurationHash: this.configurationHash,
      scenarioId: this.hostedScenarioId,
      scenarioVersion: this.hostedScenarioVersion,
      runtime: coffeeCryptographicRuntime,
      provider: this.provider,
    });
    const workflow = createEndorsedProposal({
      runtime: options.simulation,
      actionId: "TRANSFER_CUSTODY",
      command,
      trustedContext: trusted,
      signatureEvidence: signed.evidence,
      signatureFailures: signatureAttemptFailures(
        signed.failureRuleIds,
      ),
      policies:
        coffeeCryptographicRuntime.endorsementPolicies.policies,
      registries: this.registries,
      environment: {
        clock: new FixedClock(payload.scenarioTimestamp),
        random: new SeededRandomSource(
          `${options.scenarioSeed}:${options.eventSequence}:TRANSFER_CUSTODY`,
        ),
        ids: new SequenceIdGenerator(options.eventSequence * 100),
      },
    });
    return {
      simulation: workflow.state,
      summary: {
        actionId: "TRANSFER_CUSTODY",
        coreCommandId: options.coreCommandId,
        isAccepted: workflow.isAccepted,
        proposalId: workflow.pendingProposal?.proposalId ?? null,
        proposalDigest:
          workflow.pendingProposal?.proposalEvidence.proposalDigest ??
          null,
        endorsementPolicyId:
          workflow.pendingProposal?.policy.endorsementPolicyId ?? null,
        policySatisfied:
          workflow.pendingProposal?.evaluation.satisfied ?? false,
        validationRuleIds: workflowFailureRuleIds(workflow),
      },
    };
  }

  async endorseCustodyProposal(options: {
    readonly runId: string;
    readonly proposalId: string;
    readonly coreCommandId: string;
    readonly eventSequence: number;
    readonly simulation: SimulationRuntimeState;
    readonly scenarioSeed: string;
  }): Promise<ExecutedCustodyEndorsement> {
    const trusted = this.trustedContextForId("CTX_LOGISTICS");
    const pending =
      options.simulation.pendingProposalsById[options.proposalId];
    if (pending === undefined) {
      throw new Error(`Unknown custody proposal ${options.proposalId}.`);
    }
    const command = {
      metadata: {
        commandId: options.coreCommandId,
        sessionId: options.runId,
        actorId: trusted.actorId,
        organizationId: trusted.organizationId,
        roleId: trusted.roleId,
        submittedAt: pending.command.metadata.submittedAt,
        expectedStateVersions: {},
      },
      payload: {
        commandType: "ENDORSE_TRANSACTION_PROPOSAL" as const,
        proposalId: options.proposalId,
      },
    };
    const workflow = await endorsePendingProposal({
      runtime: options.simulation,
      command,
      trustedContext: trusted,
      cryptographicRuntime: coffeeCryptographicRuntime,
      provider: this.provider,
      environment: {
        clock: new FixedClock(pending.command.metadata.submittedAt),
        random: new SeededRandomSource(
          `${options.scenarioSeed}:${options.eventSequence}:ENDORSE_CUSTODY`,
        ),
        ids: new SequenceIdGenerator(options.eventSequence * 100),
      },
    });
    return {
      simulation: workflow.state,
      summary: {
        coreCommandId: options.coreCommandId,
        isAccepted: workflow.isAccepted,
        proposalId: options.proposalId,
        organizationId: trusted.organizationId,
        policySatisfied:
          workflow.pendingProposal?.evaluation.satisfied ?? false,
        validationRuleIds: workflowFailureRuleIds(workflow),
      },
    };
  }

  commitCustodyProposal(options: {
    readonly runId: string;
    readonly proposalId: string;
    readonly coreCommandId: string;
    readonly eventSequence: number;
    readonly simulation: SimulationRuntimeState;
    readonly scenarioSeed: string;
  }): ExecutedStage3Action {
    const trusted = this.trustedContextForId("CTX_LOGISTICS");
    const pending =
      options.simulation.pendingProposalsById[options.proposalId];
    if (pending === undefined) {
      throw new Error(`Unknown custody proposal ${options.proposalId}.`);
    }
    const command = {
      metadata: {
        commandId: options.coreCommandId,
        sessionId: options.runId,
        actorId: trusted.actorId,
        organizationId: trusted.organizationId,
        roleId: trusted.roleId,
        submittedAt: pending.command.metadata.submittedAt,
        expectedStateVersions: {},
      },
      payload: {
        commandType: "COMMIT_ENDORSED_TRANSACTION" as const,
        proposalId: options.proposalId,
      },
    };
    const result = commitPendingProposal({
      runtime: options.simulation,
      command,
      trustedContext: trusted,
      ledger: this.ledger,
      registries: this.registries,
      environment: {
        clock: new FixedClock(pending.command.metadata.submittedAt),
        random: new SeededRandomSource(
          `${options.scenarioSeed}:${options.eventSequence}:COMMIT_CUSTODY`,
        ),
        ids: new SequenceIdGenerator(options.eventSequence * 100),
      },
    });
    const transactionOutcome = result.transactionOutcome;
    const isAccepted = transactionOutcome?.isAccepted === true;
    return {
      simulation: this.sealAcceptedSimulation(
        result.workflow.state,
        isAccepted,
        pending.command.metadata.submittedAt,
      ),
      summary: {
        actionId: "TRANSFER_CUSTODY",
        coreCommandId: options.coreCommandId,
        isAccepted,
        transactionId:
          transactionOutcome?.isAccepted === true &&
          transactionOutcome.transaction !== null
            ? transactionOutcome.transaction.transactionId
            : null,
        signatureValid:
          pending.proposalEvidence.signatureValid,
        recognizedIdentity:
          pending.proposalEvidence.authorization.recognizedIdentity,
        authorized:
          pending.proposalEvidence.authorization.authorized,
        validationRuleIds:
          transactionOutcome === null
            ? workflowFailureRuleIds(result.workflow)
            : failureRuleIds(transactionOutcome),
      },
    };
  }

  async createCorrectionProposal(options: {
    readonly runId: string;
    readonly coreCommandId: string;
    readonly eventSequence: number;
    readonly simulation: SimulationRuntimeState;
    readonly scenarioSeed: string;
    readonly reason: string;
  }): Promise<ExecutedCorrectionProposal> {
    const trusted = this.trustedContextForId("CTX_PROCESSOR");
    const scriptedDomain = applyEligibleScriptedTransactions(
      options.simulation.domain,
      coffeeScenario.scriptedTransactions,
      this.ledger,
      this.registries,
    ).state;
    const simulation: SimulationRuntimeState = {
      ...options.simulation,
      domain: scriptedDomain,
    };
    const manifestAnchorId =
      coffeeScenario.runtime.documentRoles.shippingManifestAnchorId;
    const manifestTransaction = Object.values(
      scriptedDomain.transactionsById,
    ).find((transaction) => {
      if (
        transaction.transactionType !==
          TransactionType.ANCHOR_DOCUMENT ||
        transaction.transactionStatus !==
          TransactionStatus.COMMITTED
      ) {
        return false;
      }
      return (
        (
          transaction.commandPayload as AnchorDocumentCommand
        ).documentAnchorId === manifestAnchorId
      );
    });
    if (manifestTransaction === undefined) {
      throw new Error(
        "The shipping manifest must exist before proposing its correction.",
      );
    }
    const authored = runtimeCommand<RecordCorrectionCommand>(
      coffeeScenario,
      "RECORD_CORRECTION",
      {
        correctionOfTransactionId:
          manifestTransaction.transactionId,
        reason: options.reason,
      },
    );
    const payload = trustedPayload(authored, trusted);
    const command: DomainSimulationCommand = {
      metadata: {
        commandId: options.coreCommandId,
        sessionId: options.runId,
        actorId: trusted.actorId,
        organizationId: trusted.organizationId,
        roleId: trusted.roleId,
        submittedAt: payload.scenarioTimestamp,
        expectedStateVersions: expectedStateVersionsFor(
          payload,
          scriptedDomain,
        ),
      },
      payload,
    };
    const signed = await signAndVerifyCommand({
      command,
      trustedContext: trusted,
      configurationHash: this.configurationHash,
      scenarioId: this.hostedScenarioId,
      scenarioVersion: this.hostedScenarioVersion,
      runtime: coffeeCryptographicRuntime,
      provider: this.provider,
    });
    const workflow = createEndorsedProposal({
      runtime: simulation,
      actionId: "RECORD_CORRECTION",
      command,
      trustedContext: trusted,
      signatureEvidence: signed.evidence,
      signatureFailures: signatureAttemptFailures(
        signed.failureRuleIds,
      ),
      policies:
        coffeeCryptographicRuntime.endorsementPolicies.policies,
      registries: this.registries,
      environment: {
        clock: new FixedClock(payload.scenarioTimestamp),
        random: new SeededRandomSource(
          `${options.scenarioSeed}:${options.eventSequence}:RECORD_CORRECTION`,
        ),
        ids: new SequenceIdGenerator(options.eventSequence * 100),
      },
    });
    return {
      simulation: workflow.state,
      summary: {
        actionId: "RECORD_CORRECTION",
        coreCommandId: options.coreCommandId,
        isAccepted: workflow.isAccepted,
        proposalId: workflow.pendingProposal?.proposalId ?? null,
        proposalDigest:
          workflow.pendingProposal?.proposalEvidence.proposalDigest ??
          null,
        endorsementPolicyId:
          workflow.pendingProposal?.policy.endorsementPolicyId ?? null,
        policySatisfied:
          workflow.pendingProposal?.evaluation.satisfied ?? false,
        validationRuleIds: workflowFailureRuleIds(workflow),
      },
    };
  }

  async endorseCorrectionProposal(options: {
    readonly runId: string;
    readonly proposalId: string;
    readonly coreCommandId: string;
    readonly eventSequence: number;
    readonly simulation: SimulationRuntimeState;
    readonly scenarioSeed: string;
  }): Promise<ExecutedCustodyEndorsement> {
    const trusted = this.trustedContextForId("CTX_PRODUCER");
    const pending =
      options.simulation.pendingProposalsById[options.proposalId];
    if (pending === undefined) {
      throw new Error(
        `Unknown correction proposal ${options.proposalId}.`,
      );
    }
    const command = {
      metadata: {
        commandId: options.coreCommandId,
        sessionId: options.runId,
        actorId: trusted.actorId,
        organizationId: trusted.organizationId,
        roleId: trusted.roleId,
        submittedAt: pending.command.metadata.submittedAt,
        expectedStateVersions: {},
      },
      payload: {
        commandType: "ENDORSE_TRANSACTION_PROPOSAL" as const,
        proposalId: options.proposalId,
      },
    };
    const workflow = await endorsePendingProposal({
      runtime: options.simulation,
      command,
      trustedContext: trusted,
      cryptographicRuntime: coffeeCryptographicRuntime,
      provider: this.provider,
      environment: {
        clock: new FixedClock(pending.command.metadata.submittedAt),
        random: new SeededRandomSource(
          `${options.scenarioSeed}:${options.eventSequence}:ENDORSE_CORRECTION`,
        ),
        ids: new SequenceIdGenerator(options.eventSequence * 100),
      },
    });
    return {
      simulation: workflow.state,
      summary: {
        coreCommandId: options.coreCommandId,
        isAccepted: workflow.isAccepted,
        proposalId: options.proposalId,
        organizationId: trusted.organizationId,
        policySatisfied:
          workflow.pendingProposal?.evaluation.satisfied ?? false,
        validationRuleIds: workflowFailureRuleIds(workflow),
      },
    };
  }

  commitCorrectionProposal(options: {
    readonly runId: string;
    readonly proposalId: string;
    readonly coreCommandId: string;
    readonly eventSequence: number;
    readonly simulation: SimulationRuntimeState;
    readonly scenarioSeed: string;
  }): ExecutedStage3Action {
    const trusted = this.trustedContextForId("CTX_PRODUCER");
    const pending =
      options.simulation.pendingProposalsById[options.proposalId];
    if (pending === undefined) {
      throw new Error(
        `Unknown correction proposal ${options.proposalId}.`,
      );
    }
    const command = {
      metadata: {
        commandId: options.coreCommandId,
        sessionId: options.runId,
        actorId: trusted.actorId,
        organizationId: trusted.organizationId,
        roleId: trusted.roleId,
        submittedAt: pending.command.metadata.submittedAt,
        expectedStateVersions: {},
      },
      payload: {
        commandType: "COMMIT_ENDORSED_TRANSACTION" as const,
        proposalId: options.proposalId,
      },
    };
    const result = commitPendingProposal({
      runtime: options.simulation,
      command,
      trustedContext: trusted,
      ledger: this.ledger,
      registries: this.registries,
      environment: {
        clock: new FixedClock(pending.command.metadata.submittedAt),
        random: new SeededRandomSource(
          `${options.scenarioSeed}:${options.eventSequence}:COMMIT_CORRECTION`,
        ),
        ids: new SequenceIdGenerator(options.eventSequence * 100),
      },
    });
    const transactionOutcome = result.transactionOutcome;
    const isAccepted = transactionOutcome?.isAccepted === true;
    return {
      simulation: this.sealAcceptedSimulation(
        result.workflow.state,
        isAccepted,
        pending.command.metadata.submittedAt,
      ),
      summary: {
        actionId: "RECORD_CORRECTION",
        coreCommandId: options.coreCommandId,
        isAccepted,
        transactionId:
          transactionOutcome?.isAccepted === true &&
          transactionOutcome.transaction !== null
            ? transactionOutcome.transaction.transactionId
            : null,
        signatureValid:
          pending.proposalEvidence.signatureValid,
        recognizedIdentity:
          pending.proposalEvidence.authorization.recognizedIdentity,
        authorized:
          pending.proposalEvidence.authorization.authorized,
        validationRuleIds:
          transactionOutcome === null
            ? workflowFailureRuleIds(result.workflow)
            : failureRuleIds(transactionOutcome),
      },
    };
  }

  transactionInventory(
    simulation: SimulationRuntimeState,
  ): readonly Readonly<Record<string, string | null>>[] {
    return simulation.domain.transactionOrder.map((transactionId) => {
      const transaction = simulation.domain.transactionsById[transactionId];
      if (transaction === undefined) {
        throw new Error(`Missing transaction ${transactionId}.`);
      }
      return {
        transactionId,
        transactionType: transaction.transactionType,
        transactionStatus: transaction.transactionStatus,
        blockId: transaction.blockId ?? null,
      };
    });
  }

  tamperDemonstration(
    simulation: SimulationRuntimeState,
  ): HostedTamperSummary {
    const target = simulation.domain.transactionOrder
      .map(
        (transactionId) =>
          simulation.domain.transactionsById[transactionId],
      )
      .find(
        (transaction) =>
          transaction?.transactionHash !== undefined &&
          typeof (
            transaction.commandPayload as {
              readonly quantity?: unknown;
            }
          ).quantity === "number",
      );
    if (target === undefined) {
      throw new Error(
        "The hosted ledger has no committed quantity transaction for the tamper demonstration.",
      );
    }
    const fingerprint = chainFingerprint(
      simulation.domain,
      sha256Hex,
    );
    const demonstration = demonstrateTamper(
      simulation.domain,
      sha256Hex,
      {
        transactionId: target.transactionId,
        quantity: 1,
      },
    );
    return {
      transactionId: demonstration.transactionId,
      originalQuantity: demonstration.originalQuantity,
      tamperedQuantity: demonstration.tamperedQuantity,
      beforeValid: demonstration.before.isValid,
      invalidTransactionIdsAfterEdit:
        demonstration.afterEdit.invalidTransactionIds,
      invalidBlockIdsAfterForgingTransaction:
        demonstration.afterForgingTransaction.invalidBlockIds,
      invalidBlockIdsAfterForgingBlock:
        demonstration.afterForgingBlock.invalidBlockIds,
      cascadingBlockIds: demonstration.cascadingBlockIds,
      realLedgerIntact:
        chainFingerprint(simulation.domain, sha256Hex) ===
        fingerprint,
    };
  }

  private sealAcceptedSimulation(
    simulation: SimulationRuntimeState,
    isAccepted: boolean,
    orderedAt: string,
  ): SimulationRuntimeState {
    if (
      !isAccepted ||
      simulation.domain.pendingTransactionIds.length === 0
    ) {
      return simulation;
    }
    return {
      ...simulation,
      domain: this.ledger.sealPendingTransactions(
        simulation.domain,
        orderedAt,
      ),
    };
  }
}
