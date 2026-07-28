import type { Clock } from "../../domain/simulation/environment";
import type {
  LtiAgsDeliveryProjectionV1,
  LtiAgsDeliveryStatus,
  LtiAgsScoreV1,
} from "../contracts/lti";
import type { D1DatabaseLike } from "./d1-types";

const INSERT_DELIVERY = `INSERT OR IGNORE INTO lti_ags_score_deliveries (
    delivery_id,
    run_id,
    assignment_id,
    registration_id,
    platform_user_id,
    lineitem_url,
    score_payload_json,
    status,
    attempt_count,
    created_at_utc,
    updated_at_utc
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`;
const FIND_DELIVERY = `SELECT
    delivery_id,
    run_id,
    assignment_id,
    registration_id,
    platform_user_id,
    lineitem_url,
    score_payload_json,
    status,
    attempt_count,
    created_at_utc,
    updated_at_utc,
    last_attempt_at_utc,
    delivered_at_utc,
    last_error
  FROM lti_ags_score_deliveries
  WHERE delivery_id = ?`;
const CLAIM_DELIVERY = `UPDATE lti_ags_score_deliveries
  SET status = 'delivering',
      attempt_count = attempt_count + 1,
      updated_at_utc = ?,
      last_attempt_at_utc = ?,
      last_error = NULL
  WHERE delivery_id = ?
    AND (
      status IN ('pending', 'failed')
      OR (
        status = 'delivering'
        AND last_attempt_at_utc < ?
      )
    )`;
const MARK_DELIVERED = `UPDATE lti_ags_score_deliveries
  SET status = 'delivered',
      updated_at_utc = ?,
      delivered_at_utc = ?,
      last_error = NULL
  WHERE delivery_id = ?
    AND status = 'delivering'`;
const MARK_FAILED = `UPDATE lti_ags_score_deliveries
  SET status = 'failed',
      updated_at_utc = ?,
      delivered_at_utc = NULL,
      last_error = ?
  WHERE delivery_id = ?
    AND status = 'delivering'`;

interface DeliveryRow {
  readonly delivery_id: string;
  readonly run_id: string;
  readonly assignment_id: string;
  readonly registration_id: string;
  readonly platform_user_id: string;
  readonly lineitem_url: string;
  readonly score_payload_json: string;
  readonly status: LtiAgsDeliveryStatus;
  readonly attempt_count: number;
  readonly created_at_utc: string;
  readonly updated_at_utc: string;
  readonly last_attempt_at_utc: string | null;
  readonly delivered_at_utc: string | null;
  readonly last_error: string | null;
}

export interface LtiAgsScoreDeliveryRecord
  extends LtiAgsDeliveryProjectionV1 {
  readonly registrationId: string;
  readonly platformUserId: string;
  readonly lineItemUrl: string;
  readonly score: LtiAgsScoreV1;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastAttemptAt?: string;
  readonly lastError?: string;
}

export interface CreateLtiAgsScoreDeliveryInput {
  readonly deliveryId: string;
  readonly runId: string;
  readonly assignmentId: string;
  readonly registrationId: string;
  readonly platformUserId: string;
  readonly lineItemUrl: string;
  readonly score: LtiAgsScoreV1;
}

export interface LtiAgsDeliveryRepository {
  createOrFind(
    input: CreateLtiAgsScoreDeliveryInput,
  ): Promise<LtiAgsScoreDeliveryRecord>;
  claim(deliveryId: string): Promise<{
    readonly delivery: LtiAgsScoreDeliveryRecord;
    readonly wasClaimed: boolean;
  }>;
  markDelivered(
    deliveryId: string,
  ): Promise<LtiAgsScoreDeliveryRecord>;
  markFailed(
    deliveryId: string,
    error: unknown,
  ): Promise<LtiAgsScoreDeliveryRecord>;
  find(
    deliveryId: string,
  ): Promise<LtiAgsScoreDeliveryRecord | null>;
}

export class LtiAgsRepositoryError extends Error {
  constructor(
    readonly code:
      | "LTI_AGS_DELIVERY_CONFLICT"
      | "LTI_AGS_DELIVERY_NOT_FOUND"
      | "LTI_AGS_STORAGE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "LtiAgsRepositoryError";
  }
}

function boundedError(value: unknown): string {
  const message =
    value instanceof Error ? value.message : String(value);
  return message.slice(0, 1_000);
}

function scoreFromRow(row: DeliveryRow): LtiAgsScoreV1 {
  try {
    const parsed = JSON.parse(row.score_payload_json) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("The score payload is not an object.");
    }
    const score = parsed as Readonly<Record<string, unknown>>;
    if (
      typeof score.userId !== "string" ||
      score.userId.length === 0 ||
      score.userId.length > 512 ||
      typeof score.timestamp !== "string" ||
      !Number.isFinite(Date.parse(score.timestamp)) ||
      score.activityProgress !== "Completed" ||
      (score.gradingProgress !== "FullyGraded" &&
        score.gradingProgress !== "PendingManual")
    ) {
      throw new Error("The score payload fields are invalid.");
    }
    if (score.gradingProgress === "PendingManual") {
      if (
        score.scoreGiven !== undefined ||
        score.scoreMaximum !== undefined
      ) {
        throw new Error(
          "A pending manual score must not contain numeric values.",
        );
      }
      return {
        userId: score.userId,
        timestamp: score.timestamp,
        activityProgress: "Completed",
        gradingProgress: "PendingManual",
      };
    }
    if (
      typeof score.scoreGiven !== "number" ||
      !Number.isFinite(score.scoreGiven) ||
      score.scoreGiven < 0 ||
      typeof score.scoreMaximum !== "number" ||
      !Number.isFinite(score.scoreMaximum) ||
      score.scoreMaximum <= 0 ||
      score.scoreGiven > score.scoreMaximum
    ) {
      throw new Error("The fully graded score is invalid.");
    }
    return {
      userId: score.userId,
      timestamp: score.timestamp,
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
      scoreGiven: score.scoreGiven,
      scoreMaximum: score.scoreMaximum,
    };
  } catch {
    throw new LtiAgsRepositoryError(
      "LTI_AGS_STORAGE_FAILED",
      "Stored LTI AGS score payload is invalid.",
    );
  }
}

function recordFromRow(row: DeliveryRow): LtiAgsScoreDeliveryRecord {
  return {
    schemaVersion: "1.0.0",
    deliveryId: row.delivery_id,
    runId: row.run_id,
    assignmentId: row.assignment_id,
    registrationId: row.registration_id,
    platformUserId: row.platform_user_id,
    lineItemUrl: row.lineitem_url,
    score: scoreFromRow(row),
    status: row.status,
    attemptCount: row.attempt_count,
    createdAt: row.created_at_utc,
    updatedAt: row.updated_at_utc,
    ...(row.last_attempt_at_utc === null
      ? {}
      : { lastAttemptAt: row.last_attempt_at_utc }),
    ...(row.delivered_at_utc === null
      ? {}
      : { deliveredAt: row.delivered_at_utc }),
    ...(row.last_error === null
      ? {}
      : { lastError: row.last_error }),
  };
}

export class D1LtiAgsRepository
  implements LtiAgsDeliveryRepository {
  constructor(
    private readonly database: D1DatabaseLike,
    private readonly clock: Clock,
  ) {}

  async createOrFind(
    input: CreateLtiAgsScoreDeliveryInput,
  ): Promise<LtiAgsScoreDeliveryRecord> {
    const now = this.clock.now();
    const payload = JSON.stringify(input.score);
    const result = await this.database
      .prepare(INSERT_DELIVERY)
      .bind(
        input.deliveryId,
        input.runId,
        input.assignmentId,
        input.registrationId,
        input.platformUserId,
        input.lineItemUrl,
        payload,
        now,
        now,
      )
      .run();
    if (!result.success) {
      throw new LtiAgsRepositoryError(
        "LTI_AGS_STORAGE_FAILED",
        result.error ?? "The LTI AGS delivery could not be stored.",
      );
    }
    const existing = await this.find(input.deliveryId);
    if (existing === null) {
      throw new LtiAgsRepositoryError(
        "LTI_AGS_STORAGE_FAILED",
        "The stored LTI AGS delivery could not be read.",
      );
    }
    if (
      existing.runId !== input.runId ||
      existing.assignmentId !== input.assignmentId ||
      existing.registrationId !== input.registrationId ||
      existing.platformUserId !== input.platformUserId ||
      existing.lineItemUrl !== input.lineItemUrl ||
      JSON.stringify(existing.score) !== payload
    ) {
      throw new LtiAgsRepositoryError(
        "LTI_AGS_DELIVERY_CONFLICT",
        "The completed run is already bound to different LTI AGS evidence.",
      );
    }
    return existing;
  }

  async claim(
    deliveryId: string,
  ): Promise<{
    readonly delivery: LtiAgsScoreDeliveryRecord;
    readonly wasClaimed: boolean;
  }> {
    const now = this.clock.now();
    const nowMilliseconds = Date.parse(now);
    if (!Number.isFinite(nowMilliseconds)) {
      throw new LtiAgsRepositoryError(
        "LTI_AGS_STORAGE_FAILED",
        "The server clock did not provide a valid timestamp.",
      );
    }
    const staleBefore = new Date(
      nowMilliseconds - 5 * 60 * 1_000,
    ).toISOString();
    const result = await this.database
      .prepare(CLAIM_DELIVERY)
      .bind(now, now, deliveryId, staleBefore)
      .run();
    if (!result.success) {
      throw new LtiAgsRepositoryError(
        "LTI_AGS_STORAGE_FAILED",
        result.error ?? "The LTI AGS delivery could not be claimed.",
      );
    }
    const delivery = await this.find(deliveryId);
    if (delivery === null) {
      throw new LtiAgsRepositoryError(
        "LTI_AGS_DELIVERY_NOT_FOUND",
        "The LTI AGS delivery does not exist.",
      );
    }
    return {
      delivery,
      wasClaimed: result.meta?.changes === 1,
    };
  }

  async markDelivered(
    deliveryId: string,
  ): Promise<LtiAgsScoreDeliveryRecord> {
    const now = this.clock.now();
    const result = await this.database
      .prepare(MARK_DELIVERED)
      .bind(now, now, deliveryId)
      .run();
    if (!result.success || result.meta?.changes !== 1) {
      throw new LtiAgsRepositoryError(
        "LTI_AGS_STORAGE_FAILED",
        result.error ?? "The LTI AGS delivery could not be completed.",
      );
    }
    return (await this.find(deliveryId))!;
  }

  async markFailed(
    deliveryId: string,
    error: unknown,
  ): Promise<LtiAgsScoreDeliveryRecord> {
    const result = await this.database
      .prepare(MARK_FAILED)
      .bind(
        this.clock.now(),
        boundedError(error),
        deliveryId,
      )
      .run();
    if (!result.success || result.meta?.changes !== 1) {
      throw new LtiAgsRepositoryError(
        "LTI_AGS_STORAGE_FAILED",
        result.error ?? "The failed LTI AGS delivery could not be recorded.",
      );
    }
    return (await this.find(deliveryId))!;
  }

  async find(
    deliveryId: string,
  ): Promise<LtiAgsScoreDeliveryRecord | null> {
    const row = await this.database
      .prepare(FIND_DELIVERY)
      .bind(deliveryId)
      .first<DeliveryRow>();
    return row === null ? null : recordFromRow(row);
  }
}
