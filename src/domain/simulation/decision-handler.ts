import type { SimulationEnvironment } from "./environment";
import type {
  AttemptValidationFailure,
  SimulationCommand,
  SimulationCommandOutcome,
  SimulationDecisionEvent,
  SimulationRuntimeState,
  TrustedExecutionContext,
} from "./types";

function contextMatches(
  command: SimulationCommand,
  trusted: TrustedExecutionContext,
): boolean {
  return (
    command.metadata.actorId === trusted.actorId &&
    command.metadata.organizationId === trusted.organizationId &&
    command.metadata.roleId === trusted.roleId
  );
}

/**
 * Record a simulation-only decision without pretending it was a ledger
 * transaction. Accepted decisions enter the simulation event stream; rejected
 * business attempts enter only the audit stream.
 */
export function handleSimulationDecision(options: {
  readonly runtime: SimulationRuntimeState;
  readonly command: SimulationCommand;
  readonly trustedContext: TrustedExecutionContext;
  readonly isAccepted: boolean;
  readonly decisionType: string;
  readonly decisionPayload: unknown;
  readonly rejectionFailures?: readonly AttemptValidationFailure[];
  readonly environment: SimulationEnvironment;
}): SimulationCommandOutcome {
  const duplicate =
    options.runtime.outcomesByCommandId[options.command.metadata.commandId];
  if (duplicate !== undefined) return { ...duplicate, state: options.runtime };

  const trusted = contextMatches(options.command, options.trustedContext);
  const accepted = options.isAccepted && trusted;
  if (!accepted) {
    const validationFailures: readonly AttemptValidationFailure[] = trusted
      ? options.rejectionFailures ?? [
          {
            code: "DOMAIN_RULE_FAILED",
            messageKey: "errors.domainValidation",
          },
        ]
      : [
          {
            code: "TRUSTED_CONTEXT_MISMATCH",
            messageKey: "errors.trustedContextMismatch",
            details: { trustedContextId: options.trustedContext.contextId },
          },
        ];
    const auditEvent = {
      kind: "COMMAND_REJECTED" as const,
      auditEventId: options.environment.ids.nextId("AUD"),
      commandId: options.command.metadata.commandId,
      sessionId: options.command.metadata.sessionId,
      actorId: options.command.metadata.actorId,
      organizationId: options.command.metadata.organizationId,
      roleId: options.command.metadata.roleId,
      occurredAt: options.environment.clock.now(),
      submittedCommand: options.command,
      validationFailures,
    };
    const processed = {
      isAccepted: false as const,
      commandId: options.command.metadata.commandId,
      auditEvent,
      transaction: null,
      validation: null,
    };
    const state: SimulationRuntimeState = {
      ...options.runtime,
      attemptAuditEvents: [
        ...options.runtime.attemptAuditEvents,
        auditEvent,
      ],
      outcomesByCommandId: {
        ...options.runtime.outcomesByCommandId,
        [options.command.metadata.commandId]: processed,
      },
    };
    return { ...processed, state };
  }

  const event: SimulationDecisionEvent = {
    kind: "SIMULATION_DECISION",
    eventId: options.environment.ids.nextId("EVT"),
    commandId: options.command.metadata.commandId,
    sessionId: options.command.metadata.sessionId,
    actorId: options.command.metadata.actorId,
    organizationId: options.command.metadata.organizationId,
    roleId: options.command.metadata.roleId,
    occurredAt: options.environment.clock.now(),
    decisionType: options.decisionType,
    payload: options.decisionPayload,
  };
  const processed = {
    isAccepted: true as const,
    commandId: options.command.metadata.commandId,
    transaction: null,
    events: [event],
    validation: null,
  };
  const state: SimulationRuntimeState = {
    ...options.runtime,
    acceptedEvents: [...options.runtime.acceptedEvents, event],
    outcomesByCommandId: {
      ...options.runtime.outcomesByCommandId,
      [options.command.metadata.commandId]: processed,
    },
  };
  return { ...processed, state };
}
