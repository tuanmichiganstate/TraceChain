import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import type { CounterfactualRunMetadataV1 } from "../contracts/counterfactual";

export interface SaveCounterfactualRunResult {
  readonly metadata: CounterfactualRunMetadataV1;
  readonly wasIdempotentReplay: boolean;
}

export interface CounterfactualRunRepository {
  create(
    metadata: CounterfactualRunMetadataV1,
  ): Promise<SaveCounterfactualRunResult>;
  find(
    branchRunId: string,
  ): Promise<CounterfactualRunMetadataV1 | null>;
  listBySourceRun(
    sourceRunId: string,
  ): Promise<readonly CounterfactualRunMetadataV1[]>;
}

export class CounterfactualRunRepositoryError extends Error {
  constructor(
    readonly code: "COUNTERFACTUAL_BRANCH_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "CounterfactualRunRepositoryError";
  }
}

function immutableClone(
  metadata: CounterfactualRunMetadataV1,
): CounterfactualRunMetadataV1 {
  return Object.freeze(structuredClone(metadata));
}

export class MemoryCounterfactualRunRepository
  implements CounterfactualRunRepository
{
  private readonly records = new Map<
    string,
    CounterfactualRunMetadataV1
  >();

  async create(
    metadata: CounterfactualRunMetadataV1,
  ): Promise<SaveCounterfactualRunResult> {
    const existing = this.records.get(metadata.branchRunId);
    if (existing !== undefined) {
      if (canonicalize(existing) !== canonicalize(metadata)) {
        throw new CounterfactualRunRepositoryError(
          "COUNTERFACTUAL_BRANCH_CONFLICT",
          `Counterfactual branch ${metadata.branchRunId} already exists with different metadata.`,
        );
      }
      return {
        metadata: existing,
        wasIdempotentReplay: true,
      };
    }
    const stored = immutableClone(metadata);
    this.records.set(metadata.branchRunId, stored);
    return {
      metadata: stored,
      wasIdempotentReplay: false,
    };
  }

  async find(
    branchRunId: string,
  ): Promise<CounterfactualRunMetadataV1 | null> {
    return this.records.get(branchRunId) ?? null;
  }

  async listBySourceRun(
    sourceRunId: string,
  ): Promise<readonly CounterfactualRunMetadataV1[]> {
    return [...this.records.values()]
      .filter((metadata) => metadata.sourceRunId === sourceRunId)
      .sort((left, right) => {
        const timestampOrder = left.createdAt.localeCompare(
          right.createdAt,
        );
        return timestampOrder === 0
          ? left.branchRunId.localeCompare(right.branchRunId)
          : timestampOrder;
      });
  }
}
