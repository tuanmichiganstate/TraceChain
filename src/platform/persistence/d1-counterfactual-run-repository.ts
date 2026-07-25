import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import type { CounterfactualRunMetadataV1 } from "../contracts/counterfactual";
import {
  CounterfactualRunRepositoryError,
  type CounterfactualRunRepository,
  type SaveCounterfactualRunResult,
} from "../runs/counterfactual-repository";
import type { D1DatabaseLike } from "./d1-types";

const SELECT_BY_ID = `SELECT metadata_json
  FROM counterfactual_runs
  WHERE branch_run_id = ?`;
const SELECT_BY_SOURCE = `SELECT metadata_json
  FROM counterfactual_runs
  WHERE source_run_id = ?
  ORDER BY created_at_utc ASC, branch_run_id ASC`;
const INSERT = `INSERT INTO counterfactual_runs (
  branch_run_id,
  source_run_id,
  fork_sequence_number,
  source_pack_id,
  source_pack_version,
  source_scenario_id,
  source_scenario_version,
  intervention_id,
  comparison_mode,
  created_by_user_id,
  created_at_utc,
  metadata_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

interface StoredCounterfactualRow {
  readonly metadata_json: string;
}

export class D1CounterfactualRunRepositoryError extends Error {
  constructor(
    readonly code:
      | "D1_QUERY_FAILED"
      | "CORRUPT_COUNTERFACTUAL_METADATA",
    message: string,
  ) {
    super(message);
    this.name = "D1CounterfactualRunRepositoryError";
  }
}

function parseMetadata(serialized: string): CounterfactualRunMetadataV1 {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new D1CounterfactualRunRepositoryError(
      "CORRUPT_COUNTERFACTUAL_METADATA",
      "Stored counterfactual metadata is not valid JSON.",
    );
  }
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { schemaVersion?: unknown }).schemaVersion !== "1.0.0" ||
    typeof (value as { branchRunId?: unknown }).branchRunId !==
      "string" ||
    typeof (value as { sourceRunId?: unknown }).sourceRunId !==
      "string" ||
    !Number.isInteger(
      (value as { forkSequenceNumber?: unknown }).forkSequenceNumber,
    ) ||
    (value as { counterfactualType?: unknown }).counterfactualType !==
      "DECISION"
  ) {
    throw new D1CounterfactualRunRepositoryError(
      "CORRUPT_COUNTERFACTUAL_METADATA",
      "Stored counterfactual metadata does not satisfy its versioned contract.",
    );
  }
  return value as CounterfactualRunMetadataV1;
}

export class D1CounterfactualRunRepository
  implements CounterfactualRunRepository
{
  constructor(private readonly database: D1DatabaseLike) {}

  async create(
    metadata: CounterfactualRunMetadataV1,
  ): Promise<SaveCounterfactualRunResult> {
    const existing = await this.find(metadata.branchRunId);
    if (existing !== null) {
      return this.resolveExisting(existing, metadata);
    }
    const result = await this.database
      .prepare(INSERT)
      .bind(
        metadata.branchRunId,
        metadata.sourceRunId,
        metadata.forkSequenceNumber,
        metadata.sourcePackId,
        metadata.sourcePackVersion,
        metadata.sourceScenarioId,
        metadata.sourceScenarioVersion,
        metadata.interventionId,
        metadata.comparisonMode,
        metadata.createdByUserId,
        metadata.createdAt,
        JSON.stringify(metadata),
      )
      .run();
    if (!result.success) {
      const afterRace = await this.find(metadata.branchRunId);
      if (afterRace !== null) {
        return this.resolveExisting(afterRace, metadata);
      }
      throw new D1CounterfactualRunRepositoryError(
        "D1_QUERY_FAILED",
        result.error ?? "D1 rejected counterfactual metadata.",
      );
    }
    return {
      metadata: structuredClone(metadata),
      wasIdempotentReplay: false,
    };
  }

  async find(
    branchRunId: string,
  ): Promise<CounterfactualRunMetadataV1 | null> {
    const row = await this.database
      .prepare(SELECT_BY_ID)
      .bind(branchRunId)
      .first<StoredCounterfactualRow>();
    return row === null ? null : parseMetadata(row.metadata_json);
  }

  async listBySourceRun(
    sourceRunId: string,
  ): Promise<readonly CounterfactualRunMetadataV1[]> {
    const result = await this.database
      .prepare(SELECT_BY_SOURCE)
      .bind(sourceRunId)
      .all<StoredCounterfactualRow>();
    if (!result.success) {
      throw new D1CounterfactualRunRepositoryError(
        "D1_QUERY_FAILED",
        result.error ?? "Could not list counterfactual branches.",
      );
    }
    return result.results.map((row) => parseMetadata(row.metadata_json));
  }

  private resolveExisting(
    existing: CounterfactualRunMetadataV1,
    requested: CounterfactualRunMetadataV1,
  ): SaveCounterfactualRunResult {
    if (canonicalize(existing) !== canonicalize(requested)) {
      throw new CounterfactualRunRepositoryError(
        "COUNTERFACTUAL_BRANCH_CONFLICT",
        `Counterfactual branch ${requested.branchRunId} already exists with different metadata.`,
      );
    }
    return {
      metadata: existing,
      wasIdempotentReplay: true,
    };
  }
}
