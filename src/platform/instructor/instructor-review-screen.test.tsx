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
      loadAssignmentReport: vi.fn(),
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_INSTRUCTOR_001",
        email: "instructor@example.edu",
        roles: ["instructor"],
      }),
      loadRunReview: vi.fn(),
      releaseFeedback: vi.fn(),
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

  it("loads one run's existing timeline, competency, and rubric evidence", async () => {
    const saveRating = vi.fn().mockResolvedValue(undefined);
    const api: InstructorReviewApi = {
      createAssignment: vi.fn(),
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
      }),
      releaseFeedback: vi.fn().mockResolvedValue(undefined),
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

  it("does not expose run review controls to a learner-only session", async () => {
    const api: InstructorReviewApi = {
      createAssignment: vi.fn(),
      loadAssignmentReport: vi.fn(),
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_LEARNER_001",
        email: "learner@example.edu",
        roles: ["learner"],
      }),
      loadRunReview: vi.fn(),
      releaseFeedback: vi.fn(),
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
                  };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const api = createInstructorReviewApi(fetcher);

    await api.loadSession();
    await api.loadRunReview("RUN / 001");

    expect(requestedPaths).toEqual([
      "/api/v1/session",
      "/api/v1/runs/RUN%20%2F%20001/timeline",
      "/api/v1/runs/RUN%20%2F%20001/competencies",
      "/api/v1/runs/RUN%20%2F%20001/rubric-evidence",
      "/api/v1/runs/RUN%20%2F%20001/ratings",
    ]);
  });
});
