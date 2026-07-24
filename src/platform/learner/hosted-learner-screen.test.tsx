import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../app/providers/locale-provider";
import type { LearnerRunProjectionV1 } from "../contracts/run-events";
import {
  HostedLearnerApiError,
  HostedLearnerScreen,
  type HostedLearnerApi,
} from "./hosted-learner-screen";

function projection(
  action = "INSPECT_EVIDENCE",
): LearnerRunProjectionV1 {
  return {
    schemaVersion: "1.0.0",
    runId: "RUN_LEARNER_001",
    version: 2,
    roleId: "LOGISTICS_COORDINATOR",
    businessState: [],
    ledgerState: { transactions: [] },
    informationState: [
      {
        recordId: "EVID_CERTIFICATE_RECORD",
        value: { certificateStatus: "visible" },
      },
    ],
    policyState: [],
    workflowState: {
      currentNodeId: "certificate-evidence",
      completedNodeIds: [],
      permittedActionIds: [action],
    },
  };
}

describe("hosted learner workspace", () => {
  it("starts an assigned run and submits its server-authorized action", async () => {
    const loadAssignments = vi.fn()
      .mockResolvedValueOnce([
        {
          assignment: {
            schemaVersion: "1.0.0",
            assignmentId: "ASSIGNMENT_001",
            title: "Coffee governance",
            packId: "PACK_COFFEE",
            packVersion: "1.4.0",
            scenarioId: "SCN_COFFEE",
            scenarioVersion: "1.4.0",
            mode: "tutorial",
            runConfiguration: {
              mode: "tutorial",
              allowHints: true,
              allowRetry: true,
              allowBacktracking: true,
              feedbackTiming: "immediate",
              showScores: true,
              outcomeStrategy: "forced",
              seedPolicy: "generated",
              allowCommunication: false,
              allowEvidenceRequests: true,
            },
            learnerUserIds: ["USER_LEARNER_001"],
            status: "active",
            feedbackReleaseStatus: "withheld",
            createdAt: "2026-07-24T08:00:00.000Z",
            createdByUserId: "USER_INSTRUCTOR_001",
          },
          runs: [],
        },
      ])
      .mockResolvedValueOnce([]);
    const submit = vi.fn().mockResolvedValue({
      ...projection("SUBMIT_CERTIFICATE_DECISION"),
      version: 4,
      policyState: [
        {
          recordId: "DECISION_RESPONSE_REQUIREMENTS",
          value: {
            evidenceCitations: {
              required: true,
              minimumItems: 1,
              maximumItems: 1,
            },
            confidenceRating: {
              required: true,
              minimum: 1,
              maximum: 5,
            },
            adverseEventProbabilityPercent: {
              required: true,
              minimum: 0,
              maximum: 100,
            },
          },
        },
      ],
      workflowState: {
        currentNodeId: "certificate-decision",
        completedNodeIds: ["certificate-evidence"],
        permittedActionIds: ["SUBMIT_CERTIFICATE_DECISION"],
      },
    });
    const api: HostedLearnerApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_LEARNER_001",
        email: "learner@example.edu",
        roles: ["learner"],
      }),
      loadAssignments,
      startRun: vi.fn().mockResolvedValue("RUN_LEARNER_001"),
      loadRun: vi.fn().mockResolvedValue(projection()),
      loadFeedback: vi.fn(),
      submit,
    };
    render(
      <LocaleProvider locale="en">
        <HostedLearnerScreen api={api} />
      </LocaleProvider>,
    );
    const assignments = (await screen.findByRole("heading", {
      name: "Assigned simulations",
    })).closest("section");
    if (assignments === null) throw new Error("Expected assignments.");
    const user = userEvent.setup();
    await user.click(
      within(assignments).getByRole("button", { name: "Start" }),
    );
    const actionSection = (await screen.findByRole("heading", {
      name: "Submit the current action",
    })).closest("section");
    if (actionSection === null) throw new Error("Expected action section.");
    await user.click(
      within(actionSection).getByRole("button", { name: "Submit" }),
    );

    expect(api.startRun).toHaveBeenCalledWith("ASSIGNMENT_001");
    expect(submit).toHaveBeenCalledWith(
      "RUN_LEARNER_001",
      expect.objectContaining({
        commandType: "INSPECT_EVIDENCE",
        evidenceId: "EVID_CERTIFICATE_RECORD",
      }),
    );
    expect(
      within(actionSection).getByLabelText(
        "Certificate content and validity",
      ),
    ).toBeInTheDocument();
    await user.type(
      within(actionSection).getByLabelText("Decision justification"),
      "The certificate record supports this decision.",
    );
    await user.click(
      within(actionSection).getByRole("checkbox", {
        name: "Cite Quality certificate record",
      }),
    );
    await user.selectOptions(
      within(actionSection).getByLabelText("Confidence"),
      "4",
    );
    await user.clear(
      within(actionSection).getByLabelText(
        "Estimated probability of an adverse event (%)",
      ),
    );
    await user.type(
      within(actionSection).getByLabelText(
        "Estimated probability of an adverse event (%)",
      ),
      "20",
    );
    await user.click(
      within(actionSection).getByRole("button", { name: "Submit" }),
    );

    expect(submit).toHaveBeenLastCalledWith(
      "RUN_LEARNER_001",
      expect.objectContaining({
        commandType: "SUBMIT_CERTIFICATE_DECISION",
        citedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
        confidenceRating: 4,
        adverseEventProbabilityPercent: 20,
      }),
    );
  });

  it("preserves an incorrect discrepancy choice in the submitted command", async () => {
    const discrepancyProjection = {
      ...projection("SUBMIT_DISCREPANCY_DECISION"),
      version: 20,
      workflowState: {
        currentNodeId: "discrepancy-decision",
        completedNodeIds: [],
        permittedActionIds: ["SUBMIT_DISCREPANCY_DECISION"],
      },
    };
    const submit = vi.fn().mockResolvedValue(discrepancyProjection);
    const api: HostedLearnerApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_LEARNER_001",
        email: "learner@example.edu",
        roles: ["learner"],
      }),
      loadAssignments: vi.fn().mockResolvedValue([
        {
          assignment: {
            schemaVersion: "1.0.0",
            assignmentId: "ASSIGNMENT_001",
            title: "Coffee governance",
            packId: "PACK_COFFEE",
            packVersion: "1.4.0",
            scenarioId: "SCN_COFFEE",
            scenarioVersion: "1.4.0",
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
            learnerUserIds: ["USER_LEARNER_001"],
            status: "active",
            feedbackReleaseStatus: "withheld",
            createdAt: "2026-07-24T08:00:00.000Z",
            createdByUserId: "USER_INSTRUCTOR_001",
          },
          runs: [
            {
              runId: "RUN_LEARNER_001",
              learnerUserId: "USER_LEARNER_001",
              status: "active",
              eventCount: 20,
              ratings: [],
              moderationResolutions: [],
            },
          ],
        },
      ]),
      startRun: vi.fn(),
      loadRun: vi.fn().mockResolvedValue(discrepancyProjection),
      loadFeedback: vi.fn(),
      submit,
    };
    render(
      <LocaleProvider locale="en">
        <HostedLearnerScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Resume" }),
    );
    await user.selectOptions(
      await screen.findByLabelText("Discrepancy response"),
      "OVERWRITE",
    );
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(submit).toHaveBeenCalledWith(
      "RUN_LEARNER_001",
      expect.objectContaining({
        commandType: "SUBMIT_DISCREPANCY_DECISION",
        decision: {
          action: "OVERWRITE",
          causeCode: "TYPING_ERROR",
        },
      }),
    );
  });

  it("shows an honest withheld state after a completed run", async () => {
    const completedProjection = {
      ...projection(),
      version: 80,
      workflowState: {
        currentNodeId: "complete",
        completedNodeIds: ["blockchain-necessity-decision"],
        permittedActionIds: [],
      },
    };
    const api: HostedLearnerApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_LEARNER_001",
        email: "learner@example.edu",
        roles: ["learner"],
      }),
      loadAssignments: vi.fn().mockResolvedValue([
        {
          assignment: {
            schemaVersion: "1.0.0",
            assignmentId: "ASSIGNMENT_001",
            title: "Coffee governance",
            packId: "PACK_COFFEE",
            packVersion: "1.4.0",
            scenarioId: "SCN_COFFEE",
            scenarioVersion: "1.4.0",
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
            learnerUserIds: ["USER_LEARNER_001"],
            status: "active",
            feedbackReleaseStatus: "withheld",
            createdAt: "2026-07-24T08:00:00.000Z",
            createdByUserId: "USER_INSTRUCTOR_001",
          },
          runs: [
            {
              runId: "RUN_LEARNER_001",
              learnerUserId: "USER_LEARNER_001",
              status: "completed",
              eventCount: 80,
              ratings: [],
              moderationResolutions: [],
            },
          ],
        },
      ]),
      startRun: vi.fn(),
      loadRun: vi.fn().mockResolvedValue(completedProjection),
      loadFeedback: vi.fn().mockRejectedValue(
        new HostedLearnerApiError("FEEDBACK_NOT_RELEASED"),
      ),
      submit: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <HostedLearnerScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Review" }),
    );

    expect(
      await screen.findByText(
        "Instructor feedback has not been released yet.",
      ),
    ).toBeInTheDocument();
    expect(api.loadFeedback).toHaveBeenCalledWith("RUN_LEARNER_001");
  });
});
