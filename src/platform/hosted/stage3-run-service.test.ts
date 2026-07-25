import packJson from "../../../scenario-packs/standard-coffee-stage3/tracechain.pack.json";
import { FixedClock, SequenceIdGenerator } from "../../domain/simulation/environment";
import { TransactionType } from "../../domain/types/enums";
import type { RecordCorrectionCommand } from "../../domain/commands/commands";
import type { RunEventV1 } from "../contracts/run-events";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import { CounterfactualBranchEngine } from "../runs/counterfactual-branch";
import { MemoryCounterfactualRunRepository } from "../runs/counterfactual-repository";
import {
  MemoryRunEventStore,
  type AppendRunEventsRequest,
  type AppendRunEventsResult,
  type RunEventStore,
} from "../runs/event-store";
import { publishScenarioPack } from "../scenario-packs/publication";
import { validateScenarioPack } from "../scenario-packs/validation";
import {
  HostedAuthorizationError,
  type ApplicationPrincipal,
} from "./access";
import {
  HostedRunCommandError,
  HostedStage3RunService,
} from "./stage3-run-service";
import type {
  CreateHostedStage3RunRequest,
  HostedStage3RunState,
  Stage3CaseVariant,
} from "./stage3-types";

const NOW = "2026-07-24T03:00:00.000Z";

const instructor: ApplicationPrincipal = {
  userId: "USER_INSTRUCTOR_001",
  email: "instructor@example.edu",
  roles: ["instructor"],
};
const learner: ApplicationPrincipal = {
  userId: "USER_LEARNER_001",
  email: "learner@example.edu",
  roles: ["learner"],
};
const otherLearner: ApplicationPrincipal = {
  userId: "USER_LEARNER_002",
  email: "other@example.edu",
  roles: ["learner"],
};
const rater: ApplicationPrincipal = {
  userId: "USER_RATER_001",
  email: "rater@example.edu",
  roles: ["rater"],
};

function publishedPack(): ScenarioPackV1 {
  const result = validateScenarioPack(structuredClone(packJson));
  if (!result.isValid) {
    throw new Error("Hosted Stage 3 tests require a valid scenario pack.");
  }
  return publishScenarioPack(result.pack, {
    publishedAt: NOW,
    publishedBy: instructor.userId,
  });
}

function createRequest(
  caseVariant: Stage3CaseVariant,
  runId = `RUN_${caseVariant.toUpperCase().replaceAll("-", "_")}`,
): CreateHostedStage3RunRequest {
  return {
    commandId: `COMMAND_CREATE_${runId}`,
    runId,
    assignmentId: "ASSIGNMENT_STAGE3_001",
    learnerUserId: learner.userId,
    mode: "standard",
    scenarioSeed: "hosted-stage3-seed-001",
    caseVariant,
  };
}

function serviceFor(
  store: RunEventStore,
  pack = publishedPack(),
): HostedStage3RunService {
  return new HostedStage3RunService(
    pack,
    store,
    new FixedClock(NOW),
    new SequenceIdGenerator(1),
  );
}

async function progressToDecision(
  service: HostedStage3RunService,
  caseVariant: Stage3CaseVariant,
  runId?: string,
): Promise<HostedStage3RunState> {
  const created = await service.createRun(
    instructor,
    createRequest(caseVariant, runId),
  );
  const inspected = await service.submit(learner, {
    commandType: "INSPECT_EVIDENCE",
    commandId: `COMMAND_INSPECT_${created.state.runId}`,
    runId: created.state.runId,
    expectedRunVersion: created.state.version,
    evidenceId: "EVID_CERTIFICATE_RECORD",
  });
  return inspected.state;
}

async function progressToTransaction(
  service: HostedStage3RunService,
  caseVariant: Stage3CaseVariant,
  runId?: string,
  options: {
    readonly useIncorrectDecision?: boolean;
  } = {},
): Promise<HostedStage3RunState> {
  const inspected = await progressToDecision(
    service,
    caseVariant,
    runId,
  );
  const decision = await service.submit(learner, {
    commandType: "SUBMIT_CERTIFICATE_DECISION",
    commandId: `COMMAND_DECIDE_${inspected.runId}`,
    runId: inspected.runId,
    expectedRunVersion: inspected.version,
    decision:
      options.useIncorrectDecision === true
        ? {
            certificateAssessment: "EXPIRED",
            issuerAssessment: "UNRECOGNIZED",
            storageChoice: "FULL_DOCUMENT_ON_CHAIN",
            lotDisposition: "HOLD",
          }
        : {
            certificateAssessment: "VALID",
            issuerAssessment: "RECOGNIZED_AUTHORIZED",
            storageChoice: "HASH_OFF_CHAIN",
            lotDisposition: "CONTINUE",
          },
    justification:
      "The certificate evidence, issuer status, storage choice, and lot disposition were reviewed together.",
    citedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
    citedPolicyIds: ["AUTH_ISSUE_CERTIFICATE"],
    confidenceRating: 4,
    adverseEventProbabilityPercent: 20,
  });
  const submitted = await service.submit(learner, {
    commandType: "SUBMIT_CERTIFICATE_TRANSACTION",
    commandId: `COMMAND_TRANSACTION_${decision.state.runId}`,
    runId: decision.state.runId,
    expectedRunVersion: decision.state.version,
  });
  return submitted.state;
}

async function progressThroughStage4(
  service: HostedStage3RunService,
  runId: string,
): Promise<HostedStage3RunState> {
  const certificate = await progressToTransaction(
    service,
    "authorized-certifier",
    runId,
  );
  const proposal = await service.submit(learner, {
    commandType: "CREATE_CUSTODY_TRANSFER_PROPOSAL",
    commandId: `COMMAND_CUSTODY_PROPOSAL_${runId}`,
    runId,
    expectedRunVersion: certificate.version,
    alsoTransfersOwnership: false,
  });
  const proposalId = proposal.state.pendingProposalId;
  if (proposalId === null) {
    throw new Error("Expected a pending custody proposal.");
  }
  const endorsed = await service.submit(learner, {
    commandType: "ENDORSE_CUSTODY_TRANSFER",
    commandId: `COMMAND_CUSTODY_ENDORSE_${runId}`,
    runId,
    expectedRunVersion: proposal.state.version,
    proposalId,
  });
  const committed = await service.submit(learner, {
    commandType: "COMMIT_CUSTODY_TRANSFER",
    commandId: `COMMAND_CUSTODY_COMMIT_${runId}`,
    runId,
    expectedRunVersion: endorsed.state.version,
    proposalId,
  });
  const transported = await service.submit(learner, {
    commandType: "RECORD_TRANSPORT_CONDITION",
    commandId: `COMMAND_TRANSPORT_${runId}`,
    runId,
    expectedRunVersion: committed.state.version,
  });
  return transported.state;
}

async function progressToStage5Decision(
  service: HostedStage3RunService,
  runId: string,
): Promise<HostedStage3RunState> {
  const transported = await progressThroughStage4(service, runId);
  const received = await service.submit(learner, {
    commandType: "RECEIVE_BATCH",
    commandId: `COMMAND_RECEIVE_${runId}`,
    runId,
    expectedRunVersion: transported.version,
  });
  const purchased = await service.submit(learner, {
    commandType: "PURCHASE_ON_RECEIPT",
    commandId: `COMMAND_PURCHASE_${runId}`,
    runId,
    expectedRunVersion: received.state.version,
  });
  return purchased.state;
}

async function progressThroughStage5(
  service: HostedStage3RunService,
  runId: string,
): Promise<HostedStage3RunState> {
  const ready = await progressToStage5Decision(service, runId);
  const decided = await service.submit(learner, {
    commandType: "SUBMIT_DISCREPANCY_DECISION",
    commandId: `COMMAND_DISCREPANCY_${runId}`,
    runId,
    expectedRunVersion: ready.version,
    decision: {
      action: "APPEND_CORRECTION",
      causeCode: "TYPING_ERROR",
    },
  });
  const proposed = await service.submit(learner, {
    commandType: "CREATE_CORRECTION_PROPOSAL",
    commandId: `COMMAND_CORRECTION_PROPOSAL_${runId}`,
    runId,
    expectedRunVersion: decided.state.version,
    reason:
      "The processor verified the committed manifest against the physical measurement.",
  });
  const proposalId = proposed.state.correctionPendingProposalId;
  if (proposalId === null) {
    throw new Error("Expected a pending correction proposal.");
  }
  const endorsed = await service.submit(learner, {
    commandType: "ENDORSE_CORRECTION",
    commandId: `COMMAND_CORRECTION_ENDORSE_${runId}`,
    runId,
    expectedRunVersion: proposed.state.version,
    proposalId,
  });
  const committed = await service.submit(learner, {
    commandType: "COMMIT_CORRECTION",
    commandId: `COMMAND_CORRECTION_COMMIT_${runId}`,
    runId,
    expectedRunVersion: endorsed.state.version,
    proposalId,
  });
  return committed.state;
}

async function progressThroughStage7(
  service: HostedStage3RunService,
  runId: string,
): Promise<HostedStage3RunState> {
  const corrected = await progressThroughStage5(service, runId);
  const transformed = await service.submit(learner, {
    commandType: "TRANSFORM_BATCH",
    commandId: `COMMAND_TRANSFORM_${runId}`,
    runId,
    expectedRunVersion: corrected.version,
  });
  const provenance = await service.submit(learner, {
    commandType: "SUBMIT_KNOWLEDGE_DECISION",
    commandId: `COMMAND_PROVENANCE_${runId}`,
    runId,
    expectedRunVersion: transformed.state.version,
    decisionId: "INT_TRANSFORMATION_PROVENANCE",
    selectedOptionId: "OPT_LINKED_TO_INPUT",
  });
  const packaged = await service.submit(learner, {
    commandType: "PACKAGE_BATCH",
    commandId: `COMMAND_PACKAGE_${runId}`,
    runId,
    expectedRunVersion: provenance.state.version,
  });
  const transferred = await service.submit(learner, {
    commandType: "TRANSFER_DISTRIBUTION_OWNERSHIP",
    commandId: `COMMAND_DISTRIBUTION_OWNERSHIP_${runId}`,
    runId,
    expectedRunVersion: packaged.state.version,
  });
  const dispatched = await service.submit(learner, {
    commandType: "DISPATCH_BATCH",
    commandId: `COMMAND_DISPATCH_${runId}`,
    runId,
    expectedRunVersion: transferred.state.version,
  });
  return dispatched.state;
}

class ReadOnlyEventStore implements RunEventStore {
  constructor(private readonly events: readonly RunEventV1[]) {}

  async append(
    _request: AppendRunEventsRequest,
  ): Promise<AppendRunEventsResult> {
    throw new Error("Read-only test event store.");
  }

  async load(_runId: string): Promise<readonly RunEventV1[]> {
    return this.events;
  }

  async loadThrough(
    _runId: string,
    throughSequenceNumber: number,
  ): Promise<readonly RunEventV1[]> {
    return this.events.slice(0, throughSequenceNumber);
  }
}

describe("server-authoritative hosted Stage 3 run", () => {
  it("runs a coffee alternative from the exact pre-decision fork without copying source events", async () => {
    const store = new MemoryRunEventStore();
    const pack = publishedPack();
    const service = new HostedStage3RunService(
      pack,
      store,
      new FixedClock(NOW),
      new SequenceIdGenerator(1),
      new CounterfactualBranchEngine(
        store,
        new MemoryCounterfactualRunRepository(),
      ),
    );
    const ready = await progressToDecision(
      service,
      "authorized-certifier",
      "RUN_STAGE3_COUNTERFACTUAL_SOURCE",
    );
    await service.submit(learner, {
      commandType: "SUBMIT_CERTIFICATE_DECISION",
      commandId: "COMMAND_STAGE3_COUNTERFACTUAL_ORIGINAL",
      runId: ready.runId,
      expectedRunVersion: ready.version,
      decision: {
        certificateAssessment: "VALID",
        issuerAssessment: "RECOGNIZED_AUTHORIZED",
        storageChoice: "HASH_OFF_CHAIN",
        lotDisposition: "CONTINUE",
      },
      justification: "The original path accepts the valid certificate.",
      citedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
      citedPolicyIds: ["AUTH_ISSUE_CERTIFICATE"],
      confidenceRating: 4,
      adverseEventProbabilityPercent: 20,
    });
    const sourceEvents = await store.load(ready.runId);
    const originalDecision = sourceEvents.find(
      (event) =>
        event.causationId ===
          "COMMAND_STAGE3_COUNTERFACTUAL_ORIGINAL" &&
        event.eventType === "DECISION_SUBMITTED",
    );
    if (originalDecision === undefined) {
      throw new Error("Expected the original certificate decision.");
    }
    await service.createCounterfactualBranch(learner, {
      branchRunId: "RUN_STAGE3_COUNTERFACTUAL_ALTERNATIVE",
      sourceRunId: ready.runId,
      forkSequenceNumber: originalDecision.sequenceNumber - 1,
      forkNodeId: "NODE_CERTIFICATE_DECISION",
      interventionId: "COMMAND_STAGE3_COUNTERFACTUAL_ALTERNATIVE",
      comparisonMode: "SINGLE_INTERVENTION",
      createdByUserId: learner.userId,
      createdAt: NOW,
    });

    const alternative = await service.submitCounterfactual(learner, {
      commandType: "SUBMIT_CERTIFICATE_DECISION",
      commandId: "COMMAND_STAGE3_COUNTERFACTUAL_ALTERNATIVE",
      runId: "RUN_STAGE3_COUNTERFACTUAL_ALTERNATIVE",
      expectedRunVersion: 0,
      decision: {
        certificateAssessment: "EXPIRED",
        issuerAssessment: "UNRECOGNIZED",
        storageChoice: "FULL_DOCUMENT_ON_CHAIN",
        lotDisposition: "HOLD",
      },
      justification:
        "Explore holding the lot after rejecting the certificate.",
      citedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
      citedPolicyIds: ["AUTH_ISSUE_CERTIFICATE"],
      confidenceRating: 3,
      adverseEventProbabilityPercent: 60,
    });

    expect(alternative.state.runId).toBe(
      "RUN_STAGE3_COUNTERFACTUAL_ALTERNATIVE",
    );
    expect(alternative.state.workflowStep).toBe(
      "certificate-transaction",
    );
    expect(alternative.state.decision?.decision).toMatchObject({
      certificateAssessment: "EXPIRED",
      lotDisposition: "HOLD",
    });
    expect((await store.load(ready.runId)).length).toBe(
      sourceEvents.length,
    );
    expect(
      await store.load("RUN_STAGE3_COUNTERFACTUAL_ALTERNATIVE"),
    ).toHaveLength(alternative.state.version);
  });

  it("allows a learner to create only their own run", async () => {
    const ownRun = await serviceFor(
      new MemoryRunEventStore(),
    ).createRun(
      learner,
      createRequest(
        "authorized-certifier",
        "RUN_LEARNER_SELF_START",
      ),
    );
    expect(ownRun.state.learnerUserId).toBe(learner.userId);

    await expect(
      serviceFor(new MemoryRunEventStore()).createRun(learner, {
        ...createRequest(
          "authorized-certifier",
          "RUN_LEARNER_CROSS_START",
        ),
        learnerUserId: otherLearner.userId,
      }),
    ).rejects.toMatchObject({
      code: "RUN_ACCESS_DENIED",
    });
  });

  it("creates and replays an assignment-scoped seed when the mode requires it", async () => {
    const {
      scenarioSeed: _scenarioSeed,
      ...requestWithoutSeed
    } = createRequest(
      "authorized-certifier",
      "RUN_TUTORIAL_GENERATED_SEED",
    );
    const request: CreateHostedStage3RunRequest = {
      ...requestWithoutSeed,
      mode: "tutorial",
    };
    const first = await serviceFor(
      new MemoryRunEventStore(),
    ).createRun(instructor, request);
    const second = await serviceFor(
      new MemoryRunEventStore(),
    ).createRun(instructor, request);

    expect(first.state.scenarioSeed).toMatch(
      /^generated:[a-f0-9]{64}$/u,
    );
    expect(second.state.scenarioSeed).toBe(first.state.scenarioSeed);
    expect(first.state.outcomeResolution.strategy).toBe("forced");
    expect(first.state.outcomeResolution).not.toHaveProperty("draw");
  });

  it("accepts commands before the authored deadline and audits the first command at the deadline", async () => {
    const pack = publishedPack();
    const beforeStore = new MemoryRunEventStore();
    const beforeRunId = "RUN_BEFORE_TIME_LIMIT";
    const beforeCreated = await new HostedStage3RunService(
      pack,
      beforeStore,
      new FixedClock(NOW),
      new SequenceIdGenerator(1),
    ).createRun(
      instructor,
      createRequest("authorized-certifier", beforeRunId),
    );
    const beforeDeadline = new HostedStage3RunService(
      pack,
      beforeStore,
      new FixedClock("2026-07-24T03:29:59.999Z"),
      new SequenceIdGenerator(100),
    );
    const accepted = await beforeDeadline.submit(learner, {
      commandType: "INSPECT_EVIDENCE",
      commandId: "COMMAND_BEFORE_TIME_LIMIT",
      runId: beforeRunId,
      expectedRunVersion: beforeCreated.state.version,
      evidenceId: "EVID_CERTIFICATE_RECORD",
    });
    expect(accepted.state.workflowStep).toBe("certificate-decision");

    const deadlineStore = new MemoryRunEventStore();
    const deadlineRunId = "RUN_AT_TIME_LIMIT";
    const deadlineCreated = await new HostedStage3RunService(
      pack,
      deadlineStore,
      new FixedClock(NOW),
      new SequenceIdGenerator(200),
    ).createRun(
      instructor,
      createRequest("authorized-certifier", deadlineRunId),
    );
    const atDeadline = new HostedStage3RunService(
      pack,
      deadlineStore,
      new FixedClock("2026-07-24T03:30:00.000Z"),
      new SequenceIdGenerator(300),
    );
    const rejected = await atDeadline.submit(learner, {
      commandType: "INSPECT_EVIDENCE",
      commandId: "COMMAND_AT_TIME_LIMIT",
      runId: deadlineRunId,
      expectedRunVersion: deadlineCreated.state.version,
      evidenceId: "EVID_CERTIFICATE_RECORD",
    });
    const deadlineEvents = await deadlineStore.load(deadlineRunId);
    const projection = await atDeadline.learnerProjection(
      learner,
      deadlineRunId,
    );

    expect(rejected.state.workflowStep).toBe(
      "certificate-evidence",
    );
    expect(rejected.state.inspectedEvidenceIds).toEqual([]);
    expect(
      rejected.state.simulation.domain.transactionOrder,
    ).toEqual(
      deadlineCreated.state.simulation.domain.transactionOrder,
    );
    expect(
      rejected.state.simulation.attemptAuditEvents,
    ).toEqual(deadlineCreated.state.simulation.attemptAuditEvents);
    expect(deadlineEvents.at(-1)).toMatchObject({
      eventType: "RUN_TIME_LIMIT_EXCEEDED",
      causationId: "COMMAND_AT_TIME_LIMIT",
      payload: {
        attemptedCommandType: "INSPECT_EVIDENCE",
        timeLimitMinutes: 30,
        deadlineUtc: "2026-07-24T03:30:00.000Z",
      },
    });
    expect(projection.timing).toEqual({
      status: "expired",
      startedAt: NOW,
      observedAt: "2026-07-24T03:30:00.000Z",
      deadline: "2026-07-24T03:30:00.000Z",
      timeLimitMinutes: 30,
    });
    expect(projection.workflowState.permittedActionIds).toEqual([
      "INSPECT_EVIDENCE",
    ]);
    expect(
      await atDeadline.loadState(deadlineRunId),
    ).toEqual(rejected.state);
    const repeated = await atDeadline.submit(learner, {
      commandType: "INSPECT_EVIDENCE",
      commandId: "COMMAND_AT_TIME_LIMIT",
      runId: deadlineRunId,
      expectedRunVersion: deadlineCreated.state.version,
      evidenceId: "EVID_CERTIFICATE_RECORD",
    });
    expect(repeated.wasIdempotentReplay).toBe(true);
    expect(await deadlineStore.load(deadlineRunId)).toHaveLength(
      deadlineEvents.length,
    );
    await expect(
      atDeadline.submit(learner, {
        commandType: "INSPECT_EVIDENCE",
        commandId: "COMMAND_AFTER_TIME_LIMIT",
        runId: deadlineRunId,
        expectedRunVersion: rejected.state.version,
        evidenceId: "EVID_CERTIFICATE_RECORD",
      }),
    ).rejects.toMatchObject({
      code: "RUN_TIME_LIMIT_EXCEEDED",
    });
    expect(await deadlineStore.load(deadlineRunId)).toHaveLength(
      deadlineEvents.length,
    );
  });

  it("keeps an authored unlimited mode open after the bounded modes expire", async () => {
    const pack = publishedPack();
    const store = new MemoryRunEventStore();
    const runId = "RUN_UNLIMITED_SANDBOX";
    const created = await new HostedStage3RunService(
      pack,
      store,
      new FixedClock(NOW),
      new SequenceIdGenerator(400),
    ).createRun(instructor, {
      ...createRequest("authorized-certifier", runId),
      mode: "sandbox",
    });
    const muchLater = new HostedStage3RunService(
      pack,
      store,
      new FixedClock("2027-07-24T03:00:00.000Z"),
      new SequenceIdGenerator(500),
    );
    const accepted = await muchLater.submit(learner, {
      commandType: "INSPECT_EVIDENCE",
      commandId: "COMMAND_UNLIMITED_INSPECT",
      runId,
      expectedRunVersion: created.state.version,
      evidenceId: "EVID_CERTIFICATE_RECORD",
    });
    const projection = await muchLater.learnerProjection(
      learner,
      runId,
    );

    expect(accepted.state.workflowStep).toBe(
      "certificate-decision",
    );
    expect(projection.timing).toEqual({
      status: "unlimited",
      startedAt: NOW,
      observedAt: "2027-07-24T03:00:00.000Z",
    });
  });

  it("records and replays a deterministic probabilistic outcome in sandbox mode", async () => {
    const firstStore = new MemoryRunEventStore();
    const firstRequest = {
      ...createRequest(
        "authorized-certifier",
        "RUN_SANDBOX_OUTCOME_001",
      ),
      mode: "sandbox" as const,
      scenarioSeed: "sandbox-outcome-seed-001",
    };
    const first = await serviceFor(firstStore).createRun(
      instructor,
      firstRequest,
    );
    const firstEvents = await firstStore.load(first.state.runId);

    expect(first.state.modeConfiguration).toMatchObject({
      mode: "sandbox",
      allowRetry: true,
      feedbackTiming: "immediate",
      outcomeStrategy: "probabilistic",
    });
    expect(first.state.outcomeEvidenceStatus).toBe("recorded");
    expect(first.state.outcomeResolution.draw).toBeGreaterThanOrEqual(0);
    expect(first.state.outcomeResolution.draw).toBeLessThan(1);
    expect(firstEvents.map((event) => event.eventType)).toEqual([
      "RUN_CREATED",
      "RANDOM_DRAW_MADE",
      "OUTCOME_REALIZED",
      "EVIDENCE_RELEASED",
    ]);

    const secondStore = new MemoryRunEventStore();
    const second = await serviceFor(secondStore).createRun(
      instructor,
      {
        ...firstRequest,
        commandId: "COMMAND_CREATE_RUN_SANDBOX_OUTCOME_002",
        runId: "RUN_SANDBOX_OUTCOME_002",
      },
    );
    expect(second.state.outcomeResolution).toEqual(
      first.state.outcomeResolution,
    );

    const replayed = await serviceFor(
      new ReadOnlyEventStore(firstEvents),
    ).loadState(first.state.runId);
    expect(replayed).toEqual(first.state);
    expect(
      JSON.stringify(
        await serviceFor(firstStore).learnerProjection(
          learner,
          first.state.runId,
        ),
      ),
    ).not.toContain("sandbox-outcome-seed-001");
  });

  it("runs the authorized path with trusted context and exact replay", async () => {
    const store = new MemoryRunEventStore();
    const pack = publishedPack();
    const service = serviceFor(store, pack);
    const initial = await service.createRun(
      instructor,
      createRequest("authorized-certifier"),
    );
    const initialLedgerCount =
      initial.state.simulation.domain.transactionOrder.length;

    const final = await progressToTransaction(
      serviceFor(new MemoryRunEventStore(), pack),
      "authorized-certifier",
      "RUN_AUTHORIZED_SEPARATE",
    );
    expect(final.status).toBe("active");
    expect(final.workflowStep).toBe("custody-proposal");
    expect(final.activeTrustedContext.contextId).toBe("CTX_PRODUCER");
    expect(final.version).toBe(10);
    expect(final.transactionStatus).toBe("committed");
    expect(final.transactions).toHaveLength(2);
    expect(final.transactions.every((item) => item.isAccepted)).toBe(true);
    expect(
      final.simulation.domain.transactionOrder.length,
    ).toBe(initialLedgerCount + 2);
    expect(
      final.simulation.acceptedEvents.filter(
        (event) => event.kind === "LEDGER_MUTATION",
      ),
    ).toHaveLength(2);
    expect(final.simulation.attemptAuditEvents).toHaveLength(0);

    const transactionOutcome =
      final.simulation.outcomesByCommandId[
        `COMMAND_TRANSACTION_${final.runId}_ISSUE_CERTIFICATE`
      ];
    expect(transactionOutcome?.signatureEvidence).toMatchObject({
      signatureValid: true,
      authorization: {
        recognizedIdentity: true,
        authorized: true,
        contextMatches: true,
      },
    });

    const finalStore = new MemoryRunEventStore();
    const finalService = serviceFor(finalStore, pack);
    const persisted = await progressToTransaction(
      finalService,
      "authorized-certifier",
      "RUN_EXACT_REPLAY",
    );
    const reloaded = await serviceFor(
      finalStore,
      pack,
    ).loadState(persisted.runId);
    expect(reloaded).toEqual(persisted);
    expect(
      reloaded.simulation.outcomesByCommandId[
        `COMMAND_TRANSACTION_${reloaded.runId}_ISSUE_CERTIFICATE`
      ]?.signatureEvidence?.signature.signatureBase64Url,
    ).toBe(
      persisted.simulation.outcomesByCommandId[
        `COMMAND_TRANSACTION_${persisted.runId}_ISSUE_CERTIFICATE`
      ]?.signatureEvidence?.signature.signatureBase64Url,
    );
    expect(
      (await finalStore.load(persisted.runId)).find(
        (event) =>
          event.eventType === "COMPETENCY_EVIDENCE_RECORDED",
      )?.payload,
    ).toMatchObject({
      evidenceRuleId: "RULE_CERTIFICATE_INSPECTED",
      evidenceRuleVersion: "1.0.0",
    });
  });

  it("rejects competency evidence when its authored rule does not match the source event", async () => {
    const draft = structuredClone(packJson);
    const inspectionRule = draft.evidenceRules.find(
      (rule) =>
        rule.evidenceRuleId === "RULE_CERTIFICATE_INSPECTED",
    );
    if (inspectionRule === undefined) {
      throw new Error("Expected the certificate inspection rule.");
    }
    inspectionRule.expectedValue = "EVID_OTHER_RECORD";
    const validated = validateScenarioPack(draft);
    if (!validated.isValid) {
      throw new Error("The deliberately non-matching pack must validate.");
    }
    const pack = publishScenarioPack(validated.pack, {
      publishedAt: NOW,
      publishedBy: instructor.userId,
    });
    const store = new MemoryRunEventStore();
    const service = serviceFor(store, pack);
    const created = await service.createRun(
      instructor,
      createRequest(
        "authorized-certifier",
        "RUN_NON_MATCHING_EVIDENCE_RULE",
      ),
    );

    await expect(
      service.submit(learner, {
        commandType: "INSPECT_EVIDENCE",
        commandId: "COMMAND_NON_MATCHING_EVIDENCE_RULE",
        runId: created.state.runId,
        expectedRunVersion: created.state.version,
        evidenceId: "EVID_CERTIFICATE_RECORD",
      }),
    ).rejects.toMatchObject({ code: "PACK_CONTRACT_MISMATCH" });
    expect(await store.load(created.state.runId)).toHaveLength(2);
  });

  it("continues the authorized run through endorsed custody and transport", async () => {
    const store = new MemoryRunEventStore();
    const service = serviceFor(store);
    const certificate = await progressToTransaction(
      service,
      "authorized-certifier",
      "RUN_STAGE4",
    );
    const ledgerBeforeProposal =
      certificate.simulation.domain.transactionOrder.length;

    const proposal = await service.submit(learner, {
      commandType: "CREATE_CUSTODY_TRANSFER_PROPOSAL",
      commandId: "COMMAND_STAGE4_PROPOSAL",
      runId: certificate.runId,
      expectedRunVersion: certificate.version,
      alsoTransfersOwnership: false,
    });
    expect(proposal.state.custodyStatus).toBe("awaiting-endorsement");
    expect(proposal.state.simulation.domain.transactionOrder).toHaveLength(
      ledgerBeforeProposal,
    );

    const proposalId = proposal.state.pendingProposalId;
    if (proposalId === null) {
      throw new Error("Expected a pending Stage 4 proposal.");
    }
    const endorsed = await service.submit(learner, {
      commandType: "ENDORSE_CUSTODY_TRANSFER",
      commandId: "COMMAND_STAGE4_ENDORSE",
      runId: certificate.runId,
      expectedRunVersion: proposal.state.version,
      proposalId,
    });
    expect(endorsed.state.custodyStatus).toBe("policy-satisfied");
    expect(endorsed.state.activeTrustedContext.contextId).toBe(
      "CTX_LOGISTICS",
    );
    expect(endorsed.state.simulation.domain.transactionOrder).toHaveLength(
      ledgerBeforeProposal,
    );

    const resumed = await serviceFor(store).loadState(certificate.runId);
    expect(resumed).toEqual(endorsed.state);

    const completeStore = new MemoryRunEventStore();
    const completeService = serviceFor(completeStore);
    const final = await progressThroughStage4(
      completeService,
      "RUN_STAGE4_COMPLETE",
    );
    expect(final.status).toBe("active");
    expect(final.custodyStatus).toBe("committed");
    expect(final.transportStatus).toBe("committed");
    expect(final.workflowStep).toBe("receipt-transaction");
    expect(
      Object.values(final.simulation.domain.transactionsById).filter(
        (transaction) =>
          transaction.transactionType === TransactionType.TRANSFER_CUSTODY,
      ),
    ).toHaveLength(1);
    expect(
      Object.values(final.simulation.domain.transactionsById).filter(
        (transaction) =>
          transaction.transactionType ===
          TransactionType.RECORD_TRANSPORT_CONDITION,
      ),
    ).toHaveLength(1);
    const sourceBatch =
      final.simulation.domain.assetsById["BAT_GREEN_COFFEE_001"];
    expect(sourceBatch).toMatchObject({
      currentOwnerId: "ORG_PRODUCER_COOP",
      currentCustodianId: "ORG_LOGISTICS_PROVIDER",
    });
    expect(
      final.competencyEvidence.map(
        (evidence) => evidence.evidenceRuleId,
      ),
    ).toEqual(
      expect.arrayContaining([
        "RULE_CUSTODY_ENDORSEMENT_SATISFIED",
        "RULE_TRANSPORT_CONDITION_RECORDED",
      ]),
    );
    const projection = await completeService.learnerProjection(
      learner,
      final.runId,
    );
    expect(projection.roleId).toBe("PROCESSING_MANAGER");
    expect(JSON.stringify(projection)).not.toContain(final.scenarioSeed);
    const timeline = await completeService.instructorTimeline(
      instructor,
      final.runId,
    );
    expect(
      timeline.find(
        (event) =>
          event.eventType === "ENDORSEMENT_PROPOSAL_CREATED",
      ),
    ).toMatchObject({
      organizationId: "ORG_PRODUCER_COOP",
      roleId: "PRODUCER_MANAGER",
    });
    expect(
      timeline.find(
        (event) => event.eventType === "ENDORSEMENT_RECORDED",
      ),
    ).toMatchObject({
      organizationId: "ORG_LOGISTICS_PROVIDER",
      roleId: "LOGISTICS_COORDINATOR",
    });
  });

  it("hands the transported batch to the processor for Stage 5 receipt", async () => {
    const store = new MemoryRunEventStore();
    const service = serviceFor(store);
    const transported = await progressThroughStage4(
      service,
      "RUN_STAGE5_ENTRY",
    );

    expect(transported.status).toBe("active");
    expect(transported.workflowStep).toBe("receipt-transaction");
    expect(transported.activeTrustedContext.contextId).toBe(
      "CTX_PROCESSOR",
    );
    const projection = await service.learnerProjection(
      learner,
      transported.runId,
    );
    expect(projection.workflowState.permittedActionIds).toEqual([
      "RECEIVE_BATCH",
    ]);
  });

  it("retains a rejected discrepancy attempt and completes one endorsed append-only correction", async () => {
    const store = new MemoryRunEventStore();
    const service = serviceFor(store);
    const ready = await progressToStage5Decision(
      service,
      "RUN_STAGE5_REPAIR",
    );
    expect(ready.workflowStep).toBe("discrepancy-decision");
    expect(ready.receiptStatus).toBe("committed");
    expect(ready.ownershipStatus).toBe("committed");
    expect(
      ready.simulation.domain.assetsById["BAT_GREEN_COFFEE_001"],
    ).toMatchObject({
      currentOwnerId: "ORG_COFFEE_PROCESSOR",
      currentCustodianId: "ORG_COFFEE_PROCESSOR",
    });

    const ledgerBeforeDecision =
      ready.simulation.domain.transactionOrder.length;
    const auditBeforeDecision =
      ready.simulation.attemptAuditEvents.length;
    const rejected = await service.submit(learner, {
      commandType: "SUBMIT_DISCREPANCY_DECISION",
      commandId: "COMMAND_STAGE5_REJECTED_DECISION",
      runId: ready.runId,
      expectedRunVersion: ready.version,
      decision: {
        action: "OVERWRITE",
        causeCode: "TYPING_ERROR",
      },
    });
    expect(rejected.state.workflowStep).toBe(
      "discrepancy-mitigation",
    );
    expect(rejected.state.discrepancyDecision).toMatchObject({
      isRejectedAttempt: true,
      decision: {
        action: "OVERWRITE",
        causeCode: "TYPING_ERROR",
      },
    });
    expect(
      rejected.state.simulation.domain.transactionOrder,
    ).toHaveLength(ledgerBeforeDecision);
    expect(
      rejected.state.simulation.attemptAuditEvents,
    ).toHaveLength(auditBeforeDecision + 1);

    const mitigated = await service.submit(learner, {
      commandType: "INVESTIGATE_DISCREPANCY",
      commandId: "COMMAND_STAGE5_INVESTIGATE",
      runId: ready.runId,
      expectedRunVersion: rejected.state.version,
    });
    expect(mitigated.state.workflowStep).toBe(
      "correction-proposal",
    );
    expect(mitigated.state.discrepancyMitigationStatus).toBe(
      "completed",
    );

    const assetVersionBeforeCorrection =
      mitigated.state.simulation.domain.assetsById[
        "BAT_GREEN_COFFEE_001"
      ]?.stateVersion;
    const proposed = await service.submit(learner, {
      commandType: "CREATE_CORRECTION_PROPOSAL",
      commandId: "COMMAND_STAGE5_CORRECTION_PROPOSAL",
      runId: ready.runId,
      expectedRunVersion: mitigated.state.version,
      reason:
        "The processor investigated the committed manifest and confirmed a typing error.",
    });
    expect(proposed.state.correctionStatus).toBe(
      "awaiting-endorsement",
    );
    expect(
      proposed.state.simulation.domain.transactionOrder,
    ).toHaveLength(ledgerBeforeDecision);
    const proposalId = proposed.state.correctionPendingProposalId;
    if (proposalId === null) {
      throw new Error("Expected a pending correction proposal.");
    }

    const endorsed = await service.submit(learner, {
      commandType: "ENDORSE_CORRECTION",
      commandId: "COMMAND_STAGE5_CORRECTION_ENDORSE",
      runId: ready.runId,
      expectedRunVersion: proposed.state.version,
      proposalId,
    });
    expect(endorsed.state.correctionStatus).toBe(
      "policy-satisfied",
    );
    expect(endorsed.state.activeTrustedContext.contextId).toBe(
      "CTX_PRODUCER",
    );
    expect(
      endorsed.state.simulation.domain.transactionOrder,
    ).toHaveLength(ledgerBeforeDecision);
    expect(await serviceFor(store).loadState(ready.runId)).toEqual(
      endorsed.state,
    );

    const corrected = await service.submit(learner, {
      commandType: "COMMIT_CORRECTION",
      commandId: "COMMAND_STAGE5_CORRECTION_COMMIT",
      runId: ready.runId,
      expectedRunVersion: endorsed.state.version,
      proposalId,
    });
    expect(corrected.state.status).toBe("active");
    expect(corrected.state.workflowStep).toBe(
      "transformation-transaction",
    );
    expect(corrected.state.correctionStatus).toBe("committed");
    expect(
      Object.values(
        corrected.state.simulation.domain.transactionsById,
      ).filter(
        (transaction) =>
          transaction.transactionType ===
          TransactionType.RECORD_CORRECTION,
      ),
    ).toHaveLength(1);
    expect(
      corrected.state.simulation.domain.assetsById[
        "BAT_GREEN_COFFEE_001"
      ]?.stateVersion,
    ).toBe(assetVersionBeforeCorrection);
    const correction = Object.values(
      corrected.state.simulation.domain.transactionsById,
    ).find(
      (transaction) =>
        transaction.transactionType ===
        TransactionType.RECORD_CORRECTION,
    );
    expect(
      correction?.commandPayload as RecordCorrectionCommand,
    ).toMatchObject({
      incorrectValue: { amount: 1_000 },
      correctedValue: { amount: 100 },
    });
    expect(
      corrected.state.competencyEvidence.map(
        (evidence) => evidence.evidenceRuleId,
      ),
    ).toEqual(
      expect.arrayContaining([
        "RULE_DISCREPANCY_REJECTED_ATTEMPT",
        "RULE_CORRECTION_ENDORSEMENT_SATISFIED",
        "RULE_APPEND_ONLY_CORRECTION_COMMITTED",
      ]),
    );
    const timeline = await service.instructorTimeline(
      instructor,
      ready.runId,
    );
    expect(
      timeline.find(
        (event) => event.eventType === "DECISION_REJECTED",
      ),
    ).toMatchObject({
      organizationId: "ORG_COFFEE_PROCESSOR",
      roleId: "PROCESSING_MANAGER",
    });
    expect(
      timeline.find(
        (event) =>
          event.eventType === "ENDORSEMENT_RECORDED" &&
          event.payload.actionId === "RECORD_CORRECTION",
      ),
    ).toMatchObject({
      organizationId: "ORG_PRODUCER_COOP",
      roleId: "PRODUCER_MANAGER",
    });
  });

  it("records exactly one sound discrepancy decision and skips mitigation", async () => {
    const store = new MemoryRunEventStore();
    const service = serviceFor(store);
    const ready = await progressToStage5Decision(
      service,
      "RUN_STAGE5_SOUND_DECISION",
    );
    const command = {
      commandType: "SUBMIT_DISCREPANCY_DECISION" as const,
      commandId: "COMMAND_STAGE5_SOUND_DECISION",
      runId: ready.runId,
      expectedRunVersion: ready.version,
      decision: {
        action: "APPEND_CORRECTION" as const,
        causeCode: "TYPING_ERROR" as const,
      },
    };
    const submitted = await service.submit(learner, command);
    expect(submitted.state.workflowStep).toBe(
      "correction-proposal",
    );
    expect(submitted.state.discrepancyMitigationStatus).toBe(
      "not-required",
    );
    expect(submitted.state.discrepancyDecision).toMatchObject({
      isRejectedAttempt: false,
      isScorableCorrect: true,
    });
    const projection = await service.learnerProjection(
      learner,
      ready.runId,
    );
    expect(
      projection.workflowState.completedNodeIds,
    ).not.toContain("discrepancy-mitigation");
    const duplicate = await service.submit(learner, command);
    expect(duplicate.wasIdempotentReplay).toBe(true);
    expect(duplicate.state).toEqual(submitted.state);
    await expect(
      service.submit(learner, {
        ...command,
        commandId: "COMMAND_STAGE5_SECOND_DECISION",
        expectedRunVersion: submitted.state.version,
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_PRECONDITION_FAILED",
    });
  });

  it("continues the corrected batch through transformation and distribution", async () => {
    const store = new MemoryRunEventStore();
    const service = serviceFor(store);
    const corrected = await progressThroughStage5(
      service,
      "RUN_STAGE6_ENTRY",
    );

    expect(corrected.status).toBe("active");
    expect(corrected.workflowStep).toBe(
      "transformation-transaction",
    );
    expect(corrected.activeTrustedContext.contextId).toBe(
      "CTX_PROCESSOR",
    );

    const transformed = await service.submit(learner, {
      commandType: "TRANSFORM_BATCH",
      commandId: "COMMAND_STAGE6_TRANSFORM",
      runId: corrected.runId,
      expectedRunVersion: corrected.version,
    });
    expect(transformed.state.workflowStep).toBe(
      "transformation-knowledge",
    );
    expect(transformed.state.transformationStatus).toBe("committed");
    expect(
      transformed.state.simulation.domain.assetsById[
        "BAT_ROASTED_COFFEE_001"
      ],
    ).toMatchObject({
      quantity: 82,
      parentAssetIds: ["BAT_GREEN_COFFEE_001"],
    });
    expect(
      transformed.state.simulation.domain.provenanceEdges,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceAssetId: "BAT_GREEN_COFFEE_001",
          targetAssetId: "BAT_ROASTED_COFFEE_001",
        }),
      ]),
    );

    const knowledge = await service.submit(learner, {
      commandType: "SUBMIT_KNOWLEDGE_DECISION",
      commandId: "COMMAND_STAGE6_PROVENANCE",
      runId: corrected.runId,
      expectedRunVersion: transformed.state.version,
      decisionId: "INT_TRANSFORMATION_PROVENANCE",
      selectedOptionId: "OPT_LINKED_TO_INPUT",
    });
    expect(knowledge.state.workflowStep).toBe(
      "packaging-transaction",
    );
    expect(
      knowledge.state.knowledgeDecisions[
        "INT_TRANSFORMATION_PROVENANCE"
      ],
    ).toMatchObject({
      selectedOptionId: "OPT_LINKED_TO_INPUT",
      isAuthoredCorrect: true,
    });
    const duplicateKnowledge = await service.submit(learner, {
      commandType: "SUBMIT_KNOWLEDGE_DECISION",
      commandId: "COMMAND_STAGE6_PROVENANCE",
      runId: corrected.runId,
      expectedRunVersion: transformed.state.version,
      decisionId: "INT_TRANSFORMATION_PROVENANCE",
      selectedOptionId: "OPT_LINKED_TO_INPUT",
    });
    expect(duplicateKnowledge.wasIdempotentReplay).toBe(true);
    await expect(
      service.submit(learner, {
        commandType: "SUBMIT_KNOWLEDGE_DECISION",
        commandId: "COMMAND_STAGE6_SECOND_PROVENANCE",
        runId: corrected.runId,
        expectedRunVersion: knowledge.state.version,
        decisionId: "INT_TRANSFORMATION_PROVENANCE",
        selectedOptionId: "OPT_NEW_INDEPENDENT_BATCH",
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_PRECONDITION_FAILED",
    });
    const knowledgeProjection = await service.learnerProjection(
      learner,
      corrected.runId,
    );
    expect(JSON.stringify(knowledgeProjection)).not.toContain(
      "isAuthoredCorrect",
    );

    const packaged = await service.submit(learner, {
      commandType: "PACKAGE_BATCH",
      commandId: "COMMAND_STAGE7_PACKAGE",
      runId: corrected.runId,
      expectedRunVersion: knowledge.state.version,
    });
    expect(packaged.state.workflowStep).toBe(
      "distribution-ownership-transaction",
    );
    expect(
      packaged.state.simulation.domain.assetsById[
        "BAT_PACKAGED_COFFEE_001"
      ],
    ).toMatchObject({
      quantity: 820,
      parentAssetIds: ["BAT_ROASTED_COFFEE_001"],
    });

    const transferred = await service.submit(learner, {
      commandType: "TRANSFER_DISTRIBUTION_OWNERSHIP",
      commandId: "COMMAND_STAGE7_TRANSFER_OWNERSHIP",
      runId: corrected.runId,
      expectedRunVersion: packaged.state.version,
    });
    expect(transferred.state.workflowStep).toBe(
      "dispatch-transaction",
    );
    expect(transferred.state.activeTrustedContext.contextId).toBe(
      "CTX_DISTRIBUTOR",
    );

    const dispatched = await service.submit(learner, {
      commandType: "DISPATCH_BATCH",
      commandId: "COMMAND_STAGE7_DISPATCH",
      runId: corrected.runId,
      expectedRunVersion: transferred.state.version,
    });
    expect(dispatched.state.status).toBe("active");
    expect(dispatched.state.workflowStep).toBe(
      "tamper-demonstration",
    );
    expect(dispatched.state.dispatchStatus).toBe("committed");
    expect(
      dispatched.state.simulation.domain.assetsById[
        "BAT_PACKAGED_COFFEE_001"
      ],
    ).toMatchObject({
      currentOwnerId: "ORG_RETAILER",
      currentCustodianId: "ORG_RETAILER",
    });
    expect(
      dispatched.state.competencyEvidence.map(
        (evidence) => evidence.evidenceRuleId,
      ),
    ).toEqual(
      expect.arrayContaining([
        "RULE_TRANSFORMATION_PROVENANCE_CREATED",
        "RULE_TRANSFORMATION_PROVENANCE_RECOGNIZED",
        "RULE_RETAIL_DISPATCH_RECORDED",
      ]),
    );
    expect(await serviceFor(store).loadState(corrected.runId)).toEqual(
      dispatched.state,
    );
  }, 10_000);

  it("continues the retail lot into the Stage 8 integrity activity", async () => {
    const service = serviceFor(new MemoryRunEventStore());
    const distributed = await progressThroughStage7(
      service,
      "RUN_STAGE8_ENTRY",
    );

    expect(distributed.status).toBe("active");
    expect(distributed.workflowStep).toBe("tamper-demonstration");
    expect(distributed.activeTrustedContext.contextId).toBe(
      "CTX_RETAILER",
    );
  });

  it("retains an unauthorized recall attempt before regulator resubmission", async () => {
    const store = new MemoryRunEventStore();
    const service = serviceFor(store);
    const distributed = await progressThroughStage7(
      service,
      "RUN_STAGE8_AND_RECALL",
    );
    const domainBeforeTamper = structuredClone(
      distributed.simulation.domain,
    );
    expect(distributed.simulation.domain.blockOrder.length).toBeGreaterThan(
      1,
    );

    const demonstrated = await service.submit(learner, {
      commandType: "RUN_TAMPER_DEMONSTRATION",
      commandId: "COMMAND_STAGE8_TAMPER",
      runId: distributed.runId,
      expectedRunVersion: distributed.version,
    });
    expect(demonstrated.state.workflowStep).toBe("tamper-knowledge");
    expect(demonstrated.state.tamperDemonstration).toMatchObject({
      beforeValid: true,
      realLedgerIntact: true,
      tamperedQuantity: 1,
    });
    expect(
      demonstrated.state.tamperDemonstration?.cascadingBlockIds
        .length,
    ).toBeGreaterThan(0);
    expect(demonstrated.state.simulation.domain).toEqual(
      domainBeforeTamper,
    );

    const tamperDecision = await service.submit(learner, {
      commandType: "SUBMIT_KNOWLEDGE_DECISION",
      commandId: "COMMAND_STAGE8_TAMPER_DECISION",
      runId: distributed.runId,
      expectedRunVersion: demonstrated.state.version,
      decisionId: "INT_TAMPER_DEMONSTRATION",
      selectedOptionId: "OPT_MAKES_EDIT_DETECTABLE",
    });
    expect(tamperDecision.state.workflowStep).toBe(
      "data-governance-decision",
    );

    const governance = await service.submit(learner, {
      commandType: "SUBMIT_DATA_GOVERNANCE_DECISION",
      commandId: "COMMAND_STAGE8_GOVERNANCE",
      runId: distributed.runId,
      expectedRunVersion: tamperDecision.state.version,
      decisionId: "INT_DATA_GOVERNANCE_CLASSIFICATION",
      categoryByItem: {
        ITEM_BATCH_ID: "CAT_ON_CHAIN",
        ITEM_RECALL_STATUS: "CAT_ON_CHAIN",
        ITEM_CERTIFICATE_PDF: "CAT_OFF_CHAIN_HASH",
        ITEM_SENSOR_DATASET: "CAT_OFF_CHAIN_HASH",
        ITEM_WHOLESALE_PRICE: "CAT_AUTHORIZED_ONLY",
        ITEM_CUSTOMER_ADDRESS: "CAT_DO_NOT_COLLECT",
      },
    });
    expect(governance.state.workflowStep).toBe(
      "recall-scope-decision",
    );

    const scoped = await service.submit(learner, {
      commandType: "SUBMIT_RECALL_SCOPE_DECISION",
      commandId: "COMMAND_STAGE9_SCOPE",
      runId: distributed.runId,
      expectedRunVersion: governance.state.version,
      decisionId: "INT_RECALL_SCOPE",
      selectedAssetIds: [
        "BAT_PACKAGED_COFFEE_001",
        "BAT_ROASTED_COFFEE_001",
      ],
    });
    expect(scoped.state.workflowStep).toBe("recall-transaction");
    expect(scoped.state.activeTrustedContext.contextId).toBe(
      "CTX_RETAILER",
    );
    expect(scoped.state.recallScopeDecision).toMatchObject({
      isAuthoredCorrect: true,
    });

    const transactionCountBeforeRecall =
      scoped.state.simulation.domain.transactionOrder.length;
    const auditCountBeforeRecall =
      scoped.state.simulation.attemptAuditEvents.length;
    const unauthorized = await service.submit(learner, {
      commandType: "SUBMIT_RECALL_TRANSACTION",
      commandId: "COMMAND_STAGE9_UNAUTHORIZED_RECALL",
      runId: distributed.runId,
      expectedRunVersion: scoped.state.version,
    });
    expect(unauthorized.state.workflowStep).toBe("recall-handoff");
    expect(unauthorized.state.recallStatus).toBe("rejected");
    expect(
      unauthorized.state.simulation.domain.transactionOrder,
    ).toHaveLength(transactionCountBeforeRecall);
    expect(
      unauthorized.state.simulation.attemptAuditEvents,
    ).toHaveLength(auditCountBeforeRecall + 1);
    expect(
      unauthorized.state.transactions.at(-1),
    ).toMatchObject({
      actionId: "RECALL_BATCH",
      isAccepted: false,
      signatureValid: true,
      recognizedIdentity: true,
      authorized: false,
    });
    await expect(
      service.submit(learner, {
        commandType: "SUBMIT_RECALL_TRANSACTION",
        commandId: "COMMAND_STAGE9_SECOND_INITIAL_RECALL",
        runId: distributed.runId,
        expectedRunVersion: unauthorized.state.version,
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_PRECONDITION_FAILED",
    });

    const handedOff = await service.submit(learner, {
      commandType: "REQUEST_RECALL_HANDOFF",
      commandId: "COMMAND_STAGE9_HANDOFF",
      runId: distributed.runId,
      expectedRunVersion: unauthorized.state.version,
    });
    expect(handedOff.state.workflowStep).toBe(
      "recall-authorized-transaction",
    );
    expect(handedOff.state.activeTrustedContext.contextId).toBe(
      "CTX_REGULATOR",
    );

    const recalled = await service.submit(learner, {
      commandType: "RESUBMIT_AUTHORIZED_RECALL",
      commandId: "COMMAND_STAGE9_AUTHORIZED_RECALL",
      runId: distributed.runId,
      expectedRunVersion: handedOff.state.version,
    });
    expect(recalled.state.workflowStep).toBe(
      "blockchain-necessity-decision",
    );
    expect(recalled.state.recallStatus).toBe("committed");
    expect(
      Object.values(
        recalled.state.simulation.domain.transactionsById,
      ).filter(
        (transaction) =>
          transaction.transactionType ===
          TransactionType.RECALL_BATCH,
      ),
    ).toHaveLength(1);
    expect(
      recalled.state.simulation.domain.assetsById[
        "BAT_PACKAGED_COFFEE_001"
      ]?.lifecycleStatus,
    ).toBe("RECALLED");

    const debriefed = await service.submit(learner, {
      commandType: "SUBMIT_KNOWLEDGE_DECISION",
      commandId: "COMMAND_STAGE9_DEBRIEF",
      runId: distributed.runId,
      expectedRunVersion: recalled.state.version,
      decisionId: "INT_BLOCKCHAIN_NECESSITY",
      selectedOptionId: "OPT_INDEPENDENT_ORGANIZATIONS",
    });
    expect(debriefed.state.status).toBe("completed");
    expect(debriefed.state.workflowStep).toBe("complete");
    expect(await serviceFor(store).loadState(distributed.runId)).toEqual(
      debriefed.state,
    );
    const timeline = await service.instructorTimeline(
      instructor,
      distributed.runId,
    );
    expect(
      timeline.find(
        (event) =>
          event.eventType === "TRANSACTION_REJECTED" &&
          event.payload.actionId === "RECALL_BATCH",
      ),
    ).toMatchObject({
      organizationId: "ORG_RETAILER",
      roleId: "RETAIL_MANAGER",
    });
    expect(
      timeline.find(
        (event) =>
          event.eventType === "TRANSACTION_COMMITTED" &&
          event.payload.actionId === "RECALL_BATCH",
      ),
    ).toMatchObject({
      organizationId: "ORG_REGULATOR",
      roleId: "REGULATORY_AUDITOR",
    });
  }, 15_000);

  it("keeps an invalid custody proposal as audit evidence and permits correction", async () => {
    const store = new MemoryRunEventStore();
    const service = serviceFor(store);
    const certificate = await progressToTransaction(
      service,
      "authorized-certifier",
      "RUN_STAGE4_REJECTED",
    );
    const transactionCount =
      certificate.simulation.domain.transactionOrder.length;
    const rejected = await service.submit(learner, {
      commandType: "CREATE_CUSTODY_TRANSFER_PROPOSAL",
      commandId: "COMMAND_STAGE4_INVALID_PROPOSAL",
      runId: certificate.runId,
      expectedRunVersion: certificate.version,
      alsoTransfersOwnership: true,
    });

    expect(rejected.state.workflowStep).toBe("custody-proposal");
    expect(rejected.state.custodyStatus).toBe("rejected");
    expect(rejected.state.pendingProposalId).toBeNull();
    expect(rejected.state.simulation.domain.transactionOrder).toHaveLength(
      transactionCount,
    );
    expect(
      rejected.state.simulation.attemptAuditEvents.at(-1),
    ).toMatchObject({
      kind: "COMMAND_REJECTED",
      organizationId: "ORG_PRODUCER_COOP",
      roleId: "PRODUCER_MANAGER",
    });

    const corrected = await service.submit(learner, {
      commandType: "CREATE_CUSTODY_TRANSFER_PROPOSAL",
      commandId: "COMMAND_STAGE4_CORRECTED_PROPOSAL",
      runId: certificate.runId,
      expectedRunVersion: rejected.state.version,
      alsoTransfersOwnership: false,
    });
    expect(corrected.state.custodyStatus).toBe("awaiting-endorsement");
    expect(corrected.state.pendingProposalId).not.toBeNull();
  });

  it("keeps a valid but unauthorized transaction attempt out of the ledger", async () => {
    const store = new MemoryRunEventStore();
    const service = serviceFor(store);
    const baseline = await serviceFor(
      new MemoryRunEventStore(),
    ).createRun(
      instructor,
      createRequest(
        "unauthorized-transporter",
        "RUN_UNAUTHORIZED_BASELINE",
      ),
    );
    const transactionCount =
      baseline.state.simulation.domain.transactionOrder.length;
    const final = await progressToTransaction(
      service,
      "unauthorized-transporter",
      "RUN_UNAUTHORIZED",
    );

    expect(final.status).toBe("completed");
    expect(final.transactionStatus).toBe("rejected");
    expect(final.transactions).toHaveLength(1);
    expect(final.transactions[0]).toMatchObject({
      actionId: "SUSPICIOUS_CERTIFICATE",
      isAccepted: false,
      transactionId: null,
      signatureValid: true,
      recognizedIdentity: true,
      authorized: false,
    });
    expect(final.transactions[0]?.validationRuleIds).toContain(
      "RULE_ORGANIZATION_NOT_AUTHORIZED",
    );
    expect(final.simulation.domain.transactionOrder).toHaveLength(
      transactionCount,
    );
    expect(
      final.simulation.acceptedEvents.filter(
        (event) => event.kind === "LEDGER_MUTATION",
      ),
    ).toHaveLength(0);
    expect(final.simulation.attemptAuditEvents).toHaveLength(1);
    expect(final.simulation.attemptAuditEvents[0]).toMatchObject({
      kind: "COMMAND_REJECTED",
      organizationId: "ORG_LOGISTICS_PROVIDER",
      roleId: "LOGISTICS_COORDINATOR",
    });
    expect(
      final.competencyEvidence.some(
        (evidence) =>
          evidence.evidenceRuleId ===
          "RULE_UNAUTHORIZED_CERTIFICATE_RECOGNIZED",
      ),
    ).toBe(true);
    const runEvents = await store.load(final.runId);
    const rejectedEvent = runEvents.find(
      (event) => event.eventType === "TRANSACTION_REJECTED",
    );
    const ruleEvidence = runEvents.find(
      (event) =>
        event.eventType === "COMPETENCY_EVIDENCE_RECORDED" &&
        event.payload.evidenceRuleId ===
          "RULE_UNAUTHORIZED_CERTIFICATE_RECOGNIZED",
    );
    expect(rejectedEvent?.payload.validationRuleId).toBe(
      "RULE_ORGANIZATION_NOT_AUTHORIZED",
    );
    expect(ruleEvidence?.payload).toMatchObject({
      evidenceRuleVersion: "1.0.0",
      sourceEventIds: [rejectedEvent?.eventId],
    });
  });

  it("requires the scenario-authored certificate response evidence fields", async () => {
    const store = new MemoryRunEventStore();
    const service = serviceFor(store);
    const ready = await progressToDecision(
      service,
      "authorized-certifier",
      "RUN_STRUCTURED_RESPONSE",
    );
    const baseCommand = {
      commandType: "SUBMIT_CERTIFICATE_DECISION" as const,
      runId: ready.runId,
      expectedRunVersion: ready.version,
      decision: {
        certificateAssessment: "VALID" as const,
        issuerAssessment: "RECOGNIZED_AUTHORIZED" as const,
        storageChoice: "HASH_OFF_CHAIN" as const,
        lotDisposition: "CONTINUE" as const,
      },
      justification: "The cited certificate supports this decision.",
    };

    await expect(
      service.submit(learner, {
        ...baseCommand,
        commandId: "COMMAND_STRUCTURED_RESPONSE_MISSING",
      }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(
      service.submit(learner, {
        ...baseCommand,
        commandId: "COMMAND_STRUCTURED_RESPONSE_POLICY_MISSING",
        citedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
        confidenceRating: 4,
        adverseEventProbabilityPercent: 20,
      }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(
      service.submit(learner, {
        ...baseCommand,
        commandId: "COMMAND_STRUCTURED_RESPONSE_POLICY_INVALID",
        citedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
        citedPolicyIds: ["AUTH_RECALL"],
        confidenceRating: 4,
        adverseEventProbabilityPercent: 20,
      }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });

    const projection = await service.learnerProjection(
      learner,
      ready.runId,
    );
    expect(projection.policyState).toContainEqual({
      recordId: "DECISION_POLICY_AUTH_ISSUE_CERTIFICATE",
      value: expect.objectContaining({
        policyId: "AUTH_ISSUE_CERTIFICATE",
      }),
    });

    const submitted = await service.submit(learner, {
      ...baseCommand,
      commandId: "COMMAND_STRUCTURED_RESPONSE_VALID",
      citedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
      citedPolicyIds: ["AUTH_ISSUE_CERTIFICATE"],
      confidenceRating: 4,
      adverseEventProbabilityPercent: 20,
    });
    expect(submitted.state.decision).toMatchObject({
      citedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
      citedPolicyIds: ["AUTH_ISSUE_CERTIFICATE"],
      confidenceRating: 4,
      adverseEventProbabilityPercent: 20,
    });
    const events = await store.load(ready.runId);
    expect(
      events.find(
        (event) =>
          event.causationId ===
          "COMMAND_STRUCTURED_RESPONSE_VALID",
      )?.payload,
    ).toMatchObject({
      citedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
      citedPolicyIds: ["AUTH_ISSUE_CERTIFICATE"],
      confidenceRating: 4,
      adverseEventProbabilityPercent: 20,
    });
  });

  it("records an initial professional judgment without requiring the answer to be replaced", async () => {
    const store = new MemoryRunEventStore();
    const final = await progressToTransaction(
      serviceFor(store),
      "unauthorized-transporter",
      "RUN_INCORRECT_JUDGMENT",
      { useIncorrectDecision: true },
    );

    expect(final.decision).toMatchObject({
      isAuthoredCorrect: false,
      decision: {
        certificateAssessment: "EXPIRED",
        issuerAssessment: "UNRECOGNIZED",
      },
    });
    expect(final.status).toBe("completed");
    const events = await store.load(final.runId);
    expect(
      events.filter((event) => event.eventType === "DECISION_SUBMITTED"),
    ).toHaveLength(1);
  });

  it("is idempotent, checks expected versions, and rejects self-asserted identity", async () => {
    const store = new MemoryRunEventStore();
    const service = serviceFor(store);
    const request = createRequest("authorized-certifier");
    const created = await service.createRun(instructor, request);
    const retriedCreate = await service.createRun(instructor, request);
    expect(retriedCreate.wasIdempotentReplay).toBe(true);
    expect(await store.load(request.runId)).toHaveLength(2);

    const inspect = {
      commandType: "INSPECT_EVIDENCE" as const,
      commandId: "COMMAND_INSPECT_IDEMPOTENT",
      runId: request.runId,
      expectedRunVersion: created.state.version,
      evidenceId: "EVID_CERTIFICATE_RECORD",
    };
    const inspected = await service.submit(learner, inspect);
    const retried = await service.submit(learner, inspect);
    expect(retried.wasIdempotentReplay).toBe(true);
    expect(retried.state).toEqual(inspected.state);
    expect(await store.load(request.runId)).toHaveLength(4);

    await expect(
      service.submit(learner, {
        ...inspect,
        evidenceId: "EVIDENCE_CHANGED",
      }),
    ).rejects.toMatchObject({ code: "COMMAND_ID_REUSED" });
    await expect(
      service.submit(learner, {
        commandType: "SUBMIT_CERTIFICATE_DECISION",
        commandId: "COMMAND_STALE",
        runId: request.runId,
        expectedRunVersion: 2,
        decision: {
          certificateAssessment: "VALID",
          issuerAssessment: "RECOGNIZED_AUTHORIZED",
          storageChoice: "HASH_OFF_CHAIN",
          lotDisposition: "CONTINUE",
        },
        justification: "A complete evidence-based justification.",
      }),
    ).rejects.toMatchObject({ code: "RUN_VERSION_CONFLICT" });

    const selfAsserted = {
      commandType: "SUBMIT_CERTIFICATE_DECISION",
      commandId: "COMMAND_SELF_ASSERTED",
      runId: request.runId,
      expectedRunVersion: inspected.state.version,
      organizationId: "ORG_CERTIFICATION_BODY",
      decision: {
        certificateAssessment: "VALID",
        issuerAssessment: "RECOGNIZED_AUTHORIZED",
        storageChoice: "HASH_OFF_CHAIN",
        lotDisposition: "CONTINUE",
      },
      justification: "The server must reject identity fields.",
    };
    await expect(
      service.submit(
        learner,
        selfAsserted as Parameters<HostedStage3RunService["submit"]>[1],
      ),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  });

  it("returns role-filtered learner state and protected instructor evidence", async () => {
    const store = new MemoryRunEventStore();
    const service = serviceFor(store);
    const final = await progressToTransaction(
      service,
      "unauthorized-transporter",
      "RUN_PROJECTIONS",
    );

    const projection = await service.learnerProjection(
      learner,
      final.runId,
    );
    const serializedProjection = JSON.stringify(projection);
    expect(serializedProjection).not.toContain(final.scenarioSeed);
    expect(serializedProjection).not.toContain(final.caseVariant);
    expect(serializedProjection).not.toContain("authoredCorrect");
    expect(projection.workflowState.currentNodeId).toBe("complete");
    expect(projection.workflowState.permittedActionIds).toEqual([]);

    await expect(
      service.learnerProjection(otherLearner, final.runId),
    ).rejects.toBeInstanceOf(HostedAuthorizationError);
    await expect(
      service.instructorTimeline(learner, final.runId),
    ).rejects.toBeInstanceOf(HostedAuthorizationError);

    const timeline = await service.instructorTimeline(
      instructor,
      final.runId,
    );
    expect(timeline.map((item) => item.sequenceNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(
      timeline.find(
        (item) => item.eventType === "TRANSACTION_REJECTED",
      ),
    ).toMatchObject({
      organizationId: "ORG_LOGISTICS_PROVIDER",
      roleId: "LOGISTICS_COORDINATOR",
    });

    const competency = await service.competencyReport(
      rater,
      final.runId,
    );
    expect(competency.map((item) => item.indicatorId)).toEqual(
      expect.arrayContaining(["BC3.PI1", "BC6.PI1", "PC5.PI1"]),
    );
    const timelineIds = new Set(timeline.map((item) => item.eventId));
    expect(
      competency
        .flatMap((item) => item.evidence)
        .flatMap((evidence) => evidence.sourceEventIds)
        .every((eventId) => timelineIds.has(eventId)),
    ).toBe(true);
    await expect(
      service.learnerCompetencyEvidence(learner, final.runId),
    ).resolves.toEqual(competency);
    await expect(
      service.learnerCompetencyEvidence(
        otherLearner,
        final.runId,
      ),
    ).rejects.toBeInstanceOf(HostedAuthorizationError);
    await expect(
      service.learnerCompetencyEvidence(instructor, final.runId),
    ).rejects.toBeInstanceOf(HostedAuthorizationError);

    const rubric = await service.rubricEvidence(rater, final.runId);
    expect(rubric).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          criterionId: "CRITERION_EVIDENCE_USE",
          status: "observed",
        }),
        expect.objectContaining({
          criterionId: "CRITERION_AUTHORIZATION_JUDGMENT",
          status: "observed",
        }),
        expect.objectContaining({
          criterionId: "CRITERION_JUSTIFICATION",
          status: "observed",
        }),
      ]),
    );
  });

  it("derives instructor monitor status from the same role-filtered replay", async () => {
    const store = new MemoryRunEventStore();
    const service = serviceFor(store);
    const state = await progressToDecision(
      service,
      "authorized-certifier",
      "RUN_MONITOR",
    );

    await expect(
      service.instructorMonitor(learner, state.runId),
    ).rejects.toBeInstanceOf(HostedAuthorizationError);

    const monitor = await service.instructorMonitor(
      instructor,
      state.runId,
      "2026-07-24T03:02:00.000Z",
    );
    expect(monitor).toEqual({
      runId: state.runId,
      learnerUserId: learner.userId,
      status: "active",
      eventCount: 4,
      currentStageId: "certificate-decision",
      activeRoleId: "CERTIFICATION_OFFICER",
      elapsedSeconds: 120,
      lastActivityAt: NOW,
      pendingActionIds: ["SUBMIT_CERTIFICATE_DECISION"],
      technicalStatus: "ok",
    });
  });

  it("rejects replay when recorded transaction evidence is changed", async () => {
    const store = new MemoryRunEventStore();
    const pack = publishedPack();
    const service = serviceFor(store, pack);
    const final = await progressToTransaction(
      service,
      "unauthorized-transporter",
      "RUN_TAMPERED_REPLAY",
    );
    const events: RunEventV1[] = structuredClone([
      ...(await store.load(final.runId)),
    ]);
    const transactionIndex = events.findIndex(
      (event) => event.eventType === "TRANSACTION_REJECTED",
    );
    const transaction = events[transactionIndex];
    if (transaction === undefined) {
      throw new Error("Expected rejected transaction event.");
    }
    const summary = transaction.payload.summary;
    if (typeof summary !== "object" || summary === null) {
      throw new Error("Expected transaction summary.");
    }
    events[transactionIndex] = {
      ...transaction,
      payload: {
        ...transaction.payload,
        summary: {
          ...summary,
          authorized: true,
        },
      },
    };

    await expect(
      serviceFor(
        new ReadOnlyEventStore(events),
        pack,
      ).loadState(final.runId),
    ).rejects.toBeInstanceOf(HostedRunCommandError);
  });
});
