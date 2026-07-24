import packJson from "../../../scenario-packs/standard-coffee-stage3/tracechain.pack.json";
import { FixedClock, SequenceIdGenerator } from "../../domain/simulation/environment";
import type { RunEventV1 } from "../contracts/run-events";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
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
  });
  const submitted = await service.submit(learner, {
    commandType: "SUBMIT_CERTIFICATE_TRANSACTION",
    commandId: `COMMAND_TRANSACTION_${decision.state.runId}`,
    runId: decision.state.runId,
    expectedRunVersion: decision.state.version,
  });
  return submitted.state;
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
}

describe("server-authoritative hosted Stage 3 run", () => {
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
    expect(final.status).toBe("completed");
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
