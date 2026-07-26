import type { Clock } from "../../domain/simulation/environment";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type { LtiLearningContextV1 } from "../contracts/lti";
import type { ApplicationPrincipal } from "../hosted/access";
import type { D1DatabaseLike } from "./d1-types";

const FIND_LOGIN_STATE = `SELECT
    state_hash,
    nonce_hash,
    registration_id,
    target_link_uri,
    created_at_utc,
    expires_at_utc,
    consumed_at_utc
  FROM lti_login_states
  WHERE state_hash = ?`;
const INSERT_LOGIN_STATE = `INSERT INTO lti_login_states (
    state_hash,
    nonce_hash,
    registration_id,
    target_link_uri,
    created_at_utc,
    expires_at_utc
  ) VALUES (?, ?, ?, ?, ?, ?)`;
const DELETE_FINISHED_LOGIN_STATES = `DELETE FROM lti_login_states
  WHERE expires_at_utc <= ?
    OR consumed_at_utc IS NOT NULL`;
const CONSUME_LOGIN_STATE = `UPDATE lti_login_states
  SET consumed_at_utc = ?
  WHERE state_hash = ?
    AND consumed_at_utc IS NULL
    AND expires_at_utc > ?`;
const FIND_EXTERNAL_IDENTITY = `SELECT
    identities.identity_id,
    identities.user_id,
    users.status
  FROM external_user_identities AS identities
  JOIN application_users AS users
    ON users.user_id = identities.user_id
  WHERE identities.provider = 'lti-1.3'
    AND identities.issuer = ?
    AND identities.client_id = ?
    AND identities.deployment_id = ?
    AND identities.subject = ?`;
const INSERT_LTI_USER = `INSERT OR IGNORE INTO application_users (
    user_id,
    email,
    display_name,
    status,
    created_at_utc
  ) VALUES (?, ?, ?, 'active', ?)`;
const INSERT_INSTRUCTOR_ROLE = `INSERT OR IGNORE INTO application_role_assignments (
    user_id,
    application_role,
    assigned_at_utc,
    assigned_by_user_id
  ) VALUES (?, 'instructor', ?, ?)`;
const INSERT_EXTERNAL_IDENTITY = `INSERT OR IGNORE INTO external_user_identities (
    identity_id,
    provider,
    issuer,
    client_id,
    deployment_id,
    subject,
    user_id,
    email_claim,
    display_name_claim,
    created_at_utc,
    last_authenticated_at_utc
  ) VALUES (?, 'lti-1.3', ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const UPDATE_EXTERNAL_IDENTITY = `UPDATE external_user_identities
  SET email_claim = ?,
      display_name_claim = ?,
      last_authenticated_at_utc = ?
  WHERE identity_id = ?`;
const INSERT_SESSION = `INSERT INTO lti_sessions (
    session_token_hash,
    user_id,
    registration_id,
    issuer,
    client_id,
    deployment_id,
    subject,
    context_id,
    resource_link_id,
    context_label,
    context_title,
    return_url,
    platform_roles_json,
    issued_at_utc,
    expires_at_utc
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const DELETE_FINISHED_SESSIONS = `DELETE FROM lti_sessions
  WHERE expires_at_utc <= ?
    OR revoked_at_utc IS NOT NULL`;
const FIND_ACTIVE_SESSION = `SELECT
    sessions.registration_id,
    sessions.issuer,
    sessions.client_id,
    sessions.deployment_id,
    sessions.context_id,
    sessions.resource_link_id,
    sessions.context_label,
    sessions.context_title,
    sessions.return_url,
    users.user_id,
    COALESCE(identities.email_claim, users.email) AS email,
    COALESCE(
      identities.display_name_claim,
      users.display_name
    ) AS display_name
  FROM lti_sessions AS sessions
  JOIN application_users AS users
    ON users.user_id = sessions.user_id
  JOIN external_user_identities AS identities
    ON identities.user_id = users.user_id
    AND identities.provider = 'lti-1.3'
    AND identities.issuer = sessions.issuer
    AND identities.client_id = sessions.client_id
    AND identities.deployment_id = sessions.deployment_id
    AND identities.subject = sessions.subject
  JOIN application_role_assignments AS roles
    ON roles.user_id = users.user_id
  WHERE sessions.session_token_hash = ?
    AND sessions.revoked_at_utc IS NULL
    AND sessions.expires_at_utc > ?
    AND users.status = 'active'
    AND roles.application_role = 'instructor'`;
const REVOKE_SESSION = `UPDATE lti_sessions
  SET revoked_at_utc = ?
  WHERE session_token_hash = ?
    AND revoked_at_utc IS NULL`;

interface LoginStateRow {
  readonly state_hash: string;
  readonly nonce_hash: string;
  readonly registration_id: string;
  readonly target_link_uri: string;
  readonly created_at_utc: string;
  readonly expires_at_utc: string;
  readonly consumed_at_utc: string | null;
}

interface ExternalIdentityRow {
  readonly identity_id: string;
  readonly user_id: string;
  readonly status: string;
}

interface SessionRow {
  readonly registration_id: string;
  readonly issuer: string;
  readonly client_id: string;
  readonly deployment_id: string;
  readonly context_id: string;
  readonly resource_link_id: string;
  readonly context_label: string | null;
  readonly context_title: string | null;
  readonly return_url: string | null;
  readonly user_id: string;
  readonly email: string | null;
  readonly display_name: string | null;
}

export interface ConsumedLtiLoginState {
  readonly stateHash: string;
  readonly nonceHash: string;
  readonly registrationId: string;
  readonly targetLinkUri: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface LtiIdentityInput {
  readonly issuer: string;
  readonly clientId: string;
  readonly deploymentId: string;
  readonly subject: string;
  readonly email?: string;
  readonly displayName?: string;
}

export interface LtiSessionInput extends LtiIdentityInput {
  readonly sessionTokenHash: string;
  readonly registrationId: string;
  readonly context: LtiLearningContextV1;
  readonly platformRoles: readonly string[];
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export class LtiAuthenticationRepositoryError extends Error {
  constructor(
    readonly code:
      | "LTI_LOGIN_STATE_CONFLICT"
      | "LTI_LOGIN_STATE_INVALID"
      | "LTI_IDENTITY_DISABLED"
      | "LTI_STORAGE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "LtiAuthenticationRepositoryError";
  }
}

function boundedClaim(
  value: string | undefined,
  maximumLength: number,
): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined ||
    normalized.length === 0 ||
    normalized.length > maximumLength
    ? undefined
    : normalized;
}

function normalizedEmail(value: string | undefined): string | undefined {
  const email = boundedClaim(value, 320)?.toLowerCase();
  return email !== undefined && /^[^\s@]+@[^\s@]+$/u.test(email)
    ? email
    : undefined;
}

export class D1LtiAuthenticationRepository {
  constructor(
    private readonly database: D1DatabaseLike,
    private readonly clock: Clock,
  ) {}

  async createLoginState(input: {
    readonly stateHash: string;
    readonly nonceHash: string;
    readonly registrationId: string;
    readonly targetLinkUri: string;
    readonly expiresAt: string;
  }): Promise<void> {
    const now = this.clock.now();
    const results = await this.database.batch([
      this.database.prepare(DELETE_FINISHED_LOGIN_STATES).bind(now),
      this.database
        .prepare(INSERT_LOGIN_STATE)
        .bind(
          input.stateHash,
          input.nonceHash,
          input.registrationId,
          input.targetLinkUri,
          now,
          input.expiresAt,
        ),
    ]);
    const failure = results.find((result) => !result.success);
    if (failure !== undefined) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_LOGIN_STATE_CONFLICT",
        failure.error ?? "LTI login state could not be stored.",
      );
    }
  }

  async consumeLoginState(
    stateHash: string,
  ): Promise<ConsumedLtiLoginState> {
    const row = await this.database
      .prepare(FIND_LOGIN_STATE)
      .bind(stateHash)
      .first<LoginStateRow>();
    const now = this.clock.now();
    if (
      row === null ||
      row.consumed_at_utc !== null ||
      row.expires_at_utc <= now
    ) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_LOGIN_STATE_INVALID",
        "The LTI login state is missing, expired, or already consumed.",
      );
    }
    const result = await this.database
      .prepare(CONSUME_LOGIN_STATE)
      .bind(now, stateHash, now)
      .run();
    if (!result.success || result.meta?.changes !== 1) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_LOGIN_STATE_INVALID",
        "The LTI login state could not be consumed exactly once.",
      );
    }
    return {
      stateHash: row.state_hash,
      nonceHash: row.nonce_hash,
      registrationId: row.registration_id,
      targetLinkUri: row.target_link_uri,
      createdAt: row.created_at_utc,
      expiresAt: row.expires_at_utc,
    };
  }

  async resolveOrProvisionInstructor(
    input: LtiIdentityInput,
  ): Promise<string> {
    const existing = await this.database
      .prepare(FIND_EXTERNAL_IDENTITY)
      .bind(
        input.issuer,
        input.clientId,
        input.deploymentId,
        input.subject,
      )
      .first<ExternalIdentityRow>();
    const now = this.clock.now();
    const email = normalizedEmail(input.email);
    const displayName = boundedClaim(input.displayName, 200);
    if (existing !== null) {
      if (existing.status !== "active") {
        throw new LtiAuthenticationRepositoryError(
          "LTI_IDENTITY_DISABLED",
          "The linked TraceChain identity is disabled.",
        );
      }
      const updated = await this.database
        .prepare(UPDATE_EXTERNAL_IDENTITY)
        .bind(
          email ?? null,
          displayName ?? null,
          now,
          existing.identity_id,
        )
        .run();
      if (!updated.success) {
        throw new LtiAuthenticationRepositoryError(
          "LTI_STORAGE_FAILED",
          updated.error ?? "LTI identity metadata could not be updated.",
        );
      }
      return existing.user_id;
    }

    const identityMaterial =
      `${input.issuer}\u0000${input.clientId}\u0000` +
      `${input.deploymentId}\u0000${input.subject}`;
    const digest = sha256Hex(identityMaterial).toUpperCase();
    const userId = `USER_LTI_${digest.slice(0, 24)}`;
    const identityId = `LTI_IDENTITY_${digest.slice(0, 32)}`;
    const safeDisplayName =
      displayName ?? `Moodle instructor ${digest.slice(0, 8)}`;
    const results = await this.database.batch([
      this.database
        .prepare(INSERT_LTI_USER)
        .bind(userId, null, safeDisplayName, now),
      this.database
        .prepare(INSERT_INSTRUCTOR_ROLE)
        .bind(userId, now, userId),
      this.database
        .prepare(INSERT_EXTERNAL_IDENTITY)
        .bind(
          identityId,
          input.issuer,
          input.clientId,
          input.deploymentId,
          input.subject,
          userId,
          email ?? null,
          displayName ?? null,
          now,
          now,
        ),
    ]);
    const failure = results.find((result) => !result.success);
    if (failure !== undefined) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        failure.error ?? "LTI identity could not be provisioned.",
      );
    }
    return userId;
  }

  async createSession(
    input: LtiSessionInput,
    userId: string,
  ): Promise<void> {
    const results = await this.database.batch([
      this.database
        .prepare(DELETE_FINISHED_SESSIONS)
        .bind(input.issuedAt),
      this.database
        .prepare(INSERT_SESSION)
        .bind(
          input.sessionTokenHash,
          userId,
          input.registrationId,
          input.issuer,
          input.clientId,
          input.deploymentId,
          input.subject,
          input.context.contextId,
          input.context.resourceLinkId,
          input.context.contextLabel ?? null,
          input.context.contextTitle ?? null,
          input.context.returnUrl ?? null,
          JSON.stringify(input.platformRoles),
          input.issuedAt,
          input.expiresAt,
        ),
    ]);
    const failure = results.find((result) => !result.success);
    if (failure !== undefined) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        failure.error ?? "LTI session could not be stored.",
      );
    }
  }

  async findActiveSession(
    sessionTokenHash: string,
  ): Promise<ApplicationPrincipal | null> {
    const row = await this.database
      .prepare(FIND_ACTIVE_SESSION)
      .bind(sessionTokenHash, this.clock.now())
      .first<SessionRow>();
    if (row === null) return null;
    return {
      userId: row.user_id,
      ...(row.email === null ? {} : { email: row.email }),
      ...(row.display_name === null
        ? {}
        : { displayName: row.display_name }),
      roles: ["instructor"],
      authenticationSource: "lti",
      learningContext: {
        schemaVersion: "1.0.0",
        provider: "lti-1.3",
        issuer: row.issuer,
        clientId: row.client_id,
        deploymentId: row.deployment_id,
        contextId: row.context_id,
        resourceLinkId: row.resource_link_id,
        ...(row.context_label === null
          ? {}
          : { contextLabel: row.context_label }),
        ...(row.context_title === null
          ? {}
          : { contextTitle: row.context_title }),
        ...(row.return_url === null
          ? {}
          : { returnUrl: row.return_url }),
      },
    };
  }

  async revokeSession(sessionTokenHash: string): Promise<void> {
    const result = await this.database
      .prepare(REVOKE_SESSION)
      .bind(this.clock.now(), sessionTokenHash)
      .run();
    if (!result.success) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        result.error ?? "LTI session could not be revoked.",
      );
    }
  }
}
