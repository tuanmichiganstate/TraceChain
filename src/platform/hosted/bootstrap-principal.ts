import type { Clock } from "../../domain/simulation/environment";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type { D1DatabaseLike } from "../persistence/d1-types";

const SELECT_USER = `SELECT user_id
  FROM application_users
  WHERE email = ? COLLATE NOCASE`;
const INSERT_USER = `INSERT OR IGNORE INTO application_users (
    user_id,
    email,
    status,
    created_at_utc
  ) VALUES (?, ?, 'active', ?)`;
const INSERT_ROLE = `INSERT OR IGNORE INTO application_role_assignments (
    user_id,
    application_role,
    assigned_at_utc,
    assigned_by_user_id
  ) VALUES (?, ?, ?, ?)`;

interface UserRow {
  readonly user_id: string;
}

function configuredEmails(value: string | undefined): Set<string> {
  if (value === undefined) return new Set();
  return new Set(
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(
        (email) =>
          email.length > 0 &&
          email.length <= 320 &&
          email.includes("@"),
      ),
  );
}

/**
 * One-time bootstrap for a Sites deployment with an empty D1 database.
 *
 * The allowlist is a server-owned runtime variable. Removing it prevents new
 * bootstrap accounts but deliberately does not erase already provisioned
 * roles.
 */
export async function provisionBootstrapAdministrator(options: {
  readonly database: D1DatabaseLike;
  readonly verifiedEmail: string;
  readonly configuredEmailAllowlist: string | undefined;
  readonly clock: Clock;
}): Promise<boolean> {
  const email = options.verifiedEmail.trim().toLowerCase();
  if (!configuredEmails(options.configuredEmailAllowlist).has(email)) {
    return false;
  }
  const existing = await options.database
    .prepare(SELECT_USER)
    .bind(email)
    .first<UserRow>();
  const userId =
    existing?.user_id ??
    `USER_BOOTSTRAP_${sha256Hex(email).slice(0, 24).toUpperCase()}`;
  const timestamp = options.clock.now();
  const statements = [];
  if (existing === null) {
    statements.push(
      options.database
        .prepare(INSERT_USER)
        .bind(userId, email, timestamp),
    );
  }
  for (const role of [
    "administrator",
    "instructor",
    "scenario-author",
  ]) {
    statements.push(
      options.database
        .prepare(INSERT_ROLE)
        .bind(userId, role, timestamp, userId),
    );
  }
  const results = await options.database.batch(statements);
  const failure = results.find((result) => !result.success);
  if (failure !== undefined) {
    throw new Error(
      failure.error ?? "Bootstrap administrator provisioning failed.",
    );
  }
  return true;
}
