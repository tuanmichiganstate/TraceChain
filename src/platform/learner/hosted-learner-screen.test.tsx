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

const availableStart = {
  status: "available" as const,
  observedAt: "2026-07-25T05:00:00.000Z",
};

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
          startAvailability: availableStart,
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

  it("renders and submits an authored decision from a generic scenario pack", async () => {
    const genericProjection: LearnerRunProjectionV1 = {
      schemaVersion: "1.0.0",
      runId: "RUN_PHARMA_001",
      version: 4,
      roleId: "QUALITY_MANAGER",
      businessState: [
        {
          recordId: "status",
          value: "AWAITING_RELEASE",
        },
      ],
      ledgerState: {
        custodyRecordStatus: "SIGNED_AND_INTACT",
      },
      informationState: [
        {
          recordId: "EVID_PHARMA_SENSOR_SUMMARY",
          value: {
            content: {
              maximumTemperatureC: 12.4,
            },
          },
        },
      ],
      policyState: [],
      workflowState: {
        currentNodeId: "NODE_PHARMA_DECISION",
        completedNodeIds: [
          "NODE_PHARMA_BRIEFING",
          "NODE_PHARMA_EVIDENCE",
        ],
        permittedActionIds: [
          "INSPECT_EVIDENCE",
          "SUBMIT_STRUCTURED_DECISION",
        ],
      },
      presentation: {
        scenarioTitle: {
          localizationKey: "pharma.scenario",
          valuesByLocale: {
            en: "Temperature excursion review",
            vi: "Xem xét sai lệch nhiệt độ",
          },
        },
        roleName: {
          localizationKey: "pharma.role",
          valuesByLocale: {
            en: "Quality manager",
            vi: "Quản lý chất lượng",
          },
        },
        currentNode: {
          nodeId: "NODE_PHARMA_DECISION",
          nodeType: "DECISION",
          title: {
            localizationKey: "pharma.decision.title",
            valuesByLocale: {
              en: "Make a release decision",
              vi: "Đưa ra quyết định xuất hàng",
            },
          },
          decisionId: "DECISION_PHARMA_RELEASE",
          prompt: {
            localizationKey: "pharma.decision.prompt",
            valuesByLocale: {
              en: "Choose a proportionate response.",
              vi: "Chọn cách xử lý tương xứng.",
            },
          },
          fields: [
            {
              fieldId: "shipmentAction",
              prompt: {
                localizationKey: "pharma.field.action",
                valuesByLocale: {
                  en: "Shipment action",
                  vi: "Cách xử lý lô hàng",
                },
              },
              selection: "single",
              options: [
                {
                  optionId: "HOLD_AND_INVESTIGATE",
                  label: {
                    localizationKey: "pharma.option.hold",
                    valuesByLocale: {
                      en: "Hold and investigate",
                      vi: "Giữ lại và điều tra",
                    },
                  },
                },
                {
                  optionId: "RELEASE_WITHOUT_REVIEW",
                  label: {
                    localizationKey: "pharma.option.release",
                    valuesByLocale: {
                      en: "Release without review",
                      vi: "Xuất hàng mà không xem xét",
                    },
                  },
                },
              ],
            },
          ],
          justification: {
            required: true,
            maximumLength: 600,
          },
        },
        evidenceTitles: {
          EVID_PHARMA_SENSOR_SUMMARY: {
            localizationKey: "pharma.evidence.sensor",
            valuesByLocale: {
              en: "Temperature sensor summary",
              vi: "Tóm tắt cảm biến nhiệt độ",
            },
          },
        },
        policyTitles: {},
        modeConfiguration: {
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
      },
    };
    const consequenceProjection: LearnerRunProjectionV1 = {
      ...genericProjection,
      version: 7,
      workflowState: {
        currentNodeId: "NODE_PHARMA_CONSEQUENCE_HOLD",
        completedNodeIds: [
          ...genericProjection.workflowState.completedNodeIds,
          "NODE_PHARMA_DECISION",
        ],
        permittedActionIds: ["ADVANCE_WORKFLOW"],
      },
      presentation: {
        ...genericProjection.presentation!,
        currentNode: {
          nodeId: "NODE_PHARMA_CONSEQUENCE_HOLD",
          nodeType: "CONSEQUENCE",
          title: {
            localizationKey: "pharma.consequence.hold.title",
            valuesByLocale: {
              en: "Shipment held for investigation",
              vi: "Giữ lô hàng để điều tra",
            },
          },
          consequenceCode: "SHIPMENT_HELD_FOR_INVESTIGATION",
          message: {
            localizationKey: "pharma.consequence.hold.message",
            valuesByLocale: {
              en: "Release is paused while the excursion is investigated.",
              vi: "Việc xuất hàng được tạm dừng trong khi điều tra.",
            },
          },
        },
      },
    };
    const submit = vi.fn().mockResolvedValue(consequenceProjection);
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
            assignmentId: "ASSIGNMENT_PHARMA_001",
            title: "Cold-chain review",
            packId: "PACK_PHARMA",
            packVersion: "1.0.0",
            scenarioId: "SCN_PHARMA",
            scenarioVersion: "1.0.0",
            mode: "tutorial",
            runConfiguration:
              genericProjection.presentation!.modeConfiguration,
            learnerUserIds: ["USER_LEARNER_001"],
            status: "active",
            feedbackReleaseStatus: "withheld",
            createdAt: "2026-07-25T03:00:00.000Z",
            createdByUserId: "USER_INSTRUCTOR_001",
          },
          startAvailability: availableStart,
          runs: [
            {
              runId: "RUN_PHARMA_001",
              learnerUserId: "USER_LEARNER_001",
              status: "active",
              eventCount: 4,
              startedAt: "2026-07-25T03:00:00.000Z",
              lastActivityAt: "2026-07-25T03:01:00.000Z",
              completedAt: null,
              elapsedSeconds: 60,
              activity: {
                evidenceInspectionCount: 0,
                policyConsultationCount: 0,
                citedEvidenceCount: 0,
                decisionAttemptCount: 0,
                rejectedAttemptCount: 0,
                mitigationCount: 0,
                rejectionFindings: [],
              },
              ratings: [],
              moderationResolutions: [],
            },
          ],
        },
      ]),
      startRun: vi.fn(),
      loadRun: vi.fn().mockResolvedValue(genericProjection),
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
    expect(
      await screen.findByText("Temperature excursion review"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Temperature sensor summary"),
    ).toHaveLength(2);
    const action = screen.getByLabelText("Shipment action");
    await user.selectOptions(action, "HOLD_AND_INVESTIGATE");
    const form = action.closest("form");
    if (form === null) throw new Error("Expected generic decision form.");
    await user.type(
      within(form).getByLabelText("Decision justification"),
      "Hold the shipment while the excursion is investigated.",
    );
    await user.click(
      within(form).getByRole("button", { name: "Submit" }),
    );

    expect(submit).toHaveBeenCalledWith(
      "RUN_PHARMA_001",
      expect.objectContaining({
        commandType: "SUBMIT_STRUCTURED_DECISION",
        decisionId: "DECISION_PHARMA_RELEASE",
        responses: {
          shipmentAction: ["HOLD_AND_INVESTIGATE"],
        },
        justification:
          "Hold the shipment while the excursion is investigated.",
      }),
    );
    expect(
      await screen.findByText(
        "Release is paused while the excursion is investigated.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue" }),
    ).toBeInTheDocument();
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
          startAvailability: availableStart,
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

  it("keeps an expired run reviewable while disabling further submissions", async () => {
    const expiredProjection: LearnerRunProjectionV1 = {
      ...projection(),
      timing: {
        status: "expired",
        startedAt: "2026-07-24T08:00:00.000Z",
        observedAt: "2026-07-24T08:30:00.000Z",
        deadline: "2026-07-24T08:30:00.000Z",
        timeLimitMinutes: 30,
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
              timeLimitMinutes: 30,
              allowCommunication: false,
              allowEvidenceRequests: true,
            },
            learnerUserIds: ["USER_LEARNER_001"],
            status: "active",
            feedbackReleaseStatus: "withheld",
            createdAt: "2026-07-24T08:00:00.000Z",
            createdByUserId: "USER_INSTRUCTOR_001",
          },
          startAvailability: availableStart,
          runs: [
            {
              runId: "RUN_LEARNER_001",
              learnerUserId: "USER_LEARNER_001",
              status: "active",
              eventCount: 3,
              startedAt: "2026-07-24T08:00:00.000Z",
              lastActivityAt: "2026-07-24T08:30:00.000Z",
              completedAt: null,
              elapsedSeconds: 1_800,
              activity: {
                evidenceInspectionCount: 0,
                policyConsultationCount: 0,
                citedEvidenceCount: 0,
                decisionAttemptCount: 0,
                rejectedAttemptCount: 1,
                mitigationCount: 0,
                rejectionFindings: [
                  {
                    findingCode: "RUN_TIME_LIMIT_EXCEEDED",
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
      loadRun: vi.fn().mockResolvedValue(expiredProjection),
      loadFeedback: vi.fn(),
      submit: vi.fn(),
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

    expect(
      await screen.findByText(
        "The 30-minute run time limit has ended. You can review this run, but no further actions can be submitted.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Submit" }),
    ).toBeDisabled();
    expect(api.loadFeedback).not.toHaveBeenCalled();
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
          startAvailability: availableStart,
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
          startAvailability: availableStart,
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
        authoredFeedback: [
          {
            feedbackCode: "INTEGRITY_LIMIT",
            title: {
              localizationKey: "pharma.feedback.title",
              valuesByLocale: {
                en: "Evidence interpretation",
                vi: "Diễn giải bằng chứng",
              },
            },
            message: {
              localizationKey: "pharma.feedback.message",
              valuesByLocale: {
                en: "Integrity does not prove storage conditions were acceptable.",
                vi: "Tính toàn vẹn không chứng minh điều kiện bảo quản là phù hợp.",
              },
            },
          },
        ],
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
    expect(
      screen.getByRole("heading", { name: "Evidence interpretation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Integrity does not prove storage conditions were acceptable.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps a future assignment read-only until the server opens it", async () => {
    const startRun = vi.fn();
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
            assignmentId: "ASSIGNMENT_FUTURE_001",
            title: "Future coffee case",
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
            availableFrom: "2026-08-01T02:00:00.000Z",
            createdAt: "2026-07-24T08:00:00.000Z",
            createdByUserId: "USER_INSTRUCTOR_001",
          },
          startAvailability: {
            status: "not-yet-open",
            observedAt: "2026-07-25T05:00:00.000Z",
          },
          runs: [],
        },
      ]),
      startRun,
      loadRun: vi.fn(),
      loadFeedback: vi.fn(),
      submit: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <HostedLearnerScreen api={api} />
      </LocaleProvider>,
    );

    expect(
      await screen.findByText(
        "Opens at 2026-08-01T02:00:00.000Z",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start" }),
    ).toBeDisabled();
    expect(startRun).not.toHaveBeenCalled();
  });
});
