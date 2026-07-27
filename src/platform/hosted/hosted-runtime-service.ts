import type {
  Clock,
  IdGenerator,
} from "../../domain/simulation/environment";
import type { HostedRunMonitorStatusV1 } from "../contracts/assessment";
import type {
  CreateCounterfactualBranchRequestV1,
} from "../contracts/counterfactual";
import type {
  HostedRunDecisionOutcomeEvidenceV1,
} from "../contracts/decision-outcome-report";
import type {
  LearnerRunAuthoredFeedbackV1,
  LearnerRunProjectionV1,
} from "../contracts/run-events";
import type { InstructorRunReplayV1 } from "../contracts/run-replay";
import type {
  InstructorIncidentStatusV1,
  ReleaseInstructorIncidentCommandV1,
} from "../contracts/simulation-director";
import type {
  HostedRunMode,
  HostedRunModeConfigurationV1,
  ScenarioPackV1,
} from "../contracts/scenario-pack";
import type { RunEventStore } from "../runs/event-store";
import type { CounterfactualBranchEngine } from "../runs/counterfactual-branch";
import type { SaveCounterfactualRunResult } from "../runs/counterfactual-repository";
import type { ApplicationPrincipal } from "./access";
import { GenericHostedRunService } from "./generic-run-service";
import type {
  CreateGenericHostedRunRequest,
  GenericHostedCommand,
} from "./generic-run-types";
import {
  hostedRuntimeKindFor,
  type HostedRuntimeKind,
} from "./runtime-registry";
import {
  HostedRunCommandError,
  HostedStage3RunService,
} from "./stage3-run-service";
import type {
  CompetencyEvidenceProjection,
  HostedStage3Command,
  InstructorTimelineItem,
  RubricEvidenceProjection,
  Stage3CaseVariant,
} from "./stage3-types";
import type { CounterfactualRuntimeMetrics } from "./counterfactual-metrics";
import { AuditHostedRunService } from "../audit/audit-run-service";
import type { AuditHostedCommand } from "../audit/audit-run-types";

export interface CreateHostedRuntimeRunRequest {
  readonly commandId: string;
  readonly runId: string;
  readonly assignmentId: string;
  readonly learnerUserId: string;
  readonly mode: HostedRunMode;
  readonly modeConfiguration?: HostedRunModeConfigurationV1;
  readonly scenarioSeed?: string;
  readonly caseVariant?: string;
}

export type HostedRuntimeCommand =
  | GenericHostedCommand
  | AuditHostedCommand
  | HostedStage3Command;

export interface HostedRuntimeStateSummary {
  readonly runId: string;
  readonly assignmentId: string;
  readonly learnerUserId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly version: number;
  readonly status: "active" | "completed";
}

export interface HostedRuntimeRunResult {
  readonly state: HostedRuntimeStateSummary;
  readonly appendedEventIds: readonly string[];
  readonly wasIdempotentReplay: boolean;
}

export interface HostedRuntimeService {
  readonly runtimeKind: HostedRuntimeKind;
  createRun(
    principal: ApplicationPrincipal | null,
    request: CreateHostedRuntimeRunRequest,
  ): Promise<HostedRuntimeRunResult>;
  submit(
    principal: ApplicationPrincipal | null,
    command: HostedRuntimeCommand,
  ): Promise<HostedRuntimeRunResult>;
  instructorIncidents(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly InstructorIncidentStatusV1[]>;
  releaseInstructorIncident(
    principal: ApplicationPrincipal | null,
    command: ReleaseInstructorIncidentCommandV1,
  ): Promise<HostedRuntimeRunResult>;
  createCounterfactualBranch(
    principal: ApplicationPrincipal | null,
    request: CreateCounterfactualBranchRequestV1,
  ): Promise<SaveCounterfactualRunResult>;
  submitCounterfactual(
    principal: ApplicationPrincipal | null,
    command: HostedRuntimeCommand,
  ): Promise<HostedRuntimeRunResult>;
  counterfactualProjection(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<LearnerRunProjectionV1>;
  counterfactualSourceProjection(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<LearnerRunProjectionV1>;
  counterfactualForkProjection(
    principal: ApplicationPrincipal | null,
    sourceRunId: string,
    forkSequenceNumber: number,
    roleId: string,
  ): Promise<LearnerRunProjectionV1>;
  counterfactualMetrics(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<CounterfactualRuntimeMetrics>;
  learnerProjection(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<LearnerRunProjectionV1>;
  instructorTimeline(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly InstructorTimelineItem[]>;
  instructorMonitor(
    principal: ApplicationPrincipal | null,
    runId: string,
    observedAt?: string,
  ): Promise<HostedRunMonitorStatusV1>;
  instructorReplay(
    principal: ApplicationPrincipal | null,
    runId: string,
    throughSequenceNumber?: number,
  ): Promise<InstructorRunReplayV1>;
  instructorDecisionOutcomeEvidence(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<HostedRunDecisionOutcomeEvidenceV1>;
  competencyReport(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly CompetencyEvidenceProjection[]>;
  learnerCompetencyEvidence(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly CompetencyEvidenceProjection[]>;
  learnerAuthoredFeedback(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly LearnerRunAuthoredFeedbackV1[]>;
  rubricEvidence(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly RubricEvidenceProjection[]>;
  loadState(runId: string): Promise<HostedRuntimeStateSummary>;
}

function isStage3CaseVariant(value: string): value is Stage3CaseVariant {
  return (
    value === "authorized-certifier" ||
    value === "unauthorized-transporter"
  );
}

export function createHostedRuntimeService(options: {
  readonly pack: ScenarioPackV1;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly eventStore: RunEventStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly counterfactualBranches?: CounterfactualBranchEngine;
}): HostedRuntimeService {
  const scenario = options.pack.scenarios.find(
    (candidate) =>
      candidate.scenarioId === options.scenarioId &&
      candidate.version === options.scenarioVersion,
  );
  if (scenario === undefined) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "The hosted runtime requires one exact scenario version.",
    );
  }
  const runtimeKind = hostedRuntimeKindFor(scenario);
  if (runtimeKind === null) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "The selected scenario has no registered hosted runtime.",
    );
  }
  if (runtimeKind === "generic-v1") {
    const service = new GenericHostedRunService(
      options.pack,
      options.scenarioId,
      options.scenarioVersion,
      options.eventStore,
      options.clock,
      options.ids,
      options.counterfactualBranches,
    );
    return {
      runtimeKind,
      createRun: (principal, request) =>
        service.createRun(
          principal,
          request as CreateGenericHostedRunRequest,
        ),
      submit: (principal, command) =>
        service.submit(principal, command as GenericHostedCommand),
      instructorIncidents: (principal, runId) =>
        service.instructorIncidents(principal, runId),
      releaseInstructorIncident: (principal, command) =>
        service.releaseInstructorIncident(principal, command),
      createCounterfactualBranch: (principal, request) =>
        service.createCounterfactualBranch(principal, request),
      submitCounterfactual: (principal, command) =>
        service.submitCounterfactual(
          principal,
          command as GenericHostedCommand,
        ),
      counterfactualProjection: (principal, runId) =>
        service.counterfactualProjection(principal, runId),
      counterfactualSourceProjection: (principal, runId) =>
        service.counterfactualSourceProjection(principal, runId),
      counterfactualForkProjection: (
        principal,
        runId,
        sequence,
        roleId,
      ) =>
        service.counterfactualForkProjection(
          principal,
          runId,
          sequence,
          roleId,
        ),
      counterfactualMetrics: (principal, runId) =>
        service.counterfactualMetrics(principal, runId),
      learnerProjection: (principal, runId) =>
        service.learnerProjection(principal, runId),
      instructorTimeline: (principal, runId) =>
        service.instructorTimeline(principal, runId),
      instructorMonitor: (principal, runId, observedAt) =>
        service.instructorMonitor(principal, runId, observedAt),
      instructorReplay: (principal, runId, sequence) =>
        service.instructorReplay(principal, runId, sequence),
      instructorDecisionOutcomeEvidence: (principal, runId) =>
        service.instructorDecisionOutcomeEvidence(principal, runId),
      competencyReport: (principal, runId) =>
        service.competencyReport(principal, runId),
      learnerCompetencyEvidence: (principal, runId) =>
        service.learnerCompetencyEvidence(principal, runId),
      learnerAuthoredFeedback: (principal, runId) =>
        service.learnerAuthoredFeedback(principal, runId),
      rubricEvidence: (principal, runId) =>
        service.rubricEvidence(principal, runId),
      loadState: (runId) => service.loadState(runId),
    };
  }
  if (runtimeKind === "audit-v1") {
    const service = new AuditHostedRunService(
      options.pack,
      options.scenarioId,
      options.scenarioVersion,
      options.eventStore,
      options.clock,
      options.ids,
    );
    const unsupported = (): never => {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "Counterfactual replay is not authored for Guided Audit.",
      );
    };
    return {
      runtimeKind,
      createRun: (principal, request) =>
        service.createRun(principal, {
          commandId: request.commandId,
          runId: request.runId,
          assignmentId: request.assignmentId,
          learnerUserId: request.learnerUserId,
          mode: request.mode,
          ...(request.modeConfiguration === undefined
            ? {}
            : {
                modeConfiguration:
                  request.modeConfiguration,
              }),
        }),
      submit: (principal, command) =>
        service.submit(principal, command as AuditHostedCommand),
      instructorIncidents: async () => [],
      releaseInstructorIncident: async () => unsupported(),
      createCounterfactualBranch: async () => unsupported(),
      submitCounterfactual: async () => unsupported(),
      counterfactualProjection: async () => unsupported(),
      counterfactualSourceProjection: async () => unsupported(),
      counterfactualForkProjection: async () => unsupported(),
      counterfactualMetrics: async () => unsupported(),
      learnerProjection: (principal, runId) =>
        service.learnerProjection(principal, runId),
      instructorTimeline: (principal, runId) =>
        service.instructorTimeline(principal, runId),
      instructorMonitor: (principal, runId, observedAt) =>
        service.instructorMonitor(principal, runId, observedAt),
      instructorReplay: (principal, runId, sequence) =>
        service.instructorReplay(principal, runId, sequence),
      instructorDecisionOutcomeEvidence: (principal, runId) =>
        service.instructorDecisionOutcomeEvidence(
          principal,
          runId,
        ),
      competencyReport: (principal, runId) =>
        service.competencyReport(principal, runId),
      learnerCompetencyEvidence: (principal, runId) =>
        service.learnerCompetencyEvidence(principal, runId),
      learnerAuthoredFeedback: async () => [],
      rubricEvidence: (principal, runId) =>
        service.rubricEvidence(principal, runId),
      loadState: (runId) => service.loadState(runId),
    };
  }

  const service = new HostedStage3RunService(
    options.pack,
    options.eventStore,
    options.clock,
    options.ids,
    options.counterfactualBranches,
  );
  return {
    runtimeKind,
    createRun: (principal, request) => {
      const caseVariant = request.caseVariant;
      if (
        caseVariant === undefined ||
        !isStage3CaseVariant(caseVariant)
      ) {
        throw new HostedRunCommandError(
          "INVALID_COMMAND",
          "The coffee runtime requires a scenario-controlled case variant.",
        );
      }
      return service.createRun(principal, {
        commandId: request.commandId,
        runId: request.runId,
        assignmentId: request.assignmentId,
        learnerUserId: request.learnerUserId,
        mode: request.mode,
        ...(request.modeConfiguration === undefined
          ? {}
          : { modeConfiguration: request.modeConfiguration }),
        ...(request.scenarioSeed === undefined
          ? {}
          : { scenarioSeed: request.scenarioSeed }),
        caseVariant,
      });
    },
    submit: (principal, command) =>
      service.submit(principal, command as HostedStage3Command),
    instructorIncidents: async () => [],
    releaseInstructorIncident: async () => {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "The selected scenario has no authored instructor incidents.",
      );
    },
    createCounterfactualBranch: (principal, request) =>
      service.createCounterfactualBranch(principal, request),
    submitCounterfactual: (principal, command) =>
      service.submitCounterfactual(
        principal,
        command as HostedStage3Command,
      ),
    counterfactualProjection: (principal, runId) =>
      service.counterfactualProjection(principal, runId),
    counterfactualSourceProjection: (principal, runId) =>
      service.counterfactualSourceProjection(principal, runId),
    counterfactualForkProjection: (
      principal,
      runId,
      sequence,
      roleId,
    ) =>
      service.counterfactualForkProjection(
        principal,
        runId,
        sequence,
        roleId,
      ),
    counterfactualMetrics: (principal, runId) =>
      service.counterfactualMetrics(principal, runId),
    learnerProjection: (principal, runId) =>
      service.learnerProjection(principal, runId),
    instructorTimeline: (principal, runId) =>
      service.instructorTimeline(principal, runId),
    instructorMonitor: (principal, runId, observedAt) =>
      service.instructorMonitor(principal, runId, observedAt),
    instructorReplay: (principal, runId, sequence) =>
      service.instructorReplay(principal, runId, sequence),
    instructorDecisionOutcomeEvidence: (principal, runId) =>
      service.instructorDecisionOutcomeEvidence(principal, runId),
    competencyReport: (principal, runId) =>
      service.competencyReport(principal, runId),
    learnerCompetencyEvidence: (principal, runId) =>
      service.learnerCompetencyEvidence(principal, runId),
    learnerAuthoredFeedback: async () => [],
    rubricEvidence: (principal, runId) =>
      service.rubricEvidence(principal, runId),
    loadState: (runId) => service.loadState(runId),
  };
}
