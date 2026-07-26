import {
  currentD1SchemaVersion,
  schemaStatements,
} from "../../../db/schema";
import type { D1DatabaseLike } from "./d1-types";

const initializationByDatabase = new WeakMap<
  object,
  Promise<void>
>();

const resetStatements = [
  "DROP TABLE IF EXISTS counterfactual_reflections",
  "DROP TABLE IF EXISTS rubric_moderation_resolutions",
  "DROP TABLE IF EXISTS rubric_rating_revisions",
  "DROP TABLE IF EXISTS assignment_learners",
  "DROP TABLE IF EXISTS counterfactual_runs",
  "DROP TABLE IF EXISTS assignments",
  "DROP TABLE IF EXISTS scenario_pack_versions",
  "DROP TABLE IF EXISTS external_user_identities",
  "DROP TABLE IF EXISTS lti_sessions",
  "DROP TABLE IF EXISTS scorm_package_jobs",
  "DROP TABLE IF EXISTS application_access_commands",
  "DROP TABLE IF EXISTS application_role_assignments",
  "DROP TABLE IF EXISTS lti_login_states",
  "DROP TABLE IF EXISTS hosted_run_events",
  "DROP TABLE IF EXISTS application_users",
  "DROP TABLE IF EXISTS tracechain_schema_metadata",
] as const;

function assertSuccessfulBatch(
  results: readonly {
    readonly success: boolean;
    readonly error?: string;
  }[],
): void {
  const failure = results.find((result) => !result.success);
  if (failure !== undefined) {
    throw new Error(
      failure.error ?? "D1 schema initialization failed.",
    );
  }
}

async function installCurrentSchema(
  database: D1DatabaseLike,
  reset: boolean,
): Promise<void> {
  const statements = reset
    ? [...resetStatements, ...schemaStatements]
    : schemaStatements;
  const results = await database.batch(
    statements.map((statement) =>
      database.prepare(statement),
    ),
  );
  assertSuccessfulBatch(results);
}

async function initialize(database: D1DatabaseLike): Promise<void> {
  const metadataTable = await database
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name = 'tracechain_schema_metadata'`,
    )
    .first<{ readonly name: string }>();

  if (metadataTable === null) {
    await installCurrentSchema(database, true);
    return;
  }

  const metadata = await database
    .prepare(
      `SELECT schema_version AS schemaVersion
       FROM tracechain_schema_metadata
       WHERE singleton_id = 1`,
    )
    .first<{ readonly schemaVersion: string }>();

  await installCurrentSchema(
    database,
    metadata?.schemaVersion !== currentD1SchemaVersion,
  );
}

/**
 * Runtime guard for the one supported pre-release D1 schema.
 *
 * Development data is deliberately discarded when the exact schema version
 * changes. TraceChain has no migration or compatibility path before release.
 */
export function ensureD1FoundationSchema(
  database: D1DatabaseLike,
): Promise<void> {
  const existing = initializationByDatabase.get(database);
  if (existing !== undefined) return existing;
  const pending = initialize(database).catch((error: unknown) => {
    initializationByDatabase.delete(database);
    throw error;
  });
  initializationByDatabase.set(database, pending);
  return pending;
}
