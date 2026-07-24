import type {
  RunEventV1,
  UnsequencedRunEventV1,
} from "../contracts/run-events";
import {
  RunEventStoreConflictError,
} from "../runs/event-store";
import { hashReplayState } from "../runs/replay";
import {
  D1RunEventStore,
  D1RunEventStoreError,
} from "./d1-run-event-store";
import type {
  D1AllResultLike,
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
} from "./d1-types";

interface StoredRow {
  readonly runId: string;
  readonly sequenceNumber: number;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly eventJson: string;
  readonly serverTimestampUtc: string;
}

class FakeD1Statement implements D1PreparedStatementLike {
  private values: readonly unknown[] = [];

  constructor(
    readonly database: FakeD1Database,
    readonly query: string,
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementLike {
    const statement = new FakeD1Statement(this.database, this.query);
    statement.values = values;
    return statement;
  }

  async first<Row>(): Promise<Row | null> {
    if (this.query.includes("idempotency_key = ?")) {
      const [runId, idempotencyKey] = this.values;
      const found = this.database.rows.find(
        (row) =>
          row.runId === runId &&
          row.idempotencyKey === idempotencyKey,
      );
      return (
        found === undefined
          ? null
          : { event_json: found.eventJson }
      ) as Row | null;
    }
    if (this.query.includes("MAX(sequence_number)")) {
      const [runId] = this.values;
      const maximum = this.database.rows
        .filter((row) => row.runId === runId)
        .reduce(
          (current, row) => Math.max(current, row.sequenceNumber),
          0,
        );
      return { max_sequence: maximum } as Row;
    }
    throw new Error(`Unsupported fake D1 first query: ${this.query}`);
  }

  async all<Row>(): Promise<D1AllResultLike<Row>> {
    if (
      this.query.includes("FROM hosted_run_events") &&
      this.query.includes("ORDER BY sequence_number ASC")
    ) {
      const [runId] = this.values;
      return {
        success: true,
        results: this.database.rows
          .filter((row) => row.runId === runId)
          .sort(
            (left, right) =>
              left.sequenceNumber - right.sequenceNumber,
          )
          .map((row) => ({
            event_json: row.eventJson,
          })) as Row[],
      };
    }
    throw new Error(`Unsupported fake D1 all query: ${this.query}`);
  }

  async run(): Promise<D1ResultLike> {
    return this.database.executeInsert(this);
  }

  boundValues(): readonly unknown[] {
    return this.values;
  }
}

class FakeD1Database implements D1DatabaseLike {
  rows: StoredRow[] = [];

  prepare(query: string): D1PreparedStatementLike {
    return new FakeD1Statement(this, query);
  }

  async batch(
    statements: readonly D1PreparedStatementLike[],
  ): Promise<readonly D1ResultLike[]> {
    const before = structuredClone(this.rows);
    const results: D1ResultLike[] = [];
    for (const statement of statements) {
      if (!(statement instanceof FakeD1Statement)) {
        throw new Error("Unexpected fake statement implementation.");
      }
      const result = this.executeInsert(statement);
      results.push(result);
      if (!result.success) {
        this.rows = before;
        return results;
      }
    }
    return results;
  }

  executeInsert(statement: FakeD1Statement): D1ResultLike {
    if (!statement.query.includes("INSERT INTO hosted_run_events")) {
      throw new Error(`Unsupported fake D1 run query: ${statement.query}`);
    }
    const [
      runId,
      sequenceNumber,
      eventId,
      idempotencyKey,
      eventJson,
      serverTimestampUtc,
    ] = statement.boundValues();
    if (
      typeof runId !== "string" ||
      typeof sequenceNumber !== "number" ||
      typeof eventId !== "string" ||
      typeof idempotencyKey !== "string" ||
      typeof eventJson !== "string" ||
      typeof serverTimestampUtc !== "string"
    ) {
      return { success: false, error: "Invalid insert bindings." };
    }
    const conflicts = this.rows.some(
      (row) =>
        row.eventId === eventId ||
        (row.runId === runId &&
          (row.sequenceNumber === sequenceNumber ||
            row.idempotencyKey === idempotencyKey)),
    );
    if (conflicts) {
      return { success: false, error: "UNIQUE constraint failed." };
    }
    this.rows.push({
      runId,
      sequenceNumber,
      eventId,
      idempotencyKey,
      eventJson,
      serverTimestampUtc,
    });
    return { success: true, meta: { changes: 1 } };
  }
}

interface TestState {
  readonly count: number;
}

function eventFor(
  eventId: string,
  idempotencyKey: string,
  before: TestState,
  after: TestState,
  delta: number,
): UnsequencedRunEventV1 {
  return {
    eventId,
    runId: "RUN_D1_001",
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
    payload: { delta },
    causationId: `COMMAND_${eventId}`,
    correlationId: "RUN_D1_001",
    previousStateHash: hashReplayState(before),
    resultingStateHash: hashReplayState(after),
  };
}

describe("D1 hosted run event store", () => {
  it("atomically appends, loads, and replays a complete batch idempotently", async () => {
    const database = new FakeD1Database();
    const store = new D1RunEventStore(database);
    const initial = { count: 0 };
    const afterFirst = { count: 1 };
    const afterSecond = { count: 3 };
    const request = {
      runId: "RUN_D1_001",
      expectedNextSequenceNumber: 1,
      events: [
        eventFor(
          "EVENT_D1_001",
          "IDEMPOTENCY_D1_001",
          initial,
          afterFirst,
          1,
        ),
        eventFor(
          "EVENT_D1_002",
          "IDEMPOTENCY_D1_002",
          afterFirst,
          afterSecond,
          2,
        ),
      ],
    };

    const appended = await store.append(request);
    const retried = await store.append(structuredClone(request));

    expect(appended.wasIdempotentReplay).toBe(false);
    expect(appended.events.map((event) => event.sequenceNumber)).toEqual([
      1, 2,
    ]);
    expect(retried.wasIdempotentReplay).toBe(true);
    expect(retried.events).toEqual(appended.events);
    expect(await store.load(request.runId)).toEqual(appended.events);
    expect(database.rows).toHaveLength(2);
  });

  it("rejects changed idempotency content, partial retries, and stale sequences", async () => {
    const database = new FakeD1Database();
    const store = new D1RunEventStore(database);
    const initial = { count: 0 };
    const after = { count: 1 };
    const first = eventFor(
      "EVENT_D1_001",
      "IDEMPOTENCY_D1_001",
      initial,
      after,
      1,
    );
    await store.append({
      runId: "RUN_D1_001",
      expectedNextSequenceNumber: 1,
      events: [first],
    });

    await expect(
      store.append({
        runId: "RUN_D1_001",
        expectedNextSequenceNumber: 1,
        events: [
          {
            ...first,
            payload: { delta: 9 },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });

    await expect(
      store.append({
        runId: "RUN_D1_001",
        expectedNextSequenceNumber: 1,
        events: [
          first,
          eventFor(
            "EVENT_D1_002",
            "IDEMPOTENCY_D1_002",
            after,
            { count: 2 },
            1,
          ),
        ],
      }),
    ).rejects.toMatchObject({ code: "PARTIAL_IDEMPOTENT_BATCH" });

    await expect(
      store.append({
        runId: "RUN_D1_001",
        expectedNextSequenceNumber: 1,
        events: [
          eventFor(
            "EVENT_D1_003",
            "IDEMPOTENCY_D1_003",
            after,
            { count: 2 },
            1,
          ),
        ],
      }),
    ).rejects.toBeInstanceOf(RunEventStoreConflictError);
  });

  it("rolls back the complete D1 batch when any insert conflicts", async () => {
    const database = new FakeD1Database();
    const store = new D1RunEventStore(database);
    const initial = { count: 0 };
    const after = { count: 1 };
    const existing = eventFor(
      "EVENT_GLOBALLY_UNIQUE",
      "IDEMPOTENCY_OTHER_RUN",
      initial,
      after,
      1,
    );
    const storedExisting: RunEventV1 = {
      ...existing,
      runId: "RUN_OTHER",
      schemaVersion: "1.0.0",
      sequenceNumber: 1,
    };
    database.rows.push({
      runId: storedExisting.runId,
      sequenceNumber: 1,
      eventId: storedExisting.eventId,
      idempotencyKey: storedExisting.idempotencyKey,
      eventJson: JSON.stringify(storedExisting),
      serverTimestampUtc: storedExisting.serverTimestampUtc,
    });

    await expect(
      store.append({
        runId: "RUN_D1_001",
        expectedNextSequenceNumber: 1,
        events: [
          eventFor(
            "EVENT_D1_NEW",
            "IDEMPOTENCY_D1_NEW",
            initial,
            after,
            1,
          ),
          eventFor(
            "EVENT_GLOBALLY_UNIQUE",
            "IDEMPOTENCY_D1_CONFLICT",
            after,
            { count: 2 },
            1,
          ),
        ],
      }),
    ).rejects.toMatchObject({ code: "RUN_SEQUENCE_CONFLICT" });
    expect(
      database.rows.filter((row) => row.runId === "RUN_D1_001"),
    ).toHaveLength(0);
  });

  it("fails closed when persisted JSON or sequence data is corrupt", async () => {
    const database = new FakeD1Database();
    const store = new D1RunEventStore(database);
    database.rows.push({
      runId: "RUN_D1_001",
      sequenceNumber: 1,
      eventId: "EVENT_CORRUPT",
      idempotencyKey: "IDEMPOTENCY_CORRUPT",
      eventJson: "{not-json",
      serverTimestampUtc: "2026-07-24T03:00:00.000Z",
    });

    await expect(store.load("RUN_D1_001")).rejects.toBeInstanceOf(
      D1RunEventStoreError,
    );
  });
});
