import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import {
  CERTIFICATE_ASSESSMENTS,
  evaluateCertificateDecision,
  ISSUER_ASSESSMENTS,
  LOT_DISPOSITIONS,
  STORAGE_CHOICES,
} from "../../domain/simulation/consequential-decisions";
import { handleSimulationDecision } from "../../domain/simulation/decision-handler";
import {
  FixedClock,
  SeededRandomSource,
  SequenceIdGenerator,
  type Clock,
  type IdGenerator,
} from "../../domain/simulation/environment";
import type {
  SubmitCertificateDecisionCommand,
  TrustedExecutionContext,
} from "../../domain/simulation/types";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import type {
  LearnerRunProjectionV1,
  PlatformRunEventType,
  RunEventV1,
  UnsequencedRunEventV1,
} from "../contracts/run-events";
import type { JsonObject, JsonValue } from "../contracts/json";
import { isJsonObject } from "../contracts/json";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import type { RunEventStore } from "../runs/event-store";
import { projectRunStateForRole } from "../runs/projection";
import {
  hashReplayState,
  replayRunEventsAsync,
} from "../runs/replay";
import {
  requireApplicationRole,
  requireAssignedLearner,
  type ApplicationPrincipal,
} from "./access";
import { CoffeeStage3HostedAdapter } from "./coffee-stage3-adapter";
import type {
  CompetencyEvidenceProjection,
  CreateHostedStage3RunRequest,
  HostedCompetencyEvidence,
  HostedStage3Command,
  HostedStage3Decision,
  HostedStage3RunResult,
  HostedStage3RunState,
  HostedTransactionSummary,
  InstructorTimelineItem,
  RubricEvidenceProjection,
  Stage3CaseVariant,
} from "./stage3-types";

const EVIDENCE_ID = "EVID_CERTIFICATE_RECORD";
const MAXIMUM_JUSTIFICATION_LENGTH = 1_000;
const FORBIDDEN_IDENTITY_FIELDS = new Set([
  "actorId",
  "authenticatedUserId",
  "organizationId",
  "roleId",
  "simulationActorId",
]);

export class HostedRunCommandError extends Error {
  constructor(
    readonly code:
      | "RUN_ALREADY_EXISTS"
      | "RUN_NOT_FOUND"
      | "RUN_VERSION_CONFLICT"
      | "COMMAND_ID_REUSED"
      | "INVALID_COMMAND"
      | "WORKFLOW_PRECONDITION_FAILED"
      | "PACK_CONTRACT_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "HostedRunCommandError";
  }
}

interface BuiltEvent {
  readonly unsequenced: UnsequencedRunEventV1;
  readonly sequenced: RunEventV1;
  readonly nextState: HostedStage3RunState;
}

function requestDigest(request: unknown): string {
  return sha256Hex(canonicalize(request));
}

function rejectSelfAssertedIdentity(
  value: unknown,
  path = "command",
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      rejectSelfAssertedIdentity(item, `${path}[${String(index)}]`);
    });
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_IDENTITY_FIELDS.has(key)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `${path}.${key} may not self-assert trusted identity.`,
      );
    }
    rejectSelfAssertedIdentity(nested, `${path}.${key}`);
  }
}

function requiredString(
  value: unknown,
  path: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      `${path} must be a non-empty string.`,
    );
  }
  return value;
}

function requiredStringArray(
  value: unknown,
  path: string,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string")
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      `${path} must be an array of strings.`,
    );
  }
  return value as readonly string[];
}

function requiredBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      `${path} must be a boolean.`,
    );
  }
  return value;
}

function isCaseVariant(value: string): value is Stage3CaseVariant {
  return (
    value === "authorized-certifier" ||
    value === "unauthorized-transporter"
  );
}

function decisionFromPayload(payload: JsonObject): HostedStage3Decision {
  const decisionValue = payload.decision;
  if (!isJsonObject(decisionValue)) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Decision event is missing its structured decision.",
    );
  }
  const certificateAssessment = requiredString(
    decisionValue.certificateAssessment,
    "decision.certificateAssessment",
  );
  const issuerAssessment = requiredString(
    decisionValue.issuerAssessment,
    "decision.issuerAssessment",
  );
  const storageChoice = requiredString(
    decisionValue.storageChoice,
    "decision.storageChoice",
  );
  const lotDisposition = requiredString(
    decisionValue.lotDisposition,
    "decision.lotDisposition",
  );
  if (
    !CERTIFICATE_ASSESSMENTS.includes(
      certificateAssessment as (typeof CERTIFICATE_ASSESSMENTS)[number],
    ) ||
    !ISSUER_ASSESSMENTS.includes(
      issuerAssessment as (typeof ISSUER_ASSESSMENTS)[number],
    ) ||
    !STORAGE_CHOICES.includes(
      storageChoice as (typeof STORAGE_CHOICES)[number],
    ) ||
    !LOT_DISPOSITIONS.includes(
      lotDisposition as (typeof LOT_DISPOSITIONS)[number],
    )
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Decision event contains an unsupported authored option.",
    );
  }
  const decision: SubmitCertificateDecisionCommand = {
    commandType: "SUBMIT_CERTIFICATE_DECISION",
    certificateAssessment:
      certificateAssessment as SubmitCertificateDecisionCommand["certificateAssessment"],
    issuerAssessment:
      issuerAssessment as SubmitCertificateDecisionCommand["issuerAssessment"],
    storageChoice:
      storageChoice as SubmitCertificateDecisionCommand["storageChoice"],
    lotDisposition:
      lotDisposition as SubmitCertificateDecisionCommand["lotDisposition"],
  };
  const justification = requiredString(
    payload.justification,
    "justification",
  );
  if (justification.length > MAXIMUM_JUSTIFICATION_LENGTH) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      `Justification exceeds ${String(MAXIMUM_JUSTIFICATION_LENGTH)} characters.`,
    );
  }
  const evaluation = evaluateCertificateDecision(decision, coffeeScenario);
  return {
    decision,
    justification,
    isAuthoredCorrect:
      evaluation.certificateAssessmentCorrect &&
      evaluation.issuerAssessmentCorrect &&
      evaluation.storageChoiceCorrect &&
      evaluation.lotDispositionCorrect,
  };
}

function summaryToJson(summary: HostedTransactionSummary): JsonObject {
  return {
    actionId: summary.actionId,
    coreCommandId: summary.coreCommandId,
    isAccepted: summary.isAccepted,
    transactionId: summary.transactionId,
    signatureValid: summary.signatureValid,
    recognizedIdentity: summary.recognizedIdentity,
    authorized: summary.authorized,
    validationRuleIds: summary.validationRuleIds,
  };
}

function summaryFromPayload(payload: JsonObject): HostedTransactionSummary {
  const summaryValue = payload.summary;
  if (!isJsonObject(summaryValue)) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Transaction event is missing its outcome summary.",
    );
  }
  const transactionIdValue = summaryValue.transactionId;
  if (
    transactionIdValue !== null &&
    typeof transactionIdValue !== "string"
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Transaction summary has an invalid transaction ID.",
    );
  }
  return {
    actionId: requiredString(summaryValue.actionId, "summary.actionId"),
    coreCommandId: requiredString(
      summaryValue.coreCommandId,
      "summary.coreCommandId",
    ),
    isAccepted: requiredBoolean(
      summaryValue.isAccepted,
      "summary.isAccepted",
    ),
    transactionId: transactionIdValue,
    signatureValid: requiredBoolean(
      summaryValue.signatureValid,
      "summary.signatureValid",
    ),
    recognizedIdentity: requiredBoolean(
      summaryValue.recognizedIdentity,
      "summary.recognizedIdentity",
    ),
    authorized: requiredBoolean(
      summaryValue.authorized,
      "summary.authorized",
    ),
    validationRuleIds: requiredStringArray(
      summaryValue.validationRuleIds,
      "summary.validationRuleIds",
    ),
  };
}

function assertSummaryMatches(
  expected: HostedTransactionSummary,
  actual: HostedTransactionSummary,
): void {
  if (canonicalize(expected) !== canonicalize(actual)) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "Replayed transaction evidence differs from its recorded outcome.",
    );
  }
}

export class HostedStage3RunService {
  private readonly adapter: CoffeeStage3HostedAdapter;

  constructor(
    private readonly pack: ScenarioPackV1,
    private readonly eventStore: RunEventStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {
    this.adapter = new CoffeeStage3HostedAdapter(pack);
  }

  async createRun(
    principal: ApplicationPrincipal | null,
    request: CreateHostedStage3RunRequest,
  ): Promise<HostedStage3RunResult> {
    const creator = requireApplicationRole(principal, [
      "instructor",
      "scenario-author",
      "administrator",
    ]);
    this.validateCreateRequest(request);
    const digest = requestDigest(request);
    const existingEvents = await this.eventStore.load(request.runId);
    if (existingEvents.length > 0) {
      const existingCommandEvents = existingEvents.filter(
        (event) => event.causationId === request.commandId,
      );
      if (existingCommandEvents.length > 0) {
        if (
          existingCommandEvents[0]?.payload.requestDigest !== digest
        ) {
          throw new HostedRunCommandError(
            "COMMAND_ID_REUSED",
            `Command ID ${request.commandId} was already used with different content.`,
          );
        }
        return {
          state: await this.replay(existingEvents),
          appendedEventIds: existingCommandEvents.map(
            (event) => event.eventId,
          ),
          wasIdempotentReplay: true,
        };
      }
      throw new HostedRunCommandError(
        "RUN_ALREADY_EXISTS",
        `Run ${request.runId} already exists.`,
      );
    }
    const context = this.adapter.trustedContextFor(request);
    let state: HostedStage3RunState | null = null;
    const built: BuiltEvent[] = [];
    const created = await this.buildEvent({
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
        scenarioSeed: request.scenarioSeed,
        caseVariant: request.caseVariant,
        packContentHash: this.packContentHash(),
      },
    });
    built.push(created);
    state = created.nextState;
    const released = await this.buildEvent({
      runId: request.runId,
      state,
      principal: creator,
      context,
      commandId: request.commandId,
      commandDigest: digest,
      batchIndex: built.length,
      eventType: "EVIDENCE_RELEASED",
      payload: { evidenceId: EVIDENCE_ID },
    });
    built.push(released);
    state = released.nextState;

    const appendResult = await this.eventStore.append({
      runId: request.runId,
      expectedNextSequenceNumber: 1,
      events: built.map((event) => event.unsequenced),
    });
    return {
      state,
      appendedEventIds: appendResult.events.map((event) => event.eventId),
      wasIdempotentReplay: appendResult.wasIdempotentReplay,
    };
  }

  async submit(
    principal: ApplicationPrincipal | null,
    command: HostedStage3Command,
  ): Promise<HostedStage3RunResult> {
    const events = await this.eventStore.load(command.runId);
    if (events.length === 0) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        `Run ${command.runId} does not exist.`,
      );
    }
    let state = await this.replay(events);
    const learner = requireAssignedLearner(principal, state.learnerUserId);
    rejectSelfAssertedIdentity(command);
    const digest = requestDigest(command);
    const existing = events.filter(
      (event) => event.causationId === command.commandId,
    );
    if (existing.length > 0) {
      const recordedDigest = existing[0]?.payload.requestDigest;
      if (recordedDigest !== digest) {
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
    if (command.expectedRunVersion !== state.version) {
      throw new HostedRunCommandError(
        "RUN_VERSION_CONFLICT",
        `Run ${command.runId} is at version ${String(state.version)}, not ${String(command.expectedRunVersion)}.`,
      );
    }
    if (state.status === "completed") {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "A completed run cannot accept another learner command.",
      );
    }

    const built: BuiltEvent[] = [];
    switch (command.commandType) {
      case "INSPECT_EVIDENCE":
        this.requireWorkflow(state, "certificate-evidence");
        if (
          command.evidenceId !== EVIDENCE_ID ||
          !state.releasedEvidenceIds.includes(command.evidenceId)
        ) {
          throw new HostedRunCommandError(
            "INVALID_COMMAND",
            "The requested evidence is not available in this run.",
          );
        }
        {
          const inspected = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context: state.activeTrustedContext,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: "EVIDENCE_INSPECTED",
            payload: { evidenceId: command.evidenceId },
          });
          built.push(inspected);
          state = inspected.nextState;
          const evidence = await this.buildCompetencyEvidenceEvent({
            state,
            principal: learner,
            context: state.activeTrustedContext,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            evidenceRuleId: "RULE_CERTIFICATE_INSPECTED",
            sourceEventIds: [inspected.sequenced.eventId],
          });
          built.push(evidence);
          state = evidence.nextState;
        }
        break;
      case "SUBMIT_CERTIFICATE_DECISION":
        this.requireWorkflow(state, "certificate-decision");
        {
          this.validateDecision(command);
          const decision = {
            commandType: "SUBMIT_CERTIFICATE_DECISION" as const,
            ...command.decision,
          };
          if (
            command.justification.trim().length === 0 ||
            command.justification.length > MAXIMUM_JUSTIFICATION_LENGTH
          ) {
            throw new HostedRunCommandError(
              "INVALID_COMMAND",
              `A justification of 1-${String(MAXIMUM_JUSTIFICATION_LENGTH)} characters is required.`,
            );
          }
          const submitted = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context: state.activeTrustedContext,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: "DECISION_SUBMITTED",
            payload: {
              decision,
              justification: command.justification,
            },
          });
          built.push(submitted);
          state = submitted.nextState;
          const evidence = await this.buildCompetencyEvidenceEvent({
            state,
            principal: learner,
            context: state.activeTrustedContext,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            evidenceRuleId: "RULE_CERTIFICATE_DECISION_SUBMITTED",
            sourceEventIds: [submitted.sequenced.eventId],
          });
          built.push(evidence);
          state = evidence.nextState;
        }
        break;
      case "SUBMIT_CERTIFICATE_TRANSACTION":
        this.requireWorkflow(state, "certificate-transaction");
        {
          const proposed = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context: state.activeTrustedContext,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: "TRANSACTION_PROPOSED",
            payload: { proposalType: "ISSUE_CERTIFICATE" },
          });
          built.push(proposed);
          state = proposed.nextState;
          const transactionEventIds: string[] = [];
          for (const actionId of this.adapter.actionIdsFor(
            state.caseVariant,
          )) {
            const eventSequence = state.version + 1;
            const coreCommandId =
              `${command.commandId}_${actionId}`;
            const preview = await this.adapter.executeAction({
              runId: state.runId,
              actionId,
              coreCommandId,
              eventSequence,
              simulation: state.simulation,
              trustedContext: state.activeTrustedContext,
              scenarioSeed: state.scenarioSeed,
            });
            const eventType: PlatformRunEventType =
              preview.summary.isAccepted
                ? "TRANSACTION_COMMITTED"
                : "TRANSACTION_REJECTED";
            const transaction = await this.buildEvent({
              runId: command.runId,
              state,
              principal: learner,
              context: state.activeTrustedContext,
              commandId: command.commandId,
              commandDigest: digest,
              batchIndex: built.length,
              eventType,
              payload: {
                actionId,
                coreCommandId,
                summary: summaryToJson(preview.summary),
              },
            });
            built.push(transaction);
            transactionEventIds.push(transaction.sequenced.eventId);
            state = transaction.nextState;
          }
          if (
            state.transactions.some((transaction) =>
              transaction.validationRuleIds.includes(
                "RULE_ORGANIZATION_NOT_AUTHORIZED",
              ),
            )
          ) {
            const evidence = await this.buildCompetencyEvidenceEvent({
              state,
              principal: learner,
              context: state.activeTrustedContext,
              commandId: command.commandId,
              commandDigest: digest,
              batchIndex: built.length,
              evidenceRuleId:
                "RULE_UNAUTHORIZED_CERTIFICATE_RECOGNIZED",
              sourceEventIds: transactionEventIds,
            });
            built.push(evidence);
            state = evidence.nextState;
          }
          const completed = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context: state.activeTrustedContext,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: "RUN_COMPLETED",
            payload: {
              outcome:
                state.transactionStatus === "committed"
                  ? "certificate-committed"
                  : "certificate-rejected",
            },
          });
          built.push(completed);
          state = completed.nextState;
        }
        break;
    }

    const appendResult = await this.eventStore.append({
      runId: command.runId,
      expectedNextSequenceNumber: events.length + 1,
      events: built.map((event) => event.unsequenced),
    });
    return {
      state,
      appendedEventIds: appendResult.events.map((event) => event.eventId),
      wasIdempotentReplay: appendResult.wasIdempotentReplay,
    };
  }

  async learnerProjection(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<LearnerRunProjectionV1> {
    const state = await this.loadState(runId);
    requireAssignedLearner(principal, state.learnerUserId);
    return projectRunStateForRole(
      this.toProjectionState(state),
      state.activeTrustedContext.roleId,
    );
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

  async competencyReport(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly CompetencyEvidenceProjection[]> {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const state = await this.loadState(runId);
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
    const scenario = this.pack.scenarios.find(
      (candidate) => candidate.scenarioId === state.scenarioId,
    );
    if (scenario === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Run scenario no longer exists in its exact pack version.",
      );
    }
    return scenario.rubricIds.flatMap((rubricId) => {
      const rubric = this.pack.rubrics.find(
        (candidate) => candidate.rubricId === rubricId,
      );
      if (rubric === undefined) return [];
      return rubric.criteria.map((criterion) => {
        const observed = state.competencyEvidence.filter((evidence) =>
          criterion.evidenceRuleIds.includes(evidence.evidenceRuleId),
        );
        return {
          rubricId,
          criterionId: criterion.criterionId,
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

  async loadState(runId: string): Promise<HostedStage3RunState> {
    const events = await this.eventStore.load(runId);
    if (events.length === 0) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        `Run ${runId} does not exist.`,
      );
    }
    return this.replay(events);
  }

  private async replay(
    events: readonly RunEventV1[],
  ): Promise<HostedStage3RunState> {
    const state = await replayRunEventsAsync<
      HostedStage3RunState | null
    >(null, events, (current, event) =>
      this.applyEvent(current, event),
    );
    if (state === null) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        "Run event stream did not create a run.",
      );
    }
    return state;
  }

  private async applyEvent(
    current: Readonly<HostedStage3RunState | null>,
    event: RunEventV1,
  ): Promise<HostedStage3RunState | null> {
    const hostedScenario = this.hostedScenario();
    if (
      event.packId !== this.pack.packId ||
      event.packVersion !== this.pack.version ||
      event.scenarioId !== hostedScenario.scenarioId ||
      event.scenarioVersion !== hostedScenario.version ||
      (current !== null && event.runId !== current.runId)
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Run event does not match the exact published pack, scenario, or run.",
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
        const caseVariant = requiredString(
          event.payload.caseVariant,
          "caseVariant",
        );
        if (!isCaseVariant(caseVariant)) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Run event references an unsupported Stage 3 case.",
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
            "Run event references an unsupported hosted mode.",
          );
        }
        const request: CreateHostedStage3RunRequest = {
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
          scenarioSeed: requiredString(
            event.payload.scenarioSeed,
            "scenarioSeed",
          ),
          caseVariant,
        };
        if (
          requiredString(
            event.payload.packContentHash,
            "packContentHash",
          ) !== this.packContentHash()
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Run event content hash does not match the published pack.",
          );
        }
        return {
          schemaVersion: "1.0.0",
          runId: request.runId,
          assignmentId: request.assignmentId,
          learnerUserId: request.learnerUserId,
          packId: event.packId,
          packVersion: event.packVersion,
          packContentHash: this.packContentHash(),
          scenarioId: event.scenarioId,
          scenarioVersion: event.scenarioVersion,
          mode: request.mode,
          scenarioSeed: request.scenarioSeed,
          caseVariant,
          activeTrustedContext: this.adapter.trustedContextFor(request),
          version: event.sequenceNumber,
          status: "active",
          workflowStep: "certificate-evidence",
          releasedEvidenceIds: [],
          inspectedEvidenceIds: [],
          decision: null,
          transactionStatus: "not-started",
          transactions: [],
          competencyEvidence: [],
          simulation: this.adapter.createInitialSimulation(),
        };
      }
      case "EVIDENCE_RELEASED":
        return this.updateRequiredState(current, event, {
          releasedEvidenceIds: [
            ...this.stateOrThrow(current).releasedEvidenceIds,
            requiredString(event.payload.evidenceId, "evidenceId"),
          ],
        });
      case "EVIDENCE_INSPECTED": {
        const state = this.stateOrThrow(current);
        const evidenceId = requiredString(
          event.payload.evidenceId,
          "evidenceId",
        );
        if (!state.releasedEvidenceIds.includes(evidenceId)) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Inspected evidence was not released.",
          );
        }
        return this.updateRequiredState(current, event, {
          inspectedEvidenceIds: [
            ...new Set([...state.inspectedEvidenceIds, evidenceId]),
          ],
          workflowStep: "certificate-decision",
        });
      }
      case "DECISION_SUBMITTED": {
        const state = this.stateOrThrow(current);
        const decision = decisionFromPayload(event.payload);
        const decisionCommand = {
          metadata: {
            commandId: event.causationId,
            sessionId: state.runId,
            actorId: state.activeTrustedContext.actorId,
            organizationId: state.activeTrustedContext.organizationId,
            roleId: state.activeTrustedContext.roleId,
            submittedAt: event.serverTimestampUtc,
            expectedStateVersions: {},
          },
          payload: decision.decision,
        };
        const outcome = handleSimulationDecision({
          runtime: state.simulation,
          command: decisionCommand,
          trustedContext: state.activeTrustedContext,
          isAccepted: true,
          decisionType: "SUBMIT_CERTIFICATE_DECISION",
          decisionPayload: {
            decision: decision.decision,
            justification: decision.justification,
          },
          environment: {
            clock: new FixedClock(event.serverTimestampUtc),
            random: new SeededRandomSource(
              `${state.scenarioSeed}:${event.sequenceNumber}`,
            ),
            ids: new SequenceIdGenerator(event.sequenceNumber * 100),
          },
        });
        return {
          ...state,
          version: event.sequenceNumber,
          workflowStep: "certificate-transaction",
          decision,
          simulation: outcome.state,
        };
      }
      case "TRANSACTION_PROPOSED":
        return this.updateRequiredState(current, event, {
          transactionStatus: "proposed",
        });
      case "TRANSACTION_COMMITTED":
      case "TRANSACTION_REJECTED": {
        const state = this.stateOrThrow(current);
        const actionId = requiredString(
          event.payload.actionId,
          "actionId",
        );
        const coreCommandId = requiredString(
          event.payload.coreCommandId,
          "coreCommandId",
        );
        const executed = await this.adapter.executeAction({
          runId: state.runId,
          actionId,
          coreCommandId,
          eventSequence: event.sequenceNumber,
          simulation: state.simulation,
          trustedContext: state.activeTrustedContext,
          scenarioSeed: state.scenarioSeed,
        });
        const expected = summaryFromPayload(event.payload);
        assertSummaryMatches(expected, executed.summary);
        const shouldBeAccepted =
          event.eventType === "TRANSACTION_COMMITTED";
        if (executed.summary.isAccepted !== shouldBeAccepted) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Transaction event type does not match replayed acceptance.",
          );
        }
        return {
          ...state,
          version: event.sequenceNumber,
          transactionStatus:
            executed.summary.isAccepted &&
            actionId === "ISSUE_CERTIFICATE"
              ? "committed"
              : executed.summary.isAccepted
                ? "proposed"
                : "rejected",
          transactions: [...state.transactions, executed.summary],
          simulation: executed.simulation,
        };
      }
      case "COMPETENCY_EVIDENCE_RECORDED": {
        const state = this.stateOrThrow(current);
        const evidence: HostedCompetencyEvidence = {
          competencyEvidenceId: requiredString(
            event.payload.competencyEvidenceId,
            "competencyEvidenceId",
          ),
          evidenceRuleId: requiredString(
            event.payload.evidenceRuleId,
            "evidenceRuleId",
          ),
          indicatorIds: requiredStringArray(
            event.payload.indicatorIds,
            "indicatorIds",
          ),
          sourceEventIds: requiredStringArray(
            event.payload.sourceEventIds,
            "sourceEventIds",
          ),
          observedAt: event.serverTimestampUtc,
        };
        return {
          ...state,
          version: event.sequenceNumber,
          competencyEvidence: [...state.competencyEvidence, evidence],
        };
      }
      case "RUN_COMPLETED":
        return this.updateRequiredState(current, event, {
          status: "completed",
          workflowStep: "complete",
        });
      default:
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          `Event type ${event.eventType} is not part of the Stage 3 vertical slice.`,
        );
    }
  }

  private async buildEvent(options: {
    readonly runId: string;
    readonly state: HostedStage3RunState | null;
    readonly principal: ApplicationPrincipal;
    readonly context: TrustedExecutionContext;
    readonly commandId: string;
    readonly commandDigest: string;
    readonly batchIndex: number;
    readonly eventType: PlatformRunEventType;
    readonly payload: JsonObject;
  }): Promise<BuiltEvent> {
    if (options.state !== null && options.state.runId !== options.runId) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "An event cannot be appended to a different run.",
      );
    }
    const sequenceNumber = (options.state?.version ?? 0) + 1;
    const payload: JsonObject = {
      ...options.payload,
      requestDigest: options.commandDigest,
    };
    const eventId = this.ids.nextId("HEVT");
    const unsequenced: UnsequencedRunEventV1 = {
      eventId,
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
      scenarioId: this.hostedScenario().scenarioId,
      scenarioVersion: this.hostedScenario().version,
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
    const nextState = await this.applyEvent(options.state, placeholder);
    if (nextState === null) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "A Stage 3 event unexpectedly removed the run state.",
      );
    }
    const resultingStateHash = hashReplayState(nextState);
    const completedUnsequenced = {
      ...unsequenced,
      resultingStateHash,
    };
    return {
      unsequenced: completedUnsequenced,
      sequenced: {
        ...completedUnsequenced,
        schemaVersion: "1.0.0",
        sequenceNumber,
      },
      nextState,
    };
  }

  private async buildCompetencyEvidenceEvent(options: {
    readonly state: HostedStage3RunState;
    readonly principal: ApplicationPrincipal;
    readonly context: TrustedExecutionContext;
    readonly commandId: string;
    readonly commandDigest: string;
    readonly batchIndex: number;
    readonly evidenceRuleId: string;
    readonly sourceEventIds: readonly string[];
  }): Promise<BuiltEvent> {
    const rule = this.pack.evidenceRules.find(
      (candidate) =>
        candidate.evidenceRuleId === options.evidenceRuleId,
    );
    if (rule === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        `Evidence rule ${options.evidenceRuleId} is missing from the pack.`,
      );
    }
    return this.buildEvent({
      runId: options.state.runId,
      state: options.state,
      principal: options.principal,
      context: options.context,
      commandId: options.commandId,
      commandDigest: options.commandDigest,
      batchIndex: options.batchIndex,
      eventType: "COMPETENCY_EVIDENCE_RECORDED",
      payload: {
        competencyEvidenceId: this.ids.nextId("CEV"),
        evidenceRuleId: rule.evidenceRuleId,
        indicatorIds: rule.indicatorIds,
        sourceEventIds: options.sourceEventIds,
      },
    });
  }

  private updateRequiredState(
    current: Readonly<HostedStage3RunState | null>,
    event: RunEventV1,
    patch: Partial<HostedStage3RunState>,
  ): HostedStage3RunState {
    return {
      ...this.stateOrThrow(current),
      ...patch,
      version: event.sequenceNumber,
    };
  }

  private stateOrThrow(
    state: Readonly<HostedStage3RunState | null>,
  ): HostedStage3RunState {
    if (state === null) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Run event occurred before RUN_CREATED.",
      );
    }
    return state;
  }

  private requireWorkflow(
    state: HostedStage3RunState,
    expected: HostedStage3RunState["workflowStep"],
  ): void {
    if (state.workflowStep !== expected) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        `Expected workflow step ${expected}, received ${state.workflowStep}.`,
      );
    }
  }

  private validateCreateRequest(
    request: CreateHostedStage3RunRequest,
  ): void {
    for (const [field, value] of Object.entries({
      commandId: request.commandId,
      runId: request.runId,
      assignmentId: request.assignmentId,
      learnerUserId: request.learnerUserId,
      scenarioSeed: request.scenarioSeed,
    })) {
      requiredString(value, field);
    }
    if (!isCaseVariant(request.caseVariant)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Stage 3 case variant is not scenario-controlled.",
      );
    }
    if (!this.hostedScenario().supportedModes.includes(request.mode)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `Hosted mode ${request.mode} is not supported by this scenario.`,
      );
    }
  }

  private validateDecision(
    command: Extract<
      HostedStage3Command,
      { readonly commandType: "SUBMIT_CERTIFICATE_DECISION" }
    >,
  ): void {
    if (
      !CERTIFICATE_ASSESSMENTS.includes(
        command.decision
          .certificateAssessment as (typeof CERTIFICATE_ASSESSMENTS)[number],
      ) ||
      !ISSUER_ASSESSMENTS.includes(
        command.decision
          .issuerAssessment as (typeof ISSUER_ASSESSMENTS)[number],
      ) ||
      !STORAGE_CHOICES.includes(
        command.decision
          .storageChoice as (typeof STORAGE_CHOICES)[number],
      ) ||
      !LOT_DISPOSITIONS.includes(
        command.decision
          .lotDisposition as (typeof LOT_DISPOSITIONS)[number],
      )
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Certificate decision contains an unsupported authored option.",
      );
    }
  }

  private packContentHash(): string {
    const contentHash = this.pack.publication?.contentHash;
    if (contentHash === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Hosted runs require a published pack content hash.",
      );
    }
    return contentHash;
  }

  private hostedScenario() {
    const scenario = this.pack.scenarios.find(
      (candidate) =>
        candidate.legacyCompatibility?.stageId ===
        "STG_03_ANCHOR_CERTIFICATE",
    );
    if (scenario === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Published pack no longer contains its Stage 3 scenario.",
      );
    }
    return scenario;
  }

  private toProjectionState(state: HostedStage3RunState) {
    const roleId = state.activeTrustedContext.roleId;
    const scenario = this.hostedScenario();
    const evidenceRecords = scenario.evidenceItems
      .filter((item) => state.releasedEvidenceIds.includes(item.evidenceId))
      .map((item) => ({
        recordId: item.evidenceId,
        visibleToRoleIds: item.visibleToRoleIds,
        value: {
          evidenceType: item.evidenceType,
          titleKey: item.title.localizationKey,
          inspected: state.inspectedEvidenceIds.includes(item.evidenceId),
          content: item.content,
        } satisfies JsonValue,
      }));
    const policyRecords = state.transactions.map((transaction, index) => ({
      recordId: `POLICY_RESULT_${String(index + 1)}`,
      visibleToRoleIds: [roleId],
      value: {
        actionId: transaction.actionId,
        signatureValid: transaction.signatureValid,
        recognizedIdentity: transaction.recognizedIdentity,
        authorized: transaction.authorized,
        validationRuleIds: transaction.validationRuleIds,
      } satisfies JsonValue,
    }));
    const permittedActionIds =
      state.workflowStep === "certificate-evidence"
        ? ["INSPECT_EVIDENCE"]
        : state.workflowStep === "certificate-decision"
          ? ["SUBMIT_CERTIFICATE_DECISION"]
          : state.workflowStep === "certificate-transaction"
            ? ["SUBMIT_CERTIFICATE_TRANSACTION"]
            : [];
    return {
      schemaVersion: "1.0.0" as const,
      runId: state.runId,
      version: state.version,
      actualState: {
        caseVariant: state.caseVariant,
        scenarioSeed: state.scenarioSeed,
      },
      businessState: [
        {
          recordId: "DECISION_STATUS",
          visibleToRoleIds: [roleId],
          value: {
            submitted: state.decision !== null,
          },
        },
        {
          recordId: "TRANSACTION_STATUS",
          visibleToRoleIds: [roleId],
          value: state.transactionStatus,
        },
      ],
      ledgerState: {
        transactions: this.adapter.transactionInventory(state.simulation),
      },
      informationState: evidenceRecords,
      policyState: policyRecords,
      workflowState: {
        currentNodeId: state.workflowStep,
        completedNodeIds: this.completedWorkflowSteps(state),
        permittedActionIdsByRole: {
          [roleId]: permittedActionIds,
        },
      },
      rngState: {
        seed: state.scenarioSeed,
        streamPosition: state.version,
        recordedDraws: [],
      },
    };
  }

  private completedWorkflowSteps(
    state: HostedStage3RunState,
  ): readonly string[] {
    const ordered = [
      "certificate-evidence",
      "certificate-decision",
      "certificate-transaction",
      "complete",
    ] as const;
    const index = ordered.indexOf(state.workflowStep);
    return ordered.slice(0, index);
  }
}
