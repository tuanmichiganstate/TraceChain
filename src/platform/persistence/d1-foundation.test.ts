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
import { D1CounterfactualRunRepository } from "./d1-counterfactual-run-repository";
import {
  CounterfactualReflectionRepositoryError,
  D1CounterfactualReflectionRepository,
  normalizeCounterfactualReflectionResponse,
} from "./d1-counterfactual-reflection-repository";
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
  it("stores one bounded, idempotent practice reflection per branch", async () => {
    const database = new SqliteD1Database();
    try {
      database.sqlite
        .prepare(
          `INSERT INTO application_users (
            user_id, email, status, created_at_utc
          ) VALUES (?, ?, 'active', ?)`,
        )
        .run(
          "USER_LEARNER_001",
          "learner@example.edu",
          "2026-07-25T03:00:00.000Z",
        );
      await new D1CounterfactualRunRepository(database).create({
        schemaVersion: "1.0.0",
        branchRunId: "RUN_COUNTERFACTUAL_REFLECTION",
        sourceRunId: "RUN_SOURCE_001",
        forkSequenceNumber: 12,
        forkNodeId: "NODE_CERTIFICATE_DECISION",
        forkActorId: "ACTOR_QUALITY_001",
        forkOrganizationId: "ORG_PROCESSOR",
        forkRoleId: "ROLE_QUALITY",
        sourcePackId: "PACK_STANDARD_COFFEE_STAGE3",
        sourcePackVersion: "1.9.0",
        sourceScenarioId: "SCN_COFFEE_STAGE3_FOUNDATION",
        sourceScenarioVersion: "1.9.0",
        sourceConfigurationHash: "a".repeat(64),
        sourceSeed: "COUNTERFACTUAL_SEED",
        sourceStateHash: "b".repeat(64),
        sourceInformationStateHash: "c".repeat(64),
        counterfactualType: "DECISION",
        interventionId: "INT_CERTIFICATE_INITIAL_SUBMITTED",
        comparisonMode: "SINGLE_INTERVENTION",
        createdByUserId: "USER_LEARNER_001",
        createdAt: "2026-07-25T03:10:00.000Z",
      });
      const repository =
        new D1CounterfactualReflectionRepository(database);
      const reflection = {
        schemaVersion: "1.0.0",
        reflectionId: "REFLECTION_001",
        branchRunId: "RUN_COUNTERFACTUAL_REFLECTION",
        response: {
          evidenceThatMattered: "The certificate status.",
          reasonForDifference: "The lot was held.",
          foreseeableConsequences: "Processing would be delayed.",
          laterInformation: "The replacement arrived later.",
          revisedDecisionRule: "Verify before continuing.",
        },
        submittedByUserId: "USER_LEARNER_001",
        submittedAt: "2026-07-25T04:00:00.000Z",
      } as const;

      const created = await repository.create(reflection);
      const replayed = await repository.create({
        ...reflection,
        submittedAt: "2026-07-25T04:01:00.000Z",
      });

      expect(created.wasIdempotentReplay).toBe(false);
      expect(replayed).toEqual({
        reflection,
        wasIdempotentReplay: true,
      });
      expect(await repository.find(reflection.branchRunId)).toEqual(
        reflection,
      );
      await expect(
        repository.create({
          ...reflection,
          response: {
            ...reflection.response,
            revisedDecisionRule: "A different response.",
          },
        }),
      ).rejects.toMatchObject({
        code: "COUNTERFACTUAL_REFLECTION_CONFLICT",
      });
      expect(() =>
        normalizeCounterfactualReflectionResponse({
          ...reflection.response,
          laterInformation: "x".repeat(1_001),
        }),
      ).toThrow(CounterfactualReflectionRepositoryError);
    } finally {
      database.close();
    }
  });

  it("stores immutable copy-on-write branch metadata without source events", async () => {
    const database = new SqliteD1Database();
    try {
      database.sqlite
        .prepare(
          `INSERT INTO application_users (
            user_id, email, status, created_at_utc
          ) VALUES (?, ?, 'active', ?)`,
        )
        .run(
          "USER_LEARNER_001",
          "learner@example.edu",
          "2026-07-25T03:00:00.000Z",
        );
      const repository = new D1CounterfactualRunRepository(database);
      const metadata = {
        schemaVersion: "1.0.0",
        branchRunId: "RUN_COUNTERFACTUAL_001",
        sourceRunId: "RUN_SOURCE_001",
        forkSequenceNumber: 12,
        forkNodeId: "NODE_CERTIFICATE_DECISION",
        forkActorId: "ACTOR_QUALITY_001",
        forkOrganizationId: "ORG_PROCESSOR",
        forkRoleId: "ROLE_QUALITY",
        sourcePackId: "PACK_STANDARD_COFFEE_STAGE3",
        sourcePackVersion: "1.9.0",
        sourceScenarioId: "SCN_COFFEE_STAGE3_FOUNDATION",
        sourceScenarioVersion: "1.9.0",
        sourceConfigurationHash: "a".repeat(64),
        sourceSeed: "COUNTERFACTUAL_SEED",
        sourceStateHash: "b".repeat(64),
        sourceInformationStateHash: "c".repeat(64),
        counterfactualType: "DECISION",
        interventionId: "INT_CERTIFICATE_INITIAL_SUBMITTED",
        comparisonMode: "SINGLE_INTERVENTION",
        createdByUserId: "USER_LEARNER_001",
        createdAt: "2026-07-25T03:10:00.000Z",
      } as const;

      const created = await repository.create(metadata);
      const replayed = await repository.create(
        structuredClone(metadata),
      );

      expect(created.wasIdempotentReplay).toBe(false);
      expect(replayed.wasIdempotentReplay).toBe(true);
      expect(await repository.find(metadata.branchRunId)).toEqual(
        metadata,
      );
      expect(
        await repository.listBySourceRun(metadata.sourceRunId),
      ).toEqual([metadata]);
      expect(
        database.sqlite
          .prepare(
            "SELECT COUNT(*) AS count FROM hosted_run_events WHERE run_id = ?",
          )
          .get(metadata.sourceRunId),
      ).toEqual({ count: 0 });
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
