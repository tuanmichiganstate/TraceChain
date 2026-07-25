import { isJsonObject } from "../contracts/json";
import type {
  CounterfactualRunMetadataV1,
  CreateCounterfactualBranchRequestV1,
} from "../contracts/counterfactual";
import type { RunEventV1 } from "../contracts/run-events";
import type { RunEventStore } from "./event-store";
import {
  type CounterfactualRunRepository,
  type SaveCounterfactualRunResult,
} from "./counterfactual-repository";
import { hashReplayState } from "./replay";

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

export interface CounterfactualBranchRuntimeAdapter<State> {
  replaySourcePrefix(
    events: readonly RunEventV1[],
  ): State | Promise<State>;
  forkState(
    sourceState: Readonly<State>,
    metadata: CounterfactualRunMetadataV1,
  ): State | Promise<State>;
  replayBranchSuffix(
    forkState: Readonly<State>,
    events: readonly RunEventV1[],
  ): State | Promise<State>;
  stateForHash(state: Readonly<State>): unknown;
  informationStateForHash(
    state: Readonly<State>,
    roleId: string,
  ): unknown;
}

export interface CounterfactualBranchReplayResult<State> {
  readonly metadata: CounterfactualRunMetadataV1;
  readonly sourcePrefixEvents: readonly RunEventV1[];
  readonly branchSuffixEvents: readonly RunEventV1[];
  readonly sourceState: State;
  readonly forkState: State;
  readonly currentState: State;
}

export class CounterfactualBranchError extends Error {
  constructor(
    readonly code:
      | "INVALID_COUNTERFACTUAL_REQUEST"
      | "SOURCE_RUN_NOT_FOUND"
      | "FORK_SEQUENCE_OUT_OF_RANGE"
      | "SOURCE_RUN_CONTRACT_MISMATCH"
      | "COUNTERFACTUAL_BRANCH_NOT_FOUND"
      | "COUNTERFACTUAL_BRANCH_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "CounterfactualBranchError";
  }
}

function requireIdentifier(value: string, fieldName: string): void {
  if (!IDENTIFIER.test(value)) {
    throw new CounterfactualBranchError(
      "INVALID_COUNTERFACTUAL_REQUEST",
      `${fieldName} must be a stable identifier.`,
    );
  }
}

function validateRequest(
  request: CreateCounterfactualBranchRequestV1,
): void {
  for (const [fieldName, value] of [
    ["branchRunId", request.branchRunId],
    ["sourceRunId", request.sourceRunId],
    ["forkNodeId", request.forkNodeId],
    ["interventionId", request.interventionId],
    ["createdByUserId", request.createdByUserId],
  ] as const) {
    requireIdentifier(value, fieldName);
  }
  if (request.branchRunId === request.sourceRunId) {
    throw new CounterfactualBranchError(
      "INVALID_COUNTERFACTUAL_REQUEST",
      "A counterfactual branch must use a distinct run ID.",
    );
  }
  if (
    !Number.isInteger(request.forkSequenceNumber) ||
    request.forkSequenceNumber < 1
  ) {
    throw new CounterfactualBranchError(
      "INVALID_COUNTERFACTUAL_REQUEST",
      "The fork sequence must be a positive integer.",
    );
  }
  if (
    !ISO_TIMESTAMP.test(request.createdAt) ||
    !Number.isFinite(Date.parse(request.createdAt))
  ) {
    throw new CounterfactualBranchError(
      "INVALID_COUNTERFACTUAL_REQUEST",
      "The branch creation time must be an ISO 8601 UTC timestamp.",
    );
  }
  const condition = request.conditionIntervention;
  if (condition !== undefined) {
    for (const [fieldName, value] of [
      ["conditionId", condition.conditionId],
      ["originalValueId", condition.originalValueId],
      ["alternativeValueId", condition.alternativeValueId],
    ] as const) {
      requireIdentifier(value, fieldName);
    }
    if (
      condition.runtimeConditionKey !== "COFFEE_CASE_VARIANT" ||
      (condition.runtimeValue !== "authorized-certifier" &&
        condition.runtimeValue !== "unauthorized-transporter") ||
      condition.originalValueId === condition.alternativeValueId
    ) {
      throw new CounterfactualBranchError(
        "INVALID_COUNTERFACTUAL_REQUEST",
        "A condition counterfactual requires one distinct authored runtime value.",
      );
    }
  }
}

function sourceConfiguration(firstEvent: RunEventV1): unknown {
  const modeConfiguration = firstEvent.payload.modeConfiguration;
  const mode = firstEvent.payload.mode;
  if (
    firstEvent.eventType !== "RUN_CREATED" ||
    !isJsonObject(modeConfiguration) ||
    typeof mode !== "string"
  ) {
    throw new CounterfactualBranchError(
      "SOURCE_RUN_CONTRACT_MISMATCH",
      "The source stream does not retain a valid run configuration.",
    );
  }
  const caseVariant = firstEvent.payload.caseVariant;
  return {
    mode,
    modeConfiguration,
    ...(typeof caseVariant === "string" ? { caseVariant } : {}),
  };
}

function sourceSeed(firstEvent: RunEventV1): string {
  const value = firstEvent.payload.scenarioSeed;
  if (typeof value !== "string" || value.length === 0) {
    throw new CounterfactualBranchError(
      "SOURCE_RUN_CONTRACT_MISMATCH",
      "The source stream does not retain its deterministic seed.",
    );
  }
  return value;
}

function assertSourceIdentity(
  events: readonly RunEventV1[],
  sourceRunId: string,
): RunEventV1 {
  const first = events[0];
  if (first === undefined) {
    throw new CounterfactualBranchError(
      "SOURCE_RUN_NOT_FOUND",
      `Source run ${sourceRunId} does not exist.`,
    );
  }
  for (const event of events) {
    if (
      event.runId !== sourceRunId ||
      event.packId !== first.packId ||
      event.packVersion !== first.packVersion ||
      event.scenarioId !== first.scenarioId ||
      event.scenarioVersion !== first.scenarioVersion
    ) {
      throw new CounterfactualBranchError(
        "SOURCE_RUN_CONTRACT_MISMATCH",
        "The source prefix crosses a run, pack, or scenario boundary.",
      );
    }
  }
  return first;
}

function assertBranchIdentity(
  events: readonly RunEventV1[],
  metadata: CounterfactualRunMetadataV1,
): void {
  for (const event of events) {
    if (
      event.runId !== metadata.branchRunId ||
      event.packId !== metadata.sourcePackId ||
      event.packVersion !== metadata.sourcePackVersion ||
      event.scenarioId !== metadata.sourceScenarioId ||
      event.scenarioVersion !== metadata.sourceScenarioVersion
    ) {
      throw new CounterfactualBranchError(
        "SOURCE_RUN_CONTRACT_MISMATCH",
        "The branch suffix does not use the source pack and scenario version.",
      );
    }
  }
}

export class CounterfactualBranchEngine {
  constructor(
    private readonly eventStore: RunEventStore,
    private readonly repository: CounterfactualRunRepository,
  ) {}

  async createBranch<State>(
    request: CreateCounterfactualBranchRequestV1,
    adapter: CounterfactualBranchRuntimeAdapter<State>,
  ): Promise<SaveCounterfactualRunResult> {
    validateRequest(request);
    const sourceThroughDecision = await this.eventStore.loadThrough(
      request.sourceRunId,
      request.forkSequenceNumber + 1,
    );
    if (sourceThroughDecision.length === 0) {
      throw new CounterfactualBranchError(
        "SOURCE_RUN_NOT_FOUND",
        `Source run ${request.sourceRunId} does not exist.`,
      );
    }
    if (
      sourceThroughDecision.length !==
      request.forkSequenceNumber + 1
    ) {
      throw new CounterfactualBranchError(
        "FORK_SEQUENCE_OUT_OF_RANGE",
        `Source run ${request.sourceRunId} has no decision immediately after sequence ${String(request.forkSequenceNumber)}.`,
      );
    }
    const originalDecisionEvent =
      sourceThroughDecision[request.forkSequenceNumber];
    if (
      originalDecisionEvent === undefined ||
      (originalDecisionEvent.eventType !== "DECISION_SUBMITTED" &&
        originalDecisionEvent.eventType !== "DECISION_REJECTED")
    ) {
      throw new CounterfactualBranchError(
        "INVALID_COUNTERFACTUAL_REQUEST",
        "A decision counterfactual must fork immediately before an original decision event.",
      );
    }
    const sourcePrefix = sourceThroughDecision.slice(
      0,
      request.forkSequenceNumber,
    );
    const firstEvent = assertSourceIdentity(
      sourceThroughDecision,
      request.sourceRunId,
    );
    const sourceState = await adapter.replaySourcePrefix(sourcePrefix);
    const metadata: CounterfactualRunMetadataV1 = {
      schemaVersion: "1.0.0",
      branchRunId: request.branchRunId,
      sourceRunId: request.sourceRunId,
      forkSequenceNumber: request.forkSequenceNumber,
      forkNodeId: request.forkNodeId,
      forkActorId: originalDecisionEvent.simulationActorId,
      forkOrganizationId: originalDecisionEvent.organizationId,
      forkRoleId: originalDecisionEvent.roleId,
      sourcePackId: firstEvent.packId,
      sourcePackVersion: firstEvent.packVersion,
      sourceScenarioId: firstEvent.scenarioId,
      sourceScenarioVersion: firstEvent.scenarioVersion,
      sourceConfigurationHash: hashReplayState(
        sourceConfiguration(firstEvent),
      ),
      sourceSeed: sourceSeed(firstEvent),
      sourceStateHash: hashReplayState(
        adapter.stateForHash(sourceState),
      ),
      sourceInformationStateHash: hashReplayState(
        adapter.informationStateForHash(
          sourceState,
          originalDecisionEvent.roleId,
        ),
      ),
      counterfactualType:
        request.conditionIntervention === undefined
          ? "DECISION"
          : "CONDITION",
      ...(request.conditionIntervention === undefined
        ? {}
        : {
            conditionIntervention:
              request.conditionIntervention,
          }),
      interventionId: request.interventionId,
      comparisonMode: request.comparisonMode,
      createdByUserId: request.createdByUserId,
      createdAt: request.createdAt,
    };
    return this.repository.create(metadata);
  }

  async reconstructBranch<State>(
    branchRunId: string,
    adapter: CounterfactualBranchRuntimeAdapter<State>,
  ): Promise<CounterfactualBranchReplayResult<State>> {
    const metadata = await this.repository.find(branchRunId);
    if (metadata === null) {
      throw new CounterfactualBranchError(
        "COUNTERFACTUAL_BRANCH_NOT_FOUND",
        `Counterfactual branch ${branchRunId} does not exist.`,
      );
    }
    const sourceThroughDecision = await this.eventStore.loadThrough(
      metadata.sourceRunId,
      metadata.forkSequenceNumber + 1,
    );
    if (
      sourceThroughDecision.length !==
      metadata.forkSequenceNumber + 1
    ) {
      throw new CounterfactualBranchError(
        "FORK_SEQUENCE_OUT_OF_RANGE",
        "The stored source prefix no longer reaches the branch fork.",
      );
    }
    const originalDecisionEvent =
      sourceThroughDecision[metadata.forkSequenceNumber];
    if (
      originalDecisionEvent === undefined ||
      (originalDecisionEvent.eventType !== "DECISION_SUBMITTED" &&
        originalDecisionEvent.eventType !== "DECISION_REJECTED") ||
      originalDecisionEvent.simulationActorId !== metadata.forkActorId ||
      originalDecisionEvent.organizationId !==
        metadata.forkOrganizationId ||
      originalDecisionEvent.roleId !== metadata.forkRoleId
    ) {
      throw new CounterfactualBranchError(
        "SOURCE_RUN_CONTRACT_MISMATCH",
        "The original decision or its trusted context no longer matches the branch.",
      );
    }
    const sourcePrefix = sourceThroughDecision.slice(
      0,
      metadata.forkSequenceNumber,
    );
    const firstEvent = assertSourceIdentity(
      sourceThroughDecision,
      metadata.sourceRunId,
    );
    if (
      firstEvent.packId !== metadata.sourcePackId ||
      firstEvent.packVersion !== metadata.sourcePackVersion ||
      firstEvent.scenarioId !== metadata.sourceScenarioId ||
      firstEvent.scenarioVersion !==
        metadata.sourceScenarioVersion ||
      sourceSeed(firstEvent) !== metadata.sourceSeed ||
      hashReplayState(sourceConfiguration(firstEvent)) !==
        metadata.sourceConfigurationHash
    ) {
      throw new CounterfactualBranchError(
        "SOURCE_RUN_CONTRACT_MISMATCH",
        "The source run no longer matches the branch version boundary.",
      );
    }
    const sourceState = await adapter.replaySourcePrefix(sourcePrefix);
    if (
      hashReplayState(adapter.stateForHash(sourceState)) !==
        metadata.sourceStateHash ||
      hashReplayState(
        adapter.informationStateForHash(
          sourceState,
          metadata.forkRoleId,
        ),
      ) !== metadata.sourceInformationStateHash
    ) {
      throw new CounterfactualBranchError(
        "SOURCE_RUN_CONTRACT_MISMATCH",
        "The source state or role-visible information at the fork changed.",
      );
    }
    const forkState = await adapter.forkState(sourceState, metadata);
    const branchSuffix = await this.eventStore.load(branchRunId);
    assertBranchIdentity(branchSuffix, metadata);
    const currentState = await adapter.replayBranchSuffix(
      forkState,
      branchSuffix,
    );
    return {
      metadata,
      sourcePrefixEvents: sourcePrefix,
      branchSuffixEvents: branchSuffix,
      sourceState,
      forkState,
      currentState,
    };
  }
}
