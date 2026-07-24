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
