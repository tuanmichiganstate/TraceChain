import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../app/providers/locale-provider";
import { NotificationProvider } from "../../app/providers/notification-provider";
import { experienceConfigurationHash } from "../../config/experience";
import { embedConfiguration } from "../../config/hash";
import { TECHNICAL_LAB_PRESET } from "../../config/presets";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import { technicalLabCryptographicRuntime } from "../../technical-lab/cryptographic-runtime";
import {
  emptyTechnicalLabSnapshot,
  replayTechnicalLab,
} from "../../technical-lab/engine";
import {
  hostedTechnicalLabConfiguration,
} from "../../technical-lab/hosted-pack-adapter";
import { permissionedFoundationsLabBundle } from "../../technical-lab/permissioned-foundations-pack";
import type { LearnerRunProjectionV1 } from "../contracts/run-events";
import {
  HostedDecisionEvidenceGuide,
  HostedEvidenceLibrary,
  HostedEvidenceValue,
  HostedLearnerApiError,
  HostedLearnerScreen,
  HostedPolicyLibrary,
  HostedRunActionControls,
  type HostedLearnerApi,
} from "./hosted-learner-screen";

const availableStart = {
  status: "available" as const,
  observedAt: "2026-07-25T05:00:00.000Z",
};

const disabledCounterfactualReplay = {
  enabled: false,
  allowedDecisionNodeIds: [],
  maximumBranchesPerLearner: 1,
  learnerAvailability: "DISABLED",
  requireReflection: false,
} as const;

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
  it("shows a localized recovery message for an LTI activity without an assignment binding", async () => {
    window.history.replaceState(
      {},
      "",
      "/learner?ltiError=LTI_ASSIGNMENT_REQUIRED",
    );
    const loadSession = vi.fn();
    const loadAssignments = vi.fn();
    const api: HostedLearnerApi = {
      loadSession,
      loadAssignments,
      startRun: vi.fn(),
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
      screen.getByText(
        /does not identify a TraceChain assignment/,
      ),
    ).toBeInTheDocument();
    expect(loadSession).not.toHaveBeenCalled();
    expect(loadAssignments).not.toHaveBeenCalled();
    window.history.replaceState({}, "", "/learner");
  });

  it("reveals inspected native coffee evidence without requiring a generic presentation", () => {
    render(
      <LocaleProvider locale="en">
        <HostedEvidenceLibrary
          projection={{
            ...projection("SUBMIT_CERTIFICATE_DECISION"),
            workflowState: {
              currentNodeId: "certificate-decision",
              completedNodeIds: ["certificate-evidence"],
              permittedActionIds: [
                "SUBMIT_CERTIFICATE_DECISION",
              ],
            },
            informationState: [
              {
                recordId: "EVID_CERTIFICATE_RECORD",
                value: {
                  inspected: true,
                  learnerMetadata: {
                    ownerOrganizationId:
                      "ORG_CERTIFICATION_BODY",
                    signatureStatus: "NOT_APPLICABLE",
                    ledgerStatus: "HASH_ANCHORED",
                    completeness: "COMPLETE",
                    access: {
                      classification: "ROLE_RESTRICTED",
                      acquisitionMode: "AVAILABLE",
                      delayMinutes: 0,
                      costUnits: 0,
                    },
                  },
                  content: {
                    assetId: "BAT_GREEN_COFFEE_001",
                    certificateContentStatus: "VALID",
                    issuedAt: "2026-01-15T03:00:00.000Z",
                    expiresAt: "2027-01-15T03:00:00.000Z",
                    decisionReviewAt:
                      "2026-01-15T03:00:00.000Z",
                    issuerOrganizationId:
                      "ORG_CERTIFICATION_BODY",
                    issuerRegistryStatus: "RECOGNIZED_ACTIVE",
                    issuerPermittedActions: [
                      "ISSUE_CERTIFICATE",
                    ],
                    documentStoragePolicy:
                      "OFF_CHAIN_WITH_SHA256_ANCHOR",
                  },
                },
              },
            ],
          }}
          busy={false}
          onSubmit={vi.fn().mockResolvedValue(undefined)}
        />
      </LocaleProvider>,
    );

    expect(
      screen.getByText(
        "Recognized as an active network organization",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("May issue quality certificates"),
    ).toBeInTheDocument();
  });

  it("renders certificate registry facts and decision guides as learner-readable evidence", () => {
    const { rerender } = render(
      <LocaleProvider locale="en">
        <HostedEvidenceValue
          recordId="EVID_CERTIFICATE_RECORD"
          value={{
            learnerMetadata: {
              ownerOrganizationId: "ORG_CERTIFICATION_BODY",
              signatureStatus: "NOT_APPLICABLE",
              ledgerStatus: "HASH_ANCHORED",
              completeness: "COMPLETE",
              access: {
                classification: "ROLE_RESTRICTED",
                acquisitionMode: "AVAILABLE",
                delayMinutes: 0,
                costUnits: 0,
              },
            },
            content: {
              assetId: "BAT_GREEN_COFFEE_001",
              certificateContentStatus: "VALID",
              issuedAt: "2026-01-15T03:00:00.000Z",
              expiresAt: "2027-01-15T03:00:00.000Z",
              decisionReviewAt: "2026-01-15T03:00:00.000Z",
              issuerOrganizationId: "ORG_CERTIFICATION_BODY",
              issuerRegistryStatus: "RECOGNIZED_ACTIVE",
              issuerPermittedActions: ["ISSUE_CERTIFICATE"],
              documentStoragePolicy: "OFF_CHAIN_WITH_SHA256_ANCHOR",
            },
          }}
        />
      </LocaleProvider>,
    );

    expect(
      screen.getByText("Recognized as an active network organization"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("May issue quality certificates"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The scope names this batch and records no quality exception",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Evidence attributes",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Hash anchored")).toBeInTheDocument();
    expect(
      screen.getByText("Restricted to the active role"),
    ).toBeInTheDocument();

    rerender(
      <LocaleProvider locale="en">
        <HostedDecisionEvidenceGuide
          workflowNodeId="data-governance-decision"
        />
      </LocaleProvider>,
    );
    expect(
      screen.getByRole("heading", {
        name: "Data-handling criteria for this consortium",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Personal data that is unnecessary/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Apply the consortium's rules below/),
    ).toBeInTheDocument();
  });

  it("presents pharmaceutical evidence as professional records rather than raw data", () => {
    const { rerender } = render(
      <LocaleProvider locale="en">
        <HostedEvidenceValue
          recordId="EVID_PHARMA_TRANSFER_SENSOR"
          value={{
            content: {
              minimumTemperatureC: 2,
              maximumTemperatureC: 12.4,
              permittedMaximumTemperatureC: 8,
              excursionMinutes: 47,
            },
          }}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText("2–12.4°C")).toBeInTheDocument();
    expect(screen.getByText("47 minutes")).toBeInTheDocument();
    expect(
      screen.getByText(/requires review before release/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/maximumTemperatureC/),
    ).not.toBeInTheDocument();

    rerender(
      <LocaleProvider locale="en">
        <HostedEvidenceValue
          recordId="EVID_PHARMA_TRANSFER_CUSTODY"
          value={{
            content: {
              signatureValid: true,
              signerRecognized: true,
              custodyHistoryIntact: true,
              productConditionAttested: false,
            },
          }}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText("Signature valid")).toBeInTheDocument();
    expect(
      screen.getByText(/does not attest that the medicine remained/),
    ).toBeInTheDocument();

    rerender(
      <LocaleProvider locale="en">
        <HostedEvidenceValue
          recordId="EVID_PHARMA_TRANSFER_CALIBRATION"
          value={{
            content: {
              calibrationStatus: "EXPIRED",
              expiredDaysBeforeShipment: 11,
              deviceFailureConfirmed: false,
            },
          }}
        />
      </LocaleProvider>,
    );
    expect(
      screen.getByText("Expired 11 days before shipment"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not prove that the excursion did not occur/),
    ).toBeInTheDocument();

    rerender(
      <LocaleProvider locale="en">
        <HostedEvidenceValue
          recordId="EVID_PHARMA_TRANSFER_STABILITY"
          value={{
            content: {
              approvedMaximumTemperatureC: 10,
              approvedMaximumExcursionMinutes: 60,
              observedMaximumTemperatureC: 12.4,
              supportsRelease: false,
            },
          }}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText("Up to 10°C for 60 minutes")).toBeInTheDocument();
    expect(screen.getByText("Release not supported")).toBeInTheDocument();
    expect(
      screen.getByText(/exceeds the approved 10°C limit/),
    ).toBeInTheDocument();
  });

  it("submits an authored evidence request without exposing the record content", async () => {
    const requestProjection: LearnerRunProjectionV1 = {
      ...projection("REQUEST_EVIDENCE"),
      roleId: "QUALITY_MANAGER",
      informationState: [],
      presentation: {
        scenarioTitle: {
          localizationKey: "pharma.scenario",
          valuesByLocale: { en: "Cold-chain transfer case" },
        },
        roleName: {
          localizationKey: "pharma.role",
          valuesByLocale: { en: "Quality manager" },
        },
        currentNode: {
          nodeId: "NODE_PHARMA_TRANSFER_DISPOSITION",
          nodeType: "DECISION",
          title: {
            localizationKey: "pharma.disposition",
            valuesByLocale: { en: "Decide the final disposition" },
          },
        },
        evidenceTitles: {
          EVID_PHARMA_TRANSFER_STABILITY: {
            localizationKey: "pharma.evidence.stability",
            valuesByLocale: {
              en: "Product stability assessment",
            },
          },
        },
        evidenceRequests: [
          {
            evidenceId: "EVID_PHARMA_TRANSFER_STABILITY",
            status: "REQUESTABLE",
            learnerMetadata: {
              signatureStatus: "NOT_APPLICABLE",
              ledgerStatus: "OFF_CHAIN",
              completeness: "COMPLETE",
              access: {
                classification: "ROLE_RESTRICTED",
                acquisitionMode: "REQUEST_REQUIRED",
                delayMinutes: 45,
                costUnits: 2,
              },
            },
            delayMinutes: 45,
            costUnits: 2,
          },
        ],
        policyTitles: {},
        instructorIncidents: [],
        professionalConsequences: [],
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
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <LocaleProvider locale="en">
        <HostedRunActionControls
          projection={requestProjection}
          busy={false}
          onSubmit={onSubmit}
        />
      </LocaleProvider>,
    );
    expect(
      screen.queryByText(/supports release/u),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", {
        name: "Product stability assessment",
      }),
    ).toBeInTheDocument();

    await userEvent.setup().click(
      screen.getByRole("button", { name: "Submit" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      commandType: "REQUEST_EVIDENCE",
      evidenceId: "EVID_PHARMA_TRANSFER_STABILITY",
    });
  });

  it("submits a policy consultation from authored policy titles", async () => {
    const policyProjection: LearnerRunProjectionV1 = {
      ...projection("CONSULT_POLICY"),
      roleId: "QUALITY_MANAGER",
      presentation: {
        scenarioTitle: {
          localizationKey: "pharma.scenario",
          valuesByLocale: { en: "Cold-chain transfer case" },
        },
        roleName: {
          localizationKey: "pharma.role",
          valuesByLocale: { en: "Quality manager" },
        },
        currentNode: {
          nodeId: "NODE_PHARMA_TRANSFER_TRIAGE",
          nodeType: "DECISION",
          title: {
            localizationKey: "pharma.triage",
            valuesByLocale: {
              en: "Make the initial triage decision",
            },
          },
        },
        evidenceTitles: {},
        policyTitles: {
          POLICY_PHARMA_TRANSFER_INVESTIGATION: {
            localizationKey: "pharma.policy.investigation",
            valuesByLocale: {
              en: "Hold while physical-condition evidence is unresolved",
            },
          },
        },
        policyReferences: [
          {
            policyId: "POLICY_PHARMA_TRANSFER_INVESTIGATION",
            status: "AVAILABLE",
          },
        ],
        instructorIncidents: [],
        professionalConsequences: [],
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
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <LocaleProvider locale="en">
        <HostedRunActionControls
          projection={policyProjection}
          busy={false}
          onSubmit={onSubmit}
        />
      </LocaleProvider>,
    );

    expect(
      screen.getByRole("option", {
        name: "Hold while physical-condition evidence is unresolved",
      }),
    ).toBeInTheDocument();
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Submit" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      commandType: "CONSULT_POLICY",
      policyId: "POLICY_PHARMA_TRANSFER_INVESTIGATION",
    });
  });

  it("reveals an authored policy statement only after consultation", () => {
    const available: LearnerRunProjectionV1 = {
      ...projection(),
      presentation: {
        scenarioTitle: {
          localizationKey: "pharma.scenario",
          valuesByLocale: { en: "Cold-chain transfer case" },
        },
        roleName: {
          localizationKey: "pharma.role",
          valuesByLocale: { en: "Quality manager" },
        },
        currentNode: {
          nodeId: "NODE_PHARMA_TRANSFER_TRIAGE",
          nodeType: "DECISION",
          title: {
            localizationKey: "pharma.triage",
            valuesByLocale: { en: "Initial triage" },
          },
        },
        evidenceTitles: {},
        policyTitles: {
          POLICY_PHARMA_TRANSFER_INVESTIGATION: {
            localizationKey: "pharma.policy.investigation",
            valuesByLocale: {
              en: "Temperature-excursion investigation rule",
            },
          },
        },
        policyReferences: [
          {
            policyId: "POLICY_PHARMA_TRANSFER_INVESTIGATION",
            status: "AVAILABLE",
          },
        ],
        instructorIncidents: [],
        professionalConsequences: [],
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
    const { rerender } = render(
      <LocaleProvider locale="en">
        <HostedPolicyLibrary projection={available} />
      </LocaleProvider>,
    );

    expect(screen.getByText("Available to consult")).toBeInTheDocument();
    expect(
      screen.queryByText(/Hold the shipment while/u),
    ).not.toBeInTheDocument();

    rerender(
      <LocaleProvider locale="en">
        <HostedPolicyLibrary
          projection={{
            ...available,
            presentation: {
              ...available.presentation!,
              policyReferences: [
                {
                  policyId:
                    "POLICY_PHARMA_TRANSFER_INVESTIGATION",
                  status: "CONSULTED",
                  learnerStatement: {
                    localizationKey:
                      "pharma.policy.investigation.statement",
                    valuesByLocale: {
                      en: "Hold the shipment while physical-condition evidence remains unresolved.",
                    },
                  },
                },
              ],
            },
          }}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText("Consulted")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Hold the shipment while physical-condition evidence remains unresolved.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/configuration/u)).not.toBeInTheDocument();
  });

  it("opens one stable assignment link without starting an attempt", async () => {
    const startRun = vi.fn();
    const assignment = (assignmentId: string, title: string) => ({
      assignment: {
        schemaVersion: "1.3.0" as const,
        assignmentId,
        title,
        packId: "PACK_COFFEE",
        packVersion: "1.5.0",
        scenarioId: "SCN_COFFEE",
        scenarioVersion: "1.5.0",
        mode: "standard" as const,
        runConfiguration: {
          mode: "standard" as const,
          allowHints: false,
          allowRetry: false,
          allowBacktracking: false,
          feedbackTiming: "final" as const,
          showScores: false,
          outcomeStrategy: "forced" as const,
          seedPolicy: "generated" as const,
          allowCommunication: false,
          allowEvidenceRequests: true,
        },
        counterfactualReplay: disabledCounterfactualReplay,
        research: { enabled: false } as const,
        learnerUserIds: ["USER_LEARNER_001"],
        status: "active" as const,
        feedbackReleaseStatus: "withheld" as const,
        createdAt: "2026-07-26T08:00:00.000Z",
        createdByUserId: "USER_INSTRUCTOR_001",
      },
      startAvailability: availableStart,
      runs: [],
    });
    const api: HostedLearnerApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_LEARNER_001",
        email: "learner@example.edu",
        roles: ["learner"],
      }),
      loadAssignments: vi.fn().mockResolvedValue([
        assignment("ASSIGNMENT_TARGET", "Target assignment"),
        assignment("ASSIGNMENT_OTHER", "Other assignment"),
      ]),
      startRun,
      loadRun: vi.fn(),
      loadFeedback: vi.fn(),
      submit: vi.fn(),
    };

    render(
      <LocaleProvider locale="en">
        <HostedLearnerScreen
          api={api}
          initialAssignmentId="ASSIGNMENT_TARGET"
        />
      </LocaleProvider>,
    );

    expect(
      await screen.findByText("Target assignment"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Other assignment"),
    ).not.toBeInTheDocument();
    expect(startRun).not.toHaveBeenCalled();
  });

  it("starts an assigned run and submits its server-authorized action", async () => {
    const loadAssignments = vi.fn()
      .mockResolvedValueOnce([
        {
          assignment: {
            schemaVersion: "1.1.0",
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
            counterfactualReplay:
              disabledCounterfactualReplay,
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
    const certificateEvidence = {
      recordId: "EVID_CERTIFICATE_RECORD",
      value: {
        inspected: true,
        learnerMetadata: {
          ownerOrganizationId: "ORG_CERTIFICATION_BODY",
          signatureStatus: "NOT_APPLICABLE",
          ledgerStatus: "HASH_ANCHORED",
          completeness: "COMPLETE",
          access: {
            classification: "ROLE_RESTRICTED",
            acquisitionMode: "AVAILABLE",
            delayMinutes: 0,
            costUnits: 0,
          },
        },
        content: {
          assetId: "BAT_GREEN_COFFEE_001",
          certificateContentStatus: "VALID",
          issuedAt: "2026-01-15T03:00:00.000Z",
          expiresAt: "2027-01-15T03:00:00.000Z",
          decisionReviewAt: "2026-01-15T03:00:00.000Z",
          issuerOrganizationId: "ORG_CERTIFICATION_BODY",
          issuerRegistryStatus: "RECOGNIZED_ACTIVE",
          issuerPermittedActions: ["ISSUE_CERTIFICATE"],
          documentStoragePolicy: "OFF_CHAIN_WITH_SHA256_ANCHOR",
        },
      },
    };
    const postInspectionProjection = {
      ...projection("SUBMIT_CERTIFICATE_DECISION"),
      version: 4,
      informationState: [certificateEvidence],
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
            policyType: "RUNTIME_POLICY",
            titleKey:
              "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.policies.AUTH_ISSUE_CERTIFICATE.title",
            consulted: false,
          },
        },
      ],
      workflowState: {
        currentNodeId: "certificate-decision",
        completedNodeIds: ["certificate-evidence"],
        permittedActionIds: [
          "CONSULT_POLICY",
          "SUBMIT_CERTIFICATE_DECISION",
        ],
      },
    } satisfies LearnerRunProjectionV1;
    const postConsultationProjection = {
      ...postInspectionProjection,
      version: 5,
      policyState: postInspectionProjection.policyState.map(
        (record) =>
          record.recordId ===
          "DECISION_POLICY_AUTH_ISSUE_CERTIFICATE"
            ? {
                ...record,
                value: {
                  ...record.value,
                  consulted: true,
                  learnerStatementKey:
                    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.policies.AUTH_ISSUE_CERTIFICATE.statement",
                },
              }
            : record,
      ),
      workflowState: {
        ...postInspectionProjection.workflowState,
        permittedActionIds: ["SUBMIT_CERTIFICATE_DECISION"],
      },
    } satisfies LearnerRunProjectionV1;
    const submit = vi.fn()
      .mockResolvedValueOnce(postInspectionProjection)
      .mockResolvedValueOnce(postConsultationProjection)
      .mockResolvedValue(postConsultationProjection);
    const api: HostedLearnerApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_LEARNER_001",
        email: "learner@example.edu",
        roles: ["learner"],
      }),
      loadAssignments,
      startRun: vi.fn().mockResolvedValue("RUN_LEARNER_001"),
      loadRun: vi.fn().mockResolvedValue({
        ...projection(),
        informationState: [
          {
            ...certificateEvidence,
            value: {
              ...certificateEvidence.value,
              inspected: false,
            },
          },
        ],
      }),
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
    await user.click(
      await screen.findByRole("button", {
        name: "Inspect Quality certificate record",
      }),
    );

    expect(api.startRun).toHaveBeenCalledWith("ASSIGNMENT_001");
    expect(submit).toHaveBeenCalledWith(
      "RUN_LEARNER_001",
      expect.objectContaining({
        commandType: "INSPECT_EVIDENCE",
        evidenceId: "EVID_CERTIFICATE_RECORD",
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Consult Certificate-issuer authorization",
      }),
    );
    expect(submit).toHaveBeenLastCalledWith(
      "RUN_LEARNER_001",
      expect.objectContaining({
        commandType: "CONSULT_POLICY",
        policyId: "AUTH_ISSUE_CERTIFICATE",
      }),
    );
    const actionSection = (await screen.findByRole("heading", {
      name: "Submit the current action",
    })).closest("section");
    if (actionSection === null) throw new Error("Expected action section.");
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

  it("resumes a hosted Technical Laboratory with the shared learner shell", async () => {
    const cryptographicFiles = {
      "identity-registry.json":
        technicalLabCryptographicRuntime.identityRegistry,
      "educational-signing-keys.json":
        technicalLabCryptographicRuntime.signingKeys,
      "authorization-policies.json":
        technicalLabCryptographicRuntime.authorizationPolicies,
      "endorsement-policies.json":
        technicalLabCryptographicRuntime.endorsementPolicies,
    } as const;
    const runtimeFiles: Readonly<Record<string, unknown>> = {
      "tracechain.config.json":
        embedConfiguration(TECHNICAL_LAB_PRESET),
      "technical-lab-pack.json":
        permissionedFoundationsLabBundle,
      ...cryptographicFiles,
      "build-info.json": {
        technicalLabPackHash: sha256Hex(
          `${JSON.stringify(
            permissionedFoundationsLabBundle,
            null,
            2,
          )}\n`,
        ),
        technicalLabPackContentHash:
          permissionedFoundationsLabBundle.pack.publication
            ?.contentHash,
        technicalLabPersistenceSchemaVersion: "TL1",
        cryptographicEvidenceSchemaVersion: "2",
        cryptographicRuntimeHashes: Object.fromEntries(
          Object.entries(cryptographicFiles).map(
            ([fileName, value]) => [
              fileName,
              sha256Hex(`${JSON.stringify(value, null, 2)}\n`),
            ],
          ),
        ),
      },
    };
    const fetchRuntime = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const fileName = String(input).split("/").at(-1) ?? "";
        const value = runtimeFiles[fileName];
        return new Response(
          value === undefined
            ? "Not found"
            : JSON.stringify(value),
          {
            status: value === undefined ? 404 : 200,
            headers: {
              "content-type":
                value === undefined
                  ? "text/plain"
                  : "application/json",
            },
          },
        );
      });
    const configuration = hostedTechnicalLabConfiguration("en");
    const configurationHash =
      experienceConfigurationHash(configuration);
    const replay = await replayTechnicalLab(
      {
        configurationHash,
        bundle: permissionedFoundationsLabBundle,
        cryptographicRuntime: technicalLabCryptographicRuntime,
      },
      emptyTechnicalLabSnapshot(),
    );
    const technicalProjection: LearnerRunProjectionV1 = {
      schemaVersion: "1.0.0",
      runId: "RUN_TECHNICAL_LAB_001",
      version: 1,
      roleId: "TECHNICAL_LEARNER",
      businessState: [],
      ledgerState: {},
      informationState: [],
      policyState: [],
      workflowState: {
        currentNodeId: "TL1",
        completedNodeIds: [],
        permittedActionIds: [
          "TECHNICAL_LAB_ACTION:VIEW_INPUT",
        ],
      },
      technicalLab: {
        schemaVersion: "1.0.0",
        configurationHash,
        labPackId:
          permissionedFoundationsLabBundle.pack.labPackId,
        labPackVersion:
          permissionedFoundationsLabBundle.pack.labPackVersion,
        locale: "en",
        replay,
      },
    };
    const submit = vi
      .fn()
      .mockResolvedValue(technicalProjection);
    const api: HostedLearnerApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_TECHNICAL_LAB_001",
        email: "lab-learner@example.edu",
        roles: ["learner"],
      }),
      loadAssignments: vi.fn().mockResolvedValue([
        {
          assignment: {
            schemaVersion: "2.0.0",
            assignmentId: "ASSIGNMENT_TECHNICAL_LAB_001",
            title: "Permissioned blockchain foundations",
            packId:
              permissionedFoundationsLabBundle.pack.labPackId,
            packVersion:
              permissionedFoundationsLabBundle.pack.labPackVersion,
            scenarioId:
              "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS",
            scenarioVersion: "1.0.0",
            mode: "tutorial",
            runConfiguration: {
              mode: "tutorial",
              allowHints: true,
              allowRetry: true,
              allowBacktracking: true,
              feedbackTiming: "immediate",
              showScores: true,
              outcomeStrategy: "forced",
              seedPolicy: "supplied",
              allowCommunication: false,
              allowEvidenceRequests: false,
              forcedOutcomeCode: "FIXED_LAB_FIXTURES",
            },
            counterfactualReplay:
              disabledCounterfactualReplay,
            research: { enabled: false },
            learnerUserIds: ["USER_TECHNICAL_LAB_001"],
            status: "active",
            feedbackReleaseStatus: "withheld",
            createdAt: "2026-07-27T12:00:00.000Z",
            createdByUserId: "USER_INSTRUCTOR_001",
          },
          startAvailability: availableStart,
          runs: [
            {
              runId: "RUN_TECHNICAL_LAB_001",
              status: "active",
            },
          ],
        },
      ]),
      startRun: vi.fn(),
      loadRun: vi.fn().mockResolvedValue(technicalProjection),
      loadFeedback: vi.fn(),
      submit,
    };
    render(
      <LocaleProvider locale="en">
        <NotificationProvider>
          <HostedLearnerScreen api={api} />
        </NotificationProvider>
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Resume" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Permissioned Blockchain Foundations Laboratory",
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Run: inspect the authored input",
      }),
    );
    expect(submit).toHaveBeenCalledWith(
      "RUN_TECHNICAL_LAB_001",
      expect.objectContaining({
        commandType: "PERFORM_TECHNICAL_LAB_ACTION",
        actionType: "VIEW_INPUT",
        expectedRunVersion: 1,
      }),
    );
    fetchRuntime.mockRestore();
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
            inspected: false,
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
        instructorIncidents: [],
        professionalConsequences: [],
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
    const inspectedProjection: LearnerRunProjectionV1 = {
      ...genericProjection,
      version: 5,
      informationState: [
        {
          recordId: "EVID_PHARMA_SENSOR_SUMMARY",
          value: {
            inspected: true,
            content: {
              minimumTemperatureC: 2,
              maximumTemperatureC: 12.4,
              permittedMaximumTemperatureC: 8,
              excursionMinutes: 47,
            },
          },
        },
      ],
    };
    const consequenceProjection: LearnerRunProjectionV1 = {
      ...inspectedProjection,
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
    const submit = vi.fn()
      .mockResolvedValueOnce(inspectedProjection)
      .mockResolvedValueOnce(consequenceProjection);
    const api: HostedLearnerApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_LEARNER_001",
        email: "learner@example.edu",
        roles: ["learner"],
      }),
      loadAssignments: vi.fn().mockResolvedValue([
        {
          assignment: {
            schemaVersion: "1.1.0",
            assignmentId: "ASSIGNMENT_PHARMA_001",
            title: "Cold-chain review",
            packId: "PACK_PHARMA",
            packVersion: "1.0.0",
            scenarioId: "SCN_PHARMA",
            scenarioVersion: "1.0.0",
            mode: "tutorial",
            runConfiguration:
              genericProjection.presentation!.modeConfiguration,
            counterfactualReplay:
              disabledCounterfactualReplay,
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
      screen.getByRole("button", {
        name: "Inspect Temperature sensor summary",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("2–12.4°C")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Inspect Temperature sensor summary",
      }),
    );
    expect(submit).toHaveBeenCalledWith(
      "RUN_PHARMA_001",
      expect.objectContaining({
        commandType: "INSPECT_EVIDENCE",
        evidenceId: "EVID_PHARMA_SENSOR_SUMMARY",
      }),
    );
    expect(await screen.findByText("2–12.4°C")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", {
        name: "Inspect evidence",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText("Temperature sensor summary"),
    ).toHaveLength(1);
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
            schemaVersion: "1.1.0",
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
            counterfactualReplay:
              disabledCounterfactualReplay,
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
      informationState: [
        {
          recordId: "EVID_CERTIFICATE_RECORD",
          value: { inspected: false },
        },
      ],
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
            schemaVersion: "1.1.0",
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
            counterfactualReplay:
              disabledCounterfactualReplay,
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
      screen.getByRole("button", {
        name: "Inspect Quality certificate record",
      }),
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
            schemaVersion: "1.1.0",
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
            counterfactualReplay:
              disabledCounterfactualReplay,
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
            schemaVersion: "1.1.0",
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
            counterfactualReplay:
              disabledCounterfactualReplay,
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
          packVersion: "1.7.0",
          scenarioId: "SCN_COFFEE_STAGE3_FOUNDATION",
          scenarioVersion: "1.7.0",
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
            schemaVersion: "1.1.0",
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
            counterfactualReplay:
              disabledCounterfactualReplay,
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
