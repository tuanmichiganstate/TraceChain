import {
  DatabaseSync,
  type SQLInputValue,
} from "node:sqlite";
import packJson from "../../../scenario-packs/standard-coffee-stage3/tracechain.pack.json";
import { schemaStatements } from "../../../db/schema";
import { FixedClock } from "../../domain/simulation/environment";
import {
  AuthenticatedPrincipalError,
  resolveAuthenticatedPrincipal,
} from "../hosted/authenticated-principal";
import {
  ScenarioPackPublicationError,
  verifyScenarioPackContentHash,
} from "../scenario-packs/publication";
import { validateScenarioPack } from "../scenario-packs/validation";
import { D1ApplicationPrincipalRepository } from "./d1-principal-repository";
import { D1ScenarioPackRepository } from "./d1-scenario-pack-repository";
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
  }

  prepare(query: string): D1PreparedStatementLike {
    return new SqliteStatement(this.sqlite, query);
  }

  async batch(
    statements: readonly D1PreparedStatementLike[],
  ): Promise<readonly D1ResultLike[]> {
    this.sqlite.exec("BEGIN IMMEDIATE");
    const results: D1ResultLike[] = [];
    try {
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
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.sqlite.close();
  }
}

function draftPack() {
  const result = validateScenarioPack(structuredClone(packJson));
  if (!result.isValid) {
    throw new Error("D1 tests require a valid Stage 3 pack.");
  }
  return result.pack;
}

describe("D1 instructor-platform foundation", () => {
  it("stores drafts and enforces immutable content-addressed publication", async () => {
    const database = new SqliteD1Database();
    try {
      const repository = new D1ScenarioPackRepository(
        database,
        new FixedClock("2026-07-24T03:00:00.000Z"),
        "USER_AUTHOR_001",
      );
      const draft = draftPack();
      await repository.saveDraft(draft);
      expect(
        await repository.find(draft.packId, draft.version),
      ).toEqual(draft);

      const published = await repository.publish(
        draft.packId,
        draft.version,
        {
          publishedAt: "2026-07-24T03:00:00.000Z",
          publishedBy: "USER_AUTHOR_001",
        },
      );
      expect(published.status).toBe("published");
      expect(verifyScenarioPackContentHash(published)).toBe(true);
      expect(
        await repository.find(draft.packId, draft.version),
      ).toEqual(published);

      await expect(repository.saveDraft(draft)).rejects.toBeInstanceOf(
        ScenarioPackPublicationError,
      );
      await expect(
        repository.publish(draft.packId, draft.version, {
          publishedAt: "2026-07-24T04:00:00.000Z",
          publishedBy: "USER_AUTHOR_002",
        }),
      ).rejects.toBeInstanceOf(ScenarioPackPublicationError);
    } finally {
      database.close();
    }
  });

  it("derives application roles from D1 using only the verified hosting email", async () => {
    const database = new SqliteD1Database();
    try {
      database.sqlite
        .prepare(
          `INSERT INTO application_users (
            user_id, email, status, created_at_utc
          ) VALUES (?, ?, 'active', ?)`,
        )
        .run(
          "USER_INSTRUCTOR_001",
          "Instructor@Example.edu",
          "2026-07-24T03:00:00.000Z",
        );
      const insertRole = database.sqlite.prepare(
        `INSERT INTO application_role_assignments (
          user_id,
          application_role,
          assigned_at_utc,
          assigned_by_user_id
        ) VALUES (?, ?, ?, ?)`,
      );
      insertRole.run(
        "USER_INSTRUCTOR_001",
        "instructor",
        "2026-07-24T03:00:00.000Z",
        "USER_ADMIN_001",
      );
      insertRole.run(
        "USER_INSTRUCTOR_001",
        "scenario-author",
        "2026-07-24T03:00:00.000Z",
        "USER_ADMIN_001",
      );
      const repository = new D1ApplicationPrincipalRepository(database);
      const request = new Request("https://tracechain.example/api/v1/session", {
        headers: {
          "oai-authenticated-user-email": "instructor@example.EDU",
          "x-tracechain-role": "administrator",
        },
      });

      await expect(
        resolveAuthenticatedPrincipal(request, repository),
      ).resolves.toEqual({
        userId: "USER_INSTRUCTOR_001",
        email: "Instructor@Example.edu",
        roles: ["instructor", "scenario-author"],
      });
      await expect(
        resolveAuthenticatedPrincipal(
          new Request("https://tracechain.example/api/v1/session"),
          repository,
        ),
      ).rejects.toMatchObject({
        code: "AUTHENTICATION_REQUIRED",
      });
      await expect(
        resolveAuthenticatedPrincipal(
          new Request("https://tracechain.example/api/v1/session", {
            headers: {
              "oai-authenticated-user-email": "unknown@example.edu",
            },
          }),
          repository,
        ),
      ).rejects.toBeInstanceOf(AuthenticatedPrincipalError);
    } finally {
      database.close();
    }
  });
});
