import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type {
  Clock,
  IdGenerator,
} from "../../domain/simulation/environment";
import type { TrustedExecutionContext } from "../../domain/simulation/types";
import type { HostedRunMonitorStatusV1 } from "../contracts/assessment";
import type {
  CounterfactualRunMetadataV1,
  CreateCounterfactualBranchRequestV1,
} from "../contracts/counterfactual";
import type {
  HostedRunDecisionOutcomeEvidenceV1,
} from "../contracts/decision-outcome-report";
import type { JsonObject } from "../contracts/json";
import type {
  LearnerRunAuthoredFeedbackV1,
  LearnerRunLocalizedTextV1,
  LearnerRunPresentationV1,
  LearnerRunProjectionV1,
  PlatformRunEventType,
  RunEventV1,
  UnsequencedRunEventV1,
  VisibleStateRecordV1,
} from "../contracts/run-events";
import { learnerEvidenceMetadataToJson } from "../scenario-packs/evidence-metadata";
import type { InstructorRunReplayV1 } from "../contracts/run-replay";
import type {
  InstructorIncidentStatusV1,
  ReleaseInstructorIncidentCommandV1,
} from "../contracts/simulation-director";
import type {
  DecisionNodeV1,
  ScenarioDefinitionV1,
  ScenarioNodeV1,
  ScenarioPackV1,
  ScenarioPolicyV1,
  ScenarioTransitionV1,
} from "../contracts/scenario-pack";
import type { RunEventStore } from "../runs/event-store";
import {
  CounterfactualBranchEngine,
  CounterfactualBranchError,
  type CounterfactualBranchRuntimeAdapter,
} from "../runs/counterfactual-branch";
import type { SaveCounterfactualRunResult } from "../runs/counterfactual-repository";
import { evaluateAutomatedEvidenceRule } from "../runs/automated-evidence-rule";
import {
  modeConfigurationFor,
  validateHostedModeConfiguration,
} from "../runs/mode-configuration";
import {
  assertHostedExperienceIdentity,
  resolveHostedExperienceConfiguration,
} from "../runs/experience-configuration";
import { projectRunStateForRole } from "../runs/projection";
import {
  hashReplayState,
  replayRunEvents,
} from "../runs/replay";
import {
  resolveStochasticOutcome,
  type StochasticOutcomeResolutionV1,
} from "../runs/stochastic-outcomes";
import {
  HostedAuthorizationError,
  requireApplicationRole,
  requireAssignedLearner,
  type ApplicationPrincipal,
} from "./access";
import type {
  CreateGenericHostedRunRequest,
  GenericDecisionSubmission,
  GenericHostedCommand,
  GenericHostedRunResult,
  GenericHostedRunState,
  SubmitGenericDecisionCommand,
} from "./generic-run-types";
import { isGenericHostedRuntimeScenario } from "./runtime-registry";
import { HostedRunCommandError } from "./run-command-error";
import type {
  CompetencyEvidenceProjection,
  HostedCompetencyEvidence,
  InstructorTimelineItem,
  RubricEvidenceProjection,
} from "./stage3-types";
import type { CounterfactualRuntimeMetrics } from "./counterfactual-metrics";
import { staffProfileProjection } from "./staff-profile-projection";

const FORBIDDEN_IDENTITY_FIELDS = new Set([
  "actorId",
  "authenticatedUserId",
  "organizationId",
  "roleId",
  "simulationActorId",
]);

interface BuiltEvent {
  readonly unsequenced: UnsequencedRunEventV1;
  readonly sequenced: RunEventV1;
  readonly nextState: GenericHostedRunState;
}

interface LoadedGenericRun {
  readonly state: GenericHostedRunState;
  readonly commandEvents: readonly RunEventV1[];
  readonly startedAt: string;
  readonly isCounterfactual: boolean;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      `${path} must be a non-empty string.`,
    );
  }
  return value;
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestDigest(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

function addMinutes(timestamp: string, minutes: number): string {
  const instant = Date.parse(timestamp);
  if (!Number.isFinite(instant)) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "Evidence acquisition requires a valid server timestamp.",
    );
  }
  return new Date(instant + minutes * 60_000).toISOString();
}

function submittedCommandIntent(
  command:
    | GenericHostedCommand
    | ReleaseInstructorIncidentCommandV1,
): JsonObject {
  const {
    commandId: _commandId,
    runId: _runId,
    expectedRunVersion: _expectedRunVersion,
    ...intent
  } = command;
  return JSON.parse(canonicalize(intent)) as JsonObject;
}

function eventsWithSubmittedCommand(
  events: readonly BuiltEvent[],
  command:
    | GenericHostedCommand
    | ReleaseInstructorIncidentCommandV1,
): readonly UnsequencedRunEventV1[] {
  const submittedCommand = submittedCommandIntent(command);
  return events.map((event, index) =>
    index === 0
      ? {
          ...event.unsequenced,
          payload: {
            ...event.unsequenced.payload,
            submittedCommand,
          },
        }
      : event.unsequenced,
  );
}

function rejectSelfAssertedIdentity(
  value: unknown,
  path = "command",
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      rejectSelfAssertedIdentity(item, `${path}[${String(index)}]`),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_IDENTITY_FIELDS.has(key)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `${path}.${key} must come from trusted execution context.`,
      );
    }
    rejectSelfAssertedIdentity(nested, `${path}.${key}`);
  }
}

function stringArray(
  value: unknown,
  path: string,
  errorCode:
    | "INVALID_COMMAND"
    | "PACK_CONTRACT_MISMATCH" = "PACK_CONTRACT_MISMATCH",
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string")
  ) {
    throw new HostedRunCommandError(
      errorCode,
      `${path} must be a string array.`,
    );
  }
  return value as readonly string[];
}

function decisionResponses(
  value: unknown,
  path = "responses",
  errorCode:
    | "INVALID_COMMAND"
    | "PACK_CONTRACT_MISMATCH" = "PACK_CONTRACT_MISMATCH",
): Readonly<Record<string, readonly string[]>> {
  if (!isObject(value)) {
    throw new HostedRunCommandError(
      errorCode,
      `${path} must be an object.`,
    );
  }
  return Object.fromEntries(
    Object.entries(value).map(([fieldId, selected]) => [
      fieldId,
      stringArray(selected, `${path}.${fieldId}`, errorCode),
    ]),
  );
}

function competencyEvidenceProjection(
  state: GenericHostedRunState,
): readonly CompetencyEvidenceProjection[] {
  const indicatorIds = [
    ...new Set(
      state.competencyEvidence.flatMap(
        (evidence) => evidence.indicatorIds,
      ),
    ),
  ].sort();
  return indicatorIds.map((indicatorId) => ({
    indicatorId,
    evidence: state.competencyEvidence.filter((evidence) =>
      evidence.indicatorIds.includes(indicatorId),
    ),
  }));
}

function visibleRecords(
  source: JsonObject,
  roleIds: readonly string[],
): readonly VisibleStateRecordV1[] {
  return Object.entries(source)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([recordId, value]) => ({
      recordId,
      visibleToRoleIds: roleIds,
      value,
    }));
}

export class GenericHostedRunService {
  private readonly scenario: ScenarioDefinitionV1;

  constructor(
    private readonly pack: ScenarioPackV1,
    scenarioId: string,
    scenarioVersion: string,
    private readonly eventStore: RunEventStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly counterfactualBranches?: CounterfactualBranchEngine,
  ) {
    const scenario = pack.scenarios.find(
      (candidate) =>
        candidate.scenarioId === scenarioId &&
        candidate.version === scenarioVersion,
    );
    if (
      scenario === undefined ||
      !isGenericHostedRuntimeScenario(scenario)
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The selected scenario is not supported by the generic hosted runtime.",
      );
    }
    this.scenario = scenario;
  }

  async createCounterfactualBranch(
    principal: ApplicationPrincipal | null,
    request: CreateCounterfactualBranchRequestV1,
  ): Promise<SaveCounterfactualRunResult> {
    if (this.counterfactualBranches === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Counterfactual branch storage is not configured.",
      );
    }
    const creator = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "administrator",
    ]);
    if (creator.userId !== request.createdByUserId) {
      throw new HostedAuthorizationError(
        "RUN_ACCESS_DENIED",
        "The authenticated user must create the branch as themselves.",
      );
    }
    const source = await this.loadState(request.sourceRunId);
    if (creator.roles.includes("learner")) {
      requireAssignedLearner(creator, source.learnerUserId);
    }
    return this.counterfactualBranches.createBranch(
      request,
      this.counterfactualAdapter(),
    );
  }

  async createRun(
    principal: ApplicationPrincipal | null,
    request: CreateGenericHostedRunRequest,
  ): Promise<GenericHostedRunResult> {
    const creator = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "scenario-author",
      "administrator",
    ]);
    if (
      creator.roles.includes("learner") &&
      creator.userId !== request.learnerUserId
    ) {
      throw new HostedAuthorizationError(
        "RUN_ACCESS_DENIED",
        "A learner may only start their own assigned run.",
      );
    }
    this.validateCreateRequest(request);
    const resolved = this.resolveModeAndOutcome(request);
    const digest = requestDigest(request);
    const existingEvents = await this.eventStore.load(request.runId);
    if (existingEvents.length > 0) {
      const existing = existingEvents.filter(
        (event) => event.causationId === request.commandId,
      );
      if (existing.length > 0) {
        if (existing[0]?.payload.requestDigest !== digest) {
          throw new HostedRunCommandError(
            "COMMAND_ID_REUSED",
            `Command ID ${request.commandId} was already used with different content.`,
          );
        }
        return {
          state: this.replay(existingEvents),
          appendedEventIds: existing.map((event) => event.eventId),
          wasIdempotentReplay: true,
        };
      }
      throw new HostedRunCommandError(
        "RUN_ALREADY_EXISTS",
        `Run ${request.runId} already exists.`,
      );
    }

    const context = this.trustedContextFor(request.learnerUserId);
    const built: BuiltEvent[] = [];
    let state: GenericHostedRunState | null = null;
    const created = this.buildEvent({
      runId: request.runId,
      state,
      principal: creator,
      context,
      commandId: request.commandId,
      commandDigest: digest,
      batchIndex: built.length,
      eventType: "RUN_CREATED",
      payload: {
        assignmentId: request.assignmentId,
        learnerUserId: request.learnerUserId,
        mode: request.mode,
        modeConfiguration:
          resolved.modeConfiguration as unknown as JsonObject,
        experienceConfiguration:
          resolved.experience.configuration as unknown as JsonObject,
        experienceConfigurationHash:
          resolved.experience.configurationHash,
        scenarioSeed: resolved.scenarioSeed,
        packContentHash: this.packContentHash(),
      },
    });
    built.push(created);
    state = created.nextState;

    if (resolved.outcomeResolution?.strategy === "probabilistic") {
      const randomDraw = this.buildEvent({
        runId: request.runId,
        state,
        principal: creator,
        context,
        commandId: request.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        eventType: "RANDOM_DRAW_MADE",
        payload: {
          outcomeModelId: resolved.outcomeResolution.outcomeModelId,
          distribution: resolved.outcomeResolution.distribution,
          randomStreamId: resolved.outcomeResolution.randomStreamId,
          drawKey: resolved.outcomeResolution.drawKey,
          probabilityParameters:
            resolved.outcomeResolution
              .probabilityParameters as JsonObject,
          draw: resolved.outcomeResolution.draw ?? -1,
        },
      });
      built.push(randomDraw);
      state = randomDraw.nextState;
      const outcome = this.buildEvent({
        runId: request.runId,
        state,
        principal: creator,
        context,
        commandId: request.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        eventType: "OUTCOME_REALIZED",
        payload: {
          outcomeModelId: resolved.outcomeResolution.outcomeModelId,
          outcomeCode: resolved.outcomeResolution.outcomeCode,
        },
      });
      built.push(outcome);
      state = outcome.nextState;
    }

    state = this.appendPassiveNodeEvents({
      state,
      built,
      principal: creator,
      context,
      commandId: request.commandId,
      commandDigest: digest,
    });
    const appended = await this.eventStore.append({
      runId: request.runId,
      expectedNextSequenceNumber: 1,
      events: built.map((event) => event.unsequenced),
    });
    return {
      state,
      appendedEventIds: appended.events.map((event) => event.eventId),
      wasIdempotentReplay: appended.wasIdempotentReplay,
    };
  }

  async submit(
    principal: ApplicationPrincipal | null,
    command: GenericHostedCommand,
  ): Promise<GenericHostedRunResult> {
    return this.submitCommand(principal, command, false);
  }

  async submitCounterfactual(
    principal: ApplicationPrincipal | null,
    command: GenericHostedCommand,
  ): Promise<GenericHostedRunResult> {
    return this.submitCommand(principal, command, true);
  }

  async instructorIncidents(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly InstructorIncidentStatusV1[]> {
    requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    const { state } = await this.loadRun(runId);
    return this.scenario.instructorIncidents.map((incident) => {
      const released = state.releasedInstructorIncidents.find(
        (candidate) => candidate.incidentId === incident.incidentId,
      );
      const available =
        state.status === "active" &&
        incident.releaseAtNodeIds.includes(
          state.workflowState.currentNodeId,
        ) &&
        incident.visibleToRoleIds.includes(
          state.activeTrustedContext.roleId,
        );
      return {
        schemaVersion: "1.0.0",
        incidentId: incident.incidentId,
        version: incident.version,
        title: this.localizedText(incident.title.localizationKey),
        message: this.localizedText(incident.message.localizationKey),
        status:
          released !== undefined
            ? "released"
            : available
              ? "available"
              : "unavailable",
        ...(released === undefined
          ? {}
          : {
              releasedAt: released.releasedAt,
              releasedByUserId: released.releasedByUserId,
            }),
      };
    });
  }

  async releaseInstructorIncident(
    principal: ApplicationPrincipal | null,
    command: ReleaseInstructorIncidentCommandV1,
  ): Promise<GenericHostedRunResult> {
    const instructor = requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    requiredString(command.commandId, "commandId");
    requiredString(command.runId, "runId");
    requiredString(command.incidentId, "incidentId");
    rejectSelfAssertedIdentity(command);
    const loaded = await this.loadRun(command.runId);
    if (loaded.isCounterfactual) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "Instructor incidents may be released only into original runs.",
      );
    }
    const digest = requestDigest(command);
    const existing = loaded.commandEvents.filter(
      (event) => event.causationId === command.commandId,
    );
    if (existing.length > 0) {
      if (existing[0]?.payload.requestDigest !== digest) {
        throw new HostedRunCommandError(
          "COMMAND_ID_REUSED",
          `Command ID ${command.commandId} was already used with different content.`,
        );
      }
      return {
        state: loaded.state,
        appendedEventIds: existing.map((event) => event.eventId),
        wasIdempotentReplay: true,
      };
    }
    const state = loaded.state;
    if (
      !Number.isInteger(command.expectedRunVersion) ||
      command.expectedRunVersion !== state.version
    ) {
      throw new HostedRunCommandError(
        "RUN_VERSION_CONFLICT",
        `Run ${command.runId} is at version ${String(state.version)}.`,
      );
    }
    if (state.status !== "active") {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "A completed run cannot receive an instructor incident.",
      );
    }
    const incident = this.scenario.instructorIncidents.find(
      (candidate) => candidate.incidentId === command.incidentId,
    );
    if (
      incident === undefined ||
      !incident.releaseAtNodeIds.includes(
        state.workflowState.currentNodeId,
      ) ||
      !incident.visibleToRoleIds.includes(
        state.activeTrustedContext.roleId,
      ) ||
      state.releasedInstructorIncidents.some(
        (candidate) =>
          candidate.incidentId === command.incidentId,
      )
    ) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "The authored incident is not available at the current workflow node.",
      );
    }
    const released = this.buildEvent({
      runId: command.runId,
      state,
      principal: instructor,
      context: state.activeTrustedContext,
      commandId: command.commandId,
      commandDigest: digest,
      batchIndex: 0,
      eventType: "INSTRUCTOR_INCIDENT_RELEASED",
      payload: {
        incidentId: incident.incidentId,
        incidentVersion: incident.version,
        evidenceIds: incident.evidenceIds,
      },
    });
    const appended = await this.eventStore.append({
      runId: command.runId,
      expectedNextSequenceNumber: loaded.commandEvents.length + 1,
      events: eventsWithSubmittedCommand([released], command),
    });
    return {
      state: released.nextState,
      appendedEventIds: appended.events.map((event) => event.eventId),
      wasIdempotentReplay: appended.wasIdempotentReplay,
    };
  }

  private async submitCommand(
    principal: ApplicationPrincipal | null,
    command: GenericHostedCommand,
    requireCounterfactual: boolean,
  ): Promise<GenericHostedRunResult> {
    requiredString(command.commandId, "commandId");
    requiredString(command.runId, "runId");
    requiredString(command.commandType, "commandType");
    rejectSelfAssertedIdentity(command);
    const loaded = await this.loadRun(command.runId);
    if (requireCounterfactual !== loaded.isCounterfactual) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        requireCounterfactual
          ? "The requested run is not a counterfactual branch."
          : "Counterfactual branches require the exploratory command endpoint.",
      );
    }
    const events = loaded.commandEvents;
    let state = loaded.state;
    const learner = requireCounterfactual
      ? this.requireCounterfactualActor(
          principal,
          state.learnerUserId,
        )
      : requireAssignedLearner(principal, state.learnerUserId);
    const digest = requestDigest(command);
    const existing = events.filter(
      (event) => event.causationId === command.commandId,
    );
    if (existing.length > 0) {
      if (existing[0]?.payload.requestDigest !== digest) {
        throw new HostedRunCommandError(
          "COMMAND_ID_REUSED",
          `Command ID ${command.commandId} was already used with different content.`,
        );
      }
      return {
        state,
        appendedEventIds: existing.map((event) => event.eventId),
        wasIdempotentReplay: true,
      };
    }
    if (
      !Number.isInteger(command.expectedRunVersion) ||
      command.expectedRunVersion !== state.version
    ) {
      throw new HostedRunCommandError(
        "RUN_VERSION_CONFLICT",
        `Run ${command.runId} is at version ${String(state.version)}.`,
      );
    }
    if (state.status === "completed") {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "A completed run cannot accept another learner command.",
      );
    }

    const startedAt = loaded.startedAt;
    const timing = this.runTiming(state, startedAt, this.clock.now());
    if (timing.status === "expired") {
      if (
        events.some(
          (event) => event.eventType === "RUN_TIME_LIMIT_EXCEEDED",
        )
      ) {
        throw new HostedRunCommandError(
          "RUN_TIME_LIMIT_EXCEEDED",
          "The authored run time limit has elapsed.",
        );
      }
      if (
        timing.deadline === undefined ||
        timing.timeLimitMinutes === undefined
      ) {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "An expired run must retain its authored deadline.",
        );
      }
      const expired = this.buildEvent({
        runId: command.runId,
        state,
        principal: learner,
        context: state.activeTrustedContext,
        commandId: command.commandId,
        commandDigest: digest,
        batchIndex: 0,
        eventType: "RUN_TIME_LIMIT_EXCEEDED",
        payload: {
          attemptedCommandType: command.commandType,
          timeLimitMinutes: timing.timeLimitMinutes,
          deadlineUtc: timing.deadline,
        },
      });
      const appended = await this.eventStore.append({
        runId: command.runId,
        expectedNextSequenceNumber: events.length + 1,
        events: eventsWithSubmittedCommand([expired], command),
      });
      return {
        state: expired.nextState,
        appendedEventIds: appended.events.map((event) => event.eventId),
        wasIdempotentReplay: appended.wasIdempotentReplay,
      };
    }

    const built: BuiltEvent[] = [];
    const context = state.activeTrustedContext;
    if (command.commandType === "ADVANCE_WORKFLOW") {
      const currentNode = this.currentNode(state);
      if (
        currentNode.nodeType !== "BRIEFING" &&
        currentNode.nodeType !== "CONSEQUENCE"
      ) {
        throw new HostedRunCommandError(
          "WORKFLOW_PRECONDITION_FAILED",
          "The current node cannot be advanced directly.",
        );
      }
      const transition = this.nextTransition(currentNode, state);
      const advanced = this.buildWorkflowAdvancedEvent({
        state,
        principal: learner,
        context,
        commandId: command.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        transition,
      });
      built.push(advanced);
      state = advanced.nextState;
      state = this.appendPassiveNodeEvents({
        state,
        built,
        principal: learner,
        context,
        commandId: command.commandId,
        commandDigest: digest,
      });
    } else if (command.commandType === "INSPECT_EVIDENCE") {
      const evidence = this.scenario.evidenceItems.find(
        (candidate) => candidate.evidenceId === command.evidenceId,
      );
      if (
        evidence === undefined ||
        !state.releasedEvidenceIds.includes(command.evidenceId) ||
        !evidence.visibleToRoleIds.includes(context.roleId) ||
        state.inspectedEvidenceIds.includes(command.evidenceId)
      ) {
        throw new HostedRunCommandError(
          "WORKFLOW_PRECONDITION_FAILED",
          "The requested evidence is unavailable or has already been inspected.",
        );
      }
      const inspected = this.buildEvent({
        runId: command.runId,
        state,
        principal: learner,
        context,
        commandId: command.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        eventType: "EVIDENCE_INSPECTED",
        payload: { evidenceId: command.evidenceId },
      });
      built.push(inspected);
      state = inspected.nextState;
    } else if (command.commandType === "REQUEST_EVIDENCE") {
      const evidence = this.requestableEvidence(state).find(
        (candidate) => candidate.evidenceId === command.evidenceId,
      );
      if (evidence === undefined) {
        throw new HostedRunCommandError(
          "WORKFLOW_PRECONDITION_FAILED",
          "The requested evidence is not available for acquisition in the current run state.",
        );
      }
      const requestedAt = this.clock.now();
      const simulatedAvailableAt = addMinutes(
        requestedAt,
        evidence.learnerMetadata.access.delayMinutes,
      );
      const requested = this.buildEvent({
        runId: command.runId,
        state,
        principal: learner,
        context,
        commandId: command.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        eventType: "EVIDENCE_REQUESTED",
        serverTimestampUtc: requestedAt,
        payload: {
          evidenceId: evidence.evidenceId,
          delayMinutes:
            evidence.learnerMetadata.access.delayMinutes,
          costUnits: evidence.learnerMetadata.access.costUnits,
          simulatedAvailableAt,
          ...(evidence.learnerMetadata.access
            .permissionPolicyId === undefined
            ? {}
            : {
                permissionPolicyId:
                  evidence.learnerMetadata.access
                    .permissionPolicyId,
              }),
        },
      });
      built.push(requested);
      state = requested.nextState;
      const released = this.buildEvent({
        runId: command.runId,
        state,
        principal: learner,
        context,
        commandId: command.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        eventType: "EVIDENCE_RELEASED",
        payload: {
          evidenceId: evidence.evidenceId,
          releaseReason: "REQUEST_FULFILLED",
          requestEventId: requested.sequenced.eventId,
          simulatedAvailableAt,
        },
      });
      built.push(released);
      state = released.nextState;
    } else if (command.commandType === "CONSULT_POLICY") {
      const policy = this.consultablePolicies(state).find(
        (candidate) => candidate.policyId === command.policyId,
      );
      if (policy === undefined) {
        throw new HostedRunCommandError(
          "WORKFLOW_PRECONDITION_FAILED",
          "The requested policy is not available for consultation in the current run state.",
        );
      }
      const consulted = this.buildEvent({
        runId: command.runId,
        state,
        principal: learner,
        context,
        commandId: command.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        eventType: "POLICY_CONSULTED",
        payload: { policyId: policy.policyId },
      });
      built.push(consulted);
      state = consulted.nextState;
    } else if (command.commandType === "SUBMIT_STRUCTURED_DECISION") {
      const node = this.currentNode(state);
      if (node.nodeType !== "DECISION") {
        throw new HostedRunCommandError(
          "WORKFLOW_PRECONDITION_FAILED",
          "The current workflow node does not accept a decision.",
        );
      }
      const decision = this.validateDecision(command, node, state);
      const submitted = this.buildEvent({
        runId: command.runId,
        state,
        principal: learner,
        context,
        commandId: command.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        eventType: "DECISION_SUBMITTED",
        payload: {
          decisionId: decision.decisionId,
          responses: decision.responses as unknown as JsonObject,
          justification: decision.justification,
          citedEvidenceIds: decision.citedEvidenceIds,
          citedPolicyIds: decision.citedPolicyIds,
          confidenceRating: decision.confidenceRating,
          adverseEventProbabilityPercent:
            decision.adverseEventProbabilityPercent,
        },
      });
      built.push(submitted);
      state = submitted.nextState;

      for (const evidenceRuleId of this.scenario.evidenceRuleIds) {
        const rule = this.pack.evidenceRules.find(
          (candidate) =>
            candidate.evidenceRuleId === evidenceRuleId,
        );
        if (
          rule === undefined ||
          !evaluateAutomatedEvidenceRule(rule, submitted.sequenced)
            .matched
        ) {
          continue;
        }
        const evidence = this.buildEvent({
          runId: command.runId,
          state,
          principal: learner,
          context,
          commandId: command.commandId,
          commandDigest: digest,
          batchIndex: built.length,
          eventType: "COMPETENCY_EVIDENCE_RECORDED",
          payload: {
            competencyEvidenceId: this.ids.nextId("CEV"),
            evidenceRuleId: rule.evidenceRuleId,
            evidenceRuleVersion: rule.version,
            indicatorIds: rule.indicatorIds,
            sourceEventIds: [submitted.sequenced.eventId],
          },
        });
        built.push(evidence);
        state = evidence.nextState;
      }

      const transition = this.nextTransition(node, state);
      const advanced = this.buildWorkflowAdvancedEvent({
        state,
        principal: learner,
        context,
        commandId: command.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        transition,
      });
      built.push(advanced);
      state = advanced.nextState;
      state = this.appendPassiveNodeEvents({
        state,
        built,
        principal: learner,
        context,
        commandId: command.commandId,
        commandDigest: digest,
      });
    } else {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "The generic runtime does not recognize this command.",
      );
    }

    const appended = await this.eventStore.append({
      runId: command.runId,
      expectedNextSequenceNumber: events.length + 1,
      events: eventsWithSubmittedCommand(built, command),
    });
    return {
      state,
      appendedEventIds: appended.events.map((event) => event.eventId),
      wasIdempotentReplay: appended.wasIdempotentReplay,
    };
  }

  async learnerProjection(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<LearnerRunProjectionV1> {
    const loaded = await this.loadRun(runId);
    const state = loaded.state;
    requireAssignedLearner(principal, state.learnerUserId);
    return {
      ...projectRunStateForRole(
        this.toProjectionState(state),
        state.activeTrustedContext.roleId,
      ),
      staffProfile: staffProfileProjection(
        this.pack,
        this.scenario,
        state.activeTrustedContext.roleId,
      ),
      timing: this.runTiming(
        state,
        loaded.startedAt,
        this.clock.now(),
      ),
      presentation: this.presentation(state),
    };
  }

  async counterfactualProjection(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<LearnerRunProjectionV1> {
    const loaded = await this.loadRun(runId);
    if (!loaded.isCounterfactual) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "The requested run is not a counterfactual branch.",
      );
    }
    this.requireCounterfactualActor(
      principal,
      loaded.state.learnerUserId,
    );
    return {
      ...projectRunStateForRole(
        this.toProjectionState(loaded.state),
        loaded.state.activeTrustedContext.roleId,
      ),
      staffProfile: staffProfileProjection(
        this.pack,
        this.scenario,
        loaded.state.activeTrustedContext.roleId,
      ),
      timing: this.runTiming(
        loaded.state,
        loaded.startedAt,
        this.clock.now(),
      ),
      presentation: this.presentation(loaded.state),
    };
  }

  async counterfactualSourceProjection(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<LearnerRunProjectionV1> {
    const loaded = await this.loadRun(runId);
    if (loaded.isCounterfactual) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "The requested run is not an original source run.",
      );
    }
    this.requireCounterfactualActor(
      principal,
      loaded.state.learnerUserId,
    );
    return {
      ...projectRunStateForRole(
        this.toProjectionState(loaded.state),
        loaded.state.activeTrustedContext.roleId,
      ),
      staffProfile: staffProfileProjection(
        this.pack,
        this.scenario,
        loaded.state.activeTrustedContext.roleId,
      ),
      timing: this.runTiming(
        loaded.state,
        loaded.startedAt,
        this.clock.now(),
      ),
      presentation: this.presentation(loaded.state),
    };
  }

  async counterfactualForkProjection(
    principal: ApplicationPrincipal | null,
    sourceRunId: string,
    forkSequenceNumber: number,
    roleId: string,
  ): Promise<LearnerRunProjectionV1> {
    const throughDecision = await this.eventStore.loadThrough(
      sourceRunId,
      forkSequenceNumber + 1,
    );
    const decision = throughDecision[forkSequenceNumber];
    if (
      throughDecision.length !== forkSequenceNumber + 1 ||
      decision === undefined ||
      decision.roleId !== roleId
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The requested fork no longer matches its original trusted role.",
      );
    }
    const state = this.replay(
      throughDecision.slice(0, forkSequenceNumber),
    );
    this.requireCounterfactualActor(
      principal,
      state.learnerUserId,
    );
    return {
      ...projectRunStateForRole(
        this.toProjectionState(state),
        roleId,
      ),
      staffProfile: staffProfileProjection(
        this.pack,
        this.scenario,
        roleId,
      ),
      presentation: this.presentation(state),
    };
  }

  async counterfactualMetrics(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<CounterfactualRuntimeMetrics> {
    const loaded = await this.loadRun(runId);
    this.requireCounterfactualActor(
      principal,
      loaded.state.learnerUserId,
    );
    return this.professionalMetrics(loaded.state);
  }

  private professionalMetrics(
    state: GenericHostedRunState,
  ): Readonly<Record<string, number>> {
    const metrics: Record<string, number> = {};
    for (const node of this.scenario.nodes) {
      if (node.nodeType !== "DECISION") continue;
      const submission = state.decisions[node.decisionId];
      if (submission === undefined) continue;
      for (const field of node.fields) {
        const selected = submission.responses[field.fieldId] ?? [];
        for (const optionId of selected) {
          const option = field.options.find(
            (candidate) => candidate.optionId === optionId,
          );
          if (option === undefined) {
            throw new HostedRunCommandError(
              "PACK_CONTRACT_MISMATCH",
              `Decision ${node.decisionId} references unknown option ${optionId}.`,
            );
          }
          for (const [metricId, effect] of Object.entries(
            option.professionalConsequenceEffects ?? {},
          )) {
            metrics[metricId] = (metrics[metricId] ?? 0) + effect;
          }
        }
      }
    }
    for (const release of state.releasedInstructorIncidents) {
      const incident = this.scenario.instructorIncidents.find(
        (candidate) => candidate.incidentId === release.incidentId,
      );
      if (incident === undefined) {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "A released instructor incident is absent from the exact scenario.",
        );
      }
      for (const [metricId, effect] of Object.entries(
        incident.professionalConsequenceEffects,
      )) {
        metrics[metricId] = (metrics[metricId] ?? 0) + effect;
      }
    }
    return metrics;
  }

  async instructorTimeline(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly InstructorTimelineItem[]> {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const events = await this.eventStore.load(runId);
    if (events.length === 0) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        `Run ${runId} does not exist.`,
      );
    }
    return events.map((event) => ({
      sequenceNumber: event.sequenceNumber,
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.serverTimestampUtc,
      authenticatedUserId: event.authenticatedUserId,
      simulationActorId: event.simulationActorId,
      organizationId: event.organizationId,
      roleId: event.roleId,
      causationId: event.causationId,
      payload: structuredClone(event.payload),
    }));
  }

  async instructorMonitor(
    principal: ApplicationPrincipal | null,
    runId: string,
    observedAt = this.clock.now(),
  ): Promise<HostedRunMonitorStatusV1> {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const events = await this.eventStore.load(runId);
    const first = events[0];
    const last = events.at(-1);
    if (first === undefined || last === undefined) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        `Run ${runId} does not exist.`,
      );
    }
    const state = this.replay(events);
    const observedAtMs = Date.parse(observedAt);
    const startedAtMs = Date.parse(first.serverTimestampUtc);
    const lastAtMs = Date.parse(last.serverTimestampUtc);
    if (
      !Number.isFinite(observedAtMs) ||
      !Number.isFinite(startedAtMs) ||
      !Number.isFinite(lastAtMs)
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Monitor timestamps must be valid.",
      );
    }
    const projection = projectRunStateForRole(
      this.toProjectionState(state),
      state.activeTrustedContext.roleId,
    );
    return {
      runId: state.runId,
      learnerUserId: state.learnerUserId,
      status: state.status,
      eventCount: events.length,
      currentStageId: projection.workflowState.currentNodeId,
      activeRoleId: projection.roleId,
      elapsedSeconds: Math.max(
        0,
        Math.floor(
          ((state.status === "completed"
            ? lastAtMs
            : Math.max(lastAtMs, observedAtMs)) -
            startedAtMs) /
            1_000,
        ),
      ),
      lastActivityAt: last.serverTimestampUtc,
      pendingActionIds:
        projection.workflowState.permittedActionIds,
      technicalStatus: "ok",
    };
  }

  async instructorReplay(
    principal: ApplicationPrincipal | null,
    runId: string,
    throughSequenceNumber?: number,
  ): Promise<InstructorRunReplayV1> {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const events = await this.eventStore.load(runId);
    if (events.length === 0) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        `Run ${runId} does not exist.`,
      );
    }
    const sequenceNumber = throughSequenceNumber ?? events.length;
    if (
      !Number.isInteger(sequenceNumber) ||
      sequenceNumber < 1 ||
      sequenceNumber > events.length
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `Replay sequence must be between 1 and ${String(events.length)}.`,
      );
    }
    const bounded = events.slice(0, sequenceNumber);
    const selected = bounded.at(-1);
    if (selected === undefined) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Replay requires at least one event.",
      );
    }
    const state = this.replay(bounded);
    return {
      schemaVersion: "1.0.0",
      runId: state.runId,
      assignmentId: state.assignmentId,
      learnerUserId: state.learnerUserId,
      packId: state.packId,
      packVersion: state.packVersion,
      scenarioId: state.scenarioId,
      scenarioVersion: state.scenarioVersion,
      throughSequenceNumber: sequenceNumber,
      totalEventCount: events.length,
      selectedEvent: {
        sequenceNumber: selected.sequenceNumber,
        eventId: selected.eventId,
        eventType: selected.eventType,
        occurredAt: selected.serverTimestampUtc,
        authenticatedUserId: selected.authenticatedUserId,
        simulationActorId: selected.simulationActorId,
        organizationId: selected.organizationId,
        roleId: selected.roleId,
        causationId: selected.causationId,
        resultingStateHash: selected.resultingStateHash,
      },
      projection: {
        ...projectRunStateForRole(
          this.toProjectionState(state),
          state.activeTrustedContext.roleId,
        ),
        staffProfile: staffProfileProjection(
          this.pack,
          this.scenario,
          state.activeTrustedContext.roleId,
        ),
        presentation: this.presentation(state),
      },
    };
  }

  async instructorDecisionOutcomeEvidence(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<HostedRunDecisionOutcomeEvidenceV1> {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const state = await this.loadState(runId);
    if (state.status === "active") {
      return {
        runId: state.runId,
        learnerUserId: state.learnerUserId,
        status: "active",
        decisionItems: [],
        realizedOutcome: null,
      };
    }
    return {
      runId: state.runId,
      learnerUserId: state.learnerUserId,
      status: "completed",
      decisionItems: [],
      realizedOutcome:
        state.outcomeResolution === null
          ? null
          : {
              outcomeModelId:
                state.outcomeResolution.outcomeModelId,
              strategy: state.outcomeResolution.strategy,
              outcomeCode: state.outcomeResolution.outcomeCode,
            },
    };
  }

  async competencyReport(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly CompetencyEvidenceProjection[]> {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    return competencyEvidenceProjection(await this.loadState(runId));
  }

  async learnerCompetencyEvidence(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly CompetencyEvidenceProjection[]> {
    const state = await this.loadState(runId);
    requireAssignedLearner(principal, state.learnerUserId);
    return competencyEvidenceProjection(state);
  }

  async learnerAuthoredFeedback(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly LearnerRunAuthoredFeedbackV1[]> {
    const state = await this.loadState(runId);
    requireAssignedLearner(principal, state.learnerUserId);
    if (state.status !== "completed") return [];
    return state.workflowState.completedNodeIds.flatMap((nodeId) => {
      const node = this.scenario.nodes.find(
        (candidate) => candidate.nodeId === nodeId,
      );
      return node?.nodeType === "FEEDBACK"
        ? [
            {
              feedbackCode: node.feedbackCode,
              title: this.localizedText(
                node.title.localizationKey,
              ),
              message: this.localizedText(
                node.message.localizationKey,
              ),
            },
          ]
        : [];
    });
  }

  async rubricEvidence(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly RubricEvidenceProjection[]> {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const state = await this.loadState(runId);
    return this.scenario.rubricIds.flatMap((rubricId) => {
      const rubric = this.pack.rubrics.find(
        (candidate) => candidate.rubricId === rubricId,
      );
      if (rubric === undefined) return [];
      return rubric.criteria.map((criterion) => {
        const observed = state.competencyEvidence.filter(
          (evidence) =>
            criterion.evidenceRuleIds.includes(
              evidence.evidenceRuleId,
            ),
        );
        return {
          rubricId,
          rubricVersion: rubric.version,
          criterionId: criterion.criterionId,
          allowedLevelValues: rubric.levels.map(
            (level) => level.value,
          ),
          evidenceRuleIds: criterion.evidenceRuleIds,
          observedEvidenceIds: observed.map(
            (evidence) => evidence.competencyEvidenceId,
          ),
          status:
            observed.length > 0
              ? ("observed" as const)
              : ("not-observed" as const),
        };
      });
    });
  }

  async loadState(runId: string): Promise<GenericHostedRunState> {
    return (await this.loadRun(runId)).state;
  }

  private async loadRun(runId: string): Promise<LoadedGenericRun> {
    if (this.counterfactualBranches !== undefined) {
      try {
        const replay =
          await this.counterfactualBranches.reconstructBranch(
            runId,
            this.counterfactualAdapter(),
          );
        const startedAt =
          replay.sourcePrefixEvents[0]?.serverTimestampUtc;
        if (startedAt === undefined) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "A counterfactual source must retain its creation event.",
          );
        }
        return {
          state: replay.currentState,
          commandEvents: replay.branchSuffixEvents,
          startedAt,
          isCounterfactual: true,
        };
      } catch (error) {
        if (
          !(error instanceof CounterfactualBranchError) ||
          error.code !== "COUNTERFACTUAL_BRANCH_NOT_FOUND"
        ) {
          throw error;
        }
      }
    }
    const events = await this.eventStore.load(runId);
    const startedAt = events[0]?.serverTimestampUtc;
    if (startedAt === undefined) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        `Run ${runId} does not exist.`,
      );
    }
    return {
      state: this.replay(events),
      commandEvents: events,
      startedAt,
      isCounterfactual: false,
    };
  }

  private counterfactualAdapter(): CounterfactualBranchRuntimeAdapter<GenericHostedRunState> {
    return {
      replaySourcePrefix: (events) => this.replay(events),
      forkState: (sourceState, metadata) =>
        this.forkCounterfactualState(sourceState, metadata),
      replayBranchSuffix: (forkState, events) =>
        this.replayFromCounterfactualFork(forkState, events),
      stateForHash: (state) => state,
      informationStateForHash: (state, roleId) =>
        projectRunStateForRole(this.toProjectionState(state), roleId),
    };
  }

  private forkCounterfactualState(
    sourceState: Readonly<GenericHostedRunState>,
    metadata: CounterfactualRunMetadataV1,
  ): GenericHostedRunState {
    if (metadata.counterfactualType === "CONDITION") {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "This generic scenario has no authored runtime condition adapter.",
      );
    }
    if (
      sourceState.activeTrustedContext.actorId !==
        metadata.forkActorId ||
      sourceState.activeTrustedContext.organizationId !==
        metadata.forkOrganizationId ||
      sourceState.activeTrustedContext.roleId !== metadata.forkRoleId
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The source state does not retain the trusted context at the fork.",
      );
    }
    return this.withWorkflowPermissions({
      ...structuredClone(sourceState),
      runId: metadata.branchRunId,
      version: 0,
    });
  }

  private replayFromCounterfactualFork(
    forkState: Readonly<GenericHostedRunState>,
    events: readonly RunEventV1[],
  ): GenericHostedRunState {
    const state = replayRunEvents<GenericHostedRunState | null>(
      structuredClone(forkState),
      events,
      (current, event) => this.applyEvent(current, event),
    );
    if (state === null) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "A counterfactual suffix unexpectedly removed run state.",
      );
    }
    return state;
  }

  private requireCounterfactualActor(
    principal: ApplicationPrincipal | null,
    learnerUserId: string,
  ): ApplicationPrincipal {
    const actor = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "administrator",
    ]);
    return actor.roles.includes("learner")
      ? requireAssignedLearner(actor, learnerUserId)
      : actor;
  }

  private replay(events: readonly RunEventV1[]): GenericHostedRunState {
    const state = replayRunEvents<GenericHostedRunState | null>(
      null,
      events,
      (current, event) => this.applyEvent(current, event),
    );
    if (state === null) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        "Run event stream did not create a run.",
      );
    }
    return state;
  }

  private applyEvent(
    current: Readonly<GenericHostedRunState | null>,
    event: RunEventV1,
  ): GenericHostedRunState | null {
    if (
      event.packId !== this.pack.packId ||
      event.packVersion !== this.pack.version ||
      event.scenarioId !== this.scenario.scenarioId ||
      event.scenarioVersion !== this.scenario.version ||
      (current !== null && event.runId !== current.runId)
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Run event does not match the exact pack, scenario, or run.",
      );
    }
    switch (event.eventType) {
      case "RUN_CREATED": {
        if (current !== null) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "RUN_CREATED must be the first event.",
          );
        }
        const mode = requiredString(event.payload.mode, "mode");
        if (
          mode !== "tutorial" &&
          mode !== "standard" &&
          mode !== "sandbox" &&
          mode !== "configured"
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Run event contains an unsupported mode.",
          );
        }
        const request: CreateGenericHostedRunRequest = {
          commandId: event.causationId,
          runId: event.runId,
          assignmentId: requiredString(
            event.payload.assignmentId,
            "assignmentId",
          ),
          learnerUserId: requiredString(
            event.payload.learnerUserId,
            "learnerUserId",
          ),
          mode,
          modeConfiguration: validateHostedModeConfiguration(
            event.payload.modeConfiguration,
            mode,
          ),
          scenarioSeed: requiredString(
            event.payload.scenarioSeed,
            "scenarioSeed",
          ),
        };
        const resolved = this.resolveModeAndOutcome(request);
        try {
          assertHostedExperienceIdentity({
            configuration:
              event.payload.experienceConfiguration,
            configurationHash: requiredString(
              event.payload.experienceConfigurationHash,
              "experienceConfigurationHash",
            ),
            expected: resolved.experience,
          });
        } catch (error) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            error instanceof Error
              ? error.message
              : "Run experience evidence is invalid.",
          );
        }
        if (
          resolved.scenarioSeed !== request.scenarioSeed ||
          requiredString(
            event.payload.packContentHash,
            "packContentHash",
          ) !== this.packContentHash()
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Run creation evidence does not match the published pack.",
          );
        }
        const context = this.trustedContextFor(request.learnerUserId);
        if (
          event.simulationActorId !== context.actorId ||
          event.organizationId !== context.organizationId ||
          event.roleId !== context.roleId
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Run context does not match the scenario-controlled role.",
          );
        }
        const state: GenericHostedRunState = {
          schemaVersion: "1.2.0",
          runtimeKind: "generic-v1",
          runId: request.runId,
          assignmentId: request.assignmentId,
          learnerUserId: request.learnerUserId,
          packId: event.packId,
          packVersion: event.packVersion,
          packContentHash: this.packContentHash(),
          scenarioId: event.scenarioId,
          scenarioVersion: event.scenarioVersion,
          mode,
          modeConfiguration: resolved.modeConfiguration,
          experienceConfiguration:
            resolved.experience.configuration,
          experienceConfigurationHash:
            resolved.experience.configurationHash,
          scenarioSeed: resolved.scenarioSeed,
          outcomeResolution: resolved.outcomeResolution,
          activeTrustedContext: context,
          version: event.sequenceNumber,
          status: "active",
          actualState: structuredClone(
            this.scenario.initialState.actualState,
          ),
          businessState: structuredClone(
            this.scenario.initialState.businessState,
          ),
          ledgerState: structuredClone(
            this.scenario.initialState.ledgerState,
          ),
          releasedEvidenceIds: [],
          inspectedEvidenceIds: [],
          consultedPolicyIds: [],
          evidenceRequests: [],
          releasedInstructorIncidents: [],
          decisions: {},
          competencyEvidence: [],
          workflowState: {
            currentNodeId: this.scenario.entryNodeId,
            completedNodeIds: [],
            permittedActionIdsByRole: {},
          },
          rngState: {
            seed: resolved.scenarioSeed,
            streamPosition: 0,
            recordedDraws: [],
          },
        };
        return this.withWorkflowPermissions(state);
      }
      case "RANDOM_DRAW_MADE": {
        const state = this.stateOrThrow(current);
        const resolution = state.outcomeResolution;
        if (
          resolution === null ||
          resolution.strategy !== "probabilistic" ||
          resolution.draw === undefined ||
          state.rngState.recordedDraws.length !== 0 ||
          event.payload.draw !== resolution.draw ||
          event.payload.outcomeModelId !==
            resolution.outcomeModelId ||
          event.payload.drawKey !== resolution.drawKey
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Random draw does not match deterministic replay.",
          );
        }
        return this.updateState(state, event, {
          rngState: {
            seed: state.rngState.seed,
            streamPosition: 1,
            recordedDraws: [resolution.draw],
          },
        });
      }
      case "OUTCOME_REALIZED": {
        const state = this.stateOrThrow(current);
        if (
          state.outcomeResolution === null ||
          event.payload.outcomeModelId !==
            state.outcomeResolution.outcomeModelId ||
          event.payload.outcomeCode !==
            state.outcomeResolution.outcomeCode
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Realized outcome does not match deterministic replay.",
          );
        }
        return this.updateState(state, event, {});
      }
      case "INSTRUCTOR_INCIDENT_RELEASED": {
        const state = this.stateOrThrow(current);
        const incidentId = requiredString(
          event.payload.incidentId,
          "incidentId",
        );
        const incident = this.scenario.instructorIncidents.find(
          (candidate) => candidate.incidentId === incidentId,
        );
        const evidenceIds = stringArray(
          event.payload.evidenceIds,
          "evidenceIds",
        );
        if (
          incident === undefined ||
          event.payload.incidentVersion !== incident.version ||
          !incident.releaseAtNodeIds.includes(
            state.workflowState.currentNodeId,
          ) ||
          !incident.visibleToRoleIds.includes(
            state.activeTrustedContext.roleId,
          ) ||
          canonicalize(evidenceIds) !==
            canonicalize(incident.evidenceIds) ||
          state.releasedInstructorIncidents.some(
            (candidate) => candidate.incidentId === incidentId,
          )
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Instructor incident evidence does not match the exact scenario and workflow state.",
          );
        }
        return this.updateState(state, event, {
          releasedEvidenceIds: [
            ...new Set([
              ...state.releasedEvidenceIds,
              ...incident.evidenceIds,
            ]),
          ],
          releasedInstructorIncidents: [
            ...state.releasedInstructorIncidents,
            {
              incidentId,
              releasedAt: event.serverTimestampUtc,
              releasedByUserId: event.authenticatedUserId,
            },
          ],
        });
      }
      case "WORKFLOW_ADVANCED": {
        const state = this.stateOrThrow(current);
        const currentNode = this.currentNode(state);
        const fromNodeId = requiredString(
          event.payload.fromNodeId,
          "fromNodeId",
        );
        const toNodeId = requiredString(
          event.payload.toNodeId,
          "toNodeId",
        );
        const transitionId = requiredString(
          event.payload.transitionId,
          "transitionId",
        );
        const transition = currentNode.transitions.find(
          (candidate) =>
            candidate.transitionId === transitionId &&
            candidate.toNodeId === toNodeId,
        );
        if (
          fromNodeId !== currentNode.nodeId ||
          transition === undefined ||
          !this.transitionMatches(transition, state) ||
          !this.scenario.nodes.some(
            (candidate) => candidate.nodeId === toNodeId,
          )
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Workflow transition is not valid for the reconstructed state.",
          );
        }
        return this.updateState(state, event, {
          workflowState: {
            currentNodeId: toNodeId,
            completedNodeIds: [
              ...state.workflowState.completedNodeIds,
              currentNode.nodeId,
            ],
            permittedActionIdsByRole: {},
          },
        });
      }
      case "EVIDENCE_REQUESTED": {
        const state = this.stateOrThrow(current);
        const evidenceId = requiredString(
          event.payload.evidenceId,
          "evidenceId",
        );
        const evidence = this.requestableEvidence(state).find(
          (candidate) => candidate.evidenceId === evidenceId,
        );
        if (evidence === undefined) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Evidence request is not permitted by the exact scenario and run state.",
          );
        }
        const delayMinutes =
          evidence.learnerMetadata.access.delayMinutes;
        const costUnits =
          evidence.learnerMetadata.access.costUnits;
        const simulatedAvailableAt = addMinutes(
          event.serverTimestampUtc,
          delayMinutes,
        );
        const permissionPolicyId =
          evidence.learnerMetadata.access.permissionPolicyId;
        if (
          event.payload.delayMinutes !== delayMinutes ||
          event.payload.costUnits !== costUnits ||
          event.payload.simulatedAvailableAt !==
            simulatedAvailableAt ||
          event.payload.permissionPolicyId !== permissionPolicyId
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Evidence request terms do not match the exact scenario.",
          );
        }
        return this.updateState(state, event, {
          evidenceRequests: [
            ...state.evidenceRequests,
            {
              evidenceId,
              requestEventId: event.eventId,
              requestSequenceNumber: event.sequenceNumber,
              requestCommandId: event.causationId,
              requestedAt: event.serverTimestampUtc,
              simulatedAvailableAt,
              delayMinutes,
              costUnits,
              ...(permissionPolicyId === undefined
                ? {}
                : { permissionPolicyId }),
            },
          ],
        });
      }
      case "EVIDENCE_RELEASED": {
        const state = this.stateOrThrow(current);
        const node = this.currentNode(state);
        const evidenceId = requiredString(
          event.payload.evidenceId,
          "evidenceId",
        );
        const evidence = this.scenario.evidenceItems.find(
          (candidate) => candidate.evidenceId === evidenceId,
        );
        const releaseReason = requiredString(
          event.payload.releaseReason,
          "releaseReason",
        );
        const workflowRelease =
          releaseReason === "WORKFLOW" &&
          node.nodeType === "EVIDENCE_RELEASE" &&
          node.evidenceIds.includes(evidenceId) &&
          evidence?.learnerMetadata.access.acquisitionMode ===
            "AVAILABLE";
        const request = state.evidenceRequests.find(
          (candidate) =>
            candidate.evidenceId === evidenceId &&
            candidate.requestEventId ===
              event.payload.requestEventId,
        );
        const requestedRelease =
          releaseReason === "REQUEST_FULFILLED" &&
          request !== undefined &&
          request.requestSequenceNumber + 1 ===
            event.sequenceNumber &&
          request.requestCommandId === event.causationId &&
          event.payload.simulatedAvailableAt ===
            request.simulatedAvailableAt;
        if (
          evidence === undefined ||
          (!workflowRelease && !requestedRelease) ||
          state.releasedEvidenceIds.includes(evidenceId)
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Evidence release is invalid for the current node.",
          );
        }
        return this.updateState(state, event, {
          releasedEvidenceIds: [
            ...state.releasedEvidenceIds,
            evidenceId,
          ],
        });
      }
      case "EVIDENCE_INSPECTED": {
        const state = this.stateOrThrow(current);
        const evidenceId = requiredString(
          event.payload.evidenceId,
          "evidenceId",
        );
        const evidence = this.scenario.evidenceItems.find(
          (candidate) => candidate.evidenceId === evidenceId,
        );
        if (
          evidence === undefined ||
          !state.releasedEvidenceIds.includes(evidenceId) ||
          !evidence.visibleToRoleIds.includes(
            state.activeTrustedContext.roleId,
          )
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Inspected evidence was not available to the active role.",
          );
        }
        return this.updateState(state, event, {
          inspectedEvidenceIds:
            state.inspectedEvidenceIds.includes(evidenceId)
              ? state.inspectedEvidenceIds
              : [...state.inspectedEvidenceIds, evidenceId],
        });
      }
      case "POLICY_CONSULTED": {
        const state = this.stateOrThrow(current);
        const policyId = requiredString(
          event.payload.policyId,
          "policyId",
        );
        const policy = this.consultablePolicies(state).find(
          (candidate) => candidate.policyId === policyId,
        );
        if (policy === undefined) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Consulted policy was not available in the exact scenario and workflow state.",
          );
        }
        return this.updateState(state, event, {
          consultedPolicyIds: [
            ...state.consultedPolicyIds,
            policyId,
          ],
        });
      }
      case "DECISION_SUBMITTED": {
        const state = this.stateOrThrow(current);
        const node = this.currentNode(state);
        if (node.nodeType !== "DECISION") {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Decision evidence occurred outside a decision node.",
          );
        }
        const decisionId = requiredString(
          event.payload.decisionId,
          "decisionId",
        );
        const decision: GenericDecisionSubmission = {
          decisionId,
          responses: decisionResponses(event.payload.responses),
          justification:
            typeof event.payload.justification === "string"
              ? event.payload.justification
              : "",
          citedEvidenceIds: stringArray(
            event.payload.citedEvidenceIds,
            "citedEvidenceIds",
          ),
          citedPolicyIds: stringArray(
            event.payload.citedPolicyIds,
            "citedPolicyIds",
          ),
          confidenceRating:
            typeof event.payload.confidenceRating === "number"
              ? event.payload.confidenceRating
              : null,
          adverseEventProbabilityPercent:
            typeof event.payload.adverseEventProbabilityPercent ===
            "number"
              ? event.payload.adverseEventProbabilityPercent
              : null,
          submittedAt: event.serverTimestampUtc,
        };
        this.validateDecisionRecord(decision, node, state);
        return this.updateState(state, event, {
          decisions: {
            ...state.decisions,
            [decisionId]: decision,
          },
        });
      }
      case "COMPETENCY_EVIDENCE_RECORDED": {
        const state = this.stateOrThrow(current);
        const evidenceRuleId = requiredString(
          event.payload.evidenceRuleId,
          "evidenceRuleId",
        );
        const rule = this.pack.evidenceRules.find(
          (candidate) =>
            candidate.evidenceRuleId === evidenceRuleId,
        );
        const indicatorIds = stringArray(
          event.payload.indicatorIds,
          "indicatorIds",
        );
        const sourceEventIds = stringArray(
          event.payload.sourceEventIds,
          "sourceEventIds",
        );
        if (
          rule === undefined ||
          canonicalize(indicatorIds) !==
            canonicalize(rule.indicatorIds) ||
          sourceEventIds.length === 0
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Competency evidence does not match its authored rule.",
          );
        }
        const evidence: HostedCompetencyEvidence = {
          competencyEvidenceId: requiredString(
            event.payload.competencyEvidenceId,
            "competencyEvidenceId",
          ),
          evidenceRuleId,
          indicatorIds,
          sourceEventIds,
          observedAt: event.serverTimestampUtc,
        };
        return this.updateState(state, event, {
          competencyEvidence: [
            ...state.competencyEvidence,
            evidence,
          ],
        });
      }
      case "RUN_COMPLETED": {
        const state = this.stateOrThrow(current);
        const node = this.currentNode(state);
        if (
          node.nodeType !== "COMPLETION" ||
          event.payload.outcomeCode !== node.outcomeCode
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Run completion does not match the authored completion node.",
          );
        }
        return this.updateState(state, event, {
          status: "completed",
          workflowState: {
            ...state.workflowState,
            permittedActionIdsByRole: {},
          },
        });
      }
      case "RUN_TIME_LIMIT_EXCEEDED":
        return this.updateState(this.stateOrThrow(current), event, {});
      default:
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          `Event type ${event.eventType} is not supported by the generic runtime.`,
        );
    }
  }

  private buildEvent(options: {
    readonly runId: string;
    readonly state: GenericHostedRunState | null;
    readonly principal: ApplicationPrincipal;
    readonly context: TrustedExecutionContext;
    readonly commandId: string;
    readonly commandDigest: string;
    readonly batchIndex: number;
    readonly eventType: PlatformRunEventType;
    readonly serverTimestampUtc?: string;
    readonly payload: JsonObject;
  }): BuiltEvent {
    if (
      options.state !== null &&
      options.state.runId !== options.runId
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "An event cannot be appended to a different run.",
      );
    }
    return this.buildEventForRun(options.runId, options);
  }

  private buildEventForRun(
    runId: string,
    options: {
      readonly state: GenericHostedRunState | null;
      readonly principal: ApplicationPrincipal;
      readonly context: TrustedExecutionContext;
      readonly commandId: string;
      readonly commandDigest: string;
      readonly batchIndex: number;
      readonly eventType: PlatformRunEventType;
      readonly serverTimestampUtc?: string;
      readonly payload: JsonObject;
    },
  ): BuiltEvent {
    const sequenceNumber = (options.state?.version ?? 0) + 1;
    const payload: JsonObject = {
      ...options.payload,
      requestDigest: options.commandDigest,
    };
    const unsequenced: UnsequencedRunEventV1 = {
      eventId: this.ids.nextId("HEVT"),
      runId,
      idempotencyKey: `${options.commandId}:${String(options.batchIndex)}`,
      serverTimestampUtc:
        options.serverTimestampUtc ?? this.clock.now(),
      authenticatedUserId: options.principal.userId,
      simulationActorId: options.context.actorId,
      organizationId: options.context.organizationId,
      roleId: options.context.roleId,
      eventType: options.eventType,
      packId: this.pack.packId,
      packVersion: this.pack.version,
      scenarioId: this.scenario.scenarioId,
      scenarioVersion: this.scenario.version,
      payload,
      causationId: options.commandId,
      correlationId: runId,
      previousStateHash: hashReplayState(options.state),
      resultingStateHash: "",
    };
    const placeholder: RunEventV1 = {
      ...unsequenced,
      schemaVersion: "1.0.0",
      sequenceNumber,
    };
    const nextState = this.applyEvent(options.state, placeholder);
    if (nextState === null) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "A generic event unexpectedly removed run state.",
      );
    }
    const completed = {
      ...unsequenced,
      resultingStateHash: hashReplayState(nextState),
    };
    return {
      unsequenced: completed,
      sequenced: {
        ...completed,
        schemaVersion: "1.0.0",
        sequenceNumber,
      },
      nextState,
    };
  }

  private appendPassiveNodeEvents(options: {
    state: GenericHostedRunState;
    readonly built: BuiltEvent[];
    readonly principal: ApplicationPrincipal;
    readonly context: TrustedExecutionContext;
    readonly commandId: string;
    readonly commandDigest: string;
  }): GenericHostedRunState {
    let state = options.state;
    while (state.status === "active") {
      const node = this.currentNode(state);
      if (node.nodeType === "EVIDENCE_RELEASE") {
        for (const evidenceId of node.evidenceIds) {
          if (state.releasedEvidenceIds.includes(evidenceId)) continue;
          const evidence = this.scenario.evidenceItems.find(
            (candidate) => candidate.evidenceId === evidenceId,
          );
          if (
            evidence?.learnerMetadata.access.acquisitionMode ===
            "REQUEST_REQUIRED"
          ) {
            continue;
          }
          const released = this.buildEventForRun(state.runId, {
            state,
            principal: options.principal,
            context: options.context,
            commandId: options.commandId,
            commandDigest: options.commandDigest,
            batchIndex: options.built.length,
            eventType: "EVIDENCE_RELEASED",
            payload: {
              evidenceId,
              releaseReason: "WORKFLOW",
            },
          });
          options.built.push(released);
          state = released.nextState;
        }
        const transition = this.nextTransition(node, state);
        const advanced = this.buildWorkflowAdvancedEvent({
          state,
          principal: options.principal,
          context: options.context,
          commandId: options.commandId,
          commandDigest: options.commandDigest,
          batchIndex: options.built.length,
          transition,
        });
        options.built.push(advanced);
        state = advanced.nextState;
        continue;
      }
      if (node.nodeType === "FEEDBACK") {
        const transition = this.nextTransition(node, state);
        const advanced = this.buildWorkflowAdvancedEvent({
          state,
          principal: options.principal,
          context: options.context,
          commandId: options.commandId,
          commandDigest: options.commandDigest,
          batchIndex: options.built.length,
          transition,
        });
        options.built.push(advanced);
        state = advanced.nextState;
        continue;
      }
      if (node.nodeType === "COMPLETION") {
        const completed = this.buildEventForRun(state.runId, {
          state,
          principal: options.principal,
          context: options.context,
          commandId: options.commandId,
          commandDigest: options.commandDigest,
          batchIndex: options.built.length,
          eventType: "RUN_COMPLETED",
          payload: { outcomeCode: node.outcomeCode },
        });
        options.built.push(completed);
        state = completed.nextState;
      }
      break;
    }
    return state;
  }

  private buildWorkflowAdvancedEvent(options: {
    readonly state: GenericHostedRunState;
    readonly principal: ApplicationPrincipal;
    readonly context: TrustedExecutionContext;
    readonly commandId: string;
    readonly commandDigest: string;
    readonly batchIndex: number;
    readonly transition: ScenarioTransitionV1;
  }): BuiltEvent {
    return this.buildEventForRun(options.state.runId, {
      state: options.state,
      principal: options.principal,
      context: options.context,
      commandId: options.commandId,
      commandDigest: options.commandDigest,
      batchIndex: options.batchIndex,
      eventType: "WORKFLOW_ADVANCED",
      payload: {
        fromNodeId: options.state.workflowState.currentNodeId,
        toNodeId: options.transition.toNodeId,
        transitionId: options.transition.transitionId,
      },
    });
  }

  private validateCreateRequest(
    request: CreateGenericHostedRunRequest,
  ): void {
    requiredString(request.commandId, "commandId");
    requiredString(request.runId, "runId");
    requiredString(request.assignmentId, "assignmentId");
    requiredString(request.learnerUserId, "learnerUserId");
    if (!this.scenario.supportedModes.includes(request.mode)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `Hosted mode ${request.mode} is not supported by this scenario.`,
      );
    }
  }

  private validateDecision(
    command: SubmitGenericDecisionCommand,
    node: DecisionNodeV1,
    state: GenericHostedRunState,
  ): GenericDecisionSubmission {
    const decision: GenericDecisionSubmission = {
      decisionId: requiredString(command.decisionId, "decisionId"),
      responses: decisionResponses(
        command.responses,
        "responses",
        "INVALID_COMMAND",
      ),
      justification:
        typeof command.justification === "string"
          ? command.justification
          : "",
      citedEvidenceIds:
        command.citedEvidenceIds === undefined
          ? []
          : stringArray(
              command.citedEvidenceIds,
              "citedEvidenceIds",
              "INVALID_COMMAND",
            ),
      citedPolicyIds:
        command.citedPolicyIds === undefined
          ? []
          : stringArray(
              command.citedPolicyIds,
              "citedPolicyIds",
              "INVALID_COMMAND",
            ),
      confidenceRating: command.confidenceRating ?? null,
      adverseEventProbabilityPercent:
        command.adverseEventProbabilityPercent ?? null,
      submittedAt: this.clock.now(),
    };
    this.validateDecisionRecord(decision, node, state);
    return decision;
  }

  private validateDecisionRecord(
    decision: GenericDecisionSubmission,
    node: DecisionNodeV1,
    state: GenericHostedRunState,
  ): void {
    if (
      decision.decisionId !== node.decisionId ||
      state.decisions[node.decisionId] !== undefined
    ) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "The decision does not match the active authored node.",
      );
    }
    const responseKeys = Object.keys(decision.responses).sort();
    const fieldKeys = node.fields
      .map((field) => field.fieldId)
      .sort();
    if (canonicalize(responseKeys) !== canonicalize(fieldKeys)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Decision responses must match the authored fields exactly.",
      );
    }
    for (const field of node.fields) {
      const selected = decision.responses[field.fieldId] ?? [];
      const validOptions = new Set(
        field.options.map((option) => option.optionId),
      );
      if (
        selected.length === 0 ||
        new Set(selected).size !== selected.length ||
        selected.some((optionId) => !validOptions.has(optionId)) ||
        (field.selection === "single" && selected.length !== 1)
      ) {
        throw new HostedRunCommandError(
          "INVALID_COMMAND",
          `Decision field ${field.fieldId} contains an invalid authored selection.`,
        );
      }
    }
    const justification = node.justification;
    if (
      (justification?.required === true &&
        decision.justification.trim().length === 0) ||
      (justification !== undefined &&
        decision.justification.length > justification.maximumLength)
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Decision justification does not meet the authored requirement.",
      );
    }
    this.validateCitations(
      decision.citedEvidenceIds,
      node.structuredResponse?.evidenceCitations,
      new Set(
        this.scenario.evidenceItems
          .filter(
            (evidence) =>
              state.releasedEvidenceIds.includes(
                evidence.evidenceId,
              ) &&
              evidence.visibleToRoleIds.includes(
                state.activeTrustedContext.roleId,
              ),
          )
          .map((evidence) => evidence.evidenceId),
      ),
      "evidence",
    );
    this.validateCitations(
      decision.citedPolicyIds,
      node.structuredResponse?.policyCitations,
      new Set(state.consultedPolicyIds),
      "policy",
    );
    this.validateNumericResponse(
      decision.confidenceRating,
      node.structuredResponse?.confidenceRating,
      "confidence rating",
    );
    this.validateNumericResponse(
      decision.adverseEventProbabilityPercent,
      node.structuredResponse?.adverseEventProbabilityPercent,
      "adverse-event probability",
    );
  }

  private validateCitations(
    values: readonly string[],
    configuration:
      | {
          readonly required: boolean;
          readonly minimumItems: number;
          readonly maximumItems: number;
        }
      | undefined,
    available: ReadonlySet<string>,
    label: string,
  ): void {
    if (
      new Set(values).size !== values.length ||
      values.some((value) => !available.has(value)) ||
      (configuration === undefined && values.length > 0) ||
      (configuration !== undefined &&
        (values.length > configuration.maximumItems ||
          values.length < configuration.minimumItems ||
          (configuration.required && values.length === 0)))
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `Decision ${label} citations do not meet the authored requirement.`,
      );
    }
  }

  private validateNumericResponse(
    value: number | null,
    configuration:
      | {
          readonly required: boolean;
          readonly minimum: number;
          readonly maximum: number;
        }
      | undefined,
    label: string,
  ): void {
    if (
      (configuration === undefined && value !== null) ||
      (configuration?.required === true && value === null) ||
      (value !== null &&
        (configuration === undefined ||
          !Number.isFinite(value) ||
          value < configuration.minimum ||
          value > configuration.maximum))
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `Decision ${label} does not meet the authored requirement.`,
      );
    }
  }

  private resolveModeAndOutcome(
    request: CreateGenericHostedRunRequest,
  ): {
    readonly modeConfiguration: ReturnType<
      typeof modeConfigurationFor
    >;
    readonly scenarioSeed: string;
    readonly outcomeResolution: StochasticOutcomeResolutionV1 | null;
    readonly experience: ReturnType<
      typeof resolveHostedExperienceConfiguration
    >;
  } {
    const authored = modeConfigurationFor(
      this.scenario,
      request.mode,
    );
    const modeConfiguration =
      request.modeConfiguration === undefined
        ? authored
        : validateHostedModeConfiguration(
            request.modeConfiguration,
            request.mode,
          );
    if (
      canonicalize(modeConfiguration) !== canonicalize(authored)
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Run mode behavior must match the exact published scenario.",
      );
    }
    const experience =
      resolveHostedExperienceConfiguration({
        packId: this.pack.packId,
        packVersion: this.pack.version,
        scenario: this.scenario,
        runtimeConfiguration: modeConfiguration,
        locale: this.pack.supportedLocales.includes("vi")
          ? "vi"
          : "en",
      });
    const scenarioSeed =
      modeConfiguration.seedPolicy === "generated"
        ? `generated:${sha256Hex(
            canonicalize({
              domain: "TRACECHAIN_GENERIC_HOSTED_SEED_V1",
              packContentHash: this.packContentHash(),
              assignmentId: request.assignmentId,
              runId: request.runId,
              commandId: request.commandId,
            }),
          )}`
        : requiredString(request.scenarioSeed, "scenarioSeed");
    if (modeConfiguration.outcomeModelId === undefined) {
      if (modeConfiguration.outcomeStrategy === "probabilistic") {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "Probabilistic mode requires an authored outcome model.",
        );
      }
      return {
        modeConfiguration,
        scenarioSeed,
        outcomeResolution: null,
        experience,
      };
    }
    const model = (this.scenario.outcomeModels ?? []).find(
      (candidate) =>
        candidate.outcomeModelId ===
        modeConfiguration.outcomeModelId,
    );
    if (model === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Mode configuration references a missing outcome model.",
      );
    }
    return {
      modeConfiguration,
      scenarioSeed,
      experience,
      outcomeResolution: resolveStochasticOutcome({
        model,
        scenarioVersion: this.scenario.version,
        scenarioSeed,
        occurrenceKey: "RUN_INITIAL_OUTCOME",
        relevantEntityId: request.assignmentId,
        strategy: modeConfiguration.outcomeStrategy,
        ...(modeConfiguration.outcomeStrategy === "forced"
          ? {
              forcedOutcomeCode: requiredString(
                modeConfiguration.forcedOutcomeCode,
                "forcedOutcomeCode",
              ),
            }
          : {}),
      }),
    };
  }

  private trustedContextFor(
    learnerUserId: string,
  ): TrustedExecutionContext {
    const role = this.scenario.roles[0];
    if (role === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Generic hosted scenarios require at least one role.",
      );
    }
    return {
      contextId: `CONTEXT_${learnerUserId}_${role.roleId}`,
      actorId: `ACTOR_${learnerUserId}`,
      organizationId: role.organizationId,
      roleId: role.roleId,
    };
  }

  private packContentHash(): string {
    const hash = this.pack.publication?.contentHash;
    if (hash === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Hosted runs require a published pack content hash.",
      );
    }
    return hash;
  }

  private currentNode(state: GenericHostedRunState): ScenarioNodeV1 {
    const node = this.scenario.nodes.find(
      (candidate) =>
        candidate.nodeId === state.workflowState.currentNodeId,
    );
    if (node === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Current workflow node is missing from the exact scenario.",
      );
    }
    return node;
  }

  private requestableEvidence(state: GenericHostedRunState) {
    if (
      state.status !== "active" ||
      !state.modeConfiguration.allowEvidenceRequests ||
      this.currentNode(state).nodeType !== "DECISION"
    ) {
      return [];
    }
    const offeredEvidenceIds = new Set(
      this.scenario.nodes.flatMap((node) =>
        node.nodeType === "EVIDENCE_RELEASE" &&
        state.workflowState.completedNodeIds.includes(node.nodeId)
          ? node.evidenceIds
          : [],
      ),
    );
    return this.scenario.evidenceItems.filter(
      (evidence) =>
        offeredEvidenceIds.has(evidence.evidenceId) &&
        evidence.learnerMetadata.access.acquisitionMode ===
          "REQUEST_REQUIRED" &&
        evidence.visibleToRoleIds.includes(
          state.activeTrustedContext.roleId,
        ) &&
        !state.releasedEvidenceIds.includes(evidence.evidenceId) &&
        !state.evidenceRequests.some(
          (request) =>
            request.evidenceId === evidence.evidenceId,
        ) &&
        this.evidenceRequestPolicyAllows(evidence, state),
    );
  }

  private consultablePolicies(
    state: GenericHostedRunState,
  ): readonly ScenarioPolicyV1[] {
    if (
      state.status !== "active" ||
      this.currentNode(state).nodeType !== "DECISION"
    ) {
      return [];
    }
    return [...this.scenario.policies]
      .filter(
        (policy) =>
          !state.consultedPolicyIds.includes(policy.policyId),
      )
      .sort((left, right) =>
        left.policyId.localeCompare(right.policyId),
      );
  }

  private evidenceRequestPolicyAllows(
    evidence: ScenarioDefinitionV1["evidenceItems"][number],
    state: GenericHostedRunState,
  ): boolean {
    const policyId =
      evidence.learnerMetadata.access.permissionPolicyId;
    if (policyId === undefined) return true;
    const policy = this.scenario.policies.find(
      (candidate) =>
        candidate.policyId === policyId &&
        candidate.policyType === "AUTHORIZATION",
    );
    if (policy === undefined) return false;
    const authorizedRoleId =
      policy.configuration.authorizedRoleId;
    const authorizedOrganizationId =
      policy.configuration.authorizedOrganizationId;
    return (
      (typeof authorizedRoleId === "string" ||
        typeof authorizedOrganizationId === "string") &&
      (authorizedRoleId === undefined ||
        authorizedRoleId ===
          state.activeTrustedContext.roleId) &&
      (authorizedOrganizationId === undefined ||
        authorizedOrganizationId ===
          state.activeTrustedContext.organizationId)
    );
  }

  private nextTransition(
    node: ScenarioNodeV1,
    state: GenericHostedRunState,
  ): ScenarioTransitionV1 {
    const transition = node.transitions.find((candidate) =>
      this.transitionMatches(candidate, state),
    );
    if (transition === undefined) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "No authored transition is available from the current node.",
      );
    }
    return transition;
  }

  private transitionMatches(
    transition: ScenarioTransitionV1,
    state: GenericHostedRunState,
  ): boolean {
    const condition = transition.when;
    if (condition.kind === "ALWAYS") return true;
    if (condition.kind === "DECISION_OPTION_SELECTED") {
      const decision = state.decisions[condition.decisionId];
      return (
        decision !== undefined &&
        Object.values(decision.responses).some((selected) =>
          selected.includes(condition.optionId),
        )
      );
    }
    return false;
  }

  private updateState(
    state: GenericHostedRunState,
    event: RunEventV1,
    patch: Partial<GenericHostedRunState>,
  ): GenericHostedRunState {
    return this.withWorkflowPermissions({
      ...state,
      ...patch,
      version: event.sequenceNumber,
    });
  }

  private withWorkflowPermissions(
    state: GenericHostedRunState,
  ): GenericHostedRunState {
    if (state.status === "completed") {
      return {
        ...state,
        workflowState: {
          ...state.workflowState,
          permittedActionIdsByRole: {},
        },
      };
    }
    const node = this.currentNode(state);
    let actions: readonly string[] = [];
    if (
      node.nodeType === "BRIEFING" ||
      node.nodeType === "CONSEQUENCE"
    ) {
      actions = ["ADVANCE_WORKFLOW"];
    } else if (node.nodeType === "DECISION") {
      const visibleUninspectedEvidenceExists =
        this.scenario.evidenceItems.some(
          (evidence) =>
            state.releasedEvidenceIds.includes(evidence.evidenceId) &&
            !state.inspectedEvidenceIds.includes(
              evidence.evidenceId,
            ) &&
            evidence.visibleToRoleIds.includes(
              state.activeTrustedContext.roleId,
            ),
        );
      actions = [
        ...(visibleUninspectedEvidenceExists
          ? ["INSPECT_EVIDENCE"]
          : []),
        ...(this.requestableEvidence(state).length > 0
          ? ["REQUEST_EVIDENCE"]
          : []),
        ...(this.consultablePolicies(state).length > 0
          ? ["CONSULT_POLICY"]
          : []),
        "SUBMIT_STRUCTURED_DECISION",
      ];
    }
    return {
      ...state,
      workflowState: {
        ...state.workflowState,
        permittedActionIdsByRole:
          actions.length === 0
            ? {}
            : {
                [state.activeTrustedContext.roleId]: actions,
              },
      },
    };
  }

  private stateOrThrow(
    state: Readonly<GenericHostedRunState | null>,
  ): GenericHostedRunState {
    if (state === null) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Run event occurred before RUN_CREATED.",
      );
    }
    return state;
  }

  private runTiming(
    state: GenericHostedRunState,
    startedAt: string,
    observedAt: string,
  ): NonNullable<LearnerRunProjectionV1["timing"]> {
    const startedAtMs = Date.parse(startedAt);
    const observedAtMs = Date.parse(observedAt);
    if (
      !Number.isFinite(startedAtMs) ||
      !Number.isFinite(observedAtMs)
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Run timing requires valid timestamps.",
      );
    }
    const normalizedStartedAt = new Date(startedAtMs).toISOString();
    const normalizedObservedAt = new Date(observedAtMs).toISOString();
    const timeLimitMinutes =
      state.modeConfiguration.timeLimitMinutes;
    if (timeLimitMinutes === undefined) {
      return {
        status:
          state.status === "completed" ? "completed" : "unlimited",
        startedAt: normalizedStartedAt,
        observedAt: normalizedObservedAt,
      };
    }
    const deadline = new Date(
      startedAtMs + timeLimitMinutes * 60_000,
    ).toISOString();
    return {
      status:
        state.status === "completed"
          ? "completed"
          : observedAtMs >= Date.parse(deadline)
            ? "expired"
            : "active",
      startedAt: normalizedStartedAt,
      observedAt: normalizedObservedAt,
      deadline,
      timeLimitMinutes,
    };
  }

  private toProjectionState(state: GenericHostedRunState) {
    const roleIds = this.scenario.roles.map((role) => role.roleId);
    const informationState: VisibleStateRecordV1[] =
      this.scenario.evidenceItems
        .filter((evidence) =>
          state.releasedEvidenceIds.includes(evidence.evidenceId),
        )
        .map((evidence) => ({
          recordId: evidence.evidenceId,
          visibleToRoleIds: evidence.visibleToRoleIds,
          value: {
            evidenceType: evidence.evidenceType,
            sourceOrganizationId: evidence.sourceOrganizationId,
            learnerMetadata: learnerEvidenceMetadataToJson(
              evidence.learnerMetadata,
            ),
            inspected: state.inspectedEvidenceIds.includes(
              evidence.evidenceId,
            ),
            ...(state.inspectedEvidenceIds.includes(
              evidence.evidenceId,
            )
              ? { content: evidence.content }
              : {}),
          },
        }));
    const policyState: VisibleStateRecordV1[] =
      this.scenario.policies
        .filter((policy) =>
          state.consultedPolicyIds.includes(policy.policyId),
        )
        .map((policy) => ({
          recordId: policy.policyId,
          visibleToRoleIds: roleIds,
          value: {
            policyType: policy.policyType,
            configuration: policy.configuration,
          },
        }));
    return {
      schemaVersion: "1.0.0" as const,
      runId: state.runId,
      version: state.version,
      actualState: state.actualState,
      businessState: visibleRecords(state.businessState, roleIds),
      ledgerState: state.ledgerState,
      informationState,
      policyState,
      workflowState: state.workflowState,
      rngState: state.rngState,
    };
  }

  private localizedText(
    localizationKey: string,
  ): LearnerRunLocalizedTextV1 {
    return {
      localizationKey,
      valuesByLocale: Object.fromEntries(
        this.pack.supportedLocales.flatMap((locale) => {
          const value =
            this.pack.localizationCatalogs?.[locale]?.[
              localizationKey
            ];
          return typeof value === "string" && value.length > 0
            ? [[locale, value]]
            : [];
        }),
      ),
    };
  }

  private presentation(
    state: GenericHostedRunState,
  ): LearnerRunPresentationV1 {
    const node = this.currentNode(state);
    const role = this.scenario.roles.find(
      (candidate) =>
        candidate.roleId === state.activeTrustedContext.roleId,
    );
    if (role === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Active role is missing from the exact scenario.",
      );
    }
    let currentNode: LearnerRunPresentationV1["currentNode"];
    if (node.nodeType === "BRIEFING") {
      currentNode = {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: this.localizedText(node.title.localizationKey),
        body: this.localizedText(node.body.localizationKey),
      };
    } else if (node.nodeType === "DECISION") {
      currentNode = {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: this.localizedText(node.title.localizationKey),
        decisionId: node.decisionId,
        prompt: this.localizedText(node.prompt.localizationKey),
        fields: node.fields.map((field) => ({
          fieldId: field.fieldId,
          prompt: this.localizedText(field.prompt.localizationKey),
          selection: field.selection,
          options: field.options.map((option) => ({
            optionId: option.optionId,
            label: this.localizedText(
              option.label.localizationKey,
            ),
          })),
        })),
        ...(node.justification === undefined
          ? {}
          : { justification: node.justification }),
        ...(node.structuredResponse === undefined
          ? {}
          : { structuredResponse: node.structuredResponse }),
      };
    } else if (node.nodeType === "CONSEQUENCE") {
      currentNode = {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: this.localizedText(node.title.localizationKey),
        consequenceCode: node.consequenceCode,
        message: this.localizedText(
          node.message.localizationKey,
        ),
      };
    } else if (node.nodeType === "FEEDBACK") {
      currentNode = {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: this.localizedText(node.title.localizationKey),
        feedbackCode: node.feedbackCode,
        message: this.localizedText(
          node.message.localizationKey,
        ),
      };
    } else if (
      node.nodeType === "EVIDENCE_RELEASE" ||
      node.nodeType === "COMPLETION"
    ) {
      currentNode = {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: this.localizedText(node.title.localizationKey),
      };
    } else {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Current node is outside the generic runtime subset.",
      );
    }
    return {
      scenarioTitle: this.localizedText(
        this.scenario.title.localizationKey,
      ),
      roleName: this.localizedText(
        role.displayName.localizationKey,
      ),
      currentNode,
      evidenceTitles: Object.fromEntries(
        this.scenario.evidenceItems
          .filter((evidence) =>
            [
              ...state.releasedEvidenceIds,
              ...this.requestableEvidence(state).map(
                (candidate) => candidate.evidenceId,
              ),
              ...state.evidenceRequests.map(
                (request) => request.evidenceId,
              ),
            ].includes(evidence.evidenceId),
          )
          .map((evidence) => [
            evidence.evidenceId,
            this.localizedText(evidence.title.localizationKey),
          ]),
      ),
      evidenceRequests: [
        ...this.requestableEvidence(state).map((evidence) => ({
          evidenceId: evidence.evidenceId,
          status: "REQUESTABLE" as const,
          learnerMetadata: learnerEvidenceMetadataToJson(
            evidence.learnerMetadata,
          ),
          delayMinutes:
            evidence.learnerMetadata.access.delayMinutes,
          costUnits: evidence.learnerMetadata.access.costUnits,
        })),
        ...state.evidenceRequests.flatMap((request) => {
          const evidence = this.scenario.evidenceItems.find(
            (candidate) =>
              candidate.evidenceId === request.evidenceId &&
              candidate.visibleToRoleIds.includes(
                state.activeTrustedContext.roleId,
              ),
          );
          return evidence === undefined
            ? []
            : [
                {
                  evidenceId: request.evidenceId,
                  status: "FULFILLED" as const,
                  learnerMetadata: learnerEvidenceMetadataToJson(
                    evidence.learnerMetadata,
                  ),
                  requestedAt: request.requestedAt,
                  simulatedAvailableAt:
                    request.simulatedAvailableAt,
                  delayMinutes: request.delayMinutes,
                  costUnits: request.costUnits,
                },
              ];
        }),
      ],
      policyTitles: Object.fromEntries(
        this.scenario.policies.map((policy) => [
          policy.policyId,
          this.localizedText(policy.title.localizationKey),
        ]),
      ),
      policyReferences: [...this.scenario.policies]
        .sort((left, right) =>
          left.policyId.localeCompare(right.policyId),
        )
        .map((policy) => ({
          policyId: policy.policyId,
          ...(state.consultedPolicyIds.includes(policy.policyId)
            ? {
                status: "CONSULTED" as const,
                learnerStatement: this.localizedText(
                  policy.learnerStatement.localizationKey,
                ),
              }
            : { status: "AVAILABLE" as const }),
        })),
      instructorIncidents: state.releasedInstructorIncidents.flatMap(
        (release) => {
          const incident = this.scenario.instructorIncidents.find(
            (candidate) =>
              candidate.incidentId === release.incidentId &&
              candidate.visibleToRoleIds.includes(
                state.activeTrustedContext.roleId,
              ),
          );
          return incident === undefined
            ? []
            : [
                {
                  incidentId: incident.incidentId,
                  title: this.localizedText(
                    incident.title.localizationKey,
                  ),
                  message: this.localizedText(
                    incident.message.localizationKey,
                  ),
                  releasedAt: release.releasedAt,
                },
              ];
        },
      ),
      professionalConsequences:
        this.scenario.counterfactualComparisonDimensions.flatMap(
          (dimension) => {
            const value =
              this.professionalMetrics(state)[
                dimension.evaluation.metricId
              ];
            return value === undefined
              ? []
              : [
                  {
                    dimensionId: dimension.dimensionId,
                    title: this.localizedText(
                      dimension.title.localizationKey,
                    ),
                    description: this.localizedText(
                      dimension.description.localizationKey,
                    ),
                    value,
                    ...(dimension.unit === undefined
                      ? {}
                      : { unit: dimension.unit }),
                    direction: dimension.direction,
                    diagnosticOnly: true as const,
                  },
                ];
          },
        ),
      modeConfiguration: state.modeConfiguration,
    };
  }
}
