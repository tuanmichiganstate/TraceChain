import type { TraceChainConfiguration } from "../../config/types";
import type {
  CompactCommandJournalEntry,
  Tc3AttemptSnapshot,
} from "../../infrastructure/persistence/tc3-codec";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import {
  IncompatibleAttemptError,
  ScenarioConfigurationError,
} from "../errors";
import type { DomainState } from "../ledger/domain-state";
import { SimulatedLedger } from "../ledger/ledger-engine";
import { applyEligibleScriptedTransactions } from "../scenario/scripted-transactions";
import type { ScenarioDefinition } from "../types/scenario";
import type { ValidationRegistries } from "../rules/types";
import {
  activeContextIdForStage,
  commandFromJournal,
  contextAt,
  JournalOpcode,
  validateAndApplyHandoff,
} from "./command-journal";
import {
  createSimulationRuntimeState,
  expectedStateVersionsFor,
  handleSimulationCommand,
} from "./command-handler";
import {
  FixedClock,
  SeededRandomSource,
  SequenceIdGenerator,
} from "./environment";
import type {
  ConsequentialDecisionCommand,
  DomainSimulationCommand,
  MitigationDecisionCommand,
  SimulationRuntimeState,
} from "./types";
import { ScenarioStageId } from "../types/enums";
import { handleSimulationDecision } from "./decision-handler";
import {
  expandCertificateDecision,
  expandDiscrepancyDecision,
  evaluateCertificateDecision,
  evaluateDiscrepancyDecision,
} from "./consequential-decisions";
import {
  encodeAnswer,
  type Answer,
} from "../scenario/answer-codec";
import type { DecisionRecord } from "../../infrastructure/persistence/state-codec";
import { runtimeMitigationCommand } from "../scenario/runtime";

export interface JournalReplayResult {
  readonly runtime: SimulationRuntimeState;
  readonly lastTransactionId: string | null;
  readonly consequentialDecisions: Readonly<Record<string, DecisionRecord>>;
}

function commandId(sequence: number): string {
  return `CMD_${String(sequence).padStart(6, "0")}`;
}

function withTrustedInitiator<T extends { readonly initiatedByActorId: string }>(
  payload: T,
  actorId: string,
): T {
  return { ...payload, initiatedByActorId: actorId };
}

function recordDecision(
  decisions: Readonly<Record<string, DecisionRecord>>,
  decisionId: string,
  encodedValue: number,
): Readonly<Record<string, DecisionRecord>> {
  return {
    ...decisions,
    [decisionId]: {
      encodedValue,
      attemptCount: (decisions[decisionId]?.attemptCount ?? 0) + 1,
    },
  };
}

function checkById(
  scenario: ScenarioDefinition,
  decisionId: string,
) {
  const check = scenario.stages
    .flatMap((stage) => stage.knowledgeChecks)
    .find((candidate) => candidate.knowledgeCheckId === decisionId);
  if (check === undefined) {
    throw new ScenarioConfigurationError(
      `Scenario is missing consequential scoring item "${decisionId}"`,
    );
  }
  return check;
}

function encodedOption(
  scenario: ScenarioDefinition,
  decisionId: string,
  correct: boolean,
): number {
  const check = checkById(scenario, decisionId);
  const optionId = correct
    ? check.correctOptionIds[0]
    : check.options.find(
        (option) => !check.correctOptionIds.includes(option.optionId),
      )?.optionId;
  if (optionId === undefined) {
    throw new ScenarioConfigurationError(
      `Scoring item "${decisionId}" lacks a ${correct ? "correct" : "wrong"} option`,
    );
  }
  const answer: Answer = {
    selectedOptionIds: [optionId],
    categoryByItem: {},
  };
  return encodeAnswer(check, answer);
}

function consequentialStage(
  opcode: number,
): ScenarioStageId | null {
  if (
    opcode === JournalOpcode.SUBMIT_CERTIFICATE_DECISION ||
    opcode === JournalOpcode.REVIEW_ISSUER ||
    opcode === JournalOpcode.REMEDIATE_STORAGE ||
    opcode === JournalOpcode.SUSPEND_LOT
  ) {
    return ScenarioStageId.ANCHOR_CERTIFICATE;
  }
  if (
    opcode === JournalOpcode.SUBMIT_DISCREPANCY_DECISION ||
    opcode === JournalOpcode.INVESTIGATE_DISCREPANCY
  ) {
    return ScenarioStageId.RECEIVE_AND_CORRECT;
  }
  return null;
}

function mitigationPayload(
  opcode: number,
): MitigationDecisionCommand | null {
  const commandType = {
    [JournalOpcode.REVIEW_ISSUER]: "REVIEW_ISSUER",
    [JournalOpcode.REMEDIATE_STORAGE]: "REMEDIATE_STORAGE",
    [JournalOpcode.SUSPEND_LOT]: "SUSPEND_LOT",
    [JournalOpcode.INVESTIGATE_DISCREPANCY]:
      "INVESTIGATE_DISCREPANCY",
  }[opcode] as MitigationDecisionCommand["commandType"] | undefined;
  return commandType === undefined ? null : { commandType };
}

function ensurePermittedContext(options: {
  readonly scenario: ScenarioDefinition;
  readonly entry: CompactCommandJournalEntry;
  readonly actionId: string;
  readonly priorJournal: readonly CompactCommandJournalEntry[];
}): void {
  const actual = contextAt(options.scenario, options.entry.contextIndex).contextId;
  if (options.actionId === "RECALL_BATCH") {
    const active = activeContextIdForStage(
      options.scenario,
      ScenarioStageId.RECALL_AND_DEBRIEF,
      options.priorJournal,
    );
    if (actual !== active) {
      throw new ScenarioConfigurationError(
        `Recall journal context "${actual}" was not active at submission`,
      );
    }
    return;
  }
  const expected = options.scenario.runtime.commandContextByAction[options.actionId];
  if (actual !== expected) {
    throw new ScenarioConfigurationError(
      `Action "${options.actionId}" used untrusted context "${actual}"`,
    );
  }
}

function sealPending(
  runtime: SimulationRuntimeState,
  ledger: SimulatedLedger,
  scenario: ScenarioDefinition,
  registries: ValidationRegistries,
): SimulationRuntimeState {
  const firstPending = runtime.domain.pendingTransactionIds[0];
  const timestamp =
    firstPending === undefined
      ? undefined
      : runtime.domain.transactionsById[firstPending]?.createdAt;
  if (timestamp === undefined) {
    throw new ScenarioConfigurationError("Journal tried to seal an empty ordering queue");
  }
  const sealed = ledger.sealPendingTransactions(runtime.domain, timestamp);
  const scripted = applyEligibleScriptedTransactions(
    sealed,
    scenario.scriptedTransactions,
    ledger,
    registries,
  ).state;
  return { ...runtime, domain: scripted };
}

export function replayCommandJournal(options: {
  readonly snapshot: Tc3AttemptSnapshot;
  readonly initialDomain: DomainState;
  readonly scenario: ScenarioDefinition;
  readonly configuration: TraceChainConfiguration;
  readonly registries: ValidationRegistries;
}): JournalReplayResult {
  const ledger = new SimulatedLedger(
    sha256Hex,
    options.scenario.ledgerConfiguration,
  );
  let runtime = createSimulationRuntimeState(options.initialDomain);
  let lastTransactionId: string | null = null;
  const processed: CompactCommandJournalEntry[] = [];
  let consequentialDecisions: Readonly<Record<string, DecisionRecord>> = {};

  for (const entry of options.snapshot.journal) {
    if (entry.opcode === JournalOpcode.ROLE_HANDOFF) {
      const handoffIndex = entry.values[0];
      const handoff =
        typeof handoffIndex === "number"
          ? options.scenario.runtime.roleHandoffs[handoffIndex]
          : undefined;
      if (handoff === undefined) {
        throw new ScenarioConfigurationError("Journal contains an invalid role handoff");
      }
      validateAndApplyHandoff({
        scenario: options.scenario,
        stageId: handoff.stageId,
        handoffId: handoff.handoffId,
        journal: processed,
      });
      if (
        contextAt(options.scenario, entry.contextIndex).contextId !==
        handoff.toContextId
      ) {
        throw new ScenarioConfigurationError(
          "Role-handoff journal context does not match its authored target",
        );
      }
      processed.push(entry);
      continue;
    }

    if (entry.opcode === JournalOpcode.SEAL_PENDING_BLOCK) {
      runtime = sealPending(runtime, ledger, options.scenario, options.registries);
      processed.push(entry);
      continue;
    }

    const consequentialStageId = consequentialStage(entry.opcode);
    if (consequentialStageId !== null) {
      const expectedContextId = activeContextIdForStage(
        options.scenario,
        consequentialStageId,
        processed,
      );
      const trusted = contextAt(options.scenario, entry.contextIndex);
      if (trusted.contextId !== expectedContextId) {
        throw new ScenarioConfigurationError(
          `Consequential journal entry ${entry.opcode} used untrusted context "${trusted.contextId}"`,
        );
      }

      let payload: ConsequentialDecisionCommand;
      let isAccepted = true;
      if (entry.opcode === JournalOpcode.SUBMIT_CERTIFICATE_DECISION) {
        if (
          processed.some(
            (candidate) =>
              candidate.opcode ===
              JournalOpcode.SUBMIT_CERTIFICATE_DECISION,
          )
        ) {
          throw new ScenarioConfigurationError(
            "Journal contains more than one initial certificate decision",
          );
        }
        const certificate = expandCertificateDecision(entry.values);
        payload = certificate;
        const evaluation = evaluateCertificateDecision(
          certificate,
          options.scenario,
        );
        consequentialDecisions = recordDecision(
          consequentialDecisions,
          "INT_CERTIFICATE_STORAGE_CHOICE",
          encodedOption(
            options.scenario,
            "INT_CERTIFICATE_STORAGE_CHOICE",
            evaluation.storageChoiceCorrect,
          ),
        );
        consequentialDecisions = recordDecision(
          consequentialDecisions,
          "INT_CERTIFICATE_ISSUER_CHECK",
          encodedOption(
            options.scenario,
            "INT_CERTIFICATE_ISSUER_CHECK",
            evaluation.issuerScorableCorrect,
          ),
        );
        consequentialDecisions = recordDecision(
          consequentialDecisions,
          "INT_CERTIFICATE_INITIAL_SUBMITTED",
          1,
        );
        if (evaluation.mitigationActions.length === 0) {
          consequentialDecisions = recordDecision(
            consequentialDecisions,
            "INT_CERTIFICATE_MITIGATION_COMPLETE",
            1,
          );
        }
      } else if (
        entry.opcode === JournalOpcode.SUBMIT_DISCREPANCY_DECISION
      ) {
        if (
          processed.some(
            (candidate) =>
              candidate.opcode ===
              JournalOpcode.SUBMIT_DISCREPANCY_DECISION,
          )
        ) {
          throw new ScenarioConfigurationError(
            "Journal contains more than one initial discrepancy decision",
          );
        }
        const discrepancy = expandDiscrepancyDecision(entry.values);
        const evaluation = evaluateDiscrepancyDecision(
          discrepancy,
          options.scenario,
        );
        payload = discrepancy;
        isAccepted = !evaluation.isRejectedAttempt;
        consequentialDecisions = recordDecision(
          consequentialDecisions,
          "INT_CORRECTION_RECORDED",
          evaluation.isScorableCorrect ? 1 : 0,
        );
        consequentialDecisions = recordDecision(
          consequentialDecisions,
          "INT_DISCREPANCY_INITIAL_SUBMITTED",
          1,
        );
        if (!evaluation.requiresMitigation) {
          consequentialDecisions = recordDecision(
            consequentialDecisions,
            "INT_DISCREPANCY_MITIGATION_COMPLETE",
            1,
          );
        }
      } else {
        const mitigation = mitigationPayload(entry.opcode);
        if (mitigation === null) {
          throw new ScenarioConfigurationError(
            `Unsupported consequential opcode ${entry.opcode}`,
          );
        }
        payload = mitigation;
        const requiredInitialOpcode =
          consequentialStageId === ScenarioStageId.ANCHOR_CERTIFICATE
            ? JournalOpcode.SUBMIT_CERTIFICATE_DECISION
            : JournalOpcode.SUBMIT_DISCREPANCY_DECISION;
        if (
          !processed.some(
            (candidate) => candidate.opcode === requiredInitialOpcode,
          )
        ) {
          throw new ScenarioConfigurationError(
            `Mitigation ${entry.opcode} precedes its initial decision`,
          );
        }
      }

      const templateAction =
        consequentialStageId === ScenarioStageId.ANCHOR_CERTIFICATE
          ? "ANCHOR_CERTIFICATE"
          : "RECORD_CORRECTION";
      const submittedAt =
        options.scenario.runtime.learnerCommandTemplates[templateAction]
          ?.scenarioTimestamp;
      if (submittedAt === undefined) {
        throw new ScenarioConfigurationError(
          `Scenario is missing the timestamp for "${templateAction}"`,
        );
      }
      const command = {
        metadata: {
          commandId: commandId(entry.commandSequence),
          sessionId: options.snapshot.sessionId,
          actorId: trusted.actorId,
          organizationId: trusted.organizationId,
          roleId: trusted.roleId,
          submittedAt,
          expectedStateVersions: {},
        },
        payload,
      };
      const outcome = handleSimulationDecision({
        runtime,
        command,
        trustedContext: trusted,
        isAccepted,
        decisionType: payload.commandType,
        decisionPayload: payload,
        ...(isAccepted
          ? {}
          : {
              rejectionFailures: [
                {
                  code: "DOMAIN_RULE_FAILED" as const,
                  messageKey: "validation.appendOnlyRequired",
                },
              ],
            }),
        environment: {
          clock: new FixedClock(submittedAt),
          random: new SeededRandomSource(
            `${options.configuration.scenarioSeed}:${entry.commandSequence}`,
          ),
          ids: new SequenceIdGenerator(entry.commandSequence),
        },
      });
      runtime = outcome.state;

      const prospectiveProcessed = [...processed, entry];
      if (
        entry.opcode === JournalOpcode.REVIEW_ISSUER ||
        entry.opcode === JournalOpcode.REMEDIATE_STORAGE ||
        entry.opcode === JournalOpcode.SUSPEND_LOT
      ) {
        const initialEntry = prospectiveProcessed.find(
          (candidate) =>
            candidate.opcode ===
            JournalOpcode.SUBMIT_CERTIFICATE_DECISION,
        );
        if (initialEntry === undefined) {
          throw new ScenarioConfigurationError(
            "Certificate mitigation has no initial decision",
          );
        }
        const initial = expandCertificateDecision(initialEntry.values);
        const evaluation = evaluateCertificateDecision(
          initial,
          options.scenario,
        );
        const has = (opcode: number): boolean =>
          prospectiveProcessed.some(
            (candidate) => candidate.opcode === opcode,
          );
        const storageResolved =
          evaluation.storageChoiceCorrect ||
          has(JournalOpcode.REMEDIATE_STORAGE);
        const issuerResolved =
          ((evaluation.certificateAssessmentCorrect &&
            evaluation.issuerAssessmentCorrect) ||
            has(JournalOpcode.REVIEW_ISSUER)) &&
          (evaluation.lotDispositionCorrect ||
            has(JournalOpcode.SUSPEND_LOT));
        const storageCorrect = encodedOption(
          options.scenario,
          "INT_CERTIFICATE_STORAGE_CHOICE",
          true,
        );
        if (
          storageResolved &&
          consequentialDecisions["INT_CERTIFICATE_STORAGE_CHOICE"]
            ?.encodedValue !== storageCorrect
        ) {
          consequentialDecisions = recordDecision(
            consequentialDecisions,
            "INT_CERTIFICATE_STORAGE_CHOICE",
            storageCorrect,
          );
        }
        const issuerCorrect = encodedOption(
          options.scenario,
          "INT_CERTIFICATE_ISSUER_CHECK",
          true,
        );
        if (
          issuerResolved &&
          consequentialDecisions["INT_CERTIFICATE_ISSUER_CHECK"]
            ?.encodedValue !== issuerCorrect
        ) {
          consequentialDecisions = recordDecision(
            consequentialDecisions,
            "INT_CERTIFICATE_ISSUER_CHECK",
            issuerCorrect,
          );
        }
        if (
          storageResolved &&
          issuerResolved &&
          consequentialDecisions[
            "INT_CERTIFICATE_MITIGATION_COMPLETE"
          ] === undefined
        ) {
          consequentialDecisions = recordDecision(
            consequentialDecisions,
            "INT_CERTIFICATE_MITIGATION_COMPLETE",
            1,
          );
        }
      }
      if (
        entry.opcode === JournalOpcode.INVESTIGATE_DISCREPANCY &&
        consequentialDecisions["INT_CORRECTION_RECORDED"]?.encodedValue !== 1
      ) {
        consequentialDecisions = recordDecision(
          consequentialDecisions,
          "INT_CORRECTION_RECORDED",
          1,
        );
        consequentialDecisions = recordDecision(
          consequentialDecisions,
          "INT_DISCREPANCY_MITIGATION_COMPLETE",
          1,
        );
      }
      processed.push(entry);
      continue;
    }

    let reconstructed = commandFromJournal(
      entry,
      options.scenario,
      runtime.domain,
    );
    if (reconstructed === null) {
      // Consequential decision records are replay inputs consumed by their
      // authored orchestration. Until one produces a domain command, it has no
      // independent ledger projection.
      processed.push(entry);
      continue;
    }
    if (
      reconstructed.actionId === "ANCHOR_CERTIFICATE" &&
      processed.some(
        (candidate) => candidate.opcode === JournalOpcode.REVIEW_ISSUER,
      )
    ) {
      reconstructed = {
        ...reconstructed,
        command: runtimeMitigationCommand(
          options.scenario,
          "ANCHOR_CERTIFICATE",
        ),
      };
    }
    ensurePermittedContext({
      scenario: options.scenario,
      entry,
      actionId: reconstructed.actionId,
      priorJournal: processed,
    });
    const trusted = contextAt(options.scenario, entry.contextIndex);
    const payload = withTrustedInitiator(
      reconstructed.command,
      trusted.actorId,
    );
    const stateWithScripts = applyEligibleScriptedTransactions(
      runtime.domain,
      options.scenario.scriptedTransactions,
      ledger,
      options.registries,
    ).state;
    runtime = { ...runtime, domain: stateWithScripts };
    const command: DomainSimulationCommand = {
      metadata: {
        commandId: commandId(entry.commandSequence),
        sessionId: options.snapshot.sessionId,
        actorId: trusted.actorId,
        organizationId: trusted.organizationId,
        roleId: trusted.roleId,
        submittedAt: payload.scenarioTimestamp,
        expectedStateVersions: expectedStateVersionsFor(payload, runtime.domain),
      },
      payload,
    };
    const outcome = handleSimulationCommand({
      runtime,
      command,
      trustedContext: trusted,
      ledger,
      registries: options.registries,
      environment: {
        clock: new FixedClock(payload.scenarioTimestamp),
        random: new SeededRandomSource(
          `${options.configuration.scenarioSeed}:${entry.commandSequence}`,
        ),
        ids: new SequenceIdGenerator(entry.commandSequence),
      },
    });
    runtime = outcome.state;
    lastTransactionId = outcome.transaction?.transactionId ?? lastTransactionId;
    if (reconstructed.actionId === "RECALL_BATCH") {
      consequentialDecisions = recordDecision(
        consequentialDecisions,
        "INT_RECALL_COMMITTED",
        outcome.isAccepted ? 1 : 0,
      );
      if (
        consequentialDecisions["INT_RECALL_INITIAL_SUBMITTED"] === undefined
      ) {
        consequentialDecisions = recordDecision(
          consequentialDecisions,
          "INT_RECALL_INITIAL_SUBMITTED",
          1,
        );
      }
      if (
        outcome.isAccepted &&
        consequentialDecisions["INT_RECALL_AUTHORIZATION_RESOLVED"] ===
          undefined
      ) {
        consequentialDecisions = recordDecision(
          consequentialDecisions,
          "INT_RECALL_AUTHORIZATION_RESOLVED",
          1,
        );
      }
    }
    processed.push(entry);
  }

  for (const [decisionId, derived] of Object.entries(
    consequentialDecisions,
  )) {
    const persisted = options.snapshot.decisions[decisionId];
    if (
      persisted?.encodedValue !== derived.encodedValue ||
      persisted.attemptCount !== derived.attemptCount
    ) {
      throw new IncompatibleAttemptError(
        `Consequential decision "${decisionId}" does not match deterministic replay`,
      );
    }
  }

  return { runtime, lastTransactionId, consequentialDecisions };
}
