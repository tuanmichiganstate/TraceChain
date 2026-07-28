import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../app/providers/locale-provider";
import type {
  HostedAssignmentScenarioOptionV1,
} from "../contracts/assessment";
import {
  ClassTechnicalLabReport,
  createInstructorReviewApi,
  InstructorReviewScreen,
  type InstructorReviewApi,
} from "./instructor-review-screen";

const disabledCounterfactualReplay = {
  enabled: false,
  allowedDecisionNodeIds: [],
  maximumBranchesPerLearner: 1,
  learnerAvailability: "DISABLED",
  requireReflection: false,
} as const;

const publishedCoffeeOption: HostedAssignmentScenarioOptionV1 = {
  schemaVersion: "2.0.0",
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
      counterfactualDecisionTitles: {
        NODE_CERTIFICATE_DECISION:
          "Certificate decision",
      },
    },
  },
  supportedModes: [
    "tutorial",
    "standard",
    "sandbox",
    "configured",
  ],
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
    {
      mode: "sandbox",
      allowHints: true,
      allowRetry: true,
      allowBacktracking: true,
      feedbackTiming: "immediate",
      showScores: false,
      outcomeStrategy: "probabilistic",
      seedPolicy: "supplied",
      allowCommunication: false,
      allowEvidenceRequests: true,
    },
    {
      mode: "configured",
      allowHints: false,
      allowRetry: false,
      allowBacktracking: false,
      feedbackTiming: "stage-end",
      showScores: false,
      outcomeStrategy: "probabilistic",
      seedPolicy: "supplied",
      timeLimitMinutes: 30,
      allowCommunication: false,
      allowEvidenceRequests: true,
    },
  ],
  experienceConfigurations: [],
  counterfactualDecisionPoints: [
    {
      nodeId: "NODE_CERTIFICATE_DECISION",
      decisionId: "INT_CERTIFICATE_INITIAL_SUBMITTED",
      titleKey:
        "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_CERTIFICATE_DECISION.title",
      availability: "AFTER_FEEDBACK_RELEASE",
      maximumBranchesPerLearner: 3,
      reflectionRequired: true,
    },
  ],
};

function renderScreen(api: InstructorReviewApi) {
  return render(
    <LocaleProvider locale="en">
      <InstructorReviewScreen api={api} />
    </LocaleProvider>,
  );
}

describe("instructor review screen", () => {
  it("presents module-level Technical Laboratory evidence without treating timing as ability", () => {
    render(
      <LocaleProvider locale="en">
        <ClassTechnicalLabReport
          report={{
            schemaVersion: "1.0.0",
            reportType:
              "TRACECHAIN_TECHNICAL_LAB_ASSIGNMENT_REPORT",
            assignmentId: "ASSIGNMENT_LAB_001",
            labPackId:
              "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS",
            labPackVersion: "1.0.0",
            generatedAt: "2026-07-27T12:00:00.000Z",
            summary: {
              assignedLearnerCount: 1,
              runCount: 1,
              completedRunCount: 1,
              meanCompletedScore: 92,
              hintUseCount: 1,
              incorrectResponseCount: 1,
              observedVerificationFailureCount: 2,
            },
            scoreDistribution: [
              {
                minimumInclusive: 90,
                maximumInclusive: 100,
                completedRunCount: 1,
              },
            ],
            commonMisconceptions: [
              {
                itemId: "TL4_INTERPRETATION",
                selectedOptionId: "B",
                count: 1,
              },
            ],
            runs: [
              {
                schemaVersion: "1.0.0",
                runId: "RUN_LAB_001",
                learnerUserId: "USER_LEARNER_001",
                status: "completed",
                labPackId:
                  "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS",
                labPackVersion: "1.0.0",
                configurationHash: "a".repeat(64),
                currentModuleId: "TL7",
                completedModuleCount: 7,
                totalModuleCount: 7,
                score: {
                  experimentScore: 40,
                  interpretationScore: 34,
                  applicationScore: 18,
                  totalScore: 92,
                  maximumScore: 100,
                  passScore: 70,
                  passed: true,
                },
                hintUseCount: 1,
                incorrectResponseCount: 1,
                observedVerificationFailureCount: 2,
                modules: [
                  {
                    moduleId: "TL4",
                    moduleVersion: "1.0.0",
                    complete: true,
                    experimentComplete: true,
                    score: 12,
                    maximumScore: 14,
                    interpretationAttempts: 2,
                    interpretationCorrect: true,
                    applicationAttempts: 1,
                    applicationCorrect: true,
                    hintOpened: true,
                    observedVerificationFailureCount: 2,
                    elapsedSeconds: 90,
                  },
                ],
                misconceptions: [
                  {
                    itemId: "TL4_INTERPRETATION",
                    selectedOptionId: "B",
                    count: 1,
                  },
                ],
              },
            ],
          }}
        />
      </LocaleProvider>,
    );

    expect(
      screen.getByRole("heading", {
        name: "Technical Laboratory report",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("7 of 7 modules")).toBeInTheDocument();
    expect(screen.getByText("TL4_INTERPRETATION")).toBeInTheDocument();
    expect(
      screen.getByText(/not attention, motivation, or ability/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Download Technical Laboratory report",
      }),
    ).toHaveAttribute(
      "href",
      "/api/v1/assignments/ASSIGNMENT_LAB_001/technical-lab-report",
    );
  });

  it("shows the verified Moodle course context without requiring an email claim", async () => {
    const api: InstructorReviewApi = {
      createAssignment: vi.fn(),
      closeAssignment: vi.fn(),
      loadAssignmentScenarioOptions: vi.fn().mockResolvedValue([]),
      loadAssignmentLearnerOptions: vi.fn().mockResolvedValue([]),
      loadAssignmentCompetencies: vi.fn(),
      loadAssignmentCurriculumCrosswalks: vi.fn(),
      loadAssignmentDecisionOutcomes: vi.fn(),
      loadAssignmentMonitor: vi.fn(),
      loadAssignmentReport: vi.fn(),
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_LTI_001",
        displayName: "Course instructor",
        roles: ["instructor"],
        authenticationSource: "lti",
        learningContext: {
          schemaVersion: "1.0.0",
          provider: "lti-1.3",
          issuer: "https://moodle.example",
          clientId: "TRACECHAIN_CLIENT",
          deploymentId: "TRACECHAIN_DEPLOYMENT",
          contextId: "COURSE_ACCOUNTING_101",
          resourceLinkId: "RESOURCE_INSTRUCTOR",
          contextTitle: "Accounting 101",
          returnUrl:
            "https://moodle.example/course/view.php?id=42",
        },
      }),
      loadRunReplay: vi.fn(),
      loadRunReview: vi.fn(),
      logoutSession: vi.fn(),
      releaseFeedback: vi.fn(),
      saveModeration: vi.fn(),
      saveRating: vi.fn(),
    };
    renderScreen(api);

    expect(
      await screen.findByText("Course instructor"),
    ).toBeInTheDocument();
    expect(screen.getByText("Accounting 101")).toBeInTheDocument();
    expect(screen.getByText("Moodle course launch")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Return to Moodle" }),
    ).toHaveAttribute(
      "href",
      "https://moodle.example/course/view.php?id=42",
    );
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });

  it("generates an accepted assessment package through the hosted job API", async () => {
    const createScormPackageJob = vi.fn().mockResolvedValue({
      schemaVersion: "1.0.0",
      jobId: "JOB_SCORM_ASSESSMENT_001",
      presetId: "assessment",
      status: "completed",
      title: "TraceChain Assessment",
      filename: "TraceChain_Assessment_StandardCoffee_vi_v2.2.0.zip",
      sha256: "a".repeat(64),
      sizeBytes: 1234,
      release: true,
      configurationHash: "b".repeat(64),
      scenarioId: "SCN_COFFEE_001",
      scenarioVersion: "2.2.0",
      applicationBuildHash: "c".repeat(64),
      sourceCommit: "d".repeat(40),
      artifactKey: "scorm-packages/a/package.zip",
      requestedAt: "2026-07-24T08:00:00.000Z",
      completedAt: "2026-07-24T08:00:00.000Z",
      requestedByUserId: "USER_INSTRUCTOR_001",
      downloadUrl: "/api/v1/scorm-package-jobs/JOB_SCORM_ASSESSMENT_001/download",
    });
    const api: InstructorReviewApi = {
      createAssignment: vi.fn(),
      closeAssignment: vi.fn(),
      loadAssignmentScenarioOptions: vi.fn().mockResolvedValue([]),
      loadAssignmentLearnerOptions: vi.fn().mockResolvedValue([]),
      loadAssignmentCompetencies: vi.fn(),
      loadAssignmentCurriculumCrosswalks: vi.fn(),
      loadAssignmentDecisionOutcomes: vi.fn(),
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
      within(builder).getByLabelText("How much support?"),
      "CHALLENGE",
    );
    await user.selectOptions(
      within(builder).getByLabelText("How will it be used?"),
      "ASSESSMENT",
    );
    expect(
      within(builder).getByRole("heading", {
        name: "Resolved preset preview",
      }),
    ).toBeInTheDocument();
    expect(
      within(builder).getByText(
        "Vietnamese fixed assessment with no hints and feedback reserved for the final report.",
      ),
    ).toBeInTheDocument();
    await user.click(
      within(builder).getByRole("button", {
        name: "Generate package",
      }),
    );

    expect(createScormPackageJob).toHaveBeenCalledWith("assessment");
    const download = await within(builder).findByRole("link", {
      name: "Download ZIP",
    });
    expect(download).toHaveAttribute(
      "href",
      "/api/v1/scorm-package-jobs/JOB_SCORM_ASSESSMENT_001/download",
    );
    expect(within(builder).getByText("Release")).toBeInTheDocument();
  });

  it("creates one assignment from an exact pack, scenario, and learner roster", async () => {
    const availableFromLocal = "2026-08-01T09:00";
    const availableUntilLocal = "2026-08-02T17:00";
    const availableFrom = new Date(availableFromLocal).toISOString();
    const availableUntil = new Date(availableUntilLocal).toISOString();
    const assignment = {
      schemaVersion: "1.3.0" as const,
      assignmentId: "ASSIGNMENT_001",
      title: "Coffee cohort",
      packId: publishedCoffeeOption.packId,
      packVersion: publishedCoffeeOption.packVersion,
      scenarioId: publishedCoffeeOption.scenarioId,
      scenarioVersion: publishedCoffeeOption.scenarioVersion,
      mode: "sandbox" as const,
      runConfiguration:
        publishedCoffeeOption.modeConfigurations[2]!,
      counterfactualReplay: {
        enabled: true,
        allowedDecisionNodeIds: [
          "NODE_CERTIFICATE_DECISION",
        ],
        maximumBranchesPerLearner: 3,
        learnerAvailability: "AFTER_FEEDBACK_RELEASE",
        requireReflection: true,
      } as const,
      research: {
        enabled: true,
        experimentalConditionId: "CONDITION_SANDBOX",
        randomAssignmentRecordId: "RANDOMIZATION_001",
        fixedScenarioSeed: "SEED_RESEARCH_001",
        consentStatusReference: "CONSENT_RECORD_001",
        preTestLinkageId: "PRETEST_001",
        postTestLinkageId: "POSTTEST_001",
        blindedRaters: true,
        interventionVersion: "1.0.0",
        retentionPolicyReference: "RETENTION_POLICY_001",
      } as const,
      learnerUserIds: ["USER_LEARNER_001"],
      status: "active" as const,
      feedbackReleaseStatus: "withheld" as const,
      availableFrom,
      availableUntil,
      createdAt: "2026-07-24T08:00:00.000Z",
      createdByUserId: "USER_INSTRUCTOR_001",
    };
    const createAssignment = vi.fn().mockResolvedValue(assignment);
    const api: InstructorReviewApi = {
      createAssignment,
      closeAssignment: vi.fn(),
      loadAssignmentScenarioOptions: vi.fn().mockResolvedValue([
        publishedCoffeeOption,
      ]),
      loadAssignmentLearnerOptions: vi.fn().mockResolvedValue([
        {
          schemaVersion: "1.0.0",
          userId: "USER_LEARNER_001",
          email: "learner@example.edu",
        },
      ]),
      loadAssignmentCompetencies: vi.fn(),
      loadAssignmentCurriculumCrosswalks: vi.fn(),
      loadAssignmentDecisionOutcomes: vi.fn(),
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
    await user.type(
      form.getByLabelText("Available from (optional)"),
      availableFromLocal,
    );
    await user.type(
      form.getByLabelText("Available until (optional)"),
      availableUntilLocal,
    );
    const scenarioSelect = await form.findByLabelText(
      "Published scenario",
    );
    expect(scenarioSelect).toHaveValue(
      [
        assignment.packId,
        assignment.packVersion,
        assignment.scenarioId,
        assignment.scenarioVersion,
      ].join("::"),
    );
    expect(
      within(scenarioSelect).getAllByRole("option"),
    ).toHaveLength(1);
    expect(form.queryByLabelText("Pack ID")).not.toBeInTheDocument();
    expect(form.queryByLabelText("Scenario ID")).not.toBeInTheDocument();
    expect(
      form.queryByLabelText("Learner user IDs"),
    ).not.toBeInTheDocument();
    const publishedSettings = form.getByLabelText(
      "Published mode settings",
    );
    expect(
      within(publishedSettings).getByText("30 minutes"),
    ).toBeInTheDocument();
    expect(
      within(publishedSettings).getAllByText("Disabled"),
    ).toHaveLength(5);
    await user.selectOptions(form.getByLabelText("Run mode"), "tutorial");
    expect(
      within(publishedSettings).getByText("45 minutes"),
    ).toBeInTheDocument();
    expect(
      within(publishedSettings).getAllByText("Enabled"),
    ).toHaveLength(5);
    await user.selectOptions(form.getByLabelText("Run mode"), "sandbox");
    await user.click(
      form.getByRole("checkbox", {
        name: "Allow counterfactual decision exploration for this assignment",
      }),
    );
    expect(
      form.getByRole("checkbox", {
        name: "Certificate decision",
      }),
    ).toBeChecked();
    await user.selectOptions(
      form.getByLabelText("Learner access"),
      "AFTER_FEEDBACK_RELEASE",
    );
    const maximumBranches = form.getByLabelText(
      "Maximum branches per learner and decision",
    );
    await user.clear(maximumBranches);
    await user.type(maximumBranches, "21");
    expect(
      form.getByRole("button", { name: "Create assignment" }),
    ).toBeDisabled();
    await user.clear(maximumBranches);
    await user.type(maximumBranches, "3");
    await user.click(
      form.getByRole("checkbox", {
        name: "Record this assignment as a controlled research condition",
      }),
    );
    await user.type(
      form.getByLabelText("Experimental condition ID"),
      assignment.research.experimentalConditionId,
    );
    await user.type(
      form.getByLabelText("Random-assignment record ID"),
      assignment.research.randomAssignmentRecordId,
    );
    await user.type(
      form.getByLabelText("Fixed scenario seed"),
      assignment.research.fixedScenarioSeed,
    );
    await user.type(
      form.getByLabelText("Consent-status reference"),
      assignment.research.consentStatusReference,
    );
    await user.type(
      form.getByLabelText("Pre-test linkage ID (optional)"),
      assignment.research.preTestLinkageId,
    );
    await user.type(
      form.getByLabelText("Post-test linkage ID (optional)"),
      assignment.research.postTestLinkageId,
    );
    await user.type(
      form.getByLabelText("Retention-policy reference"),
      assignment.research.retentionPolicyReference,
    );
    await user.click(
      form.getByRole("checkbox", {
        name: "Mark exported ratings for blinded-rater handling",
      }),
    );
    await user.click(
      form.getByRole("checkbox", {
        name: "learner@example.edu (USER_LEARNER_001)",
      }),
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
      mode: "sandbox",
      counterfactualReplay:
        assignment.counterfactualReplay,
      research: assignment.research,
      learnerUserIds: assignment.learnerUserIds,
      availableFrom,
      availableUntil,
    });
    expect(
      await form.findByText("Assignment ASSIGNMENT_001 was created."),
    ).toBeInTheDocument();
    expect(
      form.getAllByLabelText("Published mode settings"),
    ).toHaveLength(2);
  });

  it("manages access and offers stable downloads after loading an assignment report", async () => {
    const assignment = {
      schemaVersion: "1.3.0" as const,
      assignmentId: "ASSIGNMENT_EXPORT_001",
      title: "Coffee export cohort",
      packId: "PACK_STANDARD_COFFEE_STAGE3",
      packVersion: "1.4.0",
      scenarioId: "SCN_COFFEE_001",
      scenarioVersion: "2.2.0",
      mode: "standard" as const,
      counterfactualReplay: {
        enabled: true,
        allowedDecisionNodeIds: [
          "NODE_CERTIFICATE_DECISION",
        ],
        maximumBranchesPerLearner: 1,
        learnerAvailability: "DISABLED",
        requireReflection: true,
      } as const,
      research: { enabled: false } as const,
      learnerUserIds: ["USER_LEARNER_001"],
      status: "active" as const,
      feedbackReleaseStatus: "withheld" as const,
      createdAt: "2026-07-24T08:00:00.000Z",
      createdByUserId: "USER_INSTRUCTOR_001",
    };
    const loadRunReview = vi.fn().mockResolvedValue({
      assignment,
      timeline: [
        {
          sequenceNumber: 2,
          eventId: "HEVT_EXPORT_002",
          eventType: "COMPETENCY_EVIDENCE_RECORDED",
          occurredAt: "2026-07-24T08:04:00.000Z",
          authenticatedUserId: "USER_LEARNER_001",
          simulationActorId: "ACT_LOGISTICS_COORDINATOR",
          organizationId: "ORG_LOGISTICS_PROVIDER",
          roleId: "LOGISTICS_COORDINATOR",
          causationId: "COMMAND_EXPORT_002",
          payload: {},
        },
      ],
      competencies: [],
      rubricEvidence: [],
      ratings: [],
      moderationResolutions: [],
    });
    const closeAssignment = vi.fn().mockResolvedValue({
      ...assignment,
      status: "closed" as const,
      closedAt: "2026-07-24T08:06:00.000Z",
      closedByUserId: "USER_INSTRUCTOR_001",
    });
    const api: InstructorReviewApi = {
      createAssignment: vi.fn(),
      closeAssignment,
      loadAssignmentScenarioOptions: vi.fn().mockResolvedValue([]),
      loadAssignmentLearnerOptions: vi.fn().mockResolvedValue([]),
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
      loadAssignmentCurriculumCrosswalks: vi.fn().mockResolvedValue({
        schemaVersion: "2.0.0",
        interpretation:
          "EVIDENCE_CROSSWALK_NO_ATTAINMENT_INFERENCE",
        assignmentId: "ASSIGNMENT_EXPORT_001",
        packId: "PACK_PHARMACEUTICAL_COLD_CHAIN_STARTER",
        packVersion: "1.4.0",
        scenarioId: "SCN_PHARMA_COLD_CHAIN_TRANSFER",
        scenarioVersion: "1.1.0",
        competencyFrameworks: [
          {
            frameworkId: "TRACECHAIN_CORE",
            frameworkVersion: "1.0.0",
          },
        ],
        competencyIndicators: [
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
          },
        ],
        overlays: [
          {
            overlayId: "OVERLAY_PHARMA_PILOT_COURSE",
            overlayVersion: "1.0.0",
            status: "ADOPTED",
            owner: {
              ownerId: "TRACECHAIN_DEMO_COURSE",
              ownerType: "COURSE",
              displayName: {
                valuesByLocale: {
                  en: "TraceChain demonstration course",
                  vi: "Học phần minh họa TraceChain",
                },
              },
            },
            educationalDemoOnly: true,
            effectiveFrom: "2026-07-26",
            adoptedAt: "2026-07-26T00:00:00.000Z",
            adoptedBy: "TRACECHAIN_DEMO_PRODUCT_OWNER",
            traceChainFrameworks: [
              {
                frameworkId: "TRACECHAIN_CORE",
                frameworkVersion: "1.0.0",
              },
            ],
            externalFrameworkId:
              "PHARMA_PILOT_COURSE_OUTCOMES",
            externalFrameworkVersion: "1.0.0",
            labelsByLocale: {
              en: {
                title:
                  "Pharmaceutical cold-chain course-outcome overlay",
                ownerDisplayName:
                  "TraceChain demonstration course",
                externalFrameworkTitle:
                  "Pilot pharmaceutical course outcomes",
                outcomeTitles: {
                  CLO_EVIDENCE_EVALUATION:
                    "Evaluate evidence integrity and physical-condition evidence",
                },
              },
              vi: {
                title:
                  "Bảng đối chiếu chuẩn đầu ra học phần cho chuỗi lạnh dược phẩm",
                ownerDisplayName:
                  "Học phần minh họa TraceChain",
                externalFrameworkTitle:
                  "Chuẩn đầu ra học phần dược phẩm thí điểm",
                outcomeTitles: {
                  CLO_EVIDENCE_EVALUATION:
                    "Đánh giá tính toàn vẹn và bằng chứng điều kiện thực tế",
                },
              },
            },
            learners: [
              {
                learnerUserId: "USER_LEARNER_001",
                outcomes: [
                  {
                    outcomeId: "CLO_EVIDENCE_EVALUATION",
                    mappedIndicatorIds: ["BC3.PI1"],
                    evidenceObservationCount: 2,
                    currentRatingCount: 1,
                    evidenceObservations: [],
                    currentRatings: [],
                  },
                ],
              },
            ],
            classOutcomes: [
              {
                outcomeId: "CLO_EVIDENCE_EVALUATION",
                outcomeType: "COURSE_LEARNING_OUTCOME",
                mappedIndicatorIds: ["BC3.PI1"],
                primaryIndicatorIds: ["BC3.PI1"],
                supportingIndicatorIds: [],
                contextualIndicatorIds: [],
                targetTypes: ["primary"],
                assignedLearnerCount: 1,
                learnersWithEvidence: 1,
                evidenceObservationCount: 2,
                currentRatingCount: 1,
              },
            ],
          },
        ],
      }),
      loadAssignmentDecisionOutcomes: vi.fn().mockResolvedValue({
        schemaVersion: "1.0.0",
        interpretation:
          "DECISION_PROCESS_SEPARATE_FROM_REALIZED_OUTCOME",
        assignmentId: "ASSIGNMENT_EXPORT_001",
        packId: "PACK_STANDARD_COFFEE_STAGE3",
        packVersion: "1.4.0",
        scenarioId: "SCN_COFFEE_001",
        scenarioVersion: "2.2.0",
        runs: [
          {
            runId: "RUN_EXPORT_001",
            learnerUserId: "USER_LEARNER_001",
            status: "active",
            decisionItems: [],
            realizedOutcome: null,
          },
        ],
      }),
      loadAssignmentProcessAnalytics: vi.fn().mockResolvedValue({
        schemaVersion: "1.2.0",
        reportType:
          "TRACECHAIN_ASSIGNMENT_PROCESS_ANALYTICS",
        interpretation:
          "DESCRIPTIVE_EVENT_LINKED_NO_LEARNER_TRAIT_INFERENCE",
        ruleVersion:
          "TRACECHAIN_PROCESS_ANALYTICS_V1@1.2.0",
        assignmentId: "ASSIGNMENT_EXPORT_001",
        packId: "PACK_STANDARD_COFFEE_STAGE3",
        packVersion: "1.4.0",
        scenarioId: "SCN_COFFEE_001",
        scenarioVersion: "2.2.0",
        generatedAt: "2026-07-24T08:05:00.000Z",
        runs: [
          {
            runId: "RUN_EXPORT_001",
            learnerUserId: "USER_LEARNER_001",
            evidenceRequestOrder: [
              {
                eventId: "HEVT_EXPORT_003",
                sequenceNumber: 3,
                recordedAt: "2026-07-24T08:04:30.000Z",
                itemId: "EVID_STABILITY_ASSESSMENT",
                simulatedAvailableAt:
                  "2026-07-24T08:49:30.000Z",
                delayMinutes: 45,
                costUnits: 2,
              },
            ],
            evidenceInspectionOrder: [
              {
                eventId: "HEVT_EXPORT_002",
                sequenceNumber: 2,
                recordedAt: "2026-07-24T08:04:00.000Z",
                itemId: "EVID_CERTIFICATE_RECORD",
              },
            ],
            policyConsultationOrder: [],
            decisions: [],
            rejectedAttemptEventIds: [],
            mitigationEventIds: [],
            reflectionEventIds: [],
            professionalConsequences: {},
          },
        ],
        summary: {
          runCount: 1,
          evidenceRequestCounts: {
            EVID_STABILITY_ASSESSMENT: 1,
          },
          evidenceInspectionCounts: {
            EVID_CERTIFICATE_RECORD: 1,
          },
          evidenceCitationCounts: {},
          policyConsultationCounts: {},
          policyCitationCounts: {
            POLICY_RELEASE: 1,
          },
          decisionSubmissionCounts: {},
          rejectedAttemptCount: 1,
          mitigationCount: 1,
          authoredRequestDelayMinutesTotal: 45,
          authoredRequestCostUnitsTotal: 2,
        },
        limitations: [
          "ELAPSED_INTERVAL_IS_NOT_ATTENTION",
          "NO_MOTIVATION_OR_ABILITY_INFERENCE",
          "NO_AUTOMATED_HIGH_STAKES_DECISION",
        ],
      }),
      loadAssignmentEvidenceCatalog: vi.fn().mockResolvedValue({
        schemaVersion: "1.0.0",
        assignmentId: "ASSIGNMENT_EXPORT_001",
        packId: "PACK_STANDARD_COFFEE_STAGE3",
        packVersion: "1.4.0",
        scenarioId: "SCN_COFFEE_001",
        scenarioVersion: "2.2.0",
        evidenceDefinitions: [
          {
            evidenceId: "EVID_CERTIFICATE_RECORD",
            evidenceType: "DOCUMENT_REFERENCE",
            title: {
              localizationKey: "unused.evidence.title",
              valuesByLocale: {
                en: "Certificate record",
                vi: "Hồ sơ chứng nhận",
              },
            },
            sourceOrganizationId:
              "ORG_CERTIFICATION_BODY",
            visibleToRoleIds: [
              "LOGISTICS_COORDINATOR",
            ],
            learnerMetadata: {
              signatureStatus: "VALID",
              ledgerStatus: "HASH_ANCHORED",
              completeness: "COMPLETE",
              access: {
                classification: "ROLE_RESTRICTED",
                acquisitionMode: "AVAILABLE",
                delayMinutes: 0,
                costUnits: 0,
              },
            },
            assessmentMetadata: {
              reliability: "RELIABLE",
              contentStatus: "ACCURATE",
              limitationCodes: [
                "HASH_DOES_NOT_PROVE_SOURCE_TRUTH",
              ],
              hiddenConditionReferences: [],
            },
          },
        ],
      }),
      loadAssignmentAuditReport: vi.fn().mockResolvedValue({
        schemaVersion: "1.0.0",
        reportType: "TRACECHAIN_AUDIT_ASSIGNMENT_REPORT",
        assignmentId: "ASSIGNMENT_EXPORT_001",
        packId: "PACK_COFFEE_AUDIT_CHALLENGE",
        packVersion: "1.0.0",
        scenarioId: "SCN_COFFEE_AUDIT_CHALLENGE_A",
        scenarioVersion: "1.0.0",
        reviewOnly: true,
        officialScoresUnchanged: true,
        summary: {
          runCount: 1,
          completedRunCount: 1,
          meanCompletedScore: 80,
          confirmedFindingCount: 1,
          unsupportedFindingCount: 0,
          missedFindingCount: 1,
        },
        runs: [
          {
            runId: "RUN_EXPORT_001",
            learnerUserId: "USER_LEARNER_001",
            auditCaseId: "AUDIT_COFFEE_CHALLENGE_A",
            auditCaseVersion: "1.0.0",
            sourceStateHash: "a".repeat(64),
            status: "completed",
            elapsedSeconds: 1_800,
            score: 80,
            maximumScore: 100,
            passed: true,
            confirmedFindingCount: 1,
            unsupportedFindingCount: 0,
            missedFindingCount: 1,
            evidenceCitationCount: 1,
            policyCitationCount: 1,
            variant: {
              variantId: "AUDIT_CHALLENGE_A",
              variantVersion: "1.0.0",
              variantContentHash: "b".repeat(64),
              caseReference: "AC-01",
            },
            findings: [
              {
                findingId: "FINDING_001",
                revision: 1,
                title: "Expired certificate accepted",
                severity: "HIGH",
                materiality: "MATERIAL",
                evidenceIds: ["EVID_CERTIFICATE"],
                policyIds: ["POLICY_CERTIFICATE"],
                classification: "CONFIRMED",
                eventId: "HEVT_EXPORT_002",
                sequenceNumber: 2,
                eventType: "AUDIT_FINDING_SUBMITTED",
              },
            ],
          },
        ],
        variantDistribution: [
          {
            variantId: "AUDIT_CHALLENGE_A",
            variantVersion: "1.0.0",
            caseReference: "AC-01",
            runCount: 1,
            completedRunCount: 1,
          },
        ],
        calibration: null,
      }),
      loadAssignmentReport: vi.fn().mockResolvedValue({
        schemaVersion: "1.3.0",
        assignment,
        learners: [
          {
            learnerUserId: "USER_LEARNER_001",
            runs: [
              {
                runId: "RUN_EXPORT_001",
                learnerUserId: "USER_LEARNER_001",
                status: "active",
                eventCount: 4,
                startedAt: "2026-07-24T08:00:00.000Z",
                lastActivityAt: "2026-07-24T08:04:00.000Z",
                completedAt: null,
                elapsedSeconds: 240,
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
      loadRunReview,
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
      api.loadAssignmentCurriculumCrosswalks,
    ).toHaveBeenCalledWith("ASSIGNMENT_EXPORT_001");
    expect(
      await report.findByRole("heading", {
        name: "Live learner status",
      }),
    ).toBeInTheDocument();
    expect(
      report.getByText(
        "Active — new attempts follow the assignment availability window.",
      ),
    ).toBeInTheDocument();
    expect(
      report.getByRole("link", {
        name: "Open stable learner link",
      }),
    ).toHaveAttribute(
      "href",
      "/learner?assignmentId=ASSIGNMENT_EXPORT_001",
    );
    await user.click(
      report.getByRole("button", { name: "Close new attempts" }),
    );
    expect(closeAssignment).toHaveBeenCalledWith(
      "ASSIGNMENT_EXPORT_001",
    );
    expect(
      await report.findByText("Closed — no new attempts may start."),
    ).toBeInTheDocument();
    expect(
      report.getByText(
        "Closed at 2026-07-24T08:06:00.000Z by USER_INSTRUCTOR_001. Existing runs and evidence are unchanged.",
      ),
    ).toBeInTheDocument();
    expect(report.getByText("certificate-transaction")).toBeInTheDocument();
    expect(
      report.getByText("SUBMIT_CERTIFICATE_TRANSACTION"),
    ).toBeInTheDocument();
    expect(report.getByText("No issue detected")).toBeInTheDocument();
    await user.click(
      report.getByText("View activity", { selector: "summary" }),
    );
    expect(
      report.getAllByText("Evidence inspections")[0],
    ).toBeVisible();
    expect(
      report.getAllByText("Rejected attempts")[0],
    ).toBeVisible();
    expect(
      report.getAllByText("Evidence requests")[0],
    ).toBeVisible();
    await user.click(
      report.getByText("View class observation counts", {
        selector: "summary",
      }),
    );
    expect(
      report.getByText("Policy citations"),
    ).toBeVisible();
    expect(report.getByText("POLICY_RELEASE")).toBeVisible();
    expect(report.getByText("45 simulated minutes")).toBeVisible();
    expect(
      report.getByText("Authored request cost units"),
    ).toBeVisible();
    expect(
      report.getByRole("heading", {
        name: "Common rejection findings",
      }),
    ).toBeInTheDocument();
    expect(
      report.getByText("RULE_ORGANIZATION_NOT_AUTHORIZED"),
    ).toBeInTheDocument();
    expect(
      report.getByRole("heading", {
        name: "Decision and outcome evidence",
      }),
    ).toBeInTheDocument();
    expect(
      report.getByRole("heading", {
        name: "Decision-process observations",
      }),
    ).toBeInTheDocument();
    expect(
      report.getByRole("heading", {
        name: "Evidence interpretation contract",
      }),
    ).toBeInTheDocument();
    expect(report.getByText("Certificate record")).toBeInTheDocument();
    expect(
      report.getByText("HASH_DOES_NOT_PROVE_SOURCE_TRUTH"),
    ).toBeInTheDocument();
    expect(
      report.getByRole("heading", {
        name: "Class Audit report",
      }),
    ).toBeInTheDocument();
    expect(
      report.getByRole("button", {
        name: "Review source event for finding FINDING_001",
      }),
    ).toBeInTheDocument();
    expect(
      report.getByRole("heading", {
        name: "Variant distribution",
      }),
    ).toBeInTheDocument();
    expect(
      report.getByText(
        "Elapsed intervals show time between recorded submissions, not attention. Do not infer motivation or ability, and do not use this report for automated high-stakes decisions.",
      ),
    ).toBeInTheDocument();
    await user.click(
      report.getByText(/Run RUN_EXPORT_001, learner USER_LEARNER_001/),
    );
    expect(
      report.getByRole("button", { name: "Review event 2" }),
    ).toBeInTheDocument();
    expect(
      report.getAllByText("Available after run completion"),
    ).toHaveLength(3);
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
      report.getByRole("link", {
        name: "Download pseudonymous JSON",
      }),
    ).toHaveAttribute(
      "href",
      "/api/v1/assignments/ASSIGNMENT_EXPORT_001/export.json?identity=pseudonymous",
    );
    expect(
      report.getByRole("link", {
        name: "Download pseudonymous CSV",
      }),
    ).toHaveAttribute(
      "href",
      "/api/v1/assignments/ASSIGNMENT_EXPORT_001/export.csv?identity=pseudonymous",
    );
    expect(
      report.getByRole("link", {
        name: "Download counterfactual report JSON",
      }),
    ).toHaveAttribute(
      "href",
      "/api/v1/assignments/ASSIGNMENT_EXPORT_001/counterfactual-report",
    );
    expect(
      report.getByText(
        "Pseudonymous downloads replace learner user IDs with assignment-scoped codes. They are not anonymized records.",
      ),
    ).toBeInTheDocument();
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
    expect(within(competencyRow).getByText("Level 3: 1")).toBeInTheDocument();
    expect(
      report.getByRole("heading", {
        name: "Learner competency profiles",
      }),
    ).toBeInTheDocument();
    expect(
      report.getByRole("heading", {
        name: "Curriculum outcome evidence",
      }),
    ).toBeInTheDocument();
    expect(
      report.getByText(
        "Adopted course and program overlays project recorded evidence onto versioned external outcomes. They do not calculate attainment, mastery, or another grade.",
      ),
    ).toBeInTheDocument();
    expect(
      report.getByText(
        "Pharmaceutical cold-chain course-outcome overlay",
      ),
    ).toBeInTheDocument();
    expect(
      report.getByText(
        "Pilot pharmaceutical course outcomes (overlay 1.0.0; framework 1.0.0)",
      ),
    ).toBeInTheDocument();
    expect(
      report.getByText(
        "Owned and adopted by TraceChain demonstration course (COURSE)",
      ),
    ).toBeInTheDocument();
    const curriculumOutcome = report
      .getByText("CLO_EVIDENCE_EVALUATION")
      .closest("tr");
    if (curriculumOutcome === null) {
      throw new Error("Expected curriculum outcome row.");
    }
    expect(
      within(curriculumOutcome).getByText("BC3.PI1"),
    ).toBeInTheDocument();
    expect(
      report.getByRole("link", {
        name: "Download curriculum evidence JSON",
      }),
    ).toHaveAttribute(
      "href",
      "/api/v1/assignments/ASSIGNMENT_EXPORT_001/curriculum-crosswalks.json",
    );
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
    await user.click(
      within(learnerProfile).getByRole("button", {
        name: "Review supporting event HEVT_EXPORT_002",
      }),
    );
    expect(loadRunReview).toHaveBeenCalledWith("RUN_EXPORT_001");
    expect(
      await screen.findByRole("heading", { name: "Run summary" }),
    ).toBeInTheDocument();
    const targetedEvent = document.querySelector(
      'tr[aria-current="true"]',
    );
    expect(targetedEvent).not.toBeNull();
    expect(targetedEvent).toHaveTextContent("HEVT_EXPORT_002");
    expect(targetedEvent).toHaveFocus();
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
            value: {
              evidenceType: "certificate",
              inspected: true,
            },
          },
          {
            recordId: "EVID_SHIPPING_RECORD",
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
          currentNodeId: "certificate-transaction",
          completedNodeIds: ["certificate-decision"],
          permittedActionIds: ["SUBMIT_CERTIFICATE_TRANSACTION"],
        },
      },
    });
    const api: InstructorReviewApi = {
      createAssignment: vi.fn(),
      closeAssignment: vi.fn(),
      loadAssignmentScenarioOptions: vi.fn().mockResolvedValue([]),
      loadAssignmentLearnerOptions: vi.fn().mockResolvedValue([]),
      loadAssignmentCompetencies: vi.fn(),
      loadAssignmentCurriculumCrosswalks: vi.fn(),
      loadAssignmentDecisionOutcomes: vi.fn(),
      loadAssignmentMonitor: vi.fn(),
      loadAssignmentReport: vi.fn(),
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_INSTRUCTOR_001",
        email: "instructor@example.edu",
        roles: ["instructor"],
      }),
      loadRunReview: vi.fn().mockResolvedValue({
        assignment: {
          schemaVersion: "1.1.0",
          assignmentId: "ASSIGNMENT_001",
          title: "Coffee cohort",
          packId: "PACK_STANDARD_COFFEE_STAGE3",
          packVersion: "1.4.0",
          scenarioId: "SCN_COFFEE_001",
          scenarioVersion: "2.2.0",
          mode: "standard",
          counterfactualReplay:
            disabledCounterfactualReplay,
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
            payload: {
              decision: {
                certificateAssessment: "VALID",
                issuerAssessment: "RECOGNIZED_UNAUTHORIZED",
              },
              justification:
                "The signer is recognized but cannot issue this certificate.",
              citedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
              citedPolicyIds: ["AUTH_ISSUE_CERTIFICATE"],
              confidenceRating: 4,
              adverseEventProbabilityPercent: 35,
            },
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
    expect(
      screen.getByRole("heading", {
        name: "Selected event response",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /The signer is recognized but cannot issue this certificate\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/"confidenceRating": 4/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/"EVID_CERTIFICATE_RECORD"/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Evidence available at this point",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("EVID_CERTIFICATE_RECORD")).toBeInTheDocument();
    const citedEvidence = screen
      .getByText("EVID_CERTIFICATE_RECORD")
      .closest("summary");
    const uncitedEvidence = screen
      .getByText("EVID_SHIPPING_RECORD")
      .closest("summary");
    if (citedEvidence === null || uncitedEvidence === null) {
      throw new Error("Expected replay evidence summaries.");
    }
    expect(citedEvidence).toHaveTextContent("Cited");
    expect(uncitedEvidence).toHaveTextContent("Available, not cited");
    expect(
      screen.getByRole("heading", {
        name: "Policies available at this point",
      }),
    ).toBeInTheDocument();
    const citedPolicy = screen
      .getByText("AUTH_ISSUE_CERTIFICATE")
      .closest("summary");
    if (citedPolicy === null) {
      throw new Error("Expected replay policy summary.");
    }
    expect(citedPolicy).toHaveTextContent("Cited");

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
      closeAssignment: vi.fn(),
      loadAssignmentScenarioOptions: vi.fn().mockResolvedValue([]),
      loadAssignmentLearnerOptions: vi.fn().mockResolvedValue([]),
      loadAssignmentCompetencies: vi.fn(),
      loadAssignmentCurriculumCrosswalks: vi.fn(),
      loadAssignmentDecisionOutcomes: vi.fn(),
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
          schemaVersion: "1.1.0",
          assignmentId: "ASSIGNMENT_001",
          title: "Coffee cohort",
          packId: "PACK_STANDARD_COFFEE_STAGE3",
          packVersion: "1.4.0",
          scenarioId: "SCN_COFFEE_001",
          scenarioVersion: "2.2.0",
          mode: "standard",
          counterfactualReplay:
            disabledCounterfactualReplay,
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
      closeAssignment: vi.fn(),
      loadAssignmentScenarioOptions: vi.fn().mockResolvedValue([]),
      loadAssignmentLearnerOptions: vi.fn().mockResolvedValue([]),
      loadAssignmentCompetencies: vi.fn(),
      loadAssignmentCurriculumCrosswalks: vi.fn(),
      loadAssignmentDecisionOutcomes: vi.fn(),
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
          : path === "/api/v1/assignment-options"
            ? {
                options: [publishedCoffeeOption],
              }
          : path === "/api/v1/assignment-learners"
            ? {
                learners: [
                  {
                    schemaVersion: "1.0.0",
                    userId: "USER_LEARNER_001",
                    email: "learner@example.edu",
                  },
                ],
              }
          : path.endsWith("/timeline")
            ? { timeline: [] }
          : path.endsWith("/monitor")
              ? { monitor: { schemaVersion: "1.0.0" } }
            : path.endsWith("/audit-report")
              ? { auditReport: null }
            : path.endsWith("/technical-lab-report")
              ? { technicalLabReport: null }
            : path.endsWith("/curriculum-crosswalks")
              ? {
                  curriculumCrosswalks: {
                    schemaVersion: "2.0.0",
                    overlays: [],
                  },
                }
            : path.endsWith("/process-analytics")
              ? {
                  analytics: {
                    schemaVersion: "1.0.0",
                    reportType:
                      "TRACECHAIN_ASSIGNMENT_PROCESS_ANALYTICS",
                    runs: [],
                  },
                }
            : path.includes("/replay?sequence=")
              ? { replay: { throughSequenceNumber: 2 } }
            : path.endsWith("/competencies")
              ? { competencies: [] }
              : path.endsWith("/rubric-evidence")
                ? { rubricEvidence: [] }
                : {
                    assignment: {
                      schemaVersion: "1.1.0",
                      assignmentId: "ASSIGNMENT_001",
                      title: "Coffee cohort",
                      packId: "PACK_STANDARD_COFFEE_STAGE3",
                      packVersion: "1.4.0",
                      scenarioId: "SCN_COFFEE_001",
                      scenarioVersion: "2.2.0",
                      mode: "standard",
                      counterfactualReplay:
                        disabledCounterfactualReplay,
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
    expect(await api.loadAssignmentScenarioOptions()).toEqual([
      publishedCoffeeOption,
    ]);
    expect(await api.loadAssignmentLearnerOptions()).toEqual([
      {
        schemaVersion: "1.0.0",
        userId: "USER_LEARNER_001",
        email: "learner@example.edu",
      },
    ]);
    await api.closeAssignment("ASSIGNMENT / 001");
    await api.loadRunReview("RUN / 001");
    await api.loadRunReplay("RUN / 001", 2);
    await api.loadAssignmentMonitor("ASSIGNMENT / 001");
    await api.loadAssignmentCurriculumCrosswalks(
      "ASSIGNMENT / 001",
    );
    await api.loadAssignmentProcessAnalytics?.(
      "ASSIGNMENT / 001",
    );
    await api.loadAssignmentAuditReport?.(
      "ASSIGNMENT / 001",
    );
    await api.loadAssignmentTechnicalLabReport?.(
      "ASSIGNMENT / 001",
    );

    expect(requestedPaths).toEqual([
      "/api/v1/session",
      "/api/v1/assignment-options",
      "/api/v1/assignment-learners",
      "/api/v1/assignments/ASSIGNMENT%20%2F%20001/close",
      "/api/v1/runs/RUN%20%2F%20001/timeline",
      "/api/v1/runs/RUN%20%2F%20001/competencies",
      "/api/v1/runs/RUN%20%2F%20001/rubric-evidence",
      "/api/v1/runs/RUN%20%2F%20001/ratings",
      "/api/v1/runs/RUN%20%2F%20001/instructor-incidents",
      "/api/v1/runs/RUN%20%2F%20001/replay?sequence=2",
      "/api/v1/assignments/ASSIGNMENT%20%2F%20001/monitor",
      "/api/v1/assignments/ASSIGNMENT%20%2F%20001/curriculum-crosswalks",
      "/api/v1/assignments/ASSIGNMENT%20%2F%20001/process-analytics",
      "/api/v1/assignments/ASSIGNMENT%20%2F%20001/audit-report",
      "/api/v1/assignments/ASSIGNMENT%20%2F%20001/technical-lab-report",
    ]);
  });
});
