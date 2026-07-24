import type { SupplyChainCommand } from "../../domain/commands/commands";
import {
  createSimulationRuntimeState,
  expectedStateVersionsFor,
  handleSimulationCommand,
} from "../../domain/simulation/command-handler";
import {
  FixedClock,
  SeededRandomSource,
  SequenceIdGenerator,
} from "../../domain/simulation/environment";
import type {
  DomainSimulationCommand,
  SimulationRuntimeState,
  TrustedExecutionContext,
} from "../../domain/simulation/types";
import { SimulatedLedger } from "../../domain/ledger/ledger-engine";
import { applyScenarioSeed } from "../../domain/scenario/seed-replay";
import {
  runtimeCommand,
  trustedContext,
} from "../../domain/scenario/runtime";
import type { ValidationRegistries } from "../../domain/rules/types";
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

export interface ExecutedStage3Action {
  readonly simulation: SimulationRuntimeState;
  readonly summary: HostedTransactionSummary;
}

export class CoffeeStage3HostedAdapter {
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
        scenario.legacyCompatibility?.adapterId ===
          "tracechain-coffee-v2" &&
        scenario.legacyCompatibility.stageId ===
          "STG_03_ANCHOR_CERTIFICATE",
    );
    if (hostedScenario === undefined) {
      throw new Error(
        "Published pack has no registered coffee Stage 3 compatibility scenario.",
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
        "Coffee Stage 3 compatibility state could not create its source batch.",
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
  }): Promise<ExecutedStage3Action> {
    const authored = runtimeCommand<SupplyChainCommand>(
      coffeeScenario,
      options.actionId,
    );
    const payload = trustedPayload(authored, options.trustedContext);
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
          options.simulation.domain,
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
      runtime: options.simulation,
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
      simulation: outcome.state,
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
}
