import type {
  Clock,
  IdGenerator,
} from "../domain/simulation/environment";
import { canonicalize } from "../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../infrastructure/hashing/sha256";
import type {
  HostedRunMonitorStatusV1,
} from "../platform/contracts/assessment";
import type {
  HostedRunDecisionOutcomeEvidenceV1,
} from "../platform/contracts/decision-outcome-report";
import type {
  JsonObject,
} from "../platform/contracts/json";
import type {
  LearnerRunProjectionV1,
  RunEventV1,
  UnsequencedRunEventV1,
} from "../platform/contracts/run-events";
import type {
  InstructorRunReplayV1,
} from "../platform/contracts/run-replay";
import {
  requireApplicationRole,
  requireAssignedLearner,
  type ApplicationPrincipal,
} from "../platform/hosted/access";
import type {
  CreateHostedRuntimeRunRequest,
  HostedRuntimeRunResult,
  HostedRuntimeStateSummary,
} from "../platform/hosted/hosted-runtime-service";
import {
  HostedRunCommandError,
} from "../platform/hosted/run-command-error";
import type {
  CompetencyEvidenceProjection,
  HostedCompetencyEvidence,
  InstructorTimelineItem,
  RubricEvidenceProjection,
} from "../platform/hosted/stage3-types";
import type {
  RunEventStore,
} from "../platform/runs/event-store";
import type {
  TechnicalExperimentActionType,
  TechnicalLabCheckpointDefinition,
} from "./contracts";
import { technicalLabCryptographicRuntime } from "./cryptographic-runtime";
import {
  advanceTechnicalLabModule,
  appendTechnicalLabAction,
  appendTechnicalLabResponse,
  emptyTechnicalLabSnapshot,
  openTechnicalLabHint,
  replayTechnicalLab,
  type TechnicalLabCheckpointKind,
  type TechnicalLabEngineRuntime,
  type TechnicalLabReplay,
  type TechnicalLabSnapshot,
} from "./engine";
import {
  hostedTechnicalLabConfiguration,
  technicalLabHostedPackAdapter,
  TECHNICAL_LAB_HOSTED_SCENARIO_ID,
  TECHNICAL_LAB_HOSTED_SCENARIO_VERSION,
} from "./hosted-pack-adapter";
import { permissionedFoundationsLabBundle } from "./permissioned-foundations-pack";
import {
  experienceConfigurationHash,
} from "../config/experience";

const LAB_ORGANIZATION_ID = "ORG_TECHNICAL_LAB";
const LAB_ROLE_ID = "TECHNICAL_LEARNER";

interface HostedTechnicalLabRunState
  extends HostedRuntimeStateSummary {
  readonly configurationHash: string;
  readonly locale: "vi" | "en";
  readonly snapshot: TechnicalLabSnapshot;
  readonly replay: TechnicalLabReplay;
}

interface HostedTechnicalLabCommandBase {
  readonly commandId: string;
  readonly runId: string;
  readonly expectedRunVersion: number;
}

export interface PerformHostedTechnicalLabActionCommand
  extends HostedTechnicalLabCommandBase {
  readonly commandType: "PERFORM_TECHNICAL_LAB_ACTION";
  readonly actionType: TechnicalExperimentActionType;
  readonly operandA?: number;
  readonly operandB?: number;
}

export interface SubmitHostedTechnicalLabResponseCommand
  extends HostedTechnicalLabCommandBase {
  readonly commandType: "SUBMIT_TECHNICAL_LAB_RESPONSE";
  readonly kind: TechnicalLabCheckpointKind;
  readonly optionId: string;
}

export interface OpenHostedTechnicalLabHintCommand
  extends HostedTechnicalLabCommandBase {
  readonly commandType: "OPEN_TECHNICAL_LAB_HINT";
}

export interface AdvanceHostedTechnicalLabModuleCommand
  extends HostedTechnicalLabCommandBase {
  readonly commandType: "ADVANCE_TECHNICAL_LAB_MODULE";
}

export type HostedTechnicalLabCommand =
  | PerformHostedTechnicalLabActionCommand
  | SubmitHostedTechnicalLabResponseCommand
  | OpenHostedTechnicalLabHintCommand
  | AdvanceHostedTechnicalLabModuleCommand;

function requestDigest(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

function snapshotHash(snapshot: TechnicalLabSnapshot): string {
  return sha256Hex(canonicalize(snapshot));
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      `${path} must be a non-empty string.`,
    );
  }
  return value;
}

function requiredInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value)) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      `${path} must be an integer.`,
    );
  }
  return value as number;
}

function elapsedSeconds(startedAt: string, endedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "Technical Laboratory event timestamps are invalid.",
    );
  }
  return Math.max(0, Math.floor((end - start) / 1_000));
}

const WITHHELD_CORRECT_OPTION_ID =
  "__SIMULEDGER_CORRECT_OPTION_WITHHELD__";

function learnerSafeCheckpoint(
  definition: TechnicalLabCheckpointDefinition,
  feedbackReleased: boolean,
): TechnicalLabCheckpointDefinition {
  return feedbackReleased
    ? definition
    : {
        ...definition,
        correctOptionId: WITHHELD_CORRECT_OPTION_ID,
      };
}

function learnerSafeReplay(
  replay: TechnicalLabReplay,
  revealAllAnswers: boolean,
): TechnicalLabReplay {
  return {
    ...replay,
    modules: replay.modules.map((module) => {
      const interpretation = learnerSafeCheckpoint(
        module.interpretation.definition,
        revealAllAnswers || module.interpretation.attempts > 0,
      );
      const application = learnerSafeCheckpoint(
        module.application.definition,
        revealAllAnswers || module.application.attempts > 0,
      );
      return {
        ...module,
        module: {
          ...module.module,
          interpretationItem: interpretation,
          applicationItem: application,
        },
        interpretation: {
          ...module.interpretation,
          definition: interpretation,
        },
        application: {
          ...module.application,
          definition: application,
        },
      };
    }),
  };
}

export class HostedTechnicalLabRunService {
  private readonly configuration =
    hostedTechnicalLabConfiguration("vi");
  private readonly runtime: TechnicalLabEngineRuntime;
  private readonly configurationHash: string;

  constructor(
    private readonly eventStore: RunEventStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {
    this.configurationHash =
      experienceConfigurationHash(this.configuration);
    this.runtime = {
      configurationHash: this.configurationHash,
      bundle: permissionedFoundationsLabBundle,
      cryptographicRuntime: technicalLabCryptographicRuntime,
    };
  }

  async createRun(
    principal: ApplicationPrincipal | null,
    request: CreateHostedRuntimeRunRequest,
  ): Promise<HostedRuntimeRunResult> {
    const creator = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "administrator",
    ]);
    if (creator.roles.includes("learner")) {
      requireAssignedLearner(creator, request.learnerUserId);
    }
    if (
      request.mode !== "tutorial" ||
      request.modeConfiguration?.mode !== "tutorial"
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "The first hosted Technical Laboratory uses its fixed tutorial configuration.",
      );
    }
    const digest = requestDigest(request);
    const existing = await this.eventStore.load(request.runId);
    if (existing.length > 0) {
      const prior = existing.filter(
        (event) => event.causationId === request.commandId,
      );
      if (prior.length > 0) {
        if (prior[0]?.payload.requestDigest !== digest) {
          throw new HostedRunCommandError(
            "COMMAND_ID_REUSED",
            "The Technical Laboratory start command was reused with different content.",
          );
        }
        return {
          state: this.summary(await this.replayEvents(existing)),
          appendedEventIds: prior.map((event) => event.eventId),
          wasIdempotentReplay: true,
        };
      }
      throw new HostedRunCommandError(
        "RUN_ALREADY_EXISTS",
        `Run ${request.runId} already exists.`,
      );
    }
    const snapshot = emptyTechnicalLabSnapshot();
    const now = this.clock.now();
    const event: UnsequencedRunEventV1 = {
      eventId: this.ids.nextId("HEVT"),
      runId: request.runId,
      idempotencyKey: `${request.commandId}:0`,
      serverTimestampUtc: now,
      authenticatedUserId: creator.userId,
      simulationActorId: request.learnerUserId,
      organizationId: LAB_ORGANIZATION_ID,
      roleId: LAB_ROLE_ID,
      eventType: "RUN_CREATED",
      packId: technicalLabHostedPackAdapter.packId,
      packVersion: technicalLabHostedPackAdapter.version,
      scenarioId: TECHNICAL_LAB_HOSTED_SCENARIO_ID,
      scenarioVersion: TECHNICAL_LAB_HOSTED_SCENARIO_VERSION,
      payload: {
        assignmentId: request.assignmentId,
        learnerUserId: request.learnerUserId,
        configurationHash: this.configurationHash,
        locale: "vi",
        requestDigest: digest,
      },
      causationId: request.commandId,
      correlationId: request.runId,
      previousStateHash: snapshotHash(snapshot),
      resultingStateHash: snapshotHash(snapshot),
    };
    const appended = await this.eventStore.append({
      runId: request.runId,
      expectedNextSequenceNumber: 1,
      events: [event],
    });
    const state = await this.replayEvents(
      await this.eventStore.load(request.runId),
    );
    return {
      state: this.summary(state),
      appendedEventIds: appended.events.map(
        (candidate) => candidate.eventId,
      ),
      wasIdempotentReplay: appended.wasIdempotentReplay,
    };
  }

  async submit(
    principal: ApplicationPrincipal | null,
    command: HostedTechnicalLabCommand,
  ): Promise<HostedRuntimeRunResult> {
    const events = await this.eventStore.load(command.runId);
    if (events.length === 0) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        `Run ${command.runId} does not exist.`,
      );
    }
    const state = await this.replayEvents(events);
    requireAssignedLearner(principal, state.learnerUserId);
    const digest = requestDigest(command);
    const prior = events.filter(
      (event) => event.causationId === command.commandId,
    );
    if (prior.length > 0) {
      if (prior[0]?.payload.requestDigest !== digest) {
        throw new HostedRunCommandError(
          "COMMAND_ID_REUSED",
          "The Technical Laboratory command was reused with different content.",
        );
      }
      return {
        state: this.summary(state),
        appendedEventIds: prior.map((event) => event.eventId),
        wasIdempotentReplay: true,
      };
    }
    if (state.status === "completed") {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "The Technical Laboratory run is already complete.",
      );
    }
    if (
      !Number.isInteger(command.expectedRunVersion) ||
      command.expectedRunVersion !== state.version
    ) {
      throw new HostedRunCommandError(
        "RUN_VERSION_CONFLICT",
        "The Technical Laboratory command used a stale run version.",
      );
    }
    const prospective = await this.applyCommand(
      state.snapshot,
      command,
    );
    if (
      canonicalize(prospective) === canonicalize(state.snapshot)
    ) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "The Technical Laboratory command would not change the run.",
      );
    }
    const prospectiveReplay = await replayTechnicalLab(
      this.runtime,
      prospective,
    );
    const primary = this.commandEvent({
      state,
      principal: requireApplicationRole(principal, ["learner"]),
      command,
      requestDigest: digest,
      snapshot: prospective,
    });
    const batch: UnsequencedRunEventV1[] = [primary];
    if (prospectiveReplay.complete) {
      batch.push({
        ...primary,
        eventId: this.ids.nextId("HEVT"),
        idempotencyKey: `${command.commandId}:1`,
        eventType: "RUN_COMPLETED",
        payload: {
          requestDigest: digest,
          totalScore: prospectiveReplay.score.totalScore,
          passScore: prospectiveReplay.score.passScore,
          passed: prospectiveReplay.score.passed,
        },
        previousStateHash: primary.resultingStateHash,
        resultingStateHash: primary.resultingStateHash,
      });
    }
    const appended = await this.eventStore.append({
      runId: command.runId,
      expectedNextSequenceNumber: state.version + 1,
      events: batch,
    });
    const next = await this.replayEvents(
      await this.eventStore.load(command.runId),
    );
    return {
      state: this.summary(next),
      appendedEventIds: appended.events.map(
        (event) => event.eventId,
      ),
      wasIdempotentReplay: appended.wasIdempotentReplay,
    };
  }

  async learnerProjection(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<LearnerRunProjectionV1> {
    const state = await this.loadDetailedState(runId);
    const actor = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "rater",
      "administrator",
    ]);
    if (actor.roles.includes("learner")) {
      requireAssignedLearner(actor, state.learnerUserId);
    }
    return this.projection(state);
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
    await this.replayEvents(events);
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
    const state = await this.replayEvents(events);
    const projection = this.projection(state);
    return {
      runId,
      learnerUserId: state.learnerUserId,
      status: state.status,
      eventCount: events.length,
      currentStageId:
        projection.workflowState.currentNodeId,
      activeRoleId: LAB_ROLE_ID,
      elapsedSeconds: elapsedSeconds(
        first.serverTimestampUtc,
        state.status === "completed"
          ? last.serverTimestampUtc
          : observedAt,
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
    const sequence = throughSequenceNumber ?? events.length;
    if (
      !Number.isInteger(sequence) ||
      sequence < 1 ||
      sequence > events.length
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "The Technical Laboratory replay boundary is invalid.",
      );
    }
    const bounded = events.slice(0, sequence);
    const selected = bounded.at(-1)!;
    const state = await this.replayEvents(bounded);
    return {
      schemaVersion: "1.0.0",
      runId,
      assignmentId: state.assignmentId,
      learnerUserId: state.learnerUserId,
      packId: state.packId,
      packVersion: state.packVersion,
      scenarioId: state.scenarioId,
      scenarioVersion: state.scenarioVersion,
      throughSequenceNumber: sequence,
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
      projection: this.projection(state, true),
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
    const state = await this.loadDetailedState(runId);
    if (state.status === "active") {
      return {
        runId,
        learnerUserId: state.learnerUserId,
        status: "active",
        decisionItems: [],
        realizedOutcome: null,
      };
    }
    return {
      runId,
      learnerUserId: state.learnerUserId,
      status: "completed",
      decisionItems: state.replay.modules.flatMap((module) => [
        {
          decisionItemId:
            module.interpretation.definition.itemId,
          isAuthoredCorrect: module.interpretation.correct,
        },
        {
          decisionItemId:
            module.application.definition.itemId,
          isAuthoredCorrect: module.application.correct,
        },
      ]),
      realizedOutcome: null,
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
    return this.competencyEvidence(runId);
  }

  async learnerCompetencyEvidence(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly CompetencyEvidenceProjection[]> {
    const state = await this.loadDetailedState(runId);
    requireAssignedLearner(principal, state.learnerUserId);
    return this.competencyEvidence(runId);
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
    await this.loadDetailedState(runId);
    return [];
  }

  async loadState(runId: string): Promise<HostedRuntimeStateSummary> {
    return this.summary(await this.loadDetailedState(runId));
  }

  async officialGrade(runId: string) {
    const state = await this.loadDetailedState(runId);
    if (state.status !== "completed") return null;
    return {
      gradingProgress: "FullyGraded" as const,
      scoreGiven: state.replay.score.totalScore,
      scoreMaximum: 100 as const,
    };
  }

  private async competencyEvidence(
    runId: string,
  ): Promise<readonly CompetencyEvidenceProjection[]> {
    const events = await this.eventStore.load(runId);
    const state = await this.replayEvents(events);
    return state.replay.modules.map((module) => {
      const moduleEvents = events.filter(
        (event) =>
          event.payload.moduleIndex ===
          state.replay.modules.indexOf(module),
      );
      const evidence: HostedCompetencyEvidence[] =
        module.complete
          ? [
              {
                competencyEvidenceId:
                  `LAB_EVIDENCE_${module.module.moduleId}`,
                evidenceRuleId:
                  `LAB_RULE_${module.module.moduleId}`,
                indicatorIds: [
                  `LAB_OUTCOME_${module.module.moduleId}`,
                ],
                sourceEventIds: moduleEvents.map(
                  (event) => event.eventId,
                ),
                observedAt:
                  moduleEvents.at(-1)?.serverTimestampUtc ??
                  events.at(-1)!.serverTimestampUtc,
              },
            ]
          : [];
      return {
        indicatorId:
          `LAB_OUTCOME_${module.module.moduleId}`,
        evidence,
      };
    });
  }

  private summary(
    state: HostedTechnicalLabRunState,
  ): HostedRuntimeStateSummary {
    return {
      runId: state.runId,
      assignmentId: state.assignmentId,
      learnerUserId: state.learnerUserId,
      packId: state.packId,
      packVersion: state.packVersion,
      scenarioId: state.scenarioId,
      scenarioVersion: state.scenarioVersion,
      version: state.version,
      status: state.status,
    };
  }

  private projection(
    state: HostedTechnicalLabRunState,
    revealAllAnswers = false,
  ): LearnerRunProjectionV1 {
    const current =
      state.replay.modules[state.snapshot.currentModuleIndex]!;
    const permittedActionIds =
      state.status === "completed"
        ? []
        : state.replay.expectedAction !== null
          ? [
              `TECHNICAL_LAB_ACTION:${state.replay.expectedAction.actionType}`,
            ]
          : !current.interpretation.terminal ||
              !current.application.terminal
            ? [
                "SUBMIT_TECHNICAL_LAB_RESPONSE",
                ...(current.hintOpened ||
                current.interpretation.terminal
                  ? []
                  : ["OPEN_TECHNICAL_LAB_HINT"]),
              ]
            : current.complete
              ? ["ADVANCE_TECHNICAL_LAB_MODULE"]
              : [];
    return {
      schemaVersion: "1.0.0",
      runId: state.runId,
      version: state.version,
      roleId: LAB_ROLE_ID,
      businessState: [],
      ledgerState: {},
      informationState: [],
      policyState: [],
      workflowState: {
        currentNodeId:
          state.status === "completed"
            ? "TECHNICAL_LAB_COMPLETE"
            : current.module.moduleId,
        completedNodeIds: state.replay.modules
          .filter((module) => module.complete)
          .map((module) => module.module.moduleId),
        permittedActionIds,
      },
      technicalLab: {
        schemaVersion: "1.0.0",
        configurationHash: state.configurationHash,
        labPackId: state.packId,
        labPackVersion: state.packVersion,
        locale: state.locale,
        replay: learnerSafeReplay(
          state.replay,
          revealAllAnswers,
        ),
      },
    };
  }

  private async loadDetailedState(
    runId: string,
  ): Promise<HostedTechnicalLabRunState> {
    const events = await this.eventStore.load(runId);
    if (events.length === 0) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        `Run ${runId} does not exist.`,
      );
    }
    return this.replayEvents(events);
  }

  private async replayEvents(
    events: readonly RunEventV1[],
  ): Promise<HostedTechnicalLabRunState> {
    const first = events[0];
    if (
      first === undefined ||
      first.eventType !== "RUN_CREATED" ||
      first.packId !== technicalLabHostedPackAdapter.packId ||
      first.packVersion !== technicalLabHostedPackAdapter.version ||
      first.scenarioId !== TECHNICAL_LAB_HOSTED_SCENARIO_ID ||
      first.scenarioVersion !==
        TECHNICAL_LAB_HOSTED_SCENARIO_VERSION
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The event stream is not a current Technical Laboratory run.",
      );
    }
    const configurationHash = requiredString(
      first.payload.configurationHash,
      "configurationHash",
    );
    if (configurationHash !== this.configurationHash) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The Technical Laboratory configuration hash is incompatible.",
      );
    }
    const assignmentId = requiredString(
      first.payload.assignmentId,
      "assignmentId",
    );
    const learnerUserId = requiredString(
      first.payload.learnerUserId,
      "learnerUserId",
    );
    const locale =
      first.payload.locale === "en" ? "en" : "vi";
    let snapshot = emptyTechnicalLabSnapshot();
    let status: "active" | "completed" = "active";
    let previousHash = snapshotHash(snapshot);
    for (const event of events) {
      if (
        event.runId !== first.runId ||
        event.packId !== first.packId ||
        event.packVersion !== first.packVersion ||
        event.scenarioId !== first.scenarioId ||
        event.scenarioVersion !== first.scenarioVersion ||
        event.organizationId !== LAB_ORGANIZATION_ID ||
        event.roleId !== LAB_ROLE_ID ||
        event.previousStateHash !== previousHash
      ) {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "Technical Laboratory event metadata or state hashes do not replay.",
        );
      }
      if (event !== first) {
        if (status === "completed") {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Technical Laboratory history continues after completion.",
          );
        }
        snapshot = await this.applyEventWithReplay(
          snapshot,
          event,
        );
        if (event.eventType === "RUN_COMPLETED") {
          status = "completed";
        }
      }
      const resultingHash = snapshotHash(snapshot);
      if (event.resultingStateHash !== resultingHash) {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "Technical Laboratory resulting state hash does not replay.",
        );
      }
      previousHash = resultingHash;
    }
    const replay = await replayTechnicalLab(
      this.runtime,
      snapshot,
    );
    if (
      (status === "completed") !== replay.complete
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Technical Laboratory completion does not match replay.",
      );
    }
    return {
      runId: first.runId,
      assignmentId,
      learnerUserId,
      packId: first.packId,
      packVersion: first.packVersion,
      scenarioId: first.scenarioId,
      scenarioVersion: first.scenarioVersion,
      version: events.length,
      status,
      configurationHash,
      locale,
      snapshot,
      replay,
    };
  }

  private applyEvent(
    snapshot: TechnicalLabSnapshot,
    event: RunEventV1,
  ): TechnicalLabSnapshot {
    switch (event.eventType) {
      case "TECHNICAL_LAB_ACTION_PERFORMED":
        return appendTechnicalLabAction({
          snapshot,
          bundle: permissionedFoundationsLabBundle,
          actionType: requiredString(
            event.payload.actionType,
            "actionType",
          ) as TechnicalExperimentActionType,
          operandA: requiredInteger(
            event.payload.operandA,
            "operandA",
          ),
          operandB: requiredInteger(
            event.payload.operandB,
            "operandB",
          ),
        });
      case "TECHNICAL_LAB_RESPONSE_SUBMITTED":
        return appendTechnicalLabResponse({
          snapshot,
          bundle: permissionedFoundationsLabBundle,
          kind: requiredString(
            event.payload.kind,
            "kind",
          ) as TechnicalLabCheckpointKind,
          optionId: requiredString(
            event.payload.optionId,
            "optionId",
          ),
        });
      case "TECHNICAL_LAB_HINT_OPENED":
        return openTechnicalLabHint({
          snapshot,
          bundle: permissionedFoundationsLabBundle,
        });
      case "TECHNICAL_LAB_MODULE_ADVANCED":
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "Module advancement requires replay context.",
        );
      case "RUN_COMPLETED":
        return snapshot;
      default:
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          `Unsupported Technical Laboratory event ${event.eventType}.`,
        );
    }
  }

  private async applyEventWithReplay(
    snapshot: TechnicalLabSnapshot,
    event: RunEventV1,
  ): Promise<TechnicalLabSnapshot> {
    if (event.eventType !== "TECHNICAL_LAB_MODULE_ADVANCED") {
      return this.applyEvent(snapshot, event);
    }
    return advanceTechnicalLabModule({
      replay: await replayTechnicalLab(this.runtime, snapshot),
    });
  }

  private async applyCommand(
    snapshot: TechnicalLabSnapshot,
    command: HostedTechnicalLabCommand,
  ): Promise<TechnicalLabSnapshot> {
    try {
      switch (command.commandType) {
        case "PERFORM_TECHNICAL_LAB_ACTION":
          return appendTechnicalLabAction({
            snapshot,
            bundle: permissionedFoundationsLabBundle,
            actionType: command.actionType,
            ...(command.operandA === undefined
              ? {}
              : { operandA: command.operandA }),
            ...(command.operandB === undefined
              ? {}
              : { operandB: command.operandB }),
          });
        case "SUBMIT_TECHNICAL_LAB_RESPONSE":
          return appendTechnicalLabResponse({
            snapshot,
            bundle: permissionedFoundationsLabBundle,
            kind: command.kind,
            optionId: command.optionId,
          });
        case "OPEN_TECHNICAL_LAB_HINT":
          return openTechnicalLabHint({
            snapshot,
            bundle: permissionedFoundationsLabBundle,
          });
        case "ADVANCE_TECHNICAL_LAB_MODULE":
          return advanceTechnicalLabModule({
            replay: await replayTechnicalLab(
              this.runtime,
              snapshot,
            ),
          });
      }
    } catch (error) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        error instanceof Error
          ? error.message
          : "Technical Laboratory command failed.",
      );
    }
  }

  private commandEvent(options: {
    readonly state: HostedTechnicalLabRunState;
    readonly principal: ApplicationPrincipal;
    readonly command: HostedTechnicalLabCommand;
    readonly requestDigest: string;
    readonly snapshot: TechnicalLabSnapshot;
  }): UnsequencedRunEventV1 {
    let commandPayload: JsonObject;
    let eventType:
      UnsequencedRunEventV1["eventType"];
    switch (options.command.commandType) {
      case "PERFORM_TECHNICAL_LAB_ACTION":
        eventType = "TECHNICAL_LAB_ACTION_PERFORMED";
        commandPayload = {
          actionType: options.command.actionType,
          operandA: options.command.operandA ?? 0,
          operandB: options.command.operandB ?? 0,
        };
        break;
      case "SUBMIT_TECHNICAL_LAB_RESPONSE":
        eventType = "TECHNICAL_LAB_RESPONSE_SUBMITTED";
        commandPayload = {
          kind: options.command.kind,
          optionId: options.command.optionId,
        };
        break;
      case "OPEN_TECHNICAL_LAB_HINT":
        eventType = "TECHNICAL_LAB_HINT_OPENED";
        commandPayload = {};
        break;
      case "ADVANCE_TECHNICAL_LAB_MODULE":
        eventType = "TECHNICAL_LAB_MODULE_ADVANCED";
        commandPayload = {};
        break;
    }
    const payload: JsonObject = {
      requestDigest: options.requestDigest,
      moduleIndex: options.state.snapshot.currentModuleIndex,
      ...commandPayload,
    };
    return {
      eventId: this.ids.nextId("HEVT"),
      runId: options.command.runId,
      idempotencyKey: `${options.command.commandId}:0`,
      serverTimestampUtc: this.clock.now(),
      authenticatedUserId: options.principal.userId,
      simulationActorId: options.state.learnerUserId,
      organizationId: LAB_ORGANIZATION_ID,
      roleId: LAB_ROLE_ID,
      eventType,
      packId: options.state.packId,
      packVersion: options.state.packVersion,
      scenarioId: options.state.scenarioId,
      scenarioVersion: options.state.scenarioVersion,
      payload,
      causationId: options.command.commandId,
      correlationId: options.command.runId,
      previousStateHash:
        snapshotHash(options.state.snapshot),
      resultingStateHash: snapshotHash(options.snapshot),
    };
  }
}
