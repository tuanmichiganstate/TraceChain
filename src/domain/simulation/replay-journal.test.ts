import { describe, expect, it } from "vitest";
import { runUpTo } from "../../../test/support/scenario-driver";
import { GUIDED_PRESET } from "../../config/presets";
import { hashConfiguration } from "../../config/hash";
import type {
  CompactCommandJournalEntry,
  Tc3AttemptSnapshot,
} from "../../infrastructure/persistence/tc3-codec";
import {
  decodeTc3Attempt,
  encodeTc3Attempt,
} from "../../infrastructure/persistence/tc3-codec";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type { RecallBatchCommand } from "../commands/commands";
import { buildCausalReport } from "../reporting/causal-report";
import { applyScenarioSeed } from "../scenario/seed-replay";
import {
  ScenarioStageId,
  TransactionStatus,
  TransactionType,
} from "../types/enums";
import type { ScenarioDefinition } from "../types/scenario";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import {
  compactDiscrepancyDecision,
} from "./consequential-decisions";
import {
  contextIndex,
  JournalOpcode,
  tc3CodecSchema,
} from "./command-journal";
import { replayCommandJournal } from "./replay-journal";

const registries = {
  organizationsById: Object.fromEntries(
    coffeeScenario.organizations.map((organization) => [
      organization.organizationId,
      organization,
    ]),
  ),
  actorsById: Object.fromEntries(
    coffeeScenario.actors.map((actor) => [
      actor.actorId,
      actor,
    ]),
  ),
};

function contextIndexById(
  scenario: ScenarioDefinition,
  contextId: string,
): number {
  return contextIndex(scenario, contextId);
}

function snapshot(
  journal: readonly CompactCommandJournalEntry[],
  decisions: Tc3AttemptSnapshot["decisions"],
): Tc3AttemptSnapshot {
  return {
    sessionId: "SES_REPLAY_TEST",
    currentStageId: ScenarioStageId.RECALL_AND_DEBRIEF,
    completedStageIds: [],
    decisions,
    hintsUsed: [],
    journal,
    isCompleted: false,
    isPassed: false,
  };
}

function initialSeededDomain() {
  return applyScenarioSeed(
    coffeeScenario,
    sha256Hex,
    registries,
  ).state;
}

describe("deterministic consequential-command replay", () => {
  it("regenerates a rejected overwrite as audit history without a ledger projection", () => {
    const stage5Context =
      coffeeScenario.runtime.initialContextByStage[
        ScenarioStageId.RECEIVE_AND_CORRECT
      ];
    const journal: readonly CompactCommandJournalEntry[] = [
      {
        commandSequence: 1,
        opcode: JournalOpcode.SUBMIT_DISCREPANCY_DECISION,
        contextIndex: contextIndexById(coffeeScenario, stage5Context),
        values: compactDiscrepancyDecision({
          commandType: "SUBMIT_DISCREPANCY_DECISION",
          action: "OVERWRITE",
          causeCode: "TYPING_ERROR",
        }),
      },
    ];
    const initialDomain = initialSeededDomain();
    const replayed = replayCommandJournal({
      snapshot: snapshot(journal, {
        INT_CORRECTION_RECORDED: { encodedValue: 0, attemptCount: 1 },
        INT_DISCREPANCY_INITIAL_SUBMITTED: {
          encodedValue: 1,
          attemptCount: 1,
        },
      }),
      initialDomain,
      scenario: coffeeScenario,
      configuration: GUIDED_PRESET,
      registries,
    });

    expect(replayed.runtime.domain).toEqual(initialDomain);
    expect(replayed.runtime.acceptedEvents).toEqual([]);
    expect(replayed.runtime.attemptAuditEvents).toHaveLength(1);
    expect(
      replayed.runtime.attemptAuditEvents[0]?.submittedCommand.payload,
    ).toMatchObject({
      commandType: "SUBMIT_DISCREPANCY_DECISION",
      action: "OVERWRITE",
    });
    expect(replayed.consequentialDecisions).not.toHaveProperty(
      "INT_DISCREPANCY_MITIGATION_COMPLETE",
    );
  });

  it("retains a rejected overwrite and its bounded mitigation as two outcomes", () => {
    const stage5Context =
      coffeeScenario.runtime.initialContextByStage[
        ScenarioStageId.RECEIVE_AND_CORRECT
      ];
    const context = contextIndexById(coffeeScenario, stage5Context);
    const journal: readonly CompactCommandJournalEntry[] = [
      {
        commandSequence: 1,
        opcode: JournalOpcode.SUBMIT_DISCREPANCY_DECISION,
        contextIndex: context,
        values: compactDiscrepancyDecision({
          commandType: "SUBMIT_DISCREPANCY_DECISION",
          action: "DELETE",
          causeCode: "TYPING_ERROR",
        }),
      },
      {
        commandSequence: 2,
        opcode: JournalOpcode.INVESTIGATE_DISCREPANCY,
        contextIndex: context,
        values: [],
      },
    ];
    const replayed = replayCommandJournal({
      snapshot: snapshot(journal, {
        INT_CORRECTION_RECORDED: { encodedValue: 1, attemptCount: 2 },
        INT_DISCREPANCY_INITIAL_SUBMITTED: {
          encodedValue: 1,
          attemptCount: 1,
        },
        INT_DISCREPANCY_MITIGATION_COMPLETE: {
          encodedValue: 1,
          attemptCount: 1,
        },
      }),
      initialDomain: initialSeededDomain(),
      scenario: coffeeScenario,
      configuration: GUIDED_PRESET,
      registries,
    });

    expect(replayed.runtime.attemptAuditEvents).toHaveLength(1);
    expect(replayed.runtime.acceptedEvents).toHaveLength(1);
    expect(replayed.runtime.acceptedEvents[0]).toMatchObject({
      kind: "SIMULATION_DECISION",
      decisionType: "INVESTIGATE_DISCREPANCY",
    });
    expect(
      replayed.consequentialDecisions.INT_CORRECTION_RECORDED,
    ).toEqual({ encodedValue: 1, attemptCount: 2 });
  });

  it("recovers from a pre-custody transport rejection with one persisted retry", async () => {
    const certified = await runUpTo("certified", { withSeed: true });
    const transportContext =
      coffeeScenario.runtime.commandContextByAction.RECORD_TRANSPORT;
    const custodyContext =
      coffeeScenario.runtime.commandContextByAction.TRANSFER_CUSTODY;
    if (transportContext === undefined || custodyContext === undefined) {
      throw new Error("Stage 4 trusted contexts are missing");
    }
    const journal: readonly CompactCommandJournalEntry[] = [
      {
        commandSequence: 1,
        opcode: JournalOpcode.RECORD_TRANSPORT,
        contextIndex: contextIndexById(coffeeScenario, transportContext),
        values: [],
      },
      {
        commandSequence: 2,
        opcode: JournalOpcode.TRANSFER_CUSTODY,
        contextIndex: contextIndexById(coffeeScenario, custodyContext),
        values: [0],
      },
      {
        commandSequence: 3,
        opcode: JournalOpcode.SEAL_PENDING_BLOCK,
        contextIndex: contextIndexById(coffeeScenario, custodyContext),
        values: [],
      },
      {
        commandSequence: 4,
        opcode: JournalOpcode.RECORD_TRANSPORT,
        contextIndex: contextIndexById(coffeeScenario, transportContext),
        values: [],
      },
      {
        commandSequence: 5,
        opcode: JournalOpcode.SEAL_PENDING_BLOCK,
        contextIndex: contextIndexById(coffeeScenario, transportContext),
        values: [],
      },
    ];
    const schema = tc3CodecSchema({
      configuration: GUIDED_PRESET,
      configurationHash: hashConfiguration(GUIDED_PRESET),
      scenario: coffeeScenario,
    });
    const persisted = decodeTc3Attempt(
      encodeTc3Attempt(snapshot(journal, {}), schema),
      schema,
    );
    const replayed = replayCommandJournal({
      snapshot: persisted,
      initialDomain: certified.getState(),
      scenario: coffeeScenario,
      configuration: GUIDED_PRESET,
      registries,
    });

    expect(replayed.runtime.attemptAuditEvents).toHaveLength(1);
    expect(
      replayed.runtime.attemptAuditEvents[0]?.submittedCommand.payload,
    ).toMatchObject({
      commandType: TransactionType.RECORD_TRANSPORT_CONDITION,
    });
    expect(
      Object.values(replayed.runtime.domain.transactionsById).find(
        (transaction) =>
          transaction.transactionType ===
          TransactionType.RECORD_TRANSPORT_CONDITION,
      )?.transactionStatus,
    ).toBe(TransactionStatus.COMMITTED);
  });

  it("regenerates an unauthorized recall and later authorized resubmission", async () => {
    const sold = await runUpTo("sold", { withSeed: true });
    const initialDomain = sold.getState();
    const stageId = ScenarioStageId.RECALL_AND_DEBRIEF;
    const retailerContext =
      coffeeScenario.runtime.initialContextByStage[stageId];
    const recallContext =
      coffeeScenario.runtime.commandContextByAction.RECALL_BATCH;
    if (recallContext === undefined) {
      throw new Error("Authorized recall context is missing");
    }
    const handoffIndex = coffeeScenario.runtime.roleHandoffs.findIndex(
      (handoff) =>
        handoff.stageId === stageId &&
        handoff.fromContextId === retailerContext &&
        handoff.toContextId === recallContext,
    );
    if (handoffIndex < 0) throw new Error("Standard recall handoff is missing");
    const recallCheck = coffeeScenario.stages
      .flatMap((stage) => stage.knowledgeChecks)
      .find((check) => check.knowledgeCheckId === "INT_RECALL_SCOPE");
    if (recallCheck === undefined) throw new Error("Recall scope check is missing");
    const selectedIndexes = recallCheck.correctOptionIds.map((optionId) => {
      const index = recallCheck.options.findIndex(
        (option) => option.optionId === optionId,
      );
      if (index < 0) throw new Error(`Recall option ${optionId} is missing`);
      return index;
    });
    const journal: readonly CompactCommandJournalEntry[] = [
      {
        commandSequence: 1,
        opcode: JournalOpcode.RECALL_BATCH,
        contextIndex: contextIndexById(coffeeScenario, retailerContext),
        values: [selectedIndexes],
      },
      {
        commandSequence: 2,
        opcode: JournalOpcode.ROLE_HANDOFF,
        contextIndex: contextIndexById(coffeeScenario, recallContext),
        values: [handoffIndex],
      },
      {
        commandSequence: 3,
        opcode: JournalOpcode.RECALL_BATCH,
        contextIndex: contextIndexById(coffeeScenario, recallContext),
        values: [selectedIndexes],
      },
      {
        commandSequence: 4,
        opcode: JournalOpcode.SEAL_PENDING_BLOCK,
        contextIndex: contextIndexById(coffeeScenario, recallContext),
        values: [],
      },
    ];
    const expectedDecisions = {
      INT_RECALL_COMMITTED: { encodedValue: 1, attemptCount: 2 },
      INT_RECALL_INITIAL_SUBMITTED: {
        encodedValue: 1,
        attemptCount: 1,
      },
      INT_RECALL_AUTHORIZATION_RESOLVED: {
        encodedValue: 1,
        attemptCount: 1,
      },
    };
    const replayed = replayCommandJournal({
      snapshot: snapshot(journal, expectedDecisions),
      initialDomain,
      scenario: coffeeScenario,
      configuration: GUIDED_PRESET,
      registries,
    });

    expect(replayed.runtime.attemptAuditEvents).toHaveLength(1);
    expect(replayed.runtime.attemptAuditEvents[0]).toMatchObject({
      actorId: coffeeScenario.runtime.trustedContexts.find(
        (context) => context.contextId === retailerContext,
      )?.actorId,
      submittedCommand: {
        payload: {
          commandType: TransactionType.RECALL_BATCH,
          selectedAssetIds: recallCheck.correctOptionIds,
        },
      },
    });
    const recallEvents = replayed.runtime.acceptedEvents.filter(
      (event) =>
        event.kind === "LEDGER_MUTATION" &&
        event.event.eventType === "BATCH_RECALLED",
    );
    expect(recallEvents).toHaveLength(1);
    expect(recallEvents[0]).toMatchObject({
      organizationId: coffeeScenario.runtime.trustedContexts.find(
        (context) => context.contextId === recallContext,
      )?.organizationId,
    });
    expect(
      Object.values(replayed.runtime.domain.transactionsById).filter(
        (transaction) =>
          transaction.transactionType === TransactionType.RECALL_BATCH,
      ),
    ).toHaveLength(1);
    expect(replayed.consequentialDecisions).toEqual(expectedDecisions);

    const report = buildCausalReport({
      scenario: coffeeScenario,
      journal,
      runtime: replayed.runtime,
      hintsUsed: [],
      configurationIdentifier: hashConfiguration(GUIDED_PRESET),
    });
    expect(
      report.explanations.map((explanation) => explanation.messageKey),
    ).toContain("report.causal.recallAuthorizedAfterHandoff");
    expect(
      buildCausalReport({
        scenario: coffeeScenario,
        journal,
        runtime: replayed.runtime,
        hintsUsed: [],
        configurationIdentifier: hashConfiguration(GUIDED_PRESET),
      }),
    ).toEqual(report);
    expect(
      replayed.runtime.attemptAuditEvents[0]?.submittedCommand.payload as RecallBatchCommand,
    ).toMatchObject({ selectedAssetIds: recallCheck.correctOptionIds });
  });
});
