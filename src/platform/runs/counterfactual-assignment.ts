import type {
  AssignmentCounterfactualConfigurationV1,
  AssignmentRunMode,
} from "../contracts/assessment";

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
const LEARNER_AVAILABILITY = new Set([
  "DISABLED",
  "AFTER_RUN_COMPLETION",
  "AFTER_FEEDBACK_RELEASE",
]);

export class AssignmentCounterfactualConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssignmentCounterfactualConfigurationError";
  }
}

export function disabledAssignmentCounterfactualConfiguration():
  AssignmentCounterfactualConfigurationV1 {
  return {
    enabled: false,
    allowedDecisionNodeIds: [],
    maximumBranchesPerLearner: 1,
    learnerAvailability: "DISABLED",
    requireReflection: false,
  };
}

export function validateAssignmentCounterfactualConfiguration(
  value: unknown,
  mode: AssignmentRunMode,
): AssignmentCounterfactualConfigurationV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new AssignmentCounterfactualConfigurationError(
      "counterfactualReplay must be a resolved object.",
    );
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  if (
    typeof candidate.enabled !== "boolean" ||
    !Array.isArray(candidate.allowedDecisionNodeIds) ||
    !Number.isInteger(candidate.maximumBranchesPerLearner) ||
    (candidate.maximumBranchesPerLearner as number) < 1 ||
    (candidate.maximumBranchesPerLearner as number) > 20 ||
    typeof candidate.learnerAvailability !== "string" ||
    !LEARNER_AVAILABILITY.has(
      candidate.learnerAvailability,
    ) ||
    typeof candidate.requireReflection !== "boolean"
  ) {
    throw new AssignmentCounterfactualConfigurationError(
      "counterfactualReplay violates its bounded assignment contract.",
    );
  }
  const allowedDecisionNodeIds = [
    ...new Set(
      candidate.allowedDecisionNodeIds.map((nodeId) => {
        if (
          typeof nodeId !== "string" ||
          !IDENTIFIER.test(nodeId)
        ) {
          throw new AssignmentCounterfactualConfigurationError(
            "counterfactualReplay contains an invalid decision node ID.",
          );
        }
        return nodeId;
      }),
    ),
  ].sort();
  if (
    allowedDecisionNodeIds.length !==
    candidate.allowedDecisionNodeIds.length
  ) {
    throw new AssignmentCounterfactualConfigurationError(
      "counterfactualReplay decision node IDs must be unique.",
    );
  }
  if (
    (!candidate.enabled &&
      (allowedDecisionNodeIds.length > 0 ||
        candidate.learnerAvailability !== "DISABLED" ||
        candidate.requireReflection)) ||
    (candidate.enabled && allowedDecisionNodeIds.length === 0) ||
    (mode !== "sandbox" &&
      candidate.learnerAvailability !== "DISABLED")
  ) {
    throw new AssignmentCounterfactualConfigurationError(
      "counterfactualReplay settings conflict with assignment mode or enabled state.",
    );
  }
  return {
    enabled: candidate.enabled,
    allowedDecisionNodeIds,
    maximumBranchesPerLearner:
      candidate.maximumBranchesPerLearner as number,
    learnerAvailability:
      candidate.learnerAvailability as AssignmentCounterfactualConfigurationV1["learnerAvailability"],
    requireReflection: candidate.requireReflection,
  };
}
