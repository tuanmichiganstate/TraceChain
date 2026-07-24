import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../app/providers/locale-provider";
import {
  createInstructorReviewApi,
  InstructorReviewScreen,
  type InstructorReviewApi,
} from "./instructor-review-screen";

function renderScreen(api: InstructorReviewApi) {
  return render(
    <LocaleProvider locale="en">
      <InstructorReviewScreen api={api} />
    </LocaleProvider>,
  );
}

describe("instructor review screen", () => {
  it("generates accepted guided or challenge packages through the hosted job API", async () => {
    const createScormPackageJob = vi.fn().mockResolvedValue({
      schemaVersion: "1.0.0",
      jobId: "JOB_SCORM_CHALLENGE_001",
      presetId: "challenge",
      status: "completed",
      title: "TraceChain Challenge A",
      filename: "TraceChain_Challenge_ChallengeA_vi_v1.1.0.zip",
      sha256: "a".repeat(64),
      sizeBytes: 1234,
      release: true,
      configurationHash: "b".repeat(64),
      scenarioId: "SCN_COFFEE_CHALLENGE_A",
      scenarioVersion: "1.1.0",
      applicationBuildHash: "c".repeat(64),
      sourceCommit: "d".repeat(40),
      artifactKey: "scorm-packages/a/package.zip",
      requestedAt: "2026-07-24T08:00:00.000Z",
      completedAt: "2026-07-24T08:00:00.000Z",
      requestedByUserId: "USER_INSTRUCTOR_001",
      downloadUrl: "/api/v1/scorm-package-jobs/JOB_SCORM_CHALLENGE_001/download",
    });
    const api: InstructorReviewApi = {
      createAssignment: vi.fn(),
      loadAssignmentCompetencies: vi.fn(),
      loadAssignmentMonitor: vi.fn(),
      loadAssignmentReport: vi.fn(),
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_INSTRUCTOR_001",
        email: "instructor@example.edu",
        roles: ["instructor"],
      }),
      loadRunReplay: vi.fn(),
      loadRunReview: vi.fn(),
      releaseFeedback: vi.fn(),
      saveModeration: vi.fn(),
      saveRating: vi.fn(),
      loadScormPackageJobs: vi.fn().mockResolvedValue([]),
      createScormPackageJob,
    };
    renderScreen(api);
    const builder = (await screen.findByRole("heading", {
      name: "Generate a SCORM package",
    })).closest("section");
    if (builder === null) throw new Error("Expected package builder.");
    const user = userEvent.setup();
    await user.selectOptions(
      within(builder).getByLabelText("Package preset"),
      "challenge",
    );
    await user.click(
      within(builder).getByRole("button", {
        name: "Generate package",
      }),
    );

    expect(createScormPackageJob).toHaveBeenCalledWith("challenge");
    const download = await within(builder).findByRole("link", {
      name: "Download ZIP",
    });
    expect(download).toHaveAttribute(
      "href",
      "/api/v1/scorm-package-jobs/JOB_SCORM_CHALLENGE_001/download",
    );
    expect(within(builder).getByText("Release")).toBeInTheDocument();
  });

  it("creates one assignment from an exact pack, scenario, and learner roster", async () => {
    const assignment = {
      schemaVersion: "1.0.0" as const,
      assignmentId: "ASSIGNMENT_001",
      title: "Coffee cohort",
      packId: "PACK_STANDARD_COFFEE_STAGE3",
      packVersion: "1.4.0",
      scenarioId: "SCN_COFFEE_001",
      scenarioVersion: "2.2.0",
      mode: "standard" as const,
      learnerUserIds: ["USER_LEARNER_001"],
      status: "active" as const,
      feedbackReleaseStatus: "withheld" as const,
      createdAt: "2026-07-24T08:00:00.000Z",
      createdByUserId: "USER_INSTRUCTOR_001",
    };
    const createAssignment = vi.fn().mockResolvedValue(assignment);
    const api: InstructorReviewApi = {
      createAssignment,
      loadAssignmentCompetencies: vi.fn(),
      loadAssignmentMonitor: vi.fn(),
      loadAssignmentReport: vi.fn(),
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_INSTRUCTOR_001",
        email: "instructor@example.edu",
        roles: ["instructor"],
      }),
      loadRunReplay: vi.fn(),
      loadRunReview: vi.fn(),
      releaseFeedback: vi.fn(),
      saveModeration: vi.fn(),
      saveRating: vi.fn(),
    };
    renderScreen(api);

    const heading = await screen.findByRole("heading", {
      name: "Create an assignment",
    });
    const section = heading.closest("section");
    if (section === null) throw new Error("Expected assignment section.");
    const form = within(section);
    const user = userEvent.setup();
    await user.type(
      form.getByLabelText("Assignment ID"),
      assignment.assignmentId,
    );
    await user.type(
      form.getByLabelText("Assignment title"),
      assignment.title,
    );
    await user.type(form.getByLabelText("Pack ID"), assignment.packId);
    await user.type(
      form.getByLabelText("Pack version"),
      assignment.packVersion,
    );
    await user.type(
      form.getByLabelText("Scenario ID"),
      assignment.scenarioId,
    );
    await user.type(
      form.getByLabelText("Scenario version"),
      assignment.scenarioVersion,
    );
    await user.type(
      form.getByLabelText("Learner user IDs"),
      assignment.learnerUserIds.join(","),
    );
    await user.click(
      form.getByRole("button", { name: "Create assignment" }),
    );

    expect(createAssignment).toHaveBeenCalledWith({
      assignmentId: assignment.assignmentId,
      title: assignment.title,
      packId: assignment.packId,
      packVersion: assignment.packVersion,
      scenarioId: assignment.scenarioId,
      scenarioVersion: assignment.scenarioVersion,
      mode: "standard",
      learnerUserIds: assignment.learnerUserIds,
    });
    expect(
      await form.findByText("Assignment ASSIGNMENT_001 was created."),
    ).toBeInTheDocument();
  });

  it("offers stable JSON and CSV downloads after loading an assignment report", async () => {
    const api: InstructorReviewApi = {
      createAssignment: vi.fn(),
      loadAssignmentCompetencies: vi.fn().mockResolvedValue({
        schemaVersion: "1.0.0",
        interpretation: "EVIDENCE_ONLY_NO_COMPETENCE_INFERENCE",
        assignmentId: "ASSIGNMENT_EXPORT_001",
        packId: "PACK_STANDARD_COFFEE_STAGE3",
        packVersion: "1.4.0",
        scenarioId: "SCN_COFFEE_001",
        scenarioVersion: "2.2.0",
        frameworks: [
          {
            frameworkId: "TRACECHAIN_CORE",
            frameworkVersion: "1.0.0",
          },
        ],
        learners: [
          {
            learnerUserId: "USER_LEARNER_001",
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
                evidenceCount: 2,
                latestObservedAt: "2026-07-24T08:04:00.000Z",
                observations: [
                  {
                    runId: "RUN_EXPORT_001",
                    competencyEvidenceId: "CEV_EXPORT_001",
                    evidenceRuleId: "RULE_EVIDENCE_USED",
                    sourceEventIds: ["HEVT_EXPORT_002"],
                    observedAt: "2026-07-24T08:04:00.000Z",
                  },
                ],
                currentRatings: [
                  {
                    runId: "RUN_EXPORT_001",
                    ratingId: "RATING_EXPORT_001",
                    rubricId: "RUBRIC_CERTIFICATE_DECISION",
                    rubricVersion: "1.0.0",
                    criterionId: "CRITERION_EVIDENCE_USE",
                    levelValue: 3,
                    comment: "Evidence was used carefully.",
                    linkedEvidenceIds: ["CEV_EXPORT_001"],
                    revision: 1,
                    raterUserId: "USER_RATER_001",
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
            evidenceCount: 2,
            currentRatingCount: 1,
            ratingDistribution: [{ levelValue: 3, count: 1 }],
          },
        ],
      }),
      loadAssignmentReport: vi.fn().mockResolvedValue({
        schemaVersion: "1.0.0",
        assignment: {
          schemaVersion: "1.0.0",
          assignmentId: "ASSIGNMENT_EXPORT_001",
          title: "Coffee export cohort",
          packId: "PACK_STANDARD_COFFEE_STAGE3",
          packVersion: "1.4.0",
          scenarioId: "SCN_COFFEE_001",
          scenarioVersion: "2.2.0",
          mode: "standard",
          learnerUserIds: ["USER_LEARNER_001"],
          status: "active",
          feedbackReleaseStatus: "withheld",
          createdAt: "2026-07-24T08:00:00.000Z",
          createdByUserId: "USER_INSTRUCTOR_001",
        },
        learners: [
          {
            learnerUserId: "USER_LEARNER_001",
            runs: [],
          },
        ],
      }),
      loadAssignmentMonitor: vi.fn().mockResolvedValue({
        schemaVersion: "1.0.0",
        assignmentId: "ASSIGNMENT_EXPORT_001",
        generatedAt: "2026-07-24T08:05:00.000Z",
        learners: [
          {
            learnerUserId: "USER_LEARNER_001",
            runs: [
              {
                runId: "RUN_EXPORT_001",
                learnerUserId: "USER_LEARNER_001",
                status: "active",
                eventCount: 4,
                currentStageId: "certificate-transaction",
                activeRoleId: "LOGISTICS_COORDINATOR",
                elapsedSeconds: 300,
                lastActivityAt: "2026-07-24T08:04:00.000Z",
                pendingActionIds: [
                  "SUBMIT_CERTIFICATE_TRANSACTION",
                ],
                technicalStatus: "ok",
              },
            ],
          },
        ],
      }),
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_INSTRUCTOR_001",
        email: "instructor@example.edu",
        roles: ["instructor"],
      }),
      loadRunReplay: vi.fn(),
      loadRunReview: vi.fn(),
      releaseFeedback: vi.fn(),
      saveModeration: vi.fn(),
      saveRating: vi.fn(),
    };
    renderScreen(api);

    expect(await screen.findByText("instructor@example.edu")).toBeInTheDocument();
    const reportHeading = screen.getByRole("heading", {
      name: "Assignment report",
    });
    const section = reportHeading.closest("section");
    if (section === null) throw new Error("Expected report section.");
    const report = within(section);
    const user = userEvent.setup();
    await user.type(
      report.getByLabelText("Assignment ID"),
      "ASSIGNMENT_EXPORT_001",
    );
    await user.click(
      report.getByRole("button", { name: "Load report" }),
    );

    expect(api.loadAssignmentMonitor).toHaveBeenCalledWith(
      "ASSIGNMENT_EXPORT_001",
    );
    expect(
      await report.findByRole("heading", {
        name: "Live learner status",
      }),
    ).toBeInTheDocument();
    expect(report.getByText("certificate-transaction")).toBeInTheDocument();
    expect(
      report.getByText("SUBMIT_CERTIFICATE_TRANSACTION"),
    ).toBeInTheDocument();
    expect(report.getByText("No issue detected")).toBeInTheDocument();
    await user.click(
      report.getByRole("button", { name: "Refresh status" }),
    );
    expect(api.loadAssignmentMonitor).toHaveBeenCalledTimes(2);

    expect(
      await report.findByRole("link", { name: "Download JSON evidence" }),
    ).toHaveAttribute(
      "href",
      "/api/v1/assignments/ASSIGNMENT_EXPORT_001/export.json",
    );
    expect(
      report.getByRole("link", { name: "Download CSV evidence" }),
    ).toHaveAttribute(
      "href",
      "/api/v1/assignments/ASSIGNMENT_EXPORT_001/export.csv",
    );
    expect(
      report.getByRole("heading", {
        name: "Class competency evidence",
      }),
    ).toBeInTheDocument();
    const competencyRow = report.getAllByText("BC3.PI1")[0]?.closest("tr");
    if (competencyRow === null || competencyRow === undefined) {
      throw new Error("Expected class competency row.");
    }
    expect(within(competencyRow).getByText("1 of 1")).toBeInTheDocument();
    expect(within(competencyRow).getByText("2")).toBeInTheDocument();
    expect(
      report.getByRole("heading", {
        name: "Learner competency profiles",
      }),
    ).toBeInTheDocument();
    const learnerSummary = report.getByText("USER_LEARNER_001", {
      selector: "summary code",
    });
    const learnerProfile = learnerSummary.closest("details");
    if (learnerProfile === null) {
      throw new Error("Expected learner competency profile.");
    }
    await user.click(learnerSummary);
    expect(
      within(learnerProfile).getByText(/Evidence was used carefully\./),
    ).toBeVisible();
    expect(within(learnerProfile).getByText("HEVT_EXPORT_002")).toBeVisible();
    expect(
      within(learnerProfile).getByText("SCN_COFFEE_001@2.2.0"),
    ).toBeVisible();
    expect(
      within(learnerProfile).getByText("2026-07-24T08:04:00.000Z"),
    ).toBeVisible();
  });

  it("loads one run's existing timeline, competency, and rubric evidence", async () => {
    const saveRating = vi.fn().mockResolvedValue(undefined);
    const loadRunReplay = vi.fn().mockResolvedValue({
      schemaVersion: "1.0.0",
      runId: "RUN_STAGE3_001",
      assignmentId: "ASSIGNMENT_001",
      learnerUserId: "USER_LEARNER_001",
      packId: "PACK_STANDARD_COFFEE_STAGE3",
      packVersion: "1.4.0",
      scenarioId: "SCN_COFFEE_001",
      scenarioVersion: "2.2.0",
      throughSequenceNumber: 2,
      totalEventCount: 2,
      selectedEvent: {
        sequenceNumber: 2,
        eventId: "HEVT_002",
        eventType: "TRANSACTION_REJECTED",
        occurredAt: "2026-07-24T08:01:00.000Z",
        authenticatedUserId: "USER_LEARNER_001",
        simulationActorId: "ACT_LOGISTICS_COORDINATOR",
        organizationId: "ORG_LOGISTICS_PROVIDER",
        roleId: "LOGISTICS_COORDINATOR",
        causationId: "CMD_SUBMIT",
        resultingStateHash:
          "1111111111111111111111111111111111111111111111111111111111111111",
      },
      projection: {
        schemaVersion: "1.0.0",
        runId: "RUN_STAGE3_001",
        version: 2,
        roleId: "LOGISTICS_COORDINATOR",
        businessState: [],
        ledgerState: {},
        informationState: [
          {
            recordId: "EVID_CERTIFICATE_RECORD",
            value: {},
          },
        ],
        policyState: [],
        workflowState: {
          currentNodeId: "certificate-transaction",
          completedNodeIds: ["certificate-decision"],
          permittedActionIds: ["SUBMIT_CERTIFICATE_TRANSACTION"],
        },
      },
    });
    const api: InstructorReviewApi = {
      createAssignment: vi.fn(),
      loadAssignmentCompetencies: vi.fn(),
      loadAssignmentMonitor: vi.fn(),
      loadAssignmentReport: vi.fn(),
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_INSTRUCTOR_001",
        email: "instructor@example.edu",
        roles: ["instructor"],
      }),
      loadRunReview: vi.fn().mockResolvedValue({
        assignment: {
          schemaVersion: "1.0.0",
          assignmentId: "ASSIGNMENT_001",
          title: "Coffee cohort",
          packId: "PACK_STANDARD_COFFEE_STAGE3",
          packVersion: "1.4.0",
          scenarioId: "SCN_COFFEE_001",
          scenarioVersion: "2.2.0",
          mode: "standard",
          learnerUserIds: ["USER_LEARNER_001"],
          status: "active",
          feedbackReleaseStatus: "withheld",
          createdAt: "2026-07-24T08:00:00.000Z",
          createdByUserId: "USER_INSTRUCTOR_001",
        },
        timeline: [
          {
            sequenceNumber: 1,
            eventId: "HEVT_001",
            eventType: "RUN_CREATED",
            occurredAt: "2026-07-24T08:00:00.000Z",
            authenticatedUserId: "USER_INSTRUCTOR_001",
            simulationActorId: "ACT_CERTIFIER",
            organizationId: "ORG_CERTIFICATION_BODY",
            roleId: "CERTIFICATION_OFFICER",
            causationId: "CMD_CREATE",
            payload: {},
          },
          {
            sequenceNumber: 2,
            eventId: "HEVT_002",
            eventType: "TRANSACTION_REJECTED",
            occurredAt: "2026-07-24T08:01:00.000Z",
            authenticatedUserId: "USER_LEARNER_001",
            simulationActorId: "ACT_LOGISTICS_COORDINATOR",
            organizationId: "ORG_LOGISTICS_PROVIDER",
            roleId: "LOGISTICS_COORDINATOR",
            causationId: "CMD_SUBMIT",
            payload: {},
          },
        ],
        competencies: [
          {
            indicatorId: "BC4.PI1",
            evidence: [
              {
                competencyEvidenceId: "CEV_001",
                evidenceRuleId: "RULE_UNAUTHORIZED_CERTIFICATE_RECOGNIZED",
                indicatorIds: ["BC4.PI1"],
                sourceEventIds: ["HEVT_002"],
                observedAt: "2026-07-24T08:01:00.000Z",
              },
            ],
          },
        ],
        rubricEvidence: [
          {
            rubricId: "RUBRIC_CERTIFICATE_DECISION",
            rubricVersion: "1.0.0",
            criterionId: "CRITERION_AUTHORIZATION_JUDGMENT",
            allowedLevelValues: [0, 1, 2, 3, 4],
            evidenceRuleIds: ["RULE_UNAUTHORIZED_CERTIFICATE_RECOGNIZED"],
            observedEvidenceIds: ["CEV_001"],
            status: "observed",
          },
          {
            rubricId: "RUBRIC_CERTIFICATE_DECISION",
            rubricVersion: "1.0.0",
            criterionId: "CRITERION_JUSTIFICATION",
            allowedLevelValues: [0, 1, 2, 3, 4],
            evidenceRuleIds: ["RULE_CERTIFICATE_DECISION_SUBMITTED"],
            observedEvidenceIds: [],
            status: "not-observed",
          },
        ],
        ratings: [],
        moderationResolutions: [],
      }),
      loadRunReplay,
      releaseFeedback: vi.fn().mockResolvedValue(undefined),
      saveModeration: vi.fn(),
      saveRating,
    };

    renderScreen(api);

    expect(await screen.findByText("instructor@example.edu")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Run ID"), "RUN_STAGE3_001");
    await user.click(screen.getByRole("button", { name: "Load run" }));

    expect(api.loadRunReview).toHaveBeenCalledWith("RUN_STAGE3_001");
    expect(await screen.findByText("TRANSACTION_REJECTED")).toBeInTheDocument();
    expect(screen.getByText("BC4.PI1")).toBeInTheDocument();
    expect(
      screen.getByText("CRITERION_AUTHORIZATION_JUDGMENT"),
    ).toBeInTheDocument();
    expect(screen.getByText("Observed")).toBeInTheDocument();
    expect(screen.getByText("Not observed")).toBeInTheDocument();

    const replayRow = screen
      .getByText("TRANSACTION_REJECTED")
      .closest("tr");
    if (replayRow === null) throw new Error("Expected replay row.");
    await user.click(
      within(replayRow).getByRole("button", {
        name: "Replay after event 2",
      }),
    );
    expect(loadRunReplay).toHaveBeenCalledWith("RUN_STAGE3_001", 2);
    expect(
      await screen.findByRole("heading", {
        name: "Replay at event 2",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("certificate-transaction")).toBeInTheDocument();
    expect(
      screen.getByText("SUBMIT_CERTIFICATE_TRANSACTION"),
    ).toBeInTheDocument();

    const criterionRow = screen
      .getByText("CRITERION_AUTHORIZATION_JUDGMENT")
      .closest("tr");
    if (criterionRow === null) throw new Error("Expected rubric row.");
    const rating = within(criterionRow);
    await user.selectOptions(rating.getByLabelText("Level"), "3");
    await user.type(
      rating.getByLabelText("Assessor comment"),
      "Evidence supports this judgment.",
    );
    await user.click(
      rating.getByRole("button", { name: "Save rating" }),
    );
    expect(saveRating).toHaveBeenCalledWith("RUN_STAGE3_001", {
      rubricId: "RUBRIC_CERTIFICATE_DECISION",
      criterionId: "CRITERION_AUTHORIZATION_JUDGMENT",
      levelValue: 3,
      comment: "Evidence supports this judgment.",
      linkedEvidenceIds: ["CEV_001"],
      expectedRevision: 0,
    });
  });

  it("records an instructor moderation resolution against source ratings", async () => {
    const sourceRating = {
      schemaVersion: "1.0.0" as const,
      ratingId: "RATING_001",
      assignmentId: "ASSIGNMENT_001",
      runId: "RUN_MODERATION_001",
      rubricId: "RUBRIC_CERTIFICATE_DECISION",
      rubricVersion: "1.0.0",
      criterionId: "CRITERION_EVIDENCE_USE",
      levelValue: 2,
      comment: "Initial assessor judgment.",
      linkedEvidenceIds: ["CEV_001"],
      revision: 1,
      raterUserId: "USER_RATER_001",
      ratedAt: "2026-07-24T08:10:00.000Z",
    };
    const saveModeration = vi.fn().mockResolvedValue(undefined);
    const api: InstructorReviewApi = {
      createAssignment: vi.fn(),
      loadAssignmentCompetencies: vi.fn(),
      loadAssignmentMonitor: vi.fn(),
      loadAssignmentReport: vi.fn(),
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_INSTRUCTOR_001",
        email: "instructor@example.edu",
        roles: ["instructor"],
      }),
      loadRunReplay: vi.fn(),
      loadRunReview: vi.fn().mockResolvedValue({
        assignment: {
          schemaVersion: "1.0.0",
          assignmentId: "ASSIGNMENT_001",
          title: "Coffee cohort",
          packId: "PACK_STANDARD_COFFEE_STAGE3",
          packVersion: "1.4.0",
          scenarioId: "SCN_COFFEE_001",
          scenarioVersion: "2.2.0",
          mode: "standard",
          learnerUserIds: ["USER_LEARNER_001"],
          status: "active",
          feedbackReleaseStatus: "withheld",
          createdAt: "2026-07-24T08:00:00.000Z",
          createdByUserId: "USER_INSTRUCTOR_001",
        },
        timeline: [
          {
            sequenceNumber: 1,
            eventId: "HEVT_001",
            eventType: "RUN_COMPLETED",
            occurredAt: "2026-07-24T08:09:00.000Z",
            authenticatedUserId: "USER_LEARNER_001",
            simulationActorId: "ACT_LEARNER",
            organizationId: "ORG_PRODUCER_COOP",
            roleId: "PRODUCER_MANAGER",
            causationId: "COMMAND_COMPLETE",
            payload: {},
          },
        ],
        competencies: [],
        rubricEvidence: [
          {
            rubricId: sourceRating.rubricId,
            rubricVersion: sourceRating.rubricVersion,
            criterionId: sourceRating.criterionId,
            allowedLevelValues: [0, 1, 2, 3, 4],
            evidenceRuleIds: ["RULE_EVIDENCE_USED"],
            observedEvidenceIds: ["CEV_001"],
            status: "observed",
          },
        ],
        ratings: [sourceRating],
        moderationResolutions: [],
      }),
      releaseFeedback: vi.fn(),
      saveModeration,
      saveRating: vi.fn(),
    };
    renderScreen(api);

    const user = userEvent.setup();
    await screen.findByText("instructor@example.edu");
    await user.type(
      screen.getByLabelText("Run ID"),
      sourceRating.runId,
    );
    await user.click(screen.getByRole("button", { name: "Load run" }));

    await user.selectOptions(
      await screen.findByLabelText("Resolved level"),
      "3",
    );
    await user.type(
      screen.getByLabelText("Resolution rationale"),
      "The linked evidence supports the moderated level.",
    );
    await user.click(
      screen.getByRole("button", { name: "Save resolution" }),
    );
    expect(saveModeration).toHaveBeenCalledWith(
      sourceRating.runId,
      {
        rubricId: sourceRating.rubricId,
        criterionId: sourceRating.criterionId,
        levelValue: 3,
        comment: "The linked evidence supports the moderated level.",
        sourceRatingIds: [sourceRating.ratingId],
        expectedRevision: 0,
      },
    );
  });

  it("does not expose run review controls to a learner-only session", async () => {
    const api: InstructorReviewApi = {
      createAssignment: vi.fn(),
      loadAssignmentCompetencies: vi.fn(),
      loadAssignmentMonitor: vi.fn(),
      loadAssignmentReport: vi.fn(),
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_LEARNER_001",
        email: "learner@example.edu",
        roles: ["learner"],
      }),
      loadRunReplay: vi.fn(),
      loadRunReview: vi.fn(),
      releaseFeedback: vi.fn(),
      saveModeration: vi.fn(),
      saveRating: vi.fn(),
    };

    renderScreen(api);

    expect(
      await screen.findByText(
        "Your TraceChain account does not have permission to review runs.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Run ID")).not.toBeInTheDocument();
  });

  it("reads the existing review endpoints without adding a second API", async () => {
    const requestedPaths: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      requestedPaths.push(path);
      const body =
        path === "/api/v1/session"
          ? {
              userId: "USER_INSTRUCTOR_001",
              email: "instructor@example.edu",
              roles: ["instructor"],
            }
          : path.endsWith("/timeline")
            ? { timeline: [] }
            : path.endsWith("/monitor")
              ? { monitor: { schemaVersion: "1.0.0" } }
            : path.includes("/replay?sequence=")
              ? { replay: { throughSequenceNumber: 2 } }
            : path.endsWith("/competencies")
              ? { competencies: [] }
              : path.endsWith("/rubric-evidence")
                ? { rubricEvidence: [] }
                : {
                    assignment: {
                      schemaVersion: "1.0.0",
                      assignmentId: "ASSIGNMENT_001",
                      title: "Coffee cohort",
                      packId: "PACK_STANDARD_COFFEE_STAGE3",
                      packVersion: "1.4.0",
                      scenarioId: "SCN_COFFEE_001",
                      scenarioVersion: "2.2.0",
                      mode: "standard",
                      learnerUserIds: ["USER_LEARNER_001"],
                      status: "active",
                      feedbackReleaseStatus: "withheld",
                      createdAt: "2026-07-24T08:00:00.000Z",
                      createdByUserId: "USER_INSTRUCTOR_001",
                    },
                    ratings: [],
                    moderationResolutions: [],
                  };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const api = createInstructorReviewApi(fetcher);

    await api.loadSession();
    await api.loadRunReview("RUN / 001");
    await api.loadRunReplay("RUN / 001", 2);
    await api.loadAssignmentMonitor("ASSIGNMENT / 001");

    expect(requestedPaths).toEqual([
      "/api/v1/session",
      "/api/v1/runs/RUN%20%2F%20001/timeline",
      "/api/v1/runs/RUN%20%2F%20001/competencies",
      "/api/v1/runs/RUN%20%2F%20001/rubric-evidence",
      "/api/v1/runs/RUN%20%2F%20001/ratings",
      "/api/v1/runs/RUN%20%2F%20001/replay?sequence=2",
      "/api/v1/assignments/ASSIGNMENT%20%2F%20001/monitor",
    ]);
  });
});
