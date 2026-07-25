import type {
  HostedRunStateV1,
  RunEventV1,
  UnsequencedRunEventV1,
} from "../contracts/run-events";
import {
  MemoryRunEventStore,
  RunEventStoreConflictError,
} from "./event-store";
import { projectRunStateForRole } from "./projection";
import { hashReplayState, replayRunEvents } from "./replay";

interface CounterState {
  readonly count: number;
  readonly inspectedEvidenceIds: readonly string[];
}

function eventFor(
  eventId: string,
  idempotencyKey: string,
  before: CounterState,
  after: CounterState,
  delta: number,
): UnsequencedRunEventV1 {
  return {
    eventId,
    runId: "RUN_001",
    idempotencyKey,
    serverTimestampUtc: "2026-07-24T03:00:00.000Z",
    authenticatedUserId: "USER_LEARNER_001",
    simulationActorId: "ACTOR_CERTIFICATION_OFFICER",
    organizationId: "ORG_CERTIFICATION_BODY",
    roleId: "CERTIFICATION_OFFICER",
    eventType: "EVIDENCE_INSPECTED",
    packId: "PACK_STANDARD_COFFEE_STAGE3",
    packVersion: "1.0.0",
    scenarioId: "SCN_COFFEE_STAGE3_FOUNDATION",
    scenarioVersion: "1.0.0",
    payload: {
      delta,
      evidenceId: "EVID_CERTIFICATE_RECORD",
    },
    causationId: `COMMAND_${eventId}`,
    correlationId: "CORRELATION_001",
    previousStateHash: hashReplayState(before),
    resultingStateHash: hashReplayState(after),
  };
}

const reduceCounter = (
  state: Readonly<CounterState>,
  event: RunEventV1,
): CounterState => {
  const delta = event.payload.delta;
  const evidenceId = event.payload.evidenceId;
  if (typeof delta !== "number" || typeof evidenceId !== "string") {
    throw new Error("Invalid counter event payload.");
  }
  return {
    count: state.count + delta,
    inspectedEvidenceIds: [...state.inspectedEvidenceIds, evidenceId],
  };
};

describe("hosted run foundations", () => {
  it("appends strictly ordered events and replays an identical batch idempotently", async () => {
    const store = new MemoryRunEventStore();
    const initial: CounterState = {
      count: 0,
      inspectedEvidenceIds: [],
    };
    const after: CounterState = {
      count: 1,
      inspectedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
    };
    const event = eventFor("EVENT_001", "IDEMPOTENCY_001", initial, after, 1);

    const appended = await store.append({
      runId: "RUN_001",
      expectedNextSequenceNumber: 1,
      events: [event],
    });
    const retried = await store.append({
      runId: "RUN_001",
      expectedNextSequenceNumber: 1,
      events: [structuredClone(event)],
    });

    expect(appended.wasIdempotentReplay).toBe(false);
    expect(appended.events[0]?.sequenceNumber).toBe(1);
    expect(retried.wasIdempotentReplay).toBe(true);
    expect(retried.events).toEqual(appended.events);
    expect(await store.load("RUN_001")).toHaveLength(1);
    expect(await store.loadThrough("RUN_001", 0)).toEqual([]);
    expect(await store.loadThrough("RUN_001", 1)).toEqual(
      appended.events,
    );
    const storedPayload = appended.events[0]?.payload;
    expect(storedPayload).toBeDefined();
    if (storedPayload !== undefined) {
      expect(Reflect.set(storedPayload, "delta", 99)).toBe(false);
      expect(storedPayload.delta).toBe(1);
    }
  });

  it("rejects sequence conflicts and changed use of an idempotency key", async () => {
    const store = new MemoryRunEventStore();
    const initial: CounterState = {
      count: 0,
      inspectedEvidenceIds: [],
    };
    const after: CounterState = {
      count: 1,
      inspectedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
    };
    const event = eventFor("EVENT_001", "IDEMPOTENCY_001", initial, after, 1);
    await store.append({
      runId: "RUN_001",
      expectedNextSequenceNumber: 1,
      events: [event],
    });

    await expect(
      store.append({
        runId: "RUN_001",
        expectedNextSequenceNumber: 1,
        events: [
          eventFor(
            "EVENT_002",
            "IDEMPOTENCY_002",
            after,
            {
              count: 2,
              inspectedEvidenceIds: [
                "EVID_CERTIFICATE_RECORD",
                "EVID_CERTIFICATE_RECORD",
              ],
            },
            1,
          ),
        ],
      }),
    ).rejects.toMatchObject({ code: "RUN_SEQUENCE_CONFLICT" });

    const changed = {
      ...event,
      payload: { ...event.payload, delta: 2 },
    };
    await expect(
      store.append({
        runId: "RUN_001",
        expectedNextSequenceNumber: 1,
        events: [changed],
      }),
    ).rejects.toBeInstanceOf(RunEventStoreConflictError);
  });

  it("reconstructs the same state and detects tampered replay evidence", async () => {
    const store = new MemoryRunEventStore();
    const initial: CounterState = {
      count: 0,
      inspectedEvidenceIds: [],
    };
    const afterFirst: CounterState = {
      count: 1,
      inspectedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
    };
    const afterSecond: CounterState = {
      count: 3,
      inspectedEvidenceIds: [
        "EVID_CERTIFICATE_RECORD",
        "EVID_CERTIFICATE_RECORD",
      ],
    };
    await store.append({
      runId: "RUN_001",
      expectedNextSequenceNumber: 1,
      events: [
        eventFor(
          "EVENT_001",
          "IDEMPOTENCY_001",
          initial,
          afterFirst,
          1,
        ),
        eventFor(
          "EVENT_002",
          "IDEMPOTENCY_002",
          afterFirst,
          afterSecond,
          2,
        ),
      ],
    });
    const events = await store.load("RUN_001");

    expect(replayRunEvents(initial, events, reduceCounter)).toEqual(
      afterSecond,
    );

    const first = events[0];
    if (first === undefined) throw new Error("Stored event missing.");
    const tampered: RunEventV1[] = [
      { ...first, payload: { ...first.payload, delta: 9 } },
      ...(events.slice(1) as RunEventV1[]),
    ];
    expect(() => replayRunEvents(initial, tampered, reduceCounter)).toThrow(
      /does not reproduce its recorded state hash/u,
    );
  });

  it("returns a role-filtered projection without actual or random state", () => {
    const state: HostedRunStateV1 = {
      schemaVersion: "1.0.0",
      runId: "RUN_001",
      version: 4,
      actualState: {
        hiddenCertificateTruth: "SECRET_ACTUAL_STATE",
      },
      businessState: [
        {
          recordId: "BUSINESS_VISIBLE",
          visibleToRoleIds: ["CERTIFICATION_OFFICER"],
          value: { status: "review" },
        },
        {
          recordId: "BUSINESS_HIDDEN",
          visibleToRoleIds: ["INSTRUCTOR"],
          value: "SECRET_BUSINESS_STATE",
        },
      ],
      ledgerState: {
        publicTransactionId: "TX_001",
      },
      informationState: [
        {
          recordId: "EVIDENCE_VISIBLE",
          visibleToRoleIds: ["CERTIFICATION_OFFICER"],
          value: { documentReference: "DOC_001" },
        },
        {
          recordId: "EVIDENCE_HIDDEN",
          visibleToRoleIds: ["INSTRUCTOR"],
          value: "SECRET_EVIDENCE",
        },
      ],
      policyState: [
        {
          recordId: "POLICY_VISIBLE",
          visibleToRoleIds: ["CERTIFICATION_OFFICER"],
          value: { policyId: "AUTH_ISSUE_CERTIFICATE" },
        },
        {
          recordId: "POLICY_HIDDEN",
          visibleToRoleIds: ["INSTRUCTOR"],
          value: "SECRET_POLICY",
        },
      ],
      workflowState: {
        currentNodeId: "NODE_CERTIFICATE_DECISION",
        completedNodeIds: ["NODE_CERTIFICATE_BRIEFING"],
        permittedActionIdsByRole: {
          CERTIFICATION_OFFICER: ["SUBMIT_CERTIFICATE_DECISION"],
          INSTRUCTOR: ["VIEW_ACTUAL_STATE"],
        },
      },
      rngState: {
        seed: "SECRET_SEED",
        streamPosition: 2,
        recordedDraws: [0.42],
      },
    };

    const projection = projectRunStateForRole(
      state,
      "CERTIFICATION_OFFICER",
    );
    const serialized = JSON.stringify(projection);

    expect(projection.businessState.map((item) => item.recordId)).toEqual([
      "BUSINESS_VISIBLE",
    ]);
    expect(
      projection.informationState.map((item) => item.recordId),
    ).toEqual(["EVIDENCE_VISIBLE"]);
    expect(projection.policyState.map((item) => item.recordId)).toEqual([
      "POLICY_VISIBLE",
    ]);
    expect(projection.workflowState.permittedActionIds).toEqual([
      "SUBMIT_CERTIFICATE_DECISION",
    ]);
    expect(serialized).not.toContain("actualState");
    expect(serialized).not.toContain("rngState");
    expect(serialized).not.toContain("SECRET_");
    expect(serialized).not.toContain("visibleToRoleIds");
  });
});
