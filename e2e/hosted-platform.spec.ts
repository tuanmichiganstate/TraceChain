import { expect, test } from "@playwright/test";

const certificateStaffProfile = {
  staffProfileId: "STAFF_CERTIFICATION_OFFICER",
  displayName: {
    localizationKey: "staff.certificationOfficer.name",
    valuesByLocale: { en: "Trần Minh Anh", vi: "Trần Minh Anh" },
  },
  roleTitle: {
    localizationKey: "staff.certificationOfficer.role",
    valuesByLocale: {
      en: "Certification Officer",
      vi: "Chuyên viên chứng nhận",
    },
  },
  organizationName: {
    localizationKey: "organizations.certificationBody.name",
    valuesByLocale: {
      en: "Agricultural Certification Centre",
      vi: "Trung tâm Chứng nhận Nông nghiệp",
    },
  },
  portraitPath: "./media/staff/certification-officer.webp",
  portraitAlt: {
    localizationKey: "staff.certificationOfficer.alt",
    valuesByLocale: {
      en: "Fictional portrait of Trần Minh Anh",
      vi: "Chân dung hư cấu của Trần Minh Anh",
    },
  },
  fictional: true,
};

test("runs an assigned hosted learner action from role-filtered server state", async ({
  page,
}) => {
  let submittedCommand: Record<string, unknown> | null = null;
  const assignment = {
    schemaVersion: "1.0.0",
    assignmentId: "ASSIGNMENT_BROWSER_001",
    title: "Hosted coffee governance",
    packId: "PACK_STANDARD_COFFEE_STAGE3",
    packVersion: "1.7.0",
    scenarioId: "SCN_COFFEE_STAGE3_FOUNDATION",
    scenarioVersion: "1.7.0",
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
    learnerUserIds: ["USER_BROWSER_LEARNER"],
    status: "active",
    feedbackReleaseStatus: "withheld",
    createdAt: "2026-07-24T08:00:00.000Z",
    createdByUserId: "USER_BROWSER_INSTRUCTOR",
  };
  const initialProjection = {
    schemaVersion: "1.0.0",
    runId: "RUN_BROWSER_001",
    version: 2,
    roleId: "CERTIFICATION_OFFICER",
    businessState: [
      {
        recordId: "DECISION_STATUS",
        value: { submitted: false },
      },
    ],
    ledgerState: {
      transactions: [
        {
          transactionId: "TX_INITIAL_001",
          transactionType: "REGISTER_ASSET",
          transactionStatus: "COMMITTED",
          blockId: "BLOCK_001",
        },
      ],
    },
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
      permittedActionIds: ["INSPECT_EVIDENCE"],
    },
    staffProfile: certificateStaffProfile,
  };
  const decisionProjection = {
    ...initialProjection,
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
          policyType: "RUNTIME_POLICY",
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
  };

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/v1/session") {
      await route.fulfill({
        json: {
          userId: "USER_BROWSER_LEARNER",
          email: "browser-learner@example.edu",
          roles: ["learner"],
        },
      });
      return;
    }
    if (pathname === "/api/v1/learner/assignments") {
      await route.fulfill({
        json: {
          assignments: [
            {
              assignment,
              startAvailability: {
                status: "available",
                observedAt: "2026-07-25T05:00:00.000Z",
              },
              runs: [],
            },
          ],
        },
      });
      return;
    }
    if (
      pathname ===
        "/api/v1/assignments/ASSIGNMENT_BROWSER_001/start-run" &&
      request.method() === "POST"
    ) {
      await route.fulfill({ status: 201, json: { runId: "RUN_BROWSER_001" } });
      return;
    }
    if (
      pathname === "/api/v1/runs/RUN_BROWSER_001" &&
      request.method() === "GET"
    ) {
      await route.fulfill({ json: { projection: initialProjection } });
      return;
    }
    if (
      pathname === "/api/v1/runs/RUN_BROWSER_001/commands" &&
      request.method() === "POST"
    ) {
      submittedCommand = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({ json: { projection: decisionProjection } });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: { code: "UNEXPECTED_TEST_ROUTE" } },
    });
  });

  await page.goto("/learner?locale=en");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Quality certificate record")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Traceability workspace" }),
  ).toBeVisible();
  await expect(
    page.locator(
      '[data-staff-profile-id="STAFF_CERTIFICATION_OFFICER"]',
    ),
  ).toContainText("Trần Minh Anh");
  await page
    .getByText("View accepted ledger transactions")
    .click();
  await expect(page.getByText("REGISTER_ASSET")).toBeVisible();

  const action = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Submit the current action" }),
  });
  await action.getByRole("button", { name: "Submit" }).click();
  await expect(
    action.getByLabel("Certificate content and validity"),
  ).toBeVisible();

  expect(submittedCommand).toMatchObject({
    commandType: "INSPECT_EVIDENCE",
    runId: "RUN_BROWSER_001",
    expectedRunVersion: 2,
    evidenceId: "EVID_CERTIFICATE_RECORD",
  });
  expect(submittedCommand).not.toHaveProperty("actorId");
  expect(submittedCommand).not.toHaveProperty("organizationId");
  expect(submittedCommand).not.toHaveProperty("roleId");

  await action
    .getByLabel("Decision justification")
    .fill("The certificate evidence supports this decision.");
  await action
    .getByRole("checkbox", {
      name: "Cite Quality certificate record",
    })
    .check();
  await action
    .getByRole("checkbox", {
      name: "Cite Certificate-issuer authorization",
    })
    .check();
  await action.getByLabel("Confidence").selectOption("4");
  await action
    .getByLabel("Estimated probability of an adverse event (%)")
    .fill("20");
  await action.getByRole("button", { name: "Submit" }).click();

  expect(submittedCommand).toMatchObject({
    commandType: "SUBMIT_CERTIFICATE_DECISION",
    runId: "RUN_BROWSER_001",
    expectedRunVersion: 4,
    citedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
    citedPolicyIds: ["AUTH_ISSUE_CERTIFICATE"],
    confidenceRating: 4,
    adverseEventProbabilityPercent: 20,
  });
  expect(submittedCommand).not.toHaveProperty("actorId");
  expect(submittedCommand).not.toHaveProperty("organizationId");
  expect(submittedCommand).not.toHaveProperty("roleId");
});

test("completes an authored pharmaceutical decision through the generic runtime UI", async ({
  page,
}) => {
  const submittedCommands: Record<string, unknown>[] = [];
  const localized = (en: string, vi: string) => ({
    localizationKey: `test.${en}`,
    valuesByLocale: { en, vi },
  });
  const modeConfiguration = {
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
  };
  const decisionProjection = {
    schemaVersion: "1.0.0",
    runId: "RUN_BROWSER_PHARMA",
    version: 4,
    roleId: "QUALITY_MANAGER",
    businessState: [
      {
        recordId: "status",
        value: "AWAITING_RELEASE",
      },
    ],
    ledgerState: {},
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
      scenarioTitle: localized(
        "Temperature excursion review",
        "Xem xét sai lệch nhiệt độ",
      ),
      roleName: localized(
        "Quality manager",
        "Quản lý chất lượng",
      ),
      currentNode: {
        nodeId: "NODE_PHARMA_DECISION",
        nodeType: "DECISION",
        title: localized(
          "Make a release decision",
          "Đưa ra quyết định xuất hàng",
        ),
        decisionId: "DECISION_PHARMA_RELEASE",
        prompt: localized(
          "Choose a proportionate response.",
          "Chọn cách xử lý tương xứng.",
        ),
        fields: [
          {
            fieldId: "shipmentAction",
            prompt: localized(
              "Shipment action",
              "Cách xử lý lô hàng",
            ),
            selection: "single",
            options: [
              {
                optionId: "HOLD_AND_INVESTIGATE",
                label: localized(
                  "Hold and investigate",
                  "Giữ lại và điều tra",
                ),
              },
              {
                optionId: "RELEASE_WITHOUT_REVIEW",
                label: localized(
                  "Release without review",
                  "Xuất hàng mà không xem xét",
                ),
              },
            ],
          },
        ],
        justification: { required: true, maximumLength: 600 },
      },
      evidenceTitles: {
        EVID_PHARMA_SENSOR_SUMMARY: localized(
          "Temperature sensor summary",
          "Tóm tắt cảm biến nhiệt độ",
        ),
      },
      policyTitles: {},
      instructorIncidents: [],
      professionalConsequences: [],
      modeConfiguration,
    },
  };
  const inspectedProjection = {
    ...decisionProjection,
    version: 5,
    informationState: [
      {
        recordId: "EVID_PHARMA_SENSOR_SUMMARY",
        value: {
          content: {
            minimumTemperatureC: 2,
            maximumTemperatureC: 12.4,
            permittedMaximumTemperatureC: 8,
            excursionMinutes: 47,
          },
          inspected: true,
        },
      },
    ],
    workflowState: {
      ...decisionProjection.workflowState,
      permittedActionIds: ["SUBMIT_STRUCTURED_DECISION"],
    },
  };
  const consequenceProjection = {
    ...inspectedProjection,
    version: 8,
    workflowState: {
      currentNodeId: "NODE_PHARMA_CONSEQUENCE_HOLD",
      completedNodeIds: [
        ...inspectedProjection.workflowState.completedNodeIds,
        "NODE_PHARMA_DECISION",
      ],
      permittedActionIds: ["ADVANCE_WORKFLOW"],
    },
    presentation: {
      ...decisionProjection.presentation,
      currentNode: {
        nodeId: "NODE_PHARMA_CONSEQUENCE_HOLD",
        nodeType: "CONSEQUENCE",
        title: localized(
          "Shipment held for investigation",
          "Giữ lô hàng để điều tra",
        ),
        consequenceCode: "SHIPMENT_HELD_FOR_INVESTIGATION",
        message: localized(
          "Release is paused while the temperature excursion is investigated.",
          "Việc xuất hàng được tạm dừng trong khi điều tra sai lệch nhiệt độ.",
        ),
      },
    },
  };
  const completedProjection = {
    ...consequenceProjection,
    version: 11,
    workflowState: {
      currentNodeId: "NODE_PHARMA_COMPLETE",
      completedNodeIds: [
        ...consequenceProjection.workflowState.completedNodeIds,
        "NODE_PHARMA_CONSEQUENCE_HOLD",
        "NODE_PHARMA_FEEDBACK",
      ],
      permittedActionIds: [],
    },
    presentation: {
      ...consequenceProjection.presentation,
      currentNode: {
        nodeId: "NODE_PHARMA_COMPLETE",
        nodeType: "COMPLETION",
        title: localized(
          "Decision recorded",
          "Đã ghi nhận quyết định",
        ),
      },
    },
  };

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/v1/session") {
      await route.fulfill({
        json: {
          userId: "USER_BROWSER_LEARNER",
          email: "browser-learner@example.edu",
          roles: ["learner"],
        },
      });
      return;
    }
    if (pathname === "/api/v1/learner/assignments") {
      await route.fulfill({
        json: {
          assignments: [
            {
              assignment: {
                schemaVersion: "1.0.0",
                assignmentId: "ASSIGNMENT_BROWSER_PHARMA",
                title: "Pharmaceutical cold-chain review",
                packId: "PACK_PHARMACEUTICAL_COLD_CHAIN_STARTER",
                packVersion: "1.1.0",
                scenarioId: "SCN_PHARMA_COLD_CHAIN_STARTER",
                scenarioVersion: "1.1.0",
                mode: "tutorial",
                runConfiguration: modeConfiguration,
                learnerUserIds: ["USER_BROWSER_LEARNER"],
                status: "active",
                feedbackReleaseStatus: "withheld",
                createdAt: "2026-07-25T08:00:00.000Z",
                createdByUserId: "USER_BROWSER_INSTRUCTOR",
              },
              startAvailability: {
                status: "available",
                observedAt: "2026-07-25T08:00:00.000Z",
              },
              runs: [],
            },
          ],
        },
      });
      return;
    }
    if (
      pathname ===
        "/api/v1/assignments/ASSIGNMENT_BROWSER_PHARMA/start-run" &&
      request.method() === "POST"
    ) {
      await route.fulfill({
        status: 201,
        json: { runId: "RUN_BROWSER_PHARMA" },
      });
      return;
    }
    if (
      pathname === "/api/v1/runs/RUN_BROWSER_PHARMA" &&
      request.method() === "GET"
    ) {
      await route.fulfill({ json: { projection: decisionProjection } });
      return;
    }
    if (
      pathname ===
        "/api/v1/runs/RUN_BROWSER_PHARMA/commands" &&
      request.method() === "POST"
    ) {
      const submittedCommand = request.postDataJSON() as Record<
        string,
        unknown
      >;
      submittedCommands.push(submittedCommand);
      await route.fulfill({
        json: {
          projection:
            submittedCommand.commandType === "ADVANCE_WORKFLOW"
              ? completedProjection
              : submittedCommand.commandType === "INSPECT_EVIDENCE"
                ? inspectedProjection
                : consequenceProjection,
        },
      });
      return;
    }
    if (
      pathname === "/api/v1/runs/RUN_BROWSER_PHARMA/feedback" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 409,
        json: { error: { code: "FEEDBACK_NOT_RELEASED" } },
      });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: { code: "UNEXPECTED_TEST_ROUTE" } },
    });
  });

  await page.goto("/learner?locale=en");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(
    page.getByText("Temperature excursion review"),
  ).toBeVisible();
  await expect(page.getByText("2–12.4°C")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Inspect Temperature sensor summary",
    })
    .click();
  expect(submittedCommands[0]).toMatchObject({
    commandType: "INSPECT_EVIDENCE",
    runId: "RUN_BROWSER_PHARMA",
    expectedRunVersion: 4,
    evidenceId: "EVID_PHARMA_SENSOR_SUMMARY",
  });
  await expect(page.getByText("2–12.4°C")).toBeVisible();
  await page
    .getByLabel("Shipment action")
    .selectOption("HOLD_AND_INVESTIGATE");
  await page
    .getByLabel("Decision justification")
    .fill("Hold the shipment while the excursion is investigated.");
  const action = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Submit the current action",
    }),
  });
  await action.getByRole("button", { name: "Submit" }).last().click();

  expect(submittedCommands[1]).toMatchObject({
    commandType: "SUBMIT_STRUCTURED_DECISION",
    runId: "RUN_BROWSER_PHARMA",
    expectedRunVersion: 5,
    decisionId: "DECISION_PHARMA_RELEASE",
    responses: {
      shipmentAction: ["HOLD_AND_INVESTIGATE"],
    },
    justification:
      "Hold the shipment while the excursion is investigated.",
  });
  expect(submittedCommands[1]).not.toHaveProperty("actorId");
  expect(submittedCommands[1]).not.toHaveProperty("organizationId");
  expect(submittedCommands[1]).not.toHaveProperty("roleId");
  await expect(
    page.getByText(
      "Release is paused while the temperature excursion is investigated.",
    ),
  ).toBeVisible();
  await action.getByRole("button", { name: "Continue" }).click();
  expect(submittedCommands[2]).toMatchObject({
    commandType: "ADVANCE_WORKFLOW",
    runId: "RUN_BROWSER_PHARMA",
    expectedRunVersion: 8,
  });
  await expect(
    page.locator("p").filter({ hasText: /^Decision recorded$/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Instructor feedback has not been released yet."),
  ).toBeVisible();
});

test("keeps a time-limited hosted run reviewable after its deadline", async ({
  page,
}) => {
  let commandRequests = 0;
  const runId = "RUN_BROWSER_EXPIRED";
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/v1/session") {
      await route.fulfill({
        json: {
          userId: "USER_BROWSER_LEARNER",
          email: "browser-learner@example.edu",
          roles: ["learner"],
        },
      });
      return;
    }
    if (pathname === "/api/v1/learner/assignments") {
      await route.fulfill({
        json: {
          assignments: [
            {
              assignment: {
                schemaVersion: "1.0.0",
                assignmentId: "ASSIGNMENT_BROWSER_EXPIRED",
                title: "Time-limited coffee governance",
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
                  timeLimitMinutes: 30,
                  allowCommunication: false,
                  allowEvidenceRequests: true,
                },
                learnerUserIds: ["USER_BROWSER_LEARNER"],
                status: "active",
                feedbackReleaseStatus: "withheld",
                createdAt: "2026-07-24T08:00:00.000Z",
                createdByUserId: "USER_BROWSER_INSTRUCTOR",
              },
              startAvailability: {
                status: "available",
                observedAt: "2026-07-24T08:30:00.000Z",
              },
              runs: [
                {
                  runId,
                  learnerUserId: "USER_BROWSER_LEARNER",
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
          ],
        },
      });
      return;
    }
    if (
      pathname === `/api/v1/runs/${runId}` &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        json: {
          projection: {
            schemaVersion: "1.0.0",
            runId,
            version: 3,
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
              permittedActionIds: ["INSPECT_EVIDENCE"],
            },
            timing: {
              status: "expired",
              startedAt: "2026-07-24T08:00:00.000Z",
              observedAt: "2026-07-24T08:30:00.000Z",
              deadline: "2026-07-24T08:30:00.000Z",
              timeLimitMinutes: 30,
            },
          },
        },
      });
      return;
    }
    if (pathname === `/api/v1/runs/${runId}/commands`) {
      commandRequests += 1;
    }
    await route.fulfill({
      status: 404,
      json: { error: { code: "UNEXPECTED_TEST_ROUTE" } },
    });
  });

  await page.goto("/learner?locale=en");
  await page.getByRole("button", { name: "Resume" }).click();

  await expect(
    page.getByText(
      "The 30-minute run time limit has ended. You can review this run, but no further actions can be submitted.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit" }),
  ).toBeDisabled();
  await expect(page.getByText("Quality certificate record")).toBeVisible();
  expect(commandRequests).toBe(0);
});

test("shows only role-authorized hosted workspaces", async ({ page }) => {
  await page.route("**/api/v1/session", async (route) => {
    await route.fulfill({
      json: {
        userId: "USER_BROWSER_RATER",
        email: "browser-rater@example.edu",
        roles: ["rater"],
      },
    });
  });

  await page.goto("/platform?locale=en");
  await expect(
    page.getByRole("heading", { name: "Instructor and rater review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Learner assignments" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Scenario authoring" }),
  ).toHaveCount(0);
});

test("provisions server-owned access from the administrator workspace", async ({
  page,
}) => {
  const users: Record<string, unknown>[] = [
    {
      schemaVersion: "1.0.0",
      userId: "USER_BROWSER_ADMIN",
      email: "admin@example.edu",
      status: "active",
      roles: ["administrator"],
      createdAt: "2026-07-25T04:00:00.000Z",
    },
  ];
  const audit: Record<string, unknown>[] = [];
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/v1/admin/access-audit", async (route) => {
    await route.fulfill({ json: { audit } });
  });
  await page.route("**/api/v1/admin/users", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { users } });
      return;
    }
    submitted = route.request().postDataJSON() as Record<
      string,
      unknown
    >;
    const created = {
      schemaVersion: "1.0.0",
      userId: "USER_BROWSER_LEARNER",
      email: String(submitted.email).trim().toLowerCase(),
      status: submitted.status,
      roles: submitted.roles,
      createdAt: "2026-07-25T04:05:00.000Z",
    };
    users.push(created);
    audit.unshift({
      schemaVersion: "1.0.0",
      commandId: submitted.commandId,
      targetUserId: created.userId,
      targetEmail: created.email,
      status: created.status,
      roles: created.roles,
      performedAt: "2026-07-25T04:05:00.000Z",
      performedByUserId: "USER_BROWSER_ADMIN",
      performedByEmail: "admin@example.edu",
    });
    await route.fulfill({
      status: 201,
      json: {
        user: created,
        wasIdempotentReplay: false,
      },
    });
  });

  await page.goto("/admin?locale=en");
  await expect(
    page.getByRole("heading", {
      name: "User and role administration",
    }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill("browser.learner@example.edu");
  await page.getByRole("button", { name: "Save access" }).click();

  const usersPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Provisioned users" }),
  });
  await expect(
    usersPanel.getByRole("cell", {
      name: "browser.learner@example.edu",
      exact: true,
    }),
  ).toBeVisible();
  expect(submitted).toMatchObject({
    email: "browser.learner@example.edu",
    status: "active",
    roles: ["learner"],
  });
  expect(submitted).not.toHaveProperty("userId");
  const auditPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Access-change audit" }),
  });
  await expect(
    auditPanel.getByRole("cell", {
      name: "browser.learner@example.edu",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    auditPanel.getByText(/^COMMAND_ACCESS_/u),
  ).toBeVisible();
});

test("creates an assignment from the published hosted scenario library", async ({
  page,
}) => {
  const availableFromLocal = "2026-08-01T09:00";
  const availableUntilLocal = "2026-08-02T17:00";
  const availableFrom = "2026-08-01T02:00:00.000Z";
  const availableUntil = "2026-08-02T10:00:00.000Z";
  const option = {
    schemaVersion: "1.1.0",
    packId: "PACK_STANDARD_COFFEE_STAGE3",
    packVersion: "1.7.0",
    scenarioId: "SCN_COFFEE_STAGE3_FOUNDATION",
    scenarioVersion: "1.7.0",
    packTitleKey:
      "platformPack.standardCoffeeStage3.manifest.title",
    scenarioTitleKey:
      "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.title",
    labelsByLocale: {
      en: {
        packTitle: "TraceChain coffee evidence and custody",
        scenarioTitle: "Conflicting certificate evidence",
        counterfactualDecisionTitles: {},
      },
    },
    supportedModes: ["tutorial", "standard"],
    modeConfigurations: [
      {
        mode: "tutorial",
        allowHints: true,
        allowRetry: true,
        allowBacktracking: true,
        feedbackTiming: "immediate",
        showScores: true,
        outcomeStrategy: "forced",
        seedPolicy: "generated",
        timeLimitMinutes: 45,
        allowCommunication: false,
        allowEvidenceRequests: true,
      },
      {
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
    ],
    counterfactualDecisionPoints: [],
  };
  let submitted: Record<string, unknown> | null = null;

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/v1/session") {
      await route.fulfill({
        json: {
          userId: "USER_ASSIGNMENT_INSTRUCTOR",
          email: "assignment-instructor@example.edu",
          roles: ["instructor"],
        },
      });
      return;
    }
    if (pathname === "/api/v1/assignment-options") {
      await route.fulfill({ json: { options: [option] } });
      return;
    }
    if (pathname === "/api/v1/assignment-learners") {
      await route.fulfill({
        json: {
          learners: [
            {
              schemaVersion: "1.0.0",
              userId: "USER_BROWSER_LEARNER",
              email: "browser-learner@example.edu",
            },
          ],
        },
      });
      return;
    }
    if (
      pathname === "/api/v1/assignments" &&
      request.method() === "POST"
    ) {
      submitted = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        json: {
          assignment: {
            schemaVersion: "1.1.0",
            assignmentId: submitted.assignmentId,
            title: submitted.title,
            packId: option.packId,
            packVersion: option.packVersion,
            scenarioId: option.scenarioId,
            scenarioVersion: option.scenarioVersion,
            mode: submitted.mode,
            runConfiguration: {
              mode: submitted.mode,
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
            counterfactualReplay: submitted.counterfactualReplay,
            learnerUserIds: submitted.learnerUserIds,
            status: "active",
            feedbackReleaseStatus: "withheld",
            availableFrom: submitted.availableFrom,
            availableUntil: submitted.availableUntil,
            createdAt: "2026-07-25T05:00:00.000Z",
            createdByUserId: "USER_ASSIGNMENT_INSTRUCTOR",
          },
        },
      });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: { code: "UNEXPECTED_TEST_ROUTE" } },
    });
  });

  await page.goto("/instructor?locale=en");
  const form = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Create an assignment" }),
  });
  await expect(form.getByLabel("Published scenario")).toHaveValue(
    [
      option.packId,
      option.packVersion,
      option.scenarioId,
      option.scenarioVersion,
    ].join("::"),
  );
  await expect(form.getByLabel("Pack ID")).toHaveCount(0);
  await expect(form.getByLabel("Scenario ID")).toHaveCount(0);
  await expect(
    form.getByLabel("Run mode").locator("option"),
  ).toHaveCount(2);
  const publishedSettings = form.getByLabel(
    "Published mode settings",
  );
  await expect(publishedSettings.getByText("30 minutes")).toBeVisible();
  await form.getByLabel("Run mode").selectOption("tutorial");
  await expect(publishedSettings.getByText("45 minutes")).toBeVisible();
  await form.getByLabel("Run mode").selectOption("standard");

  await form.getByLabel("Assignment ID").fill("ASSIGNMENT_BROWSER_001");
  await form.getByLabel("Assignment title").fill("Browser cohort");
  await form
    .getByLabel("Available from (optional)")
    .fill(availableFromLocal);
  await form
    .getByLabel("Available until (optional)")
    .fill(availableUntilLocal);
  await form
    .getByRole("checkbox", {
      name: "browser-learner@example.edu (USER_BROWSER_LEARNER)",
    })
    .check();
  await form.getByRole("button", { name: "Create assignment" }).click();

  await expect(
    form.getByText("Assignment ASSIGNMENT_BROWSER_001 was created."),
  ).toBeVisible();
  await expect(
    form.getByLabel("Published mode settings"),
  ).toHaveCount(2);
  expect(submitted).toMatchObject({
    assignmentId: "ASSIGNMENT_BROWSER_001",
    packId: option.packId,
    packVersion: option.packVersion,
    scenarioId: option.scenarioId,
    scenarioVersion: option.scenarioVersion,
    mode: "standard",
    learnerUserIds: ["USER_BROWSER_LEARNER"],
    availableFrom,
    availableUntil,
  });
  expect(submitted).not.toHaveProperty("runConfiguration");
});

test("refreshes replay-derived instructor status without hidden outcomes", async ({
  page,
}) => {
  const assignmentId = "ASSIGNMENT_MONITOR_001";
  let monitorRequests = 0;
  let closeRequests = 0;
  const assignment = {
    schemaVersion: "1.1.0",
    assignmentId,
    title: "Monitor cohort",
    packId: "PACK_STANDARD_COFFEE_STAGE3",
    packVersion: "1.4.0",
    scenarioId: "SCN_COFFEE_001",
    scenarioVersion: "2.2.0",
    mode: "standard",
    runConfiguration: {
      mode: "standard",
      allowHints: false,
      allowRetry: false,
      allowBacktracking: false,
      feedbackTiming: "final",
      showScores: false,
      outcomeStrategy: "forced",
      seedPolicy: "assignment-learner",
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
    learnerUserIds: ["USER_MONITOR_LEARNER"],
    status: "active",
    feedbackReleaseStatus: "withheld",
    createdAt: "2026-07-24T08:00:00.000Z",
    createdByUserId: "USER_MONITOR_INSTRUCTOR",
  };

  await page.route("**/api/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/v1/session") {
      await route.fulfill({
        json: {
          userId: "USER_MONITOR_INSTRUCTOR",
          email: "monitor-instructor@example.edu",
          roles: ["instructor"],
        },
      });
      return;
    }
    if (pathname === "/api/v1/assignment-options") {
      await route.fulfill({ json: { options: [] } });
      return;
    }
    if (pathname === "/api/v1/assignment-learners") {
      await route.fulfill({ json: { learners: [] } });
      return;
    }
    if (
      pathname ===
        `/api/v1/assignments/${assignmentId}/close` &&
      route.request().method() === "POST"
    ) {
      closeRequests += 1;
      await route.fulfill({
        status: 201,
        json: {
          assignment: {
            ...assignment,
            status: "closed",
            closedAt: "2026-07-24T08:06:00.000Z",
            closedByUserId: "USER_MONITOR_INSTRUCTOR",
          },
          wasIdempotentReplay: false,
        },
      });
      return;
    }
    if (
      pathname ===
      `/api/v1/assignments/${assignmentId}/report`
    ) {
      await route.fulfill({
        json: {
          report: {
            schemaVersion: "1.3.0",
            assignment,
            learners: [
              {
                learnerUserId: "USER_MONITOR_LEARNER",
                runs: [
                  {
                    runId: "RUN_MONITOR_001",
                    learnerUserId: "USER_MONITOR_LEARNER",
                    status: "active",
                    eventCount: 4,
                    startedAt: "2026-07-24T08:00:00.000Z",
                    lastActivityAt: "2026-07-24T08:04:30.000Z",
                    completedAt: null,
                    elapsedSeconds: 270,
                    activity: {
                      evidenceInspectionCount: 2,
                      policyConsultationCount: 1,
                      citedEvidenceCount: 1,
                      decisionAttemptCount: 3,
                      rejectedAttemptCount: 1,
                      mitigationCount: 1,
                      rejectionFindings: [
                        {
                          findingCode:
                            "RULE_ORGANIZATION_NOT_AUTHORIZED",
                          count: 1,
                        },
                      ],
                    },
                    ratings: [],
                    moderationResolutions: [],
                  },
                ],
              },
            ],
          },
        },
      });
      return;
    }
    if (
      pathname ===
      `/api/v1/assignments/${assignmentId}/monitor`
    ) {
      monitorRequests += 1;
      await route.fulfill({
        json: {
          monitor: {
            schemaVersion: "1.0.0",
            assignmentId,
            generatedAt: "2026-07-24T08:05:00.000Z",
            learners: [
              {
                learnerUserId: "USER_MONITOR_LEARNER",
                runs: [
                  {
                    runId: "RUN_MONITOR_001",
                    learnerUserId: "USER_MONITOR_LEARNER",
                    status: "active",
                    eventCount: 4,
                    currentStageId: "certificate-decision",
                    activeRoleId: "CERTIFICATION_OFFICER",
                    elapsedSeconds: 300,
                    lastActivityAt: "2026-07-24T08:04:00.000Z",
                    pendingActionIds: [
                      "SUBMIT_CERTIFICATE_DECISION",
                    ],
                    technicalStatus: "ok",
                  },
                ],
              },
            ],
          },
        },
      });
      return;
    }
    if (
      pathname ===
      `/api/v1/assignments/${assignmentId}/competencies`
    ) {
      await route.fulfill({
        json: {
          competencies: {
            schemaVersion: "1.0.0",
            interpretation: "EVIDENCE_ONLY_NO_COMPETENCE_INFERENCE",
            assignmentId,
            packId: assignment.packId,
            packVersion: assignment.packVersion,
            scenarioId: assignment.scenarioId,
            scenarioVersion: assignment.scenarioVersion,
            frameworks: [],
            learners: [
              {
                learnerUserId: "USER_MONITOR_LEARNER",
                indicators: [
                  {
                    frameworkId: "TRACECHAIN_CORE",
                    frameworkVersion: "1.0.0",
                    competencyId: "BC3",
                    competencyVersion: "1.0.0",
                    competencyTitleKey: "unused.competency.title",
                    indicatorId: "BC3.PI1",
                    indicatorVersion: "1.0.0",
                    indicatorStatementKey: "unused.indicator.statement",
                    targetType: "primary",
                    evidenceCount: 1,
                    latestObservedAt: "2026-07-24T08:04:00.000Z",
                    observations: [
                      {
                        runId: "RUN_MONITOR_001",
                        competencyEvidenceId: "CEV_MONITOR_001",
                        evidenceRuleId: "RULE_EVIDENCE_USED",
                        sourceEventIds: ["HEVT_MONITOR_004"],
                        observedAt: "2026-07-24T08:04:00.000Z",
                      },
                    ],
                    currentRatings: [
                      {
                        runId: "RUN_MONITOR_001",
                        ratingId: "RATING_MONITOR_001",
                        rubricId: "RUBRIC_CERTIFICATE_DECISION",
                        rubricVersion: "1.0.0",
                        criterionId: "CRITERION_EVIDENCE_USE",
                        levelValue: 3,
                        comment: "Uses certificate evidence carefully.",
                        linkedEvidenceIds: ["CEV_MONITOR_001"],
                        revision: 1,
                        raterUserId: "USER_MONITOR_RATER",
                        ratedAt: "2026-07-24T08:05:00.000Z",
                      },
                    ],
                  },
                ],
              },
            ],
            classIndicators: [
              {
                frameworkId: "TRACECHAIN_CORE",
                frameworkVersion: "1.0.0",
                competencyId: "BC3",
                competencyVersion: "1.0.0",
                competencyTitleKey: "unused.competency.title",
                indicatorId: "BC3.PI1",
                indicatorVersion: "1.0.0",
                indicatorStatementKey: "unused.indicator.statement",
                targetType: "primary",
                assignedLearnerCount: 1,
                learnersWithEvidence: 1,
                evidenceCount: 1,
                currentRatingCount: 1,
                ratingDistribution: [{ levelValue: 3, count: 1 }],
              },
            ],
          },
        },
      });
      return;
    }
    if (
      pathname ===
      `/api/v1/assignments/${assignmentId}/curriculum-crosswalks`
    ) {
      await route.fulfill({
        json: {
          curriculumCrosswalks: {
            schemaVersion: "2.0.0",
            interpretation:
              "EVIDENCE_CROSSWALK_NO_ATTAINMENT_INFERENCE",
            assignmentId,
            packId: assignment.packId,
            packVersion: assignment.packVersion,
            scenarioId: assignment.scenarioId,
            scenarioVersion: assignment.scenarioVersion,
            competencyFrameworks: [],
            competencyIndicators: [],
            overlays: [],
          },
        },
      });
      return;
    }
    if (
      pathname ===
      `/api/v1/assignments/${assignmentId}/process-analytics`
    ) {
      await route.fulfill({
        json: {
          analytics: {
            schemaVersion: "1.1.0",
            reportType:
              "TRACECHAIN_ASSIGNMENT_PROCESS_ANALYTICS",
            interpretation:
              "DESCRIPTIVE_EVENT_LINKED_NO_LEARNER_TRAIT_INFERENCE",
            ruleVersion:
              "TRACECHAIN_PROCESS_ANALYTICS_V1@1.1.0",
            assignmentId,
            packId: assignment.packId,
            packVersion: assignment.packVersion,
            scenarioId: assignment.scenarioId,
            scenarioVersion: assignment.scenarioVersion,
            generatedAt: "2026-07-24T08:05:00.000Z",
            runs: [],
            summary: {
              runCount: 0,
              evidenceRequestCounts: {},
              evidenceInspectionCounts: {},
              evidenceCitationCounts: {},
              policyConsultationCounts: {},
              decisionSubmissionCounts: {},
              rejectedAttemptCount: 0,
              mitigationCount: 0,
              authoredRequestDelayMinutesTotal: 0,
              authoredRequestCostUnitsTotal: 0,
            },
            limitations: [
              "ELAPSED_INTERVAL_IS_NOT_ATTENTION",
              "NO_MOTIVATION_OR_ABILITY_INFERENCE",
              "NO_AUTOMATED_HIGH_STAKES_DECISION",
            ],
          },
        },
      });
      return;
    }
    if (
      pathname ===
      `/api/v1/assignments/${assignmentId}/audit-report`
    ) {
      await route.fulfill({ json: { auditReport: null } });
      return;
    }
    if (
      pathname ===
      `/api/v1/assignments/${assignmentId}/technical-lab-report`
    ) {
      await route.fulfill({
        json: { technicalLabReport: null },
      });
      return;
    }
    if (
      pathname ===
      `/api/v1/assignments/${assignmentId}/decision-outcomes`
    ) {
      await route.fulfill({
        json: {
          decisionOutcomes: {
            schemaVersion: "1.0.0",
            interpretation:
              "DECISION_PROCESS_SEPARATE_FROM_REALIZED_OUTCOME",
            assignmentId,
            packId: assignment.packId,
            packVersion: assignment.packVersion,
            scenarioId: assignment.scenarioId,
            scenarioVersion: assignment.scenarioVersion,
            runs: [
              {
                runId: "RUN_MONITOR_001",
                learnerUserId: "USER_MONITOR_LEARNER",
                status: "completed",
                decisionItems: [
                  {
                    decisionItemId:
                      "INT_CERTIFICATE_INITIAL_SUBMITTED",
                    isAuthoredCorrect: true,
                  },
                  {
                    decisionItemId:
                      "INT_DISCREPANCY_INITIAL_SUBMITTED",
                    isAuthoredCorrect: false,
                  },
                ],
                realizedOutcome: {
                  outcomeModelId: "CERTIFICATE_CASE",
                  strategy: "forced",
                  outcomeCode: "authorized-certifier",
                },
              },
            ],
          },
        },
      });
      return;
    }
    if (pathname === "/api/v1/runs/RUN_MONITOR_001/timeline") {
      await route.fulfill({
        json: {
          timeline: [
            {
              sequenceNumber: 4,
              eventId: "HEVT_MONITOR_004",
              eventType: "COMPETENCY_EVIDENCE_RECORDED",
              occurredAt: "2026-07-24T08:04:00.000Z",
              authenticatedUserId: "USER_MONITOR_LEARNER",
              simulationActorId: "ACT_CERTIFICATION_OFFICER",
              organizationId: "ORG_CERTIFIER",
              roleId: "CERTIFICATION_OFFICER",
              causationId: "COMMAND_MONITOR_004",
              payload: {
                decision: {
                  certificateAssessment: "VALID",
                  issuerAssessment: "RECOGNIZED_AUTHORIZED",
                },
                justification:
                  "The certificate and issuer evidence support continuation.",
                citedEvidenceIds: ["EVID_CERTIFICATE_MONITOR"],
                citedPolicyIds: ["AUTH_ISSUE_CERTIFICATE"],
                confidenceRating: 4,
                adverseEventProbabilityPercent: 15,
              },
            },
          ],
        },
      });
      return;
    }
    if (
      pathname === "/api/v1/runs/RUN_MONITOR_001/competencies"
    ) {
      await route.fulfill({ json: { competencies: [] } });
      return;
    }
    if (
      pathname === "/api/v1/runs/RUN_MONITOR_001/rubric-evidence"
    ) {
      await route.fulfill({ json: { rubricEvidence: [] } });
      return;
    }
    if (pathname === "/api/v1/runs/RUN_MONITOR_001/ratings") {
      await route.fulfill({
        json: {
          assignment,
          ratings: [],
          moderationResolutions: [],
        },
      });
      return;
    }
    if (
      pathname ===
      "/api/v1/runs/RUN_MONITOR_001/instructor-incidents"
    ) {
      await route.fulfill({
        json: {
          director: {
            schemaVersion: "1.0.0",
            runId: "RUN_MONITOR_001",
            runVersion: 4,
            incidents: [],
          },
        },
      });
      return;
    }
    if (pathname === "/api/v1/runs/RUN_MONITOR_001/replay") {
      await route.fulfill({
        json: {
          replay: {
            schemaVersion: "1.0.0",
            runId: "RUN_MONITOR_001",
            assignmentId,
            learnerUserId: "USER_MONITOR_LEARNER",
            packId: assignment.packId,
            packVersion: assignment.packVersion,
            scenarioId: assignment.scenarioId,
            scenarioVersion: assignment.scenarioVersion,
            throughSequenceNumber: 4,
            totalEventCount: 4,
            selectedEvent: {
              sequenceNumber: 4,
              eventId: "HEVT_MONITOR_004",
              eventType: "COMPETENCY_EVIDENCE_RECORDED",
              occurredAt: "2026-07-24T08:04:00.000Z",
              authenticatedUserId: "USER_MONITOR_LEARNER",
              simulationActorId: "ACT_CERTIFICATION_OFFICER",
              organizationId: "ORG_CERTIFIER",
              roleId: "CERTIFICATION_OFFICER",
              causationId: "COMMAND_MONITOR_004",
              resultingStateHash: "a".repeat(64),
            },
            projection: {
              schemaVersion: "1.0.0",
              runId: "RUN_MONITOR_001",
              version: 4,
              roleId: "CERTIFICATION_OFFICER",
              businessState: [],
              ledgerState: {},
              informationState: [
                {
                  recordId: "EVID_CERTIFICATE_MONITOR",
                  value: {
                    evidenceType: "certificate",
                    inspected: true,
                  },
                },
                {
                  recordId: "EVID_SHIPPING_MONITOR",
                  value: {
                    evidenceType: "shipping-record",
                    inspected: true,
                  },
                },
              ],
              policyState: [
                {
                  recordId: "DECISION_POLICY_AUTH_ISSUE_CERTIFICATE",
                  value: {
                    policyId: "AUTH_ISSUE_CERTIFICATE",
                    policyType: "RUNTIME_POLICY",
                    titleKey:
                      "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.policies.AUTH_ISSUE_CERTIFICATE.title",
                  },
                },
              ],
              workflowState: {
                currentNodeId: "certificate-decision",
                completedNodeIds: ["certificate-evidence"],
                permittedActionIds: [
                  "SUBMIT_CERTIFICATE_DECISION",
                ],
              },
              staffProfile: certificateStaffProfile,
            },
          },
        },
      });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: { code: "UNEXPECTED_TEST_ROUTE" } },
    });
  });

  await page.goto("/instructor?locale=en");
  const reportSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Assignment report" }),
  });
  await reportSection.getByLabel("Assignment ID").fill(assignmentId);
  await reportSection
    .getByRole("button", { name: "Load report" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Live learner status" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Started" }),
  ).toBeVisible();
  await expect(
    page.getByText("2026-07-24T08:00:00.000Z"),
  ).toBeVisible();
  await expect(page.getByText("270 seconds")).toBeVisible();
  await page.getByText("View activity", { exact: true }).click();
  await expect(
    page.getByText("Evidence inspections", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Rejected attempts", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Common rejection findings",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("RULE_ORGANIZATION_NOT_AUTHORIZED"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Decision and outcome evidence",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("INT_CERTIFICATE_INITIAL_SUBMITTED"),
  ).toBeVisible();
  await expect(
    page.getByText("1 of 2 matched the authored response"),
  ).toBeVisible();
  await expect(page.getByText("authorized-certifier")).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Download pseudonymous JSON",
    }),
  ).toHaveAttribute(
    "href",
    `/api/v1/assignments/${assignmentId}/export.json?identity=pseudonymous`,
  );
  await expect(
    page.getByText(
      "Pseudonymous downloads replace learner user IDs with assignment-scoped codes. They are not anonymized records.",
    ),
  ).toBeVisible();
  await expect(page.getByText("certificate-decision")).toBeVisible();
  await expect(
    page.getByText("SUBMIT_CERTIFICATE_DECISION"),
  ).toBeVisible();
  await expect(page.getByText("No issue detected")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Learner competency profiles" }),
  ).toBeVisible();
  await expect(page.getByText("Level 3: 1")).toBeVisible();
  const learnerProfile = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "USER_MONITOR_LEARNER" }) });
  await learnerProfile.locator("summary").click();
  await expect(
    learnerProfile.getByText("SCN_COFFEE_001@2.2.0"),
  ).toBeVisible();
  await expect(
    learnerProfile.getByText("Uses certificate evidence carefully."),
  ).toBeVisible();
  await expect(learnerProfile.getByText("HEVT_MONITOR_004")).toBeVisible();
  await learnerProfile
    .getByRole("button", {
      name: "Review supporting event HEVT_MONITOR_004",
    })
    .click();
  const targetedEvent = page.locator('tr[aria-current="true"]');
  await expect(targetedEvent).toContainText("HEVT_MONITOR_004");
  await expect(targetedEvent).toBeFocused();
  await targetedEvent
    .getByRole("button", { name: "Replay after event 4" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Selected event response" }),
  ).toBeVisible();
  await expect(
    page.locator(
      '[data-staff-profile-id="STAFF_CERTIFICATION_OFFICER"]',
    ),
  ).toContainText("Active simulation role");
  await expect(
    page.locator(
      '[data-staff-profile-id="STAFF_CERTIFICATION_OFFICER"]',
    ),
  ).toContainText("Trần Minh Anh");
  await expect(
    page.getByText(
      /The certificate and issuer evidence support continuation\./,
    ),
  ).toBeVisible();
  await expect(page.getByText(/"confidenceRating": 4/)).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Evidence available at this point",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("EVID_CERTIFICATE_MONITOR", { exact: true }),
  ).toBeVisible();
  const citedEvidence = page
    .locator("details")
    .filter({ hasText: "EVID_CERTIFICATE_MONITOR" });
  const uncitedEvidence = page
    .locator("details")
    .filter({ hasText: "EVID_SHIPPING_MONITOR" });
  await expect(citedEvidence.locator("summary")).toContainText("Cited");
  await expect(uncitedEvidence.locator("summary")).toContainText(
    "Available, not cited",
  );
  await expect(
    page.getByRole("heading", {
      name: "Policies available at this point",
    }),
  ).toBeVisible();
  const citedPolicy = page
    .locator("details")
    .filter({ hasText: "AUTH_ISSUE_CERTIFICATE" });
  await expect(citedPolicy.locator("summary")).toContainText("Cited");
  expect(monitorRequests).toBe(1);

  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect.poll(() => monitorRequests).toBe(2);

  await page
    .getByRole("button", { name: "Close new attempts" })
    .click();
  await expect.poll(() => closeRequests).toBe(1);
  await expect(
    page.getByText("Closed — no new attempts may start."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Closed at 2026-07-24T08:06:00.000Z by USER_MONITOR_INSTRUCTOR. Existing runs and evidence are unchanged.",
    ),
  ).toBeVisible();
});
