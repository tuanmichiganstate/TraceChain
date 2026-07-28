import type { Clock } from "../../domain/simulation/environment";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type {
  HostedAssignmentLearnerOptionV2,
} from "../contracts/assessment";
import type {
  LtiNrpsLearnerMemberV1,
  LtiNrpsSyncProjectionV1,
} from "../contracts/lti";
import type {
  ActiveLtiNrpsContext,
} from "./d1-lti-authentication-repository";
import type { D1DatabaseLike } from "./d1-types";

const FIND_SYNC = `SELECT
    sync_id,
    registration_id,
    issuer,
    client_id,
    deployment_id,
    context_id,
    context_memberships_url,
    snapshot_hash,
    received_member_count,
    active_learner_count,
    inactive_learner_count,
    page_count,
    synchronized_at_utc,
    synchronized_by_user_id
  FROM lti_nrps_syncs
  WHERE sync_id = ?`;
const INSERT_SYNC = `INSERT INTO lti_nrps_syncs (
    sync_id,
    registration_id,
    issuer,
    client_id,
    deployment_id,
    context_id,
    context_memberships_url,
    snapshot_hash,
    received_member_count,
    active_learner_count,
    inactive_learner_count,
    page_count,
    synchronized_at_utc,
    synchronized_by_user_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const INSERT_USERS = `INSERT OR IGNORE INTO application_users (
    user_id,
    email,
    display_name,
    status,
    created_at_utc
  )
  SELECT
    json_extract(value, '$.userId'),
    NULL,
    json_extract(value, '$.safeDisplayName'),
    'active',
    ?
  FROM json_each(?)`;
const INSERT_LEARNER_ROLES = `INSERT OR IGNORE INTO application_role_assignments (
    user_id,
    application_role,
    assigned_at_utc,
    assigned_by_user_id
  )
  SELECT
    json_extract(value, '$.userId'),
    'learner',
    ?,
    ?
  FROM json_each(?)`;
const UPSERT_EXTERNAL_IDENTITIES = `INSERT INTO external_user_identities (
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
  )
  SELECT
    json_extract(value, '$.identityId'),
    'lti-1.3',
    ?,
    ?,
    ?,
    json_extract(value, '$.platformUserId'),
    json_extract(value, '$.userId'),
    json_extract(value, '$.email'),
    json_extract(value, '$.displayName'),
    ?,
    NULL
  FROM json_each(?)
  WHERE true
  ON CONFLICT (
    provider,
    issuer,
    client_id,
    deployment_id,
    subject
  ) DO UPDATE SET
    email_claim = excluded.email_claim,
    display_name_claim = excluded.display_name_claim`;
const UPSERT_CONTEXT_MEMBERSHIPS = `INSERT INTO lti_context_memberships (
    registration_id,
    issuer,
    client_id,
    deployment_id,
    context_id,
    subject,
    user_id,
    membership_status,
    platform_roles_json,
    email_claim,
    display_name_claim,
    first_seen_at_utc,
    updated_at_utc,
    last_sync_id
  )
  SELECT
    ?,
    ?,
    ?,
    ?,
    ?,
    json_extract(value, '$.platformUserId'),
    json_extract(value, '$.userId'),
    json_extract(value, '$.status'),
    json_extract(value, '$.rolesJson'),
    json_extract(value, '$.email'),
    json_extract(value, '$.displayName'),
    ?,
    ?,
    ?
  FROM json_each(?)
  WHERE true
  ON CONFLICT (
    registration_id,
    context_id,
    subject
  ) DO UPDATE SET
    issuer = excluded.issuer,
    client_id = excluded.client_id,
    deployment_id = excluded.deployment_id,
    user_id = excluded.user_id,
    membership_status = excluded.membership_status,
    platform_roles_json = excluded.platform_roles_json,
    email_claim = excluded.email_claim,
    display_name_claim = excluded.display_name_claim,
    updated_at_utc = excluded.updated_at_utc,
    last_sync_id = excluded.last_sync_id`;
const MARK_OMITTED_INACTIVE = `UPDATE lti_context_memberships
  SET membership_status = 'inactive',
      updated_at_utc = ?,
      last_sync_id = ?
  WHERE registration_id = ?
    AND issuer = ?
    AND client_id = ?
    AND deployment_id = ?
    AND context_id = ?
    AND NOT EXISTS (
      SELECT 1
      FROM json_each(?) AS roster
      WHERE json_extract(
        roster.value,
        '$.platformUserId'
      ) = lti_context_memberships.subject
    )`;
const LIST_ACTIVE_LEARNERS = `SELECT
    memberships.user_id,
    memberships.subject,
    COALESCE(
      memberships.display_name_claim,
      identities.display_name_claim,
      users.display_name
    ) AS display_name,
    COALESCE(
      memberships.email_claim,
      identities.email_claim
    ) AS email
  FROM lti_context_memberships AS memberships
  JOIN application_users AS users
    ON users.user_id = memberships.user_id
  JOIN external_user_identities AS identities
    ON identities.user_id = memberships.user_id
    AND identities.provider = 'lti-1.3'
    AND identities.issuer = memberships.issuer
    AND identities.client_id = memberships.client_id
    AND identities.deployment_id = memberships.deployment_id
    AND identities.subject = memberships.subject
  WHERE memberships.registration_id = ?
    AND memberships.issuer = ?
    AND memberships.client_id = ?
    AND memberships.deployment_id = ?
    AND memberships.context_id = ?
    AND memberships.membership_status = 'active'
    AND users.status = 'active'
  ORDER BY
    COALESCE(
      memberships.display_name_claim,
      identities.display_name_claim,
      users.display_name,
      memberships.subject
    ) COLLATE NOCASE,
    memberships.subject`;

interface SyncRow {
  readonly sync_id: string;
  readonly registration_id: string;
  readonly issuer: string;
  readonly client_id: string;
  readonly deployment_id: string;
  readonly context_id: string;
  readonly context_memberships_url: string;
  readonly snapshot_hash: string;
  readonly received_member_count: number;
  readonly active_learner_count: number;
  readonly inactive_learner_count: number;
  readonly page_count: number;
  readonly synchronized_at_utc: string;
  readonly synchronized_by_user_id: string;
}

interface LearnerRow {
  readonly user_id: string;
  readonly subject: string;
  readonly display_name: string | null;
  readonly email: string | null;
}

interface PersistedMember {
  readonly platformUserId: string;
  readonly userId: string;
  readonly identityId: string;
  readonly status: "active" | "inactive";
  readonly rolesJson: string;
  readonly safeDisplayName: string;
  readonly displayName: string | null;
  readonly email: string | null;
}

export interface SynchronizeLtiNrpsInput {
  readonly syncId: string;
  readonly context: ActiveLtiNrpsContext;
  readonly synchronizedByUserId: string;
  readonly pageCount: number;
  readonly members: readonly LtiNrpsLearnerMemberV1[];
}

interface StoredSync extends LtiNrpsSyncProjectionV1 {
  readonly registrationId: string;
  readonly issuer: string;
  readonly clientId: string;
  readonly deploymentId: string;
  readonly contextMembershipsUrl: string;
  readonly snapshotHash: string;
  readonly synchronizedByUserId: string;
}

export interface SynchronizeLtiNrpsResult {
  readonly sync: LtiNrpsSyncProjectionV1;
  readonly wasIdempotentReplay: boolean;
}

export class LtiNrpsRepositoryError extends Error {
  constructor(
    readonly code:
      | "LTI_NRPS_SYNC_INVALID"
      | "LTI_NRPS_SYNC_CONFLICT"
      | "LTI_NRPS_STORAGE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "LtiNrpsRepositoryError";
  }
}

function invalid(message: string): never {
  throw new LtiNrpsRepositoryError(
    "LTI_NRPS_SYNC_INVALID",
    message,
  );
}

function storedSync(row: SyncRow): StoredSync {
  return {
    schemaVersion: "1.0.0",
    syncId: row.sync_id,
    registrationId: row.registration_id,
    issuer: row.issuer,
    clientId: row.client_id,
    deploymentId: row.deployment_id,
    contextId: row.context_id,
    contextMembershipsUrl: row.context_memberships_url,
    snapshotHash: row.snapshot_hash,
    receivedMemberCount: row.received_member_count,
    activeLearnerCount: row.active_learner_count,
    inactiveLearnerCount: row.inactive_learner_count,
    pageCount: row.page_count,
    synchronizedAt: row.synchronized_at_utc,
    synchronizedByUserId: row.synchronized_by_user_id,
  };
}

function projection(sync: StoredSync): LtiNrpsSyncProjectionV1 {
  return {
    schemaVersion: sync.schemaVersion,
    syncId: sync.syncId,
    contextId: sync.contextId,
    receivedMemberCount: sync.receivedMemberCount,
    activeLearnerCount: sync.activeLearnerCount,
    inactiveLearnerCount: sync.inactiveLearnerCount,
    pageCount: sync.pageCount,
    synchronizedAt: sync.synchronizedAt,
  };
}

function normalizedMembers(
  members: readonly LtiNrpsLearnerMemberV1[],
  context: ActiveLtiNrpsContext,
): readonly PersistedMember[] {
  if (!Array.isArray(members) || members.length > 1_000) {
    invalid("An NRPS snapshot may contain at most 1000 learners.");
  }
  const subjects = new Set<string>();
  return [...members]
    .sort((left, right) =>
      left.platformUserId < right.platformUserId
        ? -1
        : left.platformUserId > right.platformUserId
          ? 1
          : 0,
    )
    .map((member) => {
      if (
        typeof member.platformUserId !== "string" ||
        member.platformUserId.length === 0 ||
        member.platformUserId.length > 512 ||
        subjects.has(member.platformUserId) ||
        (member.status !== "active" &&
          member.status !== "inactive") ||
        !Array.isArray(member.roles) ||
        member.roles.length === 0
      ) {
        invalid("The NRPS learner snapshot is invalid.");
      }
      subjects.add(member.platformUserId);
      const identityMaterial =
        `${context.issuer}\u0000${context.clientId}\u0000` +
        `${context.deploymentId}\u0000${member.platformUserId}`;
      const digest = sha256Hex(identityMaterial).toUpperCase();
      const displayName = member.displayName?.trim();
      const email = member.email?.trim().toLowerCase();
      if (
        (displayName !== undefined &&
          (displayName.length === 0 ||
            displayName.length > 200)) ||
        (email !== undefined &&
          (email.length > 320 ||
            !/^[^\s@]+@[^\s@]+$/u.test(email))) ||
        member.roles.some(
          (role: unknown) =>
            typeof role !== "string" ||
            role.length === 0 ||
            role.length > 512,
        )
      ) {
        invalid("The NRPS learner metadata is invalid.");
      }
      return {
        platformUserId: member.platformUserId,
        userId: `USER_LTI_${digest.slice(0, 24)}`,
        identityId: `LTI_IDENTITY_${digest.slice(0, 32)}`,
        status: member.status,
        rolesJson: JSON.stringify([...new Set(member.roles)].sort()),
        safeDisplayName:
          displayName ?? `Moodle learner ${digest.slice(0, 8)}`,
        displayName: displayName ?? null,
        email: email ?? null,
      };
    });
}

export class D1LtiNrpsRepository {
  constructor(
    private readonly database: D1DatabaseLike,
    private readonly clock: Clock,
  ) {}

  private async find(syncId: string): Promise<StoredSync | null> {
    const row = await this.database
      .prepare(FIND_SYNC)
      .bind(syncId)
      .first<SyncRow>();
    return row === null ? null : storedSync(row);
  }

  async replay(
    syncId: string,
    context: ActiveLtiNrpsContext,
    synchronizedByUserId: string,
  ): Promise<LtiNrpsSyncProjectionV1 | null> {
    const existing = await this.find(syncId);
    if (existing === null) return null;
    if (
      existing.registrationId !== context.registrationId ||
      existing.issuer !== context.issuer ||
      existing.clientId !== context.clientId ||
      existing.deploymentId !== context.deploymentId ||
      existing.contextId !== context.contextId ||
      existing.contextMembershipsUrl !==
        context.endpoint.contextMembershipsUrl ||
      existing.synchronizedByUserId !== synchronizedByUserId
    ) {
      throw new LtiNrpsRepositoryError(
        "LTI_NRPS_SYNC_CONFLICT",
        "The NRPS sync ID is already bound to another course.",
      );
    }
    return projection(existing);
  }

  async synchronize(
    input: SynchronizeLtiNrpsInput,
  ): Promise<SynchronizeLtiNrpsResult> {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u.test(input.syncId) ||
      !Number.isInteger(input.pageCount) ||
      input.pageCount < 1 ||
      input.pageCount > 20
    ) {
      invalid("The NRPS synchronization request is invalid.");
    }
    const members = normalizedMembers(input.members, input.context);
    const membersJson = JSON.stringify(members);
    const snapshotHash = sha256Hex(membersJson);
    const activeLearnerCount = members.filter(
      (member) => member.status === "active",
    ).length;
    const inactiveLearnerCount =
      members.length - activeLearnerCount;
    const existing = await this.find(input.syncId);
    if (existing !== null) {
      if (
        existing.registrationId !==
          input.context.registrationId ||
        existing.issuer !== input.context.issuer ||
        existing.clientId !== input.context.clientId ||
        existing.deploymentId !==
          input.context.deploymentId ||
        existing.contextId !== input.context.contextId ||
        existing.contextMembershipsUrl !==
          input.context.endpoint.contextMembershipsUrl ||
        existing.snapshotHash !== snapshotHash ||
        existing.pageCount !== input.pageCount ||
        existing.synchronizedByUserId !==
          input.synchronizedByUserId
      ) {
        throw new LtiNrpsRepositoryError(
          "LTI_NRPS_SYNC_CONFLICT",
          "The NRPS sync ID is already bound to another snapshot.",
        );
      }
      return {
        sync: projection(existing),
        wasIdempotentReplay: true,
      };
    }
    const now = this.clock.now();
    const results = await this.database.batch([
      this.database
        .prepare(INSERT_SYNC)
        .bind(
          input.syncId,
          input.context.registrationId,
          input.context.issuer,
          input.context.clientId,
          input.context.deploymentId,
          input.context.contextId,
          input.context.endpoint.contextMembershipsUrl,
          snapshotHash,
          members.length,
          activeLearnerCount,
          inactiveLearnerCount,
          input.pageCount,
          now,
          input.synchronizedByUserId,
        ),
      this.database
        .prepare(INSERT_USERS)
        .bind(now, membersJson),
      this.database
        .prepare(INSERT_LEARNER_ROLES)
        .bind(now, input.synchronizedByUserId, membersJson),
      this.database
        .prepare(UPSERT_EXTERNAL_IDENTITIES)
        .bind(
          input.context.issuer,
          input.context.clientId,
          input.context.deploymentId,
          now,
          membersJson,
        ),
      this.database
        .prepare(UPSERT_CONTEXT_MEMBERSHIPS)
        .bind(
          input.context.registrationId,
          input.context.issuer,
          input.context.clientId,
          input.context.deploymentId,
          input.context.contextId,
          now,
          now,
          input.syncId,
          membersJson,
        ),
      this.database
        .prepare(MARK_OMITTED_INACTIVE)
        .bind(
          now,
          input.syncId,
          input.context.registrationId,
          input.context.issuer,
          input.context.clientId,
          input.context.deploymentId,
          input.context.contextId,
          membersJson,
        ),
    ]);
    const failure = results.find((result) => !result.success);
    if (failure !== undefined) {
      throw new LtiNrpsRepositoryError(
        "LTI_NRPS_STORAGE_FAILED",
        failure.error ?? "The NRPS roster could not be stored.",
      );
    }
    const created = await this.find(input.syncId);
    if (created === null) {
      throw new LtiNrpsRepositoryError(
        "LTI_NRPS_STORAGE_FAILED",
        "The stored NRPS synchronization could not be read.",
      );
    }
    return {
      sync: projection(created),
      wasIdempotentReplay: false,
    };
  }

  async listActiveLearners(
    context: ActiveLtiNrpsContext,
  ): Promise<readonly HostedAssignmentLearnerOptionV2[]> {
    const rows = await this.database
      .prepare(LIST_ACTIVE_LEARNERS)
      .bind(
        context.registrationId,
        context.issuer,
        context.clientId,
        context.deploymentId,
        context.contextId,
      )
      .all<LearnerRow>();
    if (!rows.success) {
      throw new LtiNrpsRepositoryError(
        "LTI_NRPS_STORAGE_FAILED",
        rows.error ?? "The synchronized NRPS roster could not be read.",
      );
    }
    return rows.results.map((row) => ({
      schemaVersion: "2.0.0",
      userId: row.user_id,
      displayName:
        row.display_name ?? `Moodle learner ${row.subject.slice(0, 8)}`,
      ...(row.email === null ? {} : { email: row.email }),
      source: "LTI_NRPS",
    }));
  }
}
