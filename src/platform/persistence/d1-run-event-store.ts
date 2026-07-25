import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import type {
  RunEventV1,
  UnsequencedRunEventV1,
} from "../contracts/run-events";
import {
  RunEventStoreConflictError,
  type AppendRunEventsRequest,
  type AppendRunEventsResult,
  type RunEventStore,
} from "../runs/event-store";
import type { D1DatabaseLike, D1ResultLike } from "./d1-types";

const SELECT_STREAM = `SELECT event_json
  FROM hosted_run_events
  WHERE run_id = ?
  ORDER BY sequence_number ASC`;
const SELECT_STREAM_THROUGH = `SELECT event_json
  FROM hosted_run_events
  WHERE run_id = ? AND sequence_number <= ?
  ORDER BY sequence_number ASC`;
const SELECT_IDEMPOTENT_EVENT = `SELECT event_json
  FROM hosted_run_events
  WHERE run_id = ? AND idempotency_key = ?`;
const SELECT_MAX_SEQUENCE = `SELECT COALESCE(MAX(sequence_number), 0) AS max_sequence
  FROM hosted_run_events
  WHERE run_id = ?`;
const INSERT_EVENT = `INSERT INTO hosted_run_events (
    run_id,
    sequence_number,
    event_id,
    idempotency_key,
    event_json,
    server_timestamp_utc
  ) VALUES (?, ?, ?, ?, ?, ?)`;

interface StoredEventRow {
  readonly event_json: string;
}

interface MaximumSequenceRow {
  readonly max_sequence: number;
}

export class D1RunEventStoreError extends Error {
  constructor(
    readonly code:
      | "D1_QUERY_FAILED"
      | "CORRUPT_EVENT_STREAM",
    message: string,
  ) {
    super(message);
    this.name = "D1RunEventStoreError";
  }
}

function unsequencedProjection(
  event: RunEventV1,
): UnsequencedRunEventV1 {
  const {
    schemaVersion: _schemaVersion,
    sequenceNumber: _sequenceNumber,
    ...unsequenced
  } = event;
  return unsequenced;
}

function parseStoredEvent(
  serialized: string,
  expectedRunId?: string,
): RunEventV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new D1RunEventStoreError(
      "CORRUPT_EVENT_STREAM",
      "Stored run event is not valid JSON.",
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { schemaVersion?: unknown }).schemaVersion !== "1.0.0" ||
    typeof (parsed as { runId?: unknown }).runId !== "string" ||
    !Number.isInteger(
      (parsed as { sequenceNumber?: unknown }).sequenceNumber,
    )
  ) {
    throw new D1RunEventStoreError(
      "CORRUPT_EVENT_STREAM",
      "Stored run event does not satisfy the versioned event envelope.",
    );
  }
  const event = parsed as RunEventV1;
  if (expectedRunId !== undefined && event.runId !== expectedRunId) {
    throw new D1RunEventStoreError(
      "CORRUPT_EVENT_STREAM",
      "Stored run event belongs to a different run.",
    );
  }
  return event;
}

function validateAppendRequest(request: AppendRunEventsRequest): void {
  if (request.events.length === 0) {
    throw new RunEventStoreConflictError(
      "INVALID_EVENT_BATCH",
      "An append batch must contain at least one event.",
    );
  }
  if (
    !Number.isInteger(request.expectedNextSequenceNumber) ||
    request.expectedNextSequenceNumber < 1
  ) {
    throw new RunEventStoreConflictError(
      "INVALID_EVENT_BATCH",
      "Expected sequence number must be a positive integer.",
    );
  }
  const keys = new Set<string>();
  for (const event of request.events) {
    if (event.runId !== request.runId) {
      throw new RunEventStoreConflictError(
        "INVALID_EVENT_BATCH",
        "Every event in a batch must belong to the requested run.",
      );
    }
    if (keys.has(event.idempotencyKey)) {
      throw new RunEventStoreConflictError(
        "INVALID_EVENT_BATCH",
        `Duplicate idempotency key in batch: ${event.idempotencyKey}.`,
      );
    }
    keys.add(event.idempotencyKey);
  }
}

function assertSuccessful(results: readonly D1ResultLike[]): void {
  const failure = results.find((result) => !result.success);
  if (failure !== undefined) {
    throw new D1RunEventStoreError(
      "D1_QUERY_FAILED",
      failure.error ?? "D1 rejected an event-store batch.",
    );
  }
}

export class D1RunEventStore implements RunEventStore {
  constructor(private readonly database: D1DatabaseLike) {}

  async load(runId: string): Promise<readonly RunEventV1[]> {
    const result = await this.database
      .prepare(SELECT_STREAM)
      .bind(runId)
      .all<StoredEventRow>();
    if (!result.success) {
      throw new D1RunEventStoreError(
        "D1_QUERY_FAILED",
        result.error ?? `Could not load run ${runId}.`,
      );
    }
    const events = result.results.map((row) =>
      parseStoredEvent(row.event_json, runId),
    );
    for (const [index, event] of events.entries()) {
      if (event.sequenceNumber !== index + 1) {
        throw new D1RunEventStoreError(
          "CORRUPT_EVENT_STREAM",
          `Run ${runId} has a gap in its stored event sequence.`,
        );
      }
    }
    return events;
  }

  async loadThrough(
    runId: string,
    throughSequenceNumber: number,
  ): Promise<readonly RunEventV1[]> {
    if (
      !Number.isInteger(throughSequenceNumber) ||
      throughSequenceNumber < 0
    ) {
      throw new RunEventStoreConflictError(
        "INVALID_EVENT_BATCH",
        "A replay boundary must be a non-negative integer.",
      );
    }
    const result = await this.database
      .prepare(SELECT_STREAM_THROUGH)
      .bind(runId, throughSequenceNumber)
      .all<StoredEventRow>();
    if (!result.success) {
      throw new D1RunEventStoreError(
        "D1_QUERY_FAILED",
        result.error ?? `Could not load run ${runId}.`,
      );
    }
    const events = result.results.map((row) =>
      parseStoredEvent(row.event_json, runId),
    );
    for (const [index, event] of events.entries()) {
      if (event.sequenceNumber !== index + 1) {
        throw new D1RunEventStoreError(
          "CORRUPT_EVENT_STREAM",
          `Run ${runId} has a gap in its stored event sequence.`,
        );
      }
    }
    return events;
  }

  async append(
    request: AppendRunEventsRequest,
  ): Promise<AppendRunEventsResult> {
    validateAppendRequest(request);
    const existing = await Promise.all(
      request.events.map(async (event) => {
        const row = await this.database
          .prepare(SELECT_IDEMPOTENT_EVENT)
          .bind(request.runId, event.idempotencyKey)
          .first<StoredEventRow>();
        return row === null
          ? null
          : parseStoredEvent(row.event_json, request.runId);
      }),
    );
    const existingCount = existing.filter(
      (event): event is RunEventV1 => event !== null,
    ).length;
    if (existingCount > 0) {
      if (existingCount !== request.events.length) {
        throw new RunEventStoreConflictError(
          "PARTIAL_IDEMPOTENT_BATCH",
          "A retried batch must match the complete original batch.",
        );
      }
      const resolved = existing as readonly RunEventV1[];
      for (const [index, event] of resolved.entries()) {
        const requested = request.events[index];
        if (
          requested === undefined ||
          canonicalize(unsequencedProjection(event)) !==
            canonicalize(requested)
        ) {
          throw new RunEventStoreConflictError(
            "IDEMPOTENCY_KEY_REUSED",
            `Idempotency key ${event.idempotencyKey} was reused with different content.`,
          );
        }
      }
      return {
        events: resolved,
        wasIdempotentReplay: true,
      };
    }

    const maximum = await this.database
      .prepare(SELECT_MAX_SEQUENCE)
      .bind(request.runId)
      .first<MaximumSequenceRow>();
    if (
      maximum === null ||
      typeof maximum.max_sequence !== "number" ||
      !Number.isInteger(maximum.max_sequence)
    ) {
      throw new D1RunEventStoreError(
        "CORRUPT_EVENT_STREAM",
        "D1 did not return a valid maximum run-event sequence.",
      );
    }
    const requiredNextSequence = maximum.max_sequence + 1;
    if (
      request.expectedNextSequenceNumber !== requiredNextSequence
    ) {
      throw new RunEventStoreConflictError(
        "RUN_SEQUENCE_CONFLICT",
        `Expected sequence ${String(request.expectedNextSequenceNumber)}, but run ${request.runId} requires ${String(requiredNextSequence)}.`,
      );
    }

    const events = request.events.map(
      (event, index): RunEventV1 => ({
        ...structuredClone(event),
        schemaVersion: "1.0.0",
        sequenceNumber: requiredNextSequence + index,
      }),
    );
    const statements = events.map((event) =>
      this.database
        .prepare(INSERT_EVENT)
        .bind(
          event.runId,
          event.sequenceNumber,
          event.eventId,
          event.idempotencyKey,
          JSON.stringify(event),
          event.serverTimestampUtc,
        ),
    );
    try {
      assertSuccessful(await this.database.batch(statements));
    } catch (error) {
      /*
       * A competing writer may have won after the sequence check. Resolve an
       * identical retry as idempotent; otherwise expose an optimistic conflict.
       */
      const afterRace = await Promise.all(
        request.events.map(async (event) => {
          const row = await this.database
            .prepare(SELECT_IDEMPOTENT_EVENT)
            .bind(request.runId, event.idempotencyKey)
            .first<StoredEventRow>();
          return row === null
            ? null
            : parseStoredEvent(row.event_json, request.runId);
        }),
      );
      if (
        afterRace.every((event): event is RunEventV1 => event !== null) &&
        afterRace.every(
          (event, index) =>
            canonicalize(unsequencedProjection(event)) ===
            canonicalize(request.events[index]),
        )
      ) {
        return {
          events: afterRace,
          wasIdempotentReplay: true,
        };
      }
      if (error instanceof D1RunEventStoreError) {
        throw new RunEventStoreConflictError(
          "RUN_SEQUENCE_CONFLICT",
          `Concurrent append rejected for run ${request.runId}.`,
        );
      }
      throw error;
    }
    return {
      events,
      wasIdempotentReplay: false,
    };
  }
}
