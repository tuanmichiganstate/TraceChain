import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import type {
  RunEventV1,
  UnsequencedRunEventV1,
} from "../contracts/run-events";

export interface AppendRunEventsRequest {
  readonly runId: string;
  readonly expectedNextSequenceNumber: number;
  readonly events: readonly UnsequencedRunEventV1[];
}

export interface AppendRunEventsResult {
  readonly events: readonly RunEventV1[];
  readonly wasIdempotentReplay: boolean;
}

export interface RunEventStore {
  append(request: AppendRunEventsRequest): Promise<AppendRunEventsResult>;
  load(runId: string): Promise<readonly RunEventV1[]>;
  loadThrough(
    runId: string,
    throughSequenceNumber: number,
  ): Promise<readonly RunEventV1[]>;
}

export class RunEventStoreConflictError extends Error {
  constructor(
    readonly code:
      | "RUN_SEQUENCE_CONFLICT"
      | "IDEMPOTENCY_KEY_REUSED"
      | "PARTIAL_IDEMPOTENT_BATCH"
      | "INVALID_EVENT_BATCH",
    message: string,
  ) {
    super(message);
    this.name = "RunEventStoreConflictError";
  }
}

function unsequencedProjection(event: RunEventV1): UnsequencedRunEventV1 {
  const { schemaVersion: _schemaVersion, sequenceNumber: _sequence, ...rest } =
    event;
  return rest;
}

function deepFreeze<T>(value: T, visited = new Set<object>()): T {
  if (typeof value !== "object" || value === null || visited.has(value)) {
    return value;
  }
  visited.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, visited);
  return Object.freeze(value);
}

export class MemoryRunEventStore implements RunEventStore {
  private readonly streams = new Map<string, readonly RunEventV1[]>();
  private readonly idempotencyIndex = new Map<string, RunEventV1>();

  async append(
    request: AppendRunEventsRequest,
  ): Promise<AppendRunEventsResult> {
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
    const batchKeys = new Set<string>();
    for (const event of request.events) {
      if (event.runId !== request.runId) {
        throw new RunEventStoreConflictError(
          "INVALID_EVENT_BATCH",
          "Every event in a batch must belong to the requested run.",
        );
      }
      if (batchKeys.has(event.idempotencyKey)) {
        throw new RunEventStoreConflictError(
          "INVALID_EVENT_BATCH",
          `Duplicate idempotency key in batch: ${event.idempotencyKey}.`,
        );
      }
      batchKeys.add(event.idempotencyKey);
    }

    const existing = request.events.map((event) =>
      this.idempotencyIndex.get(
        this.idempotencyIndexKey(request.runId, event.idempotencyKey),
      ),
    );
    const existingCount = existing.filter(
      (event): event is RunEventV1 => event !== undefined,
    ).length;
    if (existingCount > 0) {
      if (existingCount !== request.events.length) {
        throw new RunEventStoreConflictError(
          "PARTIAL_IDEMPOTENT_BATCH",
          "A retried batch must match the complete original batch.",
        );
      }
      const resolved = existing as readonly RunEventV1[];
      for (const [index, storedEvent] of resolved.entries()) {
        const requestedEvent = request.events[index];
        if (
          requestedEvent === undefined ||
          canonicalize(unsequencedProjection(storedEvent)) !==
            canonicalize(requestedEvent)
        ) {
          throw new RunEventStoreConflictError(
            "IDEMPOTENCY_KEY_REUSED",
            `Idempotency key ${storedEvent.idempotencyKey} was reused with different content.`,
          );
        }
      }
      return {
        events: resolved,
        wasIdempotentReplay: true,
      };
    }

    const stream = this.streams.get(request.runId) ?? [];
    const nextSequenceNumber = stream.length + 1;
    if (request.expectedNextSequenceNumber !== nextSequenceNumber) {
      throw new RunEventStoreConflictError(
        "RUN_SEQUENCE_CONFLICT",
        `Expected sequence ${String(request.expectedNextSequenceNumber)}, but run ${request.runId} requires ${String(nextSequenceNumber)}.`,
      );
    }
    const appended = request.events.map(
      (event, index): RunEventV1 =>
        deepFreeze({
          ...structuredClone(event),
          schemaVersion: "1.0.0",
          sequenceNumber: nextSequenceNumber + index,
        }),
    );
    const nextStream = Object.freeze([...stream, ...appended]);
    this.streams.set(request.runId, nextStream);
    for (const event of appended) {
      this.idempotencyIndex.set(
        this.idempotencyIndexKey(request.runId, event.idempotencyKey),
        event,
      );
    }
    return {
      events: appended,
      wasIdempotentReplay: false,
    };
  }

  async load(runId: string): Promise<readonly RunEventV1[]> {
    return this.streams.get(runId) ?? [];
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
    return (this.streams.get(runId) ?? []).slice(
      0,
      throughSequenceNumber,
    );
  }

  private idempotencyIndexKey(runId: string, idempotencyKey: string): string {
    return `${runId}\u0000${idempotencyKey}`;
  }
}
