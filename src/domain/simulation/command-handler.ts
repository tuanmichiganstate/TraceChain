import { TransactionType } from "../types/enums";
import type { SupplyChainCommand } from "../commands/commands";
import { subjectAssetId } from "../commands/command-targets";
import { commandToEvent } from "../ledger/command-to-event";
import type { DomainState } from "../ledger/domain-state";
import type { SimulatedLedger } from "../ledger/ledger-engine";
import type { ValidationRegistries } from "../rules/types";
import type { SimulationEnvironment } from "./environment";
import type {
  AcceptedDomainEvent,
  AssetVersionTransition,
  AttemptAuditEvent,
  AttemptValidationFailure,
  DomainSimulationCommand,
  SimulationCommandOutcome,
  SimulationRuntimeState,
  TrustedExecutionContext,
} from "./types";
import type { SignatureTrustEvidence } from "../../crypto/signatures/types";

export function createSimulationRuntimeState(domain: DomainState): SimulationRuntimeState {
  return {
    domain,
    acceptedEvents: [],
    attemptAuditEvents: [],
    outcomesByCommandId: {},
  };
}

export function affectedExistingAssetIds(
  command: SupplyChainCommand,
  state: DomainState,
): string[] {
  if (command.commandType === TransactionType.RECALL_BATCH) {
    // Recall mutates the complete calculated scope, not merely the learner's
    // selected answer.
    const root = state.assetsById[command.sourceAssetId];
    if (root === undefined) return [];
    const found = new Set<string>([root.assetId]);
    const queue = [root.assetId];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const edge of state.provenanceEdges) {
        if (edge.sourceAssetId !== current || found.has(edge.targetAssetId)) continue;
        found.add(edge.targetAssetId);
        queue.push(edge.targetAssetId);
      }
    }
    return [...found].sort();
  }

  const subject = subjectAssetId(command);
  return subject !== null && state.assetsById[subject] !== undefined ? [subject] : [];
}

export function expectedStateVersionsFor(
  command: SupplyChainCommand,
  state: DomainState,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    affectedExistingAssetIds(command, state).map((assetId) => [
      assetId,
      state.assetsById[assetId]?.stateVersion as number,
    ]),
  );
}

function contextFailures(
  command: DomainSimulationCommand,
  trusted: TrustedExecutionContext,
): AttemptValidationFailure[] {
  const metadata = command.metadata;
  return metadata.actorId === trusted.actorId &&
    metadata.organizationId === trusted.organizationId &&
    metadata.roleId === trusted.roleId
    ? []
    : [
        {
          code: "TRUSTED_CONTEXT_MISMATCH",
          messageKey: "errors.trustedContextMismatch",
          details: {
            trustedContextId: trusted.contextId,
          },
        },
      ];
}

function versionFailures(
  command: DomainSimulationCommand,
  state: DomainState,
): AttemptValidationFailure[] {
  const requiredIds = affectedExistingAssetIds(command.payload, state);
  const expected = command.metadata.expectedStateVersions;
  const failures: AttemptValidationFailure[] = [];

  for (const assetId of requiredIds) {
    const actual = state.assetsById[assetId]?.stateVersion;
    const supplied = expected[assetId];
    if (supplied === undefined) {
      failures.push({
        code: "MISSING_STATE_VERSION",
        messageKey: "errors.missingStateVersion",
        details: { assetId },
      });
    } else if (supplied !== actual) {
      failures.push({
        code: "STALE_STATE_VERSION",
        messageKey: "errors.staleStateVersion",
        details: { assetId, expectedVersion: supplied, actualVersion: actual ?? -1 },
      });
    }
  }

  for (const assetId of Object.keys(expected)) {
    if (!requiredIds.includes(assetId)) {
      failures.push({
        code: "UNEXPECTED_STATE_VERSION",
        messageKey: "errors.unexpectedStateVersion",
        details: { assetId },
      });
    }
  }

  return failures;
}

function versionTransitions(
  before: DomainState,
  after: DomainState,
): AssetVersionTransition[] {
  const ids = new Set([...Object.keys(before.assetsById), ...Object.keys(after.assetsById)]);
  return [...ids]
    .flatMap((assetId): AssetVersionTransition[] => {
      const previousVersion = before.assetsById[assetId]?.stateVersion ?? null;
      const newVersion = after.assetsById[assetId]?.stateVersion;
      if (newVersion === undefined || newVersion === previousVersion) return [];
      return [{ assetId, previousVersion, newVersion }];
    })
    .sort((left, right) => left.assetId.localeCompare(right.assetId, "en"));
}

function rejectedOutcome(
  runtime: SimulationRuntimeState,
  command: DomainSimulationCommand,
  failures: readonly AttemptValidationFailure[],
  environment: SimulationEnvironment,
  validation: SimulationCommandOutcome["validation"] = null,
  transaction: Extract<SimulationCommandOutcome, { readonly isAccepted: false }>["transaction"] =
    null,
  signatureEvidence?: SignatureTrustEvidence,
): SimulationCommandOutcome {
  const auditEvent: AttemptAuditEvent = {
    kind: "COMMAND_REJECTED",
    auditEventId: environment.ids.nextId("AUD"),
    commandId: command.metadata.commandId,
    sessionId: command.metadata.sessionId,
    actorId: command.metadata.actorId,
    organizationId: command.metadata.organizationId,
    roleId: command.metadata.roleId,
    occurredAt: environment.clock.now(),
    submittedCommand: command,
    validationFailures: failures,
    ...(signatureEvidence === undefined ? {} : { signatureEvidence }),
  };
  const processed = {
    isAccepted: false,
    commandId: command.metadata.commandId,
    auditEvent,
    transaction,
    validation,
    ...(signatureEvidence === undefined ? {} : { signatureEvidence }),
  } as const;
  const nextState: SimulationRuntimeState = {
    ...runtime,
    attemptAuditEvents: [...runtime.attemptAuditEvents, auditEvent],
    outcomesByCommandId: {
      ...runtime.outcomesByCommandId,
      [command.metadata.commandId]: processed,
    },
  };
  return { ...processed, state: nextState };
}

export function handleSimulationCommand(options: {
  readonly runtime: SimulationRuntimeState;
  readonly command: DomainSimulationCommand;
  readonly trustedContext: TrustedExecutionContext;
  readonly ledger: SimulatedLedger;
  readonly registries: ValidationRegistries;
  readonly environment: SimulationEnvironment;
  readonly signatureEvidence?: SignatureTrustEvidence;
  readonly signatureFailures?: readonly AttemptValidationFailure[];
}): SimulationCommandOutcome {
  const {
    runtime,
    command,
    trustedContext,
    ledger,
    registries,
    environment,
    signatureEvidence,
  } = options;
  const duplicate = runtime.outcomesByCommandId[command.metadata.commandId];
  if (duplicate !== undefined) return { ...duplicate, state: runtime };

  const boundaryFailures = [
    ...contextFailures(command, trustedContext),
    ...versionFailures(command, runtime.domain),
    ...(options.signatureFailures ?? []),
  ];
  if (boundaryFailures.length > 0) {
    return rejectedOutcome(
      runtime,
      command,
      boundaryFailures,
      environment,
      null,
      null,
      signatureEvidence,
    );
  }

  const transaction = ledger.submitCommand(
    runtime.domain,
    command.payload,
    {
      actorId: trustedContext.actorId,
      organizationId: trustedContext.organizationId,
    },
    registries,
    signatureEvidence,
  );

  if (!transaction.isAccepted) {
    return rejectedOutcome(
      runtime,
      command,
      transaction.validation.failures.map((failure) => ({
        code: "DOMAIN_RULE_FAILED" as const,
        messageKey: failure.messageKey,
        details: {
          ruleId: failure.ruleId,
        },
      })),
      environment,
      transaction.validation,
      transaction.transaction,
      signatureEvidence,
    );
  }

  const event = commandToEvent(
    command.payload,
    transaction.transaction.transactionId,
    runtime.domain,
  );
  const acceptedEvent: AcceptedDomainEvent = {
    kind: "LEDGER_MUTATION",
    eventId: environment.ids.nextId("EVT"),
    commandId: command.metadata.commandId,
    sessionId: command.metadata.sessionId,
    actorId: command.metadata.actorId,
    organizationId: command.metadata.organizationId,
    roleId: command.metadata.roleId,
    occurredAt: environment.clock.now(),
    event,
    assetVersionTransitions: versionTransitions(runtime.domain, transaction.state),
  };

  const nextState: SimulationRuntimeState = {
    domain: transaction.state,
    acceptedEvents: [...runtime.acceptedEvents, acceptedEvent],
    attemptAuditEvents: runtime.attemptAuditEvents,
    outcomesByCommandId: runtime.outcomesByCommandId,
  };
  const processed = {
    isAccepted: true,
    commandId: command.metadata.commandId,
    transaction: transaction.transaction,
    events: [acceptedEvent],
    validation: transaction.validation,
    ...(signatureEvidence === undefined ? {} : { signatureEvidence }),
  } as const;
  const finalState: SimulationRuntimeState = {
    ...nextState,
    outcomesByCommandId: {
      ...runtime.outcomesByCommandId,
      [command.metadata.commandId]: processed,
    },
  };
  return { ...processed, state: finalState };
}
