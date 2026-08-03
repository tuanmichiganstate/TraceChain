import {
  DatabaseSync,
  type SQLInputValue,
} from "node:sqlite";
import {
  currentD1SchemaVersion,
  schemaStatements,
} from "../../../db/schema";
import { ensureD1FoundationSchema } from "./d1-schema";
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
      };
    }
  }
}

class SqliteD1Database implements D1DatabaseLike {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec("PRAGMA foreign_keys = ON");
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
}

describe("D1 current-schema installer", () => {
  it("installs the current schema in a fresh database", async () => {
    const database = new SqliteD1Database();

    await ensureD1FoundationSchema(database);

    const metadata = database.sqlite
      .prepare(
        `SELECT schema_version AS schemaVersion
         FROM simuledger_schema_metadata
         WHERE singleton_id = 1`,
      )
      .get() as { readonly schemaVersion: string };
    expect(metadata.schemaVersion).toBe(currentD1SchemaVersion);
    expect(
      database.sqlite
        .prepare(
          `SELECT COUNT(*) AS count
           FROM sqlite_master
           WHERE type = 'table'
             AND name = 'lti_sessions'`,
        )
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database.sqlite
        .prepare(
          `SELECT COUNT(*) AS count
           FROM sqlite_master
           WHERE type = 'table'
             AND name = 'lti_context_memberships'`,
        )
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database.sqlite
        .prepare(
          `SELECT COUNT(*) AS count
           FROM sqlite_master
           WHERE type = 'table'
             AND name = 'lti_ags_score_deliveries'`,
        )
        .get(),
    ).toEqual({ count: 1 });
  });

  it("resets a development database without current schema metadata", async () => {
    const database = new SqliteD1Database();
    database.sqlite.exec(`
      CREATE TABLE application_users (
        user_id TEXT PRIMARY KEY,
        email TEXT NOT NULL
      ) STRICT;
      INSERT INTO application_users (user_id, email)
      VALUES ('OBSOLETE_USER', 'obsolete@example.edu');
    `);

    await ensureD1FoundationSchema(database);

    expect(
      database.sqlite
        .prepare("SELECT COUNT(*) AS count FROM application_users")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database.sqlite
        .prepare(
          `SELECT "notnull" AS not_null
           FROM pragma_table_info('application_users')
           WHERE name = 'email'`,
        )
        .get(),
    ).toEqual({ not_null: 0 });
  });

  it("preserves data only when the exact schema version matches", async () => {
    const currentDatabase = new SqliteD1Database();
    for (const statement of schemaStatements) {
      currentDatabase.sqlite.exec(statement);
    }
    currentDatabase.sqlite
      .prepare(
        `INSERT INTO application_users (
          user_id,
          display_name,
          status,
          created_at_utc
        ) VALUES (?, ?, 'active', ?)`,
      )
      .run("CURRENT_USER", "Current user", "2026-07-26T00:00:00.000Z");

    await ensureD1FoundationSchema(currentDatabase);

    expect(
      currentDatabase.sqlite
        .prepare("SELECT user_id AS userId FROM application_users")
        .all(),
    ).toEqual([{ userId: "CURRENT_USER" }]);

    const obsoleteDatabase = new SqliteD1Database();
    for (const statement of schemaStatements) {
      obsoleteDatabase.sqlite.exec(statement);
    }
    obsoleteDatabase.sqlite
      .prepare(
        `UPDATE simuledger_schema_metadata
         SET schema_version = 'obsolete'`,
      )
      .run();
    obsoleteDatabase.sqlite
      .prepare(
        `INSERT INTO application_users (
          user_id,
          display_name,
          status,
          created_at_utc
        ) VALUES (?, ?, 'active', ?)`,
      )
      .run("OBSOLETE_USER", "Obsolete user", "2026-07-26T00:00:00.000Z");

    await ensureD1FoundationSchema(obsoleteDatabase);

    expect(
      obsoleteDatabase.sqlite
        .prepare("SELECT COUNT(*) AS count FROM application_users")
        .get(),
    ).toEqual({ count: 0 });
  });
});
