import { expect, test } from "@playwright/test";

test("runs an assigned hosted learner action from role-filtered server state", async ({
  page,
}) => {
  let submittedCommand: Record<string, unknown> | null = null;
  const assignment = {
    schemaVersion: "1.0.0",
    assignmentId: "ASSIGNMENT_BROWSER_001",
    title: "Hosted coffee governance",
    packId: "PACK_STANDARD_COFFEE_STAGE3",
    packVersion: "1.4.0",
    scenarioId: "SCN_COFFEE_STAGE3_FOUNDATION",
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
    roleId: "LOGISTICS_COORDINATOR",
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
  };
  const decisionProjection = {
    ...initialProjection,
    version: 4,
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
        json: { assignments: [{ assignment, runs: [] }] },
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

test("refreshes replay-derived instructor status without hidden outcomes", async ({
  page,
}) => {
  const assignmentId = "ASSIGNMENT_MONITOR_001";
  let monitorRequests = 0;
  const assignment = {
    schemaVersion: "1.0.0",
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
          userId: "USER_MONITOR_RATER",
          email: "monitor-rater@example.edu",
          roles: ["rater"],
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
            schemaVersion: "1.0.0",
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
    await route.fulfill({
      status: 404,
      json: { error: { code: "UNEXPECTED_TEST_ROUTE" } },
    });
  });

  await page.goto("/instructor?locale=en");
  await page.getByLabel("Assignment ID").fill(assignmentId);
  await page.getByRole("button", { name: "Load report" }).click();

  await expect(
    page.getByRole("heading", { name: "Live learner status" }),
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
  expect(monitorRequests).toBe(1);

  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect.poll(() => monitorRequests).toBe(2);
});
