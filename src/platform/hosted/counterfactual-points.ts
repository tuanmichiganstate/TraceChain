import type {
  CounterfactualConditionPointV1,
  CounterfactualDecisionPointV1,
} from "../contracts/counterfactual";
import { isJsonObject } from "../contracts/json";
import type { RunEventV1 } from "../contracts/run-events";
import type {
  DecisionNodeV1,
  ScenarioPackV1,
} from "../contracts/scenario-pack";
import type { HostedRuntimeCommand } from "./hosted-runtime-service";
import { HostedRunCommandError } from "./stage3-run-service";

function decisionIdForEvent(event: RunEventV1): string | null {
  if (
    event.eventType !== "DECISION_SUBMITTED" &&
    event.eventType !== "DECISION_REJECTED"
  ) {
    return null;
  }
  if (typeof event.payload.decisionId === "string") {
    return event.payload.decisionId;
  }
  const decision = event.payload.decision;
  if (!isJsonObject(decision)) return null;
  const commandType = decision.commandType;
  if (commandType === "SUBMIT_CERTIFICATE_DECISION") {
    return "INT_CERTIFICATE_INITIAL_SUBMITTED";
  }
  if (commandType === "SUBMIT_DISCREPANCY_DECISION") {
    return "INT_DISCREPANCY_INITIAL_SUBMITTED";
  }
  if (
    commandType === "SUBMIT_RECALL_SCOPE_DECISION" &&
    decision.decisionId === "INT_RECALL_SCOPE"
  ) {
    return "INT_RECALL_SCOPE";
  }
  return null;
}

function stringValues(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === "string",
    );
  }
  return [];
}

function originalOptionIds(event: RunEventV1): readonly string[] {
  if (isJsonObject(event.payload.responses)) {
    return Object.values(event.payload.responses).flatMap(stringValues);
  }
  const decision = event.payload.decision;
  if (!isJsonObject(decision)) return [];
  return Object.entries(decision)
    .filter(
      ([key]) =>
        key !== "commandType" &&
        key !== "decisionId",
    )
    .flatMap(([, value]) => stringValues(value));
}

function scenarioDecisionNodes(
  pack: ScenarioPackV1,
  scenarioId: string,
  scenarioVersion: string,
): readonly DecisionNodeV1[] {
  const scenario = pack.scenarios.find(
    (candidate) =>
      candidate.scenarioId === scenarioId &&
      candidate.version === scenarioVersion,
  );
  if (scenario === undefined) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "Counterfactual points require the source scenario's exact version.",
    );
  }
  return scenario.nodes.filter(
    (node): node is DecisionNodeV1 =>
      node.nodeType === "DECISION" &&
      node.counterfactual?.enabled === true,
  );
}

export function counterfactualDecisionPoints(options: {
  readonly pack: ScenarioPackV1;
  readonly sourceRunId: string;
  readonly events: readonly RunEventV1[];
}): readonly CounterfactualDecisionPointV1[] {
  const first = options.events[0];
  if (
    first === undefined ||
    first.runId !== options.sourceRunId ||
    first.packId !== options.pack.packId ||
    first.packVersion !== options.pack.version
  ) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "Counterfactual points require one exact source run and pack.",
    );
  }
  const nodes = scenarioDecisionNodes(
    options.pack,
    first.scenarioId,
    first.scenarioVersion,
  );
  return nodes.flatMap((node) => {
    const event = options.events.find(
      (candidate) =>
        decisionIdForEvent(candidate) === node.decisionId,
    );
    if (event === undefined || event.sequenceNumber < 2) return [];
    return [
      {
        schemaVersion: "1.0.0" as const,
        sourceRunId: options.sourceRunId,
        forkSequenceNumber: event.sequenceNumber - 1,
        forkNodeId: node.nodeId,
        decisionId: node.decisionId,
        originalDecisionEventId: event.eventId,
        originalOptionIds: originalOptionIds(event),
        actorId: event.simulationActorId,
        organizationId: event.organizationId,
        roleId: event.roleId,
        title: node.title,
        fields: node.fields,
        configuration: node.counterfactual!,
      },
    ];
  });
}

export function counterfactualConditionPoints(options: {
  readonly pack: ScenarioPackV1;
  readonly sourceRunId: string;
  readonly events: readonly RunEventV1[];
}): readonly CounterfactualConditionPointV1[] {
  const first = options.events[0];
  if (
    first === undefined ||
    first.runId !== options.sourceRunId ||
    first.packId !== options.pack.packId ||
    first.packVersion !== options.pack.version
  ) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "Condition points require one exact source run and pack.",
    );
  }
  const scenario = options.pack.scenarios.find(
    (candidate) =>
      candidate.scenarioId === first.scenarioId &&
      candidate.version === first.scenarioVersion,
  );
  if (scenario === undefined) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "Condition points require the source scenario's exact version.",
    );
  }
  const originalRuntimeValue = first.payload.caseVariant;
  if (typeof originalRuntimeValue !== "string") return [];
  const decisions = counterfactualDecisionPoints(options);
  return scenario.counterfactualConditions.flatMap(
    (configuration) => {
      if (!configuration.enabled) return [];
      const decision = decisions.find(
        (candidate) =>
          candidate.forkNodeId === configuration.forkNodeId,
      );
      const originalValue = configuration.allowedValues.find(
        (candidate) =>
          candidate.runtimeValue === originalRuntimeValue,
      );
      if (
        decision === undefined ||
        originalValue === undefined ||
        configuration.allowedValues.every(
          (candidate) =>
            candidate.conditionValueId ===
            originalValue.conditionValueId,
        )
      ) {
        return [];
      }
      return [
        {
          schemaVersion: "1.0.0" as const,
          sourceRunId: options.sourceRunId,
          forkSequenceNumber: decision.forkSequenceNumber,
          forkNodeId: decision.forkNodeId,
          decisionId: decision.decisionId,
          originalDecisionEventId:
            decision.originalDecisionEventId,
          originalOptionIds: decision.originalOptionIds,
          actorId: decision.actorId,
          organizationId: decision.organizationId,
          roleId: decision.roleId,
          title: {
            localizationKey: configuration.localizationKey,
          },
          originalConditionValueId:
            originalValue.conditionValueId,
          configuration,
        },
      ];
    },
  );
}

function commandOptionIds(
  command: HostedRuntimeCommand,
): {
  readonly decisionId: string;
  readonly optionIds: readonly string[];
} {
  if (command.commandType === "SUBMIT_STRUCTURED_DECISION") {
    return {
      decisionId: command.decisionId,
      optionIds: Object.values(command.responses).flat(),
    };
  }
  if (command.commandType === "SUBMIT_CERTIFICATE_DECISION") {
    return {
      decisionId: "INT_CERTIFICATE_INITIAL_SUBMITTED",
      optionIds: [
        command.decision.certificateAssessment,
        command.decision.issuerAssessment,
        command.decision.storageChoice,
        command.decision.lotDisposition,
      ],
    };
  }
  if (command.commandType === "SUBMIT_DISCREPANCY_DECISION") {
    return {
      decisionId: "INT_DISCREPANCY_INITIAL_SUBMITTED",
      optionIds: [
        command.decision.action,
        command.decision.causeCode,
      ],
    };
  }
  if (command.commandType === "SUBMIT_RECALL_SCOPE_DECISION") {
    return {
      decisionId: command.decisionId,
      optionIds: command.selectedAssetIds,
    };
  }
  throw new HostedRunCommandError(
    "INVALID_COMMAND",
    "The first counterfactual command must submit the authored alternative decision.",
  );
}

export function validateCounterfactualIntervention(
  point: CounterfactualDecisionPointV1,
  command: HostedRuntimeCommand,
): void {
  const candidate = commandOptionIds(command);
  if (candidate.decisionId !== point.decisionId) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "The alternative command does not match the authored fork decision.",
    );
  }
  if (
    candidate.optionIds.length === 0 ||
    candidate.optionIds.some(
      (optionId) =>
        !point.configuration.allowedAlternativeOptionIds.includes(
          optionId,
        ),
    )
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "The alternative uses an option that is not authored for this counterfactual point.",
    );
  }
  const original = [...point.originalOptionIds].sort();
  const alternative = [...candidate.optionIds].sort();
  if (
    original.length === alternative.length &&
    original.every(
      (optionId, index) => optionId === alternative[index],
    )
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "A decision counterfactual must change at least one selected option.",
    );
  }
}

export function validateConditionDecisionReuse(
  point: CounterfactualConditionPointV1,
  command: HostedRuntimeCommand,
): void {
  const candidate = commandOptionIds(command);
  if (candidate.decisionId !== point.decisionId) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "The condition branch must reuse the decision at its authored fork.",
    );
  }
  const original = [...point.originalOptionIds].sort();
  const reused = [...candidate.optionIds].sort();
  if (
    original.length !== reused.length ||
    original.some(
      (optionId, index) => optionId !== reused[index],
    )
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "A condition counterfactual must keep the original learner decision unchanged.",
    );
  }
}
