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
  StochasticOutcomeModelV1,
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
  GenericCommittedTransactionRecord,
  GenericDecisionSubmission,
  GenericEndorsementRecord,
  GenericHostedCommand,
  GenericHostedRunResult,
  GenericHostedRunState,
  GenericPolicyEvaluationRecord,
  GenericTransactionProposalRecord,
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

    const permittedActions =
      state.workflowState.permittedActionIdsByRole[
        state.activeTrustedContext.roleId
      ] ?? [];
    if (!permittedActions.includes(command.commandType)) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "The command is not permitted at the current authored workflow node.",
      );
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
    } else if (
      command.commandType === "CREATE_TRANSACTION_PROPOSAL"
    ) {
      const node = this.currentNode(state);
      if (node.nodeType !== "TRANSACTION_PROPOSAL") {
        throw new HostedRunCommandError(
          "WORKFLOW_PRECONDITION_FAILED",
          "The current workflow node does not accept a transaction proposal.",
        );
      }
      const proposedAt = this.clock.now();
      const proposal = this.transactionProposalFor(
        node,
        state,
        context,
        proposedAt,
      );
      const proposed = this.buildEvent({
        runId: command.runId,
        state,
        principal: learner,
        context,
        commandId: command.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        eventType: "TRANSACTION_PROPOSED",
        serverTimestampUtc: proposedAt,
        payload: {
          proposalNodeId: proposal.proposalNodeId,
          proposalId: proposal.proposalId,
          proposalType: proposal.proposalType,
          sourceDecisionId: proposal.sourceDecisionId,
          policyIds: proposal.policyIds,
          sourceDecisionHash: proposal.sourceDecisionHash,
          proposalDigest: proposal.proposalDigest,
          expectedRunVersion: proposal.expectedRunVersion,
          eventCodes: [
            "TRANSACTION_PROPOSED",
            proposal.proposalType,
          ],
        },
      });
      built.push(proposed);
      state = proposed.nextState;
      const transition = this.nextTransition(node, state);
      const advanced = this.buildWorkflowAdvancedEvent({
        state,
        principal: learner,
        context: state.activeTrustedContext,
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
        context: state.activeTrustedContext,
        commandId: command.commandId,
        commandDigest: digest,
      });
    } else if (command.commandType === "RECORD_ENDORSEMENT") {
      const node = this.currentNode(state);
      if (
        node.nodeType !== "ENDORSEMENT" ||
        !node.permittedRoleIds.includes(context.roleId)
      ) {
        throw new HostedRunCommandError(
          "WORKFLOW_PRECONDITION_FAILED",
          "The active scenario-controlled role cannot endorse at this node.",
        );
      }
      const proposal =
        state.transactionProposals[node.proposalNodeId];
      const endorsementKey = this.endorsementKey(
        node.nodeId,
        context.roleId,
      );
      if (
        proposal === undefined ||
        state.endorsements[endorsementKey] !== undefined
      ) {
        throw new HostedRunCommandError(
          "WORKFLOW_PRECONDITION_FAILED",
          "The endorsement requires a pending authored proposal and a role that has not already approved it.",
        );
      }
      const endorsedAt = this.clock.now();
      const endorsed = this.buildEvent({
        runId: command.runId,
        state,
        principal: learner,
        context,
        commandId: command.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        eventType: "ENDORSEMENT_RECORDED",
        serverTimestampUtc: endorsedAt,
        payload: {
          endorsementNodeId: node.nodeId,
          proposalNodeId: node.proposalNodeId,
          proposalId: proposal.proposalId,
          proposalDigest: proposal.proposalDigest,
          policyId: node.policyId,
          assurance: "SCENARIO_APPROVAL_RECORD",
          eventCodes: [
            "ENDORSEMENT_RECORDED",
            node.policyId,
          ],
        },
      });
      built.push(endorsed);
      state = endorsed.nextState;
      const pendingRoleId =
        this.nextRequiredEndorsementRoleId(node, state);
      if (pendingRoleId !== undefined) {
        const nextContext = this.trustedContextForRole(
          state.learnerUserId,
          pendingRoleId,
        );
        const handoff = this.buildEventForRun(state.runId, {
          state,
          principal: learner,
          context: state.activeTrustedContext,
          commandId: command.commandId,
          commandDigest: digest,
          batchIndex: built.length,
          eventType: "ROLE_HANDOFF_COMPLETED",
          payload: {
            endorsementNodeId: node.nodeId,
            fromRoleId: state.activeTrustedContext.roleId,
            toRoleId: nextContext.roleId,
            toOrganizationId: nextContext.organizationId,
          },
        });
        built.push(handoff);
        state = handoff.nextState;
      } else {
        const transition = this.nextTransition(node, state);
        const transitionTarget = this.scenario.nodes.find(
          (candidate) =>
            candidate.nodeId === transition.toNodeId,
        );
        if (
          transitionTarget?.nodeType !== "POLICY_CHECK" ||
          transitionTarget.policyId !== node.policyId ||
          transitionTarget.proposalNodeId !== node.proposalNodeId
        ) {
          const policyNode = this.scenario.nodes.find(
            (
              candidate,
            ): candidate is Extract<
              ScenarioNodeV1,
              { readonly nodeType: "POLICY_CHECK" }
            > =>
              candidate.nodeType === "POLICY_CHECK" &&
              candidate.policyId === node.policyId &&
              candidate.proposalNodeId === node.proposalNodeId,
          );
          if (policyNode !== undefined) {
            state = this.appendPolicyEvaluationAndCommitEvents({
              state,
              built,
              principal: learner,
              context: state.activeTrustedContext,
              commandId: command.commandId,
              commandDigest: digest,
              node: policyNode,
            });
          }
        }
        const advanced = this.buildWorkflowAdvancedEvent({
          state,
          principal: learner,
          context: state.activeTrustedContext,
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
          context: state.activeTrustedContext,
          commandId: command.commandId,
          commandDigest: digest,
        });
      }
    } else if (
      command.commandType === "ACKNOWLEDGE_COMMUNICATION"
    ) {
      const node = this.currentNode(state);
      if (
        node.nodeType !== "COMMUNICATION" ||
        !node.visibleToRoleIds.includes(context.roleId) ||
        state.communications[node.nodeId] !== undefined
      ) {
        throw new HostedRunCommandError(
          "WORKFLOW_PRECONDITION_FAILED",
          "The authored communication is not available to the active role.",
        );
      }
      const acknowledgedAt = this.clock.now();
      const acknowledged = this.buildEvent({
        runId: command.runId,
        state,
        principal: learner,
        context,
        commandId: command.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        eventType: "COMMUNICATION_ACKNOWLEDGED",
        serverTimestampUtc: acknowledgedAt,
        payload: {
          communicationNodeId: node.nodeId,
          messageId: node.messageId,
          visibleToRoleIds: node.visibleToRoleIds,
          eventCodes: [
            "COMMUNICATION_ACKNOWLEDGED",
            node.messageId,
          ],
        },
      });
      built.push(acknowledged);
      state = acknowledged.nextState;
      const transition = this.nextTransition(node, state);
      const advanced = this.buildWorkflowAdvancedEvent({
        state,
        principal: learner,
        context: state.activeTrustedContext,
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
        context: state.activeTrustedContext,
        commandId: command.commandId,
        commandDigest: digest,
      });
    } else if (command.commandType === "SUBMIT_REFLECTION") {
      const node = this.currentNode(state);
      const reflectionId = requiredString(
        command.reflectionId,
        "reflectionId",
      );
      const response = requiredString(command.response, "response");
      if (
        node.nodeType !== "REFLECTION" ||
        reflectionId !== node.reflectionId ||
        response.length > node.maximumLength ||
        state.reflections[node.reflectionId] !== undefined
      ) {
        throw new HostedRunCommandError(
          "WORKFLOW_PRECONDITION_FAILED",
          "The reflection does not meet the active authored node.",
        );
      }
      const submittedAt = this.clock.now();
      const reflected = this.buildEvent({
        runId: command.runId,
        state,
        principal: learner,
        context,
        commandId: command.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        eventType: "REFLECTION_SUBMITTED",
        serverTimestampUtc: submittedAt,
        payload: {
          reflectionId,
          response,
          eventCodes: [
            "REFLECTION_SUBMITTED",
            reflectionId,
          ],
        },
      });
      built.push(reflected);
      state = reflected.nextState;
      const transition = this.nextTransition(node, state);
      const advanced = this.buildWorkflowAdvancedEvent({
        state,
        principal: learner,
        context: state.activeTrustedContext,
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
        context: state.activeTrustedContext,
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
      decisionItems: this.decisionAssessmentResults(state).map(
        (result) => ({
          decisionItemId: result.decisionItemId,
          isAuthoredCorrect: result.isAuthoredCorrect,
        }),
      ),
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

  async officialGrade(runId: string) {
    const state = await this.loadState(runId);
    if (state.status !== "completed") return null;
    const results = this.decisionAssessmentResults(state);
    if (results.length === 0) {
      return { gradingProgress: "PendingManual" as const };
    }
    const maximum = results.reduce(
      (sum, result) => sum + result.maximumPoints,
      0,
    );
    if (maximum !== 100) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Completed generic decision assessments must total 100 points.",
      );
    }
    return {
      gradingProgress: "FullyGraded" as const,
      scoreGiven: results.reduce(
        (sum, result) =>
          sum +
          (result.isAuthoredCorrect
            ? result.maximumPoints
            : 0),
        0,
      ),
      scoreMaximum: 100 as const,
    };
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
    if (
      current !== null &&
      (event.simulationActorId !==
        current.activeTrustedContext.actorId ||
        event.organizationId !==
          current.activeTrustedContext.organizationId ||
        event.roleId !== current.activeTrustedContext.roleId)
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Run event context does not match the active scenario-controlled role.",
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
          schemaVersion: "3.0.0",
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
          transactionProposals: {},
          endorsements: {},
          committedTransactions: {},
          policyEvaluations: [],
          communications: {},
          stochasticEvents: {},
          reflections: {},
          occurredEventTypes: ["RUN_CREATED"],
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
        const nextContext = this.trustedContextForNode(
          state.learnerUserId,
          this.scenario.nodes.find(
            (candidate) => candidate.nodeId === toNodeId,
          ),
          state.activeTrustedContext,
        );
        return this.updateState(state, event, {
          activeTrustedContext: nextContext,
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
      case "TRANSACTION_PROPOSED": {
        const state = this.stateOrThrow(current);
        const node = this.currentNode(state);
        if (node.nodeType !== "TRANSACTION_PROPOSAL") {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Transaction proposal evidence occurred outside its authored node.",
          );
        }
        const proposal = this.transactionProposalFor(
          node,
          state,
          state.activeTrustedContext,
          event.serverTimestampUtc,
        );
        const recorded = {
          proposalNodeId: event.payload.proposalNodeId,
          proposalId: event.payload.proposalId,
          proposalType: event.payload.proposalType,
          sourceDecisionId: event.payload.sourceDecisionId,
          policyIds: event.payload.policyIds,
          sourceDecisionHash: event.payload.sourceDecisionHash,
          proposalDigest: event.payload.proposalDigest,
          expectedRunVersion: event.payload.expectedRunVersion,
        };
        const expected = {
          proposalNodeId: proposal.proposalNodeId,
          proposalId: proposal.proposalId,
          proposalType: proposal.proposalType,
          sourceDecisionId: proposal.sourceDecisionId,
          policyIds: proposal.policyIds,
          sourceDecisionHash: proposal.sourceDecisionHash,
          proposalDigest: proposal.proposalDigest,
          expectedRunVersion: proposal.expectedRunVersion,
        };
        if (canonicalize(recorded) !== canonicalize(expected)) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Transaction proposal does not match the source decision and scenario state.",
          );
        }
        return this.updateState(state, event, {
          transactionProposals: {
            ...state.transactionProposals,
            [node.nodeId]: proposal,
          },
        });
      }
      case "ENDORSEMENT_RECORDED": {
        const state = this.stateOrThrow(current);
        const node = this.currentNode(state);
        const proposal =
          node.nodeType === "ENDORSEMENT"
            ? state.transactionProposals[node.proposalNodeId]
            : undefined;
        if (
          node.nodeType !== "ENDORSEMENT" ||
          proposal === undefined ||
          !node.permittedRoleIds.includes(
            state.activeTrustedContext.roleId,
          ) ||
          state.endorsements[
            this.endorsementKey(
              node.nodeId,
              state.activeTrustedContext.roleId,
            )
          ] !== undefined ||
          event.payload.endorsementNodeId !== node.nodeId ||
          event.payload.proposalNodeId !== node.proposalNodeId ||
          event.payload.proposalId !== proposal.proposalId ||
          event.payload.proposalDigest !== proposal.proposalDigest ||
          event.payload.policyId !== node.policyId ||
          event.payload.assurance !== "SCENARIO_APPROVAL_RECORD"
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Endorsement evidence does not match the exact proposal, policy, and trusted role.",
          );
        }
        const endorsement: GenericEndorsementRecord = {
          endorsementNodeId: node.nodeId,
          proposalNodeId: node.proposalNodeId,
          proposalId: proposal.proposalId,
          proposalDigest: proposal.proposalDigest,
          policyId: node.policyId,
          organizationId:
            state.activeTrustedContext.organizationId,
          roleId: state.activeTrustedContext.roleId,
          endorsedAt: event.serverTimestampUtc,
          assurance: "SCENARIO_APPROVAL_RECORD",
        };
        return this.updateState(state, event, {
          endorsements: {
            ...state.endorsements,
            [this.endorsementKey(node.nodeId, endorsement.roleId)]:
              endorsement,
          },
        });
      }
      case "ROLE_HANDOFF_COMPLETED": {
        const state = this.stateOrThrow(current);
        const node = this.currentNode(state);
        const toRoleId = requiredString(
          event.payload.toRoleId,
          "toRoleId",
        );
        const nextContext = this.trustedContextForRole(
          state.learnerUserId,
          toRoleId,
        );
        if (
          node.nodeType !== "ENDORSEMENT" ||
          event.payload.endorsementNodeId !== node.nodeId ||
          event.payload.fromRoleId !==
            state.activeTrustedContext.roleId ||
          event.payload.toOrganizationId !==
            nextContext.organizationId ||
          !node.permittedRoleIds.includes(toRoleId) ||
          this.nextRequiredEndorsementRoleId(node, state) !==
            toRoleId
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Role handoff does not match the next required scenario-controlled endorser.",
          );
        }
        return this.updateState(state, event, {
          activeTrustedContext: nextContext,
        });
      }
      case "POLICY_EVALUATED": {
        const state = this.stateOrThrow(current);
        const node = this.currentNode(state);
        const policyNode =
          node.nodeType === "POLICY_CHECK"
            ? node
            : node.nodeType === "ENDORSEMENT"
              ? this.scenario.nodes.find(
                  (
                    candidate,
                  ): candidate is Extract<
                    ScenarioNodeV1,
                    { readonly nodeType: "POLICY_CHECK" }
                  > =>
                    candidate.nodeType === "POLICY_CHECK" &&
                    candidate.policyId === node.policyId &&
                    candidate.proposalNodeId ===
                      node.proposalNodeId,
                )
              : undefined;
        if (policyNode === undefined) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Policy evaluation occurred outside its authored policy lifecycle.",
          );
        }
        const evaluation = this.policyEvaluationFor(
          policyNode,
          state,
        );
        if (
          event.payload.policyCheckNodeId !== policyNode.nodeId ||
          event.payload.policyId !== policyNode.policyId ||
          event.payload.proposalNodeId !==
            policyNode.proposalNodeId ||
          event.payload.outcome !== evaluation.outcome ||
          canonicalize(event.payload.reasonCodes) !==
            canonicalize(evaluation.reasonCodes)
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Policy evaluation does not match the reconstructed proposal and endorsement evidence.",
          );
        }
        const record: GenericPolicyEvaluationRecord = {
          ...evaluation,
          evaluatedAt: event.serverTimestampUtc,
        };
        return this.updateState(state, event, {
          policyEvaluations: [
            ...state.policyEvaluations,
            record,
          ],
        });
      }
      case "TRANSACTION_COMMITTED": {
        const state = this.stateOrThrow(current);
        const proposalNodeId = requiredString(
          event.payload.proposalNodeId,
          "proposalNodeId",
        );
        const proposal = state.transactionProposals[proposalNodeId];
        const policyId = requiredString(
          event.payload.policyId,
          "policyId",
        );
        const endorsements = Object.values(state.endorsements)
          .filter(
            (endorsement) =>
              endorsement.proposalNodeId === proposalNodeId &&
              endorsement.policyId === policyId,
          )
          .sort((left, right) =>
            left.roleId.localeCompare(right.roleId),
          );
        const latestEvaluation = [...state.policyEvaluations]
          .reverse()
          .find(
            (evaluation) =>
              evaluation.proposalNodeId === proposalNodeId &&
              evaluation.policyId === policyId,
          );
        const transaction: GenericCommittedTransactionRecord | null =
          proposal === undefined
            ? null
            : {
                proposalNodeId,
                proposalId: proposal.proposalId,
                proposalType: proposal.proposalType,
                proposalDigest: proposal.proposalDigest,
                policyId,
                endorsementRoleIds: endorsements.map(
                  (endorsement) => endorsement.roleId,
                ),
                committedAt: event.serverTimestampUtc,
              };
        if (
          transaction === null ||
          latestEvaluation?.outcome !== "pass" ||
          state.committedTransactions[proposalNodeId] !== undefined ||
          event.payload.proposalId !== transaction.proposalId ||
          event.payload.proposalType !==
            transaction.proposalType ||
          event.payload.proposalDigest !==
            transaction.proposalDigest ||
          canonicalize(event.payload.endorsementRoleIds) !==
            canonicalize(transaction.endorsementRoleIds)
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Committed transaction does not match the accepted proposal, endorsements, and policy result.",
          );
        }
        const existingTransactions =
          state.ledgerState.tracechainTransactions;
        if (
          existingTransactions !== undefined &&
          !Array.isArray(existingTransactions)
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "The authored ledger reserves tracechainTransactions for committed transaction records.",
          );
        }
        return this.updateState(state, event, {
          committedTransactions: {
            ...state.committedTransactions,
            [proposalNodeId]: transaction,
          },
          ledgerState: {
            ...state.ledgerState,
            tracechainTransactions: [
              ...(existingTransactions ?? []),
              transaction as unknown as JsonObject,
            ],
          },
        });
      }
      case "COMMUNICATION_ACKNOWLEDGED": {
        const state = this.stateOrThrow(current);
        const node = this.currentNode(state);
        if (
          node.nodeType !== "COMMUNICATION" ||
          !node.visibleToRoleIds.includes(
            state.activeTrustedContext.roleId,
          ) ||
          state.communications[node.nodeId] !== undefined ||
          event.payload.communicationNodeId !== node.nodeId ||
          event.payload.messageId !== node.messageId ||
          canonicalize(event.payload.visibleToRoleIds) !==
            canonicalize(node.visibleToRoleIds)
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Communication evidence does not match the authored message and trusted role.",
          );
        }
        return this.updateState(state, event, {
          communications: {
            ...state.communications,
            [node.nodeId]: {
              communicationNodeId: node.nodeId,
              messageId: node.messageId,
              visibleToRoleIds: node.visibleToRoleIds,
              acknowledgedAt: event.serverTimestampUtc,
              acknowledgedByRoleId:
                state.activeTrustedContext.roleId,
            },
          },
        });
      }
      case "STOCHASTIC_EVENT_RESOLVED": {
        const state = this.stateOrThrow(current);
        const node = this.currentNode(state);
        if (node.nodeType !== "STOCHASTIC_EVENT") {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Stochastic evidence occurred outside its authored node.",
          );
        }
        const resolution = this.stochasticResolutionFor(node, state);
        const outcome = node.outcomes.find(
          (candidate) =>
            candidate.resultCode === resolution.outcomeCode,
        );
        if (
          outcome === undefined ||
          event.payload.stochasticNodeId !== node.nodeId ||
          event.payload.outcomeId !== outcome.outcomeId ||
          event.payload.resultCode !== outcome.resultCode ||
          canonicalize(event.payload.resolution) !==
            canonicalize(resolution)
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Stochastic evidence does not match the named deterministic draw.",
          );
        }
        const reusesInitialResolution =
          state.outcomeResolution?.drawKey === resolution.drawKey;
        return this.updateState(state, event, {
          stochasticEvents: {
            ...state.stochasticEvents,
            [node.nodeId]: {
              stochasticNodeId: node.nodeId,
              outcomeId: outcome.outcomeId,
              resultCode: outcome.resultCode,
              resolution,
              resolvedAt: event.serverTimestampUtc,
            },
          },
          rngState: {
            ...state.rngState,
            streamPosition:
              state.rngState.streamPosition +
              (resolution.draw === undefined ||
              reusesInitialResolution
                ? 0
                : 1),
            recordedDraws:
              resolution.draw === undefined ||
              reusesInitialResolution
                ? state.rngState.recordedDraws
                : [
                    ...state.rngState.recordedDraws,
                    resolution.draw,
                  ],
          },
        });
      }
      case "REFLECTION_SUBMITTED": {
        const state = this.stateOrThrow(current);
        const node = this.currentNode(state);
        const reflectionId = requiredString(
          event.payload.reflectionId,
          "reflectionId",
        );
        const response = requiredString(
          event.payload.response,
          "response",
        );
        if (
          node.nodeType !== "REFLECTION" ||
          reflectionId !== node.reflectionId ||
          response.length > node.maximumLength ||
          state.reflections[node.reflectionId] !== undefined
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Reflection evidence does not match its authored prompt.",
          );
        }
        return this.updateState(state, event, {
          reflections: {
            ...state.reflections,
            [node.reflectionId]: {
              reflectionId: node.reflectionId,
              response,
              submittedAt: event.serverTimestampUtc,
            },
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
        const uncommittedPassedProposal =
          state.policyEvaluations.find(
            (evaluation) =>
              evaluation.outcome === "pass" &&
              state.committedTransactions[
                evaluation.proposalNodeId
              ] === undefined,
          );
        if (
          node.nodeType !== "COMPLETION" ||
          event.payload.outcomeCode !== node.outcomeCode ||
          uncommittedPassedProposal !== undefined
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
            context: state.activeTrustedContext,
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
          context: state.activeTrustedContext,
          commandId: options.commandId,
          commandDigest: options.commandDigest,
          batchIndex: options.built.length,
          transition,
        });
        options.built.push(advanced);
        state = advanced.nextState;
        continue;
      }
      if (node.nodeType === "POLICY_CHECK") {
        state = this.appendPolicyEvaluationAndCommitEvents({
          state,
          built: options.built,
          principal: options.principal,
          context: state.activeTrustedContext,
          commandId: options.commandId,
          commandDigest: options.commandDigest,
          node,
        });
        const transition = this.nextTransition(node, state);
        const advanced = this.buildWorkflowAdvancedEvent({
          state,
          principal: options.principal,
          context: state.activeTrustedContext,
          commandId: options.commandId,
          commandDigest: options.commandDigest,
          batchIndex: options.built.length,
          transition,
        });
        options.built.push(advanced);
        state = advanced.nextState;
        continue;
      }
      if (node.nodeType === "STOCHASTIC_EVENT") {
        const resolved = this.stochasticResolutionFor(node, state);
        const outcome = node.outcomes.find(
          (candidate) =>
            candidate.resultCode === resolved.outcomeCode,
        );
        if (outcome === undefined) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "The deterministic stochastic result is missing from its authored node.",
          );
        }
        const realized = this.buildEventForRun(state.runId, {
          state,
          principal: options.principal,
          context: state.activeTrustedContext,
          commandId: options.commandId,
          commandDigest: options.commandDigest,
          batchIndex: options.built.length,
          eventType: "STOCHASTIC_EVENT_RESOLVED",
          payload: {
            stochasticNodeId: node.nodeId,
            outcomeId: outcome.outcomeId,
            resultCode: outcome.resultCode,
            resolution: resolved as unknown as JsonObject,
            eventCodes: [
              "STOCHASTIC_EVENT_RESOLVED",
              outcome.outcomeId,
              outcome.resultCode,
            ],
          },
        });
        options.built.push(realized);
        state = realized.nextState;
        const transition = this.nextTransition(node, state);
        const advanced = this.buildWorkflowAdvancedEvent({
          state,
          principal: options.principal,
          context: state.activeTrustedContext,
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
          context: state.activeTrustedContext,
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
          context: state.activeTrustedContext,
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

  private appendPolicyEvaluationAndCommitEvents(options: {
    readonly state: GenericHostedRunState;
    readonly built: BuiltEvent[];
    readonly principal: ApplicationPrincipal;
    readonly context: TrustedExecutionContext;
    readonly commandId: string;
    readonly commandDigest: string;
    readonly node: Extract<
      ScenarioNodeV1,
      { readonly nodeType: "POLICY_CHECK" }
    >;
  }): GenericHostedRunState {
    const evaluation = this.policyEvaluationFor(
      options.node,
      options.state,
    );
    const evaluated = this.buildEventForRun(options.state.runId, {
      state: options.state,
      principal: options.principal,
      context: options.context,
      commandId: options.commandId,
      commandDigest: options.commandDigest,
      batchIndex: options.built.length,
      eventType: "POLICY_EVALUATED",
      payload: {
        policyCheckNodeId: options.node.nodeId,
        policyId: options.node.policyId,
        proposalNodeId: options.node.proposalNodeId,
        outcome: evaluation.outcome,
        reasonCodes: evaluation.reasonCodes,
        eventCodes: [
          "POLICY_EVALUATED",
          options.node.policyId,
          `POLICY_${evaluation.outcome.toUpperCase()}`,
        ],
      },
    });
    options.built.push(evaluated);
    let state = evaluated.nextState;
    if (
      evaluation.outcome === "pass" &&
      state.committedTransactions[options.node.proposalNodeId] ===
        undefined
    ) {
      const proposal =
        state.transactionProposals[options.node.proposalNodeId];
      if (proposal === undefined) {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "A passing policy result requires its exact proposal.",
        );
      }
      const endorsementRoleIds = Object.values(state.endorsements)
        .filter(
          (endorsement) =>
            endorsement.proposalNodeId ===
              options.node.proposalNodeId &&
            endorsement.policyId === options.node.policyId,
        )
        .map((endorsement) => endorsement.roleId)
        .sort();
      const committed = this.buildEventForRun(state.runId, {
        state,
        principal: options.principal,
        context: state.activeTrustedContext,
        commandId: options.commandId,
        commandDigest: options.commandDigest,
        batchIndex: options.built.length,
        eventType: "TRANSACTION_COMMITTED",
        payload: {
          proposalNodeId: proposal.proposalNodeId,
          proposalId: proposal.proposalId,
          proposalType: proposal.proposalType,
          proposalDigest: proposal.proposalDigest,
          policyId: options.node.policyId,
          endorsementRoleIds,
          eventCodes: [
            "TRANSACTION_COMMITTED",
            proposal.proposalType,
            options.node.policyId,
          ],
        },
      });
      options.built.push(committed);
      state = committed.nextState;
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

  private transactionProposalFor(
    node: Extract<
      ScenarioNodeV1,
      { readonly nodeType: "TRANSACTION_PROPOSAL" }
    >,
    state: GenericHostedRunState,
    context: TrustedExecutionContext,
    proposedAt: string,
  ): GenericTransactionProposalRecord {
    if (state.transactionProposals[node.nodeId] !== undefined) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "This authored transaction proposal has already been recorded.",
      );
    }
    const decision = state.decisions[node.sourceDecisionId];
    if (decision === undefined) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "The transaction proposal requires its authored source decision.",
      );
    }
    const sourceDecisionHash = sha256Hex(
      canonicalize({
        domain: "TRACECHAIN_GENERIC_SOURCE_DECISION_V1",
        decision,
      }),
    );
    const proposalContent = {
      domain: "TRACECHAIN_GENERIC_TRANSACTION_PROPOSAL_V1",
      packContentHash: state.packContentHash,
      scenarioId: state.scenarioId,
      scenarioVersion: state.scenarioVersion,
      runId: state.runId,
      proposalNodeId: node.nodeId,
      proposalType: node.proposalType,
      sourceDecisionId: node.sourceDecisionId,
      sourceDecisionHash,
      policyIds: node.policyIds,
      expectedRunVersion: state.version,
      proposedAt,
      organizationId: context.organizationId,
      roleId: context.roleId,
    };
    const proposalDigest = sha256Hex(canonicalize(proposalContent));
    return {
      proposalNodeId: node.nodeId,
      proposalId: `GPROP_${proposalDigest.slice(0, 24).toUpperCase()}`,
      proposalType: node.proposalType,
      sourceDecisionId: node.sourceDecisionId,
      policyIds: node.policyIds,
      sourceDecisionHash,
      proposalDigest,
      expectedRunVersion: state.version,
      proposedAt,
      organizationId: context.organizationId,
      roleId: context.roleId,
    };
  }

  private policyEvaluationFor(
    node: Extract<
      ScenarioNodeV1,
      { readonly nodeType: "POLICY_CHECK" }
    >,
    state: GenericHostedRunState,
  ): Omit<GenericPolicyEvaluationRecord, "evaluatedAt"> {
    const policy = this.scenario.policies.find(
      (candidate) => candidate.policyId === node.policyId,
    );
    if (policy === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The policy-check node references a missing policy.",
      );
    }
    const proposal =
      state.transactionProposals[node.proposalNodeId];
    const reasonCodes: string[] = [];
    let passed = true;
    if (proposal === undefined) {
      passed = false;
      reasonCodes.push("PROPOSAL_MISSING");
    } else {
      reasonCodes.push("PROPOSAL_PRESENT");
      if (!proposal.policyIds.includes(policy.policyId)) {
        passed = false;
        reasonCodes.push("POLICY_NOT_APPLIED_TO_PROPOSAL");
      } else {
        reasonCodes.push("POLICY_APPLIED_TO_PROPOSAL");
      }
    }

    const associatedEndorsementNodes = this.scenario.nodes.filter(
      (
        candidate,
      ): candidate is Extract<
        ScenarioNodeV1,
        { readonly nodeType: "ENDORSEMENT" }
      > =>
        candidate.nodeType === "ENDORSEMENT" &&
        candidate.proposalNodeId === node.proposalNodeId &&
        candidate.policyId === node.policyId,
    );
    const endorsementNodeIds = new Set(
      associatedEndorsementNodes.map((candidate) => candidate.nodeId),
    );
    const endorsements = Object.values(state.endorsements).filter(
      (endorsement) =>
        endorsementNodeIds.has(endorsement.endorsementNodeId) &&
        endorsement.proposalNodeId === node.proposalNodeId &&
        endorsement.policyId === node.policyId,
    );
    if (
      associatedEndorsementNodes.length > 0 &&
      endorsements.length === 0
    ) {
      passed = false;
      reasonCodes.push("REQUIRED_ENDORSEMENT_MISSING");
    } else if (endorsements.length > 0) {
      reasonCodes.push("AUTHORED_ENDORSEMENTS_SATISFIED");
    }

    const configuration = policy.configuration;
    const configuredResult = configuration.result;
    if (
      configuredResult !== undefined &&
      configuredResult !== "pass" &&
      configuredResult !== "fail"
    ) {
      passed = false;
      reasonCodes.push("POLICY_CONFIGURATION_INVALID");
    }
    if (configuredResult === "fail") {
      passed = false;
      reasonCodes.push("AUTHORED_POLICY_RESULT_FAIL");
    } else if (configuredResult === "pass") {
      reasonCodes.push("AUTHORED_POLICY_RESULT_PASS");
    }

    const requiredDecisionOptionIdsResult =
      this.optionalConfigurationStringArray(
        configuration.requiredDecisionOptionIds,
      );
    const prohibitedDecisionOptionIdsResult =
      this.optionalConfigurationStringArray(
        configuration.prohibitedDecisionOptionIds,
      );
    if (
      requiredDecisionOptionIdsResult === null ||
      prohibitedDecisionOptionIdsResult === null
    ) {
      passed = false;
      reasonCodes.push("POLICY_CONFIGURATION_INVALID");
    }
    const requiredDecisionOptionIds =
      requiredDecisionOptionIdsResult ?? [];
    const prohibitedDecisionOptionIds =
      prohibitedDecisionOptionIdsResult ?? [];
    const sourceDecision =
      proposal === undefined
        ? undefined
        : state.decisions[proposal.sourceDecisionId];
    const selectedOptionIds = new Set(
      sourceDecision === undefined
        ? []
        : Object.values(sourceDecision.responses).flat(),
    );
    if (
      requiredDecisionOptionIds.some(
        (optionId) => !selectedOptionIds.has(optionId),
      )
    ) {
      passed = false;
      reasonCodes.push("REQUIRED_DECISION_OPTION_MISSING");
    } else if (requiredDecisionOptionIds.length > 0) {
      reasonCodes.push("REQUIRED_DECISION_OPTIONS_SATISFIED");
    }
    if (
      prohibitedDecisionOptionIds.some((optionId) =>
        selectedOptionIds.has(optionId),
      )
    ) {
      passed = false;
      reasonCodes.push("PROHIBITED_DECISION_OPTION_SELECTED");
    }

    const minimumEndorsements =
      configuration.minimumEndorsements;
    if (
      minimumEndorsements !== undefined &&
      (typeof minimumEndorsements !== "number" ||
        !Number.isInteger(minimumEndorsements) ||
        minimumEndorsements < 0)
    ) {
      passed = false;
      reasonCodes.push("POLICY_CONFIGURATION_INVALID");
    }
    if (
      typeof minimumEndorsements === "number" &&
      endorsements.length < minimumEndorsements
    ) {
      passed = false;
      reasonCodes.push("ENDORSEMENT_THRESHOLD_NOT_SATISFIED");
    } else if (
      typeof minimumEndorsements === "number" &&
      minimumEndorsements > 0
    ) {
      reasonCodes.push("ENDORSEMENT_THRESHOLD_SATISFIED");
    }

    const requiredEndorsementRoleIdsResult =
      this.optionalConfigurationStringArray(
        configuration.requiredEndorsementRoleIds,
      );
    if (requiredEndorsementRoleIdsResult === null) {
      passed = false;
      reasonCodes.push("POLICY_CONFIGURATION_INVALID");
    }
    const requiredEndorsementRoleIds =
      requiredEndorsementRoleIdsResult ?? [];
    const endorsingRoleIds = new Set(
      endorsements.map((endorsement) => endorsement.roleId),
    );
    if (
      requiredEndorsementRoleIds.some(
        (roleId) => !endorsingRoleIds.has(roleId),
      )
    ) {
      passed = false;
      reasonCodes.push("REQUIRED_ENDORSER_ROLE_MISSING");
    } else if (requiredEndorsementRoleIds.length > 0) {
      reasonCodes.push("REQUIRED_ENDORSER_ROLES_SATISFIED");
    }

    if (configuration.requiredPolicyConsultation !== undefined) {
      if (
        typeof configuration.requiredPolicyConsultation !==
        "boolean"
      ) {
        passed = false;
        reasonCodes.push("POLICY_CONFIGURATION_INVALID");
      } else if (
        configuration.requiredPolicyConsultation &&
        !state.consultedPolicyIds.includes(policy.policyId)
      ) {
        passed = false;
        reasonCodes.push("REQUIRED_POLICY_CONSULTATION_MISSING");
      } else if (configuration.requiredPolicyConsultation) {
        reasonCodes.push("POLICY_CONSULTATION_RECORDED");
      }
    }

    if (policy.policyType === "AUTHORIZATION") {
      const authorizedRoleId =
        configuration.authorizedRoleId;
      const authorizedOrganizationId =
        configuration.authorizedOrganizationId;
      if (
        (authorizedRoleId !== undefined &&
          typeof authorizedRoleId !== "string") ||
        (authorizedOrganizationId !== undefined &&
          typeof authorizedOrganizationId !== "string")
      ) {
        passed = false;
        reasonCodes.push("POLICY_CONFIGURATION_INVALID");
      } else if (
        authorizedRoleId === undefined &&
        authorizedOrganizationId === undefined
      ) {
        passed = false;
        reasonCodes.push("AUTHORIZATION_CONTEXT_UNDECLARED");
      } else if (
        proposal === undefined ||
        (authorizedRoleId !== undefined &&
          proposal.roleId !== authorizedRoleId) ||
        (authorizedOrganizationId !== undefined &&
          proposal.organizationId !==
            authorizedOrganizationId)
      ) {
        passed = false;
        reasonCodes.push("PROPOSER_NOT_AUTHORIZED");
      } else {
        reasonCodes.push("PROPOSER_AUTHORIZED");
      }
    }

    return {
      policyCheckNodeId: node.nodeId,
      policyId: node.policyId,
      proposalNodeId: node.proposalNodeId,
      outcome: passed ? "pass" : "fail",
      reasonCodes: [...new Set(reasonCodes)],
    };
  }

  private endorsementKey(nodeId: string, roleId: string): string {
    return `${nodeId}::${roleId}`;
  }

  private requiredEndorsementRoleIds(
    node: Extract<
      ScenarioNodeV1,
      { readonly nodeType: "ENDORSEMENT" }
    >,
  ): readonly string[] {
    const policy = this.scenario.policies.find(
      (candidate) => candidate.policyId === node.policyId,
    );
    const configured = this.optionalConfigurationStringArray(
      policy?.configuration.requiredEndorsementRoleIds,
    );
    if (configured === null) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The endorsement policy has an invalid required-role list.",
      );
    }
    const minimum =
      typeof policy?.configuration.minimumEndorsements === "number"
        ? policy.configuration.minimumEndorsements
        : 0;
    const ordered = [
      ...configured,
      ...node.permittedRoleIds.filter(
        (roleId) => !configured.includes(roleId),
      ),
    ];
    return ordered.slice(
      0,
      Math.max(configured.length, minimum, 1),
    );
  }

  private nextRequiredEndorsementRoleId(
    node: Extract<
      ScenarioNodeV1,
      { readonly nodeType: "ENDORSEMENT" }
    >,
    state: GenericHostedRunState,
  ): string | undefined {
    const endorsedRoleIds = new Set(
      Object.values(state.endorsements)
        .filter(
          (endorsement) =>
            endorsement.endorsementNodeId === node.nodeId &&
            endorsement.proposalNodeId === node.proposalNodeId &&
            endorsement.policyId === node.policyId,
        )
        .map((endorsement) => endorsement.roleId),
    );
    return this.requiredEndorsementRoleIds(node).find(
      (roleId) => !endorsedRoleIds.has(roleId),
    );
  }

  private optionalConfigurationStringArray(
    value: unknown,
  ): readonly string[] | null {
    if (value === undefined) return [];
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string")
    ) {
      return null;
    }
    const values = value as readonly string[];
    if (
      values.some((item) => item.length === 0) ||
      new Set(values).size !== values.length
    ) {
      return null;
    }
    return values;
  }

  private stochasticResolutionFor(
    node: Extract<
      ScenarioNodeV1,
      { readonly nodeType: "STOCHASTIC_EVENT" }
    >,
    state: GenericHostedRunState,
  ): StochasticOutcomeResolutionV1 {
    if (state.stochasticEvents[node.nodeId] !== undefined) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "This named stochastic event has already been resolved.",
      );
    }
    if (
      state.outcomeResolution?.randomStreamId ===
        node.randomStreamId &&
      node.outcomes.some(
        (outcome) =>
          outcome.resultCode ===
          state.outcomeResolution?.outcomeCode,
      )
    ) {
      return state.outcomeResolution;
    }
    const model: StochasticOutcomeModelV1 = {
      outcomeModelId: `GENERIC_NODE_${node.nodeId}`,
      distribution: "weighted-categorical",
      randomStreamId: node.randomStreamId,
      outcomes: node.outcomes.map((outcome) => ({
        outcomeCode: outcome.resultCode,
        weight: outcome.weight,
      })),
    };
    const forcedOutcomeCode =
      state.modeConfiguration.outcomeStrategy === "forced" &&
      typeof state.modeConfiguration.forcedOutcomeCode === "string" &&
      node.outcomes.some(
        (outcome) =>
          outcome.resultCode ===
          state.modeConfiguration.forcedOutcomeCode,
      )
        ? state.modeConfiguration.forcedOutcomeCode
        : undefined;
    return resolveStochasticOutcome({
      model,
      scenarioVersion: state.scenarioVersion,
      scenarioSeed: state.scenarioSeed,
      occurrenceKey: `WORKFLOW_NODE:${node.nodeId}`,
      relevantEntityId: state.assignmentId,
      strategy:
        forcedOutcomeCode === undefined
          ? "probabilistic"
          : "forced",
      ...(forcedOutcomeCode === undefined
        ? {}
        : { forcedOutcomeCode }),
    });
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
    return this.trustedContextForNode(
      learnerUserId,
      this.scenario.nodes.find(
        (node) => node.nodeId === this.scenario.entryNodeId,
      ),
    );
  }

  private trustedContextForNode(
    learnerUserId: string,
    node: ScenarioNodeV1 | undefined,
    current?: TrustedExecutionContext,
  ): TrustedExecutionContext {
    if (node === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The scenario-controlled role handoff references a missing node.",
      );
    }
    const preferredRoleId =
      node.nodeType === "ENDORSEMENT"
        ? this.requiredEndorsementRoleIds(node)[0]
        : node.nodeType === "COMMUNICATION" &&
            (current === undefined ||
              !node.visibleToRoleIds.includes(current.roleId))
          ? node.visibleToRoleIds[0]
          : current?.roleId;
    if (preferredRoleId === undefined && current !== undefined) {
      return current;
    }
    if (preferredRoleId !== undefined) {
      return this.trustedContextForRole(
        learnerUserId,
        preferredRoleId,
      );
    }
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

  private trustedContextForRole(
    learnerUserId: string,
    roleId: string,
  ): TrustedExecutionContext {
    const role = this.scenario.roles.find(
      (candidate) => candidate.roleId === roleId,
    );
    if (role === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The scenario-controlled role handoff references a missing role.",
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
    const nodeType = this.currentNode(state).nodeType;
    if (
      state.status !== "active" ||
      ![
        "DECISION",
        "TRANSACTION_PROPOSAL",
        "ENDORSEMENT",
        "COMMUNICATION",
        "REFLECTION",
      ].includes(nodeType)
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
    if (condition.kind === "POLICY_RESULT") {
      for (
        let index = state.policyEvaluations.length - 1;
        index >= 0;
        index -= 1
      ) {
        const evaluation = state.policyEvaluations[index];
        if (evaluation?.policyId === condition.policyId) {
          return evaluation.outcome === condition.outcome;
        }
      }
      return false;
    }
    if (condition.kind === "EVENT_OCCURRED") {
      return state.occurredEventTypes.includes(
        condition.eventType,
      );
    }
    return false;
  }

  private updateState(
    state: GenericHostedRunState,
    event: RunEventV1,
    patch: Partial<GenericHostedRunState>,
  ): GenericHostedRunState {
    const eventTypes = [
      ...new Set([
        ...state.occurredEventTypes,
        event.eventType,
        ...this.authoredEventCodes(event),
      ]),
    ];
    return this.withWorkflowPermissions({
      ...state,
      ...patch,
      occurredEventTypes: eventTypes,
      version: event.sequenceNumber,
    });
  }

  private authoredEventCodes(event: RunEventV1): readonly string[] {
    const explicit =
      event.payload.eventCodes === undefined
        ? []
        : stringArray(
            event.payload.eventCodes,
            "eventCodes",
            "PACK_CONTRACT_MISMATCH",
          );
    const outcomeCode =
      typeof event.payload.outcomeCode === "string"
        ? [event.payload.outcomeCode]
        : [];
    return [...explicit, ...outcomeCode];
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
    let primaryActions: readonly string[] = [];
    if (
      node.nodeType === "BRIEFING" ||
      node.nodeType === "CONSEQUENCE"
    ) {
      primaryActions = ["ADVANCE_WORKFLOW"];
    } else if (node.nodeType === "DECISION") {
      primaryActions = ["SUBMIT_STRUCTURED_DECISION"];
    } else if (node.nodeType === "TRANSACTION_PROPOSAL") {
      primaryActions = ["CREATE_TRANSACTION_PROPOSAL"];
    } else if (node.nodeType === "ENDORSEMENT") {
      primaryActions = ["RECORD_ENDORSEMENT"];
    } else if (node.nodeType === "COMMUNICATION") {
      primaryActions = ["ACKNOWLEDGE_COMMUNICATION"];
    } else if (node.nodeType === "REFLECTION") {
      primaryActions = ["SUBMIT_REFLECTION"];
    }
    const supportsReferenceActions = [
      "DECISION",
      "TRANSACTION_PROPOSAL",
      "ENDORSEMENT",
      "COMMUNICATION",
      "REFLECTION",
    ].includes(node.nodeType);
    const visibleUninspectedEvidenceExists =
      supportsReferenceActions &&
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
    const actions = [
      ...(visibleUninspectedEvidenceExists
        ? ["INSPECT_EVIDENCE"]
        : []),
      ...(node.nodeType === "DECISION" &&
      this.requestableEvidence(state).length > 0
        ? ["REQUEST_EVIDENCE"]
        : []),
      ...(supportsReferenceActions &&
      this.consultablePolicies(state).length > 0
        ? ["CONSULT_POLICY"]
        : []),
      ...primaryActions,
    ];
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
    const runtimeBusinessState: VisibleStateRecordV1[] = [
      ...Object.values(state.transactionProposals).map(
        (proposal) => ({
          recordId: `PROPOSAL_${proposal.proposalNodeId}`,
          visibleToRoleIds: roleIds,
          value: proposal as unknown as JsonObject,
        }),
      ),
      ...Object.values(state.endorsements).map(
        (endorsement) => ({
          recordId: `ENDORSEMENT_${endorsement.endorsementNodeId}_${endorsement.roleId}`,
          visibleToRoleIds: roleIds,
          value: endorsement as unknown as JsonObject,
        }),
      ),
      ...Object.values(state.committedTransactions).map(
        (transaction) => ({
          recordId: `COMMITTED_${transaction.proposalNodeId}`,
          visibleToRoleIds: roleIds,
          value: transaction as unknown as JsonObject,
        }),
      ),
      ...Object.values(state.communications).map(
        (communication) => ({
          recordId: `COMMUNICATION_${communication.communicationNodeId}`,
          visibleToRoleIds: communication.visibleToRoleIds,
          value: communication as unknown as JsonObject,
        }),
      ),
      ...Object.values(state.stochasticEvents).map(
        (stochasticEvent) => ({
          recordId: `STOCHASTIC_${stochasticEvent.stochasticNodeId}`,
          visibleToRoleIds: roleIds,
          value: stochasticEvent as unknown as JsonObject,
        }),
      ),
      ...Object.values(state.reflections).map((reflection) => ({
        recordId: `REFLECTION_${reflection.reflectionId}`,
        visibleToRoleIds: [state.activeTrustedContext.roleId],
        value: reflection as unknown as JsonObject,
      })),
    ];
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
      [
        ...this.scenario.policies
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
          })),
        ...state.policyEvaluations.map((evaluation) => ({
          recordId: `POLICY_RESULT_${evaluation.policyCheckNodeId}`,
          visibleToRoleIds: roleIds,
          value: evaluation as unknown as JsonObject,
        })),
      ];
    return {
      schemaVersion: "1.0.0" as const,
      runId: state.runId,
      version: state.version,
      actualState: state.actualState,
      businessState: [
        ...visibleRecords(state.businessState, roleIds),
        ...runtimeBusinessState,
      ],
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

  private decisionAssessmentResults(
    state: GenericHostedRunState,
  ): readonly {
    readonly decisionItemId: string;
    readonly maximumPoints: number;
    readonly isAuthoredCorrect: boolean;
  }[] {
    return this.scenario.nodes.flatMap((node) => {
      if (
        node.nodeType !== "DECISION" ||
        node.assessment === undefined
      ) {
        return [];
      }
      const submission = state.decisions[node.decisionId];
      const isAuthoredCorrect =
        submission !== undefined &&
        node.fields.every((field) => {
          const expected = [
            ...(node.assessment?.correctOptionIdsByField[
              field.fieldId
            ] ?? []),
          ].sort();
          const actual = [
            ...(submission.responses[field.fieldId] ?? []),
          ].sort();
          return canonicalize(actual) === canonicalize(expected);
        });
      return [
        {
          decisionItemId: node.assessment.decisionItemId,
          maximumPoints: node.assessment.maximumPoints,
          isAuthoredCorrect,
        },
      ];
    });
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
    let currentNode: LearnerRunPresentationV1["currentNode"] = {
      nodeId: node.nodeId,
      nodeType: node.nodeType,
      title: this.localizedText(node.title.localizationKey),
    };
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
    } else if (node.nodeType === "TRANSACTION_PROPOSAL") {
      currentNode = {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: this.localizedText(node.title.localizationKey),
        proposalType: node.proposalType,
        sourceDecisionId: node.sourceDecisionId,
        policyIds: node.policyIds,
      };
    } else if (node.nodeType === "ENDORSEMENT") {
      currentNode = {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: this.localizedText(node.title.localizationKey),
        proposalNodeId: node.proposalNodeId,
        policyId: node.policyId,
        permittedRoleIds: node.permittedRoleIds,
      };
    } else if (node.nodeType === "POLICY_CHECK") {
      currentNode = {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: this.localizedText(node.title.localizationKey),
        proposalNodeId: node.proposalNodeId,
        policyId: node.policyId,
      };
    } else if (node.nodeType === "COMMUNICATION") {
      currentNode = {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: this.localizedText(node.title.localizationKey),
        messageId: node.messageId,
        message: this.localizedText(node.message.localizationKey),
        visibleToRoleIds: node.visibleToRoleIds,
      };
    } else if (node.nodeType === "STOCHASTIC_EVENT") {
      currentNode = {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: this.localizedText(node.title.localizationKey),
        randomStreamId: node.randomStreamId,
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
    } else if (node.nodeType === "REFLECTION") {
      currentNode = {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: this.localizedText(node.title.localizationKey),
        reflectionId: node.reflectionId,
        prompt: this.localizedText(node.prompt.localizationKey),
        maximumLength: node.maximumLength,
      };
    } else if (node.nodeType === "EVIDENCE_RELEASE") {
      currentNode = {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: this.localizedText(node.title.localizationKey),
      };
    } else if (node.nodeType === "COMPLETION") {
      currentNode = {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: this.localizedText(node.title.localizationKey),
        ...(node.message === undefined
          ? {}
          : {
              message: this.localizedText(
                node.message.localizationKey,
              ),
            }),
      };
    }
    const visibleEvidence = this.scenario.evidenceItems.filter(
      (evidence) =>
        [
          ...state.releasedEvidenceIds,
          ...this.requestableEvidence(state).map(
            (candidate) => candidate.evidenceId,
          ),
          ...state.evidenceRequests.map(
            (request) => request.evidenceId,
          ),
        ].includes(evidence.evidenceId),
    );
    const assessmentResults =
      this.decisionAssessmentResults(state);
    const processScore =
      assessmentResults.length === 0
        ? undefined
        : assessmentResults.reduce(
            (sum, result) =>
              sum +
              (result.isAuthoredCorrect
                ? result.maximumPoints
                : 0),
            0,
          );
    const realizedStochasticEvent = Object.values(
      state.stochasticEvents,
    ).at(-1);
    const realizedStochasticOutcome =
      realizedStochasticEvent === undefined
        ? undefined
        : this.scenario.nodes
            .flatMap((candidate) =>
              candidate.nodeType === "STOCHASTIC_EVENT" &&
              candidate.nodeId ===
                realizedStochasticEvent.stochasticNodeId
                ? candidate.outcomes
                : [],
            )
            .find(
              (outcome) =>
                outcome.outcomeId ===
                  realizedStochasticEvent.outcomeId ||
                outcome.resultCode ===
                  realizedStochasticEvent.resultCode,
            );
    const realizedOutcomeCode =
      realizedStochasticEvent?.resultCode ??
      state.outcomeResolution?.outcomeCode;
    return {
      scenarioTitle: this.localizedText(
        this.scenario.title.localizationKey,
      ),
      roleName: this.localizedText(
        role.displayName.localizationKey,
      ),
      currentNode,
      evidenceTitles: Object.fromEntries(
        visibleEvidence.map((evidence) => [
          evidence.evidenceId,
          this.localizedText(evidence.title.localizationKey),
        ]),
      ),
      evidencePresentations: Object.fromEntries(
        visibleEvidence.flatMap((evidence) => {
          const presentation = evidence.learnerPresentation;
          if (presentation === undefined) return [];
          return [
            [
              evidence.evidenceId,
              {
                ...(presentation.summary === undefined
                  ? {}
                  : {
                      summary: this.localizedText(
                        presentation.summary.localizationKey,
                      ),
                    }),
                fields: presentation.fields.map((field) => ({
                  fieldPath: field.fieldPath,
                  label: this.localizedText(
                    field.label.localizationKey,
                  ),
                  valueType: field.valueType,
                  ...(field.unit === undefined
                    ? {}
                    : {
                        unit: this.localizedText(
                          field.unit.localizationKey,
                        ),
                      }),
                  ...(field.valueLabels === undefined
                    ? {}
                    : {
                        valueLabels: Object.fromEntries(
                          Object.entries(field.valueLabels).map(
                            ([value, label]) => [
                              value,
                              this.localizedText(
                                label.localizationKey,
                              ),
                            ],
                          ),
                        ),
                      }),
                })),
              },
            ] as const,
          ];
        }),
      ),
      organizationNames: Object.fromEntries(
        this.scenario.organizations.map((organization) => [
          organization.organizationId,
          this.localizedText(
            organization.displayName.localizationKey,
          ),
        ]),
      ),
      roleNames: Object.fromEntries(
        this.scenario.roles.map((scenarioRole) => [
          scenarioRole.roleId,
          this.localizedText(
            scenarioRole.displayName.localizationKey,
          ),
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
      ...(state.status !== "completed" ||
      node.nodeType !== "COMPLETION"
        ? {}
        : {
            completionSummary: {
              outcomeCode: node.outcomeCode,
              ...(node.message === undefined
                ? {}
                : {
                    message: this.localizedText(
                      node.message.localizationKey,
                    ),
                  }),
              ...(realizedOutcomeCode === undefined
                ? {}
                : {
                    realizedOutcomeCode,
                    ...(realizedStochasticOutcome?.label ===
                    undefined
                      ? {}
                      : {
                          realizedOutcome: this.localizedText(
                            realizedStochasticOutcome.label
                              .localizationKey,
                          ),
                        }),
                  }),
              ...(processScore === undefined
                ? {}
                : {
                    processScore,
                    scoreMaximum: 100 as const,
                  }),
              correctDecisionCount: assessmentResults.filter(
                (result) => result.isAuthoredCorrect,
              ).length,
              assessedDecisionCount: assessmentResults.length,
              inspectedEvidenceCount:
                state.inspectedEvidenceIds.length,
              consultedPolicyCount:
                state.consultedPolicyIds.length,
              evidenceRequestCount: state.evidenceRequests.length,
              totalEvidenceDelayMinutes:
                state.evidenceRequests.reduce(
                  (sum, request) =>
                    sum + request.delayMinutes,
                  0,
                ),
              totalEvidenceCostUnits:
                state.evidenceRequests.reduce(
                  (sum, request) => sum + request.costUnits,
                  0,
                ),
              proposalCount: Object.keys(
                state.transactionProposals,
              ).length,
              endorsementCount: Object.keys(
                state.endorsements,
              ).length,
              committedTransactionCount: Object.keys(
                state.committedTransactions,
              ).length,
            },
          }),
      modeConfiguration: state.modeConfiguration,
    };
  }
}
