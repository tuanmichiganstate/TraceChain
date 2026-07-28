// @vitest-environment node

import {
  DatabaseSync,
  type SQLInputValue,
} from "node:sqlite";
import { describe, expect, it } from "vitest";
import { schemaStatements } from "../../../db/schema";
import type { Clock } from "../../domain/simulation/environment";
import {
  D1LtiAgsRepository,
} from "./d1-lti-ags-repository";
import type {
  D1AllResultLike,
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
} from "./d1-types";

class MutableClock implements Clock {
  constructor(private current: string) {}

  now(): string {
    return this.current;
  }

  set(value: string): void {
    this.current = value;
  }
}

class SqliteStatement implements D1PreparedStatementLike {
  private bindings: readonly unknown[] = [];

  constructor(
    private readonly database: DatabaseSync,
    private readonly query: string,
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementLike {
    const statement = new SqliteStatement(this.database, this.query);
    statement.bindings = values;
    return statement;
  }

  async first<Row>(): Promise<Row | null> {
    return (
      this.database
        .prepare(this.query)
        .get(...(this.bindings as readonly SQLInputValue[])) ?? null
    ) as Row | null;
  }

  async all<Row>(): Promise<D1AllResultLike<Row>> {
    return {
      success: true,
      results: this.database
        .prepare(this.query)
        .all(...(this.bindings as readonly SQLInputValue[])) as Row[],
    };
  }

  async run(): Promise<D1ResultLike> {
    try {
      const result = this.database
        .prepare(this.query)
        .run(...(this.bindings as readonly SQLInputValue[]));
      return {
        success: true,
        meta: { changes: Number(result.changes) },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        meta: { changes: 0 },
      };
    }
  }
}

class SqliteD1Database implements D1DatabaseLike {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    const table = schemaStatements.find((statement) =>
      statement.includes(
        "CREATE TABLE IF NOT EXISTS lti_ags_score_deliveries",
      ),
    );
    if (table === undefined) {
      throw new Error("The AGS delivery schema is unavailable.");
    }
    this.sqlite.exec("PRAGMA foreign_keys = OFF");
    this.sqlite.exec(table);
  }

  prepare(query: string): D1PreparedStatementLike {
    return new SqliteStatement(this.sqlite, query);
  }

  async batch(
    statements: readonly D1PreparedStatementLike[],
  ): Promise<readonly D1ResultLike[]> {
    return Promise.all(
      statements.map((statement) => statement.run()),
    );
  }
}

const input = {
  deliveryId: "LTI_AGS_DELIVERY_001",
  runId: "RUN_001",
  assignmentId: "ASSIGNMENT_001",
  registrationId: "MOODLE_DEMO",
  platformUserId: "MOODLE_LEARNER_77",
  lineItemUrl:
    "https://moodle.example/mod/lti/services.php/lineitems/7",
  score: {
    userId: "MOODLE_LEARNER_77",
    timestamp: "2026-07-28T09:15:00.000Z",
    activityProgress: "Completed" as const,
    gradingProgress: "FullyGraded" as const,
    scoreGiven: 82,
    scoreMaximum: 100,
  },
};

describe("D1 LTI AGS delivery outbox", () => {
  it("persists, claims, and completes one idempotent delivery", async () => {
    const clock = new MutableClock("2026-07-28T09:30:00.000Z");
    const repository = new D1LtiAgsRepository(
      new SqliteD1Database(),
      clock,
    );

    expect(await repository.createOrFind(input)).toMatchObject({
      status: "pending",
      attemptCount: 0,
      score: input.score,
    });
    expect(await repository.claim(input.deliveryId)).toMatchObject({
      wasClaimed: true,
      delivery: {
        status: "delivering",
        attemptCount: 1,
      },
    });
    expect(await repository.claim(input.deliveryId)).toMatchObject({
      wasClaimed: false,
      delivery: {
        status: "delivering",
        attemptCount: 1,
      },
    });
    clock.set("2026-07-28T09:36:00.000Z");
    expect(await repository.claim(input.deliveryId)).toMatchObject({
      wasClaimed: true,
      delivery: {
        status: "delivering",
        attemptCount: 2,
      },
    });
    clock.set("2026-07-28T09:36:01.000Z");
    expect(
      await repository.markDelivered(input.deliveryId),
    ).toMatchObject({
      status: "delivered",
      attemptCount: 2,
      deliveredAt: "2026-07-28T09:36:01.000Z",
    });
    expect(await repository.createOrFind(input)).toMatchObject({
      status: "delivered",
      attemptCount: 2,
    });
  });

  it("rejects reuse of a run delivery with different score evidence", async () => {
    const repository = new D1LtiAgsRepository(
      new SqliteD1Database(),
      new MutableClock("2026-07-28T09:30:00.000Z"),
    );
    await repository.createOrFind(input);

    await expect(
      repository.createOrFind({
        ...input,
        score: { ...input.score, scoreGiven: 83 },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "LTI_AGS_DELIVERY_CONFLICT",
      }),
    );
  });

  it("records failure and permits a bounded retry claim", async () => {
    const clock = new MutableClock("2026-07-28T09:30:00.000Z");
    const repository = new D1LtiAgsRepository(
      new SqliteD1Database(),
      clock,
    );
    await repository.createOrFind(input);
    await repository.claim(input.deliveryId);
    await repository.markFailed(
      input.deliveryId,
      new Error("Moodle unavailable"),
    );
    clock.set("2026-07-28T09:31:00.000Z");

    const retried = await repository.claim(input.deliveryId);
    expect(retried).toMatchObject({
      wasClaimed: true,
      delivery: {
        status: "delivering",
        attemptCount: 2,
      },
    });
    expect("lastError" in retried.delivery).toBe(false);
  });
});
