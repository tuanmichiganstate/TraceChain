import type { Clock } from "../../domain/simulation/environment";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type {
  ApplicationUserAccessV1,
  ApplicationUserStatus,
  UpsertApplicationUserAccessRequest,
  UpsertApplicationUserAccessResult,
} from "../contracts/access-administration";
import type { ApplicationRole } from "../contracts/run-events";
import type { ApplicationPrincipal } from "../hosted/access";
import type { D1DatabaseLike } from "./d1-types";

const APPLICATION_ROLES = new Set<ApplicationRole>([
  "learner",
  "instructor",
  "scenario-author",
  "administrator",
  "rater",
]);

const LIST_USERS = `SELECT
    users.user_id,
    users.email,
    users.status,
    users.created_at_utc,
    roles.application_role
  FROM application_users AS users
  LEFT JOIN application_role_assignments AS roles
    ON roles.user_id = users.user_id
  ORDER BY users.email COLLATE NOCASE, roles.application_role`;
const FIND_USER_BY_EMAIL = `SELECT
    user_id,
    email,
    status,
    created_at_utc
  FROM application_users
  WHERE email = ? COLLATE NOCASE`;
const FIND_COMMAND = `SELECT
    command_id,
    target_email,
    target_status,
    roles_json,
    result_json,
    performed_by_user_id
  FROM application_access_commands
  WHERE command_id = ?`;
const INSERT_USER = `INSERT INTO application_users (
    user_id,
    email,
    status,
    created_at_utc
  ) VALUES (?, ?, ?, ?)`;
const UPDATE_USER_STATUS = `UPDATE application_users
  SET status = ?
  WHERE user_id = ?`;
const DELETE_ROLES = `DELETE FROM application_role_assignments
  WHERE user_id = ?`;
const INSERT_ROLE = `INSERT INTO application_role_assignments (
    user_id,
    application_role,
    assigned_at_utc,
    assigned_by_user_id
  ) VALUES (?, ?, ?, ?)`;
const INSERT_COMMAND = `INSERT INTO application_access_commands (
    command_id,
    target_user_id,
    target_email,
    target_status,
    roles_json,
    result_json,
    performed_at_utc,
    performed_by_user_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

interface UserRow {
  readonly user_id: string;
  readonly email: string;
  readonly status: string;
  readonly created_at_utc: string;
  readonly application_role?: string | null;
}

interface AccessCommandRow {
  readonly command_id: string;
  readonly target_email: string;
  readonly target_status: string;
  readonly roles_json: string;
  readonly result_json: string;
  readonly performed_by_user_id: string;
}

interface NormalizedRequest {
  readonly commandId: string;
  readonly email: string;
  readonly status: ApplicationUserStatus;
  readonly roles: readonly ApplicationRole[];
}

export class ApplicationAccessRepositoryError extends Error {
  constructor(
    readonly code:
      | "INVALID_ACCESS_COMMAND"
      | "ACCESS_COMMAND_CONFLICT"
      | "SELF_ADMINISTRATION_FORBIDDEN"
      | "ACCESS_STORAGE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "ApplicationAccessRepositoryError";
  }
}

function invalid(message: string): never {
  throw new ApplicationAccessRepositoryError(
    "INVALID_ACCESS_COMMAND",
    message,
  );
}

function normalizedRequest(
  request: UpsertApplicationUserAccessRequest,
): NormalizedRequest {
  const commandId = request.commandId.trim();
  const email = request.email.trim().toLowerCase();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u.test(commandId)) {
    invalid("Access command ID is invalid.");
  }
  if (
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+$/u.test(email)
  ) {
    invalid("A bounded email address is required.");
  }
  if (!["active", "disabled"].includes(request.status)) {
    invalid("Application-user status is invalid.");
  }
  if (
    !Array.isArray(request.roles) ||
    request.roles.length === 0 ||
    request.roles.some((role) => !APPLICATION_ROLES.has(role))
  ) {
    invalid("At least one recognized application role is required.");
  }
  const roles = [...new Set(request.roles)].sort();
  if (roles.length !== request.roles.length) {
    invalid("Application roles must not contain duplicates.");
  }
  return {
    commandId,
    email,
    status: request.status,
    roles,
  };
}

function storedResult(row: AccessCommandRow): ApplicationUserAccessV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.result_json);
  } catch {
    throw new ApplicationAccessRepositoryError(
      "ACCESS_STORAGE_FAILED",
      "Stored access-command result is not valid JSON.",
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { schemaVersion?: unknown }).schemaVersion !== "1.0.0"
  ) {
    throw new ApplicationAccessRepositoryError(
      "ACCESS_STORAGE_FAILED",
      "Stored access-command result has an invalid schema.",
    );
  }
  return parsed as ApplicationUserAccessV1;
}

function replayResult(
  row: AccessCommandRow,
  request: NormalizedRequest,
  principal: ApplicationPrincipal,
): UpsertApplicationUserAccessResult {
  if (
    row.target_email.toLowerCase() !== request.email ||
    row.target_status !== request.status ||
    row.roles_json !== JSON.stringify(request.roles) ||
    row.performed_by_user_id !== principal.userId
  ) {
    throw new ApplicationAccessRepositoryError(
      "ACCESS_COMMAND_CONFLICT",
      "Access command ID is already bound to another request.",
    );
  }
  return {
    user: storedResult(row),
    wasIdempotentReplay: true,
  };
}

function roleFromRow(value: string): ApplicationRole {
  if (!APPLICATION_ROLES.has(value as ApplicationRole)) {
    throw new ApplicationAccessRepositoryError(
      "ACCESS_STORAGE_FAILED",
      "Stored application role is invalid.",
    );
  }
  return value as ApplicationRole;
}

export class D1ApplicationAccessRepository {
  constructor(
    private readonly database: D1DatabaseLike,
    private readonly clock: Clock,
  ) {}

  async list(): Promise<readonly ApplicationUserAccessV1[]> {
    const result = await this.database
      .prepare(LIST_USERS)
      .all<UserRow>();
    if (!result.success) {
      throw new ApplicationAccessRepositoryError(
        "ACCESS_STORAGE_FAILED",
        result.error ?? "Application users could not be listed.",
      );
    }
    const users = new Map<string, ApplicationUserAccessV1>();
    for (const row of result.results) {
      if (
        row.status !== "active" &&
        row.status !== "disabled"
      ) {
        throw new ApplicationAccessRepositoryError(
          "ACCESS_STORAGE_FAILED",
          "Stored application-user status is invalid.",
        );
      }
      const existing = users.get(row.user_id);
      const role =
        row.application_role === null ||
        row.application_role === undefined
          ? null
          : roleFromRow(row.application_role);
      if (existing === undefined) {
        users.set(row.user_id, {
          schemaVersion: "1.0.0",
          userId: row.user_id,
          email: row.email,
          status: row.status,
          roles: role === null ? [] : [role],
          createdAt: row.created_at_utc,
        });
      } else if (role !== null) {
        users.set(row.user_id, {
          ...existing,
          roles: [...existing.roles, role],
        });
      }
    }
    return [...users.values()];
  }

  async upsert(
    request: UpsertApplicationUserAccessRequest,
    principal: ApplicationPrincipal,
  ): Promise<UpsertApplicationUserAccessResult> {
    const normalized = normalizedRequest(request);
    const replay = await this.database
      .prepare(FIND_COMMAND)
      .bind(normalized.commandId)
      .first<AccessCommandRow>();
    if (replay !== null) {
      return replayResult(replay, normalized, principal);
    }
    const existing = await this.database
      .prepare(FIND_USER_BY_EMAIL)
      .bind(normalized.email)
      .first<UserRow>();
    const timestamp = this.clock.now();
    const userId =
      existing?.user_id ??
      `USER_${sha256Hex(normalized.email)
        .slice(0, 24)
        .toUpperCase()}`;
    if (
      userId === principal.userId &&
      (normalized.status !== "active" ||
        !normalized.roles.includes("administrator"))
    ) {
      throw new ApplicationAccessRepositoryError(
        "SELF_ADMINISTRATION_FORBIDDEN",
        "An administrator cannot disable or remove their own administrator access.",
      );
    }
    const user: ApplicationUserAccessV1 = {
      schemaVersion: "1.0.0",
      userId,
      email: normalized.email,
      status: normalized.status,
      roles: normalized.roles,
      createdAt: existing?.created_at_utc ?? timestamp,
    };
    const statements = [
      existing === null
        ? this.database
            .prepare(INSERT_USER)
            .bind(
              userId,
              normalized.email,
              normalized.status,
              timestamp,
            )
        : this.database
            .prepare(UPDATE_USER_STATUS)
            .bind(normalized.status, userId),
      this.database.prepare(DELETE_ROLES).bind(userId),
      ...normalized.roles.map((role) =>
        this.database
          .prepare(INSERT_ROLE)
          .bind(userId, role, timestamp, principal.userId),
      ),
      this.database
        .prepare(INSERT_COMMAND)
        .bind(
          normalized.commandId,
          userId,
          normalized.email,
          normalized.status,
          JSON.stringify(normalized.roles),
          JSON.stringify(user),
          timestamp,
          principal.userId,
        ),
    ];
    const results = await this.database.batch(statements);
    if (results.some((result) => !result.success)) {
      const concurrentReplay = await this.database
        .prepare(FIND_COMMAND)
        .bind(normalized.commandId)
        .first<AccessCommandRow>();
      if (concurrentReplay !== null) {
        return replayResult(
          concurrentReplay,
          normalized,
          principal,
        );
      }
      throw new ApplicationAccessRepositoryError(
        "ACCESS_STORAGE_FAILED",
        "Application access could not be stored atomically.",
      );
    }
    return { user, wasIdempotentReplay: false };
  }
}
