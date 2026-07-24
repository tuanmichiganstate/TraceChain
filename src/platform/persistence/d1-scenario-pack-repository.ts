import type { Clock } from "../../domain/simulation/environment";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import {
  publishScenarioPack,
  ScenarioPackPublicationError,
  verifyScenarioPackContentHash,
  type PublishScenarioPackMetadata,
  type ScenarioPackRepository,
} from "../scenario-packs/publication";
import { validateScenarioPack } from "../scenario-packs/validation";
import type { D1DatabaseLike } from "./d1-types";

const SELECT_PACK = `SELECT pack_json
  FROM scenario_pack_versions
  WHERE pack_id = ? AND pack_version = ?`;
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

interface StoredPackRow {
  readonly pack_json: string;
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
  value: string,
  packId: string,
  version: string,
): ScenarioPackV1 {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
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
    ((validation.pack.status === "published" ||
      validation.pack.status === "retired") &&
      !verifyScenarioPackContentHash(validation.pack))
  ) {
    throw new ScenarioPackPublicationError(
      `Stored scenario pack ${packId}@${version} failed integrity validation.`,
    );
  }
  return deepFreeze(validation.pack);
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
      : parseStoredPack(row.pack_json, packId, version);
  }
}
