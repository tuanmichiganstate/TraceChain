import type { JsonObject, JsonValue } from "../contracts/json";
import type { AutomatedEvidenceRuleV1 } from "../contracts/rubric";
import type { RunEventV1 } from "../contracts/run-events";

export type AutomatedEvidenceRuleMismatchReason =
  | "EVENT_TYPE_MISMATCH"
  | "FIELD_NOT_FOUND"
  | "FIELD_VALUE_MISMATCH";

export type AutomatedEvidenceRuleEvaluation =
  | { readonly matched: true }
  | {
      readonly matched: false;
      readonly reason: AutomatedEvidenceRuleMismatchReason;
    };

const FORBIDDEN_PATH_SEGMENTS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function isJsonObject(value: JsonValue): value is JsonObject {
  return (
    value !== null && typeof value === "object" && !Array.isArray(value)
  );
}

function resolvePayloadField(
  payload: JsonObject,
  fieldPath: string | undefined,
): JsonValue | undefined {
  if (fieldPath === undefined || fieldPath.length === 0) {
    return undefined;
  }
  const segments = fieldPath.split(".");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 || FORBIDDEN_PATH_SEGMENTS.has(segment),
    )
  ) {
    return undefined;
  }

  let current: JsonValue = payload;
  for (const segment of segments) {
    if (
      !isJsonObject(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined;
    }
    current = current[segment] as JsonValue;
  }
  return current;
}

function isComparableScalar(
  value: JsonValue | undefined,
): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function evaluateAutomatedEvidenceRule(
  rule: AutomatedEvidenceRuleV1,
  event: RunEventV1,
): AutomatedEvidenceRuleEvaluation {
  if (event.eventType !== rule.eventType) {
    return { matched: false, reason: "EVENT_TYPE_MISMATCH" };
  }
  if (rule.operator === "EVENT_OCCURRED") {
    return { matched: true };
  }

  const fieldValue = resolvePayloadField(
    event.payload,
    rule.fieldPath,
  );
  if (!isComparableScalar(fieldValue)) {
    return { matched: false, reason: "FIELD_NOT_FOUND" };
  }

  const matched =
    rule.operator === "FIELD_EQUALS"
      ? fieldValue === rule.expectedValue
      : rule.expectedValues?.includes(fieldValue) === true;

  return matched
    ? { matched: true }
    : { matched: false, reason: "FIELD_VALUE_MISMATCH" };
}
