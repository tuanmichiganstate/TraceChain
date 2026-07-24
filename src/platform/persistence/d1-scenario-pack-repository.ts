import type { Clock } from "../../domain/simulation/environment";
import type { ScenarioPackListItemV1 } from "../contracts/scenario-authoring";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import {
  publishScenarioPack,
  ScenarioPackPublicationError,
  verifyScenarioPackContentHash,
  type PublishScenarioPackMetadata,
  type RetireScenarioPackMetadata,
  type RetireScenarioPackResult,
  type ScenarioPackRepository,
} from "../scenario-packs/publication";
import { validateScenarioPack } from "../scenario-packs/validation";
import type { D1DatabaseLike } from "./d1-types";

const SELECT_PACK = `SELECT
    lifecycle_status,
    content_hash,
    pack_json,
    updated_at_utc,
    updated_by_user_id,
    retirement_command_id,
    retired_at_utc,
    retired_by_user_id
  FROM scenario_pack_versions
  WHERE pack_id = ? AND pack_version = ?`;
const SELECT_PACKS = `SELECT
    pack_id,
    pack_version,
    lifecycle_status,
    content_hash,
    pack_json,
    updated_at_utc,
    updated_by_user_id,
    retirement_command_id,
    retired_at_utc,
    retired_by_user_id
  FROM scenario_pack_versions
  ORDER BY pack_id, pack_version`;
const SELECT_RETIREMENT_COMMAND = `SELECT
    pack_id,
    pack_version,
    lifecycle_status,
    content_hash,
    pack_json,
    updated_at_utc,
    updated_by_user_id,
    retirement_command_id,
    retired_at_utc,
    retired_by_user_id
  FROM scenario_pack_versions
  WHERE retirement_command_id = ?`;
const UPSERT_MUTABLE_PACK = `INSERT INTO scenario_pack_versions (
    pack_id,
    pack_version,
    lifecycle_status,
    content_hash,
    pack_json,
    updated_at_utc,
    updated_by_user_id
  ) VALUES (?, ?, ?, NULL, ?, ?, ?)
  ON CONFLICT(pack_id, pack_version) DO UPDATE SET
    lifecycle_status = excluded.lifecycle_status,
    content_hash = NULL,
    pack_json = excluded.pack_json,
    updated_at_utc = excluded.updated_at_utc,
    updated_by_user_id = excluded.updated_by_user_id
  WHERE scenario_pack_versions.lifecycle_status IN ('draft', 'validated')`;
const UPDATE_PUBLISHED_PACK = `UPDATE scenario_pack_versions
  SET lifecycle_status = 'published',
      content_hash = ?,
      pack_json = ?,
      updated_at_utc = ?,
      updated_by_user_id = ?
  WHERE pack_id = ?
    AND pack_version = ?
    AND lifecycle_status IN ('draft', 'validated')`;
const UPDATE_RETIRED_PACK = `UPDATE scenario_pack_versions
  SET lifecycle_status = 'retired',
      retirement_command_id = ?,
      retired_at_utc = ?,
      retired_by_user_id = ?,
      updated_at_utc = ?,
      updated_by_user_id = ?
  WHERE pack_id = ?
    AND pack_version = ?
    AND lifecycle_status = 'published'
    AND retirement_command_id IS NULL`;

interface StoredPackRow {
  readonly pack_id?: string;
  readonly pack_version?: string;
  readonly lifecycle_status:
    | "draft"
    | "validated"
    | "published"
    | "retired";
  readonly content_hash: string | null;
  readonly pack_json: string;
  readonly updated_at_utc: string;
  readonly updated_by_user_id: string;
  readonly retirement_command_id: string | null;
  readonly retired_at_utc: string | null;
  readonly retired_by_user_id: string | null;
}

function deepFreeze<T>(value: T, visited = new Set<object>()): T {
  if (
    typeof value !== "object" ||
    value === null ||
    visited.has(value)
  ) {
    return value;
  }
  visited.add(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested, visited);
  }
  return Object.freeze(value);
}

function parseStoredPack(
  row: StoredPackRow,
  packId: string,
  version: string,
): ScenarioPackV1 {
  let candidate: unknown;
  try {
    candidate = JSON.parse(row.pack_json);
  } catch {
    throw new ScenarioPackPublicationError(
      `Stored scenario pack ${packId}@${version} is not valid JSON.`,
    );
  }
  const validation = validateScenarioPack(candidate);
  if (
    !validation.isValid ||
    validation.pack.packId !== packId ||
    validation.pack.version !== version ||
    (row.lifecycle_status === "retired"
      ? validation.pack.status !== "published"
      : validation.pack.status !== row.lifecycle_status) ||
    ((row.lifecycle_status === "published" ||
      row.lifecycle_status === "retired") &&
      (!verifyScenarioPackContentHash(validation.pack) ||
        row.content_hash !== validation.pack.publication?.contentHash))
  ) {
    throw new ScenarioPackPublicationError(
      `Stored scenario pack ${packId}@${version} failed integrity validation.`,
    );
  }
  if (row.lifecycle_status !== "retired") {
    return deepFreeze(validation.pack);
  }
  const retired = {
    ...structuredClone(validation.pack),
    status: "retired" as const,
  };
  if (!verifyScenarioPackContentHash(retired)) {
    throw new ScenarioPackPublicationError(
      `Stored scenario pack ${packId}@${version} failed retirement integrity validation.`,
    );
  }
  return deepFreeze(retired);
}

function listItem(
  row: StoredPackRow,
  packId: string,
  version: string,
): ScenarioPackListItemV1 {
  const pack = parseStoredPack(row, packId, version);
  return {
    schemaVersion: "1.0.0",
    packId,
    version,
    status: pack.status,
    domain: pack.manifest.domain,
    titleKey: pack.manifest.title.localizationKey,
    supportedLocales: pack.supportedLocales,
    scenarioCount: pack.scenarios.length,
    ...(pack.publication === undefined
      ? {}
      : { contentHash: pack.publication.contentHash }),
    updatedAt: row.updated_at_utc,
    updatedByUserId: row.updated_by_user_id,
    ...(row.retired_at_utc === null
      ? {}
      : { retiredAt: row.retired_at_utc }),
    ...(row.retired_by_user_id === null
      ? {}
      : { retiredByUserId: row.retired_by_user_id }),
  };
}

/**
 * D1 implementation of the same immutable pack repository used by memory
 * tests. The actor is request-scoped and comes from authenticated application
 * context, never from imported pack content.
 */
export class D1ScenarioPackRepository
  implements ScenarioPackRepository
{
  constructor(
    private readonly database: D1DatabaseLike,
    private readonly clock: Clock,
    private readonly authenticatedUserId: string,
  ) {}

  async saveDraft(pack: ScenarioPackV1): Promise<void> {
    const validation = validateScenarioPack(pack);
    if (!validation.isValid) {
      const firstIssue = validation.issues[0];
      throw new ScenarioPackPublicationError(
        firstIssue === undefined
          ? "Scenario pack is invalid."
          : `${firstIssue.path}: ${firstIssue.message}`,
      );
    }
    if (pack.status === "published" || pack.status === "retired") {
      throw new ScenarioPackPublicationError(
        "Published content must enter the repository through publish().",
      );
    }
    const result = await this.database
      .prepare(UPSERT_MUTABLE_PACK)
      .bind(
        pack.packId,
        pack.version,
        pack.status,
        JSON.stringify(pack),
        this.clock.now(),
        this.authenticatedUserId,
      )
      .run();
    if (
      !result.success ||
      (result.meta?.changes !== undefined &&
        result.meta.changes !== 1)
    ) {
      throw new ScenarioPackPublicationError(
        `Published scenario pack ${pack.packId}@${pack.version} cannot be replaced.`,
      );
    }
  }

  async publish(
    packId: string,
    version: string,
    metadata: PublishScenarioPackMetadata,
  ): Promise<ScenarioPackV1> {
    const stored = await this.find(packId, version);
    if (stored === null) {
      throw new ScenarioPackPublicationError(
        `Scenario pack ${packId}@${version} does not exist.`,
      );
    }
    if (stored.status === "published" || stored.status === "retired") {
      throw new ScenarioPackPublicationError(
        `Published scenario pack ${packId}@${version} cannot be replaced.`,
      );
    }
    const published = publishScenarioPack(stored, metadata);
    const contentHash = published.publication?.contentHash;
    if (contentHash === undefined) {
      throw new ScenarioPackPublicationError(
        "Published scenario pack has no content hash.",
      );
    }
    const result = await this.database
      .prepare(UPDATE_PUBLISHED_PACK)
      .bind(
        contentHash,
        JSON.stringify(published),
        metadata.publishedAt,
        metadata.publishedBy,
        packId,
        version,
      )
      .run();
    if (
      !result.success ||
      (result.meta?.changes !== undefined &&
        result.meta.changes !== 1)
    ) {
      throw new ScenarioPackPublicationError(
        `Scenario pack ${packId}@${version} changed while it was being published.`,
      );
    }
    return published;
  }

  async find(
    packId: string,
    version: string,
  ): Promise<ScenarioPackV1 | null> {
    const row = await this.database
      .prepare(SELECT_PACK)
      .bind(packId, version)
      .first<StoredPackRow>();
    return row === null
      ? null
      : parseStoredPack(row, packId, version);
  }

  async list(): Promise<readonly ScenarioPackListItemV1[]> {
    const result = await this.database
      .prepare(SELECT_PACKS)
      .all<StoredPackRow>();
    if (!result.success) {
      throw new ScenarioPackPublicationError(
        result.error ?? "Scenario pack listing failed.",
      );
    }
    return result.results.map((row) => {
      if (row.pack_id === undefined || row.pack_version === undefined) {
        throw new ScenarioPackPublicationError(
          "Scenario pack listing returned incomplete identity metadata.",
        );
      }
      return listItem(row, row.pack_id, row.pack_version);
    });
  }

  async retire(
    packId: string,
    version: string,
    metadata: RetireScenarioPackMetadata,
  ): Promise<RetireScenarioPackResult> {
    if (
      metadata.commandId.trim().length === 0 ||
      metadata.retiredBy !== this.authenticatedUserId ||
      !Number.isFinite(Date.parse(metadata.retiredAt)) ||
      !metadata.retiredAt.endsWith("Z")
    ) {
      throw new ScenarioPackPublicationError(
        "Retirement metadata is invalid or does not match the authenticated actor.",
      );
    }
    const idempotent = await this.database
      .prepare(SELECT_RETIREMENT_COMMAND)
      .bind(metadata.commandId)
      .first<StoredPackRow>();
    if (idempotent !== null) {
      if (
        idempotent.pack_id !== packId ||
        idempotent.pack_version !== version
      ) {
        throw new ScenarioPackPublicationError(
          "Retirement command ID is already bound to another scenario pack.",
        );
      }
      return {
        pack: parseStoredPack(idempotent, packId, version),
        wasIdempotentReplay: true,
      };
    }
    const stored = await this.find(packId, version);
    if (stored === null || stored.status !== "published") {
      throw new ScenarioPackPublicationError(
        `Only a published scenario pack may be retired: ${packId}@${version}.`,
      );
    }
    const result = await this.database
      .prepare(UPDATE_RETIRED_PACK)
      .bind(
        metadata.commandId,
        metadata.retiredAt,
        metadata.retiredBy,
        metadata.retiredAt,
        metadata.retiredBy,
        packId,
        version,
      )
      .run();
    if (
      !result.success ||
      (result.meta?.changes !== undefined &&
        result.meta.changes !== 1)
    ) {
      throw new ScenarioPackPublicationError(
        `Scenario pack ${packId}@${version} changed while it was being retired.`,
      );
    }
    const retired = await this.find(packId, version);
    if (retired === null || retired.status !== "retired") {
      throw new ScenarioPackPublicationError(
        `Scenario pack ${packId}@${version} retirement was not durable.`,
      );
    }
    return { pack: retired, wasIdempotentReplay: false };
  }
}
