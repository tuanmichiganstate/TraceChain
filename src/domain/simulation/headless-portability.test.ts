import { describe, expect, it } from "vitest";
import { GUIDED_PRESET } from "../../config/presets";
import { hashConfiguration } from "../../config/hash";
import {
  MemorySimulationPersistence,
} from "../../infrastructure/persistence/simulation-persistence";
import {
  decodeTc3Attempt,
  encodeTc3Attempt,
  type CompactCommandJournalEntry,
  type Tc3AttemptSnapshot,
} from "../../infrastructure/persistence/tc3-codec";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type {
  RecallBatchCommand,
  RecordCorrectionCommand,
  SupplyChainCommand,
} from "../commands/commands";
import { buildCausalReport } from "../reporting/causal-report";
import {
  encodeAnswer,
  deriveCorrectnessFromDecisions,
  type Answer,
} from "../scenario/answer-codec";
import { applyScenarioSeed } from "../scenario/seed-replay";
import { completedStages } from "../scenario/stage-completion";
import { calculateScore } from "../scoring/score-engine";
import {
  SCENARIO_STAGE_ORDER,
  ScenarioStageId,
  TransactionType,
} from "../types/enums";
import { KnowledgeCheckType } from "../types/scenario";
import type { DecisionRecord } from "../../infrastructure/persistence/state-codec";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import {
  commandJournalEntry,
  contextIndex,
  JournalOpcode,
  tc3CodecSchema,
} from "./command-journal";
import {
  compactCertificateDecision,
  compactDiscrepancyDecision,
} from "./consequential-decisions";
import { replayCommandJournal } from "./replay-journal";
import { coffeeCryptographicRuntime } from "../../scenarios/coffee-traceability/cryptographic-runtime";
import { NobleEd25519Provider } from "../../crypto/signatures/noble-ed25519-provider";

const scenario = coffeeScenario;
const configuration = GUIDED_PRESET;
const configurationHash = hashConfiguration(configuration);
const registries = {
  organizationsById: Object.fromEntries(
    scenario.organizations.map((organization) => [
      organization.organizationId,
      organization,
    ]),
  ),
  actorsById: Object.fromEntries(
    scenario.actors.map((actor) => [actor.actorId, actor]),
  ),
};

function correctAnswer(check: (typeof scenario.stages)[number]["knowledgeChecks"][number]): Answer {
  if (check.checkType === KnowledgeCheckType.CLASSIFICATION) {
    return {
      selectedOptionIds: [],
      categoryByItem: Object.fromEntries(
        check.options.map((option) => [
          option.optionId,
          option.categoryId as string,
        ]),
      ),
    };
  }
  return {
    selectedOptionIds: check.correctOptionIds,
    categoryByItem: {},
  };
}

function flawlessDecisions(): Record<string, DecisionRecord> {
  const decisions = Object.fromEntries(
    scenario.decisionIds.map((decisionId) => [
      decisionId,
      { encodedValue: 1, attemptCount: 1 },
    ]),
  );
  for (const stage of scenario.stages) {
    for (const check of stage.knowledgeChecks) {
      decisions[check.knowledgeCheckId] = {
        encodedValue: encodeAnswer(check, correctAnswer(check)),
        attemptCount: 1,
      };
    }
  }
  return decisions;
}

function flawlessJournal(): readonly CompactCommandJournalEntry[] {
  const journal: CompactCommandJournalEntry[] = [];
  let sequence = 1;

  const appendAction = (
    actionId: string,
    commandOverride: Partial<SupplyChainCommand> = {},
  ): string => {
    const contextId = scenario.runtime.commandContextByAction[actionId];
    const template = scenario.runtime.learnerCommandTemplates[actionId];
    if (contextId === undefined || template === undefined) {
      throw new Error(`Missing authored action "${actionId}"`);
    }
    const command = {
      ...structuredClone(template),
      ...commandOverride,
    } as SupplyChainCommand;
    journal.push(
      commandJournalEntry({
        commandSequence: sequence,
        actionId,
        command,
        contextId,
        scenario,
      }),
    );
    sequence += 1;
    return contextId;
  };

  const appendSeal = (contextId: string): void => {
    journal.push({
      commandSequence: sequence,
      opcode: JournalOpcode.SEAL_PENDING_BLOCK,
      contextIndex: contextIndex(scenario, contextId),
      values: [],
    });
    sequence += 1;
  };

  const appendActionAndSeal = (
    actionId: string,
    commandOverride: Partial<SupplyChainCommand> = {},
  ): void => {
    appendSeal(appendAction(actionId, commandOverride));
  };

  appendActionAndSeal("CREATE_BATCH");

  const certificateContext =
    scenario.runtime.initialContextByStage[
      ScenarioStageId.ANCHOR_CERTIFICATE
    ];
  journal.push({
    commandSequence: sequence,
    opcode: JournalOpcode.SUBMIT_CERTIFICATE_DECISION,
    contextIndex: contextIndex(scenario, certificateContext),
    values: compactCertificateDecision({
      commandType: "SUBMIT_CERTIFICATE_DECISION",
      certificateAssessment: "VALID",
      issuerAssessment: "RECOGNIZED_AUTHORIZED",
      storageChoice: "HASH_OFF_CHAIN",
      lotDisposition: "CONTINUE",
    }),
  });
  sequence += 1;
  appendActionAndSeal("ANCHOR_CERTIFICATE");
  appendActionAndSeal("ISSUE_CERTIFICATE");

  appendActionAndSeal("TRANSFER_CUSTODY");
  appendActionAndSeal("RECORD_TRANSPORT");
  appendActionAndSeal("RECEIVE_BATCH");
  appendActionAndSeal("PURCHASE_ON_RECEIPT");

  const discrepancyContext =
    scenario.runtime.initialContextByStage[
      ScenarioStageId.RECEIVE_AND_CORRECT
    ];
  journal.push({
    commandSequence: sequence,
    opcode: JournalOpcode.SUBMIT_DISCREPANCY_DECISION,
    contextIndex: contextIndex(scenario, discrepancyContext),
    values: compactDiscrepancyDecision({
      commandType: "SUBMIT_DISCREPANCY_DECISION",
      action: "APPEND_CORRECTION",
      causeCode: "TYPING_ERROR",
    }),
  });
  sequence += 1;
  appendActionAndSeal("RECORD_CORRECTION", {
    reason: "Verified append-only correction",
  } as Partial<RecordCorrectionCommand>);

  appendActionAndSeal("TRANSFORM_BATCH");
  appendActionAndSeal("PACKAGE_BATCH");
  appendActionAndSeal("TRANSFER_OWNERSHIP");
  appendActionAndSeal("DISPATCH_BATCH");

  const recallStage = ScenarioStageId.RECALL_AND_DEBRIEF;
  const initialRecallContext =
    scenario.runtime.initialContextByStage[recallStage];
  const authorizedRecallContext =
    scenario.runtime.commandContextByAction["RECALL_BATCH"];
  const handoffIndex = scenario.runtime.roleHandoffs.findIndex(
    (handoff) =>
      handoff.stageId === recallStage &&
      handoff.fromContextId === initialRecallContext &&
      handoff.toContextId === authorizedRecallContext,
  );
  if (authorizedRecallContext === undefined || handoffIndex < 0) {
    throw new Error("The authored recall-authority handoff is missing");
  }
  journal.push({
    commandSequence: sequence,
    opcode: JournalOpcode.ROLE_HANDOFF,
    contextIndex: contextIndex(scenario, authorizedRecallContext),
    values: [handoffIndex],
  });
  sequence += 1;

  const recallCheck = scenario.stages
    .flatMap((stage) => stage.knowledgeChecks)
    .find((check) => check.knowledgeCheckId === "INT_RECALL_SCOPE");
  if (recallCheck === undefined) throw new Error("Recall scope check is missing");
  appendActionAndSeal("RECALL_BATCH", {
    selectedAssetIds: recallCheck.correctOptionIds,
  } as Partial<RecallBatchCommand>);

  return journal;
}

describe("future-portable headless attempt", () => {
  it("loads, persists, replays, scores, and reports through reusable services only", async () => {
    const decisions = flawlessDecisions();
    const snapshot: Tc3AttemptSnapshot = {
      sessionId: "SES_HEADLESS_000001",
      currentStageId: ScenarioStageId.RECALL_AND_DEBRIEF,
      completedStageIds: SCENARIO_STAGE_ORDER,
      decisions,
      hintsUsed: [],
      journal: flawlessJournal(),
      isCompleted: true,
      isPassed: true,
    };
    const schema = tc3CodecSchema({
      configuration,
      configurationHash,
      scenario,
    });
    const persistence = new MemorySimulationPersistence();
    await persistence.persistAndCommit(encodeTc3Attempt(snapshot, schema));
    const stored = await persistence.load();
    if (stored === null) throw new Error("Headless session was not persisted");
    const restored = decodeTc3Attempt(stored, schema);
    const initialDomain = applyScenarioSeed(
      scenario,
      sha256Hex,
      registries,
    ).state;

    const replayed = await replayCommandJournal({
      snapshot: restored,
      initialDomain,
      scenario,
      configuration,
      configurationHash,
      cryptographicRuntime: coffeeCryptographicRuntime,
      signatureProvider: new NobleEd25519Provider(),
      registries,
    });
    const repeated = await replayCommandJournal({
      snapshot: restored,
      initialDomain,
      scenario,
      configuration,
      configurationHash,
      cryptographicRuntime: coffeeCryptographicRuntime,
      signatureProvider: new NobleEd25519Provider(),
      registries,
    });

    expect(replayed).toEqual(repeated);
    expect(replayed.runtime.acceptedEvents.length).toBeGreaterThan(13);
    expect(replayed.runtime.attemptAuditEvents).toEqual([]);
    expect(
      Object.values(replayed.runtime.domain.transactionsById).filter(
        (transaction) =>
          transaction.transactionType === TransactionType.RECALL_BATCH,
      ),
    ).toHaveLength(1);
    expect(
      completedStages(scenario, {
        state: replayed.runtime.domain,
        decisions: restored.decisions,
      }),
    ).toEqual(SCENARIO_STAGE_ORDER);

    const correctness = deriveCorrectnessFromDecisions(
      restored.decisions,
      scenario,
      replayed.runtime.domain,
    );
    const score = calculateScore(
      {
        decisions: restored.decisions,
        hintsUsed: restored.hintsUsed,
        correctness,
      },
      scenario,
    );
    expect(score.score.totalScore).toBe(100);

    const report = buildCausalReport({
      scenario,
      journal: restored.journal,
      runtime: replayed.runtime,
      hintsUsed: restored.hintsUsed,
      configurationIdentifier: configurationHash,
    });
    expect(
      report.explanations.map((explanation) => explanation.messageKey),
    ).toContain("report.causal.recallAuthorizedDirectly");
    expect(report.configurationIdentifier).toBe(configurationHash);
  });
});
