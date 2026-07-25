/**
 * Compact, deterministic command-journal vocabulary.
 *
 * The opcode table is application code shared by every package. Scenario data
 * supplies command templates, contexts, identifiers and authored limits. The
 * journal stores only learner-controlled deltas from those templates.
 */

import type {
  RecallBatchCommand,
  RecordCorrectionCommand,
  SupplyChainCommand,
  TransferCustodyCommand,
} from "../commands/commands";
import { ScenarioConfigurationError } from "../errors";
import type { DomainState } from "../ledger/domain-state";
import { TransactionStatus, TransactionType } from "../types/enums";
import type {
  ScenarioDefinition,
  ScenarioTrustedContext,
} from "../types/scenario";
import type { TraceChainConfiguration } from "../../config/types";
import type {
  CompactCommandJournalEntry,
  JournalOpcodeDefinition,
  Tc3CodecSchema,
} from "../../infrastructure/persistence/tc3-codec";
import { runtimeCommand, trustedContext } from "../scenario/runtime";
import { MAX_ATTEMPT_COUNT } from "../../infrastructure/persistence/attempt-state";

export const JournalOpcode = {
  CREATE_BATCH: 1,
  ANCHOR_CERTIFICATE: 2,
  ISSUE_CERTIFICATE: 3,
  SUSPICIOUS_CERTIFICATE: 4,
  TRANSFER_CUSTODY: 5,
  RECORD_TRANSPORT: 6,
  RECEIVE_BATCH: 7,
  PURCHASE_ON_RECEIPT: 8,
  RECORD_CORRECTION: 9,
  TRANSFORM_BATCH: 10,
  PACKAGE_BATCH: 11,
  TRANSFER_OWNERSHIP: 12,
  DISPATCH_BATCH: 13,
  RECALL_BATCH: 14,
  SEAL_PENDING_BLOCK: 20,
  ROLE_HANDOFF: 21,
  SUBMIT_CERTIFICATE_DECISION: 30,
  REVIEW_ISSUER: 31,
  REMEDIATE_STORAGE: 32,
  SUSPEND_LOT: 33,
  SUBMIT_DISCREPANCY_DECISION: 40,
  INVESTIGATE_DISCREPANCY: 41,
  CREATE_ENDORSED_PROPOSAL: 50,
  ENDORSE_TRANSACTION_PROPOSAL: 51,
  DECLINE_TRANSACTION_PROPOSAL: 52,
  COMMIT_ENDORSED_TRANSACTION: 53,
  CREATE_ENDORSED_CORRECTION_PROPOSAL: 54,
} as const;

export type JournalOpcodeValue = (typeof JournalOpcode)[keyof typeof JournalOpcode];

const ACTION_OPCODE = {
  CREATE_BATCH: JournalOpcode.CREATE_BATCH,
  ANCHOR_CERTIFICATE: JournalOpcode.ANCHOR_CERTIFICATE,
  ISSUE_CERTIFICATE: JournalOpcode.ISSUE_CERTIFICATE,
  SUSPICIOUS_CERTIFICATE: JournalOpcode.SUSPICIOUS_CERTIFICATE,
  TRANSFER_CUSTODY: JournalOpcode.TRANSFER_CUSTODY,
  RECORD_TRANSPORT: JournalOpcode.RECORD_TRANSPORT,
  RECEIVE_BATCH: JournalOpcode.RECEIVE_BATCH,
  PURCHASE_ON_RECEIPT: JournalOpcode.PURCHASE_ON_RECEIPT,
  RECORD_CORRECTION: JournalOpcode.RECORD_CORRECTION,
  TRANSFORM_BATCH: JournalOpcode.TRANSFORM_BATCH,
  PACKAGE_BATCH: JournalOpcode.PACKAGE_BATCH,
  TRANSFER_OWNERSHIP: JournalOpcode.TRANSFER_OWNERSHIP,
  DISPATCH_BATCH: JournalOpcode.DISPATCH_BATCH,
  RECALL_BATCH: JournalOpcode.RECALL_BATCH,
} as const;

const OPCODE_ACTION = new Map<number, string>(
  Object.entries(ACTION_OPCODE).map(([actionId, opcode]) => [opcode, actionId]),
);

function definition(
  opcode: number,
  section: JournalOpcodeDefinition["section"],
  maxOccurrences: number,
  textValueByteLimits?: Readonly<Record<number, number>>,
): JournalOpcodeDefinition {
  return {
    opcode,
    section,
    maxOccurrences,
    ...(textValueByteLimits === undefined ? {} : { textValueByteLimits }),
  };
}

export function commandJournalDefinitions(
  scenario: ScenarioDefinition,
  endorsementPoliciesEnabled = false,
): readonly JournalOpcodeDefinition[] {
  const limits = scenario.runtime.journalLimits;
  return [
    definition(JournalOpcode.CREATE_BATCH, "baseline", 1),
    definition(JournalOpcode.ANCHOR_CERTIFICATE, "stage3", 1),
    definition(JournalOpcode.ISSUE_CERTIFICATE, "stage3", 1),
    definition(JournalOpcode.SUSPICIOUS_CERTIFICATE, "stage3", 1),
    definition(
      JournalOpcode.TRANSFER_CUSTODY,
      "baseline",
      endorsementPoliciesEnabled ? 0 : MAX_ATTEMPT_COUNT,
    ),
    // One historical attempt may already have been rejected before the
    // custody handoff. The UI now gates that ordering mistake, while this
    // second bounded slot lets an existing TC3 attempt recover and commit.
    definition(JournalOpcode.RECORD_TRANSPORT, "baseline", 2),
    definition(JournalOpcode.RECEIVE_BATCH, "baseline", 1),
    definition(JournalOpcode.PURCHASE_ON_RECEIPT, "baseline", 1),
    definition(
      JournalOpcode.RECORD_CORRECTION,
      "stage5",
      endorsementPoliciesEnabled ? 0 : 1,
      {
      0: limits.correctionReasonMaximumUtf8Bytes,
      },
    ),
    definition(JournalOpcode.TRANSFORM_BATCH, "baseline", 1),
    definition(JournalOpcode.PACKAGE_BATCH, "baseline", 1),
    definition(JournalOpcode.TRANSFER_OWNERSHIP, "baseline", 1),
    definition(JournalOpcode.DISPATCH_BATCH, "baseline", 1),
    definition(
      JournalOpcode.RECALL_BATCH,
      "stage9",
      1 + limits.maximumStage9Resubmissions,
    ),
    // Thirteen authored business commands can be accepted in one attempt.
    // Rejected submissions do not create an ordering batch, so retaining more
    // seal records would describe no valid authored path.
    definition(JournalOpcode.SEAL_PENDING_BLOCK, "baseline", 13),
    definition(
      JournalOpcode.ROLE_HANDOFF,
      "context",
      limits.maximumStage9Handoffs +
        (endorsementPoliciesEnabled
          ? limits.maximumEndorsementHandoffs
          : 0),
    ),
    definition(JournalOpcode.SUBMIT_CERTIFICATE_DECISION, "stage3", 1),
    definition(JournalOpcode.REVIEW_ISSUER, "stage3", 1),
    definition(JournalOpcode.REMEDIATE_STORAGE, "stage3", 1),
    definition(JournalOpcode.SUSPEND_LOT, "stage3", 1),
    definition(JournalOpcode.SUBMIT_DISCREPANCY_DECISION, "stage5", 1),
    definition(
      JournalOpcode.INVESTIGATE_DISCREPANCY,
      "stage5",
      limits.maximumStage5Mitigations,
    ),
    definition(
      JournalOpcode.CREATE_ENDORSED_PROPOSAL,
      "baseline",
      endorsementPoliciesEnabled ? MAX_ATTEMPT_COUNT : 0,
    ),
    definition(
      JournalOpcode.CREATE_ENDORSED_CORRECTION_PROPOSAL,
      "baseline",
      endorsementPoliciesEnabled ? 1 : 0,
      {
        1: limits.correctionReasonMaximumUtf8Bytes,
      },
    ),
    definition(
      JournalOpcode.ENDORSE_TRANSACTION_PROPOSAL,
      "baseline",
      endorsementPoliciesEnabled ? 2 : 0,
    ),
    definition(
      JournalOpcode.DECLINE_TRANSACTION_PROPOSAL,
      "baseline",
      endorsementPoliciesEnabled
        ? limits.maximumEndorsementDeclines
        : 0,
    ),
    definition(
      JournalOpcode.COMMIT_ENDORSED_TRANSACTION,
      "baseline",
      endorsementPoliciesEnabled ? 2 : 0,
    ),
  ];
}

export function tc3CodecSchema(options: {
  readonly configuration: TraceChainConfiguration;
  readonly configurationHash: string;
  readonly scenario: ScenarioDefinition;
}): Tc3CodecSchema {
  return {
    configurationHash: options.configurationHash,
    scenarioId: options.scenario.scenarioId,
    scenarioVersion: options.scenario.scenarioVersion,
    scenarioSeed: options.configuration.scenarioSeed,
    decisionIds: options.scenario.decisionIds,
    hintIds: options.scenario.hintIds,
    opcodes: commandJournalDefinitions(
      options.scenario,
      options.configuration.technicalFeatures
        .endorsementPolicies,
    ),
  };
}

export function contextIndex(
  scenario: ScenarioDefinition,
  contextId: string,
): number {
  const index = scenario.runtime.trustedContexts.findIndex(
    (context) => context.contextId === contextId,
  );
  if (index < 0) {
    throw new ScenarioConfigurationError(`Unknown trusted context "${contextId}"`);
  }
  return index;
}

export function contextAt(
  scenario: ScenarioDefinition,
  index: number,
): ScenarioTrustedContext {
  const context = scenario.runtime.trustedContexts[index];
  if (context === undefined) {
    throw new ScenarioConfigurationError(`Unknown trusted-context index ${index}`);
  }
  return context;
}

export function actionOpcode(actionId: string): number {
  const opcode = ACTION_OPCODE[actionId as keyof typeof ACTION_OPCODE];
  if (opcode === undefined) {
    throw new ScenarioConfigurationError(`No compact opcode for action "${actionId}"`);
  }
  return opcode;
}

export function actionForOpcode(opcode: number): string | null {
  return OPCODE_ACTION.get(opcode) ?? null;
}

function recallOptionIds(scenario: ScenarioDefinition): readonly string[] {
  const check = scenario.stages
    .flatMap((stage) => stage.knowledgeChecks)
    .find((candidate) => candidate.knowledgeCheckId === "INT_RECALL_SCOPE");
  if (check === undefined) {
    throw new ScenarioConfigurationError("Scenario has no INT_RECALL_SCOPE options");
  }
  return check.options.map((option) => option.optionId);
}

export function compactValuesForCommand(
  actionId: string,
  command: SupplyChainCommand,
  scenario: ScenarioDefinition,
): readonly (number | readonly number[] | string)[] {
  if (actionId === "TRANSFER_CUSTODY") {
    return [(command as TransferCustodyCommand).alsoTransfersOwnership ? 1 : 0];
  }
  if (actionId === "RECORD_CORRECTION") {
    return [(command as RecordCorrectionCommand).reason];
  }
  if (actionId === "RECALL_BATCH") {
    const options = recallOptionIds(scenario);
    const selected = (command as RecallBatchCommand).selectedAssetIds.map((assetId) => {
      const index = options.indexOf(assetId);
      if (index < 0) {
        throw new ScenarioConfigurationError(
          `Recall selection "${assetId}" is not an authored option`,
        );
      }
      return index;
    });
    return [selected];
  }
  return [];
}

export function commandJournalEntry(options: {
  readonly commandSequence: number;
  readonly actionId: string;
  readonly command: SupplyChainCommand;
  readonly contextId: string;
  readonly scenario: ScenarioDefinition;
}): CompactCommandJournalEntry {
  return {
    commandSequence: options.commandSequence,
    opcode: actionOpcode(options.actionId),
    contextIndex: contextIndex(options.scenario, options.contextId),
    values: compactValuesForCommand(options.actionId, options.command, options.scenario),
  };
}

export function endorsedProposalJournalEntry(options: {
  readonly commandSequence: number;
  readonly actionId: string;
  readonly command: SupplyChainCommand;
  readonly contextId: string;
  readonly scenario: ScenarioDefinition;
}): CompactCommandJournalEntry {
  const opcode =
    options.actionId === "RECORD_CORRECTION"
      ? JournalOpcode.CREATE_ENDORSED_CORRECTION_PROPOSAL
      : JournalOpcode.CREATE_ENDORSED_PROPOSAL;
  return {
    commandSequence: options.commandSequence,
    opcode,
    contextIndex: contextIndex(
      options.scenario,
      options.contextId,
    ),
    values: [
      actionOpcode(options.actionId),
      ...compactValuesForCommand(
        options.actionId,
        options.command,
        options.scenario,
      ),
    ],
  };
}

export function commandFromEndorsedProposalJournal(
  entry: CompactCommandJournalEntry,
  scenario: ScenarioDefinition,
  state: DomainState,
): {
  readonly actionId: string;
  readonly command: SupplyChainCommand;
} {
  const actionOpcodeValue = entry.values[0];
  if (typeof actionOpcodeValue !== "number") {
    throw new ScenarioConfigurationError(
      "Endorsed proposal journal entry has no action opcode",
    );
  }
  const expectedOuterOpcode =
    actionOpcodeValue === JournalOpcode.RECORD_CORRECTION
      ? JournalOpcode.CREATE_ENDORSED_CORRECTION_PROPOSAL
      : actionOpcodeValue === JournalOpcode.TRANSFER_CUSTODY
        ? JournalOpcode.CREATE_ENDORSED_PROPOSAL
        : null;
  if (
    expectedOuterOpcode === null ||
    entry.opcode !== expectedOuterOpcode
  ) {
    throw new ScenarioConfigurationError(
      "Endorsed proposal action does not match its bounded journal opcode",
    );
  }
  const reconstructed = commandFromJournal(
    {
      ...entry,
      opcode: actionOpcodeValue,
      values: entry.values.slice(1),
    },
    scenario,
    state,
  );
  if (reconstructed === null) {
    throw new ScenarioConfigurationError(
      `Endorsed proposal refers to unknown action opcode ${actionOpcodeValue}`,
    );
  }
  return reconstructed;
}

export function endorsementWorkflowJournalEntry(options: {
  readonly commandSequence: number;
  readonly opcode:
    | typeof JournalOpcode.ENDORSE_TRANSACTION_PROPOSAL
    | typeof JournalOpcode.DECLINE_TRANSACTION_PROPOSAL
    | typeof JournalOpcode.COMMIT_ENDORSED_TRANSACTION;
  readonly contextId: string;
  readonly proposalCommandSequence: number;
  readonly scenario: ScenarioDefinition;
}): CompactCommandJournalEntry {
  return {
    commandSequence: options.commandSequence,
    opcode: options.opcode,
    contextIndex: contextIndex(
      options.scenario,
      options.contextId,
    ),
    values: [options.proposalCommandSequence],
  };
}

function committedManifestTransactionId(
  state: DomainState,
  scenario: ScenarioDefinition,
): string {
  const transaction = state.transactionOrder
    .map((transactionId) => state.transactionsById[transactionId])
    .find(
      (candidate) =>
        candidate?.transactionStatus === TransactionStatus.COMMITTED &&
        candidate.transactionType === TransactionType.ANCHOR_DOCUMENT &&
        (candidate.commandPayload as { readonly documentAnchorId?: string })
          .documentAnchorId === scenario.runtime.documentRoles.shippingManifestAnchorId,
    );
  if (transaction === undefined) {
    throw new ScenarioConfigurationError(
      "Cannot reconstruct a correction before the shipping manifest is committed",
    );
  }
  return transaction.transactionId;
}

export function commandFromJournal(
  entry: CompactCommandJournalEntry,
  scenario: ScenarioDefinition,
  state: DomainState,
): { readonly actionId: string; readonly command: SupplyChainCommand } | null {
  const actionId = actionForOpcode(entry.opcode);
  if (actionId === null) return null;

  if (actionId === "TRANSFER_CUSTODY") {
    return {
      actionId,
      command: runtimeCommand<TransferCustodyCommand>(scenario, actionId, {
        alsoTransfersOwnership: entry.values[0] === 1,
      }),
    };
  }
  if (actionId === "RECORD_CORRECTION") {
    const reason = entry.values[0];
    if (typeof reason !== "string") {
      throw new ScenarioConfigurationError("Correction journal entry has no bounded reason");
    }
    return {
      actionId,
      command: runtimeCommand<RecordCorrectionCommand>(scenario, actionId, {
        correctionOfTransactionId: committedManifestTransactionId(state, scenario),
        reason,
      }),
    };
  }
  if (actionId === "RECALL_BATCH") {
    const indexes = entry.values[0];
    if (!Array.isArray(indexes)) {
      throw new ScenarioConfigurationError("Recall journal entry has no option-index list");
    }
    const options = recallOptionIds(scenario);
    const selectedAssetIds = indexes.map((index) => {
      const assetId = options[index];
      if (assetId === undefined) {
        throw new ScenarioConfigurationError(`Recall option index ${index} is out of range`);
      }
      return assetId;
    });
    return {
      actionId,
      command: runtimeCommand<RecallBatchCommand>(scenario, actionId, {
        selectedAssetIds,
      }),
    };
  }

  return { actionId, command: runtimeCommand(scenario, actionId) };
}

export function activeContextIdForStage(
  scenario: ScenarioDefinition,
  stageId: keyof ScenarioDefinition["runtime"]["initialContextByStage"],
  journal: readonly CompactCommandJournalEntry[],
): string {
  let current = scenario.runtime.initialContextByStage[stageId];
  for (const entry of journal) {
    if (entry.opcode !== JournalOpcode.ROLE_HANDOFF) continue;
    const handoffIndex = entry.values[0];
    if (typeof handoffIndex !== "number") continue;
    const handoff = scenario.runtime.roleHandoffs[handoffIndex];
    if (handoff?.stageId === stageId && handoff.fromContextId === current) {
      current = handoff.toContextId;
    }
  }
  return current;
}

export function validateAndApplyHandoff(options: {
  readonly scenario: ScenarioDefinition;
  readonly stageId: keyof ScenarioDefinition["runtime"]["initialContextByStage"];
  readonly handoffId: string;
  readonly journal: readonly CompactCommandJournalEntry[];
}): {
  readonly handoffIndex: number;
  readonly fromContextId: string;
  readonly toContextId: string;
} {
  const handoffIndex = options.scenario.runtime.roleHandoffs.findIndex(
    (handoff) => handoff.handoffId === options.handoffId,
  );
  const handoff = options.scenario.runtime.roleHandoffs[handoffIndex];
  if (handoff === undefined || handoff.stageId !== options.stageId) {
    throw new ScenarioConfigurationError(
      `Handoff "${options.handoffId}" is not permitted in ${options.stageId}`,
    );
  }
  const current = activeContextIdForStage(
    options.scenario,
    options.stageId,
    options.journal,
  );
  if (handoff.fromContextId !== current) {
    throw new ScenarioConfigurationError(
      `Handoff "${options.handoffId}" cannot start from trusted context "${current}"`,
    );
  }
  trustedContext(options.scenario, handoff.toContextId);
  return {
    handoffIndex,
    fromContextId: handoff.fromContextId,
    toContextId: handoff.toContextId,
  };
}
