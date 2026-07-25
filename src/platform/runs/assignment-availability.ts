import type {
  AssignmentStartAvailabilityV1,
  HostedAssignmentV1,
} from "../contracts/assessment";

function timestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }
  return parsed;
}

export function assignmentStartAvailability(
  assignment: HostedAssignmentV1,
  observedAt: string,
): AssignmentStartAvailabilityV1 {
  const observedAtMs = timestamp(observedAt, "observedAt");
  if (assignment.status === "closed") {
    return { status: "closed", observedAt };
  }
  if (
    assignment.availableFrom !== undefined &&
    observedAtMs <
      timestamp(assignment.availableFrom, "availableFrom")
  ) {
    return { status: "not-yet-open", observedAt };
  }
  if (
    assignment.availableUntil !== undefined &&
    observedAtMs >=
      timestamp(assignment.availableUntil, "availableUntil")
  ) {
    return { status: "ended", observedAt };
  }
  return { status: "available", observedAt };
}
