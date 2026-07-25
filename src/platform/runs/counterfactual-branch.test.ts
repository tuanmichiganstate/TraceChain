import type {
  RunEventV1,
  UnsequencedRunEventV1,
} from "../contracts/run-events";
import {
  MemoryCounterfactualRunRepository,
} from "./counterfactual-repository";
import {
  CounterfactualBranchEngine,
  type CounterfactualBranchRuntimeAdapter,
} from "./counterfactual-branch";
import { MemoryRunEventStore } from "./event-store";
import { hashReplayState, replayRunEvents } from "./replay";

interface TestState {
  readonly runId: string;
  readonly count: number;
  readonly visibleEvidenceIds: readonly string[];
}

function unsequencedEvent(
  eventId: string,
  runId: string,
  eventType:
    | "RUN_CREATED"
    | "EVIDENCE_RELEASED"
    | "DECISION_SUBMITTED",
  before: TestState | null,
  after: TestState,
  delta: number,
): UnsequencedRunEventV1 {
  return {
    eventId,
    runId,
    idempotencyKey: `IDEMPOTENCY_${eventId}`,
    serverTimestampUtc: "2026-07-25T03:00:00.000Z",
    authenticatedUserId: "USER_LEARNER_001",
    simulationActorId: "ACTOR_QUALITY_001",
    organizationId: "ORG_PROCESSOR",
    roleId: "ROLE_QUALITY",
    eventType,
    packId: "PACK_COUNTERFACTUAL_TEST",
    packVersion: "2.0.0",
    scenarioId: "SCN_COUNTERFACTUAL_TEST",
    scenarioVersion: "2.0.0",
    payload:
      eventType === "RUN_CREATED"
        ? {
            assignmentId: "ASSIGNMENT_001",
            learnerUserId: "USER_LEARNER_001",
            mode: "sandbox",
            modeConfiguration: {
              mode: "sandbox",
              allowHints: true,
              allowRetry: true,
            },
            scenarioSeed: "COUNTERFACTUAL_SEED",
            delta,
          }
        : {
            decisionId: "DECISION_CERTIFICATE",
            delta,
          },
    causationId: `COMMAND_${eventId}`,
    correlationId: runId,
    previousStateHash: hashReplayState(before),
    resultingStateHash: hashReplayState(after),
  };
}

function reduce(
  state: Readonly<TestState | null>,
  event: RunEventV1,
): TestState | null {
  const delta = event.payload.delta;
  if (typeof delta !== "number") {
    throw new Error("Test event is missing its delta.");
  }
  if (state === null) {
    return {
      runId: event.runId,
      count: delta,
      visibleEvidenceIds: ["EVIDENCE_AVAILABLE_AT_FORK"],
    };
  }
  return {
    ...state,
    count: state.count + delta,
  };
}

const adapter: CounterfactualBranchRuntimeAdapter<TestState> = {
  replaySourcePrefix(events) {
    const state = replayRunEvents<TestState | null>(
      null,
      events,
      reduce,
    );
    if (state === null) throw new Error("Source run was not created.");
    return state;
  },
  forkState(sourceState, metadata) {
    return {
      ...sourceState,
      runId: metadata.branchRunId,
    };
  },
  replayBranchSuffix(forkState, events) {
    const state = replayRunEvents<TestState | null>(
      forkState,
      events,
      reduce,
    );
    if (state === null) throw new Error("Branch state disappeared.");
    return state;
  },
  stateForHash(state) {
    return state;
  },
  informationStateForHash(state, roleId) {
    return {
      roleId,
      visibleEvidenceIds: state.visibleEvidenceIds,
    };
  },
};

describe("copy-on-write counterfactual branch engine", () => {
  it("references an immutable source prefix and stores only branch suffix events", async () => {
    const events = new MemoryRunEventStore();
    const branches = new MemoryCounterfactualRunRepository();
    const engine = new CounterfactualBranchEngine(events, branches);
    const sourceAfterCreate: TestState = {
      runId: "RUN_SOURCE",
      count: 0,
      visibleEvidenceIds: ["EVIDENCE_AVAILABLE_AT_FORK"],
    };
    const sourceAtFork: TestState = {
      ...sourceAfterCreate,
      count: 1,
    };
    const sourceComplete: TestState = {
      ...sourceAtFork,
      count: 3,
    };
    await events.append({
      runId: "RUN_SOURCE",
      expectedNextSequenceNumber: 1,
      events: [
        unsequencedEvent(
          "EVENT_SOURCE_1",
          "RUN_SOURCE",
          "RUN_CREATED",
          null,
          sourceAfterCreate,
          0,
        ),
        unsequencedEvent(
          "EVENT_SOURCE_2",
          "RUN_SOURCE",
          "EVIDENCE_RELEASED",
          sourceAfterCreate,
          sourceAtFork,
          1,
        ),
        unsequencedEvent(
          "EVENT_SOURCE_3",
          "RUN_SOURCE",
          "DECISION_SUBMITTED",
          sourceAtFork,
          sourceComplete,
          2,
        ),
      ],
    });

    const created = await engine.createBranch(
      {
        branchRunId: "RUN_BRANCH",
        sourceRunId: "RUN_SOURCE",
        forkSequenceNumber: 2,
        forkNodeId: "NODE_CERTIFICATE_DECISION",
        interventionId: "DECISION_CERTIFICATE",
        comparisonMode: "SINGLE_INTERVENTION",
        createdByUserId: "USER_LEARNER_001",
        createdAt: "2026-07-25T03:10:00.000Z",
      },
      adapter,
    );
    expect(created.wasIdempotentReplay).toBe(false);
    expect(created.metadata).toMatchObject({
      branchRunId: "RUN_BRANCH",
      sourceRunId: "RUN_SOURCE",
      sourcePackVersion: "2.0.0",
      sourceScenarioVersion: "2.0.0",
      sourceSeed: "COUNTERFACTUAL_SEED",
      forkSequenceNumber: 2,
      forkActorId: "ACTOR_QUALITY_001",
      forkOrganizationId: "ORG_PROCESSOR",
      forkRoleId: "ROLE_QUALITY",
    });

    const forkState: TestState = {
      ...sourceAtFork,
      runId: "RUN_BRANCH",
    };
    const alternativeState: TestState = {
      ...forkState,
      count: 11,
    };
    await events.append({
      runId: "RUN_BRANCH",
      expectedNextSequenceNumber: 1,
      events: [
        unsequencedEvent(
          "EVENT_BRANCH_1",
          "RUN_BRANCH",
          "DECISION_SUBMITTED",
          forkState,
          alternativeState,
          10,
        ),
      ],
    });

    const reconstructed = await engine.reconstructBranch(
      "RUN_BRANCH",
      adapter,
    );

    expect(reconstructed.sourcePrefixEvents).toHaveLength(2);
    expect(reconstructed.branchSuffixEvents).toHaveLength(1);
    expect(reconstructed.currentState).toEqual(alternativeState);
    expect(await events.load("RUN_SOURCE")).toHaveLength(3);
    expect(await events.load("RUN_BRANCH")).toHaveLength(1);
  });

  it("replays identical branch creation idempotently and rejects a changed fork", async () => {
    const events = new MemoryRunEventStore();
    const branches = new MemoryCounterfactualRunRepository();
    const engine = new CounterfactualBranchEngine(events, branches);
    const sourceState: TestState = {
      runId: "RUN_SOURCE",
      count: 0,
      visibleEvidenceIds: ["EVIDENCE_AVAILABLE_AT_FORK"],
    };
    const sourceAfterDecision: TestState = {
      ...sourceState,
      count: 1,
    };
    await events.append({
      runId: "RUN_SOURCE",
      expectedNextSequenceNumber: 1,
      events: [
        unsequencedEvent(
          "EVENT_SOURCE_1",
          "RUN_SOURCE",
          "RUN_CREATED",
          null,
          sourceState,
          0,
        ),
        unsequencedEvent(
          "EVENT_SOURCE_2",
          "RUN_SOURCE",
          "DECISION_SUBMITTED",
          sourceState,
          sourceAfterDecision,
          1,
        ),
      ],
    });
    const request = {
      branchRunId: "RUN_BRANCH",
      sourceRunId: "RUN_SOURCE",
      forkSequenceNumber: 1,
      forkNodeId: "NODE_CERTIFICATE_DECISION",
      interventionId: "DECISION_CERTIFICATE",
      comparisonMode: "SINGLE_INTERVENTION" as const,
      createdByUserId: "USER_LEARNER_001",
      createdAt: "2026-07-25T03:10:00.000Z",
    };

    const first = await engine.createBranch(request, adapter);
    const repeated = await engine.createBranch(
      structuredClone(request),
      adapter,
    );

    expect(first.wasIdempotentReplay).toBe(false);
    expect(repeated.wasIdempotentReplay).toBe(true);
    await expect(
      engine.createBranch(
        {
          ...request,
          forkNodeId: "NODE_DIFFERENT",
        },
        adapter,
      ),
    ).rejects.toMatchObject({
      code: "COUNTERFACTUAL_BRANCH_CONFLICT",
    });
  });
});
