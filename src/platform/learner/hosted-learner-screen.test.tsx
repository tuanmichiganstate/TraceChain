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
            policyCitations: {
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
        {
          recordId: "DECISION_POLICY_AUTH_ISSUE_CERTIFICATE",
          value: {
            policyId: "AUTH_ISSUE_CERTIFICATE",
            policyType: "LEGACY_POLICY",
            titleKey:
              "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.policies.AUTH_ISSUE_CERTIFICATE.title",
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
    await user.click(
      within(actionSection).getByRole("checkbox", {
        name: "Cite Certificate-issuer authorization",
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
        citedPolicyIds: ["AUTH_ISSUE_CERTIFICATE"],
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
              startedAt: "2026-07-24T08:00:00.000Z",
              lastActivityAt: "2026-07-24T08:05:00.000Z",
              completedAt: null,
              elapsedSeconds: 300,
              activity: {
                evidenceInspectionCount: 1,
                policyConsultationCount: 0,
                citedEvidenceCount: 0,
                decisionAttemptCount: 1,
                rejectedAttemptCount: 1,
                mitigationCount: 0,
                rejectionFindings: [
                  {
                    findingCode: "DECISION_REJECTED:TEST",
                    count: 1,
                  },
                ],
              },
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
              startedAt: "2026-07-24T08:00:00.000Z",
              lastActivityAt: "2026-07-24T08:20:00.000Z",
              completedAt: "2026-07-24T08:20:00.000Z",
              elapsedSeconds: 1_200,
              activity: {
                evidenceInspectionCount: 2,
                policyConsultationCount: 1,
                citedEvidenceCount: 1,
                decisionAttemptCount: 8,
                rejectedAttemptCount: 2,
                mitigationCount: 1,
                rejectionFindings: [
                  {
                    findingCode: "DECISION_REJECTED:TEST",
                    count: 2,
                  },
                ],
              },
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

  it("shows released competency evidence without presenting another score", async () => {
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
            feedbackReleaseStatus: "released",
            createdAt: "2026-07-24T08:00:00.000Z",
            createdByUserId: "USER_INSTRUCTOR_001",
          },
          runs: [
            {
              runId: "RUN_LEARNER_001",
              learnerUserId: "USER_LEARNER_001",
              status: "completed",
              eventCount: 80,
              startedAt: "2026-07-24T08:00:00.000Z",
              lastActivityAt: "2026-07-24T08:20:00.000Z",
              completedAt: "2026-07-24T08:20:00.000Z",
              elapsedSeconds: 1_200,
              activity: {
                evidenceInspectionCount: 2,
                policyConsultationCount: 1,
                citedEvidenceCount: 1,
                decisionAttemptCount: 8,
                rejectedAttemptCount: 2,
                mitigationCount: 1,
                rejectionFindings: [],
              },
              ratings: [],
              moderationResolutions: [],
            },
          ],
        },
      ]),
      startRun: vi.fn(),
      loadRun: vi.fn().mockResolvedValue(completedProjection),
      loadFeedback: vi.fn().mockResolvedValue({
        assignmentId: "ASSIGNMENT_001",
        releasedAt: "2026-07-24T08:30:00.000Z",
        ratings: [],
        moderationResolutions: [],
        competencyProfile: {
          schemaVersion: "1.0.0",
          interpretation: "EVIDENCE_ONLY_NO_COMPETENCE_INFERENCE",
          assignmentId: "ASSIGNMENT_001",
          packId: "PACK_STANDARD_COFFEE_STAGE3",
          packVersion: "1.6.0",
          scenarioId: "SCN_COFFEE_STAGE3_FOUNDATION",
          scenarioVersion: "1.6.0",
          frameworks: [
            {
              frameworkId: "TRACECHAIN_CORE",
              frameworkVersion: "1.0.0",
            },
          ],
          learner: {
            learnerUserId: "USER_LEARNER_001",
            indicators: [
              {
                frameworkId: "TRACECHAIN_CORE",
                frameworkVersion: "1.0.0",
                competencyId: "PC2",
                competencyVersion: "1.0.0",
                competencyTitleKey:
                  "platformPack.standardCoffeeStage3.competencyFrameworks.TRACECHAIN_CORE.competencies.PC2.title",
                indicatorId: "PC2.PI1",
                indicatorVersion: "1.0.0",
                indicatorStatementKey:
                  "platformPack.standardCoffeeStage3.competencyFrameworks.TRACECHAIN_CORE.competencies.PC2.indicators.PC2.PI1.statement",
                targetType: "supporting",
                evidenceCount: 1,
                latestObservedAt: "2026-07-24T08:10:00.000Z",
                observations: [
                  {
                    runId: "RUN_LEARNER_001",
                    competencyEvidenceId: "CEV_INSPECTION_001",
                    evidenceRuleId: "RULE_CERTIFICATE_INSPECTED",
                    sourceEventIds: ["EVENT_INSPECTION_001"],
                    observedAt: "2026-07-24T08:10:00.000Z",
                  },
                ],
                currentRatings: [],
              },
            ],
          },
        },
      }),
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
      await screen.findByRole("heading", {
        name: "Your competency evidence",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Evidence evaluation")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This profile reports observable evidence from this assignment. It does not infer lasting competence or add another score.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("EVENT_INSPECTION_001")).toBeInTheDocument();
  });
});
