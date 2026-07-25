import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import type {
  CounterfactualReflectionResponseV1,
  CounterfactualReflectionV1,
} from "../contracts/counterfactual";
import type { D1DatabaseLike } from "./d1-types";

const MAXIMUM_RESPONSE_LENGTH = 1_000;

interface ReflectionRow {
  readonly reflection_json: string;
}

export class CounterfactualReflectionRepositoryError extends Error {
  constructor(
    readonly code:
      | "INVALID_COUNTERFACTUAL_REFLECTION"
      | "COUNTERFACTUAL_REFLECTION_CONFLICT"
      | "COUNTERFACTUAL_REFLECTION_STORAGE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "CounterfactualReflectionRepositoryError";
  }
}

function boundedResponse(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > MAXIMUM_RESPONSE_LENGTH
  ) {
    throw new CounterfactualReflectionRepositoryError(
      "INVALID_COUNTERFACTUAL_REFLECTION",
      `${fieldName} must contain 1 to ${String(MAXIMUM_RESPONSE_LENGTH)} characters.`,
    );
  }
  return value.trim();
}

export function normalizeCounterfactualReflectionResponse(
  value: unknown,
): CounterfactualReflectionResponseV1 {
  if (typeof value !== "object" || value === null) {
    throw new CounterfactualReflectionRepositoryError(
      "INVALID_COUNTERFACTUAL_REFLECTION",
      "A counterfactual reflection response is required.",
    );
  }
  const response = value as Readonly<Record<string, unknown>>;
  return {
    evidenceThatMattered: boundedResponse(
      response.evidenceThatMattered,
      "evidenceThatMattered",
    ),
    reasonForDifference: boundedResponse(
      response.reasonForDifference,
      "reasonForDifference",
    ),
    foreseeableConsequences: boundedResponse(
      response.foreseeableConsequences,
      "foreseeableConsequences",
    ),
    laterInformation: boundedResponse(
      response.laterInformation,
      "laterInformation",
    ),
    revisedDecisionRule: boundedResponse(
      response.revisedDecisionRule,
      "revisedDecisionRule",
    ),
  };
}

function parseReflection(serialized: string): CounterfactualReflectionV1 {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new CounterfactualReflectionRepositoryError(
      "COUNTERFACTUAL_REFLECTION_STORAGE_FAILED",
      "Stored counterfactual reflection is not valid JSON.",
    );
  }
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { schemaVersion?: unknown }).schemaVersion !==
      "1.0.0" ||
    typeof (value as { reflectionId?: unknown }).reflectionId !==
      "string" ||
    typeof (value as { branchRunId?: unknown }).branchRunId !==
      "string"
  ) {
    throw new CounterfactualReflectionRepositoryError(
      "COUNTERFACTUAL_REFLECTION_STORAGE_FAILED",
      "Stored counterfactual reflection violates its current contract.",
    );
  }
  return value as CounterfactualReflectionV1;
}

function sameReflectionRequest(
  existing: CounterfactualReflectionV1,
  requested: CounterfactualReflectionV1,
): boolean {
  return (
    existing.reflectionId === requested.reflectionId &&
    existing.branchRunId === requested.branchRunId &&
    existing.submittedByUserId === requested.submittedByUserId &&
    canonicalize(existing.response) ===
      canonicalize(requested.response)
  );
}

export class D1CounterfactualReflectionRepository {
  constructor(private readonly database: D1DatabaseLike) {}

  async create(
    reflection: CounterfactualReflectionV1,
  ): Promise<{
    readonly reflection: CounterfactualReflectionV1;
    readonly wasIdempotentReplay: boolean;
  }> {
    const existing = await this.find(reflection.branchRunId);
    if (existing !== null) {
      if (!sameReflectionRequest(existing, reflection)) {
        throw new CounterfactualReflectionRepositoryError(
          "COUNTERFACTUAL_REFLECTION_CONFLICT",
          "The counterfactual branch already has a different reflection.",
        );
      }
      return { reflection: existing, wasIdempotentReplay: true };
    }
    const result = await this.database
      .prepare(
        `INSERT INTO counterfactual_reflections (
          reflection_id,
          branch_run_id,
          submitted_by_user_id,
          submitted_at_utc,
          reflection_json
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        reflection.reflectionId,
        reflection.branchRunId,
        reflection.submittedByUserId,
        reflection.submittedAt,
        JSON.stringify(reflection),
      )
      .run();
    if (!result.success) {
      const afterRace = await this.find(reflection.branchRunId);
      if (
        afterRace !== null &&
        sameReflectionRequest(afterRace, reflection)
      ) {
        return {
          reflection: afterRace,
          wasIdempotentReplay: true,
        };
      }
      throw new CounterfactualReflectionRepositoryError(
        "COUNTERFACTUAL_REFLECTION_STORAGE_FAILED",
        result.error ?? "The reflection could not be stored.",
      );
    }
    return {
      reflection: structuredClone(reflection),
      wasIdempotentReplay: false,
    };
  }

  async find(
    branchRunId: string,
  ): Promise<CounterfactualReflectionV1 | null> {
    const row = await this.database
      .prepare(
        `SELECT reflection_json
        FROM counterfactual_reflections
        WHERE branch_run_id = ?`,
      )
      .bind(branchRunId)
      .first<ReflectionRow>();
    return row === null
      ? null
      : parseReflection(row.reflection_json);
  }
}
