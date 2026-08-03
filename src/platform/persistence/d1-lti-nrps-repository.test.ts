// @vitest-environment node

import {
  DatabaseSync,
  type SQLInputValue,
} from "node:sqlite";
import { describe, expect, it } from "vitest";
import { schemaStatements } from "../../../db/schema";
import { FixedClock } from "../../domain/simulation/environment";
import { LTI_LEARNER_ROLE } from "../contracts/lti";
import type {
  ActiveLtiNrpsContext,
} from "./d1-lti-authentication-repository";
import {
  D1LtiNrpsRepository,
} from "./d1-lti-nrps-repository";
import type {
  D1AllResultLike,
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
} from "./d1-types";

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
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    for (const statement of schemaStatements) {
      this.sqlite.exec(statement);
    }
    this.sqlite
      .prepare(
        `INSERT INTO application_users (
          user_id,
          email,
          display_name,
          status,
          created_at_utc
        ) VALUES (?, ?, ?, 'active', ?)`,
      )
      .run(
        "USER_INSTRUCTOR",
        "instructor@example.edu",
        "Instructor",
        "2026-07-28T10:00:00.000Z",
      );
  }

  prepare(query: string): D1PreparedStatementLike {
    return new SqliteStatement(this.sqlite, query);
  }

  async batch(
    statements: readonly D1PreparedStatementLike[],
  ): Promise<readonly D1ResultLike[]> {
    this.sqlite.exec("BEGIN IMMEDIATE");
    const results: D1ResultLike[] = [];
    for (const statement of statements) {
      const result = await statement.run();
      results.push(result);
      if (!result.success) {
        this.sqlite.exec("ROLLBACK");
        return results;
      }
    }
    this.sqlite.exec("COMMIT");
    return results;
  }
}

const context: ActiveLtiNrpsContext = {
  registrationId: "MOODLE_DEMO",
  issuer: "https://moodle.example",
  clientId: "SIMULEDGER_CLIENT",
  deploymentId: "SIMULEDGER_DEPLOYMENT",
  contextId: "COURSE_ACCOUNTING_101",
  endpoint: {
    contextMembershipsUrl:
      "https://moodle.example/mod/lti/services.php/memberships/42",
    serviceVersions: ["2.0"],
  },
};
const clock = new FixedClock("2026-07-28T10:00:00.000Z");

describe("D1 LTI NRPS course roster", () => {
  it("atomically provisions an exact course snapshot and replays one sync id", async () => {
    const database = new SqliteD1Database();
    const repository = new D1LtiNrpsRepository(database, clock);
    const input = {
      syncId: "LTI_NRPS_SYNC_001",
      context,
      synchronizedByUserId: "USER_INSTRUCTOR",
      pageCount: 1,
      members: [
        {
          platformUserId: "MOODLE_LEARNER_1",
          status: "active" as const,
          roles: [LTI_LEARNER_ROLE],
          displayName: "Nguyễn An",
          email: "an@example.edu",
        },
        {
          platformUserId: "MOODLE_LEARNER_2",
          status: "inactive" as const,
          roles: [LTI_LEARNER_ROLE],
          displayName: "Trần Bình",
        },
      ],
    };

    const first = await repository.synchronize(input);
    expect(first).toMatchObject({
      wasIdempotentReplay: false,
      sync: {
        syncId: "LTI_NRPS_SYNC_001",
        contextId: context.contextId,
        receivedMemberCount: 2,
        activeLearnerCount: 1,
        inactiveLearnerCount: 1,
      },
    });
    expect(await repository.listActiveLearners(context)).toEqual([
      {
        schemaVersion: "2.0.0",
        userId: expect.stringMatching(/^USER_LTI_/u),
        displayName: "Nguyễn An",
        email: "an@example.edu",
        source: "LTI_NRPS",
      },
    ]);
    expect(
      database.sqlite
        .prepare(
          `SELECT last_authenticated_at_utc AS lastAuthenticatedAt
           FROM external_user_identities
           WHERE subject = 'MOODLE_LEARNER_1'`,
        )
        .get(),
    ).toEqual({ lastAuthenticatedAt: null });

    const repeated = await repository.synchronize(input);
    expect(repeated.wasIdempotentReplay).toBe(true);
    expect(repeated.sync).toEqual(first.sync);
  });

  it("marks omitted members inactive without changing another course", async () => {
    const repository = new D1LtiNrpsRepository(
      new SqliteD1Database(),
      clock,
    );
    await repository.synchronize({
      syncId: "LTI_NRPS_SYNC_INITIAL",
      context,
      synchronizedByUserId: "USER_INSTRUCTOR",
      pageCount: 1,
      members: [
        {
          platformUserId: "LEARNER_A",
          status: "active",
          roles: [LTI_LEARNER_ROLE],
          displayName: "Learner A",
        },
      ],
    });
    const anotherContext = {
      ...context,
      contextId: "COURSE_ACCOUNTING_202",
      endpoint: {
        ...context.endpoint,
        contextMembershipsUrl:
          "https://moodle.example/mod/lti/services.php/memberships/84",
      },
    };
    await repository.synchronize({
      syncId: "LTI_NRPS_SYNC_OTHER",
      context: anotherContext,
      synchronizedByUserId: "USER_INSTRUCTOR",
      pageCount: 1,
      members: [
        {
          platformUserId: "LEARNER_A",
          status: "active",
          roles: [LTI_LEARNER_ROLE],
          displayName: "Learner A",
        },
      ],
    });
    await repository.synchronize({
      syncId: "LTI_NRPS_SYNC_CURRENT",
      context,
      synchronizedByUserId: "USER_INSTRUCTOR",
      pageCount: 1,
      members: [],
    });

    expect(await repository.listActiveLearners(context)).toEqual([]);
    expect(
      await repository.listActiveLearners(anotherContext),
    ).toHaveLength(1);
  });
});
