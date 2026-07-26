import { describe, expect, it } from "vitest";
import type { HostedAssignmentV1 } from "../contracts/assessment";
import { assignmentStartAvailability } from "./assignment-availability";

const assignment: HostedAssignmentV1 = {
  schemaVersion: "1.3.0",
  assignmentId: "ASSIGNMENT_AVAILABILITY_001",
  title: "Availability cohort",
  packId: "PACK_STANDARD_COFFEE_STAGE3",
  packVersion: "1.7.0",
  scenarioId: "SCN_COFFEE_STAGE3_FOUNDATION",
  scenarioVersion: "1.7.0",
  mode: "standard",
  runConfiguration: {
    mode: "standard",
    allowHints: false,
    allowRetry: false,
    allowBacktracking: false,
    feedbackTiming: "final",
    showScores: false,
    outcomeStrategy: "forced",
    seedPolicy: "supplied",
    allowCommunication: false,
    allowEvidenceRequests: true,
  },
  counterfactualReplay: {
    enabled: false,
    allowedDecisionNodeIds: [],
    maximumBranchesPerLearner: 1,
    learnerAvailability: "DISABLED",
    requireReflection: false,
  },
  research: { enabled: false },
  learnerUserIds: ["USER_LEARNER_001"],
  status: "active",
  availableFrom: "2026-08-01T00:00:00.000Z",
  availableUntil: "2026-08-02T00:00:00.000Z",
  feedbackReleaseStatus: "withheld",
  createdAt: "2026-07-25T00:00:00.000Z",
  createdByUserId: "USER_INSTRUCTOR_001",
};

describe("assignment start availability", () => {
  it("opens inclusively and ends exclusively at authored UTC boundaries", () => {
    expect(
      assignmentStartAvailability(
        assignment,
        "2026-07-31T23:59:59.999Z",
      ).status,
    ).toBe("not-yet-open");
    expect(
      assignmentStartAvailability(
        assignment,
        "2026-08-01T00:00:00.000Z",
      ).status,
    ).toBe("available");
    expect(
      assignmentStartAvailability(
        assignment,
        "2026-08-02T00:00:00.000Z",
      ).status,
    ).toBe("ended");
  });

  it("gives explicit closure precedence over the date window", () => {
    expect(
      assignmentStartAvailability(
        {
          ...assignment,
          status: "closed",
          closedAt: "2026-07-25T12:00:00.000Z",
          closedByUserId: "USER_INSTRUCTOR_001",
        },
        "2026-08-01T12:00:00.000Z",
      ).status,
    ).toBe("closed");
  });
});
