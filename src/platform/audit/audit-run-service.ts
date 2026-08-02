import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type {
  Clock,
  IdGenerator,
} from "../../domain/simulation/environment";
import type { TrustedExecutionContext } from "../../domain/simulation/types";
import type {
  AuditConclusionSubmissionV1,
  AuditFindingSubmissionV1,
  AuditLearnerProjectionV1,
  AuditVariantAssignmentV1,
} from "../contracts/audit";
import type { HostedRunMonitorStatusV1 } from "../contracts/assessment";
import type {
  HostedRunDecisionOutcomeEvidenceV1,
} from "../contracts/decision-outcome-report";
import type { JsonObject } from "../contracts/json";
import type {
  LearnerRunLocalizedTextV1,
  LearnerRunProjectionV1,
  PlatformRunEventType,
  RunEventV1,
  UnsequencedRunEventV1,
} from "../contracts/run-events";
import type { InstructorRunReplayV1 } from "../contracts/run-replay";
import type {
  HostedRunModeConfigurationV1,
  ScenarioDefinitionV1,
  ScenarioPackV2,
} from "../contracts/scenario-pack";
import {
  HostedAuthorizationError,
  requireApplicationRole,
  requireAssignedLearner,
  type ApplicationPrincipal,
} from "../hosted/access";
import { HostedRunCommandError } from "../hosted/run-command-error";
import type {
  CompetencyEvidenceProjection,
  InstructorTimelineItem,
  RubricEvidenceProjection,
} from "../hosted/stage3-types";
import type { RunEventStore } from "../runs/event-store";
import {
  assertHostedExperienceIdentity,
  resolveHostedExperienceConfiguration,
} from "../runs/experience-configuration";
import { validateHostedModeConfiguration } from "../runs/mode-configuration";
import { hashReplayState, replayRunEvents } from "../runs/replay";
import {
  classifyAuditFinding,
  createAuditReport,
} from "./audit-scoring";
import { resolveAuditVariant } from "./audit-variant-bank";
import type {
  AuditFindingInputV1,
  AuditHostedCommand,
  AuditHostedRunStateV1,
} from "./audit-run-types";

const FORBIDDEN_IDENTITY_FIELDS = new Set([
  "actorId",
  "authenticatedUserId",
  "organizationId",
  "roleId",
  "simulationActorId",
]);

interface CreateAuditHostedRunRequest {
  readonly commandId: string;
  readonly runId: string;
  readonly assignmentId: string;
  readonly learnerUserId: string;
  readonly mode: "tutorial" | "standard" | "sandbox" | "configured";
  readonly modeConfiguration?: HostedRunModeConfigurationV1;
}

interface BuiltAuditEvent {
  readonly unsequenced: UnsequencedRunEventV1;
  readonly sequenced: RunEventV1;
  readonly nextState: AuditHostedRunStateV1;
}

function isObject(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requiredString(
  value: unknown,
  path: string,
  maximumLength = 2_000,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximumLength
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      `${path} must contain from 1 to ${String(maximumLength)} characters.`,
    );
  }
  return value;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function requiredUtf8String(
  value: unknown,
  path: string,
  maximumBytes: number,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    utf8Length(value) > maximumBytes
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      `${path} must contain from 1 to ${String(maximumBytes)} UTF-8 bytes.`,
    );
  }
  return value;
}

function boundedUtf8String(
  value: unknown,
  path: string,
  maximumBytes: number,
): string {
  if (
    typeof value !== "string" ||
    utf8Length(value) > maximumBytes
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      `${path} must contain no more than ${String(maximumBytes)} UTF-8 bytes.`,
    );
  }
  return value;
}

function stringArray(value: unknown, path: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (item) =>
        typeof item !== "string" ||
        item.trim().length === 0,
    )
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      `${path} must be a string array.`,
    );
  }
  return [...new Set(value as readonly string[])];
}

function finiteNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      `${path} must be from ${String(minimum)} to ${String(maximum)}.`,
    );
  }
  return value;
}

function rejectSelfAssertedIdentity(
  value: unknown,
  path = "command",
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      rejectSelfAssertedIdentity(
        item,
        `${path}[${String(index)}]`,
      ),
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

function requestDigest(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

function submittedCommandIntent(
  command: AuditHostedCommand,
): JsonObject {
  const {
    commandId: _commandId,
    runId: _runId,
    expectedRunVersion: _expectedRunVersion,
    ...intent
  } = command;
  return JSON.parse(canonicalize(intent)) as JsonObject;
}

function withSubmittedCommand(
  events: readonly BuiltAuditEvent[],
  command: AuditHostedCommand,
): readonly UnsequencedRunEventV1[] {
  const intent = submittedCommandIntent(command);
  return events.map((event, index) =>
    index === 0
      ? {
          ...event.unsequenced,
          payload: {
            ...event.unsequenced.payload,
            submittedCommand: intent,
          },
        }
      : event.unsequenced,
  );
}

function asJsonObject(value: unknown): JsonObject {
  return JSON.parse(canonicalize(value)) as JsonObject;
}

export class AuditHostedRunService {
  private readonly scenario: ScenarioDefinitionV1;
  private readonly auditCase: NonNullable<
    ScenarioDefinitionV1["auditCase"]
  >;

  constructor(
    private readonly pack: ScenarioPackV2,
    scenarioId: string,
    scenarioVersion: string,
    private readonly eventStore: RunEventStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly variantAssignment:
      AuditVariantAssignmentV1 | null = null,
  ) {
    const scenario = pack.scenarios.find(
      (candidate) =>
        candidate.scenarioId === scenarioId &&
        candidate.version === scenarioVersion,
    );
    if (
      scenario === undefined ||
      scenario.hostedRuntime?.runtimeId !==
        "tracechain-audit-v1" ||
      scenario.auditCase === undefined ||
      scenario.hostedRuntime.auditCaseId !==
        scenario.auditCase.auditCaseId
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The selected scenario is not a valid Audit runtime.",
      );
    }
    this.scenario = scenario;
    this.auditCase = scenario.auditCase;
    if (variantAssignment !== null) {
      const bank = pack.auditVariantBanks.find(
        (candidate) =>
          candidate.bankId === variantAssignment.bankId &&
          candidate.bankVersion ===
            variantAssignment.bankVersion,
      );
      if (bank === undefined) {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "The Audit variant assignment does not identify a bank in this pack.",
        );
      }
      const selected = resolveAuditVariant({
        pack,
        bank,
        assignment: variantAssignment,
      });
      if (
        selected.scenario.scenarioId !== scenario.scenarioId ||
        selected.scenario.version !== scenario.version
      ) {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "The Audit variant assignment does not identify the selected case.",
        );
      }
    }
  }

  async createRun(
    principal: ApplicationPrincipal | null,
    request: CreateAuditHostedRunRequest,
  ) {
    const creator = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "administrator",
    ]);
    if (
      creator.roles.includes("learner") &&
      creator.userId !== request.learnerUserId
    ) {
      throw new HostedAuthorizationError(
        "RUN_ACCESS_DENIED",
        "A learner may only start their own assigned audit.",
      );
    }
    if (!this.scenario.supportedModes.includes(request.mode)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "The requested mode does not match this Audit support profile.",
      );
    }
    const modeConfiguration = validateHostedModeConfiguration(
      request.modeConfiguration ??
        this.scenario.modeConfigurations.find(
          (configuration) => configuration.mode === request.mode,
        ),
      request.mode,
    );
    const experience = resolveHostedExperienceConfiguration({
      packId: this.pack.packId,
      packVersion: this.pack.version,
      scenario: this.scenario,
      runtimeConfiguration: modeConfiguration,
      locale: this.pack.supportedLocales.includes("vi")
        ? "vi"
        : "en",
    });
    const digest = requestDigest(request);
    const existingEvents = await this.eventStore.load(request.runId);
    if (existingEvents.length > 0) {
      const existing = existingEvents.filter(
        (event) => event.causationId === request.commandId,
      );
      if (
        existing.length > 0 &&
        existing[0]?.payload.requestDigest === digest
      ) {
        return {
          state: this.replay(existingEvents),
          appendedEventIds: existing.map((event) => event.eventId),
          wasIdempotentReplay: true,
        };
      }
      throw new HostedRunCommandError(
        existing.length > 0
          ? "COMMAND_ID_REUSED"
          : "RUN_ALREADY_EXISTS",
        `Run ${request.runId} or its creation command already exists.`,
      );
    }
    const context = this.trustedContextFor(request.learnerUserId);
    const events: BuiltAuditEvent[] = [];
    const created = this.buildEvent({
      runId: request.runId,
      state: null,
      principal: creator,
      context,
      commandId: request.commandId,
      commandDigest: digest,
      batchIndex: 0,
      eventType: "RUN_CREATED",
      payload: {
        assignmentId: request.assignmentId,
        learnerUserId: request.learnerUserId,
        modeConfiguration: asJsonObject(modeConfiguration),
        experienceConfiguration: asJsonObject(
          experience.configuration,
        ),
        experienceConfigurationHash:
          experience.configurationHash,
        packContentHash: this.packContentHash(),
        sourceStateHash: this.sourceStateHash(),
        ...(this.variantAssignment === null
          ? {}
          : {
              variantAssignment: asJsonObject(
                this.variantAssignment,
              ),
            }),
      },
    });
    events.push(created);
    const opened = this.buildEvent({
      runId: request.runId,
      state: created.nextState,
      principal: creator,
      context,
      commandId: request.commandId,
      commandDigest: digest,
      batchIndex: 1,
      eventType: "AUDIT_CASE_OPENED",
      payload: {
        auditCaseId: this.auditCase.auditCaseId,
        auditCaseVersion: this.auditCase.version,
      },
    });
    events.push(opened);
    const appended = await this.eventStore.append({
      runId: request.runId,
      expectedNextSequenceNumber: 1,
      events: events.map((event) => event.unsequenced),
    });
    return {
      state: opened.nextState,
      appendedEventIds: appended.events.map((event) => event.eventId),
      wasIdempotentReplay: appended.wasIdempotentReplay,
    };
  }

  async submit(
    principal: ApplicationPrincipal | null,
    command: AuditHostedCommand,
  ) {
    rejectSelfAssertedIdentity(command);
    const learner = requireApplicationRole(principal, ["learner"]);
    const events = await this.eventStore.load(command.runId);
    if (events.length === 0) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        `Run ${command.runId} does not exist.`,
      );
    }
    const priorCommandEvents = events.filter(
      (event) => event.causationId === command.commandId,
    );
    const digest = requestDigest(command);
    if (priorCommandEvents.length > 0) {
      if (
        priorCommandEvents[0]?.payload.requestDigest !== digest
      ) {
        throw new HostedRunCommandError(
          "COMMAND_ID_REUSED",
          `Command ${command.commandId} was reused with different content.`,
        );
      }
      return {
        state: this.replay(events),
        appendedEventIds: priorCommandEvents.map(
          (event) => event.eventId,
        ),
        wasIdempotentReplay: true,
      };
    }
    let state = this.replay(events);
    requireAssignedLearner(learner, state.learnerUserId);
    if (
      state.status !== "active" ||
      command.expectedRunVersion !== state.version
    ) {
      throw new HostedRunCommandError(
        state.status !== "active"
          ? "WORKFLOW_PRECONDITION_FAILED"
          : "RUN_VERSION_CONFLICT",
        "The audit is complete or the submitted run version is stale.",
      );
    }
    const built: BuiltAuditEvent[] = [];
    const add = (
      eventType: PlatformRunEventType,
      payload: JsonObject,
    ): BuiltAuditEvent => {
      const event = this.buildEvent({
        runId: command.runId,
        state,
        principal: learner,
        context: state.activeTrustedContext,
        commandId: command.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        eventType,
        payload,
      });
      built.push(event);
      state = event.nextState;
      return event;
    };

    switch (command.commandType) {
      case "VIEW_AUDIT_SCOPE":
        if (state.scopeViewed) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "The audit scope review has already been recorded.",
          );
        }
        add("AUDIT_SCOPE_VIEWED", {});
        break;
      case "INSPECT_AUDIT_EVIDENCE":
        this.requireEvidence(command.evidenceId);
        if (
          state.inspectedEvidenceIds.includes(command.evidenceId)
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "This evidence inspection has already been recorded.",
          );
        }
        add("AUDIT_EVIDENCE_INSPECTED", {
          evidenceId: command.evidenceId,
        });
        break;
      case "BOOKMARK_AUDIT_EVIDENCE":
        this.requireEvidence(command.evidenceId);
        if (
          state.bookmarkedEvidenceIds.includes(command.evidenceId)
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "This evidence bookmark has already been recorded.",
          );
        }
        add("AUDIT_EVIDENCE_BOOKMARKED", {
          evidenceId: command.evidenceId,
        });
        break;
      case "INSPECT_AUDIT_SOURCE_RECORD":
        this.requireSourceRecord(command.sourceRecordId);
        if (
          state.inspectedSourceRecordIds.includes(
            command.sourceRecordId,
          )
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "This source-record inspection has already been recorded.",
          );
        }
        add("AUDIT_SOURCE_RECORD_INSPECTED", {
          sourceRecordId: command.sourceRecordId,
        });
        break;
      case "VIEW_AUDIT_HINT":
        this.requireHint(command.hintId);
        if (
          state.experienceConfiguration.hints.availability ===
            "DISABLED" ||
          (state.experienceConfiguration.hints
            .maximumHintsPerRun !== undefined &&
            state.viewedHintIds.length >=
              state.experienceConfiguration.hints
                .maximumHintsPerRun)
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "No further hint is available under this Audit policy.",
          );
        }
        if (state.viewedHintIds.includes(command.hintId)) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "This hint has already been recorded.",
          );
        }
        add("AUDIT_HINT_VIEWED", {
          hintId: command.hintId,
        });
        break;
      case "SAVE_AUDIT_FINDING_DRAFT": {
        const finding = this.validateFindingInput(
          command.finding,
          true,
        );
        const draftRecordCount = events.filter(
          (event) =>
            event.eventType === "AUDIT_FINDING_DRAFT_SAVED",
        ).length;
        if (
          draftRecordCount >=
          this.auditCase.inputLimits.maximumDraftRecords
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "The authored maximum number of persisted draft records has been reached.",
          );
        }
        if (
          state.drafts[finding.findingId] === undefined &&
          Object.keys(state.drafts).length >=
            this.auditCase.inputLimits.maximumDrafts
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "Only one active compact audit draft is permitted.",
          );
        }
        add("AUDIT_FINDING_DRAFT_SAVED", {
          finding: asJsonObject({
            ...finding,
            savedAt: this.clock.now(),
          }),
        });
        break;
      }
      case "SUBMIT_AUDIT_FINDING":
      case "AMEND_AUDIT_FINDING": {
        if (
          command.commandType === "AMEND_AUDIT_FINDING" &&
          state.experienceConfiguration.retries
            .professionalDecisionRevision === "ONE_SHOT"
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "Submitted findings are one-shot in this Audit Assessment.",
          );
        }
        const findingRecordCount = events.filter(
          (event) =>
            event.eventType === "AUDIT_FINDING_SUBMITTED" ||
            event.eventType === "AUDIT_FINDING_AMENDED" ||
            event.eventType === "AUDIT_FINDING_WITHDRAWN",
        ).length;
        if (
          findingRecordCount >=
          this.auditCase.inputLimits.maximumFindingRecords
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "The authored maximum number of finding revisions has been reached.",
          );
        }
        const findingInput = this.validateFindingInput(command.finding);
        const existing = state.findings.find(
          (finding) =>
            finding.findingId === findingInput.findingId,
        );
        if (
          command.commandType === "SUBMIT_AUDIT_FINDING" &&
          existing !== undefined
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "An existing finding must be amended, not resubmitted.",
          );
        }
        if (
          command.commandType === "AMEND_AUDIT_FINDING" &&
          (existing === undefined ||
            existing.status === "WITHDRAWN")
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "Only an active submitted finding may be amended.",
          );
        }
        const activeOtherFindings = state.findings.filter(
          (finding) =>
            finding.status === "SUBMITTED" &&
            finding.findingId !== findingInput.findingId,
        );
        if (
          activeOtherFindings.some(
            (finding) =>
              finding.categoryId === findingInput.categoryId &&
              finding.entityId === findingInput.entityId,
          )
        ) {
          throw new HostedRunCommandError(
            "INVALID_COMMAND",
            "A category and entity pair may appear in only one active finding.",
          );
        }
        if (
          existing === undefined &&
          activeOtherFindings.length >=
            this.auditCase.completionDefinition
              .maximumSubmittedFindings
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "The authored maximum number of findings has been reached.",
          );
        }
        const finding: AuditFindingSubmissionV1 = {
          ...findingInput,
          revision: (existing?.revision ?? 0) + 1,
          status: "SUBMITTED",
          submittedAt: this.clock.now(),
          ...(existing === undefined
            ? {}
            : { supersedesFindingId: existing.findingId }),
        };
        const submitted = add(
          command.commandType === "SUBMIT_AUDIT_FINDING"
            ? "AUDIT_FINDING_SUBMITTED"
            : "AUDIT_FINDING_AMENDED",
          { finding: asJsonObject(finding) },
        );
        const classification = classifyAuditFinding(
          this.auditCase,
          finding,
        );
        if (classification.kind === "CONFIRMED") {
          add("COMPETENCY_EVIDENCE_RECORDED", {
            competencyEvidenceId: this.ids.nextId("CEV"),
            evidenceRuleId: this.evidenceRuleIdFor(
              submitted.sequenced.eventType,
            ),
            indicatorIds:
              classification.definition.competencyIndicatorIds,
            sourceEventIds: [submitted.sequenced.eventId],
          });
        }
        break;
      }
      case "WITHDRAW_AUDIT_FINDING": {
        if (
          state.experienceConfiguration.retries
            .professionalDecisionRevision === "ONE_SHOT"
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "Submitted findings cannot be withdrawn in this Audit Assessment.",
          );
        }
        const findingRecordCount = events.filter(
          (event) =>
            event.eventType === "AUDIT_FINDING_SUBMITTED" ||
            event.eventType === "AUDIT_FINDING_AMENDED" ||
            event.eventType === "AUDIT_FINDING_WITHDRAWN",
        ).length;
        if (
          findingRecordCount >=
          this.auditCase.inputLimits.maximumFindingRecords
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "The authored maximum number of finding revisions has been reached.",
          );
        }
        const existing = state.findings.find(
          (finding) => finding.findingId === command.findingId,
        );
        if (
          existing === undefined ||
          existing.status === "WITHDRAWN"
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "Only an active submitted finding may be withdrawn.",
          );
        }
        add("AUDIT_FINDING_WITHDRAWN", {
          findingId: command.findingId,
          revision: existing.revision + 1,
        });
        break;
      }
      case "SUBMIT_AUDIT_CONCLUSION": {
        if (
          state.findings.every(
            (finding) => finding.status !== "SUBMITTED",
          )
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "At least one submitted finding is required before the conclusion.",
          );
        }
        const conclusion = this.validateConclusion(
          command.conclusion,
        );
        const submitted = add("AUDIT_CONCLUSION_SUBMITTED", {
          conclusion: asJsonObject(conclusion),
        });
        add("COMPETENCY_EVIDENCE_RECORDED", {
          competencyEvidenceId: this.ids.nextId("CEV"),
          evidenceRuleId: this.evidenceRuleIdFor(
            submitted.sequenced.eventType,
          ),
          indicatorIds: ["AUDIT_JUDGMENT.CONCLUSION"],
          sourceEventIds: [submitted.sequenced.eventId],
        });
        add("RUN_COMPLETED", {
          outcomeCode: this.completionOutcomeCode(state),
        });
        break;
      }
      default:
        throw new HostedRunCommandError(
          "INVALID_COMMAND",
          "The audit runtime does not recognize this command.",
        );
    }

    const appended = await this.eventStore.append({
      runId: command.runId,
      expectedNextSequenceNumber: events.length + 1,
      events: withSubmittedCommand(built, command),
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
    const state = await this.loadState(runId);
    requireAssignedLearner(principal, state.learnerUserId);
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
    const events = await this.requireEvents(runId);
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
    const events = await this.requireEvents(runId);
    const state = this.replay(events);
    const first = events[0]!;
    const last = events.at(-1)!;
    const end =
      state.status === "completed"
        ? last.serverTimestampUtc
        : observedAt;
    return {
      runId,
      learnerUserId: state.learnerUserId,
      status: state.status,
      eventCount: events.length,
      currentStageId: state.workflowState.currentNodeId,
      activeRoleId: state.activeTrustedContext.roleId,
      elapsedSeconds: Math.max(
        0,
        Math.floor(
          (Date.parse(end) -
            Date.parse(first.serverTimestampUtc)) /
            1_000,
        ),
      ),
      lastActivityAt: last.serverTimestampUtc,
      pendingActionIds:
        state.workflowState.permittedActionIdsByRole[
          state.activeTrustedContext.roleId
        ] ?? [],
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
    const events = await this.requireEvents(runId);
    const sequence = throughSequenceNumber ?? events.length;
    if (
      !Number.isInteger(sequence) ||
      sequence < 1 ||
      sequence > events.length
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `Replay sequence must be between 1 and ${String(events.length)}.`,
      );
    }
    const bounded = events.slice(0, sequence);
    const selected = bounded.at(-1)!;
    const state = this.replay(bounded);
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
      projection: this.projection(state),
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
    return state.status === "active"
      ? {
          runId,
          learnerUserId: state.learnerUserId,
          status: "active",
          decisionItems: [],
          realizedOutcome: null,
        }
      : {
          runId,
          learnerUserId: state.learnerUserId,
          status: "completed",
          decisionItems: [],
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
    return this.competencyProjection(await this.loadState(runId));
  }

  async learnerCompetencyEvidence(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly CompetencyEvidenceProjection[]> {
    const state = await this.loadState(runId);
    requireAssignedLearner(principal, state.learnerUserId);
    return this.competencyProjection(state);
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

  async officialGrade(runId: string) {
    const state = await this.loadState(runId);
    if (state.status !== "completed") return null;
    if (state.conclusion === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "A completed audit run must retain its submitted conclusion.",
      );
    }
    const report = createAuditReport({
      auditCase: this.auditCase,
      sourceStateHash: state.sourceStateHash,
      findings: state.findings,
      conclusion: state.conclusion,
    });
    return {
      gradingProgress: "FullyGraded" as const,
      scoreGiven: report.score,
      scoreMaximum: 100 as const,
    };
  }

  async loadState(runId: string): Promise<AuditHostedRunStateV1> {
    return this.replay(await this.requireEvents(runId));
  }

  private async requireEvents(
    runId: string,
  ): Promise<readonly RunEventV1[]> {
    const events = await this.eventStore.load(runId);
    if (events.length === 0) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        `Run ${runId} does not exist.`,
      );
    }
    return events;
  }

  private replay(
    events: readonly RunEventV1[],
  ): AuditHostedRunStateV1 {
    const state = replayRunEvents<AuditHostedRunStateV1 | null>(
      null,
      events,
      (current, event) => this.applyEvent(current, event),
    );
    if (state === null) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        "The audit event stream did not create a run.",
      );
    }
    return state;
  }

  private applyEvent(
    current: Readonly<AuditHostedRunStateV1 | null>,
    event: RunEventV1,
  ): AuditHostedRunStateV1 | null {
    if (
      event.packId !== this.pack.packId ||
      event.packVersion !== this.pack.version ||
      event.scenarioId !== this.scenario.scenarioId ||
      event.scenarioVersion !== this.scenario.version ||
      (current !== null && event.runId !== current.runId)
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Audit event identity does not match the exact published case.",
      );
    }
    if (event.eventType === "RUN_CREATED") {
      if (current !== null) {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "RUN_CREATED must be the first audit event.",
        );
      }
      const modeConfiguration = validateHostedModeConfiguration(
        event.payload.modeConfiguration,
        requiredString(
          (event.payload.modeConfiguration as
            | Readonly<Record<string, unknown>>
            | undefined)?.mode,
          "modeConfiguration.mode",
        ) as "tutorial" | "standard" | "sandbox" | "configured",
      );
      const expectedExperience =
        resolveHostedExperienceConfiguration({
          packId: this.pack.packId,
          packVersion: this.pack.version,
          scenario: this.scenario,
          runtimeConfiguration: modeConfiguration,
          locale: this.pack.supportedLocales.includes("vi")
            ? "vi"
            : "en",
        });
      try {
        assertHostedExperienceIdentity({
          configuration:
            event.payload.experienceConfiguration,
          configurationHash: requiredString(
            event.payload.experienceConfigurationHash,
            "experienceConfigurationHash",
          ),
          expected: expectedExperience,
        });
      } catch (error) {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          error instanceof Error
            ? error.message
            : "Audit experience evidence is invalid.",
        );
      }
      if (
        event.payload.packContentHash !== this.packContentHash() ||
        event.payload.sourceStateHash !== this.sourceStateHash() ||
        canonicalize(
          event.payload.variantAssignment ?? null,
        ) !== canonicalize(this.variantAssignment)
      ) {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "Audit creation evidence does not match its immutable source.",
        );
      }
      const learnerUserId = requiredString(
        event.payload.learnerUserId,
        "learnerUserId",
      );
      const context = this.trustedContextFor(learnerUserId);
      if (
        event.simulationActorId !== context.actorId ||
        event.organizationId !== context.organizationId ||
        event.roleId !== context.roleId
      ) {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "Audit event context does not match the scenario role.",
        );
      }
      return this.withPermissions({
        schemaVersion: "1.0.0",
        runtimeKind: "audit-v1",
        runId: event.runId,
        assignmentId: requiredString(
          event.payload.assignmentId,
          "assignmentId",
        ),
        learnerUserId,
        packId: event.packId,
        packVersion: event.packVersion,
        packContentHash: this.packContentHash(),
        scenarioId: event.scenarioId,
        scenarioVersion: event.scenarioVersion,
        auditCaseId: this.auditCase.auditCaseId,
        auditCaseVersion: this.auditCase.version,
        sourceStateHash: this.sourceStateHash(),
        ...(this.variantAssignment === null
          ? {}
          : {
              variantAssignment: this.variantAssignment,
            }),
        modeConfiguration,
        experienceConfiguration:
          expectedExperience.configuration,
        experienceConfigurationHash:
          expectedExperience.configurationHash,
        activeTrustedContext: context,
        version: event.sequenceNumber,
        status: "active",
        scopeViewed: false,
        inspectedEvidenceIds: [],
        bookmarkedEvidenceIds: [],
        inspectedSourceRecordIds: [],
        viewedHintIds: [],
        drafts: {},
        findings: [],
        competencyEvidence: [],
        workflowState: {
          currentNodeId: "AUDIT_WORKPAPER",
          permittedActionIdsByRole: {},
        },
        immutableSourceState: this.immutableSourceState(),
      });
    }
    const state = this.stateOrThrow(current);
    switch (event.eventType) {
      case "AUDIT_CASE_OPENED":
        return this.updateState(state, event, {});
      case "AUDIT_SCOPE_VIEWED":
        return this.updateState(state, event, { scopeViewed: true });
      case "AUDIT_EVIDENCE_INSPECTED": {
        const evidenceId = requiredString(
          event.payload.evidenceId,
          "evidenceId",
        );
        this.requireEvidence(evidenceId);
        return this.updateState(state, event, {
          inspectedEvidenceIds: [
            ...new Set([...state.inspectedEvidenceIds, evidenceId]),
          ],
        });
      }
      case "AUDIT_EVIDENCE_BOOKMARKED": {
        const evidenceId = requiredString(
          event.payload.evidenceId,
          "evidenceId",
        );
        this.requireEvidence(evidenceId);
        return this.updateState(state, event, {
          bookmarkedEvidenceIds: [
            ...new Set([...state.bookmarkedEvidenceIds, evidenceId]),
          ],
        });
      }
      case "AUDIT_SOURCE_RECORD_INSPECTED": {
        const sourceRecordId = requiredString(
          event.payload.sourceRecordId,
          "sourceRecordId",
        );
        this.requireSourceRecord(sourceRecordId);
        return this.updateState(state, event, {
          inspectedSourceRecordIds: [
            ...new Set([
              ...state.inspectedSourceRecordIds,
              sourceRecordId,
            ]),
          ],
        });
      }
      case "AUDIT_HINT_VIEWED": {
        const hintId = requiredString(
          event.payload.hintId,
          "hintId",
        );
        this.requireHint(hintId);
        return this.updateState(state, event, {
          viewedHintIds: [
            ...new Set([...state.viewedHintIds, hintId]),
          ],
        });
      }
      case "AUDIT_FINDING_DRAFT_SAVED": {
        const draft = this.draftFromEvent(event.payload.finding);
        return this.updateState(state, event, {
          drafts: { ...state.drafts, [draft.findingId]: draft },
        });
      }
      case "AUDIT_FINDING_SUBMITTED":
      case "AUDIT_FINDING_AMENDED": {
        const finding = this.findingFromEvent(
          event.payload.finding,
        );
        const existingIndex = state.findings.findIndex(
          (candidate) =>
            candidate.findingId === finding.findingId,
        );
        const existing =
          existingIndex === -1
            ? undefined
            : state.findings[existingIndex];
        if (
          (event.eventType === "AUDIT_FINDING_SUBMITTED" &&
            (existing !== undefined || finding.revision !== 1)) ||
          (event.eventType === "AUDIT_FINDING_AMENDED" &&
            (existing === undefined ||
              existing.status !== "SUBMITTED" ||
              finding.revision !== existing.revision + 1))
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Audit finding revision history is not append-only.",
          );
        }
        if (
          state.findings.some(
            (candidate) =>
              candidate.status === "SUBMITTED" &&
              candidate.findingId !== finding.findingId &&
              candidate.categoryId === finding.categoryId &&
              candidate.entityId === finding.entityId,
          )
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Audit event history contains a duplicate active category and entity pair.",
          );
        }
        const nextFindings = [...state.findings];
        if (existingIndex === -1) nextFindings.push(finding);
        else nextFindings[existingIndex] = finding;
        const { [finding.findingId]: _draft, ...drafts } =
          state.drafts;
        return this.updateState(state, event, {
          drafts,
          findings: nextFindings,
        });
      }
      case "AUDIT_FINDING_WITHDRAWN": {
        const findingId = requiredString(
          event.payload.findingId,
          "findingId",
        );
        const revision = finiteNumber(
          event.payload.revision,
          "revision",
          1,
          1_000,
        );
        const finding = state.findings.find(
          (candidate) => candidate.findingId === findingId,
        );
        if (finding === undefined || revision !== finding.revision + 1) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Audit withdrawal does not follow the current finding revision.",
          );
        }
        return this.updateState(state, event, {
          findings: state.findings.map((candidate) =>
            candidate.findingId === findingId
              ? {
                  ...candidate,
                  revision,
                  status: "WITHDRAWN" as const,
                  submittedAt: event.serverTimestampUtc,
                }
              : candidate,
          ),
        });
      }
      case "COMPETENCY_EVIDENCE_RECORDED": {
        const evidenceRuleId = requiredString(
          event.payload.evidenceRuleId,
          "evidenceRuleId",
        );
        if (!this.scenario.evidenceRuleIds.includes(evidenceRuleId)) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Audit competency evidence references an unknown rule.",
          );
        }
        return this.updateState(state, event, {
          competencyEvidence: [
            ...state.competencyEvidence,
            {
              competencyEvidenceId: requiredString(
                event.payload.competencyEvidenceId,
                "competencyEvidenceId",
              ),
              evidenceRuleId,
              indicatorIds: stringArray(
                event.payload.indicatorIds,
                "indicatorIds",
              ),
              sourceEventIds: stringArray(
                event.payload.sourceEventIds,
                "sourceEventIds",
              ),
              observedAt: event.serverTimestampUtc,
            },
          ],
        });
      }
      case "AUDIT_CONCLUSION_SUBMITTED": {
        const conclusion = this.conclusionFromEvent(
          event.payload.conclusion,
        );
        if (
          state.conclusion !== undefined ||
          !this.auditCase.conclusionCategories.some(
            (candidate) =>
              candidate.conclusionCategory ===
              conclusion.conclusionCategory,
          )
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Audit conclusion history does not match the authored case.",
          );
        }
        return this.updateState(state, event, {
          conclusion,
        });
      }
      case "RUN_COMPLETED":
        if (
          state.conclusion === undefined ||
          event.payload.outcomeCode !==
            this.completionOutcomeCode(state)
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Audit completion requires the authored conclusion.",
          );
        }
        return this.updateState(state, event, {
          status: "completed",
          workflowState: {
            currentNodeId: "AUDIT_COMPLETE",
            permittedActionIdsByRole: {},
          },
        });
      default:
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          `Event type ${event.eventType} is not supported by the audit runtime.`,
        );
    }
  }

  private buildEvent(options: {
    readonly runId: string;
    readonly state: AuditHostedRunStateV1 | null;
    readonly principal: ApplicationPrincipal;
    readonly context: TrustedExecutionContext;
    readonly commandId: string;
    readonly commandDigest: string;
    readonly batchIndex: number;
    readonly eventType: PlatformRunEventType;
    readonly payload: JsonObject;
  }): BuiltAuditEvent {
    const sequenceNumber = (options.state?.version ?? 0) + 1;
    const payload = {
      ...options.payload,
      requestDigest: options.commandDigest,
    };
    const unsequenced: UnsequencedRunEventV1 = {
      eventId: this.ids.nextId("HEVT"),
      runId: options.runId,
      idempotencyKey: `${options.commandId}:${String(options.batchIndex)}`,
      serverTimestampUtc: this.clock.now(),
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
      correlationId: options.runId,
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
        "An audit event unexpectedly removed run state.",
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

  private updateState(
    state: AuditHostedRunStateV1,
    event: RunEventV1,
    changes: Partial<AuditHostedRunStateV1>,
  ): AuditHostedRunStateV1 {
    if (canonicalize(state.immutableSourceState) !==
      canonicalize(this.immutableSourceState())) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Audit workpaper events cannot alter the source process.",
      );
    }
    return this.withPermissions({
      ...state,
      ...changes,
      version: event.sequenceNumber,
      immutableSourceState: state.immutableSourceState,
    });
  }

  private evidenceRuleIdFor(
    eventType: PlatformRunEventType,
  ): string {
    const rule = this.pack.evidenceRules.find(
      (candidate) =>
        candidate.eventType === eventType &&
        this.scenario.evidenceRuleIds.includes(
          candidate.evidenceRuleId,
        ),
    );
    if (rule === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        `The audit scenario has no evidence rule for ${eventType}.`,
      );
    }
    return rule.evidenceRuleId;
  }

  private completionOutcomeCode(
    state: AuditHostedRunStateV1,
  ):
    | "GUIDED_AUDIT_COMPLETED"
    | "PRACTICE_AUDIT_COMPLETED"
    | "AUDIT_CHALLENGE_COMPLETED"
    | "AUDIT_ASSESSMENT_COMPLETED" {
    if (
      state.experienceConfiguration.deliveryPurpose ===
      "ASSESSMENT"
    ) {
      return "AUDIT_ASSESSMENT_COMPLETED";
    }
    const supportProfile =
      state.experienceConfiguration.supportProfile;
    if (supportProfile === "GUIDED") {
      return "GUIDED_AUDIT_COMPLETED";
    }
    if (supportProfile === "PRACTICE") {
      return "PRACTICE_AUDIT_COMPLETED";
    }
    return "AUDIT_CHALLENGE_COMPLETED";
  }

  private withPermissions(
    state: AuditHostedRunStateV1,
  ): AuditHostedRunStateV1 {
    if (state.status === "completed") return state;
    const revisionAllowed =
      state.experienceConfiguration.retries
        .professionalDecisionRevision !== "ONE_SHOT";
    const hintAllowed =
      state.experienceConfiguration.hints.availability !==
      "DISABLED";
    return {
      ...state,
      workflowState: {
        currentNodeId: "AUDIT_WORKPAPER",
        permittedActionIdsByRole: {
          [state.activeTrustedContext.roleId]: [
            "VIEW_AUDIT_SCOPE",
            "INSPECT_AUDIT_EVIDENCE",
            "BOOKMARK_AUDIT_EVIDENCE",
            "INSPECT_AUDIT_SOURCE_RECORD",
            ...(hintAllowed ? ["VIEW_AUDIT_HINT"] : []),
            "SAVE_AUDIT_FINDING_DRAFT",
            "SUBMIT_AUDIT_FINDING",
            ...(revisionAllowed
              ? [
                  "AMEND_AUDIT_FINDING",
                  "WITHDRAW_AUDIT_FINDING",
                ]
              : []),
            "SUBMIT_AUDIT_CONCLUSION",
          ],
        },
      },
    };
  }

  private projection(
    state: AuditHostedRunStateV1,
  ): LearnerRunProjectionV1 {
    const roleId = state.activeTrustedContext.roleId;
    const acceptedLedgerRecords =
      this.auditCase.sourceRecords
        .filter(
          (record) =>
            record.recordKind === "LEDGER_TRANSACTION",
        )
        .map((record) => ({
          transactionId: record.sourceRecordId,
          transactionType: String(
            record.details.transactionType ?? "AUDIT_SOURCE",
          ),
          transactionStatus: "COMMITTED",
          occurredAt: record.occurredAt,
          details: record.details,
        }));
    return {
      schemaVersion: "1.0.0",
      runId: state.runId,
      version: state.version,
      roleId,
      businessState: [],
      ledgerState: {
        transactions: acceptedLedgerRecords,
      },
      informationState: [],
      policyState: [],
      workflowState: {
        currentNodeId: state.workflowState.currentNodeId,
        completedNodeIds:
          state.status === "completed"
            ? ["AUDIT_WORKPAPER"]
            : [],
        permittedActionIds:
          state.workflowState.permittedActionIdsByRole[roleId] ??
          [],
      },
      audit: this.auditProjection(state),
    };
  }

  private auditProjection(
    state: AuditHostedRunStateV1,
  ): AuditLearnerProjectionV1 {
    const localize = (
      localizationKey: string,
    ): LearnerRunLocalizedTextV1 =>
      this.localizedText(localizationKey);
    const feedbackReleased =
      state.status === "completed" ||
      state.experienceConfiguration.feedback.timing ===
        "IMMEDIATE";
    const findings = state.findings.map((finding) => {
      if (finding.status === "WITHDRAWN") return finding;
      if (!feedbackReleased) return finding;
      const classification = classifyAuditFinding(
        this.auditCase,
        finding,
      );
      if (classification.kind === "CONFIRMED") {
        return {
          ...finding,
          feedback: {
            classification: "CONFIRMED" as const,
            explanation: localize(
              classification.definition.explanation.localizationKey,
            ),
          },
        };
      }
      if (classification.kind === "LEGITIMATE_EXCEPTION") {
        return {
          ...finding,
          feedback: {
            classification: "LEGITIMATE_EXCEPTION" as const,
            explanation: localize(classification.explanationKey),
          },
        };
      }
      return {
        ...finding,
        feedback: {
          classification: "UNSUPPORTED" as const,
          explanation: localize(
            this.auditCase.supportProfiles[0] === "GUIDED"
              ? "platformPack.guidedAudit.feedback.unsupported"
              : this.auditCase.supportProfiles[0] ===
                    "PRACTICE"
                ? "platformPack.practiceAudit.feedback.unsupported"
                : "platformPack.auditChallenge.feedback.unsupported",
          ),
        },
      };
    });
    return {
      schemaVersion: "1.0.0",
      auditCaseId: this.auditCase.auditCaseId,
      auditCaseVersion: this.auditCase.version,
      sourceProcessId: this.auditCase.sourceProcessId,
      sourceProcessVersion:
        this.auditCase.sourceProcessVersion,
      sourceStateHash: state.sourceStateHash,
      ...(state.variantAssignment === undefined
        ? {}
        : {
            variantAssignment: state.variantAssignment,
          }),
      supportProfile: this.auditCase.supportProfiles[0]!,
      scopeViewed: state.scopeViewed,
      objective: localize(
        this.auditCase.auditObjective.localizationKey,
      ),
      scope: {
        title: localize(this.auditCase.scope.title.localizationKey),
        periodStart: this.auditCase.scope.periodStart,
        periodEnd: this.auditCase.scope.periodEnd,
        organizationIds: this.auditCase.scope.organizationIds,
        entityIds: this.auditCase.scope.entityIds,
      },
      categories: this.auditCase.categories.map((choice) => ({
        choiceId: choice.choiceId,
        label: localize(choice.label.localizationKey),
      })),
      entities: this.auditCase.entities.map((choice) => ({
        choiceId: choice.choiceId,
        label: localize(choice.label.localizationKey),
      })),
      rootCauses: this.auditCase.rootCauses.map((choice) => ({
        choiceId: choice.choiceId,
        label: localize(choice.label.localizationKey),
      })),
      recommendations: this.auditCase.recommendations.map(
        (choice) => ({
          choiceId: choice.choiceId,
          label: localize(choice.label.localizationKey),
        }),
      ),
      hints:
        state.experienceConfiguration.hints.availability ===
        "DISABLED"
          ? []
          : this.auditCase.hints.map((hint) => ({
              hintId: hint.hintId,
              text: localize(hint.text.localizationKey),
              viewed: state.viewedHintIds.includes(hint.hintId),
            })),
      conclusionCategories:
        this.auditCase.conclusionCategories.map((choice) => ({
          conclusionCategory: choice.conclusionCategory,
          label: localize(choice.label.localizationKey),
        })),
      sourceRecords: this.auditCase.sourceRecords.map((record) => ({
        sourceRecordId: record.sourceRecordId,
        recordKind: record.recordKind,
        title: localize(record.title.localizationKey),
        occurredAt: record.occurredAt,
        organizationId: record.organizationId,
        entityIds: record.entityIds,
        evidenceIds: record.evidenceIds,
        policyIds: record.policyIds,
        details: record.details,
        inspected: state.inspectedSourceRecordIds.includes(
          record.sourceRecordId,
        ),
      })),
      evidence: this.auditCase.evidenceItemIds.map((evidenceId) => {
        const evidence = this.requireEvidence(evidenceId);
        return {
          evidenceId,
          title: localize(evidence.title.localizationKey),
          evidenceType: evidence.evidenceType,
          sourceOrganizationId: evidence.sourceOrganizationId,
          learnerMetadata: structuredClone(
            evidence.learnerMetadata,
          ),
          content: evidence.content,
          inspected:
            state.inspectedEvidenceIds.includes(evidenceId),
          bookmarked:
            state.bookmarkedEvidenceIds.includes(evidenceId),
        };
      }),
      policies: this.auditCase.policyIds.map((policyId) => {
        const policy = this.requirePolicy(policyId);
        return {
          policyId,
          title: localize(policy.title.localizationKey),
          configuration: policy.configuration,
        };
      }),
      drafts: Object.values(state.drafts).sort(
        (left, right) =>
          left.savedAt.localeCompare(right.savedAt) ||
          left.findingId.localeCompare(right.findingId),
      ),
      findings,
      ...(state.conclusion === undefined
        ? {}
        : { conclusion: state.conclusion }),
      maximumSubmittedFindings:
        this.auditCase.completionDefinition
          .maximumSubmittedFindings,
      inputLimits: this.auditCase.inputLimits,
      ...(state.status === "completed" &&
      state.conclusion !== undefined
        ? {
            report: createAuditReport({
              auditCase: this.auditCase,
              sourceStateHash: state.sourceStateHash,
              findings: state.findings,
              conclusion: state.conclusion,
            }),
          }
        : {}),
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

  private validateFindingInput(
    input: AuditFindingInputV1,
    allowIncomplete = false,
  ): Omit<
    AuditFindingSubmissionV1,
    "revision" | "status" | "submittedAt"
  > {
    if (!isObject(input)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "finding must be an object.",
      );
    }
    const findingId = requiredString(
      input.findingId,
      "finding.findingId",
      96,
    );
    const categoryId = requiredString(
      input.categoryId,
      "finding.categoryId",
      96,
    );
    const entityId = requiredString(
      input.entityId,
      "finding.entityId",
      96,
    );
    if (
      !this.auditCase.categories.some(
        (choice) => choice.choiceId === categoryId,
      ) ||
      !this.auditCase.entities.some(
        (choice) => choice.choiceId === entityId,
      )
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "The finding category and entity must be authored for this case.",
      );
    }
    if (
      input.severity !== "LOW" &&
      input.severity !== "MODERATE" &&
      input.severity !== "HIGH" &&
      input.severity !== "CRITICAL"
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "finding.severity is invalid.",
      );
    }
    if (
      input.materiality !== "NON_MATERIAL" &&
      input.materiality !== "MATERIAL"
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "finding.materiality is invalid.",
      );
    }
    const evidenceIds = stringArray(
      input.evidenceIds,
      "finding.evidenceIds",
    );
    const policyIds = stringArray(
      input.policyIds,
      "finding.policyIds",
    );
    if (
      (!allowIncomplete && evidenceIds.length === 0) ||
      evidenceIds.length >
        this.auditCase.inputLimits
          .maximumEvidenceCitationsPerFinding ||
      evidenceIds.some(
        (evidenceId) =>
          !this.auditCase.evidenceItemIds.includes(evidenceId),
      ) ||
      (!allowIncomplete && policyIds.length === 0) ||
      policyIds.length >
        this.auditCase.inputLimits
          .maximumPolicyCitationsPerFinding ||
      policyIds.some(
        (policyId) =>
          !this.auditCase.policyIds.includes(policyId),
      )
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "A finding must cite evidence and policy from the audit case.",
      );
    }
    const rootCauseCode = requiredString(
      input.rootCauseCode,
      "finding.rootCauseCode",
      96,
    );
    const recommendationCode = requiredString(
      input.recommendationCode,
      "finding.recommendationCode",
      96,
    );
    if (
      !this.auditCase.rootCauses.some(
        (choice) => choice.choiceId === rootCauseCode,
      ) ||
      !this.auditCase.recommendations.some(
        (choice) =>
          choice.choiceId === recommendationCode,
      )
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "The root cause and recommendation must be authored choices.",
      );
    }
    return {
      findingId,
      categoryId,
      entityId,
      title: allowIncomplete
        ? boundedUtf8String(
            input.title,
            "finding.title",
            this.auditCase.inputLimits.findingTitleUtf8Bytes,
          )
        : requiredUtf8String(
            input.title,
            "finding.title",
            this.auditCase.inputLimits.findingTitleUtf8Bytes,
          ),
      observation: allowIncomplete
        ? boundedUtf8String(
            input.observation,
            "finding.observation",
            this.auditCase.inputLimits
              .findingObservationUtf8Bytes,
          )
        : requiredUtf8String(
            input.observation,
            "finding.observation",
            this.auditCase.inputLimits
              .findingObservationUtf8Bytes,
          ),
      severity: input.severity,
      materiality: input.materiality,
      confidence: finiteNumber(
        input.confidence,
        "finding.confidence",
        0,
        100,
      ),
      evidenceIds,
      policyIds,
      rootCauseCode,
      recommendationCode,
      recommendation: allowIncomplete
        ? boundedUtf8String(
            input.recommendation,
            "finding.recommendation",
            this.auditCase.inputLimits
              .findingRecommendationUtf8Bytes,
          )
        : requiredUtf8String(
            input.recommendation,
            "finding.recommendation",
            this.auditCase.inputLimits
              .findingRecommendationUtf8Bytes,
          ),
    };
  }

  private validateConclusion(
    input: Omit<AuditConclusionSubmissionV1, "submittedAt">,
  ): AuditConclusionSubmissionV1 {
    if (
      !this.auditCase.conclusionCategories.some(
        (candidate) =>
          candidate.conclusionCategory ===
          input.conclusionCategory,
      )
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "The audit conclusion category is not authored for this case.",
      );
    }
    return {
      conclusionCategory: input.conclusionCategory,
      scopeSummary: requiredUtf8String(
        input.scopeSummary,
        "conclusion.scopeSummary",
        this.auditCase.inputLimits.conclusionFieldUtf8Bytes,
      ),
      materialFindingsSummary: requiredUtf8String(
        input.materialFindingsSummary,
        "conclusion.materialFindingsSummary",
        this.auditCase.inputLimits.conclusionFieldUtf8Bytes,
      ),
      nonMaterialFindingsSummary: requiredUtf8String(
        input.nonMaterialFindingsSummary,
        "conclusion.nonMaterialFindingsSummary",
        this.auditCase.inputLimits.conclusionFieldUtf8Bytes,
      ),
      limitations: requiredUtf8String(
        input.limitations,
        "conclusion.limitations",
        this.auditCase.inputLimits.conclusionFieldUtf8Bytes,
      ),
      uncertainty: requiredUtf8String(
        input.uncertainty,
        "conclusion.uncertainty",
        this.auditCase.inputLimits.conclusionFieldUtf8Bytes,
      ),
      recommendations: requiredUtf8String(
        input.recommendations,
        "conclusion.recommendations",
        this.auditCase.inputLimits.conclusionFieldUtf8Bytes,
      ),
      confidence: finiteNumber(
        input.confidence,
        "conclusion.confidence",
        0,
        100,
      ),
      submittedAt: this.clock.now(),
    };
  }

  private findingFromEvent(value: unknown): AuditFindingSubmissionV1 {
    if (!isObject(value)) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Audit finding event payload is invalid.",
      );
    }
    const input = this.validateFindingInput(
      value as unknown as AuditFindingInputV1,
    );
    const revision = finiteNumber(
      value.revision,
      "finding.revision",
      1,
      1_000,
    );
    const status = requiredString(value.status, "finding.status");
    if (status !== "SUBMITTED") {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "A submitted audit finding must have submitted status.",
      );
    }
    return {
      ...input,
      revision,
      status,
      submittedAt: requiredString(
        value.submittedAt,
        "finding.submittedAt",
      ),
      ...(typeof value.supersedesFindingId === "string"
        ? {
            supersedesFindingId: value.supersedesFindingId,
          }
        : {}),
    };
  }

  private draftFromEvent(value: unknown) {
    if (!isObject(value)) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Audit draft event payload is invalid.",
      );
    }
    return {
      ...this.validateFindingInput(
        value as unknown as AuditFindingInputV1,
        true,
      ),
      savedAt: requiredString(value.savedAt, "finding.savedAt"),
    };
  }

  private conclusionFromEvent(
    value: unknown,
  ): AuditConclusionSubmissionV1 {
    if (!isObject(value)) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Audit conclusion event payload is invalid.",
      );
    }
    const conclusionCategory = requiredString(
      value.conclusionCategory,
      "conclusion.conclusionCategory",
    ) as AuditConclusionSubmissionV1["conclusionCategory"];
    return {
      conclusionCategory,
      scopeSummary: requiredUtf8String(
        value.scopeSummary,
        "conclusion.scopeSummary",
        this.auditCase.inputLimits.conclusionFieldUtf8Bytes,
      ),
      materialFindingsSummary: requiredUtf8String(
        value.materialFindingsSummary,
        "conclusion.materialFindingsSummary",
        this.auditCase.inputLimits.conclusionFieldUtf8Bytes,
      ),
      nonMaterialFindingsSummary: requiredUtf8String(
        value.nonMaterialFindingsSummary,
        "conclusion.nonMaterialFindingsSummary",
        this.auditCase.inputLimits.conclusionFieldUtf8Bytes,
      ),
      limitations: requiredUtf8String(
        value.limitations,
        "conclusion.limitations",
        this.auditCase.inputLimits.conclusionFieldUtf8Bytes,
      ),
      uncertainty: requiredUtf8String(
        value.uncertainty,
        "conclusion.uncertainty",
        this.auditCase.inputLimits.conclusionFieldUtf8Bytes,
      ),
      recommendations: requiredUtf8String(
        value.recommendations,
        "conclusion.recommendations",
        this.auditCase.inputLimits.conclusionFieldUtf8Bytes,
      ),
      confidence: finiteNumber(
        value.confidence,
        "conclusion.confidence",
        0,
        100,
      ),
      submittedAt: requiredString(
        value.submittedAt,
        "conclusion.submittedAt",
      ),
    };
  }

  private immutableSourceState(): JsonObject {
    return asJsonObject({ records: this.auditCase.sourceRecords });
  }

  private sourceStateHash(): string {
    return sha256Hex(canonicalize(this.immutableSourceState()));
  }

  private trustedContextFor(
    learnerUserId: string,
  ): TrustedExecutionContext {
    const role = this.scenario.roles[0];
    if (role === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "An audit scenario requires one trusted auditor role.",
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
        "Hosted audits require a published pack content hash.",
      );
    }
    return hash;
  }

  private requireEvidence(evidenceId: string) {
    const evidence = this.scenario.evidenceItems.find(
      (candidate) =>
        candidate.evidenceId === evidenceId &&
        this.auditCase.evidenceItemIds.includes(evidenceId),
    );
    if (evidence === undefined) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `Evidence ${evidenceId} is outside this audit case.`,
      );
    }
    return evidence;
  }

  private requirePolicy(policyId: string) {
    const policy = this.scenario.policies.find(
      (candidate) =>
        candidate.policyId === policyId &&
        this.auditCase.policyIds.includes(policyId),
    );
    if (policy === undefined) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `Policy ${policyId} is outside this audit case.`,
      );
    }
    return policy;
  }

  private requireHint(hintId: string) {
    const hint = this.auditCase.hints.find(
      (candidate) => candidate.hintId === hintId,
    );
    if (hint === undefined) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `Hint ${hintId} is outside this audit case.`,
      );
    }
    return hint;
  }

  private requireSourceRecord(sourceRecordId: string) {
    const record = this.auditCase.sourceRecords.find(
      (candidate) =>
        candidate.sourceRecordId === sourceRecordId,
    );
    if (record === undefined) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `Source record ${sourceRecordId} is outside this audit case.`,
      );
    }
    return record;
  }

  private competencyProjection(
    state: AuditHostedRunStateV1,
  ): readonly CompetencyEvidenceProjection[] {
    const ids = [
      ...new Set(
        state.competencyEvidence.flatMap(
          (evidence) => evidence.indicatorIds,
        ),
      ),
    ].sort();
    return ids.map((indicatorId) => ({
      indicatorId,
      evidence: state.competencyEvidence.filter((evidence) =>
        evidence.indicatorIds.includes(indicatorId),
      ),
    }));
  }

  private stateOrThrow(
    state: Readonly<AuditHostedRunStateV1 | null>,
  ): AuditHostedRunStateV1 {
    if (state === null) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Audit events require an existing run.",
      );
    }
    return structuredClone(state);
  }
}
