import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import {
  CERTIFICATE_ASSESSMENTS,
  DISCREPANCY_ACTIONS,
  DISCREPANCY_CAUSES,
  evaluateCertificateDecision,
  evaluateDiscrepancyDecision,
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
  MitigationDecisionCommand,
  SubmitCertificateDecisionCommand,
  SubmitDiscrepancyDecisionCommand,
  TrustedExecutionContext,
} from "../../domain/simulation/types";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import type {
  CounterfactualRunMetadataV1,
  CreateCounterfactualBranchRequestV1,
} from "../contracts/counterfactual";
import type {
  LearnerRunProjectionV1,
  PlatformRunEventType,
  RunEventV1,
  UnsequencedRunEventV1,
} from "../contracts/run-events";
import type { HostedRunMonitorStatusV1 } from "../contracts/assessment";
import type {
  HostedDecisionItemEvidenceV1,
  HostedRunDecisionOutcomeEvidenceV1,
} from "../contracts/decision-outcome-report";
import type { JsonObject, JsonValue } from "../contracts/json";
import { isJsonObject } from "../contracts/json";
import type { InstructorRunReplayV1 } from "../contracts/run-replay";
import type {
  DecisionNodeV1,
  ScenarioPackV1,
} from "../contracts/scenario-pack";
import type { RunEventStore } from "../runs/event-store";
import { evaluateAutomatedEvidenceRule } from "../runs/automated-evidence-rule";
import {
  CounterfactualBranchEngine,
  CounterfactualBranchError,
  type CounterfactualBranchRuntimeAdapter,
} from "../runs/counterfactual-branch";
import type { SaveCounterfactualRunResult } from "../runs/counterfactual-repository";
import { projectRunStateForRole } from "../runs/projection";
import {
  hashReplayState,
  replayRunEventsAsync,
} from "../runs/replay";
import {
  modeConfigurationFor,
  validateHostedModeConfiguration,
} from "../runs/mode-configuration";
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
import { CoffeeHostedDomainRuntime } from "./coffee-domain-runtime";
import type {
  CompetencyEvidenceProjection,
  CreateHostedStage3RunRequest,
  HostedClassificationDecision,
  HostedCompetencyEvidence,
  HostedCorrectionProposalSummary,
  HostedCustodyProposalSummary,
  HostedDiscrepancyDecision,
  HostedEndorsementSummary,
  HostedKnowledgeDecision,
  HostedRecallScopeDecision,
  HostedStage3Command,
  HostedStage3Decision,
  HostedStage3RunResult,
  HostedStage3RunState,
  HostedTamperSummary,
  HostedTransactionSummary,
  InstructorTimelineItem,
  RubricEvidenceProjection,
  Stage3CaseVariant,
} from "./stage3-types";

const EVIDENCE_ID = "EVID_CERTIFICATE_RECORD";
const MAXIMUM_JUSTIFICATION_LENGTH = 1_000;
const MINIMUM_CORRECTION_REASON_LENGTH = 10;
const FORBIDDEN_IDENTITY_FIELDS = new Set([
  "actorId",
  "authenticatedUserId",
  "organizationId",
  "roleId",
  "simulationActorId",
]);

function competencyEvidenceProjection(
  state: HostedStage3RunState,
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

export class HostedRunCommandError extends Error {
  constructor(
    readonly code:
      | "RUN_ALREADY_EXISTS"
      | "RUN_NOT_FOUND"
      | "RUN_VERSION_CONFLICT"
      | "RUN_TIME_LIMIT_EXCEEDED"
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

interface LoadedStage3Run {
  readonly state: HostedStage3RunState;
  readonly commandEvents: readonly RunEventV1[];
  readonly startedAt: string;
  readonly isCounterfactual: boolean;
}

function requestDigest(request: unknown): string {
  return sha256Hex(canonicalize(request));
}

function submittedCommandIntent(
  command: HostedStage3Command,
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
  command: HostedStage3Command,
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

function optionalStringArray(
  value: unknown,
  path: string,
): readonly string[] {
  return value === undefined ? [] : requiredStringArray(value, path);
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

function requiredNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      `${path} must be a finite number.`,
    );
  }
  return value;
}

function optionalNumber(
  value: unknown,
  path: string,
): number | null {
  return value === undefined ? null : requiredNumber(value, path);
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
    citedEvidenceIds: optionalStringArray(
      payload.citedEvidenceIds,
      "citedEvidenceIds",
    ),
    citedPolicyIds: optionalStringArray(
      payload.citedPolicyIds,
      "citedPolicyIds",
    ),
    confidenceRating: optionalNumber(
      payload.confidenceRating,
      "confidenceRating",
    ),
    adverseEventProbabilityPercent: optionalNumber(
      payload.adverseEventProbabilityPercent,
      "adverseEventProbabilityPercent",
    ),
    isAuthoredCorrect:
      evaluation.certificateAssessmentCorrect &&
      evaluation.issuerAssessmentCorrect &&
      evaluation.storageChoiceCorrect &&
      evaluation.lotDispositionCorrect,
  };
}

function discrepancyDecisionFromPayload(
  payload: JsonObject,
): HostedDiscrepancyDecision {
  const decisionValue = payload.decision;
  if (!isJsonObject(decisionValue)) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Discrepancy event is missing its structured decision.",
    );
  }
  const action = requiredString(
    decisionValue.action,
    "decision.action",
  );
  const causeCode = requiredString(
    decisionValue.causeCode,
    "decision.causeCode",
  );
  if (
    !DISCREPANCY_ACTIONS.includes(
      action as (typeof DISCREPANCY_ACTIONS)[number],
    ) ||
    !DISCREPANCY_CAUSES.includes(
      causeCode as (typeof DISCREPANCY_CAUSES)[number],
    )
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Discrepancy event contains an unsupported authored option.",
    );
  }
  const decision: SubmitDiscrepancyDecisionCommand = {
    commandType: "SUBMIT_DISCREPANCY_DECISION",
    action:
      action as SubmitDiscrepancyDecisionCommand["action"],
    causeCode:
      causeCode as SubmitDiscrepancyDecisionCommand["causeCode"],
  };
  const evaluation = evaluateDiscrepancyDecision(
    decision,
    coffeeScenario,
  );
  return {
    decision,
    ...evaluation,
  };
}

function hostedKnowledgeDecision(
  decisionId: string,
  selectedOptionId: string,
): HostedKnowledgeDecision {
  const definition = coffeeScenario.stages
    .flatMap((stage) => stage.knowledgeChecks)
    .find(
      (candidate) =>
        candidate.knowledgeCheckId === decisionId,
    );
  if (
    definition === undefined ||
    !definition.options.some(
      (option) => option.optionId === selectedOptionId,
    )
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Knowledge decision contains an unsupported authored option.",
    );
  }
  return {
    decisionId,
    selectedOptionId,
    isAuthoredCorrect:
      definition.correctOptionIds.includes(selectedOptionId),
  };
}

function hostedClassificationDecision(
  decisionId: string,
  categoryByItem: Readonly<Record<string, string>>,
): HostedClassificationDecision {
  const definition = coffeeScenario.stages
    .flatMap((stage) => stage.knowledgeChecks)
    .find(
      (candidate) =>
        candidate.knowledgeCheckId === decisionId,
    );
  const categories = definition?.categories ?? [];
  if (
    definition === undefined ||
    categories.length === 0 ||
    definition.options.some(
      (option) => option.categoryId === undefined,
    )
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Classification decision is not authored for this scenario.",
    );
  }
  const optionIds = definition.options.map(
    (option) => option.optionId,
  );
  const suppliedIds = Object.keys(categoryByItem);
  const categoryIds = new Set(
    categories.map((category) => category.categoryId),
  );
  if (
    suppliedIds.length !== optionIds.length ||
    suppliedIds.some((itemId) => !optionIds.includes(itemId)) ||
    optionIds.some(
      (itemId) =>
        !categoryIds.has(categoryByItem[itemId] ?? ""),
    )
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Classification decision must assign every authored item to one authored category.",
    );
  }
  const normalized = Object.fromEntries(
    optionIds.map((itemId) => [
      itemId,
      categoryByItem[itemId] as string,
    ]),
  );
  return {
    decisionId,
    categoryByItem: normalized,
    isAuthoredCorrect: definition.options.every(
      (option) =>
        normalized[option.optionId] === option.categoryId,
    ),
  };
}

function hostedRecallScopeDecision(
  selectedAssetIds: readonly string[],
): HostedRecallScopeDecision {
  const definition = coffeeScenario.stages
    .flatMap((stage) => stage.knowledgeChecks)
    .find(
      (candidate) =>
        candidate.knowledgeCheckId === "INT_RECALL_SCOPE",
    );
  if (definition === undefined) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "Recall-scope decision is missing from the coffee scenario.",
    );
  }
  const optionIds = definition.options.map(
    (option) => option.optionId,
  );
  if (
    selectedAssetIds.length === 0 ||
    new Set(selectedAssetIds).size !== selectedAssetIds.length ||
    selectedAssetIds.some(
      (assetId) => !optionIds.includes(assetId),
    )
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Recall scope must contain unique authored asset options.",
    );
  }
  const normalized = optionIds.filter((optionId) =>
    selectedAssetIds.includes(optionId),
  );
  return {
    decisionId: "INT_RECALL_SCOPE",
    selectedAssetIds: normalized,
    isAuthoredCorrect:
      normalized.length === definition.correctOptionIds.length &&
      definition.correctOptionIds.every((optionId) =>
        normalized.includes(optionId),
      ),
  };
}

function tamperSummaryToJson(
  summary: HostedTamperSummary,
): JsonObject {
  return {
    transactionId: summary.transactionId,
    originalQuantity: summary.originalQuantity,
    tamperedQuantity: summary.tamperedQuantity,
    beforeValid: summary.beforeValid,
    invalidTransactionIdsAfterEdit:
      summary.invalidTransactionIdsAfterEdit,
    invalidBlockIdsAfterForgingTransaction:
      summary.invalidBlockIdsAfterForgingTransaction,
    invalidBlockIdsAfterForgingBlock:
      summary.invalidBlockIdsAfterForgingBlock,
    cascadingBlockIds: summary.cascadingBlockIds,
    realLedgerIntact: summary.realLedgerIntact,
  };
}

function tamperSummaryFromPayload(
  payload: JsonObject,
): HostedTamperSummary {
  const summary = payload.summary;
  if (!isJsonObject(summary)) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Tamper demonstration event is missing its summary.",
    );
  }
  return {
    transactionId: requiredString(
      summary.transactionId,
      "summary.transactionId",
    ),
    originalQuantity: requiredNumber(
      summary.originalQuantity,
      "summary.originalQuantity",
    ),
    tamperedQuantity: requiredNumber(
      summary.tamperedQuantity,
      "summary.tamperedQuantity",
    ),
    beforeValid: requiredBoolean(
      summary.beforeValid,
      "summary.beforeValid",
    ),
    invalidTransactionIdsAfterEdit: requiredStringArray(
      summary.invalidTransactionIdsAfterEdit,
      "summary.invalidTransactionIdsAfterEdit",
    ),
    invalidBlockIdsAfterForgingTransaction: requiredStringArray(
      summary.invalidBlockIdsAfterForgingTransaction,
      "summary.invalidBlockIdsAfterForgingTransaction",
    ),
    invalidBlockIdsAfterForgingBlock: requiredStringArray(
      summary.invalidBlockIdsAfterForgingBlock,
      "summary.invalidBlockIdsAfterForgingBlock",
    ),
    cascadingBlockIds: requiredStringArray(
      summary.cascadingBlockIds,
      "summary.cascadingBlockIds",
    ),
    realLedgerIntact: requiredBoolean(
      summary.realLedgerIntact,
      "summary.realLedgerIntact",
    ),
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

function custodyProposalSummaryToJson(
  summary: HostedCustodyProposalSummary,
): JsonObject {
  return {
    actionId: summary.actionId,
    coreCommandId: summary.coreCommandId,
    isAccepted: summary.isAccepted,
    proposalId: summary.proposalId,
    proposalDigest: summary.proposalDigest,
    endorsementPolicyId: summary.endorsementPolicyId,
    policySatisfied: summary.policySatisfied,
    validationRuleIds: summary.validationRuleIds,
  };
}

function nullableString(value: unknown, path: string): string | null {
  if (value !== null && typeof value !== "string") {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      `${path} must be a string or null.`,
    );
  }
  return value;
}

function custodyProposalSummaryFromPayload(
  payload: JsonObject,
): HostedCustodyProposalSummary {
  const summary = payload.summary;
  if (!isJsonObject(summary)) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Custody proposal event is missing its outcome summary.",
    );
  }
  const actionId = requiredString(summary.actionId, "summary.actionId");
  if (actionId !== "TRANSFER_CUSTODY") {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Custody proposal summary has an unsupported action.",
    );
  }
  return {
    actionId,
    coreCommandId: requiredString(
      summary.coreCommandId,
      "summary.coreCommandId",
    ),
    isAccepted: requiredBoolean(
      summary.isAccepted,
      "summary.isAccepted",
    ),
    proposalId: nullableString(
      summary.proposalId,
      "summary.proposalId",
    ),
    proposalDigest: nullableString(
      summary.proposalDigest,
      "summary.proposalDigest",
    ),
    endorsementPolicyId: nullableString(
      summary.endorsementPolicyId,
      "summary.endorsementPolicyId",
    ),
    policySatisfied: requiredBoolean(
      summary.policySatisfied,
      "summary.policySatisfied",
    ),
    validationRuleIds: requiredStringArray(
      summary.validationRuleIds,
      "summary.validationRuleIds",
    ),
  };
}

function correctionProposalSummaryToJson(
  summary: HostedCorrectionProposalSummary,
): JsonObject {
  return {
    actionId: summary.actionId,
    coreCommandId: summary.coreCommandId,
    isAccepted: summary.isAccepted,
    proposalId: summary.proposalId,
    proposalDigest: summary.proposalDigest,
    endorsementPolicyId: summary.endorsementPolicyId,
    policySatisfied: summary.policySatisfied,
    validationRuleIds: summary.validationRuleIds,
  };
}

function correctionProposalSummaryFromPayload(
  payload: JsonObject,
): HostedCorrectionProposalSummary {
  const summary = payload.summary;
  if (!isJsonObject(summary)) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Correction proposal event is missing its outcome summary.",
    );
  }
  const actionId = requiredString(summary.actionId, "summary.actionId");
  if (actionId !== "RECORD_CORRECTION") {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Correction proposal summary has an unsupported action.",
    );
  }
  return {
    actionId,
    coreCommandId: requiredString(
      summary.coreCommandId,
      "summary.coreCommandId",
    ),
    isAccepted: requiredBoolean(
      summary.isAccepted,
      "summary.isAccepted",
    ),
    proposalId: nullableString(
      summary.proposalId,
      "summary.proposalId",
    ),
    proposalDigest: nullableString(
      summary.proposalDigest,
      "summary.proposalDigest",
    ),
    endorsementPolicyId: nullableString(
      summary.endorsementPolicyId,
      "summary.endorsementPolicyId",
    ),
    policySatisfied: requiredBoolean(
      summary.policySatisfied,
      "summary.policySatisfied",
    ),
    validationRuleIds: requiredStringArray(
      summary.validationRuleIds,
      "summary.validationRuleIds",
    ),
  };
}

function endorsementSummaryToJson(
  summary: HostedEndorsementSummary,
): JsonObject {
  return {
    coreCommandId: summary.coreCommandId,
    isAccepted: summary.isAccepted,
    proposalId: summary.proposalId,
    organizationId: summary.organizationId,
    policySatisfied: summary.policySatisfied,
    validationRuleIds: summary.validationRuleIds,
  };
}

function endorsementSummaryFromPayload(
  payload: JsonObject,
): HostedEndorsementSummary {
  const summary = payload.summary;
  if (!isJsonObject(summary)) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "Custody endorsement event is missing its outcome summary.",
    );
  }
  return {
    coreCommandId: requiredString(
      summary.coreCommandId,
      "summary.coreCommandId",
    ),
    isAccepted: requiredBoolean(
      summary.isAccepted,
      "summary.isAccepted",
    ),
    proposalId: requiredString(
      summary.proposalId,
      "summary.proposalId",
    ),
    organizationId: requiredString(
      summary.organizationId,
      "summary.organizationId",
    ),
    policySatisfied: requiredBoolean(
      summary.policySatisfied,
      "summary.policySatisfied",
    ),
    validationRuleIds: requiredStringArray(
      summary.validationRuleIds,
      "summary.validationRuleIds",
    ),
  };
}

function assertReplayEvidenceMatches(
  expected: unknown,
  actual: unknown,
  label: string,
): void {
  if (canonicalize(expected) !== canonicalize(actual)) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      `Replayed ${label} evidence differs from its recorded outcome.`,
    );
  }
}

export class HostedStage3RunService {
  private readonly domainRuntime: CoffeeHostedDomainRuntime;

  constructor(
    private readonly pack: ScenarioPackV1,
    private readonly eventStore: RunEventStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly counterfactualBranches?: CounterfactualBranchEngine,
  ) {
    this.domainRuntime = new CoffeeHostedDomainRuntime(pack);
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
    request: CreateHostedStage3RunRequest,
  ): Promise<HostedStage3RunResult> {
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
    const {
      modeConfiguration,
      outcomeResolution,
      scenarioSeed,
    } =
      this.resolveModeAndOutcome(request);
    if (!isCaseVariant(outcomeResolution.outcomeCode)) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The authored certificate outcome is not a supported case variant.",
      );
    }
    const effectiveRequest: CreateHostedStage3RunRequest = {
      ...request,
      modeConfiguration,
      scenarioSeed,
      caseVariant: outcomeResolution.outcomeCode,
    };
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
    const context = this.domainRuntime.trustedContextFor(effectiveRequest);
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
        scenarioSeed,
        caseVariant: effectiveRequest.caseVariant,
        modeConfiguration:
          modeConfiguration as unknown as JsonObject,
        packContentHash: this.packContentHash(),
      },
    });
    built.push(created);
    state = created.nextState;
    if (outcomeResolution.strategy === "probabilistic") {
      const randomDraw = await this.buildEvent({
        runId: request.runId,
        state,
        principal: creator,
        context,
        commandId: request.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        eventType: "RANDOM_DRAW_MADE",
        payload: {
          outcomeModelId: outcomeResolution.outcomeModelId,
          distribution: outcomeResolution.distribution,
          randomStreamId: outcomeResolution.randomStreamId,
          probabilityParameters:
            outcomeResolution.probabilityParameters as JsonObject,
          draw: outcomeResolution.draw ?? -1,
        },
      });
      built.push(randomDraw);
      state = randomDraw.nextState;
      const outcome = await this.buildEvent({
        runId: request.runId,
        state,
        principal: creator,
        context,
        commandId: request.commandId,
        commandDigest: digest,
        batchIndex: built.length,
        eventType: "OUTCOME_REALIZED",
        payload: {
          outcomeModelId: outcomeResolution.outcomeModelId,
          outcomeCode: outcomeResolution.outcomeCode,
        },
      });
      built.push(outcome);
      state = outcome.nextState;
    }
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
    return this.submitCommand(principal, command, false);
  }

  async submitCounterfactual(
    principal: ApplicationPrincipal | null,
    command: HostedStage3Command,
  ): Promise<HostedStage3RunResult> {
    return this.submitCommand(principal, command, true);
  }

  private async submitCommand(
    principal: ApplicationPrincipal | null,
    command: HostedStage3Command,
    requireCounterfactual: boolean,
  ): Promise<HostedStage3RunResult> {
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
    const startedAt = loaded.startedAt;
    const timing = this.runTiming(
      state,
      startedAt,
      this.clock.now(),
    );
    if (timing.status === "expired") {
      if (
        events.some(
          (event) =>
            event.eventType === "RUN_TIME_LIMIT_EXCEEDED",
        )
      ) {
        throw new HostedRunCommandError(
          "RUN_TIME_LIMIT_EXCEEDED",
          "The authored run time limit has elapsed.",
        );
      }
      const deadline = timing.deadline;
      const timeLimitMinutes = timing.timeLimitMinutes;
      if (
        deadline === undefined ||
        timeLimitMinutes === undefined
      ) {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "An expired run must have an authored deadline.",
        );
      }
      const expired = await this.buildEvent({
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
          timeLimitMinutes,
          deadlineUtc: deadline,
        },
      });
      const appendResult = await this.eventStore.append({
        runId: command.runId,
        expectedNextSequenceNumber: events.length + 1,
        events: eventsWithSubmittedCommand([expired], command),
      });
      return {
        state: expired.nextState,
        appendedEventIds: appendResult.events.map(
          (event) => event.eventId,
        ),
        wasIdempotentReplay: appendResult.wasIdempotentReplay,
      };
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
            sourceEvents: [inspected.sequenced],
          });
          built.push(evidence);
          state = evidence.nextState;
        }
        break;
      case "SUBMIT_CERTIFICATE_DECISION":
        this.requireWorkflow(state, "certificate-decision");
        {
          this.validateDecision(command);
          this.validateStructuredDecisionResponse(
            {
              citedEvidenceIds: command.citedEvidenceIds ?? [],
              citedPolicyIds: command.citedPolicyIds ?? [],
              confidenceRating: command.confidenceRating ?? null,
              adverseEventProbabilityPercent:
                command.adverseEventProbabilityPercent ?? null,
            },
            state,
          );
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
              ...(command.citedEvidenceIds === undefined
                ? {}
                : {
                    citedEvidenceIds: command.citedEvidenceIds,
                  }),
              ...(command.citedPolicyIds === undefined
                ? {}
                : {
                    citedPolicyIds: command.citedPolicyIds,
                  }),
              ...(command.confidenceRating === undefined
                ? {}
                : {
                    confidenceRating: command.confidenceRating,
                  }),
              ...(command.adverseEventProbabilityPercent === undefined
                ? {}
                : {
                    adverseEventProbabilityPercent:
                      command.adverseEventProbabilityPercent,
                  }),
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
            sourceEvents: [submitted.sequenced],
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
          const transactionEvents: RunEventV1[] = [];
          for (const actionId of this.domainRuntime.actionIdsFor(
            state.caseVariant,
          )) {
            const eventSequence = state.version + 1;
            const coreCommandId =
              `${command.commandId}_${actionId}`;
            const preview = await this.domainRuntime.executeAction({
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
                validationRuleId:
                  preview.summary.validationRuleIds[0] ??
                  "RULE_NONE",
                summary: summaryToJson(preview.summary),
              },
            });
            built.push(transaction);
            transactionEvents.push(transaction.sequenced);
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
              sourceEvents: transactionEvents,
            });
            built.push(evidence);
            state = evidence.nextState;
          }
          const certificateCommitted =
            state.transactionStatus === "committed";
          const completed = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context: state.activeTrustedContext,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: certificateCommitted
              ? "WORKFLOW_ADVANCED"
              : "RUN_COMPLETED",
            payload: certificateCommitted
              ? {
                  workflowStep: "custody-proposal",
                  contextId: "CTX_PRODUCER",
                }
              : { outcome: "certificate-rejected" },
          });
          built.push(completed);
          state = completed.nextState;
        }
        break;
      case "CREATE_CUSTODY_TRANSFER_PROPOSAL":
        this.requireWorkflow(state, "custody-proposal");
        {
          const context = this.domainRuntime.trustedContextForId(
            "CTX_PRODUCER",
          );
          const coreCommandId = `${command.commandId}_TRANSFER_CUSTODY`;
          const preview = await this.domainRuntime.createCustodyProposal({
            runId: command.runId,
            coreCommandId,
            eventSequence: state.version + 1,
            simulation: state.simulation,
            scenarioSeed: state.scenarioSeed,
            alsoTransfersOwnership: command.alsoTransfersOwnership,
          });
          const proposal = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: preview.summary.isAccepted
              ? "ENDORSEMENT_PROPOSAL_CREATED"
              : "ENDORSEMENT_PROPOSAL_REJECTED",
            payload: {
              coreCommandId,
              alsoTransfersOwnership:
                command.alsoTransfersOwnership,
              summary: custodyProposalSummaryToJson(
                preview.summary,
              ),
            },
          });
          built.push(proposal);
          state = proposal.nextState;
        }
        break;
      case "ENDORSE_CUSTODY_TRANSFER":
        this.requireWorkflow(state, "custody-endorsement");
        if (command.proposalId !== state.pendingProposalId) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "The custody endorsement must refer to the active proposal.",
          );
        }
        {
          const context = this.domainRuntime.trustedContextForId(
            "CTX_LOGISTICS",
          );
          const coreCommandId = `${command.commandId}_ENDORSE`;
          const preview = await this.domainRuntime.endorseCustodyProposal({
            runId: command.runId,
            proposalId: command.proposalId,
            coreCommandId,
            eventSequence: state.version + 1,
            simulation: state.simulation,
            scenarioSeed: state.scenarioSeed,
          });
          const endorsement = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: preview.summary.isAccepted
              ? "ENDORSEMENT_RECORDED"
              : "ENDORSEMENT_REJECTED",
            payload: {
              coreCommandId,
              proposalId: command.proposalId,
              summary: endorsementSummaryToJson(
                preview.summary,
              ),
            },
          });
          built.push(endorsement);
          state = endorsement.nextState;
          if (
            preview.summary.isAccepted &&
            preview.summary.policySatisfied
          ) {
            const evidence = await this.buildCompetencyEvidenceEvent({
              state,
              principal: learner,
              context,
              commandId: command.commandId,
              commandDigest: digest,
              batchIndex: built.length,
              evidenceRuleId:
                "RULE_CUSTODY_ENDORSEMENT_SATISFIED",
              sourceEvents: [endorsement.sequenced],
            });
            built.push(evidence);
            state = evidence.nextState;
          }
        }
        break;
      case "COMMIT_CUSTODY_TRANSFER":
        this.requireWorkflow(state, "custody-commit");
        if (command.proposalId !== state.pendingProposalId) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "The custody commitment must refer to the active proposal.",
          );
        }
        {
          const context = this.domainRuntime.trustedContextForId(
            "CTX_LOGISTICS",
          );
          const coreCommandId = `${command.commandId}_COMMIT`;
          const preview = this.domainRuntime.commitCustodyProposal({
            runId: command.runId,
            proposalId: command.proposalId,
            coreCommandId,
            eventSequence: state.version + 1,
            simulation: state.simulation,
            scenarioSeed: state.scenarioSeed,
          });
          const commitment = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: preview.summary.isAccepted
              ? "ENDORSED_TRANSACTION_COMMITTED"
              : "ENDORSED_TRANSACTION_REJECTED",
            payload: {
              actionId: "TRANSFER_CUSTODY",
              coreCommandId,
              proposalId: command.proposalId,
              summary: summaryToJson(preview.summary),
            },
          });
          built.push(commitment);
          state = commitment.nextState;
        }
        break;
      case "RECORD_TRANSPORT_CONDITION":
        this.requireWorkflow(state, "transport-transaction");
        {
          const coreCommandId = `${command.commandId}_RECORD_TRANSPORT`;
          const preview = await this.domainRuntime.executeAction({
            runId: command.runId,
            actionId: "RECORD_TRANSPORT",
            coreCommandId,
            eventSequence: state.version + 1,
            simulation: state.simulation,
            trustedContext: state.activeTrustedContext,
            scenarioSeed: state.scenarioSeed,
          });
          const transaction = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context: state.activeTrustedContext,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: preview.summary.isAccepted
              ? "TRANSACTION_COMMITTED"
              : "TRANSACTION_REJECTED",
            payload: {
              actionId: "RECORD_TRANSPORT",
              coreCommandId,
              summary: summaryToJson(preview.summary),
            },
          });
          built.push(transaction);
          state = transaction.nextState;
          if (preview.summary.isAccepted) {
            const evidence = await this.buildCompetencyEvidenceEvent({
              state,
              principal: learner,
              context: state.activeTrustedContext,
              commandId: command.commandId,
              commandDigest: digest,
              batchIndex: built.length,
              evidenceRuleId:
                "RULE_TRANSPORT_CONDITION_RECORDED",
              sourceEvents: [transaction.sequenced],
            });
            built.push(evidence);
            state = evidence.nextState;
            const advanced = await this.buildEvent({
              runId: command.runId,
              state,
              principal: learner,
              context: state.activeTrustedContext,
              commandId: command.commandId,
              commandDigest: digest,
              batchIndex: built.length,
              eventType: "WORKFLOW_ADVANCED",
              payload: {
                workflowStep: "receipt-transaction",
                contextId: "CTX_PROCESSOR",
              },
            });
            built.push(advanced);
            state = advanced.nextState;
          }
        }
        break;
      case "RECEIVE_BATCH":
        this.requireWorkflow(state, "receipt-transaction");
        {
          const context = this.domainRuntime.trustedContextForId(
            "CTX_PROCESSOR",
          );
          const coreCommandId = `${command.commandId}_RECEIVE_BATCH`;
          const preview = await this.domainRuntime.executeAction({
            runId: command.runId,
            actionId: "RECEIVE_BATCH",
            coreCommandId,
            eventSequence: state.version + 1,
            simulation: state.simulation,
            trustedContext: context,
            scenarioSeed: state.scenarioSeed,
          });
          const transaction = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: preview.summary.isAccepted
              ? "TRANSACTION_COMMITTED"
              : "TRANSACTION_REJECTED",
            payload: {
              actionId: "RECEIVE_BATCH",
              coreCommandId,
              summary: summaryToJson(preview.summary),
            },
          });
          built.push(transaction);
          state = transaction.nextState;
        }
        break;
      case "PURCHASE_ON_RECEIPT":
        this.requireWorkflow(state, "ownership-transaction");
        {
          const context = this.domainRuntime.trustedContextForId(
            "CTX_PRODUCER",
          );
          const coreCommandId =
            `${command.commandId}_PURCHASE_ON_RECEIPT`;
          const preview = await this.domainRuntime.executeAction({
            runId: command.runId,
            actionId: "PURCHASE_ON_RECEIPT",
            coreCommandId,
            eventSequence: state.version + 1,
            simulation: state.simulation,
            trustedContext: context,
            scenarioSeed: state.scenarioSeed,
          });
          const transaction = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: preview.summary.isAccepted
              ? "TRANSACTION_COMMITTED"
              : "TRANSACTION_REJECTED",
            payload: {
              actionId: "PURCHASE_ON_RECEIPT",
              coreCommandId,
              summary: summaryToJson(preview.summary),
            },
          });
          built.push(transaction);
          state = transaction.nextState;
        }
        break;
      case "SUBMIT_DISCREPANCY_DECISION":
        this.requireWorkflow(state, "discrepancy-decision");
        {
          this.validateDiscrepancyDecision(command);
          const context = this.domainRuntime.trustedContextForId(
            "CTX_PROCESSOR",
          );
          const decision = {
            commandType: "SUBMIT_DISCREPANCY_DECISION" as const,
            ...command.decision,
          };
          const evaluation = evaluateDiscrepancyDecision(
            decision,
            coffeeScenario,
          );
          const submitted = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: evaluation.isRejectedAttempt
              ? "DECISION_REJECTED"
              : "DECISION_SUBMITTED",
            payload: { decision },
          });
          built.push(submitted);
          state = submitted.nextState;
          const evidence = await this.buildCompetencyEvidenceEvent({
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            evidenceRuleId: evaluation.isRejectedAttempt
              ? "RULE_DISCREPANCY_REJECTED_ATTEMPT"
              : "RULE_DISCREPANCY_DECISION_SUBMITTED",
            sourceEvents: [submitted.sequenced],
          });
          built.push(evidence);
          state = evidence.nextState;
        }
        break;
      case "INVESTIGATE_DISCREPANCY":
        this.requireWorkflow(state, "discrepancy-mitigation");
        {
          const context = this.domainRuntime.trustedContextForId(
            "CTX_PROCESSOR",
          );
          const mitigation = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: "MITIGATION_RECORDED",
            payload: {
              mitigationType: "INVESTIGATE_DISCREPANCY",
            },
          });
          built.push(mitigation);
          state = mitigation.nextState;
        }
        break;
      case "CREATE_CORRECTION_PROPOSAL":
        this.requireWorkflow(state, "correction-proposal");
        this.validateCorrectionReason(command.reason);
        {
          const context = this.domainRuntime.trustedContextForId(
            "CTX_PROCESSOR",
          );
          const coreCommandId =
            `${command.commandId}_RECORD_CORRECTION`;
          const preview =
            await this.domainRuntime.createCorrectionProposal({
              runId: command.runId,
              coreCommandId,
              eventSequence: state.version + 1,
              simulation: state.simulation,
              scenarioSeed: state.scenarioSeed,
              reason: command.reason,
            });
          const proposal = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: preview.summary.isAccepted
              ? "ENDORSEMENT_PROPOSAL_CREATED"
              : "ENDORSEMENT_PROPOSAL_REJECTED",
            payload: {
              coreCommandId,
              reason: command.reason,
              summary: correctionProposalSummaryToJson(
                preview.summary,
              ),
            },
          });
          built.push(proposal);
          state = proposal.nextState;
        }
        break;
      case "ENDORSE_CORRECTION":
        this.requireWorkflow(state, "correction-endorsement");
        if (command.proposalId !== state.correctionPendingProposalId) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "The correction endorsement must refer to the active proposal.",
          );
        }
        {
          const context = this.domainRuntime.trustedContextForId(
            "CTX_PRODUCER",
          );
          const coreCommandId = `${command.commandId}_ENDORSE`;
          const preview =
            await this.domainRuntime.endorseCorrectionProposal({
              runId: command.runId,
              proposalId: command.proposalId,
              coreCommandId,
              eventSequence: state.version + 1,
              simulation: state.simulation,
              scenarioSeed: state.scenarioSeed,
            });
          const endorsement = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: preview.summary.isAccepted
              ? "ENDORSEMENT_RECORDED"
              : "ENDORSEMENT_REJECTED",
            payload: {
              actionId: "RECORD_CORRECTION",
              coreCommandId,
              proposalId: command.proposalId,
              summary: endorsementSummaryToJson(
                preview.summary,
              ),
            },
          });
          built.push(endorsement);
          state = endorsement.nextState;
          if (
            preview.summary.isAccepted &&
            preview.summary.policySatisfied
          ) {
            const evidence = await this.buildCompetencyEvidenceEvent({
              state,
              principal: learner,
              context,
              commandId: command.commandId,
              commandDigest: digest,
              batchIndex: built.length,
              evidenceRuleId:
                "RULE_CORRECTION_ENDORSEMENT_SATISFIED",
              sourceEvents: [endorsement.sequenced],
            });
            built.push(evidence);
            state = evidence.nextState;
          }
        }
        break;
      case "COMMIT_CORRECTION":
        this.requireWorkflow(state, "correction-commit");
        if (command.proposalId !== state.correctionPendingProposalId) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "The correction commitment must refer to the active proposal.",
          );
        }
        {
          const context = this.domainRuntime.trustedContextForId(
            "CTX_PRODUCER",
          );
          const coreCommandId = `${command.commandId}_COMMIT`;
          const preview = this.domainRuntime.commitCorrectionProposal({
            runId: command.runId,
            proposalId: command.proposalId,
            coreCommandId,
            eventSequence: state.version + 1,
            simulation: state.simulation,
            scenarioSeed: state.scenarioSeed,
          });
          const commitment = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: preview.summary.isAccepted
              ? "ENDORSED_TRANSACTION_COMMITTED"
              : "ENDORSED_TRANSACTION_REJECTED",
            payload: {
              actionId: "RECORD_CORRECTION",
              coreCommandId,
              proposalId: command.proposalId,
              summary: summaryToJson(preview.summary),
            },
          });
          built.push(commitment);
          state = commitment.nextState;
          if (preview.summary.isAccepted) {
            const evidence = await this.buildCompetencyEvidenceEvent({
              state,
              principal: learner,
              context,
              commandId: command.commandId,
              commandDigest: digest,
              batchIndex: built.length,
              evidenceRuleId:
                "RULE_APPEND_ONLY_CORRECTION_COMMITTED",
              sourceEvents: [commitment.sequenced],
            });
            built.push(evidence);
            state = evidence.nextState;
            const advanced = await this.buildEvent({
              runId: command.runId,
              state,
              principal: learner,
              context,
              commandId: command.commandId,
              commandDigest: digest,
              batchIndex: built.length,
              eventType: "WORKFLOW_ADVANCED",
              payload: {
                workflowStep: "transformation-transaction",
                contextId: "CTX_PROCESSOR",
              },
            });
            built.push(advanced);
            state = advanced.nextState;
          }
        }
        break;
      case "TRANSFORM_BATCH":
        this.requireWorkflow(state, "transformation-transaction");
        {
          const context = this.domainRuntime.trustedContextForId(
            "CTX_PROCESSOR",
          );
          const coreCommandId = `${command.commandId}_TRANSFORM_BATCH`;
          const preview = await this.domainRuntime.executeAction({
            runId: command.runId,
            actionId: "TRANSFORM_BATCH",
            coreCommandId,
            eventSequence: state.version + 1,
            simulation: state.simulation,
            trustedContext: context,
            scenarioSeed: state.scenarioSeed,
          });
          const transaction = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: preview.summary.isAccepted
              ? "TRANSACTION_COMMITTED"
              : "TRANSACTION_REJECTED",
            payload: {
              actionId: "TRANSFORM_BATCH",
              coreCommandId,
              summary: summaryToJson(preview.summary),
            },
          });
          built.push(transaction);
          state = transaction.nextState;
          if (preview.summary.isAccepted) {
            const evidence = await this.buildCompetencyEvidenceEvent({
              state,
              principal: learner,
              context,
              commandId: command.commandId,
              commandDigest: digest,
              batchIndex: built.length,
              evidenceRuleId:
                "RULE_TRANSFORMATION_PROVENANCE_CREATED",
              sourceEvents: [transaction.sequenced],
            });
            built.push(evidence);
            state = evidence.nextState;
          }
        }
        break;
      case "SUBMIT_KNOWLEDGE_DECISION":
        {
          const expectedDecisionId =
            state.workflowStep === "transformation-knowledge"
              ? "INT_TRANSFORMATION_PROVENANCE"
              : state.workflowStep === "tamper-knowledge"
                ? "INT_TAMPER_DEMONSTRATION"
                : state.workflowStep ===
                    "blockchain-necessity-decision"
                  ? "INT_BLOCKCHAIN_NECESSITY"
                  : null;
          if (
            expectedDecisionId === null ||
            command.decisionId !== expectedDecisionId
          ) {
            throw new HostedRunCommandError(
              "WORKFLOW_PRECONDITION_FAILED",
              "This knowledge decision is not available at the current workflow step.",
            );
          }
          const context = state.activeTrustedContext;
          const decision = hostedKnowledgeDecision(
            command.decisionId,
            command.selectedOptionId,
          );
          const submitted = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: "DECISION_SUBMITTED",
            payload: {
              decision: {
                commandType: "SUBMIT_KNOWLEDGE_DECISION",
                decisionId: decision.decisionId,
                selectedOptionId: decision.selectedOptionId,
              },
            },
          });
          built.push(submitted);
          state = submitted.nextState;
          const evidenceRuleId =
            decision.decisionId ===
            "INT_TRANSFORMATION_PROVENANCE"
              ? "RULE_TRANSFORMATION_PROVENANCE_RECOGNIZED"
              : decision.decisionId ===
                  "INT_TAMPER_DEMONSTRATION"
                ? "RULE_TAMPER_EVIDENCE_INTERPRETED"
                : "RULE_BLOCKCHAIN_SUITABILITY_RECOGNIZED";
          if (decision.isAuthoredCorrect) {
            const evidence = await this.buildCompetencyEvidenceEvent({
              state,
              principal: learner,
              context,
              commandId: command.commandId,
              commandDigest: digest,
              batchIndex: built.length,
              evidenceRuleId,
              sourceEvents: [submitted.sequenced],
            });
            built.push(evidence);
            state = evidence.nextState;
          }
          if (
            decision.decisionId ===
            "INT_BLOCKCHAIN_NECESSITY"
          ) {
            const completed = await this.buildEvent({
              runId: command.runId,
              state,
              principal: learner,
              context,
              commandId: command.commandId,
              commandDigest: digest,
              batchIndex: built.length,
              eventType: "RUN_COMPLETED",
              payload: { outcome: "coffee-journey-complete" },
            });
            built.push(completed);
            state = completed.nextState;
          }
        }
        break;
      case "PACKAGE_BATCH":
        this.requireWorkflow(state, "packaging-transaction");
        {
          const context = this.domainRuntime.trustedContextForId(
            "CTX_PROCESSOR",
          );
          const coreCommandId = `${command.commandId}_PACKAGE_BATCH`;
          const preview = await this.domainRuntime.executeAction({
            runId: command.runId,
            actionId: "PACKAGE_BATCH",
            coreCommandId,
            eventSequence: state.version + 1,
            simulation: state.simulation,
            trustedContext: context,
            scenarioSeed: state.scenarioSeed,
          });
          const transaction = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: preview.summary.isAccepted
              ? "TRANSACTION_COMMITTED"
              : "TRANSACTION_REJECTED",
            payload: {
              actionId: "PACKAGE_BATCH",
              coreCommandId,
              summary: summaryToJson(preview.summary),
            },
          });
          built.push(transaction);
          state = transaction.nextState;
        }
        break;
      case "TRANSFER_DISTRIBUTION_OWNERSHIP":
        this.requireWorkflow(
          state,
          "distribution-ownership-transaction",
        );
        {
          const context = this.domainRuntime.trustedContextForId(
            "CTX_PROCESSOR",
          );
          const coreCommandId =
            `${command.commandId}_TRANSFER_OWNERSHIP`;
          const preview = await this.domainRuntime.executeAction({
            runId: command.runId,
            actionId: "TRANSFER_OWNERSHIP",
            coreCommandId,
            eventSequence: state.version + 1,
            simulation: state.simulation,
            trustedContext: context,
            scenarioSeed: state.scenarioSeed,
          });
          const transaction = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: preview.summary.isAccepted
              ? "TRANSACTION_COMMITTED"
              : "TRANSACTION_REJECTED",
            payload: {
              actionId: "TRANSFER_OWNERSHIP",
              coreCommandId,
              summary: summaryToJson(preview.summary),
            },
          });
          built.push(transaction);
          state = transaction.nextState;
        }
        break;
      case "DISPATCH_BATCH":
        this.requireWorkflow(state, "dispatch-transaction");
        {
          const context = this.domainRuntime.trustedContextForId(
            "CTX_DISTRIBUTOR",
          );
          const coreCommandId = `${command.commandId}_DISPATCH_BATCH`;
          const preview = await this.domainRuntime.executeAction({
            runId: command.runId,
            actionId: "DISPATCH_BATCH",
            coreCommandId,
            eventSequence: state.version + 1,
            simulation: state.simulation,
            trustedContext: context,
            scenarioSeed: state.scenarioSeed,
          });
          const transaction = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: preview.summary.isAccepted
              ? "TRANSACTION_COMMITTED"
              : "TRANSACTION_REJECTED",
            payload: {
              actionId: "DISPATCH_BATCH",
              coreCommandId,
              summary: summaryToJson(preview.summary),
            },
          });
          built.push(transaction);
          state = transaction.nextState;
          if (preview.summary.isAccepted) {
            const evidence = await this.buildCompetencyEvidenceEvent({
              state,
              principal: learner,
              context,
              commandId: command.commandId,
              commandDigest: digest,
              batchIndex: built.length,
              evidenceRuleId:
                "RULE_RETAIL_DISPATCH_RECORDED",
              sourceEvents: [transaction.sequenced],
            });
            built.push(evidence);
            state = evidence.nextState;
            const advanced = await this.buildEvent({
              runId: command.runId,
              state,
              principal: learner,
              context,
              commandId: command.commandId,
              commandDigest: digest,
              batchIndex: built.length,
              eventType: "WORKFLOW_ADVANCED",
              payload: {
                workflowStep: "tamper-demonstration",
                contextId: "CTX_RETAILER",
              },
            });
            built.push(advanced);
            state = advanced.nextState;
          }
        }
        break;
      case "RUN_TAMPER_DEMONSTRATION":
        this.requireWorkflow(state, "tamper-demonstration");
        {
          const context =
            this.domainRuntime.trustedContextForId("CTX_RETAILER");
          const summary = this.domainRuntime.tamperDemonstration(
            state.simulation,
          );
          const demonstrated = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: "DECISION_SUBMITTED",
            payload: {
              decision: {
                commandType: "RUN_TAMPER_DEMONSTRATION",
                transactionId: summary.transactionId,
                tamperedQuantity: summary.tamperedQuantity,
              },
              summary: tamperSummaryToJson(summary),
            },
          });
          built.push(demonstrated);
          state = demonstrated.nextState;
          const evidence = await this.buildCompetencyEvidenceEvent({
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            evidenceRuleId:
              "RULE_TAMPER_DEMONSTRATION_COMPLETED",
            sourceEvents: [demonstrated.sequenced],
          });
          built.push(evidence);
          state = evidence.nextState;
        }
        break;
      case "SUBMIT_DATA_GOVERNANCE_DECISION":
        this.requireWorkflow(state, "data-governance-decision");
        {
          const context =
            this.domainRuntime.trustedContextForId("CTX_RETAILER");
          const decision = hostedClassificationDecision(
            command.decisionId,
            command.categoryByItem,
          );
          const submitted = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: "DECISION_SUBMITTED",
            payload: {
              decision: {
                commandType:
                  "SUBMIT_DATA_GOVERNANCE_DECISION",
                decisionId: decision.decisionId,
                categoryByItem: decision.categoryByItem,
              },
            },
          });
          built.push(submitted);
          state = submitted.nextState;
          if (decision.isAuthoredCorrect) {
            const evidence = await this.buildCompetencyEvidenceEvent({
              state,
              principal: learner,
              context,
              commandId: command.commandId,
              commandDigest: digest,
              batchIndex: built.length,
              evidenceRuleId:
                "RULE_DATA_GOVERNANCE_CLASSIFIED",
              sourceEvents: [submitted.sequenced],
            });
            built.push(evidence);
            state = evidence.nextState;
          }
        }
        break;
      case "SUBMIT_RECALL_SCOPE_DECISION":
        this.requireWorkflow(state, "recall-scope-decision");
        {
          const context =
            this.domainRuntime.trustedContextForId("CTX_RETAILER");
          const decision = hostedRecallScopeDecision(
            command.selectedAssetIds,
          );
          const submitted = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: "DECISION_SUBMITTED",
            payload: {
              decision: {
                commandType: "SUBMIT_RECALL_SCOPE_DECISION",
                decisionId: decision.decisionId,
                selectedOptionIds: decision.selectedAssetIds,
              },
            },
          });
          built.push(submitted);
          state = submitted.nextState;
          const evidence = await this.buildCompetencyEvidenceEvent({
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            evidenceRuleId: "RULE_RECALL_SCOPE_SUBMITTED",
            sourceEvents: [submitted.sequenced],
          });
          built.push(evidence);
          state = evidence.nextState;
        }
        break;
      case "REQUEST_RECALL_HANDOFF":
        if (
          state.workflowStep !== "recall-transaction" &&
          state.workflowStep !== "recall-handoff"
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "The regulator handoff is not available at the current workflow step.",
          );
        }
        {
          const context = state.activeTrustedContext;
          const advanced = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: "WORKFLOW_ADVANCED",
            payload: {
              workflowStep: "recall-authorized-transaction",
              contextId: "CTX_REGULATOR",
            },
          });
          built.push(advanced);
          state = advanced.nextState;
        }
        break;
      case "SUBMIT_RECALL_TRANSACTION":
      case "RESUBMIT_AUTHORIZED_RECALL":
        if (
          command.commandType === "SUBMIT_RECALL_TRANSACTION"
            ? (state.workflowStep !== "recall-transaction" &&
                state.workflowStep !==
                  "recall-authorized-transaction") ||
              state.recallStatus !== "not-started"
            : state.workflowStep !==
                  "recall-authorized-transaction" ||
              state.recallStatus !== "rejected"
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "The recall submission is not available at the current workflow step.",
          );
        }
        if (state.recallScopeDecision === null) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "A recall transaction requires the recorded initial scope.",
          );
        }
        {
          const context = state.activeTrustedContext;
          const coreCommandId = `${command.commandId}_RECALL_BATCH`;
          const preview = await this.domainRuntime.executeAction({
            runId: command.runId,
            actionId: "RECALL_BATCH",
            coreCommandId,
            eventSequence: state.version + 1,
            simulation: state.simulation,
            trustedContext: context,
            scenarioSeed: state.scenarioSeed,
            selectedAssetIds:
              state.recallScopeDecision.selectedAssetIds,
          });
          const transaction = await this.buildEvent({
            runId: command.runId,
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            eventType: preview.summary.isAccepted
              ? "TRANSACTION_COMMITTED"
              : "TRANSACTION_REJECTED",
            payload: {
              actionId: "RECALL_BATCH",
              coreCommandId,
              submissionType: command.commandType,
              summary: summaryToJson(preview.summary),
            },
          });
          built.push(transaction);
          state = transaction.nextState;
          const evidence = await this.buildCompetencyEvidenceEvent({
            state,
            principal: learner,
            context,
            commandId: command.commandId,
            commandDigest: digest,
            batchIndex: built.length,
            evidenceRuleId: preview.summary.isAccepted
              ? "RULE_AUTHORIZED_RECALL_COMMITTED"
              : "RULE_UNAUTHORIZED_RECALL_RETAINED",
            sourceEvents: [transaction.sequenced],
          });
          built.push(evidence);
          state = evidence.nextState;
        }
        break;
    }

    const appendResult = await this.eventStore.append({
      runId: command.runId,
      expectedNextSequenceNumber: events.length + 1,
      events: eventsWithSubmittedCommand(built, command),
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
    const loaded = await this.loadRun(runId);
    const state = loaded.state;
    requireAssignedLearner(principal, state.learnerUserId);
    return {
      ...projectRunStateForRole(
        this.toProjectionState(state),
        state.activeTrustedContext.roleId,
      ),
      timing: this.runTiming(
        state,
        loaded.startedAt,
        this.clock.now(),
      ),
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
      timing: this.runTiming(
        loaded.state,
        loaded.startedAt,
        this.clock.now(),
      ),
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
      timing: this.runTiming(
        loaded.state,
        loaded.startedAt,
        this.clock.now(),
      ),
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
    const state = await this.replay(
      throughDecision.slice(0, forkSequenceNumber),
    );
    this.requireCounterfactualActor(
      principal,
      state.learnerUserId,
    );
    return projectRunStateForRole(
      this.toProjectionState(state),
      roleId,
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
    const firstEvent = events[0];
    const lastEvent = events.at(-1);
    if (firstEvent === undefined || lastEvent === undefined) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        `Run ${runId} does not exist.`,
      );
    }
    const observedAtMs = Date.parse(observedAt);
    if (!Number.isFinite(observedAtMs)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Monitor observation time must be a valid ISO timestamp.",
      );
    }
    const state = await this.replay(events);
    const projection = projectRunStateForRole(
      this.toProjectionState(state),
      state.activeTrustedContext.roleId,
    );
    const startedAtMs = Date.parse(firstEvent.serverTimestampUtc);
    const lastActivityAtMs = Date.parse(lastEvent.serverTimestampUtc);
    if (
      !Number.isFinite(startedAtMs) ||
      !Number.isFinite(lastActivityAtMs)
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Monitor event timestamps must be valid ISO timestamps.",
      );
    }
    const elapsedUntilMs =
      state.status === "completed"
        ? lastActivityAtMs
        : Math.max(lastActivityAtMs, observedAtMs);
    return {
      runId: state.runId,
      learnerUserId: state.learnerUserId,
      status: state.status,
      eventCount: events.length,
      currentStageId: projection.workflowState.currentNodeId,
      activeRoleId: projection.roleId,
      elapsedSeconds: Math.max(
        0,
        Math.floor((elapsedUntilMs - startedAtMs) / 1_000),
      ),
      lastActivityAt: lastEvent.serverTimestampUtc,
      pendingActionIds: projection.workflowState.permittedActionIds,
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
    const sequenceNumber =
      throughSequenceNumber ?? events.length;
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
    const boundedEvents = events.slice(0, sequenceNumber);
    const selectedEvent = boundedEvents.at(-1);
    if (selectedEvent === undefined) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Replay requires at least one event.",
      );
    }
    const state = await this.replay(boundedEvents);
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
        sequenceNumber: selectedEvent.sequenceNumber,
        eventId: selectedEvent.eventId,
        eventType: selectedEvent.eventType,
        occurredAt: selectedEvent.serverTimestampUtc,
        authenticatedUserId: selectedEvent.authenticatedUserId,
        simulationActorId: selectedEvent.simulationActorId,
        organizationId: selectedEvent.organizationId,
        roleId: selectedEvent.roleId,
        causationId: selectedEvent.causationId,
        resultingStateHash: selectedEvent.resultingStateHash,
      },
      projection: projectRunStateForRole(
        this.toProjectionState(state),
        state.activeTrustedContext.roleId,
      ),
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
    const decisionItems: HostedDecisionItemEvidenceV1[] = [];
    if (state.decision !== null) {
      decisionItems.push({
        decisionItemId: "INT_CERTIFICATE_INITIAL_SUBMITTED",
        isAuthoredCorrect: state.decision.isAuthoredCorrect,
      });
    }
    if (state.discrepancyDecision !== null) {
      decisionItems.push({
        decisionItemId: "INT_DISCREPANCY_INITIAL_SUBMITTED",
        isAuthoredCorrect:
          state.discrepancyDecision.isScorableCorrect,
      });
    }
    for (const decisionItemId of [
      "INT_TRANSFORMATION_PROVENANCE",
      "INT_TAMPER_DEMONSTRATION",
    ] as const) {
      const decision = state.knowledgeDecisions[decisionItemId];
      if (decision !== undefined) {
        decisionItems.push({
          decisionItemId,
          isAuthoredCorrect: decision.isAuthoredCorrect,
        });
      }
    }
    if (state.dataGovernanceDecision !== null) {
      decisionItems.push({
        decisionItemId:
          state.dataGovernanceDecision.decisionId,
        isAuthoredCorrect:
          state.dataGovernanceDecision.isAuthoredCorrect,
      });
    }
    if (state.recallScopeDecision !== null) {
      decisionItems.push({
        decisionItemId: state.recallScopeDecision.decisionId,
        isAuthoredCorrect:
          state.recallScopeDecision.isAuthoredCorrect,
      });
    }
    const finalDecision =
      state.knowledgeDecisions["INT_BLOCKCHAIN_NECESSITY"];
    if (finalDecision !== undefined) {
      decisionItems.push({
        decisionItemId: finalDecision.decisionId,
        isAuthoredCorrect: finalDecision.isAuthoredCorrect,
      });
    }
    if (decisionItems.length !== 7) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "A completed coffee run is missing authored decision evidence.",
      );
    }
    return {
      runId: state.runId,
      learnerUserId: state.learnerUserId,
      status: "completed",
      decisionItems,
      realizedOutcome: {
        outcomeModelId: state.outcomeResolution.outcomeModelId,
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
    const state = await this.loadState(runId);
    return competencyEvidenceProjection(state);
  }

  async learnerCompetencyEvidence(
    principal: ApplicationPrincipal | null,
    runId: string,
  ): Promise<readonly CompetencyEvidenceProjection[]> {
    const state = await this.loadState(runId);
    requireAssignedLearner(principal, state.learnerUserId);
    return competencyEvidenceProjection(state);
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

  async loadState(runId: string): Promise<HostedStage3RunState> {
    return (await this.loadRun(runId)).state;
  }

  private async loadRun(runId: string): Promise<LoadedStage3Run> {
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
      state: await this.replay(events),
      commandEvents: events,
      startedAt,
      isCounterfactual: false,
    };
  }

  private counterfactualAdapter(): CounterfactualBranchRuntimeAdapter<HostedStage3RunState> {
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
    sourceState: Readonly<HostedStage3RunState>,
    metadata: CounterfactualRunMetadataV1,
  ): HostedStage3RunState {
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
    return {
      ...structuredClone(sourceState),
      runId: metadata.branchRunId,
      version: 0,
    };
  }

  private async replayFromCounterfactualFork(
    forkState: Readonly<HostedStage3RunState>,
    events: readonly RunEventV1[],
  ): Promise<HostedStage3RunState> {
    const state = await replayRunEventsAsync<
      HostedStage3RunState | null
    >(
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

  private async replay(
    events: readonly RunEventV1[],
  ): Promise<HostedStage3RunState> {
    const state = await replayRunEventsAsync<
      HostedStage3RunState | null
    >(
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
    this.assertTimeLimitAuditEvents(events, state);
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
          ...(event.payload.modeConfiguration === undefined
            ? {}
            : {
                modeConfiguration:
                  validateHostedModeConfiguration(
                    event.payload.modeConfiguration,
                    mode,
                  ),
              }),
          scenarioSeed: requiredString(
            event.payload.scenarioSeed,
            "scenarioSeed",
          ),
          caseVariant,
        };
        const {
          modeConfiguration,
          outcomeResolution,
          scenarioSeed,
        } =
          this.resolveModeAndOutcome(request);
        if (
          outcomeResolution.outcomeCode !== caseVariant ||
          scenarioSeed !== request.scenarioSeed
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Run outcome differs from deterministic replay.",
          );
        }
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
          modeConfiguration,
          scenarioSeed,
          caseVariant,
          outcomeResolution,
          outcomeEvidenceStatus:
            outcomeResolution.strategy === "probabilistic"
              ? "awaiting-draw"
              : "not-required",
          activeTrustedContext: this.domainRuntime.trustedContextFor(request),
          version: event.sequenceNumber,
          status: "active",
          workflowStep: "certificate-evidence",
          releasedEvidenceIds: [],
          inspectedEvidenceIds: [],
          decision: null,
          transactionStatus: "not-started",
          transactions: [],
          custodyStatus: "not-started",
          custodyProposal: null,
          custodyEndorsement: null,
          pendingProposalId: null,
          transportStatus: "not-started",
          receiptStatus: "not-started",
          ownershipStatus: "not-started",
          discrepancyDecision: null,
          discrepancyMitigationStatus: "not-started",
          correctionStatus: "not-started",
          correctionProposal: null,
          correctionEndorsement: null,
          correctionPendingProposalId: null,
          transformationStatus: "not-started",
          knowledgeDecisions: {},
          packagingStatus: "not-started",
          distributionOwnershipStatus: "not-started",
          dispatchStatus: "not-started",
          tamperDemonstration: null,
          dataGovernanceDecision: null,
          recallScopeDecision: null,
          recallStatus: "not-started",
          recallHandoffStatus: "not-started",
          competencyEvidence: [],
          simulation: this.domainRuntime.createInitialSimulation(),
        };
      }
      case "RANDOM_DRAW_MADE": {
        const state = this.stateOrThrow(current);
        if (
          state.outcomeEvidenceStatus !== "awaiting-draw" ||
          state.outcomeResolution.draw === undefined
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Random-draw evidence is not expected for this run.",
          );
        }
        const {
          requestDigest: _requestDigest,
          ...recordedDraw
        } = event.payload;
        assertReplayEvidenceMatches(
          {
            outcomeModelId: state.outcomeResolution.outcomeModelId,
            distribution: state.outcomeResolution.distribution,
            randomStreamId:
              state.outcomeResolution.randomStreamId,
            probabilityParameters:
              state.outcomeResolution.probabilityParameters,
            draw: state.outcomeResolution.draw,
          },
          recordedDraw,
          "random draw",
        );
        return this.updateRequiredState(current, event, {
          outcomeEvidenceStatus: "awaiting-outcome",
        });
      }
      case "OUTCOME_REALIZED": {
        const state = this.stateOrThrow(current);
        if (state.outcomeEvidenceStatus !== "awaiting-outcome") {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Realized-outcome evidence is out of order.",
          );
        }
        const {
          requestDigest: _requestDigest,
          ...recordedOutcome
        } = event.payload;
        assertReplayEvidenceMatches(
          {
            outcomeModelId: state.outcomeResolution.outcomeModelId,
            outcomeCode: state.outcomeResolution.outcomeCode,
          },
          recordedOutcome,
          "realized outcome",
        );
        return this.updateRequiredState(current, event, {
          outcomeEvidenceStatus: "recorded",
        });
      }
      case "EVIDENCE_RELEASED":
        if (
          this.stateOrThrow(current).outcomeEvidenceStatus ===
            "awaiting-draw" ||
          this.stateOrThrow(current).outcomeEvidenceStatus ===
            "awaiting-outcome"
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Evidence cannot be released before the authored outcome is recorded.",
          );
        }
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
      case "DECISION_SUBMITTED":
      case "DECISION_REJECTED": {
        const state = this.stateOrThrow(current);
        const decisionValue = event.payload.decision;
        if (!isJsonObject(decisionValue)) {
          throw new HostedRunCommandError(
            "INVALID_COMMAND",
            "Decision event is missing its structured decision.",
          );
        }
        const commandType = requiredString(
          decisionValue.commandType,
          "decision.commandType",
        );
        if (commandType === "SUBMIT_DISCREPANCY_DECISION") {
          const decision = discrepancyDecisionFromPayload(
            event.payload,
          );
          const shouldBeRejected =
            event.eventType === "DECISION_REJECTED";
          if (
            decision.isRejectedAttempt !== shouldBeRejected ||
            state.workflowStep !== "discrepancy-decision"
          ) {
            throw new HostedRunCommandError(
              "PACK_CONTRACT_MISMATCH",
              "Discrepancy decision outcome does not match deterministic replay.",
            );
          }
          const trusted =
            this.domainRuntime.trustedContextForId("CTX_PROCESSOR");
          const decisionCommand = {
            metadata: {
              commandId: event.causationId,
              sessionId: state.runId,
              actorId: trusted.actorId,
              organizationId: trusted.organizationId,
              roleId: trusted.roleId,
              submittedAt: event.serverTimestampUtc,
              expectedStateVersions: {},
            },
            payload: decision.decision,
          };
          const outcome = handleSimulationDecision({
            runtime: state.simulation,
            command: decisionCommand,
            trustedContext: trusted,
            isAccepted: !decision.isRejectedAttempt,
            decisionType: "SUBMIT_DISCREPANCY_DECISION",
            decisionPayload: decision.decision,
            rejectionFailures: [
              {
                code: "DOMAIN_RULE_FAILED",
                messageKey: "validation.appendOnlyRequired",
              },
            ],
            environment: {
              clock: new FixedClock(event.serverTimestampUtc),
              random: new SeededRandomSource(
                `${state.scenarioSeed}:${event.sequenceNumber}`,
              ),
              ids: new SequenceIdGenerator(
                event.sequenceNumber * 100,
              ),
            },
          });
          return {
            ...state,
            version: event.sequenceNumber,
            workflowStep: decision.requiresMitigation
              ? "discrepancy-mitigation"
              : "correction-proposal",
            activeTrustedContext: trusted,
            discrepancyDecision: decision,
            discrepancyMitigationStatus:
              decision.requiresMitigation
                ? "required"
                : "not-required",
            simulation: outcome.state,
          };
        }
        if (commandType === "RUN_TAMPER_DEMONSTRATION") {
          if (
            event.eventType !== "DECISION_SUBMITTED" ||
            state.workflowStep !== "tamper-demonstration"
          ) {
            throw new HostedRunCommandError(
              "PACK_CONTRACT_MISMATCH",
              "Tamper demonstration is not valid for the current workflow.",
            );
          }
          const expected = tamperSummaryFromPayload(event.payload);
          const actual = this.domainRuntime.tamperDemonstration(
            state.simulation,
          );
          if (
            canonicalize(expected) !== canonicalize(actual) ||
            requiredString(
              decisionValue.transactionId,
              "decision.transactionId",
            ) !== actual.transactionId ||
            requiredNumber(
              decisionValue.tamperedQuantity,
              "decision.tamperedQuantity",
            ) !== actual.tamperedQuantity
          ) {
            throw new HostedRunCommandError(
              "PACK_CONTRACT_MISMATCH",
              "Tamper demonstration differs from deterministic replay.",
            );
          }
          const trusted =
            this.domainRuntime.trustedContextForId("CTX_RETAILER");
          const payload = {
            commandType: "RUN_TAMPER_DEMONSTRATION" as const,
            transactionId: actual.transactionId,
            tamperedQuantity: actual.tamperedQuantity,
          };
          const command = {
            metadata: {
              commandId: event.causationId,
              sessionId: state.runId,
              actorId: trusted.actorId,
              organizationId: trusted.organizationId,
              roleId: trusted.roleId,
              submittedAt: event.serverTimestampUtc,
              expectedStateVersions: {},
            },
            payload,
          };
          const outcome = handleSimulationDecision({
            runtime: state.simulation,
            command,
            trustedContext: trusted,
            isAccepted: true,
            decisionType: payload.commandType,
            decisionPayload: payload,
            environment: {
              clock: new FixedClock(event.serverTimestampUtc),
              random: new SeededRandomSource(
                `${state.scenarioSeed}:${event.sequenceNumber}`,
              ),
              ids: new SequenceIdGenerator(
                event.sequenceNumber * 100,
              ),
            },
          });
          return {
            ...state,
            version: event.sequenceNumber,
            workflowStep: "tamper-knowledge",
            activeTrustedContext: trusted,
            tamperDemonstration: actual,
            simulation: outcome.state,
          };
        }
        if (
          commandType === "SUBMIT_DATA_GOVERNANCE_DECISION"
        ) {
          if (
            event.eventType !== "DECISION_SUBMITTED" ||
            state.workflowStep !== "data-governance-decision"
          ) {
            throw new HostedRunCommandError(
              "PACK_CONTRACT_MISMATCH",
              "Data-governance decision is not valid for the current workflow.",
            );
          }
          const categoryValue = decisionValue.categoryByItem;
          if (!isJsonObject(categoryValue)) {
            throw new HostedRunCommandError(
              "INVALID_COMMAND",
              "Data-governance decision is missing its classifications.",
            );
          }
          const categoryByItem = Object.fromEntries(
            Object.entries(categoryValue).map(
              ([itemId, categoryId]) => [
                itemId,
                requiredString(
                  categoryId,
                  `decision.categoryByItem.${itemId}`,
                ),
              ],
            ),
          );
          const decision = hostedClassificationDecision(
            requiredString(
              decisionValue.decisionId,
              "decision.decisionId",
            ),
            categoryByItem,
          );
          const trusted =
            this.domainRuntime.trustedContextForId("CTX_RETAILER");
          const payload = {
            commandType:
              "SUBMIT_DATA_GOVERNANCE_DECISION" as const,
            decisionId: decision.decisionId,
            categoryByItem: decision.categoryByItem,
          };
          const command = {
            metadata: {
              commandId: event.causationId,
              sessionId: state.runId,
              actorId: trusted.actorId,
              organizationId: trusted.organizationId,
              roleId: trusted.roleId,
              submittedAt: event.serverTimestampUtc,
              expectedStateVersions: {},
            },
            payload,
          };
          const outcome = handleSimulationDecision({
            runtime: state.simulation,
            command,
            trustedContext: trusted,
            isAccepted: true,
            decisionType: payload.commandType,
            decisionPayload: payload,
            environment: {
              clock: new FixedClock(event.serverTimestampUtc),
              random: new SeededRandomSource(
                `${state.scenarioSeed}:${event.sequenceNumber}`,
              ),
              ids: new SequenceIdGenerator(
                event.sequenceNumber * 100,
              ),
            },
          });
          return {
            ...state,
            version: event.sequenceNumber,
            workflowStep: "recall-scope-decision",
            activeTrustedContext: trusted,
            dataGovernanceDecision: decision,
            simulation: outcome.state,
          };
        }
        if (commandType === "SUBMIT_RECALL_SCOPE_DECISION") {
          if (
            event.eventType !== "DECISION_SUBMITTED" ||
            state.workflowStep !== "recall-scope-decision"
          ) {
            throw new HostedRunCommandError(
              "PACK_CONTRACT_MISMATCH",
              "Recall-scope decision is not valid for the current workflow.",
            );
          }
          const decision = hostedRecallScopeDecision(
            requiredStringArray(
              decisionValue.selectedOptionIds,
              "decision.selectedOptionIds",
            ),
          );
          const trusted =
            this.domainRuntime.trustedContextForId("CTX_RETAILER");
          const payload = {
            commandType:
              "SUBMIT_RECALL_SCOPE_DECISION" as const,
            decisionId: decision.decisionId,
            selectedOptionIds: decision.selectedAssetIds,
          };
          const command = {
            metadata: {
              commandId: event.causationId,
              sessionId: state.runId,
              actorId: trusted.actorId,
              organizationId: trusted.organizationId,
              roleId: trusted.roleId,
              submittedAt: event.serverTimestampUtc,
              expectedStateVersions: {},
            },
            payload,
          };
          const outcome = handleSimulationDecision({
            runtime: state.simulation,
            command,
            trustedContext: trusted,
            isAccepted: true,
            decisionType: payload.commandType,
            decisionPayload: payload,
            environment: {
              clock: new FixedClock(event.serverTimestampUtc),
              random: new SeededRandomSource(
                `${state.scenarioSeed}:${event.sequenceNumber}`,
              ),
              ids: new SequenceIdGenerator(
                event.sequenceNumber * 100,
              ),
            },
          });
          return {
            ...state,
            version: event.sequenceNumber,
            workflowStep: "recall-transaction",
            activeTrustedContext: trusted,
            recallScopeDecision: decision,
            simulation: outcome.state,
          };
        }
        if (commandType === "SUBMIT_KNOWLEDGE_DECISION") {
          const expectedDecisionId =
            state.workflowStep === "transformation-knowledge"
              ? "INT_TRANSFORMATION_PROVENANCE"
              : state.workflowStep === "tamper-knowledge"
                ? "INT_TAMPER_DEMONSTRATION"
                : state.workflowStep ===
                    "blockchain-necessity-decision"
                  ? "INT_BLOCKCHAIN_NECESSITY"
                  : null;
          const decision = hostedKnowledgeDecision(
            requiredString(
              decisionValue.decisionId,
              "decision.decisionId",
            ),
            requiredString(
              decisionValue.selectedOptionId,
              "decision.selectedOptionId",
            ),
          );
          if (
            event.eventType !== "DECISION_SUBMITTED" ||
            expectedDecisionId === null ||
            decision.decisionId !== expectedDecisionId
          ) {
            throw new HostedRunCommandError(
              "PACK_CONTRACT_MISMATCH",
              "Knowledge decision is not authored for this workflow step.",
            );
          }
          const trusted = state.activeTrustedContext;
          const decisionCommand = {
            metadata: {
              commandId: event.causationId,
              sessionId: state.runId,
              actorId: trusted.actorId,
              organizationId: trusted.organizationId,
              roleId: trusted.roleId,
              submittedAt: event.serverTimestampUtc,
              expectedStateVersions: {},
            },
            payload: {
              commandType: "SUBMIT_KNOWLEDGE_DECISION" as const,
              decisionId: decision.decisionId,
              selectedOptionId: decision.selectedOptionId,
            },
          };
          const outcome = handleSimulationDecision({
            runtime: state.simulation,
            command: decisionCommand,
            trustedContext: trusted,
            isAccepted: true,
            decisionType: "SUBMIT_KNOWLEDGE_DECISION",
            decisionPayload: decisionCommand.payload,
            environment: {
              clock: new FixedClock(event.serverTimestampUtc),
              random: new SeededRandomSource(
                `${state.scenarioSeed}:${event.sequenceNumber}`,
              ),
              ids: new SequenceIdGenerator(
                event.sequenceNumber * 100,
              ),
            },
          });
          return {
            ...state,
            version: event.sequenceNumber,
            workflowStep:
              decision.decisionId ===
              "INT_TRANSFORMATION_PROVENANCE"
                ? "packaging-transaction"
                : decision.decisionId ===
                    "INT_TAMPER_DEMONSTRATION"
                  ? "data-governance-decision"
                  : "blockchain-necessity-decision",
            activeTrustedContext: trusted,
            knowledgeDecisions: {
              ...state.knowledgeDecisions,
              [decision.decisionId]: decision,
            },
            simulation: outcome.state,
          };
        }
        if (
          commandType !== "SUBMIT_CERTIFICATE_DECISION" ||
          event.eventType !== "DECISION_SUBMITTED"
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Decision event contains an unsupported command type.",
          );
        }
        const decision = decisionFromPayload(event.payload);
        this.validateStructuredDecisionResponse(decision, state);
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
            citedEvidenceIds: decision.citedEvidenceIds,
            citedPolicyIds: decision.citedPolicyIds,
            confidenceRating: decision.confidenceRating,
            adverseEventProbabilityPercent:
              decision.adverseEventProbabilityPercent,
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
      case "MITIGATION_RECORDED": {
        const state = this.stateOrThrow(current);
        if (
          state.workflowStep !== "discrepancy-mitigation" ||
          requiredString(
            event.payload.mitigationType,
            "mitigationType",
          ) !== "INVESTIGATE_DISCREPANCY"
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Hosted mitigation event is not valid for the current workflow.",
          );
        }
        const trusted =
          this.domainRuntime.trustedContextForId("CTX_PROCESSOR");
        const payload: MitigationDecisionCommand = {
          commandType: "INVESTIGATE_DISCREPANCY",
        };
        const command = {
          metadata: {
            commandId: event.causationId,
            sessionId: state.runId,
            actorId: trusted.actorId,
            organizationId: trusted.organizationId,
            roleId: trusted.roleId,
            submittedAt: event.serverTimestampUtc,
            expectedStateVersions: {},
          },
          payload,
        };
        const outcome = handleSimulationDecision({
          runtime: state.simulation,
          command,
          trustedContext: trusted,
          isAccepted: true,
          decisionType: payload.commandType,
          decisionPayload: payload,
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
          workflowStep: "correction-proposal",
          activeTrustedContext: trusted,
          discrepancyMitigationStatus: "completed",
          simulation: outcome.state,
        };
      }
      case "TRANSACTION_PROPOSED":
        return this.updateRequiredState(current, event, {
          transactionStatus: "proposed",
        });
      case "WORKFLOW_ADVANCED": {
        const state = this.stateOrThrow(current);
        const workflowStep = requiredString(
          event.payload.workflowStep,
          "workflowStep",
        );
        const contextId = requiredString(
          event.payload.contextId,
          "contextId",
        );
        const isSupported =
          (workflowStep === "custody-proposal" &&
            contextId === "CTX_PRODUCER") ||
          (workflowStep === "receipt-transaction" &&
            contextId === "CTX_PROCESSOR") ||
          (workflowStep === "transformation-transaction" &&
            contextId === "CTX_PROCESSOR") ||
          (workflowStep === "tamper-demonstration" &&
            contextId === "CTX_RETAILER" &&
            state.workflowStep === "dispatch-transaction") ||
          (workflowStep === "recall-authorized-transaction" &&
            contextId === "CTX_REGULATOR" &&
            (state.workflowStep === "recall-transaction" ||
              state.workflowStep === "recall-handoff"));
        if (!isSupported) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Hosted workflow advanced to an unsupported workflow step.",
          );
        }
        return this.updateRequiredState(current, event, {
          workflowStep,
          activeTrustedContext:
            this.domainRuntime.trustedContextForId(contextId),
          ...(workflowStep === "recall-authorized-transaction"
            ? { recallHandoffStatus: "completed" as const }
            : {}),
        });
      }
      case "ENDORSEMENT_PROPOSAL_CREATED":
      case "ENDORSEMENT_PROPOSAL_REJECTED": {
        const state = this.stateOrThrow(current);
        const coreCommandId = requiredString(
          event.payload.coreCommandId,
          "coreCommandId",
        );
        if (state.workflowStep === "correction-proposal") {
          const reason = requiredString(
            event.payload.reason,
            "reason",
          );
          this.validateCorrectionReason(reason);
          const executed =
            await this.domainRuntime.createCorrectionProposal({
              runId: state.runId,
              coreCommandId,
              eventSequence: event.sequenceNumber,
              simulation: state.simulation,
              scenarioSeed: state.scenarioSeed,
              reason,
            });
          const expected = correctionProposalSummaryFromPayload(
            event.payload,
          );
          assertReplayEvidenceMatches(
            expected,
            executed.summary,
            "correction proposal",
          );
          const shouldBeAccepted =
            event.eventType === "ENDORSEMENT_PROPOSAL_CREATED";
          if (executed.summary.isAccepted !== shouldBeAccepted) {
            throw new HostedRunCommandError(
              "PACK_CONTRACT_MISMATCH",
              "Correction proposal event type does not match replayed acceptance.",
            );
          }
          return {
            ...state,
            version: event.sequenceNumber,
            workflowStep: executed.summary.isAccepted
              ? "correction-endorsement"
              : "correction-proposal",
            correctionStatus: executed.summary.isAccepted
              ? "awaiting-endorsement"
              : "rejected",
            correctionProposal: executed.summary,
            correctionPendingProposalId:
              executed.summary.proposalId,
            simulation: executed.simulation,
          };
        }
        if (state.workflowStep !== "custody-proposal") {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Proposal event is not valid for the current workflow.",
          );
        }
        const alsoTransfersOwnership = requiredBoolean(
          event.payload.alsoTransfersOwnership,
          "alsoTransfersOwnership",
        );
        const executed = await this.domainRuntime.createCustodyProposal({
          runId: state.runId,
          coreCommandId,
          eventSequence: event.sequenceNumber,
          simulation: state.simulation,
          scenarioSeed: state.scenarioSeed,
          alsoTransfersOwnership,
        });
        const expected = custodyProposalSummaryFromPayload(
          event.payload,
        );
        assertReplayEvidenceMatches(
          expected,
          executed.summary,
          "custody proposal",
        );
        const shouldBeAccepted =
          event.eventType === "ENDORSEMENT_PROPOSAL_CREATED";
        if (executed.summary.isAccepted !== shouldBeAccepted) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Custody proposal event type does not match replayed acceptance.",
          );
        }
        return {
          ...state,
          version: event.sequenceNumber,
          workflowStep: executed.summary.isAccepted
            ? "custody-endorsement"
            : "custody-proposal",
          custodyStatus: executed.summary.isAccepted
            ? "awaiting-endorsement"
            : "rejected",
          custodyProposal: executed.summary,
          pendingProposalId: executed.summary.proposalId,
          simulation: executed.simulation,
        };
      }
      case "ENDORSEMENT_RECORDED":
      case "ENDORSEMENT_REJECTED": {
        const state = this.stateOrThrow(current);
        const proposalId = requiredString(
          event.payload.proposalId,
          "proposalId",
        );
        const coreCommandId = requiredString(
          event.payload.coreCommandId,
          "coreCommandId",
        );
        if (state.workflowStep === "correction-endorsement") {
          const executed =
            await this.domainRuntime.endorseCorrectionProposal({
              runId: state.runId,
              proposalId,
              coreCommandId,
              eventSequence: event.sequenceNumber,
              simulation: state.simulation,
              scenarioSeed: state.scenarioSeed,
            });
          const expected = endorsementSummaryFromPayload(
            event.payload,
          );
          assertReplayEvidenceMatches(
            expected,
            executed.summary,
            "correction endorsement",
          );
          const shouldBeAccepted =
            event.eventType === "ENDORSEMENT_RECORDED";
          if (executed.summary.isAccepted !== shouldBeAccepted) {
            throw new HostedRunCommandError(
              "PACK_CONTRACT_MISMATCH",
              "Correction endorsement event type does not match replayed acceptance.",
            );
          }
          const policySatisfied =
            executed.summary.isAccepted &&
            executed.summary.policySatisfied;
          return {
            ...state,
            version: event.sequenceNumber,
            workflowStep: policySatisfied
              ? "correction-commit"
              : "correction-endorsement",
            correctionStatus: policySatisfied
              ? "policy-satisfied"
              : "awaiting-endorsement",
            correctionEndorsement: executed.summary,
            activeTrustedContext:
              this.domainRuntime.trustedContextForId("CTX_PRODUCER"),
            simulation: executed.simulation,
          };
        }
        if (state.workflowStep !== "custody-endorsement") {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Endorsement event is not valid for the current workflow.",
          );
        }
        const executed = await this.domainRuntime.endorseCustodyProposal({
          runId: state.runId,
          proposalId,
          coreCommandId,
          eventSequence: event.sequenceNumber,
          simulation: state.simulation,
          scenarioSeed: state.scenarioSeed,
        });
        const expected = endorsementSummaryFromPayload(event.payload);
        assertReplayEvidenceMatches(
          expected,
          executed.summary,
          "custody endorsement",
        );
        const shouldBeAccepted =
          event.eventType === "ENDORSEMENT_RECORDED";
        if (executed.summary.isAccepted !== shouldBeAccepted) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Custody endorsement event type does not match replayed acceptance.",
          );
        }
        const policySatisfied =
          executed.summary.isAccepted &&
          executed.summary.policySatisfied;
        return {
          ...state,
          version: event.sequenceNumber,
          workflowStep: policySatisfied
            ? "custody-commit"
            : "custody-endorsement",
          custodyStatus: policySatisfied
            ? "policy-satisfied"
            : "awaiting-endorsement",
          custodyEndorsement: executed.summary,
          activeTrustedContext:
            this.domainRuntime.trustedContextForId("CTX_LOGISTICS"),
          simulation: executed.simulation,
        };
      }
      case "ENDORSED_TRANSACTION_COMMITTED":
      case "ENDORSED_TRANSACTION_REJECTED": {
        const state = this.stateOrThrow(current);
        const actionId = requiredString(
          event.payload.actionId,
          "actionId",
        );
        const proposalId = requiredString(
          event.payload.proposalId,
          "proposalId",
        );
        const coreCommandId = requiredString(
          event.payload.coreCommandId,
          "coreCommandId",
        );
        if (actionId === "RECORD_CORRECTION") {
          if (state.workflowStep !== "correction-commit") {
            throw new HostedRunCommandError(
              "PACK_CONTRACT_MISMATCH",
              "Correction commitment event is not valid for the current workflow.",
            );
          }
          const executed =
            this.domainRuntime.commitCorrectionProposal({
              runId: state.runId,
              proposalId,
              coreCommandId,
              eventSequence: event.sequenceNumber,
              simulation: state.simulation,
              scenarioSeed: state.scenarioSeed,
            });
          const expected = summaryFromPayload(event.payload);
          assertSummaryMatches(expected, executed.summary);
          const shouldBeAccepted =
            event.eventType ===
            "ENDORSED_TRANSACTION_COMMITTED";
          if (executed.summary.isAccepted !== shouldBeAccepted) {
            throw new HostedRunCommandError(
              "PACK_CONTRACT_MISMATCH",
              "Endorsed correction event type does not match replayed acceptance.",
            );
          }
          return {
            ...state,
            version: event.sequenceNumber,
            correctionStatus: executed.summary.isAccepted
              ? "committed"
              : "policy-satisfied",
            transactions: [
              ...state.transactions,
              executed.summary,
            ],
            simulation: executed.simulation,
          };
        }
        if (
          actionId !== "TRANSFER_CUSTODY" ||
          state.workflowStep !== "custody-commit"
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Endorsed transaction event is not valid for the current workflow.",
          );
        }
        const executed = this.domainRuntime.commitCustodyProposal({
          runId: state.runId,
          proposalId,
          coreCommandId,
          eventSequence: event.sequenceNumber,
          simulation: state.simulation,
          scenarioSeed: state.scenarioSeed,
        });
        const expected = summaryFromPayload(event.payload);
        assertSummaryMatches(expected, executed.summary);
        const shouldBeAccepted =
          event.eventType === "ENDORSED_TRANSACTION_COMMITTED";
        if (executed.summary.isAccepted !== shouldBeAccepted) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Endorsed custody event type does not match replayed acceptance.",
          );
        }
        return {
          ...state,
          version: event.sequenceNumber,
          workflowStep: executed.summary.isAccepted
            ? "transport-transaction"
            : "custody-commit",
          custodyStatus: executed.summary.isAccepted
            ? "committed"
            : "policy-satisfied",
          transactions: [...state.transactions, executed.summary],
          simulation: executed.simulation,
        };
      }
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
        const isRecall = actionId === "RECALL_BATCH";
        if (isRecall && state.recallScopeDecision === null) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Recall transaction event has no recorded scope.",
          );
        }
        const executed = await this.domainRuntime.executeAction({
          runId: state.runId,
          actionId,
          coreCommandId,
          eventSequence: event.sequenceNumber,
          simulation: state.simulation,
          trustedContext: state.activeTrustedContext,
          scenarioSeed: state.scenarioSeed,
          ...(isRecall
            ? {
                selectedAssetIds:
                  state.recallScopeDecision?.selectedAssetIds ?? [],
              }
            : {}),
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
        const isReceipt = actionId === "RECEIVE_BATCH";
        const isOwnership = actionId === "PURCHASE_ON_RECEIPT";
        const isTransformation = actionId === "TRANSFORM_BATCH";
        const isPackaging = actionId === "PACKAGE_BATCH";
        const isDistributionOwnership =
          actionId === "TRANSFER_OWNERSHIP";
        const isDispatch = actionId === "DISPATCH_BATCH";
        return {
          ...state,
          version: event.sequenceNumber,
          workflowStep:
            isReceipt && executed.summary.isAccepted
              ? "ownership-transaction"
              : isOwnership && executed.summary.isAccepted
                ? "discrepancy-decision"
                : isTransformation && executed.summary.isAccepted
                  ? "transformation-knowledge"
                  : isPackaging && executed.summary.isAccepted
                    ? "distribution-ownership-transaction"
                    : isDistributionOwnership &&
                        executed.summary.isAccepted
                      ? "dispatch-transaction"
                      : isRecall
                        ? executed.summary.isAccepted
                          ? "blockchain-necessity-decision"
                          : "recall-handoff"
                : state.workflowStep,
          activeTrustedContext:
            isReceipt && executed.summary.isAccepted
              ? this.domainRuntime.trustedContextForId("CTX_PRODUCER")
              : isOwnership && executed.summary.isAccepted
                ? this.domainRuntime.trustedContextForId("CTX_PROCESSOR")
                : isDistributionOwnership &&
                    executed.summary.isAccepted
                  ? this.domainRuntime.trustedContextForId(
                      "CTX_DISTRIBUTOR",
                    )
                : state.activeTrustedContext,
          transactionStatus:
            actionId === "RECORD_TRANSPORT"
              ? state.transactionStatus
              : executed.summary.isAccepted &&
                  actionId === "ISSUE_CERTIFICATE"
                ? "committed"
                : executed.summary.isAccepted
                  ? "proposed"
                  : "rejected",
          transportStatus:
            actionId === "RECORD_TRANSPORT"
              ? executed.summary.isAccepted
                ? "committed"
                : "rejected"
              : state.transportStatus,
          receiptStatus: isReceipt
            ? executed.summary.isAccepted
              ? "committed"
              : "rejected"
            : state.receiptStatus,
          ownershipStatus: isOwnership
            ? executed.summary.isAccepted
              ? "committed"
              : "rejected"
            : state.ownershipStatus,
          transformationStatus: isTransformation
            ? executed.summary.isAccepted
              ? "committed"
              : "rejected"
            : state.transformationStatus,
          packagingStatus: isPackaging
            ? executed.summary.isAccepted
              ? "committed"
              : "rejected"
            : state.packagingStatus,
          distributionOwnershipStatus: isDistributionOwnership
            ? executed.summary.isAccepted
              ? "committed"
              : "rejected"
            : state.distributionOwnershipStatus,
          dispatchStatus: isDispatch
            ? executed.summary.isAccepted
              ? "committed"
              : "rejected"
            : state.dispatchStatus,
          recallStatus: isRecall
            ? executed.summary.isAccepted
              ? "committed"
              : "rejected"
            : state.recallStatus,
          transactions: [...state.transactions, executed.summary],
          simulation: executed.simulation,
        };
      }
      case "COMPETENCY_EVIDENCE_RECORDED": {
        const state = this.stateOrThrow(current);
        const evidenceRuleId = requiredString(
          event.payload.evidenceRuleId,
          "evidenceRuleId",
        );
        const indicatorIds = requiredStringArray(
          event.payload.indicatorIds,
          "indicatorIds",
        );
        const rule = this.pack.evidenceRules.find(
          (candidate) =>
            candidate.evidenceRuleId === evidenceRuleId,
        );
        const evidenceRuleVersion =
          event.payload.evidenceRuleVersion === undefined
            ? rule?.version
            : requiredString(
                event.payload.evidenceRuleVersion,
                "evidenceRuleVersion",
              );
        if (
          rule === undefined ||
          rule.version !== evidenceRuleVersion ||
          canonicalize(rule.indicatorIds) !== canonicalize(indicatorIds)
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            `Competency evidence rule ${evidenceRuleId}@${evidenceRuleVersion} does not match the run's exact pack.`,
          );
        }
        const evidence: HostedCompetencyEvidence = {
          competencyEvidenceId: requiredString(
            event.payload.competencyEvidenceId,
            "competencyEvidenceId",
          ),
          evidenceRuleId,
          indicatorIds,
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
      case "RUN_TIME_LIMIT_EXCEEDED": {
        const state = this.stateOrThrow(current);
        const timeLimitMinutes = requiredNumber(
          event.payload.timeLimitMinutes,
          "timeLimitMinutes",
        );
        const deadlineUtc = requiredString(
          event.payload.deadlineUtc,
          "deadlineUtc",
        );
        requiredString(
          event.payload.attemptedCommandType,
          "attemptedCommandType",
        );
        if (
          state.modeConfiguration.timeLimitMinutes !==
            timeLimitMinutes ||
          !Number.isInteger(timeLimitMinutes) ||
          Date.parse(event.serverTimestampUtc) <
            Date.parse(deadlineUtc)
        ) {
          throw new HostedRunCommandError(
            "PACK_CONTRACT_MISMATCH",
            "Run time-limit audit evidence does not match the authored limit.",
          );
        }
        return this.updateRequiredState(current, event, {});
      }
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
    readonly sourceEvents: readonly RunEventV1[];
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
    const matchingSourceEvents = options.sourceEvents.filter(
      (event) =>
        event.runId === options.state.runId &&
        event.packId === options.state.packId &&
        event.packVersion === options.state.packVersion &&
        event.scenarioId === options.state.scenarioId &&
        event.scenarioVersion === options.state.scenarioVersion &&
        evaluateAutomatedEvidenceRule(rule, event).matched,
    );
    if (matchingSourceEvents.length === 0) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        `Evidence rule ${rule.evidenceRuleId}@${rule.version} does not match its source event.`,
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
        evidenceRuleVersion: rule.version,
        indicatorIds: rule.indicatorIds,
        sourceEventIds: matchingSourceEvents.map(
          (event) => event.eventId,
        ),
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

  private runTiming(
    state: HostedStage3RunState,
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
        "Run timing requires valid UTC timestamps.",
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

  private assertTimeLimitAuditEvents(
    events: readonly RunEventV1[],
    state: HostedStage3RunState,
  ): void {
    const auditEvents = events.filter(
      (event) => event.eventType === "RUN_TIME_LIMIT_EXCEEDED",
    );
    if (auditEvents.length === 0) return;
    const firstEvent = events[0];
    const auditEvent = auditEvents[0];
    if (
      firstEvent === undefined ||
      auditEvent === undefined ||
      auditEvents.length !== 1
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "A run may contain at most one time-limit audit event.",
      );
    }
    const timing = this.runTiming(
      {
        ...state,
        status: "active",
      },
      firstEvent.serverTimestampUtc,
      auditEvent.serverTimestampUtc,
    );
    if (
      timing.status !== "expired" ||
      timing.deadline !== auditEvent.payload.deadlineUtc ||
      timing.timeLimitMinutes !==
        auditEvent.payload.timeLimitMinutes
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Run time-limit audit evidence is not reproducible from the run start.",
      );
    }
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

  private certificateDecisionNode(): DecisionNodeV1 {
    const node = this.hostedScenario().nodes.find(
      (candidate) =>
        candidate.nodeType === "DECISION" &&
        candidate.decisionId ===
          "INT_CERTIFICATE_INITIAL_SUBMITTED",
    );
    if (node === undefined || node.nodeType !== "DECISION") {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Hosted coffee scenario has no certificate decision node.",
      );
    }
    return node;
  }

  private certificateDecisionPolicyIds(): readonly string[] {
    const decisionId = this.certificateDecisionNode().decisionId;
    const proposal = this.hostedScenario().nodes.find(
      (candidate) =>
        candidate.nodeType === "TRANSACTION_PROPOSAL" &&
        candidate.sourceDecisionId === decisionId,
    );
    if (
      proposal === undefined ||
      proposal.nodeType !== "TRANSACTION_PROPOSAL" ||
      proposal.policyIds.length === 0
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Hosted coffee scenario has no policy-bound certificate proposal.",
      );
    }
    return proposal.policyIds;
  }

  private validateStructuredDecisionResponse(
    response: Pick<
      HostedStage3Decision,
      | "citedEvidenceIds"
      | "citedPolicyIds"
      | "confidenceRating"
      | "adverseEventProbabilityPercent"
    >,
    state: HostedStage3RunState,
  ): void {
    const configuration =
      this.certificateDecisionNode().structuredResponse;
    if (configuration === undefined) {
      if (
        response.citedEvidenceIds.length > 0 ||
        response.citedPolicyIds.length > 0 ||
        response.confidenceRating !== null ||
        response.adverseEventProbabilityPercent !== null
      ) {
        throw new HostedRunCommandError(
          "INVALID_COMMAND",
          "The scenario does not configure additional certificate response fields.",
        );
      }
      return;
    }

    const policyCitationConfiguration =
      configuration.policyCitations;
    if (policyCitationConfiguration === undefined) {
      if (response.citedPolicyIds.length > 0) {
        throw new HostedRunCommandError(
          "INVALID_COMMAND",
          "The scenario does not configure policy citations for this decision.",
        );
      }
    } else {
      const uniquePolicyIds = new Set(response.citedPolicyIds);
      if (uniquePolicyIds.size !== response.citedPolicyIds.length) {
        throw new HostedRunCommandError(
          "INVALID_COMMAND",
          "Decision policy citations must be unique.",
        );
      }
      if (
        response.citedPolicyIds.length <
          policyCitationConfiguration.minimumItems ||
        response.citedPolicyIds.length >
          policyCitationConfiguration.maximumItems ||
        (policyCitationConfiguration.required &&
          response.citedPolicyIds.length === 0)
      ) {
        throw new HostedRunCommandError(
          "INVALID_COMMAND",
          `Decision policy citations must contain ${String(
            policyCitationConfiguration.minimumItems,
          )}-${String(
            policyCitationConfiguration.maximumItems,
          )} items.`,
        );
      }
      const applicablePolicyIds = new Set(
        this.certificateDecisionPolicyIds(),
      );
      for (const policyId of response.citedPolicyIds) {
        if (!applicablePolicyIds.has(policyId)) {
          throw new HostedRunCommandError(
            "INVALID_COMMAND",
            `Cited policy ${policyId} is not applicable to this decision.`,
          );
        }
      }
    }

    const citationConfiguration =
      configuration.evidenceCitations;
    if (citationConfiguration === undefined) {
      if (response.citedEvidenceIds.length > 0) {
        throw new HostedRunCommandError(
          "INVALID_COMMAND",
          "The scenario does not configure evidence citations for this decision.",
        );
      }
    } else {
      const uniqueEvidenceIds = new Set(
        response.citedEvidenceIds,
      );
      if (
        uniqueEvidenceIds.size !==
        response.citedEvidenceIds.length
      ) {
        throw new HostedRunCommandError(
          "INVALID_COMMAND",
          "Decision evidence citations must be unique.",
        );
      }
      if (
        response.citedEvidenceIds.length <
          citationConfiguration.minimumItems ||
        response.citedEvidenceIds.length >
          citationConfiguration.maximumItems ||
        (citationConfiguration.required &&
          response.citedEvidenceIds.length === 0)
      ) {
        throw new HostedRunCommandError(
          "INVALID_COMMAND",
          `Decision evidence citations must contain ${String(
            citationConfiguration.minimumItems,
          )}-${String(
            citationConfiguration.maximumItems,
          )} items.`,
        );
      }
      for (const evidenceId of response.citedEvidenceIds) {
        if (!state.inspectedEvidenceIds.includes(evidenceId)) {
          throw new HostedRunCommandError(
            "INVALID_COMMAND",
            `Cited evidence ${evidenceId} was not inspected in this run.`,
          );
        }
      }
    }

    this.validateNumericDecisionResponse(
      "confidenceRating",
      response.confidenceRating,
      configuration.confidenceRating,
    );
    this.validateNumericDecisionResponse(
      "adverseEventProbabilityPercent",
      response.adverseEventProbabilityPercent,
      configuration.adverseEventProbabilityPercent,
    );
  }

  private validateNumericDecisionResponse(
    fieldName: string,
    value: number | null,
    configuration:
      | {
          readonly required: boolean;
          readonly minimum: number;
          readonly maximum: number;
        }
      | undefined,
  ): void {
    if (configuration === undefined) {
      if (value !== null) {
        throw new HostedRunCommandError(
          "INVALID_COMMAND",
          `The scenario does not configure ${fieldName}.`,
        );
      }
      return;
    }
    if (value === null) {
      if (configuration.required) {
        throw new HostedRunCommandError(
          "INVALID_COMMAND",
          `${fieldName} is required by the scenario.`,
        );
      }
      return;
    }
    if (
      !Number.isInteger(value) ||
      value < configuration.minimum ||
      value > configuration.maximum
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `${fieldName} must be an integer from ${String(
          configuration.minimum,
        )} to ${String(configuration.maximum)}.`,
      );
    }
  }

  private validateDiscrepancyDecision(
    command: Extract<
      HostedStage3Command,
      { readonly commandType: "SUBMIT_DISCREPANCY_DECISION" }
    >,
  ): void {
    if (
      !DISCREPANCY_ACTIONS.includes(
        command.decision
          .action as (typeof DISCREPANCY_ACTIONS)[number],
      ) ||
      !DISCREPANCY_CAUSES.includes(
        command.decision
          .causeCode as (typeof DISCREPANCY_CAUSES)[number],
      )
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Discrepancy decision contains an unsupported authored option.",
      );
    }
  }

  private validateCorrectionReason(reason: string): void {
    const maximumBytes =
      coffeeScenario.runtime.journalLimits
        .correctionReasonMaximumUtf8Bytes;
    if (
      reason.trim().length < MINIMUM_CORRECTION_REASON_LENGTH ||
      new TextEncoder().encode(reason).length > maximumBytes
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `A correction reason of at least ${String(MINIMUM_CORRECTION_REASON_LENGTH)} characters and at most ${String(maximumBytes)} UTF-8 bytes is required.`,
      );
    }
  }

  private resolveModeAndOutcome(
    request: CreateHostedStage3RunRequest,
  ): {
    readonly modeConfiguration: ReturnType<
      typeof modeConfigurationFor
    >;
    readonly outcomeResolution: StochasticOutcomeResolutionV1;
    readonly scenarioSeed: string;
  } {
    const scenario = this.hostedScenario();
    const authoredConfiguration = modeConfigurationFor(
      scenario,
      request.mode,
    );
    const modeConfiguration =
      request.modeConfiguration === undefined
        ? authoredConfiguration
        : validateHostedModeConfiguration(
            request.modeConfiguration,
            request.mode,
          );
    if (
      canonicalize(modeConfiguration) !==
      canonicalize(authoredConfiguration)
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Run mode behavior must match the exact published scenario configuration.",
      );
    }
    const outcomeModelId = modeConfiguration.outcomeModelId;
    const model = (scenario.outcomeModels ?? []).find(
      (candidate) =>
        candidate.outcomeModelId === outcomeModelId,
    );
    if (model === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Hosted coffee mode has no applicable outcome model.",
      );
    }
    const scenarioSeed =
      modeConfiguration.seedPolicy === "generated"
        ? `generated:${sha256Hex(
            canonicalize({
              domain: "TRACECHAIN_HOSTED_SCENARIO_SEED_V1",
              packContentHash: this.packContentHash(),
              assignmentId: request.assignmentId,
              runId: request.runId,
              commandId: request.commandId,
            }),
          )}`
        : requiredString(request.scenarioSeed, "scenarioSeed");
    return {
      modeConfiguration,
      scenarioSeed,
      outcomeResolution: resolveStochasticOutcome({
        model,
        scenarioSeed,
        strategy: modeConfiguration.outcomeStrategy,
        ...(modeConfiguration.outcomeStrategy === "forced"
          ? {
              forcedOutcomeCode:
                modeConfiguration.forcedOutcomeCode ??
                request.caseVariant,
            }
          : {}),
      }),
    };
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
        candidate.hostedRuntime?.entryStageId ===
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
    const decisionResponseConfiguration =
      this.certificateDecisionNode().structuredResponse;
    const decisionPolicyRecords =
      decisionResponseConfiguration?.policyCitations === undefined
        ? []
        : this.certificateDecisionPolicyIds().map((policyId) => {
            const policy = scenario.policies.find(
              (candidate) => candidate.policyId === policyId,
            );
            if (policy === undefined) {
              throw new HostedRunCommandError(
                "PACK_CONTRACT_MISMATCH",
                `Certificate decision policy ${policyId} is missing.`,
              );
            }
            return {
              recordId: `DECISION_POLICY_${policy.policyId}`,
              visibleToRoleIds: [roleId],
              value: {
                policyId: policy.policyId,
                policyType: policy.policyType,
                titleKey: policy.title.localizationKey,
              } satisfies JsonValue,
            };
          });
    const policyRecords = [
      ...(decisionResponseConfiguration === undefined
        ? []
        : [
            {
              recordId: "DECISION_RESPONSE_REQUIREMENTS",
              visibleToRoleIds: [roleId],
              value:
                decisionResponseConfiguration as unknown as JsonValue,
            },
          ]),
      ...decisionPolicyRecords,
      ...state.transactions.map((transaction, index) => ({
        recordId: `POLICY_RESULT_${String(index + 1)}`,
        visibleToRoleIds: [roleId],
        value: {
          actionId: transaction.actionId,
          signatureValid: transaction.signatureValid,
          recognizedIdentity: transaction.recognizedIdentity,
          authorized: transaction.authorized,
          validationRuleIds: transaction.validationRuleIds,
        } satisfies JsonValue,
      })),
      ...(state.custodyProposal === null
        ? []
        : [
            {
              recordId: "CUSTODY_PROPOSAL_POLICY",
              visibleToRoleIds: [roleId],
              value: {
                actionId: state.custodyProposal.actionId,
                proposalId: state.custodyProposal.proposalId,
                endorsementPolicyId:
                  state.custodyProposal.endorsementPolicyId,
                policySatisfied:
                  state.custodyProposal.policySatisfied,
                validationRuleIds:
                  state.custodyProposal.validationRuleIds,
              } satisfies JsonValue,
            },
          ]),
      ...(state.custodyEndorsement === null
        ? []
        : [
            {
              recordId: "CUSTODY_ENDORSEMENT_POLICY",
              visibleToRoleIds: [roleId],
              value: {
                proposalId: state.custodyEndorsement.proposalId,
                organizationId:
                  state.custodyEndorsement.organizationId,
                policySatisfied:
                  state.custodyEndorsement.policySatisfied,
                validationRuleIds:
                  state.custodyEndorsement.validationRuleIds,
              } satisfies JsonValue,
            },
          ]),
      ...(state.correctionProposal === null
        ? []
        : [
            {
              recordId: "CORRECTION_PROPOSAL_POLICY",
              visibleToRoleIds: [roleId],
              value: {
                actionId: state.correctionProposal.actionId,
                proposalId: state.correctionProposal.proposalId,
                endorsementPolicyId:
                  state.correctionProposal.endorsementPolicyId,
                policySatisfied:
                  state.correctionProposal.policySatisfied,
                validationRuleIds:
                  state.correctionProposal.validationRuleIds,
              } satisfies JsonValue,
            },
          ]),
      ...(state.correctionEndorsement === null
        ? []
        : [
            {
              recordId: "CORRECTION_ENDORSEMENT_POLICY",
              visibleToRoleIds: [roleId],
              value: {
                proposalId:
                  state.correctionEndorsement.proposalId,
                organizationId:
                  state.correctionEndorsement.organizationId,
                policySatisfied:
                  state.correctionEndorsement.policySatisfied,
                validationRuleIds:
                  state.correctionEndorsement.validationRuleIds,
              } satisfies JsonValue,
            },
          ]),
    ];
    const permittedActionIds =
      state.workflowStep === "certificate-evidence"
        ? ["INSPECT_EVIDENCE"]
        : state.workflowStep === "certificate-decision"
          ? ["SUBMIT_CERTIFICATE_DECISION"]
          : state.workflowStep === "certificate-transaction"
            ? ["SUBMIT_CERTIFICATE_TRANSACTION"]
            : state.workflowStep === "custody-proposal"
              ? ["CREATE_CUSTODY_TRANSFER_PROPOSAL"]
              : state.workflowStep === "custody-endorsement"
                ? ["ENDORSE_CUSTODY_TRANSFER"]
                : state.workflowStep === "custody-commit"
                  ? ["COMMIT_CUSTODY_TRANSFER"]
                  : state.workflowStep === "transport-transaction"
                    ? ["RECORD_TRANSPORT_CONDITION"]
                    : state.workflowStep === "receipt-transaction"
                      ? ["RECEIVE_BATCH"]
                      : state.workflowStep === "ownership-transaction"
                        ? ["PURCHASE_ON_RECEIPT"]
                        : state.workflowStep === "discrepancy-decision"
                          ? ["SUBMIT_DISCREPANCY_DECISION"]
                          : state.workflowStep === "discrepancy-mitigation"
                            ? ["INVESTIGATE_DISCREPANCY"]
                            : state.workflowStep === "correction-proposal"
                              ? ["CREATE_CORRECTION_PROPOSAL"]
                              : state.workflowStep === "correction-endorsement"
                                ? ["ENDORSE_CORRECTION"]
                                : state.workflowStep === "correction-commit"
                                  ? ["COMMIT_CORRECTION"]
                                  : state.workflowStep ===
                                      "transformation-transaction"
                                    ? ["TRANSFORM_BATCH"]
                                    : state.workflowStep ===
                                        "transformation-knowledge"
                                      ? ["SUBMIT_KNOWLEDGE_DECISION"]
                                      : state.workflowStep ===
                                          "packaging-transaction"
                                        ? ["PACKAGE_BATCH"]
                                        : state.workflowStep ===
                                            "distribution-ownership-transaction"
                                          ? [
                                              "TRANSFER_DISTRIBUTION_OWNERSHIP",
                                            ]
                                          : state.workflowStep ===
                                              "dispatch-transaction"
                                            ? ["DISPATCH_BATCH"]
                                            : state.workflowStep ===
                                                "tamper-demonstration"
                                              ? [
                                                  "RUN_TAMPER_DEMONSTRATION",
                                                ]
                                              : state.workflowStep ===
                                                  "tamper-knowledge"
                                                ? [
                                                    "SUBMIT_KNOWLEDGE_DECISION",
                                                  ]
                                                : state.workflowStep ===
                                                    "data-governance-decision"
                                                  ? [
                                                      "SUBMIT_DATA_GOVERNANCE_DECISION",
                                                    ]
                                                  : state.workflowStep ===
                                                      "recall-scope-decision"
                                                    ? [
                                                        "SUBMIT_RECALL_SCOPE_DECISION",
                                                      ]
                                                    : state.workflowStep ===
                                                        "recall-transaction"
                                                      ? [
                                                          "SUBMIT_RECALL_TRANSACTION",
                                                          "REQUEST_RECALL_HANDOFF",
                                                        ]
                                                      : state.workflowStep ===
                                                          "recall-handoff"
                                                        ? [
                                                            "REQUEST_RECALL_HANDOFF",
                                                          ]
                                                        : state.workflowStep ===
                                                            "recall-authorized-transaction"
                                                          ? state.recallStatus ===
                                                            "rejected"
                                                            ? [
                                                                "RESUBMIT_AUTHORIZED_RECALL",
                                                              ]
                                                            : [
                                                                "SUBMIT_RECALL_TRANSACTION",
                                                              ]
                                                          : state.workflowStep ===
                                                              "blockchain-necessity-decision"
                                                            ? [
                                                                "SUBMIT_KNOWLEDGE_DECISION",
                                                              ]
                                            : [];
    return {
      schemaVersion: "1.0.0" as const,
      runId: state.runId,
      version: state.version,
      actualState: {
        caseVariant: state.caseVariant,
        scenarioSeed: state.scenarioSeed,
        modeConfiguration:
          state.modeConfiguration as unknown as JsonValue,
        outcomeResolution:
          state.outcomeResolution as unknown as JsonValue,
      },
      businessState: [
        {
          recordId: "RUN_MODE_BEHAVIOR",
          visibleToRoleIds: [roleId],
          value: {
            mode: state.modeConfiguration.mode,
            allowHints: state.modeConfiguration.allowHints,
            allowRetry: state.modeConfiguration.allowRetry,
            allowBacktracking:
              state.modeConfiguration.allowBacktracking,
            feedbackTiming:
              state.modeConfiguration.feedbackTiming,
            showScores: state.modeConfiguration.showScores,
            ...(state.modeConfiguration.timeLimitMinutes === undefined
              ? {}
              : {
                  timeLimitMinutes:
                    state.modeConfiguration.timeLimitMinutes,
                }),
            allowCommunication:
              state.modeConfiguration.allowCommunication,
            allowEvidenceRequests:
              state.modeConfiguration.allowEvidenceRequests,
          },
        },
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
        {
          recordId: "CUSTODY_STATUS",
          visibleToRoleIds: [roleId],
          value: state.custodyStatus,
        },
        {
          recordId: "TRANSPORT_STATUS",
          visibleToRoleIds: [roleId],
          value: state.transportStatus,
        },
        {
          recordId: "RECEIPT_STATUS",
          visibleToRoleIds: [roleId],
          value: state.receiptStatus,
        },
        {
          recordId: "OWNERSHIP_STATUS",
          visibleToRoleIds: [roleId],
          value: state.ownershipStatus,
        },
        {
          recordId: "DISCREPANCY_STATUS",
          visibleToRoleIds: [roleId],
          value: {
            submitted: state.discrepancyDecision !== null,
            rejected:
              state.discrepancyDecision?.isRejectedAttempt ?? false,
            mitigationStatus:
              state.discrepancyMitigationStatus,
          },
        },
        {
          recordId: "CORRECTION_STATUS",
          visibleToRoleIds: [roleId],
          value: state.correctionStatus,
        },
        {
          recordId: "TRANSFORMATION_STATUS",
          visibleToRoleIds: [roleId],
          value: state.transformationStatus,
        },
        {
          recordId: "TRANSFORMATION_KNOWLEDGE_DECISION",
          visibleToRoleIds: [roleId],
          value:
            state.knowledgeDecisions[
              "INT_TRANSFORMATION_PROVENANCE"
            ]?.selectedOptionId ?? null,
        },
        {
          recordId: "PACKAGING_STATUS",
          visibleToRoleIds: [roleId],
          value: state.packagingStatus,
        },
        {
          recordId: "DISTRIBUTION_OWNERSHIP_STATUS",
          visibleToRoleIds: [roleId],
          value: state.distributionOwnershipStatus,
        },
        {
          recordId: "DISPATCH_STATUS",
          visibleToRoleIds: [roleId],
          value: state.dispatchStatus,
        },
        {
          recordId: "TAMPER_DEMONSTRATION",
          visibleToRoleIds: [roleId],
          value:
            state.tamperDemonstration === null
              ? null
              : tamperSummaryToJson(
                  state.tamperDemonstration,
                ),
        },
        {
          recordId: "DATA_GOVERNANCE_DECISION",
          visibleToRoleIds: [roleId],
          value:
            state.dataGovernanceDecision?.categoryByItem ?? null,
        },
        {
          recordId: "RECALL_SCOPE_DECISION",
          visibleToRoleIds: [roleId],
          value:
            state.recallScopeDecision?.selectedAssetIds ?? null,
        },
        {
          recordId: "RECALL_STATUS",
          visibleToRoleIds: [roleId],
          value: {
            status: state.recallStatus,
            handoffStatus: state.recallHandoffStatus,
          },
        },
      ],
      ledgerState: {
        transactions: this.domainRuntime.transactionInventory(state.simulation),
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
        recordedDraws:
          state.outcomeResolution.draw === undefined
            ? []
            : [state.outcomeResolution.draw],
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
      "custody-proposal",
      "custody-endorsement",
      "custody-commit",
      "transport-transaction",
      "receipt-transaction",
      "ownership-transaction",
      "discrepancy-decision",
      "discrepancy-mitigation",
      "correction-proposal",
      "correction-endorsement",
      "correction-commit",
      "transformation-transaction",
      "transformation-knowledge",
      "packaging-transaction",
      "distribution-ownership-transaction",
      "dispatch-transaction",
      "tamper-demonstration",
      "tamper-knowledge",
      "data-governance-decision",
      "recall-scope-decision",
      "recall-transaction",
      "recall-handoff",
      "recall-authorized-transaction",
      "blockchain-necessity-decision",
      "complete",
    ] as const;
    const index = ordered.indexOf(state.workflowStep);
    return ordered
      .slice(0, index)
      .filter(
        (step) =>
          step !== "discrepancy-mitigation" ||
          state.discrepancyMitigationStatus === "completed",
      );
  }
}
