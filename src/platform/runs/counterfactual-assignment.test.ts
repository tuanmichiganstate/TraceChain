import { describe, expect, it } from "vitest";
import {
  AssignmentCounterfactualConfigurationError,
  disabledAssignmentCounterfactualConfiguration,
  validateAssignmentCounterfactualConfiguration,
} from "./counterfactual-assignment";

describe("assignment counterfactual configuration", () => {
  it("requires one resolved bounded contract without defaults", () => {
    expect(
      validateAssignmentCounterfactualConfiguration(
        disabledAssignmentCounterfactualConfiguration(),
        "standard",
      ),
    ).toEqual(
      disabledAssignmentCounterfactualConfiguration(),
    );
    expect(() =>
      validateAssignmentCounterfactualConfiguration(
        undefined,
        "standard",
      ),
    ).toThrow(AssignmentCounterfactualConfigurationError);
    expect(() =>
      validateAssignmentCounterfactualConfiguration(
        {
          enabled: true,
          allowedDecisionNodeIds: [],
          maximumBranchesPerLearner: 3,
          learnerAvailability: "DISABLED",
          requireReflection: true,
        },
        "standard",
      ),
    ).toThrow(AssignmentCounterfactualConfigurationError);
  });

  it("allows learner branches only for bounded Sandbox assignments", () => {
    const configuration = {
      enabled: true,
      allowedDecisionNodeIds: [
        "NODE_RECALL_SCOPE_DECISION",
        "NODE_CERTIFICATE_DECISION",
      ],
      maximumBranchesPerLearner: 3,
      learnerAvailability: "AFTER_FEEDBACK_RELEASE",
      requireReflection: true,
    } as const;

    expect(
      validateAssignmentCounterfactualConfiguration(
        configuration,
        "sandbox",
      ),
    ).toEqual({
      ...configuration,
      allowedDecisionNodeIds: [
        "NODE_CERTIFICATE_DECISION",
        "NODE_RECALL_SCOPE_DECISION",
      ],
    });
    expect(() =>
      validateAssignmentCounterfactualConfiguration(
        configuration,
        "standard",
      ),
    ).toThrow(AssignmentCounterfactualConfigurationError);
    expect(() =>
      validateAssignmentCounterfactualConfiguration(
        {
          ...configuration,
          allowedDecisionNodeIds: [
            "NODE_CERTIFICATE_DECISION",
            "NODE_CERTIFICATE_DECISION",
          ],
        },
        "sandbox",
      ),
    ).toThrow(AssignmentCounterfactualConfigurationError);
  });
});
