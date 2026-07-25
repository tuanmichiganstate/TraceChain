import {
  DatabaseSync,
  type SQLInputValue,
} from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import type { HostedRunMode } from "../contracts/scenario-pack";
import { validateHostedModeConfiguration } from "../runs/mode-configuration";
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
  it("applies the ordered migrations and backfills bounded run-mode configuration", () => {
    const database = new DatabaseSync(":memory:");
    try {
      for (const migration of [
        "0001_instructor_platform_foundation.sql",
        "0002_assignments.sql",
      ]) {
        database.exec(
          readFileSync(
            resolve(process.cwd(), "db", "migrations", migration),
            "utf8",
          ),
        );
      }
      database
        .prepare(
          `INSERT INTO application_users (
            user_id, email, status, created_at_utc
          ) VALUES (?, ?, 'active', ?)`,
        )
        .run(
          "USER_MIGRATION_001",
          "migration@example.edu",
          "2026-07-24T03:00:00.000Z",
        );
      database
        .prepare(
          `INSERT INTO scenario_pack_versions (
            pack_id,
            pack_version,
            lifecycle_status,
            content_hash,
            pack_json,
            updated_at_utc,
            updated_by_user_id
          ) VALUES (?, ?, 'draft', NULL, '{}', ?, ?)`,
        )
        .run(
          "PACK_MIGRATION_001",
          "1.0.0",
          "2026-07-24T03:00:00.000Z",
          "USER_MIGRATION_001",
        );
      const insertAssignment = database.prepare(
        `INSERT INTO assignments (
          assignment_id,
          creation_command_id,
          title,
          pack_id,
          pack_version,
          scenario_id,
          scenario_version,
          run_mode,
          created_at_utc,
          created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const mode of [
        "tutorial",
        "standard",
        "sandbox",
        "configured",
      ] as const) {
        insertAssignment.run(
          `ASSIGNMENT_${mode.toUpperCase()}`,
          `COMMAND_${mode.toUpperCase()}`,
          `${mode} migration`,
          "PACK_MIGRATION_001",
          "1.0.0",
          "SCENARIO_MIGRATION_001",
          "1.0.0",
          mode,
          "2026-07-24T03:00:00.000Z",
          "USER_MIGRATION_001",
        );
      }

      for (const migration of [
        "0003_rubric_moderation.sql",
        "0004_assignment_mode_configuration.sql",
        "0005_scenario_pack_retirement.sql",
        "0006_scorm_package_jobs.sql",
        "0007_application_access_administration.sql",
      ]) {
        database.exec(
          readFileSync(
            resolve(process.cwd(), "db", "migrations", migration),
            "utf8",
          ),
        );
      }

      const rows = database
        .prepare(
          `SELECT run_mode, mode_configuration_json
          FROM assignments
          ORDER BY run_mode`,
        )
        .all() as {
        readonly run_mode: HostedRunMode;
        readonly mode_configuration_json: string;
      }[];
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        expect(
          validateHostedModeConfiguration(
            JSON.parse(row.mode_configuration_json) as unknown,
            row.run_mode,
          ).mode,
        ).toBe(row.run_mode);
      }
      const tableNames = database
        .prepare(
          `SELECT name
          FROM sqlite_master
          WHERE type = 'table'
          ORDER BY name`,
        )
        .all()
        .map((row) => (row as { readonly name: string }).name);
      expect(tableNames).toEqual(
        expect.arrayContaining([
          "rubric_moderation_resolutions",
          "scorm_package_jobs",
          "application_access_commands",
        ]),
      );
      const packColumns = database
        .prepare("PRAGMA table_info(scenario_pack_versions)")
        .all()
        .map((row) => (row as { readonly name: string }).name);
      expect(packColumns).toEqual(
        expect.arrayContaining([
          "retirement_command_id",
          "retired_at_utc",
          "retired_by_user_id",
        ]),
      );
    } finally {
      database.close();
    }
  });

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
      expect(await repository.list()).toEqual([
        expect.objectContaining({
          packId: draft.packId,
          version: draft.version,
          status: "published",
          contentHash: published.publication?.contentHash,
        }),
      ]);

      await expect(repository.saveDraft(draft)).rejects.toBeInstanceOf(
        ScenarioPackPublicationError,
      );
      await expect(
        repository.publish(draft.packId, draft.version, {
          publishedAt: "2026-07-24T04:00:00.000Z",
          publishedBy: "USER_AUTHOR_002",
        }),
      ).rejects.toBeInstanceOf(ScenarioPackPublicationError);

      const retirement = {
        commandId: "CMD_RETIRE_PACK_001",
        retiredAt: "2026-07-24T05:00:00.000Z",
        retiredBy: "USER_AUTHOR_001",
      } as const;
      const firstRetirement = await repository.retire(
        draft.packId,
        draft.version,
        retirement,
      );
      const replayedRetirement = await repository.retire(
        draft.packId,
        draft.version,
        retirement,
      );
      expect(firstRetirement.wasIdempotentReplay).toBe(false);
      expect(replayedRetirement.wasIdempotentReplay).toBe(true);
      expect(firstRetirement.pack.status).toBe("retired");
      expect(
        firstRetirement.pack.publication?.contentHash,
      ).toBe(published.publication?.contentHash);
      expect(verifyScenarioPackContentHash(firstRetirement.pack)).toBe(true);
      expect(
        await repository.find(draft.packId, draft.version),
      ).toEqual(firstRetirement.pack);
      expect(await repository.list()).toEqual([
        expect.objectContaining({
          packId: draft.packId,
          version: draft.version,
          status: "retired",
          retiredAt: retirement.retiredAt,
          retiredByUserId: retirement.retiredBy,
        }),
      ]);
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
