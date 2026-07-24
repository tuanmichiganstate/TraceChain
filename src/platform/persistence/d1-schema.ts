import { schemaStatements } from "../../../db/schema";
import type { D1DatabaseLike } from "./d1-types";

const initializationByDatabase = new WeakMap<
  object,
  Promise<void>
>();

async function initialize(database: D1DatabaseLike): Promise<void> {
  const results = await database.batch(
    schemaStatements.map((statement) =>
      database.prepare(statement),
    ),
  );
  const failure = results.find((result) => !result.success);
  if (failure !== undefined) {
    throw new Error(
      failure.error ?? "D1 schema initialization failed.",
    );
  }
}

/**
 * Idempotent runtime guard for a newly provisioned Sites-owned D1 database.
 * Migration files remain authoritative history; this guard only executes the
 * current CREATE IF NOT EXISTS statements.
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
