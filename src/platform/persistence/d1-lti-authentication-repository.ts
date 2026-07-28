import type { Clock } from "../../domain/simulation/environment";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type {
  LtiApplicationRole,
  LtiAgsEndpointV1,
  LtiDeepLinkingSettingsV1,
  LtiLaunchType,
  LtiLearningContextV2,
  LtiNrpsEndpointV1,
} from "../contracts/lti";
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
const INSERT_APPLICATION_ROLE = `INSERT OR IGNORE INTO application_role_assignments (
    user_id,
    application_role,
    assigned_at_utc,
    assigned_by_user_id
  ) VALUES (?, ?, ?, ?)`;
const INSERT_ASSIGNMENT_LEARNER = `INSERT OR IGNORE INTO assignment_learners (
    assignment_id,
    learner_user_id,
    assigned_at_utc,
    assigned_by_user_id
  ) VALUES (?, ?, ?, ?)`;
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
    launch_type,
    context_id,
    resource_link_id,
    context_label,
    context_title,
    return_url,
    deep_link_return_url,
    deep_link_data,
    deep_link_accept_types_json,
    deep_link_accept_targets_json,
    deep_link_accept_lineitem,
    deep_link_response_nonce,
    deep_link_response_jwt,
    ags_lineitem_url,
    ags_scopes_json,
    nrps_context_memberships_url,
    nrps_service_versions_json,
    platform_roles_json,
    application_role,
    assignment_id,
    issued_at_utc,
    expires_at_utc
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const DELETE_FINISHED_SESSIONS = `DELETE FROM lti_sessions
  WHERE expires_at_utc <= ?
    OR revoked_at_utc IS NOT NULL`;
const FIND_ACTIVE_SESSION = `SELECT
    sessions.registration_id,
    sessions.issuer,
    sessions.client_id,
    sessions.deployment_id,
    sessions.launch_type,
    sessions.context_id,
    sessions.resource_link_id,
    sessions.context_label,
    sessions.context_title,
    sessions.return_url,
    sessions.application_role,
    sessions.assignment_id,
    sessions.nrps_context_memberships_url,
    sessions.nrps_service_versions_json,
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
    AND roles.application_role = sessions.application_role
  WHERE sessions.session_token_hash = ?
    AND sessions.revoked_at_utc IS NULL
    AND sessions.expires_at_utc > ?
    AND users.status = 'active'`;
const FIND_ACTIVE_DEEP_LINK_SESSION = `SELECT
    sessions.registration_id,
    sessions.issuer,
    sessions.client_id,
    sessions.deployment_id,
    sessions.context_id,
    sessions.context_label,
    sessions.context_title,
    sessions.deep_link_return_url,
    sessions.deep_link_data,
    sessions.deep_link_accept_types_json,
    sessions.deep_link_accept_targets_json,
    sessions.deep_link_accept_lineitem,
    sessions.deep_link_response_nonce,
    sessions.deep_link_assignment_id,
    sessions.deep_link_completed_at_utc,
    sessions.deep_link_response_jwt
  FROM lti_sessions AS sessions
  JOIN application_users AS users
    ON users.user_id = sessions.user_id
  WHERE sessions.session_token_hash = ?
    AND sessions.launch_type = 'deep-linking'
    AND sessions.application_role = 'instructor'
    AND sessions.revoked_at_utc IS NULL
    AND sessions.expires_at_utc > ?
    AND users.status = 'active'`;
const FIND_ACTIVE_AGS_CONTEXT = `SELECT
    sessions.registration_id,
    sessions.subject,
    sessions.assignment_id,
    sessions.ags_lineitem_url,
    sessions.ags_scopes_json
  FROM lti_sessions AS sessions
  JOIN application_users AS users
    ON users.user_id = sessions.user_id
  WHERE sessions.session_token_hash = ?
    AND sessions.launch_type = 'resource-link'
    AND sessions.application_role = 'learner'
    AND sessions.ags_lineitem_url IS NOT NULL
    AND sessions.ags_scopes_json IS NOT NULL
    AND sessions.revoked_at_utc IS NULL
    AND sessions.expires_at_utc > ?
    AND users.status = 'active'`;
const FIND_ACTIVE_NRPS_CONTEXT = `SELECT
    sessions.registration_id,
    sessions.issuer,
    sessions.client_id,
    sessions.deployment_id,
    sessions.context_id,
    sessions.nrps_context_memberships_url,
    sessions.nrps_service_versions_json
  FROM lti_sessions AS sessions
  JOIN application_users AS users
    ON users.user_id = sessions.user_id
  WHERE sessions.session_token_hash = ?
    AND sessions.application_role = 'instructor'
    AND sessions.nrps_context_memberships_url IS NOT NULL
    AND sessions.nrps_service_versions_json IS NOT NULL
    AND sessions.revoked_at_utc IS NULL
    AND sessions.expires_at_utc > ?
    AND users.status = 'active'`;
const COMPLETE_DEEP_LINK_SESSION = `UPDATE lti_sessions
  SET deep_link_assignment_id = ?,
      deep_link_completed_at_utc = ?,
      deep_link_response_jwt = ?
  WHERE session_token_hash = ?
    AND launch_type = 'deep-linking'
    AND application_role = 'instructor'
    AND revoked_at_utc IS NULL
    AND expires_at_utc > ?
    AND deep_link_completed_at_utc IS NULL`;
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
  readonly launch_type: LtiLaunchType;
  readonly context_id: string;
  readonly resource_link_id: string | null;
  readonly context_label: string | null;
  readonly context_title: string | null;
  readonly return_url: string | null;
  readonly application_role: LtiApplicationRole;
  readonly assignment_id: string | null;
  readonly nrps_context_memberships_url: string | null;
  readonly nrps_service_versions_json: string | null;
  readonly user_id: string;
  readonly email: string | null;
  readonly display_name: string | null;
}

interface DeepLinkSessionRow {
  readonly registration_id: string;
  readonly issuer: string;
  readonly client_id: string;
  readonly deployment_id: string;
  readonly context_id: string;
  readonly context_label: string | null;
  readonly context_title: string | null;
  readonly deep_link_return_url: string;
  readonly deep_link_data: string | null;
  readonly deep_link_accept_types_json: string;
  readonly deep_link_accept_targets_json: string;
  readonly deep_link_accept_lineitem: number;
  readonly deep_link_response_nonce: string;
  readonly deep_link_assignment_id: string | null;
  readonly deep_link_completed_at_utc: string | null;
  readonly deep_link_response_jwt: string | null;
}

interface AgsContextRow {
  readonly registration_id: string;
  readonly subject: string;
  readonly assignment_id: string;
  readonly ags_lineitem_url: string;
  readonly ags_scopes_json: string;
}

interface NrpsContextRow {
  readonly registration_id: string;
  readonly issuer: string;
  readonly client_id: string;
  readonly deployment_id: string;
  readonly context_id: string;
  readonly nrps_context_memberships_url: string;
  readonly nrps_service_versions_json: string;
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
  readonly context: LtiLearningContextV2;
  readonly platformRoles: readonly string[];
  readonly applicationRole: LtiApplicationRole;
  readonly launchType: LtiLaunchType;
  readonly assignmentId?: string;
  readonly deepLinkingSettings?: LtiDeepLinkingSettingsV1;
  readonly deepLinkResponseNonce?: string;
  readonly agsEndpoint?: LtiAgsEndpointV1;
  readonly nrpsEndpoint?: LtiNrpsEndpointV1;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface ActiveLtiDeepLinkSession {
  readonly registrationId: string;
  readonly issuer: string;
  readonly clientId: string;
  readonly deploymentId: string;
  readonly contextId: string;
  readonly contextLabel?: string;
  readonly contextTitle?: string;
  readonly settings: LtiDeepLinkingSettingsV1;
  readonly responseNonce: string;
  readonly selectedAssignmentId?: string;
  readonly completedAt?: string;
  readonly responseJwt?: string;
}

export interface ActiveLtiAgsContext {
  readonly registrationId: string;
  readonly platformUserId: string;
  readonly assignmentId: string;
  readonly endpoint: LtiAgsEndpointV1;
}

export interface ActiveLtiNrpsContext {
  readonly registrationId: string;
  readonly issuer: string;
  readonly clientId: string;
  readonly deploymentId: string;
  readonly contextId: string;
  readonly endpoint: LtiNrpsEndpointV1;
}

export interface LtiUserProvisioningInput extends LtiIdentityInput {
  readonly applicationRole: LtiApplicationRole;
  readonly assignment?: {
    readonly assignmentId: string;
    readonly assignedByUserId: string;
  };
}

export class LtiAuthenticationRepositoryError extends Error {
  constructor(
    readonly code:
      | "LTI_LOGIN_STATE_CONFLICT"
      | "LTI_LOGIN_STATE_INVALID"
      | "LTI_IDENTITY_DISABLED"
      | "LTI_STORAGE_FAILED",
    message: string,
    readonly recoveryPath: "/instructor" | "/learner" =
      "/instructor",
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

  async resolveOrProvisionUser(
    input: LtiUserProvisioningInput,
  ): Promise<string> {
    const recoveryPath =
      input.applicationRole === "learner"
        ? "/learner"
        : "/instructor";
    if (
      (input.applicationRole === "learner") !==
      (input.assignment !== undefined)
    ) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        "A learner LTI identity requires one exact assignment.",
        recoveryPath,
      );
    }
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
          recoveryPath,
        );
      }
      const results = await this.database.batch([
        this.database
          .prepare(UPDATE_EXTERNAL_IDENTITY)
          .bind(
            email ?? null,
            displayName ?? null,
            now,
            existing.identity_id,
          ),
        this.database
          .prepare(INSERT_APPLICATION_ROLE)
          .bind(
            existing.user_id,
            input.applicationRole,
            now,
            existing.user_id,
          ),
        ...(input.assignment === undefined
          ? []
          : [
              this.database
                .prepare(INSERT_ASSIGNMENT_LEARNER)
                .bind(
                  input.assignment.assignmentId,
                  existing.user_id,
                  now,
                  input.assignment.assignedByUserId,
                ),
            ]),
      ]);
      const failure = results.find((result) => !result.success);
      if (failure !== undefined) {
        throw new LtiAuthenticationRepositoryError(
          "LTI_STORAGE_FAILED",
          failure.error ??
            "LTI identity metadata could not be updated.",
          recoveryPath,
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
      displayName ??
      `Moodle ${input.applicationRole} ${digest.slice(0, 8)}`;
    const results = await this.database.batch([
      this.database
        .prepare(INSERT_LTI_USER)
        .bind(userId, null, safeDisplayName, now),
      this.database
        .prepare(INSERT_APPLICATION_ROLE)
        .bind(userId, input.applicationRole, now, userId),
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
      ...(input.assignment === undefined
        ? []
        : [
            this.database
              .prepare(INSERT_ASSIGNMENT_LEARNER)
              .bind(
                input.assignment.assignmentId,
                userId,
                now,
                input.assignment.assignedByUserId,
              ),
          ]),
    ]);
    const failure = results.find((result) => !result.success);
    if (failure !== undefined) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        failure.error ?? "LTI identity could not be provisioned.",
        recoveryPath,
      );
    }
    return userId;
  }

  async createSession(
    input: LtiSessionInput,
    userId: string,
  ): Promise<void> {
    const recoveryPath =
      input.applicationRole === "learner"
        ? "/learner"
        : "/instructor";
    if (
      (input.applicationRole === "learner") !==
      (input.assignmentId !== undefined)
    ) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        "A learner LTI session requires one exact assignment.",
        recoveryPath,
      );
    }
    if (
      (input.launchType === "deep-linking") !==
        (input.deepLinkingSettings !== undefined) ||
      (input.launchType === "deep-linking") !==
        (input.deepLinkResponseNonce !== undefined) ||
      (input.launchType === "deep-linking" &&
        input.applicationRole !== "instructor") ||
      (input.launchType === "resource-link" &&
        input.context.resourceLinkId === undefined) ||
      (input.launchType === "deep-linking" &&
        input.context.resourceLinkId !== undefined)
    ) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        "The LTI session launch data violates the current contract.",
        recoveryPath,
      );
    }
    if (
      input.agsEndpoint !== undefined &&
      (input.launchType !== "resource-link" ||
        input.applicationRole !== "learner")
    ) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        "LTI AGS may be bound only to a learner resource-link session.",
        recoveryPath,
      );
    }
    if (
      input.nrpsEndpoint !== undefined &&
      input.applicationRole !== "instructor"
    ) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        "LTI NRPS may be bound only to an instructor session.",
        recoveryPath,
      );
    }
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
          input.launchType,
          input.context.contextId,
          input.context.resourceLinkId ?? null,
          input.context.contextLabel ?? null,
          input.context.contextTitle ?? null,
          input.context.returnUrl ?? null,
          input.deepLinkingSettings?.returnUrl ?? null,
          input.deepLinkingSettings?.data ?? null,
          input.deepLinkingSettings === undefined
            ? null
            : JSON.stringify(
                input.deepLinkingSettings.acceptedTypes,
              ),
          input.deepLinkingSettings === undefined
            ? null
            : JSON.stringify(
                input.deepLinkingSettings
                  .acceptedPresentationTargets,
              ),
          input.deepLinkingSettings === undefined
            ? null
            : Number(input.deepLinkingSettings.acceptsLineItem),
          input.deepLinkResponseNonce ?? null,
          null,
          input.agsEndpoint?.lineItemUrl ?? null,
          input.agsEndpoint === undefined
            ? null
            : JSON.stringify(input.agsEndpoint.scopes),
          input.nrpsEndpoint?.contextMembershipsUrl ?? null,
          input.nrpsEndpoint === undefined
            ? null
            : JSON.stringify(
                input.nrpsEndpoint.serviceVersions,
              ),
          JSON.stringify(input.platformRoles),
          input.applicationRole,
          input.assignmentId ?? null,
          input.issuedAt,
          input.expiresAt,
        ),
    ]);
    const failure = results.find((result) => !result.success);
    if (failure !== undefined) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        failure.error ?? "LTI session could not be stored.",
        recoveryPath,
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
      roles: [row.application_role],
      authenticationSource: "lti",
      ltiLaunchType: row.launch_type,
      ...(row.assignment_id === null
        ? {}
        : { ltiAssignmentId: row.assignment_id }),
      ltiNrpsAvailable:
        row.nrps_context_memberships_url !== null &&
        row.nrps_service_versions_json !== null,
      learningContext: {
        schemaVersion: "2.0.0",
        provider: "lti-1.3",
        launchType: row.launch_type,
        issuer: row.issuer,
        clientId: row.client_id,
        deploymentId: row.deployment_id,
        contextId: row.context_id,
        ...(row.resource_link_id === null
          ? {}
          : { resourceLinkId: row.resource_link_id }),
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

  async findActiveDeepLinkSession(
    sessionTokenHash: string,
  ): Promise<ActiveLtiDeepLinkSession | null> {
    const row = await this.database
      .prepare(FIND_ACTIVE_DEEP_LINK_SESSION)
      .bind(sessionTokenHash, this.clock.now())
      .first<DeepLinkSessionRow>();
    if (row === null) return null;
    let acceptedTypes: unknown;
    let acceptedPresentationTargets: unknown;
    try {
      acceptedTypes = JSON.parse(row.deep_link_accept_types_json);
      acceptedPresentationTargets = JSON.parse(
        row.deep_link_accept_targets_json,
      );
    } catch {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        "Stored LTI Deep Linking settings are invalid.",
      );
    }
    if (
      !Array.isArray(acceptedTypes) ||
      !acceptedTypes.every((value) => typeof value === "string") ||
      !Array.isArray(acceptedPresentationTargets) ||
      !acceptedPresentationTargets.every(
        (value) => typeof value === "string",
      )
    ) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        "Stored LTI Deep Linking settings are invalid.",
      );
    }
    return {
      registrationId: row.registration_id,
      issuer: row.issuer,
      clientId: row.client_id,
      deploymentId: row.deployment_id,
      contextId: row.context_id,
      ...(row.context_label === null
        ? {}
        : { contextLabel: row.context_label }),
      ...(row.context_title === null
        ? {}
        : { contextTitle: row.context_title }),
      settings: {
        returnUrl: row.deep_link_return_url,
        ...(row.deep_link_data === null
          ? {}
          : { data: row.deep_link_data }),
        acceptedTypes,
        acceptedPresentationTargets,
        acceptsLineItem: row.deep_link_accept_lineitem === 1,
      },
      responseNonce: row.deep_link_response_nonce,
      ...(row.deep_link_assignment_id === null
        ? {}
        : {
            selectedAssignmentId:
              row.deep_link_assignment_id,
          }),
      ...(row.deep_link_completed_at_utc === null
        ? {}
        : { completedAt: row.deep_link_completed_at_utc }),
      ...(row.deep_link_response_jwt === null
        ? {}
        : { responseJwt: row.deep_link_response_jwt }),
    };
  }

  async findActiveAgsContext(
    sessionTokenHash: string,
  ): Promise<ActiveLtiAgsContext | null> {
    const row = await this.database
      .prepare(FIND_ACTIVE_AGS_CONTEXT)
      .bind(sessionTokenHash, this.clock.now())
      .first<AgsContextRow>();
    if (row === null) return null;
    let scopes: unknown;
    try {
      scopes = JSON.parse(row.ags_scopes_json);
    } catch {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        "Stored LTI AGS scopes are invalid.",
        "/learner",
      );
    }
    if (
      !Array.isArray(scopes) ||
      scopes.length === 0 ||
      !scopes.every((scope) => typeof scope === "string")
    ) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        "Stored LTI AGS scopes are invalid.",
        "/learner",
      );
    }
    return {
      registrationId: row.registration_id,
      platformUserId: row.subject,
      assignmentId: row.assignment_id,
      endpoint: {
        lineItemUrl: row.ags_lineitem_url,
        scopes,
      },
    };
  }

  async findActiveNrpsContext(
    sessionTokenHash: string,
  ): Promise<ActiveLtiNrpsContext | null> {
    const row = await this.database
      .prepare(FIND_ACTIVE_NRPS_CONTEXT)
      .bind(sessionTokenHash, this.clock.now())
      .first<NrpsContextRow>();
    if (row === null) return null;
    let serviceVersions: unknown;
    try {
      serviceVersions = JSON.parse(
        row.nrps_service_versions_json,
      );
    } catch {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        "Stored LTI NRPS service versions are invalid.",
      );
    }
    if (
      !Array.isArray(serviceVersions) ||
      !serviceVersions.includes("2.0") ||
      !serviceVersions.every(
        (version) => typeof version === "string",
      )
    ) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        "Stored LTI NRPS service versions are invalid.",
      );
    }
    return {
      registrationId: row.registration_id,
      issuer: row.issuer,
      clientId: row.client_id,
      deploymentId: row.deployment_id,
      contextId: row.context_id,
      endpoint: {
        contextMembershipsUrl:
          row.nrps_context_memberships_url,
        serviceVersions,
      },
    };
  }

  async completeDeepLinkSession(
    sessionTokenHash: string,
    assignmentId: string | null,
    completedAt: string,
    responseJwt: string,
  ): Promise<ActiveLtiDeepLinkSession> {
    const existing =
      await this.findActiveDeepLinkSession(sessionTokenHash);
    if (existing === null) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_LOGIN_STATE_INVALID",
        "The LTI Deep Linking session is missing or expired.",
      );
    }
    if (existing.completedAt !== undefined) {
      if (
        (existing.selectedAssignmentId ?? null) === assignmentId &&
        existing.responseJwt !== undefined
      ) {
        return existing;
      }
      throw new LtiAuthenticationRepositoryError(
        "LTI_LOGIN_STATE_INVALID",
        "The LTI Deep Linking selection is already complete.",
      );
    }
    if (
      responseJwt.length === 0 ||
      responseJwt.length > 32_768
    ) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        "The LTI Deep Linking response token is invalid.",
      );
    }
    const result = await this.database
      .prepare(COMPLETE_DEEP_LINK_SESSION)
      .bind(
        assignmentId,
        completedAt,
        responseJwt,
        sessionTokenHash,
        completedAt,
      )
      .run();
    if (!result.success) {
      throw new LtiAuthenticationRepositoryError(
        "LTI_STORAGE_FAILED",
        result.error ??
          "The LTI Deep Linking selection could not be stored.",
      );
    }
    if (result.meta?.changes !== 1) {
      const concurrent =
        await this.findActiveDeepLinkSession(sessionTokenHash);
      if (
        concurrent !== null &&
        concurrent.completedAt !== undefined &&
        (concurrent.selectedAssignmentId ?? null) === assignmentId &&
        concurrent.responseJwt !== undefined
      ) {
        return concurrent;
      }
      throw new LtiAuthenticationRepositoryError(
        "LTI_LOGIN_STATE_INVALID",
        "The LTI Deep Linking selection could not be completed exactly once.",
      );
    }
    return {
      ...existing,
      ...(assignmentId === null
        ? {}
        : { selectedAssignmentId: assignmentId }),
      completedAt,
      responseJwt,
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
