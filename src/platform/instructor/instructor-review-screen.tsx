import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import { StatusPill } from "../../components/status-pill";
import type { Translator } from "../../localization/i18n";
import {
  SCORM_PACKAGE_PRESET_PREVIEWS,
  scormPackagePresetPreview,
  type ScormPackagePresetPreview,
} from "../../config/scorm-package-builder";
import type {
  ActivityType,
  DeliveryPurpose,
  OutcomeStrategy,
  SupportProfile,
} from "../../config/types";
import type { ApplicationRole } from "../contracts/run-events";
import type { LtiLearningContextV1 } from "../contracts/lti";
import type {
  AssignmentRunMode,
  AssignmentCounterfactualConfigurationV1,
  CreateHostedAssignmentRequest,
  HostedAssignmentLearnerOptionV1,
  HostedAssignmentMonitorV1,
  HostedAssignmentReportV1,
  HostedAssignmentScenarioOptionV1,
  HostedAssignmentV1,
  ManualRubricRatingV1,
  RubricModerationResolutionV1,
} from "../contracts/assessment";
import type {
  HostedAssignmentCompetencyReportV1,
} from "../contracts/competency-report";
import type {
  AssignmentCurriculumOverlayReportV2,
  AssignmentCurriculumOverlayV2,
} from "../contracts/curriculum-crosswalk";
import type {
  HostedAssignmentDecisionOutcomeReportV1,
} from "../contracts/decision-outcome-report";
import type {
  AssignmentProcessAnalyticsV1,
} from "../contracts/process-analytics";
import type { InstructorRunReplayV1 } from "../contracts/run-replay";
import { HostedStaffIdentity } from "../components/hosted-staff-identity";
import type {
  InstructorIncidentControlV1,
} from "../contracts/simulation-director";
import type {
  ScormPackageJobV1,
  ScormPackagePresetId,
} from "../contracts/scorm-package-job";
import type { HostedRunModeConfigurationV1 } from "../contracts/scenario-pack";
import type {
  CompetencyEvidenceProjection,
  InstructorTimelineItem,
  RubricEvidenceProjection,
} from "../hosted/stage3-types";
import {
  createCounterfactualExplorerApi,
  type CounterfactualExplorerApi,
} from "../counterfactual/counterfactual-api";
import { CounterfactualExplorer } from "../counterfactual/counterfactual-explorer";
import { HostedRunActionControls } from "../learner/hosted-learner-screen";
import { HostedAuditReport } from "../audit/hosted-audit-workspace";
import type { AuditAssignmentReportV1 } from "../reporting/audit-assignment-report";

export interface InstructorSession {
  readonly userId: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly roles: readonly ApplicationRole[];
  readonly authenticationSource?: "sites" | "lti";
  readonly learningContext?: LtiLearningContextV1;
}

export interface InstructorRunReview {
  readonly assignment: HostedAssignmentV1;
  readonly timeline: readonly InstructorTimelineItem[];
  readonly competencies: readonly CompetencyEvidenceProjection[];
  readonly rubricEvidence: readonly RubricEvidenceProjection[];
  readonly ratings: readonly ManualRubricRatingV1[];
  readonly moderationResolutions:
    readonly RubricModerationResolutionV1[];
  readonly instructorIncidents: InstructorIncidentControlV1;
}

export type CreateInstructorAssignmentInput = Omit<
  CreateHostedAssignmentRequest,
  | "commandId"
  | "runConfiguration"
  | "experienceConfiguration"
  | "experienceConfigurationHash"
>;

export interface SaveInstructorRatingInput {
  readonly rubricId: string;
  readonly criterionId: string;
  readonly levelValue: number;
  readonly comment: string;
  readonly linkedEvidenceIds: readonly string[];
  readonly expectedRevision: number;
}

export interface SaveInstructorModerationInput {
  readonly rubricId: string;
  readonly criterionId: string;
  readonly levelValue: number;
  readonly comment: string;
  readonly sourceRatingIds: readonly string[];
  readonly expectedRevision: number;
}

export interface InstructorReviewApi {
  loadSession(): Promise<InstructorSession>;
  logoutSession?(): Promise<void>;
  loadAssignmentScenarioOptions(): Promise<
    readonly HostedAssignmentScenarioOptionV1[]
  >;
  loadAssignmentLearnerOptions(): Promise<
    readonly HostedAssignmentLearnerOptionV1[]
  >;
  loadRunReview(runId: string): Promise<InstructorRunReview>;
  loadRunReplay(
    runId: string,
    throughSequenceNumber: number,
  ): Promise<InstructorRunReplayV1>;
  releaseInstructorIncident?(
    runId: string,
    expectedRunVersion: number,
    incidentId: string,
  ): Promise<void>;
  createAssignment(
    input: CreateInstructorAssignmentInput,
  ): Promise<HostedAssignmentV1>;
  loadAssignmentReport(
    assignmentId: string,
  ): Promise<HostedAssignmentReportV1>;
  loadAssignmentMonitor(
    assignmentId: string,
  ): Promise<HostedAssignmentMonitorV1>;
  loadAssignmentCompetencies(
    assignmentId: string,
  ): Promise<HostedAssignmentCompetencyReportV1>;
  loadAssignmentCurriculumCrosswalks(
    assignmentId: string,
  ): Promise<AssignmentCurriculumOverlayReportV2>;
  loadAssignmentDecisionOutcomes(
    assignmentId: string,
  ): Promise<HostedAssignmentDecisionOutcomeReportV1>;
  loadAssignmentProcessAnalytics?(
    assignmentId: string,
  ): Promise<AssignmentProcessAnalyticsV1>;
  loadAssignmentAuditReport?(
    assignmentId: string,
  ): Promise<AuditAssignmentReportV1 | null>;
  saveRating(
    runId: string,
    input: SaveInstructorRatingInput,
  ): Promise<ManualRubricRatingV1>;
  saveModeration(
    runId: string,
    input: SaveInstructorModerationInput,
  ): Promise<RubricModerationResolutionV1>;
  closeAssignment(assignmentId: string): Promise<HostedAssignmentV1>;
  releaseFeedback(assignmentId: string): Promise<HostedAssignmentV1>;
  loadScormPackageJobs?(): Promise<
    readonly (ScormPackageJobV1 & { readonly downloadUrl: string })[]
  >;
  createScormPackageJob?(
    presetId: ScormPackagePresetId,
  ): Promise<ScormPackageJobV1 & { readonly downloadUrl: string }>;
  readonly counterfactuals?: CounterfactualExplorerApi;
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class InstructorReviewApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "InstructorReviewApiError";
  }
}

async function responseJson<T>(
  fetcher: FetchLike,
  path: string,
): Promise<T> {
  const response = await fetcher(path, {
    headers: { accept: "application/json" },
  });
  const body = (await response.json()) as {
    readonly error?: { readonly code?: string };
  } & T;
  if (!response.ok) {
    throw new InstructorReviewApiError(
      body.error?.code ?? "INSTRUCTOR_REVIEW_REQUEST_FAILED",
    );
  }
  return body;
}

async function mutationJson<T>(
  fetcher: FetchLike,
  path: string,
  body: Readonly<Record<string, unknown>>,
): Promise<T> {
  const response = await fetcher(path, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json()) as {
    readonly error?: { readonly code?: string };
  } & T;
  if (!response.ok) {
    throw new InstructorReviewApiError(
      parsed.error?.code ?? "INSTRUCTOR_REVIEW_REQUEST_FAILED",
    );
  }
  return parsed;
}

function newCommandId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function runLocalizedText(
  value: InstructorIncidentControlV1["incidents"][number]["title"],
  t: Translator,
): string {
  return (
    value.valuesByLocale[t.locale] ??
    value.valuesByLocale.en ??
    Object.values(value.valuesByLocale)[0] ??
    t(value.localizationKey)
  );
}

export function createInstructorReviewApi(
  fetcher: FetchLike = globalThis.fetch.bind(globalThis),
): InstructorReviewApi {
  return {
    counterfactuals: createCounterfactualExplorerApi(fetcher),
    loadSession: () =>
      responseJson<InstructorSession>(fetcher, "/api/v1/session"),
    async logoutSession() {
      const response = await fetcher("/api/lti/v1/logout", {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        throw new InstructorReviewApiError(
          "LTI_LOGOUT_FAILED",
        );
      }
    },
    async loadAssignmentScenarioOptions() {
      return (
        await responseJson<{
          readonly options:
            readonly HostedAssignmentScenarioOptionV1[];
        }>(fetcher, "/api/v1/assignment-options")
      ).options;
    },
    async loadAssignmentLearnerOptions() {
      return (
        await responseJson<{
          readonly learners:
            readonly HostedAssignmentLearnerOptionV1[];
        }>(fetcher, "/api/v1/assignment-learners")
      ).learners;
    },
    async loadRunReview(runId) {
      const encodedRunId = encodeURIComponent(runId);
      const [
        timeline,
        competencies,
        rubricEvidence,
        assessment,
        instructorIncidents,
      ] =
        await Promise.all([
        responseJson<{ readonly timeline: readonly InstructorTimelineItem[] }>(
          fetcher,
          `/api/v1/runs/${encodedRunId}/timeline`,
        ),
        responseJson<{
          readonly competencies: readonly CompetencyEvidenceProjection[];
        }>(
          fetcher,
          `/api/v1/runs/${encodedRunId}/competencies`,
        ),
        responseJson<{
          readonly rubricEvidence: readonly RubricEvidenceProjection[];
        }>(
          fetcher,
          `/api/v1/runs/${encodedRunId}/rubric-evidence`,
        ),
        responseJson<{
          readonly assignment: HostedAssignmentV1;
          readonly ratings: readonly ManualRubricRatingV1[];
          readonly moderationResolutions:
            readonly RubricModerationResolutionV1[];
        }>(
          fetcher,
          `/api/v1/runs/${encodedRunId}/ratings`,
        ),
        responseJson<{
          readonly director: InstructorIncidentControlV1;
        }>(
          fetcher,
          `/api/v1/runs/${encodedRunId}/instructor-incidents`,
        ),
      ]);
      return {
        assignment: assessment.assignment,
        timeline: timeline.timeline,
        competencies: competencies.competencies,
        rubricEvidence: rubricEvidence.rubricEvidence,
        ratings: assessment.ratings,
        moderationResolutions:
          assessment.moderationResolutions ?? [],
        instructorIncidents: instructorIncidents.director,
      };
    },
    async releaseInstructorIncident(
      runId,
      expectedRunVersion,
      incidentId,
    ) {
      await mutationJson(
        fetcher,
        `/api/v1/runs/${encodeURIComponent(runId)}/instructor-incidents`,
        {
          commandId: newCommandId("COMMAND_INSTRUCTOR_INCIDENT"),
          runId,
          expectedRunVersion,
          incidentId,
        },
      );
    },
    async loadRunReplay(runId, throughSequenceNumber) {
      const result = await responseJson<{
        readonly replay: InstructorRunReplayV1;
      }>(
        fetcher,
        `/api/v1/runs/${encodeURIComponent(runId)}/replay?sequence=${encodeURIComponent(String(throughSequenceNumber))}`,
      );
      return result.replay;
    },
    async createAssignment(input) {
      const result = await mutationJson<{
        readonly assignment: HostedAssignmentV1;
      }>(fetcher, "/api/v1/assignments", {
        ...input,
        commandId: newCommandId("COMMAND_ASSIGNMENT"),
      });
      return result.assignment;
    },
    async loadAssignmentReport(assignmentId) {
      const result = await responseJson<{
        readonly report: HostedAssignmentReportV1;
      }>(
        fetcher,
        `/api/v1/assignments/${encodeURIComponent(assignmentId)}/report`,
      );
      return result.report;
    },
    async loadAssignmentMonitor(assignmentId) {
      const result = await responseJson<{
        readonly monitor: HostedAssignmentMonitorV1;
      }>(
        fetcher,
        `/api/v1/assignments/${encodeURIComponent(assignmentId)}/monitor`,
      );
      return result.monitor;
    },
    async loadAssignmentCompetencies(assignmentId) {
      const result = await responseJson<{
        readonly competencies: HostedAssignmentCompetencyReportV1;
      }>(
        fetcher,
        `/api/v1/assignments/${encodeURIComponent(assignmentId)}/competencies`,
      );
      return result.competencies;
    },
    async loadAssignmentCurriculumCrosswalks(assignmentId) {
      const result = await responseJson<{
        readonly curriculumCrosswalks:
          AssignmentCurriculumOverlayReportV2;
      }>(
        fetcher,
        `/api/v1/assignments/${encodeURIComponent(assignmentId)}/curriculum-crosswalks`,
      );
      return result.curriculumCrosswalks;
    },
    async loadAssignmentDecisionOutcomes(assignmentId) {
      const result = await responseJson<{
        readonly decisionOutcomes:
          HostedAssignmentDecisionOutcomeReportV1;
      }>(
        fetcher,
        `/api/v1/assignments/${encodeURIComponent(assignmentId)}/decision-outcomes`,
      );
      return result.decisionOutcomes;
    },
    async loadAssignmentProcessAnalytics(assignmentId) {
      const result = await responseJson<{
        readonly analytics: AssignmentProcessAnalyticsV1;
      }>(
        fetcher,
        `/api/v1/assignments/${encodeURIComponent(assignmentId)}/process-analytics`,
      );
      return result.analytics;
    },
    async loadAssignmentAuditReport(assignmentId) {
      const result = await responseJson<{
        readonly auditReport: AuditAssignmentReportV1 | null;
      }>(
        fetcher,
        `/api/v1/assignments/${encodeURIComponent(assignmentId)}/audit-report`,
      );
      return result.auditReport;
    },
    async saveRating(runId, input) {
      const result = await mutationJson<{
        readonly rating: ManualRubricRatingV1;
      }>(
        fetcher,
        `/api/v1/runs/${encodeURIComponent(runId)}/ratings`,
        {
          ...input,
          commandId: newCommandId("COMMAND_RATING"),
          runId,
        },
      );
      return result.rating;
    },
    async saveModeration(runId, input) {
      const result = await mutationJson<{
        readonly resolution: RubricModerationResolutionV1;
      }>(
        fetcher,
        `/api/v1/runs/${encodeURIComponent(runId)}/moderation`,
        {
          ...input,
          commandId: newCommandId("COMMAND_MODERATION"),
          runId,
        },
      );
      return result.resolution;
    },
    async closeAssignment(assignmentId) {
      const result = await mutationJson<{
        readonly assignment: HostedAssignmentV1;
      }>(
        fetcher,
        `/api/v1/assignments/${encodeURIComponent(assignmentId)}/close`,
        { commandId: newCommandId("COMMAND_ASSIGNMENT_CLOSE") },
      );
      return result.assignment;
    },
    async releaseFeedback(assignmentId) {
      const result = await mutationJson<{
        readonly assignment: HostedAssignmentV1;
      }>(
        fetcher,
        `/api/v1/assignments/${encodeURIComponent(assignmentId)}/feedback-release`,
        { commandId: newCommandId("COMMAND_FEEDBACK_RELEASE") },
      );
      return result.assignment;
    },
    async loadScormPackageJobs() {
      return (
        await responseJson<{
          readonly jobs: readonly (ScormPackageJobV1 & {
            readonly downloadUrl: string;
          })[];
        }>(fetcher, "/api/v1/scorm-package-jobs")
      ).jobs;
    },
    async createScormPackageJob(presetId) {
      const result = await mutationJson<{
        readonly job: ScormPackageJobV1 & {
          readonly downloadUrl: string;
        };
      }>(fetcher, "/api/v1/scorm-package-jobs", {
        commandId: newCommandId("COMMAND_SCORM_PACKAGE"),
        jobId: newCommandId("JOB_SCORM_PACKAGE"),
        presetId,
      });
      return result.job;
    },
  };
}

const browserApi = createInstructorReviewApi();
const REVIEW_ROLES: readonly ApplicationRole[] = [
  "instructor",
  "rater",
  "administrator",
];

function errorMessageKey(error: unknown): string {
  if (error instanceof InstructorReviewApiError) {
    if (error.code === "AUTHENTICATION_REQUIRED") {
      return "instructorReview.error.launchFromMoodle";
    }
    if (error.code === "RUN_NOT_FOUND") {
      return "instructorReview.error.runNotFound";
    }
    if (error.code === "ASSIGNMENT_NOT_FOUND") {
      return "instructorReview.error.assignmentNotFound";
    }
    if (
      error.code === "INVALID_ASSIGNMENT" ||
      error.code === "LEARNER_NOT_PROVISIONED" ||
      error.code === "ASSIGNMENT_CONFLICT"
    ) {
      return "instructorReview.error.assignmentInvalid";
    }
    if (
      error.code === "INVALID_RATING" ||
      error.code === "RATING_REVISION_CONFLICT" ||
      error.code === "INVALID_MODERATION" ||
      error.code === "MODERATION_REVISION_CONFLICT"
    ) {
      return "instructorReview.error.rating";
    }
    if (error.code === "INVALID_COMMAND") {
      return "instructorReview.error.replay";
    }
    if (error.code === "ASSIGNMENT_ALREADY_CLOSED") {
      return "instructorReview.error.assignmentLifecycle";
    }
    if (
      error.code === "FEEDBACK_ALREADY_RELEASED" ||
      error.code === "FEEDBACK_NOT_RELEASED"
    ) {
      return "instructorReview.error.feedback";
    }
    if (
      error.code === "APPLICATION_ROLE_REQUIRED" ||
      error.code === "RUN_ACCESS_DENIED"
    ) {
      return "instructorReview.error.notAuthorized";
    }
  }
  return "instructorReview.error.generic";
}

function initialLtiMessageKey(): string | null {
  if (typeof window === "undefined") return null;
  const parameters = new URLSearchParams(window.location.search);
  if (parameters.has("ltiSignedOut")) {
    return "instructorReview.lti.signedOut";
  }
  const code = parameters.get("ltiError");
  if (code === null) return null;
  return code === "LTI_INSTRUCTOR_ROLE_REQUIRED"
    ? "instructorReview.lti.instructorRoleRequired"
    : "instructorReview.lti.launchFailed";
}

export function InstructorReviewScreen({
  api = browserApi,
}: {
  readonly api?: InstructorReviewApi;
}): ReactNode {
  const t = useTranslator();
  const initialLtiMessage = initialLtiMessageKey();
  const [session, setSession] = useState<InstructorSession | null>(null);
  const [sessionErrorKey, setSessionErrorKey] = useState<string | null>(
    initialLtiMessage,
  );
  const [runId, setRunId] = useState("");
  const [review, setReview] = useState<InstructorRunReview | null>(null);
  const [targetEventId, setTargetEventId] = useState<string | null>(
    null,
  );
  const [reviewErrorKey, setReviewErrorKey] = useState<string | null>(null);
  const [isReviewLoading, setReviewLoading] = useState(false);
  const [isSigningOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (initialLtiMessage !== null) return;
    let active = true;
    void api.loadSession().then(
      (loaded) => {
        if (active) setSession(loaded);
      },
      (error: unknown) => {
        if (active) setSessionErrorKey(errorMessageKey(error));
      },
    );
    return () => {
      active = false;
    };
  }, [api, initialLtiMessage]);

  const mayReview =
    session?.roles.some((role) => REVIEW_ROLES.includes(role)) ?? false;
  const mayManage =
    session?.roles.some(
      (role) => role === "instructor" || role === "administrator",
    ) ?? false;
  const accountLabel =
    session?.email ??
    session?.displayName ??
    session?.userId ??
    "";

  async function signOutFromLti(): Promise<void> {
    if (
      session?.authenticationSource !== "lti" ||
      api.logoutSession === undefined
    ) {
      return;
    }
    setSigningOut(true);
    try {
      await api.logoutSession();
      window.location.assign(
        session.learningContext?.returnUrl ??
          "/instructor?ltiSignedOut=1",
      );
    } catch {
      setSessionErrorKey("instructorReview.lti.logoutFailed");
      setSigningOut(false);
    }
  }

  async function loadRequestedReview(
    requestedRunId: string,
    requestedEventId: string | null = null,
  ) {
    if (requestedRunId.length === 0) return;
    setRunId(requestedRunId);
    setTargetEventId(requestedEventId);
    setReviewLoading(true);
    setReviewErrorKey(null);
    setReview(null);
    try {
      setReview(await api.loadRunReview(requestedRunId));
    } catch (error) {
      setReviewErrorKey(errorMessageKey(error));
    } finally {
      setReviewLoading(false);
    }
  }

  async function loadReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadRequestedReview(runId.trim());
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        {t("navigation.skip")}
      </a>
      <main className="start instructor-review" id="main-content">
        <div className="start__inner">
          <header className="instructor-review__header">
            <p className="eyebrow">{t("instructorReview.eyebrow")}</p>
            <h1>{t("instructorReview.title")}</h1>
            <p className="start__subtitle">
              {t("instructorReview.subtitle")}
            </p>
          </header>

          {sessionErrorKey !== null ? (
            <section className="notice notice--standalone" role="alert">
              <p>{t(sessionErrorKey)}</p>
            </section>
          ) : session === null ? (
            <p aria-live="polite">{t("instructorReview.sessionLoading")}</p>
          ) : (
            <section className="card card--reference">
              <h2>{t("instructorReview.sessionHeading")}</h2>
              <dl className="instructor-review__facts">
                <div>
                  <dt>{t("instructorReview.account")}</dt>
                  <dd>{accountLabel}</dd>
                </div>
                <div>
                  <dt>{t("instructorReview.roles")}</dt>
                  <dd>{session.roles.join(", ")}</dd>
                </div>
                {session.authenticationSource === "lti" &&
                session.learningContext !== undefined ? (
                  <>
                    <div>
                      <dt>{t("instructorReview.lti.connection")}</dt>
                      <dd>{t("instructorReview.lti.connected")}</dd>
                    </div>
                    <div>
                      <dt>{t("instructorReview.lti.course")}</dt>
                      <dd>
                        {session.learningContext.contextTitle ??
                          session.learningContext.contextLabel ??
                          session.learningContext.contextId}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
              {session.authenticationSource === "lti" ? (
                <div className="instructor-review__form-actions">
                  {session.learningContext?.returnUrl === undefined ? null : (
                    <a
                      className="button button--secondary"
                      href={session.learningContext.returnUrl}
                    >
                      {t("instructorReview.lti.returnToMoodle")}
                    </a>
                  )}
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={isSigningOut}
                    onClick={() => void signOutFromLti()}
                  >
                    {isSigningOut
                      ? t("instructorReview.lti.signingOut")
                      : t("instructorReview.lti.signOut")}
                  </button>
                </div>
              ) : null}
            </section>
          )}

          {session !== null && !mayReview ? (
            <section className="notice notice--standalone" role="alert">
              <p>{t("instructorReview.error.notAuthorized")}</p>
            </section>
          ) : null}

          {mayManage ? <AssignmentCreation api={api} /> : null}

          {mayManage ? <ScormPackageBuilder api={api} /> : null}

          {mayReview ? (
            <AssignmentReport
              api={api}
              mayManage={mayManage}
              onReviewEvent={(requestedRunId, eventId) =>
                loadRequestedReview(requestedRunId, eventId)
              }
            />
          ) : null}

          {mayReview ? (
            <section className="card card--work">
              <h2>{t("instructorReview.findRunHeading")}</h2>
              <form onSubmit={(event) => void loadReview(event)}>
                <div className="field">
                  <label className="field__label" htmlFor="instructor-run-id">
                    {t("instructorReview.runId")}
                  </label>
                  <input
                    className="field__control"
                    id="instructor-run-id"
                    value={runId}
                    onChange={(event) => setRunId(event.target.value)}
                    autoComplete="off"
                    required
                  />
                  <span className="field__hint">
                    {t("instructorReview.runIdHint")}
                  </span>
                </div>
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={isReviewLoading}
                >
                  {isReviewLoading
                    ? t("instructorReview.loadingRun")
                    : t("instructorReview.loadRun")}
                </button>
              </form>
              {reviewErrorKey !== null ? (
                <div
                  className="notice notice--standalone instructor-review__message"
                  role="alert"
                >
                  <p>{t(reviewErrorKey)}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {review === null ? null : (
            <RunReview
              api={api}
              review={review}
              runId={runId.trim()}
              mayReleaseFeedback={mayManage}
              mayModerate={mayManage}
              targetEventId={targetEventId}
              onRefresh={() => loadRequestedReview(runId.trim())}
            />
          )}
        </div>
      </main>
    </>
  );
}

function ScormPackageBuilder({
  api,
}: {
  readonly api: InstructorReviewApi;
}): ReactNode {
  const t = useTranslator();
  const [presetId, setPresetId] =
    useState<ScormPackagePresetId>("guided");
  const [jobs, setJobs] = useState<
    readonly (ScormPackageJobV1 & { readonly downloadUrl: string })[]
  >([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const preview = scormPackagePresetPreview(presetId);

  if (
    api.loadScormPackageJobs === undefined ||
    api.createScormPackageJob === undefined
  ) {
    return null;
  }
  const loadJobs = api.loadScormPackageJobs;
  const createJob = api.createScormPackageJob;

  function selectClosest(
    candidates: readonly ScormPackagePresetPreview[],
  ): void {
    const selected =
      candidates.find(
        (candidate) =>
          candidate.supportProfile === preview.supportProfile &&
          candidate.deliveryPurpose === preview.deliveryPurpose &&
          candidate.outcomeStrategy === preview.outcomeStrategy,
      ) ??
      candidates.find(
        (candidate) =>
          candidate.supportProfile === preview.supportProfile &&
          candidate.deliveryPurpose === preview.deliveryPurpose,
      ) ??
      candidates.find(
        (candidate) =>
          candidate.supportProfile === preview.supportProfile,
      ) ??
      candidates[0];
    if (selected !== undefined) setPresetId(selected.presetId);
  }

  const activityOptions = uniquePackageDimensions(
    SCORM_PACKAGE_PRESET_PREVIEWS.map(
      (candidate) => candidate.activityType,
    ),
  );
  const supportOptions = uniquePackageDimensions(
    SCORM_PACKAGE_PRESET_PREVIEWS.filter(
      (candidate) =>
        candidate.activityType === preview.activityType,
    ).map((candidate) => candidate.supportProfile),
  );
  const purposeOptions = uniquePackageDimensions(
    SCORM_PACKAGE_PRESET_PREVIEWS.filter(
      (candidate) =>
        candidate.activityType === preview.activityType &&
        candidate.supportProfile === preview.supportProfile,
    ).map((candidate) => candidate.deliveryPurpose),
  );
  const outcomeOptions = uniquePackageDimensions(
    SCORM_PACKAGE_PRESET_PREVIEWS.filter(
      (candidate) =>
        candidate.activityType === preview.activityType &&
        candidate.supportProfile === preview.supportProfile &&
        candidate.deliveryPurpose === preview.deliveryPurpose,
    ).map((candidate) => candidate.outcomeStrategy),
  );

  async function refresh() {
    setLoading(true);
    setError(false);
    try {
      setJobs(await loadJobs());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(false);
    try {
      const generated = await createJob(presetId);
      setJobs((current) => [
        generated,
        ...current.filter((job) => job.jobId !== generated.jobId),
      ]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card card--work">
      <h2>{t("instructorReview.packageBuilderHeading")}</h2>
      <p>{t("instructorReview.packageBuilderHelp")}</p>
      <form
        className="instructor-review__form-grid"
        onSubmit={(event) => void generate(event)}
      >
        <div className="field">
          <label className="field__label" htmlFor="scorm-activity-type">
            {t("instructorReview.packageActivityType")}
          </label>
          <select
            className="field__control"
            id="scorm-activity-type"
            value={preview.activityType}
            onChange={(event) => {
              const activityType =
                event.target.value as ActivityType;
              selectClosest(
                SCORM_PACKAGE_PRESET_PREVIEWS.filter(
                  (candidate) =>
                    candidate.activityType === activityType,
                ),
              );
            }}
          >
            {activityOptions.map((activityType) => (
              <option key={activityType} value={activityType}>
                {t(
                  `instructorReview.packageActivityType.${activityType}`,
                )}
              </option>
            ))}
            <option value="TECHNICAL_LAB" disabled>
              {t(
                "instructorReview.packageActivityType.TECHNICAL_LAB",
              )}
            </option>
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="scorm-support-profile">
            {t("instructorReview.packageSupportProfile")}
          </label>
          <select
            className="field__control"
            id="scorm-support-profile"
            value={preview.supportProfile}
            onChange={(event) => {
              const supportProfile =
                event.target.value as SupportProfile;
              selectClosest(
                SCORM_PACKAGE_PRESET_PREVIEWS.filter(
                  (candidate) =>
                    candidate.activityType ===
                      preview.activityType &&
                    candidate.supportProfile === supportProfile,
                ),
              );
            }}
          >
            {supportOptions.map((supportProfile) => (
              <option key={supportProfile} value={supportProfile}>
                {t(
                  `instructorReview.packageSupportProfile.${supportProfile}`,
                )}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="scorm-delivery-purpose">
            {t("instructorReview.packageDeliveryPurpose")}
          </label>
          <select
            className="field__control"
            id="scorm-delivery-purpose"
            value={preview.deliveryPurpose}
            onChange={(event) => {
              const deliveryPurpose =
                event.target.value as DeliveryPurpose;
              selectClosest(
                SCORM_PACKAGE_PRESET_PREVIEWS.filter(
                  (candidate) =>
                    candidate.activityType ===
                      preview.activityType &&
                    candidate.supportProfile ===
                      preview.supportProfile &&
                    candidate.deliveryPurpose === deliveryPurpose,
                ),
              );
            }}
          >
            {purposeOptions.map((deliveryPurpose) => (
              <option key={deliveryPurpose} value={deliveryPurpose}>
                {t(
                  `instructorReview.packageDeliveryPurpose.${deliveryPurpose}`,
                )}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="scorm-outcome-strategy">
            {t("instructorReview.packageOutcomeStrategy")}
          </label>
          <select
            className="field__control"
            id="scorm-outcome-strategy"
            value={preview.outcomeStrategy}
            onChange={(event) => {
              const outcomeStrategy =
                event.target.value as OutcomeStrategy;
              selectClosest(
                SCORM_PACKAGE_PRESET_PREVIEWS.filter(
                  (candidate) =>
                    candidate.activityType ===
                      preview.activityType &&
                    candidate.supportProfile ===
                      preview.supportProfile &&
                    candidate.deliveryPurpose ===
                      preview.deliveryPurpose &&
                    candidate.outcomeStrategy === outcomeStrategy,
                ),
              );
            }}
          >
            {outcomeOptions.map((outcomeStrategy) => (
              <option key={outcomeStrategy} value={outcomeStrategy}>
                {t(
                  `instructorReview.packageOutcomeStrategy.${outcomeStrategy}`,
                )}
              </option>
            ))}
          </select>
        </div>
        <PackagePresetPreview preview={preview} />
        <div className="instructor-review__form-actions">
        <button
          className="button button--primary"
          type="submit"
          disabled={isLoading}
        >
          {isLoading
            ? t("instructorReview.packageGenerating")
            : t("instructorReview.packageGenerate")}
        </button>
        <button
          className="button button--secondary"
          type="button"
          disabled={isLoading}
          onClick={() => void refresh()}
        >
          {t("instructorReview.packageHistory")}
        </button>
        </div>
      </form>
      {error ? (
        <p className="notice notice--standalone" role="alert">
          {t("instructorReview.error.package")}
        </p>
      ) : null}
      {jobs.length === 0 ? null : (
        <div className="table-scroll" aria-live="polite">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t("instructorReview.packageTitle")}</th>
                <th scope="col">{t("instructorReview.packagePreset")}</th>
                <th scope="col">{t("instructorReview.packageBuild")}</th>
                <th scope="col">{t("instructorReview.packageIdentity")}</th>
                <th scope="col">{t("instructorReview.packageDownload")}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.jobId}>
                  <td>{job.title}</td>
                  <td>
                    {t(`instructorReview.packagePreset.${job.presetId}`)}
                  </td>
                  <td>
                    {job.release
                      ? t("instructorReview.packageRelease")
                      : t("instructorReview.packageDevelopment")}
                  </td>
                  <td>
                    <code>{job.sha256.slice(0, 12)}</code>
                  </td>
                  <td>
                    <a
                      className="button button--secondary"
                      href={job.downloadUrl}
                      download={job.filename}
                    >
                      {t("instructorReview.packageDownload")}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function uniquePackageDimensions<Value extends string>(
  values: readonly Value[],
): readonly Value[] {
  return [...new Set(values)];
}

function PackagePresetPreview({
  preview,
}: {
  readonly preview: ScormPackagePresetPreview;
}): ReactNode {
  const t = useTranslator();
  return (
    <section
      className="instructor-review__mode-settings"
      aria-labelledby="scorm-preset-preview-heading"
    >
      <h3 id="scorm-preset-preview-heading">
        {t("instructorReview.packagePreviewHeading")}
      </h3>
      <p>{t(`instructorReview.packagePresetHelp.${preview.presetId}`)}</p>
      <dl className="instructor-review__facts">
        <div>
          <dt>{t("instructorReview.packagePreset")}</dt>
          <dd>
            {t(
              `instructorReview.packagePreset.${preview.presetId}`,
            )}
          </dd>
        </div>
        <div>
          <dt>{t("instructorReview.packageFeedback")}</dt>
          <dd>
            {t(
              `instructorReview.packageFeedback.${preview.feedbackTiming}`,
            )}
          </dd>
        </div>
        <div>
          <dt>{t("instructorReview.packageHints")}</dt>
          <dd>
            {t(
              `instructorReview.packageHints.${preview.hintAvailability}`,
            )}
          </dd>
        </div>
        <div>
          <dt>{t("instructorReview.packageContent")}</dt>
          <dd>
            <code>
              {preview.packId}@{preview.packVersion}
            </code>
          </dd>
        </div>
        <div>
          <dt>{t("instructorReview.packageScoring")}</dt>
          <dd>
            {t("instructorReview.packageScoringValue", {
              maximum: preview.maximumScore,
              pass: preview.passScore,
            })}
          </dd>
        </div>
        <div>
          <dt>{t("instructorReview.packageGradeUse")}</dt>
          <dd>
            {t(
              preview.official
                ? "instructorReview.packageGradeUse.official"
                : "instructorReview.packageGradeUse.formative",
            )}
          </dd>
        </div>
      </dl>
      {preview.presetId === "audit-challenge" ||
      preview.presetId === "audit-assessment" ? (
        <p className="notice notice--standalone">
          {t("instructorReview.packageCalibrationPending")}
        </p>
      ) : null}
    </section>
  );
}

interface AssignmentScenarioOption {
  readonly key: string;
  readonly label: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly supportedModes: readonly AssignmentRunMode[];
  readonly modeConfigurations:
    readonly HostedRunModeConfigurationV1[];
  readonly experienceConfigurations:
    HostedAssignmentScenarioOptionV1["experienceConfigurations"];
  readonly counterfactualDecisionPoints: readonly {
    readonly nodeId: string;
    readonly decisionId: string;
    readonly label: string;
    readonly maximumBranchesPerLearner: number;
    readonly reflectionRequired: boolean;
  }[];
}

function scenarioOptionKey(
  packId: string,
  packVersion: string,
  scenarioId: string,
  scenarioVersion: string,
): string {
  return [
    packId,
    packVersion,
    scenarioId,
    scenarioVersion,
  ].join("::");
}

function assignmentOptionText(
  option: HostedAssignmentScenarioOptionV1,
  kind: "pack" | "scenario",
  key: string,
  t: Translator,
): string {
  const localized = option.labelsByLocale[t.locale];
  const value =
    kind === "pack"
      ? localized?.packTitle
      : localized?.scenarioTitle;
  return value === undefined || value === key ? t(key) : value;
}

function assignmentScenarioOptions(
  available: readonly HostedAssignmentScenarioOptionV1[],
  t: Translator,
): readonly AssignmentScenarioOption[] {
  return available
    .filter((option) => option.supportedModes.length > 0)
    .map((option) => ({
      key: scenarioOptionKey(
        option.packId,
        option.packVersion,
        option.scenarioId,
        option.scenarioVersion,
      ),
      label: t("instructorReview.assignmentScenarioOption", {
        pack: assignmentOptionText(
          option,
          "pack",
          option.packTitleKey,
          t,
        ),
        scenario: assignmentOptionText(
          option,
          "scenario",
          option.scenarioTitleKey,
          t,
        ),
        packVersion: option.packVersion,
        scenarioVersion: option.scenarioVersion,
      }),
      packId: option.packId,
      packVersion: option.packVersion,
      scenarioId: option.scenarioId,
      scenarioVersion: option.scenarioVersion,
      supportedModes: option.supportedModes,
      modeConfigurations: option.modeConfigurations,
      experienceConfigurations:
        option.experienceConfigurations,
      counterfactualDecisionPoints:
        option.counterfactualDecisionPoints.map((point) => ({
          nodeId: point.nodeId,
          decisionId: point.decisionId,
          label:
            option.labelsByLocale[t.locale]
              ?.counterfactualDecisionTitles[point.nodeId] ??
            t(point.titleKey),
          maximumBranchesPerLearner:
            point.maximumBranchesPerLearner,
          reflectionRequired: point.reflectionRequired,
        })),
    }))
    .sort((left, right) =>
      left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
    );
}

function preferredAssignmentMode(
  supportedModes: readonly AssignmentRunMode[],
): AssignmentRunMode {
  return supportedModes.includes("standard")
    ? "standard"
    : (supportedModes[0] ?? "standard");
}

function optionalLocalDateTimeToUtc(
  value: string,
): string | undefined {
  if (value.length === 0) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString()
    : undefined;
}

function ModeConfigurationSummary({
  configuration,
}: {
  readonly configuration: HostedRunModeConfigurationV1;
}): ReactNode {
  const t = useTranslator();
  const setting = (enabled: boolean) =>
    t(
      enabled
        ? "instructorReview.modeSetting.enabled"
        : "instructorReview.modeSetting.disabled",
    );
  const facts = [
    {
      label: t("instructorReview.modeSetting.feedback"),
      value: t(
        `instructorReview.feedbackTiming.${configuration.feedbackTiming}`,
      ),
    },
    {
      label: t("instructorReview.modeSetting.hints"),
      value: setting(configuration.allowHints),
    },
    {
      label: t("instructorReview.modeSetting.retry"),
      value: setting(configuration.allowRetry),
    },
    {
      label: t("instructorReview.modeSetting.backtracking"),
      value: setting(configuration.allowBacktracking),
    },
    {
      label: t("instructorReview.modeSetting.scores"),
      value: setting(configuration.showScores),
    },
    {
      label: t("instructorReview.modeSetting.outcome"),
      value: t(
        `instructorReview.outcomeStrategy.${configuration.outcomeStrategy}`,
      ),
    },
    {
      label: t("instructorReview.modeSetting.seed"),
      value: t(
        `instructorReview.seedPolicy.${configuration.seedPolicy}`,
      ),
    },
    {
      label: t("instructorReview.modeSetting.timeLimit"),
      value:
        configuration.timeLimitMinutes === undefined
          ? t("instructorReview.timeLimit.unlimited")
          : t("instructorReview.timeLimit.minutes", {
              minutes: configuration.timeLimitMinutes,
            }),
    },
    {
      label: t("instructorReview.modeSetting.communication"),
      value: setting(configuration.allowCommunication),
    },
    {
      label: t("instructorReview.modeSetting.evidenceRequests"),
      value: setting(configuration.allowEvidenceRequests),
    },
  ] as const;

  return (
    <section
      className="instructor-review__mode-settings"
      aria-label={t("instructorReview.modeSettings")}
    >
      <h3>{t("instructorReview.modeSettings")}</h3>
      <dl className="instructor-review__facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AssignmentCreation({
  api,
}: {
  readonly api: InstructorReviewApi;
}): ReactNode {
  const t = useTranslator();
  const [assignmentId, setAssignmentId] = useState("");
  const [title, setTitle] = useState("");
  const [scenarioOptions, setScenarioOptions] = useState<
    readonly AssignmentScenarioOption[]
  >([]);
  const [selectedScenarioKey, setSelectedScenarioKey] =
    useState("");
  const [isLibraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState(false);
  const [mode, setMode] = useState<AssignmentRunMode>("standard");
  const [counterfactualEnabled, setCounterfactualEnabled] =
    useState(false);
  const [
    counterfactualDecisionNodeIds,
    setCounterfactualDecisionNodeIds,
  ] = useState<readonly string[]>([]);
  const [
    maximumCounterfactualBranches,
    setMaximumCounterfactualBranches,
  ] = useState(3);
  const [
    counterfactualLearnerAvailability,
    setCounterfactualLearnerAvailability,
  ] =
    useState<
      AssignmentCounterfactualConfigurationV1["learnerAvailability"]
    >("DISABLED");
  const [
    counterfactualReflectionRequired,
    setCounterfactualReflectionRequired,
  ] = useState(false);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [experimentalConditionId, setExperimentalConditionId] =
    useState("");
  const [randomAssignmentRecordId, setRandomAssignmentRecordId] =
    useState("");
  const [fixedScenarioSeed, setFixedScenarioSeed] = useState("");
  const [consentStatusReference, setConsentStatusReference] =
    useState("");
  const [preTestLinkageId, setPreTestLinkageId] = useState("");
  const [postTestLinkageId, setPostTestLinkageId] = useState("");
  const [blindedRaters, setBlindedRaters] = useState(false);
  const [interventionVersion, setInterventionVersion] =
    useState("1.0.0");
  const [retentionPolicyReference, setRetentionPolicyReference] =
    useState("");
  const [availableFromLocal, setAvailableFromLocal] =
    useState("");
  const [availableUntilLocal, setAvailableUntilLocal] =
    useState("");
  const [learnerOptions, setLearnerOptions] = useState<
    readonly HostedAssignmentLearnerOptionV1[]
  >([]);
  const [selectedLearnerIds, setSelectedLearnerIds] = useState<
    readonly string[]
  >([]);
  const [isLearnerRosterLoading, setLearnerRosterLoading] =
    useState(true);
  const [learnerRosterError, setLearnerRosterError] =
    useState(false);
  const [created, setCreated] = useState<HostedAssignmentV1 | null>(
    null,
  );
  const [isSaving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const selectedScenario = scenarioOptions.find(
    (option) => option.key === selectedScenarioKey,
  );
  const selectedModeConfiguration =
    selectedScenario?.modeConfigurations.find(
      (configuration) => configuration.mode === mode,
    );

  useEffect(() => {
    let active = true;
    void api.loadAssignmentScenarioOptions().then(
      (available) => {
        if (!active) return;
        const options = assignmentScenarioOptions(available, t);
        const first = options[0];
        setScenarioOptions(options);
        setSelectedScenarioKey(first?.key ?? "");
        if (first !== undefined) {
          setMode(preferredAssignmentMode(first.supportedModes));
        }
        setLibraryLoading(false);
      },
      () => {
        if (!active) return;
        setScenarioOptions([]);
        setSelectedScenarioKey("");
        setLibraryError(true);
        setLibraryLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api, t]);

  useEffect(() => {
    let active = true;
    void api.loadAssignmentLearnerOptions().then(
      (available) => {
        if (!active) return;
        setLearnerOptions(available);
        setLearnerRosterLoading(false);
      },
      () => {
        if (!active) return;
        setLearnerOptions([]);
        setSelectedLearnerIds([]);
        setLearnerRosterError(true);
        setLearnerRosterLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedScenario === undefined) {
      setErrorKey("instructorReview.error.scenarioLibrary");
      return;
    }
    const availableFrom = optionalLocalDateTimeToUtc(
      availableFromLocal,
    );
    const availableUntil = optionalLocalDateTimeToUtc(
      availableUntilLocal,
    );
    if (
      (availableFromLocal.length > 0 &&
        availableFrom === undefined) ||
      (availableUntilLocal.length > 0 &&
        availableUntil === undefined) ||
      (availableFrom !== undefined &&
        availableUntil !== undefined &&
        availableFrom >= availableUntil)
    ) {
      setErrorKey("instructorReview.error.assignmentAvailability");
      return;
    }
    setSaving(true);
    setCreated(null);
    setErrorKey(null);
    try {
      setCreated(
        await api.createAssignment({
          assignmentId: assignmentId.trim(),
          title: title.trim(),
          packId: selectedScenario.packId,
          packVersion: selectedScenario.packVersion,
          scenarioId: selectedScenario.scenarioId,
          scenarioVersion: selectedScenario.scenarioVersion,
          mode,
          counterfactualReplay: counterfactualEnabled
            ? {
                enabled: true,
                allowedDecisionNodeIds:
                  counterfactualDecisionNodeIds,
                maximumBranchesPerLearner:
                  maximumCounterfactualBranches,
                learnerAvailability:
                  counterfactualLearnerAvailability,
                requireReflection:
                  counterfactualReflectionRequired,
              }
            : {
                enabled: false,
                allowedDecisionNodeIds: [],
                maximumBranchesPerLearner: 1,
                learnerAvailability: "DISABLED",
                requireReflection: false,
              },
          research: researchEnabled
            ? {
                enabled: true,
                experimentalConditionId:
                  experimentalConditionId.trim(),
                randomAssignmentRecordId:
                  randomAssignmentRecordId.trim(),
                fixedScenarioSeed: fixedScenarioSeed.trim(),
                consentStatusReference:
                  consentStatusReference.trim(),
                ...(preTestLinkageId.trim().length === 0
                  ? {}
                  : {
                      preTestLinkageId: preTestLinkageId.trim(),
                    }),
                ...(postTestLinkageId.trim().length === 0
                  ? {}
                  : {
                      postTestLinkageId: postTestLinkageId.trim(),
                    }),
                blindedRaters,
                interventionVersion:
                  interventionVersion.trim(),
                retentionPolicyReference:
                  retentionPolicyReference.trim(),
              }
            : { enabled: false },
          learnerUserIds: selectedLearnerIds,
          ...(availableFrom === undefined
            ? {}
            : { availableFrom }),
          ...(availableUntil === undefined
            ? {}
            : { availableUntil }),
        }),
      );
    } catch (error) {
      setErrorKey(errorMessageKey(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card card--work">
      <h2>{t("instructorReview.assignmentCreateHeading")}</h2>
      <p>{t("instructorReview.assignmentCreateHelp")}</p>
      <form
        className="instructor-review__form-grid"
        onSubmit={(event) => void create(event)}
      >
        <TextField
          id="assignment-id"
          label={t("instructorReview.assignmentId")}
          value={assignmentId}
          onChange={setAssignmentId}
        />
        <TextField
          id="assignment-title"
          label={t("instructorReview.assignmentTitle")}
          value={title}
          onChange={setTitle}
        />
        <div className="field">
          <label
            className="field__label"
            htmlFor="assignment-scenario"
          >
            {t("instructorReview.assignmentScenario")}
          </label>
          <select
            className="field__control"
            id="assignment-scenario"
            value={selectedScenarioKey}
            disabled={isLibraryLoading || scenarioOptions.length === 0}
            required
            onChange={(event) => {
              const nextKey = event.target.value;
              const nextScenario = scenarioOptions.find(
                (option) => option.key === nextKey,
              );
              setSelectedScenarioKey(nextKey);
              if (nextScenario !== undefined) {
                setMode(
                  preferredAssignmentMode(
                    nextScenario.supportedModes,
                  ),
                );
              }
              setCounterfactualEnabled(false);
              setCounterfactualDecisionNodeIds([]);
              setCounterfactualLearnerAvailability("DISABLED");
              setCounterfactualReflectionRequired(false);
              setResearchEnabled(false);
            }}
          >
            {isLibraryLoading ? (
              <option value="">
                {t("instructorReview.assignmentScenarioLoading")}
              </option>
            ) : scenarioOptions.length === 0 ? (
              <option value="">
                {t("instructorReview.assignmentScenarioEmpty")}
              </option>
            ) : (
              scenarioOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))
            )}
          </select>
          <span className="field__hint">
            {t("instructorReview.assignmentScenarioHelp")}
          </span>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="assignment-mode">
            {t("instructorReview.mode")}
          </label>
          <select
            className="field__control"
            id="assignment-mode"
            value={mode}
            onChange={(event) =>
              {
                const nextMode =
                  event.target.value as AssignmentRunMode;
                setMode(nextMode);
                if (nextMode !== "sandbox") {
                  setCounterfactualLearnerAvailability(
                    "DISABLED",
                  );
                }
                setResearchEnabled(false);
              }
            }
          >
            {(selectedScenario?.supportedModes ?? []).map(
              (supportedMode) => (
                <option key={supportedMode} value={supportedMode}>
                  {t(`instructorReview.mode.${supportedMode}`)}
                </option>
              ),
            )}
          </select>
          {selectedScenario === undefined ? null : (
            <span className="field__hint">
              {t(`instructorReview.modeHelp.${mode}`)}
            </span>
          )}
        </div>
        {selectedModeConfiguration === undefined ? null : (
          <ModeConfigurationSummary
            configuration={selectedModeConfiguration}
          />
        )}
        {selectedScenario === undefined ||
        selectedScenario.counterfactualDecisionPoints.length ===
          0 ? null : (
          <fieldset className="instructor-review__mode-settings">
            <legend>
              {t("instructorReview.counterfactual.heading")}
            </legend>
            <label>
              <input
                type="checkbox"
                checked={counterfactualEnabled}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setCounterfactualEnabled(enabled);
                  setCounterfactualDecisionNodeIds(
                    enabled
                      ? selectedScenario.counterfactualDecisionPoints.map(
                          (point) => point.nodeId,
                        )
                      : [],
                  );
                  setCounterfactualReflectionRequired(
                    enabled &&
                      selectedScenario.counterfactualDecisionPoints.some(
                        (point) => point.reflectionRequired,
                      ),
                  );
                  if (!enabled) {
                    setCounterfactualLearnerAvailability(
                      "DISABLED",
                    );
                  }
                }}
              />{" "}
              {t("instructorReview.counterfactual.enable")}
            </label>
            {counterfactualEnabled ? (
              <>
                <fieldset className="instructor-review__learner-picker">
                  <legend className="field__label">
                    {t(
                      "instructorReview.counterfactual.points",
                    )}
                  </legend>
                  <div className="instructor-review__learner-options">
                    {selectedScenario.counterfactualDecisionPoints.map(
                      (point) => {
                        const checked =
                          counterfactualDecisionNodeIds.includes(
                            point.nodeId,
                          );
                        return (
                          <label key={point.nodeId}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) =>
                                setCounterfactualDecisionNodeIds(
                                  (current) =>
                                    event.target.checked
                                      ? [
                                          ...current,
                                          point.nodeId,
                                        ].sort()
                                      : current.filter(
                                          (nodeId) =>
                                            nodeId !== point.nodeId,
                                        ),
                                )
                              }
                            />
                            <span>{point.label}</span>
                          </label>
                        );
                      },
                    )}
                  </div>
                </fieldset>
                <div className="instructor-review__form-grid">
                  <label className="field">
                    <span className="field__label">
                      {t(
                        "instructorReview.counterfactual.maximumBranches",
                      )}
                    </span>
                    <input
                      className="field__control"
                      type="number"
                      min={1}
                      max={20}
                      value={maximumCounterfactualBranches}
                      onChange={(event) =>
                        setMaximumCounterfactualBranches(
                          Number(event.target.value),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">
                      {t(
                        "instructorReview.counterfactual.learnerAvailability",
                      )}
                    </span>
                    <select
                      className="field__control"
                      value={
                        counterfactualLearnerAvailability
                      }
                      disabled={mode !== "sandbox"}
                      onChange={(event) =>
                        setCounterfactualLearnerAvailability(
                          event.target
                            .value as AssignmentCounterfactualConfigurationV1["learnerAvailability"],
                        )
                      }
                    >
                      <option value="DISABLED">
                        {t(
                          "instructorReview.counterfactual.learnerAvailability.DISABLED",
                        )}
                      </option>
                      <option value="AFTER_RUN_COMPLETION">
                        {t(
                          "instructorReview.counterfactual.learnerAvailability.AFTER_RUN_COMPLETION",
                        )}
                      </option>
                      <option value="AFTER_FEEDBACK_RELEASE">
                        {t(
                          "instructorReview.counterfactual.learnerAvailability.AFTER_FEEDBACK_RELEASE",
                        )}
                      </option>
                    </select>
                  </label>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={
                      counterfactualReflectionRequired
                    }
                    onChange={(event) =>
                      setCounterfactualReflectionRequired(
                        event.target.checked,
                      )
                    }
                  />{" "}
                  {t(
                    "instructorReview.counterfactual.requireReflection",
                  )}
                </label>
              </>
            ) : null}
          </fieldset>
        )}
        <fieldset className="instructor-review__mode-settings">
          <legend>{t("instructorReview.research.heading")}</legend>
          <label>
            <input
              type="checkbox"
              checked={researchEnabled}
              disabled={
                selectedModeConfiguration?.seedPolicy !== "supplied"
              }
              onChange={(event) =>
                setResearchEnabled(event.target.checked)
              }
            />{" "}
            {t("instructorReview.research.enable")}
          </label>
          <p>{t("instructorReview.research.help")}</p>
          {researchEnabled ? (
            <div className="instructor-review__form-grid">
              <TextField
                id="research-condition-id"
                label={t("instructorReview.research.condition")}
                value={experimentalConditionId}
                onChange={setExperimentalConditionId}
              />
              <TextField
                id="research-random-assignment-id"
                label={t(
                  "instructorReview.research.randomAssignment",
                )}
                value={randomAssignmentRecordId}
                onChange={setRandomAssignmentRecordId}
              />
              <TextField
                id="research-scenario-seed"
                label={t("instructorReview.research.seed")}
                value={fixedScenarioSeed}
                onChange={setFixedScenarioSeed}
              />
              <TextField
                id="research-consent-reference"
                label={t("instructorReview.research.consent")}
                value={consentStatusReference}
                onChange={setConsentStatusReference}
              />
              <TextField
                id="research-pre-test-link"
                label={t("instructorReview.research.preTest")}
                value={preTestLinkageId}
                onChange={setPreTestLinkageId}
                required={false}
              />
              <TextField
                id="research-post-test-link"
                label={t("instructorReview.research.postTest")}
                value={postTestLinkageId}
                onChange={setPostTestLinkageId}
                required={false}
              />
              <TextField
                id="research-intervention-version"
                label={t(
                  "instructorReview.research.interventionVersion",
                )}
                value={interventionVersion}
                onChange={setInterventionVersion}
              />
              <TextField
                id="research-retention-reference"
                label={t("instructorReview.research.retention")}
                value={retentionPolicyReference}
                onChange={setRetentionPolicyReference}
              />
              <label>
                <input
                  type="checkbox"
                  checked={blindedRaters}
                  onChange={(event) =>
                    setBlindedRaters(event.target.checked)
                  }
                />{" "}
                {t("instructorReview.research.blindedRaters")}
              </label>
            </div>
          ) : null}
        </fieldset>
        <TextField
          id="assignment-available-from"
          label={t("instructorReview.availableFrom")}
          value={availableFromLocal}
          onChange={setAvailableFromLocal}
          type="datetime-local"
          required={false}
          hint={t("instructorReview.availabilityTimeHelp")}
        />
        <TextField
          id="assignment-available-until"
          label={t("instructorReview.availableUntil")}
          value={availableUntilLocal}
          onChange={setAvailableUntilLocal}
          type="datetime-local"
          required={false}
          hint={t("instructorReview.availabilityTimeHelp")}
        />
        <fieldset className="field instructor-review__learner-picker">
          <legend className="field__label">
            {t("instructorReview.learners")}
          </legend>
          {isLearnerRosterLoading ? (
            <p>{t("instructorReview.learnersLoading")}</p>
          ) : learnerOptions.length === 0 ? (
            <p>{t("instructorReview.learnersEmpty")}</p>
          ) : (
            <div className="instructor-review__learner-options">
              {learnerOptions.map((learner) => {
                const checked = selectedLearnerIds.includes(
                  learner.userId,
                );
                return (
                  <label key={learner.userId}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={
                        !checked &&
                        selectedLearnerIds.length >= 200
                      }
                      onChange={(event) => {
                        setSelectedLearnerIds((current) =>
                          event.target.checked
                            ? [...current, learner.userId].sort()
                            : current.filter(
                                (userId) =>
                                  userId !== learner.userId,
                              ),
                        );
                      }}
                    />
                    <span>
                      {t("instructorReview.learnerOption", {
                        email: learner.email,
                        userId: learner.userId,
                      })}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <span className="field__hint">
            {t("instructorReview.learnersHint")}
          </span>
        </fieldset>
        <div className="instructor-review__form-actions">
          <button
            className="button button--primary"
            type="submit"
            disabled={
              isSaving ||
              selectedScenario === undefined ||
              selectedLearnerIds.length === 0 ||
              (counterfactualEnabled &&
                (counterfactualDecisionNodeIds.length === 0 ||
                  maximumCounterfactualBranches < 1 ||
                  maximumCounterfactualBranches > 20)) ||
              (researchEnabled &&
                (experimentalConditionId.trim().length === 0 ||
                  randomAssignmentRecordId.trim().length === 0 ||
                  fixedScenarioSeed.trim().length === 0 ||
                  consentStatusReference.trim().length === 0 ||
                  interventionVersion.trim().length === 0 ||
                  retentionPolicyReference.trim().length === 0))
            }
          >
            {isSaving
              ? t("instructorReview.assignmentCreating")
              : t("instructorReview.assignmentCreate")}
          </button>
        </div>
      </form>
      {libraryError ? (
        <p className="notice notice--standalone" role="alert">
          {t("instructorReview.error.scenarioLibrary")}
        </p>
      ) : null}
      {learnerRosterError ? (
        <p className="notice notice--standalone" role="alert">
          {t("instructorReview.error.learnerRoster")}
        </p>
      ) : null}
      {created === null ? null : (
        <div className="notice notice--standalone" role="status">
          <p>
            {t("instructorReview.assignmentCreated", {
              assignmentId: created.assignmentId,
            })}
          </p>
          {created.runConfiguration === undefined ? null : (
            <ModeConfigurationSummary
              configuration={created.runConfiguration}
            />
          )}
        </div>
      )}
      {errorKey === null ? null : (
        <p className="notice notice--standalone" role="alert">
          {t(errorKey)}
        </p>
      )}
    </section>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = true,
  hint,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: "text" | "datetime-local";
  readonly required?: boolean;
  readonly hint?: string;
}): ReactNode {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        className="field__control"
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        required={required}
      />
      {hint === undefined ? null : (
        <span className="field__hint">{hint}</span>
      )}
    </div>
  );
}

function assignmentRejectionFindings(
  report: HostedAssignmentReportV1,
): readonly {
  readonly findingCode: string;
  readonly count: number;
}[] {
  const counts = new Map<string, number>();
  for (const learner of report.learners) {
    for (const run of learner.runs) {
      for (const finding of run.activity.rejectionFindings) {
        counts.set(
          finding.findingCode,
          (counts.get(finding.findingCode) ?? 0) + finding.count,
        );
      }
    }
  }
  return [...counts]
    .map(([findingCode, count]) => ({ findingCode, count }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        (left.findingCode < right.findingCode
          ? -1
          : left.findingCode > right.findingCode
            ? 1
            : 0),
    );
}

function AssignmentReport({
  api,
  mayManage,
  onReviewEvent,
}: {
  readonly api: InstructorReviewApi;
  readonly mayManage: boolean;
  readonly onReviewEvent: (
    runId: string,
    eventId: string,
  ) => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  const [assignmentId, setAssignmentId] = useState("");
  const [report, setReport] =
    useState<HostedAssignmentReportV1 | null>(null);
  const [monitor, setMonitor] =
    useState<HostedAssignmentMonitorV1 | null>(null);
  const [competencies, setCompetencies] =
    useState<HostedAssignmentCompetencyReportV1 | null>(null);
  const [curriculumCrosswalks, setCurriculumCrosswalks] =
    useState<AssignmentCurriculumOverlayReportV2 | null>(null);
  const [decisionOutcomes, setDecisionOutcomes] =
    useState<HostedAssignmentDecisionOutcomeReportV1 | null>(null);
  const [processAnalytics, setProcessAnalytics] =
    useState<AssignmentProcessAnalyticsV1 | null>(null);
  const [auditReport, setAuditReport] =
    useState<AuditAssignmentReportV1 | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [isMonitorLoading, setMonitorLoading] = useState(false);
  const [isClosing, setClosing] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setReport(null);
    setMonitor(null);
    setCompetencies(null);
    setCurriculumCrosswalks(null);
    setDecisionOutcomes(null);
    setProcessAnalytics(null);
    setAuditReport(null);
    setErrorKey(null);
    try {
      const requestedAssignmentId = assignmentId.trim();
      const [
        loadedReport,
        loadedMonitor,
        loadedCompetencies,
        loadedCurriculumCrosswalks,
        loadedDecisionOutcomes,
        loadedProcessAnalytics,
        loadedAuditReport,
      ] =
        await Promise.all([
          api.loadAssignmentReport(requestedAssignmentId),
          api.loadAssignmentMonitor(requestedAssignmentId),
          api.loadAssignmentCompetencies(requestedAssignmentId),
          api.loadAssignmentCurriculumCrosswalks(
            requestedAssignmentId,
          ),
          api.loadAssignmentDecisionOutcomes(
            requestedAssignmentId,
          ),
          api.loadAssignmentProcessAnalytics?.(
            requestedAssignmentId,
          ) ?? Promise.resolve(null),
          api.loadAssignmentAuditReport?.(
            requestedAssignmentId,
          ) ?? Promise.resolve(null),
        ]);
      setReport(loadedReport);
      setMonitor(loadedMonitor);
      setCompetencies(loadedCompetencies);
      setCurriculumCrosswalks(loadedCurriculumCrosswalks);
      setDecisionOutcomes(loadedDecisionOutcomes);
      setProcessAnalytics(loadedProcessAnalytics);
      setAuditReport(loadedAuditReport);
    } catch (error) {
      setErrorKey(errorMessageKey(error));
    } finally {
      setLoading(false);
    }
  }

  async function refreshMonitor() {
    if (report === null) return;
    setMonitorLoading(true);
    setErrorKey(null);
    try {
      setMonitor(
        await api.loadAssignmentMonitor(
          report.assignment.assignmentId,
        ),
      );
    } catch (error) {
      setErrorKey(errorMessageKey(error));
    } finally {
      setMonitorLoading(false);
    }
  }

  async function closeAssignment() {
    if (report === null || report.assignment.status === "closed") {
      return;
    }
    setClosing(true);
    setErrorKey(null);
    try {
      const assignment = await api.closeAssignment(
        report.assignment.assignmentId,
      );
      setReport((current) =>
        current === null
          ? current
          : { ...current, assignment },
      );
    } catch (error) {
      setErrorKey(errorMessageKey(error));
    } finally {
      setClosing(false);
    }
  }

  const rejectionFindings =
    report === null ? [] : assignmentRejectionFindings(report);

  return (
    <section className="card card--reference">
      <h2>{t("instructorReview.classReportHeading")}</h2>
      <form
        className="instructor-review__inline-form"
        onSubmit={(event) => void load(event)}
      >
        <TextField
          id="report-assignment-id"
          label={t("instructorReview.assignmentId")}
          value={assignmentId}
          onChange={setAssignmentId}
        />
        <button
          className="button button--secondary"
          type="submit"
          disabled={isLoading}
        >
          {isLoading
            ? t("instructorReview.classReportLoading")
            : t("instructorReview.classReportLoad")}
        </button>
      </form>
      {errorKey === null ? null : (
        <p className="notice notice--standalone" role="alert">
          {t(errorKey)}
        </p>
      )}
      {report === null ? null : (
        <div aria-live="polite">
          <section className="instructor-review__assignment-access">
            <h3>{t("instructorReview.assignmentAccessHeading")}</h3>
            <dl className="instructor-review__facts">
              <div>
                <dt>
                  {t("instructorReview.assignmentAvailableFrom")}
                </dt>
                <dd>
                  {report.assignment.availableFrom === undefined ? (
                    t("instructorReview.availabilityNoBoundary")
                  ) : (
                    <time
                      dateTime={report.assignment.availableFrom}
                    >
                      {report.assignment.availableFrom}
                    </time>
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  {t("instructorReview.assignmentAvailableUntil")}
                </dt>
                <dd>
                  {report.assignment.availableUntil === undefined ? (
                    t("instructorReview.availabilityNoBoundary")
                  ) : (
                    <time
                      dateTime={report.assignment.availableUntil}
                    >
                      {report.assignment.availableUntil}
                    </time>
                  )}
                </dd>
              </div>
            </dl>
            <p>
              {t(
                `instructorReview.assignmentStatus.${report.assignment.status}`,
              )}
            </p>
            <p>{t("instructorReview.institutionalLaunchHelp")}</p>
            <a
              className="button button--secondary"
              href={`/learner?assignmentId=${encodeURIComponent(report.assignment.assignmentId)}`}
            >
              {t("instructorReview.institutionalLaunch")}
            </a>
            {report.assignment.status === "closed" ? (
              <p>
                {t(
                  "instructorReview.assignmentClosedDetail",
                  {
                    closedAt:
                      report.assignment.closedAt!,
                    closedBy:
                      report.assignment.closedByUserId!,
                  },
                )}
              </p>
            ) : (
              <>
                <p>
                  {t("instructorReview.assignmentCloseHelp")}
                </p>
                {mayManage ? (
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={isClosing}
                    onClick={() => void closeAssignment()}
                  >
                    {isClosing
                      ? t("instructorReview.assignmentClosing")
                      : t("instructorReview.assignmentClose")}
                  </button>
                ) : null}
              </>
            )}
          </section>
          {monitor === null ? null : (
            <AssignmentLiveMonitor
              monitor={monitor}
              isRefreshing={isMonitorLoading}
              onRefresh={refreshMonitor}
            />
          )}
          <div className="instructor-review__export">
            <p>{t("instructorReview.exportHelp")}</p>
            <div className="instructor-review__export-actions">
              <a
                className="button button--secondary"
                href={`/api/v1/assignments/${encodeURIComponent(report.assignment.assignmentId)}/export.json`}
                download
              >
                {t("instructorReview.exportJson")}
              </a>
              <a
                className="button button--secondary"
                href={`/api/v1/assignments/${encodeURIComponent(report.assignment.assignmentId)}/export.csv`}
                download
              >
                {t("instructorReview.exportCsv")}
              </a>
            </div>
            <p>{t("instructorReview.exportPseudonymousHelp")}</p>
            <div className="instructor-review__export-actions">
              <a
                className="button button--secondary"
                href={`/api/v1/assignments/${encodeURIComponent(report.assignment.assignmentId)}/export.json?identity=pseudonymous`}
                download
              >
                {t("instructorReview.exportPseudonymousJson")}
              </a>
              <a
                className="button button--secondary"
                href={`/api/v1/assignments/${encodeURIComponent(report.assignment.assignmentId)}/export.csv?identity=pseudonymous`}
                download
              >
                {t("instructorReview.exportPseudonymousCsv")}
              </a>
            </div>
            {report.assignment.counterfactualReplay.enabled ? (
              <>
                <p>
                  {t(
                    "instructorReview.counterfactual.reportHelp",
                  )}
                </p>
                <div className="instructor-review__export-actions">
                  <a
                    className="button button--secondary"
                    href={`/api/v1/assignments/${encodeURIComponent(report.assignment.assignmentId)}/counterfactual-report`}
                    download={`TraceChain_${report.assignment.assignmentId}_counterfactual_report_v1.json`}
                  >
                    {t(
                      "instructorReview.counterfactual.reportJson",
                    )}
                  </a>
                </div>
              </>
            ) : null}
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("instructorReview.learner")}</th>
                  <th scope="col">{t("instructorReview.runId")}</th>
                  <th scope="col">{t("instructorReview.status")}</th>
                  <th scope="col">
                    {t("instructorReview.runStarted")}
                  </th>
                  <th scope="col">
                    {t("instructorReview.runCompleted")}
                  </th>
                  <th scope="col">
                    {t("instructorReview.monitorElapsed")}
                  </th>
                  <th scope="col">
                    {t("instructorReview.activitySummary")}
                  </th>
                  <th scope="col">{t("instructorReview.eventCount")}</th>
                  <th scope="col">{t("instructorReview.ratingCount")}</th>
                </tr>
              </thead>
              <tbody>
                {report.learners.flatMap((learner) =>
                  learner.runs.length === 0
                    ? [
                        <tr key={learner.learnerUserId}>
                          <td>
                            <code>{learner.learnerUserId}</code>
                          </td>
                          <td colSpan={8}>
                            {t("instructorReview.notStarted")}
                          </td>
                        </tr>,
                      ]
                    : learner.runs.map((run) => (
                        <tr key={run.runId}>
                          <td>
                            <code>{learner.learnerUserId}</code>
                          </td>
                          <td>
                            <code>{run.runId}</code>
                          </td>
                          <td>
                            {t(`instructorReview.runStatus.${run.status}`)}
                          </td>
                          <td>
                            <time dateTime={run.startedAt}>
                              {run.startedAt}
                            </time>
                          </td>
                          <td>
                            {run.completedAt === null ? (
                              t("instructorReview.none")
                            ) : (
                              <time dateTime={run.completedAt}>
                                {run.completedAt}
                              </time>
                            )}
                          </td>
                          <td>
                            {t(
                              "instructorReview.monitorElapsedValue",
                              { count: run.elapsedSeconds },
                            )}
                          </td>
                          <td>
                            <details className="instructor-review__activity">
                              <summary>
                                {t("instructorReview.activityView")}
                              </summary>
                              <dl>
                                <div>
                                  <dt>
                                    {t(
                                      "instructorReview.activityEvidenceInspections",
                                    )}
                                  </dt>
                                  <dd>
                                    {run.activity.evidenceInspectionCount}
                                  </dd>
                                </div>
                                <div>
                                  <dt>
                                    {t(
                                      "instructorReview.activityPolicyConsultations",
                                    )}
                                  </dt>
                                  <dd>
                                    {run.activity.policyConsultationCount}
                                  </dd>
                                </div>
                                <div>
                                  <dt>
                                    {t(
                                      "instructorReview.activityEvidenceCitations",
                                    )}
                                  </dt>
                                  <dd>{run.activity.citedEvidenceCount}</dd>
                                </div>
                                <div>
                                  <dt>
                                    {t(
                                      "instructorReview.activityDecisionAttempts",
                                    )}
                                  </dt>
                                  <dd>{run.activity.decisionAttemptCount}</dd>
                                </div>
                                <div>
                                  <dt>
                                    {t(
                                      "instructorReview.activityRejectedAttempts",
                                    )}
                                  </dt>
                                  <dd>{run.activity.rejectedAttemptCount}</dd>
                                </div>
                                <div>
                                  <dt>
                                    {t(
                                      "instructorReview.activityMitigations",
                                    )}
                                  </dt>
                                  <dd>{run.activity.mitigationCount}</dd>
                                </div>
                              </dl>
                            </details>
                          </td>
                          <td>{run.eventCount}</td>
                          <td>{run.ratings.length}</td>
                        </tr>
                      )),
                )}
              </tbody>
            </table>
          </div>
          <section>
            <h3>{t("instructorReview.commonRejectionsHeading")}</h3>
            <p>{t("instructorReview.commonRejectionsHelp")}</p>
            {rejectionFindings.length === 0 ? (
              <p>{t("instructorReview.noRejectionFindings")}</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        {t("instructorReview.rejectionFinding")}
                      </th>
                      <th scope="col">
                        {t("instructorReview.rejectionOccurrences")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rejectionFindings.map((finding) => (
                      <tr key={finding.findingCode}>
                        <td>
                          <code>{finding.findingCode}</code>
                        </td>
                        <td>{finding.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {decisionOutcomes === null ? null : (
            <ClassDecisionOutcomeReport report={decisionOutcomes} />
          )}
          {auditReport === null ? null : (
            <ClassAuditReport
              report={auditReport}
              onReviewEvent={onReviewEvent}
            />
          )}
          {processAnalytics === null ? null : (
            <ClassProcessAnalyticsReport
              report={processAnalytics}
              onReviewEvent={onReviewEvent}
            />
          )}
          {competencies === null ? null : (
            <ClassCompetencyReport
              report={competencies}
              onReviewEvent={onReviewEvent}
            />
          )}
          {curriculumCrosswalks === null ? null : (
            <ClassCurriculumCrosswalkReport
              report={curriculumCrosswalks}
            />
          )}
        </div>
      )}
    </section>
  );
}

function reportNumber(
  value: number | null,
  locale: string,
): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat(locale, {
        maximumFractionDigits: 2,
        useGrouping: false,
      }).format(value);
}

function ClassAuditReport({
  report,
  onReviewEvent,
}: {
  readonly report: AuditAssignmentReportV1;
  readonly onReviewEvent: (
    runId: string,
    eventId: string,
  ) => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  return (
    <section className="instructor-review__audit-report">
      <h3>{t("instructorReview.auditClassHeading")}</h3>
      <p>{t("instructorReview.auditClassHelp")}</p>
      <p className="notice notice--standalone">
        {t("instructorReview.auditReviewOnly")}
      </p>
      <dl className="instructor-review__facts">
        <div>
          <dt>{t("instructorReview.auditRuns")}</dt>
          <dd>{report.summary.runCount}</dd>
        </div>
        <div>
          <dt>{t("instructorReview.auditCompletedRuns")}</dt>
          <dd>{report.summary.completedRunCount}</dd>
        </div>
        <div>
          <dt>{t("instructorReview.auditMeanScore")}</dt>
          <dd>
            {reportNumber(
              report.summary.meanCompletedScore,
              t.locale,
            )}
          </dd>
        </div>
        <div>
          <dt>{t("instructorReview.auditConfirmed")}</dt>
          <dd>{report.summary.confirmedFindingCount}</dd>
        </div>
        <div>
          <dt>{t("instructorReview.auditUnsupported")}</dt>
          <dd>{report.summary.unsupportedFindingCount}</dd>
        </div>
        <div>
          <dt>{t("instructorReview.auditMissed")}</dt>
          <dd>{report.summary.missedFindingCount}</dd>
        </div>
      </dl>
      <h4>{t("instructorReview.auditLearnerRuns")}</h4>
      {report.runs.length === 0 ? (
        <p>{t("instructorReview.auditNoRuns")}</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t("instructorReview.learner")}</th>
                <th scope="col">{t("instructorReview.runId")}</th>
                <th scope="col">{t("instructorReview.auditCase")}</th>
                <th scope="col">{t("instructorReview.auditVariant")}</th>
                <th scope="col">{t("instructorReview.auditScore")}</th>
                <th scope="col">{t("instructorReview.auditFindings")}</th>
              </tr>
            </thead>
            <tbody>
              {report.runs.map((run) => (
                <tr key={run.runId}>
                  <td><code>{run.learnerUserId}</code></td>
                  <td><code>{run.runId}</code></td>
                  <td>
                    <code>
                      {run.auditCaseId}@{run.auditCaseVersion}
                    </code>
                  </td>
                  <td>
                    {run.variant === null ? (
                      t("instructorReview.none")
                    ) : (
                      <>
                        <code>{run.variant.variantId}</code>
                        <br />
                        {run.variant.caseReference}
                      </>
                    )}
                  </td>
                  <td>
                    {run.score === null
                      ? t("instructorReview.none")
                      : `${reportNumber(run.score, t.locale)}/${reportNumber(run.maximumScore, t.locale)}`}
                  </td>
                  <td>
                    {run.findings.length === 0 ? (
                      t("instructorReview.auditNoFindings")
                    ) : (
                      <ul className="instructor-review__evidence-list">
                        {run.findings.map((finding) => (
                          <li key={finding.findingId}>
                            <span>
                              <strong>{finding.title}</strong>
                              <br />
                              <code>{finding.findingId}</code>
                              {" — "}
                              {t(
                                `instructorReview.auditClassification.${finding.classification}`,
                              )}
                              <br />
                              {t("instructorReview.auditCitationSummary", {
                                evidence: finding.evidenceIds.length,
                                policies: finding.policyIds.length,
                              })}
                            </span>
                            <button
                              aria-label={t(
                                "instructorReview.auditReviewFindingEventLabel",
                                { findingId: finding.findingId },
                              )}
                              className="button button--secondary"
                              type="button"
                              onClick={() =>
                                void onReviewEvent(
                                  run.runId,
                                  finding.eventId,
                                )
                              }
                            >
                              {t(
                                "instructorReview.auditReviewFindingEvent",
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {report.variantDistribution.length === 0 ? null : (
        <>
          <h4>{t("instructorReview.auditDistributionHeading")}</h4>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("instructorReview.auditVariant")}</th>
                  <th scope="col">{t("instructorReview.auditCaseReference")}</th>
                  <th scope="col">{t("instructorReview.auditRuns")}</th>
                  <th scope="col">{t("instructorReview.auditCompletedRuns")}</th>
                </tr>
              </thead>
              <tbody>
                {report.variantDistribution.map((variant) => (
                  <tr key={variant.variantId}>
                    <td>
                      <code>
                        {variant.variantId}@{variant.variantVersion}
                      </code>
                    </td>
                    <td>{variant.caseReference}</td>
                    <td>{variant.runCount}</td>
                    <td>{variant.completedRunCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {report.calibration === null ? null : (
        <>
          <h4>{t("instructorReview.auditCalibrationHeading")}</h4>
          <p>
            {t("instructorReview.auditCalibrationHelp", {
              bankId: report.calibration.bankId,
              status: report.calibration.bankStatus,
              minimum:
                report.calibration
                  .minimumRecommendedPilotSamplePerVariant,
            })}
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("instructorReview.auditVariant")}</th>
                  <th scope="col">{t("instructorReview.auditSample")}</th>
                  <th scope="col">{t("instructorReview.auditMeanScore")}</th>
                  <th scope="col">{t("instructorReview.auditPassRate")}</th>
                  <th scope="col">{t("instructorReview.auditMeanTime")}</th>
                  <th scope="col">{t("instructorReview.auditUnsupported")}</th>
                  <th scope="col">{t("instructorReview.auditMissed")}</th>
                </tr>
              </thead>
              <tbody>
                {report.calibration.variants.map((variant) => (
                  <tr key={variant.variantId}>
                    <td><code>{variant.variantId}</code></td>
                    <td>{variant.sampleSize}</td>
                    <td>{reportNumber(variant.meanScore, t.locale)}</td>
                    <td>
                      {reportNumber(
                        variant.passRatePercent,
                        t.locale,
                      )}
                    </td>
                    <td>
                      {reportNumber(
                        variant.meanCompletionSeconds,
                        t.locale,
                      )}
                    </td>
                    <td>
                      {reportNumber(
                        variant.meanFalsePositiveCount,
                        t.locale,
                      )}
                    </td>
                    <td>
                      {reportNumber(
                        variant.meanMissedFindingCount,
                        t.locale,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function curriculumCrosswalkLabels(
  crosswalk: AssignmentCurriculumOverlayV2,
  locale: string,
): AssignmentCurriculumOverlayV2["labelsByLocale"][string] {
  return (
    crosswalk.labelsByLocale[locale] ??
    crosswalk.labelsByLocale.en ??
    Object.values(crosswalk.labelsByLocale)[0] ?? {
      title: crosswalk.overlayId,
      ownerDisplayName: crosswalk.owner.ownerId,
      externalFrameworkTitle:
        crosswalk.externalFrameworkId,
      outcomeTitles: {},
    }
  );
}

function ClassCurriculumCrosswalkReport({
  report,
}: {
  readonly report: AssignmentCurriculumOverlayReportV2;
}): ReactNode {
  const t = useTranslator();
  return (
    <section className="instructor-review__curriculum-crosswalks">
      <h3>{t("instructorReview.curriculumHeading")}</h3>
      <p>{t("instructorReview.curriculumHelp")}</p>
      <a
        className="button button--secondary"
        href={`/api/v1/assignments/${encodeURIComponent(report.assignmentId)}/curriculum-crosswalks.json`}
        download
      >
        {t("instructorReview.curriculumDownloadJson")}
      </a>
      {report.overlays.length === 0 ? (
        <p>{t("instructorReview.curriculumNone")}</p>
      ) : (
        report.overlays.map((crosswalk) => {
          const labels = curriculumCrosswalkLabels(
            crosswalk,
            t.locale,
          );
          return (
            <article key={crosswalk.overlayId}>
              <h4>{labels.title}</h4>
              <p>
                {t("instructorReview.curriculumOwnerValue", {
                  owner: labels.ownerDisplayName,
                  ownerType: crosswalk.owner.ownerType,
                })}
              </p>
              <p>
                {t("instructorReview.curriculumFrameworkValue", {
                  framework: labels.externalFrameworkTitle,
                  crosswalkVersion: crosswalk.overlayVersion,
                  frameworkVersion:
                    crosswalk.externalFrameworkVersion,
                })}
              </p>
              <p>
                {t("instructorReview.curriculumEffectiveValue", {
                  date: crosswalk.effectiveFrom,
                })}
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        {t("instructorReview.curriculumOutcome")}
                      </th>
                      <th scope="col">
                        {t(
                          "instructorReview.curriculumPrimaryIndicators",
                        )}
                      </th>
                      <th scope="col">
                        {t(
                          "instructorReview.curriculumSupportingIndicators",
                        )}
                      </th>
                      <th scope="col">
                        {t(
                          "instructorReview.curriculumContextualIndicators",
                        )}
                      </th>
                      <th scope="col">
                        {t("instructorReview.learnersObserved")}
                      </th>
                      <th scope="col">
                        {t(
                          "instructorReview.evidenceRecordCount",
                        )}
                      </th>
                      <th scope="col">
                        {t(
                          "instructorReview.currentRatingCount",
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {crosswalk.classOutcomes.map((outcome) => (
                      <tr key={outcome.outcomeId}>
                        <td>
                          <strong>
                            {labels.outcomeTitles[
                              outcome.outcomeId
                            ] ?? outcome.outcomeId}
                          </strong>
                          <br />
                          <code>{outcome.outcomeId}</code>
                        </td>
                        <td>
                          {outcome.primaryIndicatorIds.length === 0
                            ? t("instructorReview.none")
                            : outcome.primaryIndicatorIds.join(", ")}
                        </td>
                        <td>
                          {outcome.supportingIndicatorIds.length ===
                          0
                            ? t("instructorReview.none")
                            : outcome.supportingIndicatorIds.join(
                                ", ",
                              )}
                        </td>
                        <td>
                          {outcome.contextualIndicatorIds.length === 0
                            ? t("instructorReview.none")
                            : outcome.contextualIndicatorIds.join(
                                ", ",
                              )}
                        </td>
                        <td>
                          {t(
                            "instructorReview.learnersObservedValue",
                            {
                              observed:
                                outcome.learnersWithEvidence,
                              assigned:
                                outcome.assignedLearnerCount,
                            },
                          )}
                        </td>
                        <td>
                          {outcome.evidenceObservationCount}
                        </td>
                        <td>{outcome.currentRatingCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}

function ClassDecisionOutcomeReport({
  report,
}: {
  readonly report: HostedAssignmentDecisionOutcomeReportV1;
}): ReactNode {
  const t = useTranslator();
  const itemCounts = new Map<
    string,
    { submittedCount: number; authoredCorrectCount: number }
  >();
  for (const run of report.runs) {
    for (const item of run.decisionItems) {
      const counts = itemCounts.get(item.decisionItemId) ?? {
        submittedCount: 0,
        authoredCorrectCount: 0,
      };
      itemCounts.set(item.decisionItemId, {
        submittedCount: counts.submittedCount + 1,
        authoredCorrectCount:
          counts.authoredCorrectCount +
          (item.isAuthoredCorrect ? 1 : 0),
      });
    }
  }
  const itemSummaries = [...itemCounts]
    .map(([decisionItemId, counts]) => ({
      decisionItemId,
      ...counts,
    }))
    .sort((left, right) =>
      left.decisionItemId < right.decisionItemId
        ? -1
        : left.decisionItemId > right.decisionItemId
          ? 1
          : 0,
    );
  return (
    <section>
      <h3>{t("instructorReview.decisionOutcomeHeading")}</h3>
      <p>{t("instructorReview.decisionOutcomeHelp")}</p>
      <h4>{t("instructorReview.decisionItemSummaryHeading")}</h4>
      {itemSummaries.length === 0 ? (
        <p>{t("instructorReview.decisionOutcomeUnavailable")}</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">
                  {t("instructorReview.decisionItem")}
                </th>
                <th scope="col">
                  {t("instructorReview.completedSubmissions")}
                </th>
                <th scope="col">
                  {t("instructorReview.authoredCorrectSubmissions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {itemSummaries.map((item) => (
                <tr key={item.decisionItemId}>
                  <td>
                    <code>{item.decisionItemId}</code>
                  </td>
                  <td>{item.submittedCount}</td>
                  <td>{item.authoredCorrectCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h4>{t("instructorReview.runOutcomeComparisonHeading")}</h4>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("instructorReview.learner")}</th>
              <th scope="col">{t("instructorReview.runId")}</th>
              <th scope="col">
                {t("instructorReview.authoredDecisionEvidence")}
              </th>
              <th scope="col">
                {t("instructorReview.realizedOutcome")}
              </th>
            </tr>
          </thead>
          <tbody>
            {report.runs.map((run) => {
              const authoredCorrectCount = run.decisionItems.filter(
                (item) => item.isAuthoredCorrect,
              ).length;
              return (
                <tr key={run.runId}>
                  <td>
                    <code>{run.learnerUserId}</code>
                  </td>
                  <td>
                    <code>{run.runId}</code>
                  </td>
                  <td>
                    {run.status === "active"
                      ? t("instructorReview.decisionOutcomeUnavailable")
                      : t(
                          "instructorReview.authoredDecisionEvidenceValue",
                          {
                            correct: authoredCorrectCount,
                            total: run.decisionItems.length,
                          },
                        )}
                  </td>
                  <td>
                    {run.realizedOutcome === null ? (
                      t("instructorReview.decisionOutcomeUnavailable")
                    ) : (
                      <code>{run.realizedOutcome.outcomeCode}</code>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProcessAnalyticsCounts({
  counts,
  emptyLabel,
}: {
  readonly counts: Readonly<Record<string, number>>;
  readonly emptyLabel: string;
}): ReactNode {
  const entries = Object.entries(counts).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return entries.length === 0 ? (
    <span>{emptyLabel}</span>
  ) : (
    <ul>
      {entries.map(([itemId, count]) => (
        <li key={itemId}>
          <code>{itemId}</code>: {count}
        </li>
      ))}
    </ul>
  );
}

function ClassProcessAnalyticsReport({
  report,
  onReviewEvent,
}: {
  readonly report: AssignmentProcessAnalyticsV1;
  readonly onReviewEvent: (
    runId: string,
    eventId: string,
  ) => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  return (
    <section>
      <h3>{t("instructorReview.processAnalytics.heading")}</h3>
      <p>{t("instructorReview.processAnalytics.help")}</p>
      <p className="muted">
        {t("instructorReview.processAnalytics.rule", {
          ruleVersion: report.ruleVersion,
        })}
      </p>
      <dl className="instructor-review__facts">
        <div>
          <dt>{t("instructorReview.processAnalytics.runs")}</dt>
          <dd>{report.summary.runCount}</dd>
        </div>
        <div>
          <dt>
            {t("instructorReview.processAnalytics.rejections")}
          </dt>
          <dd>{report.summary.rejectedAttemptCount}</dd>
        </div>
        <div>
          <dt>
            {t("instructorReview.processAnalytics.mitigations")}
          </dt>
          <dd>{report.summary.mitigationCount}</dd>
        </div>
      </dl>
      <details>
        <summary>
          {t("instructorReview.processAnalytics.classCounts")}
        </summary>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">
                  {t("instructorReview.processAnalytics.measure")}
                </th>
                <th scope="col">
                  {t("instructorReview.processAnalytics.observations")}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">
                  {t(
                    "instructorReview.processAnalytics.evidenceInspections",
                  )}
                </th>
                <td>
                  <ProcessAnalyticsCounts
                    counts={report.summary.evidenceInspectionCounts}
                    emptyLabel={t("instructorReview.none")}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  {t(
                    "instructorReview.processAnalytics.evidenceCitations",
                  )}
                </th>
                <td>
                  <ProcessAnalyticsCounts
                    counts={report.summary.evidenceCitationCounts}
                    emptyLabel={t("instructorReview.none")}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  {t(
                    "instructorReview.processAnalytics.policyConsultations",
                  )}
                </th>
                <td>
                  <ProcessAnalyticsCounts
                    counts={report.summary.policyConsultationCounts}
                    emptyLabel={t("instructorReview.none")}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  {t(
                    "instructorReview.processAnalytics.decisionSubmissions",
                  )}
                </th>
                <td>
                  <ProcessAnalyticsCounts
                    counts={report.summary.decisionSubmissionCounts}
                    emptyLabel={t("instructorReview.none")}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
      {report.runs.map((run) => {
        const sourceEvents = [
          ...run.evidenceInspectionOrder,
          ...run.policyConsultationOrder,
          ...run.decisions,
        ].sort(
          (left, right) =>
            left.sequenceNumber - right.sequenceNumber,
        );
        return (
          <details key={run.runId}>
            <summary>
              {t("instructorReview.processAnalytics.run", {
                runId: run.runId,
                learnerId: run.learnerUserId,
              })}
            </summary>
            {sourceEvents.length === 0 ? (
              <p>{t("instructorReview.processAnalytics.noEvents")}</p>
            ) : (
              <ol>
                {sourceEvents.map((source) => (
                  <li key={source.eventId}>
                    <button
                      className="button button--text"
                      type="button"
                      onClick={() =>
                        void onReviewEvent(
                          run.runId,
                          source.eventId,
                        )
                      }
                    >
                      {t("instructorReview.processAnalytics.reviewEvent", {
                        sequence: source.sequenceNumber,
                      })}
                    </button>
                    {"itemId" in source ? (
                      <>
                        {" "}
                        <code>{source.itemId}</code>
                      </>
                    ) : (
                      <>
                        {" "}
                        <code>{source.decisionId}</code>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </details>
        );
      })}
      <p className="notice notice--standalone">
        {t("instructorReview.processAnalytics.limitations")}
      </p>
    </section>
  );
}

function AssignmentLiveMonitor({
  monitor,
  isRefreshing,
  onRefresh,
}: {
  readonly monitor: HostedAssignmentMonitorV1;
  readonly isRefreshing: boolean;
  readonly onRefresh: () => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  return (
    <section className="instructor-review__monitor">
      <div className="instructor-review__monitor-heading">
        <div>
          <h3>{t("instructorReview.monitorHeading")}</h3>
          <p>{t("instructorReview.monitorHelp")}</p>
        </div>
        <button
          className="button button--secondary"
          type="button"
          disabled={isRefreshing}
          onClick={() => void onRefresh()}
        >
          {isRefreshing
            ? t("instructorReview.monitorRefreshing")
            : t("instructorReview.monitorRefresh")}
        </button>
      </div>
      <p className="muted">
        {t("instructorReview.monitorGeneratedAt")}{" "}
        <time dateTime={monitor.generatedAt}>
          {monitor.generatedAt}
        </time>
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("instructorReview.learner")}</th>
              <th scope="col">{t("instructorReview.runId")}</th>
              <th scope="col">{t("instructorReview.status")}</th>
              <th scope="col">{t("instructorReview.monitorStage")}</th>
              <th scope="col">{t("instructorReview.monitorRole")}</th>
              <th scope="col">{t("instructorReview.monitorElapsed")}</th>
              <th scope="col">
                {t("instructorReview.monitorLastActivity")}
              </th>
              <th scope="col">
                {t("instructorReview.monitorPendingActions")}
              </th>
              <th scope="col">
                {t("instructorReview.monitorTechnicalStatus")}
              </th>
            </tr>
          </thead>
          <tbody>
            {monitor.learners.flatMap((learner) =>
              learner.runs.length === 0
                ? [
                    <tr key={learner.learnerUserId}>
                      <td>
                        <code>{learner.learnerUserId}</code>
                      </td>
                      <td colSpan={8}>
                        {t("instructorReview.notStarted")}
                      </td>
                    </tr>,
                  ]
                : learner.runs.map((run) => (
                    <tr key={run.runId}>
                      <td>
                        <code>{run.learnerUserId}</code>
                      </td>
                      <td>
                        <code>{run.runId}</code>
                      </td>
                      <td>
                        {t(`instructorReview.runStatus.${run.status}`)}
                      </td>
                      <td>
                        {run.currentStageId === null ? (
                          t("instructorReview.none")
                        ) : (
                          <code>{run.currentStageId}</code>
                        )}
                      </td>
                      <td>
                        {run.activeRoleId === null ? (
                          t("instructorReview.none")
                        ) : (
                          <code>{run.activeRoleId}</code>
                        )}
                      </td>
                      <td>
                        {run.elapsedSeconds === null
                          ? t("instructorReview.none")
                          : t(
                              "instructorReview.monitorElapsedValue",
                              { count: run.elapsedSeconds },
                            )}
                      </td>
                      <td>
                        {run.lastActivityAt === null ? (
                          t("instructorReview.none")
                        ) : (
                          <time dateTime={run.lastActivityAt}>
                            {run.lastActivityAt}
                          </time>
                        )}
                      </td>
                      <td>
                        {run.pendingActionIds.length === 0
                          ? t("instructorReview.none")
                          : run.pendingActionIds.join(", ")}
                      </td>
                      <td>
                        <StatusPill
                          tone={
                            run.technicalStatus === "ok"
                              ? "pass"
                              : "fail"
                          }
                        >
                          {t(
                            `instructorReview.monitorTechnical.${run.technicalStatus}`,
                          )}
                        </StatusPill>
                      </td>
                    </tr>
                  )),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClassCompetencyReport({
  report,
  onReviewEvent,
}: {
  readonly report: HostedAssignmentCompetencyReportV1;
  readonly onReviewEvent: (
    runId: string,
    eventId: string,
  ) => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  return (
    <div className="instructor-review__competency-report">
      <h3>{t("instructorReview.classCompetencyHeading")}</h3>
      <p>{t("instructorReview.classCompetencyHelp")}</p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("instructorReview.indicator")}</th>
              <th scope="col">{t("instructorReview.targetType")}</th>
              <th scope="col">
                {t("instructorReview.learnersObserved")}
              </th>
              <th scope="col">
                {t("instructorReview.evidenceRecordCount")}
              </th>
              <th scope="col">
                {t("instructorReview.currentRatingCount")}
              </th>
              <th scope="col">
                {t("instructorReview.ratingDistribution")}
              </th>
            </tr>
          </thead>
          <tbody>
            {report.classIndicators.map((indicator) => (
              <tr key={indicator.indicatorId}>
                <td>
                  <code>{indicator.indicatorId}</code>
                </td>
                <td>
                  {t(
                    `instructorReview.targetType.${indicator.targetType}`,
                  )}
                </td>
                <td>
                  {t("instructorReview.learnersObservedValue", {
                    observed: indicator.learnersWithEvidence,
                    assigned: indicator.assignedLearnerCount,
                  })}
                </td>
                <td>{indicator.evidenceCount}</td>
                <td>{indicator.currentRatingCount}</td>
                <td>
                  {indicator.ratingDistribution.length === 0 ? (
                    t("instructorReview.noCurrentRatings")
                  ) : (
                    <ul className="instructor-review__compact-list">
                      {indicator.ratingDistribution.map((entry) => (
                        <li key={entry.levelValue}>
                          {t(
                            "instructorReview.ratingDistributionValue",
                            {
                              level: entry.levelValue,
                              count: entry.count,
                            },
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LearnerCompetencyProfiles
        report={report}
        onReviewEvent={onReviewEvent}
      />
    </div>
  );
}

function LearnerCompetencyProfiles({
  report,
  onReviewEvent,
}: {
  readonly report: HostedAssignmentCompetencyReportV1;
  readonly onReviewEvent: (
    runId: string,
    eventId: string,
  ) => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  return (
    <section className="instructor-review__learner-profiles">
      <h3>{t("instructorReview.learnerProfilesHeading")}</h3>
      <p>{t("instructorReview.learnerProfilesHelp")}</p>
      {report.learners.map((learner) => (
        <details
          className="instructor-review__learner-profile"
          key={learner.learnerUserId}
        >
          <summary>
            <code>{learner.learnerUserId}</code>
          </summary>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("instructorReview.indicator")}</th>
                  <th scope="col">{t("instructorReview.targetType")}</th>
                  <th scope="col">{t("instructorReview.scenario")}</th>
                  <th scope="col">
                    {t("instructorReview.evidenceRecordCount")}
                  </th>
                  <th scope="col">
                    {t("instructorReview.latestEvidence")}
                  </th>
                  <th scope="col">
                    {t("instructorReview.performanceAndComments")}
                  </th>
                  <th scope="col">
                    {t("instructorReview.supportingEvents")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {learner.indicators.map((indicator) => (
                  <tr key={indicator.indicatorId}>
                    <td>
                      <code>{indicator.indicatorId}</code>
                    </td>
                    <td>
                      {t(
                        `instructorReview.targetType.${indicator.targetType}`,
                      )}
                    </td>
                    <td>
                      <code>
                        {report.scenarioId}@{report.scenarioVersion}
                      </code>
                    </td>
                    <td>{indicator.evidenceCount}</td>
                    <td>
                      {indicator.latestObservedAt === undefined ? (
                        t("instructorReview.none")
                      ) : (
                        <time dateTime={indicator.latestObservedAt}>
                          {indicator.latestObservedAt}
                        </time>
                      )}
                    </td>
                    <td>
                      {indicator.currentRatings.length === 0 ? (
                        t("instructorReview.noCurrentRatings")
                      ) : (
                        <ul className="instructor-review__compact-list">
                          {indicator.currentRatings.map((rating) => (
                            <li key={rating.ratingId}>
                              <strong>
                                {t("instructorReview.ratingValue", {
                                  level: rating.levelValue,
                                })}
                              </strong>
                              {rating.comment.length === 0
                                ? null
                                : ` — ${rating.comment}`}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>
                      {indicator.observations.length === 0 ? (
                        t("instructorReview.none")
                      ) : (
                        <ul className="instructor-review__compact-list">
                          {indicator.observations.map((observation) => (
                            <li
                              key={`${observation.runId}:${observation.competencyEvidenceId}`}
                            >
                              <code>{observation.runId}</code>
                              {": "}
                              {observation.sourceEventIds.map(
                                (eventId, index) => (
                                  <span key={eventId}>
                                    {index === 0 ? null : ", "}
                                    <code>{eventId}</code>
                                    {" "}
                                    <button
                                      aria-label={t(
                                        "instructorReview.reviewSupportingEvent",
                                        { eventId },
                                      )}
                                      className="button button--secondary instructor-review__event-link"
                                      type="button"
                                      onClick={() =>
                                        void onReviewEvent(
                                          observation.runId,
                                          eventId,
                                        )
                                      }
                                    >
                                      {t("instructorReview.reviewEvent")}
                                    </button>
                                  </span>
                                ),
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </section>
  );
}

function RunReview({
  api,
  review,
  runId,
  mayReleaseFeedback,
  mayModerate,
  targetEventId,
  onRefresh,
}: {
  readonly api: InstructorReviewApi;
  readonly review: InstructorRunReview;
  readonly runId: string;
  readonly mayReleaseFeedback: boolean;
  readonly mayModerate: boolean;
  readonly targetEventId: string | null;
  readonly onRefresh: () => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  const targetEventRef = useRef<HTMLTableRowElement>(null);
  const [isReleasing, setReleasing] = useState(false);
  const [releaseErrorKey, setReleaseErrorKey] =
    useState<string | null>(null);
  const [replay, setReplay] = useState<InstructorRunReplayV1 | null>(
    null,
  );
  const [replayLoadingSequence, setReplayLoadingSequence] =
    useState<number | null>(null);
  const [replayErrorKey, setReplayErrorKey] =
    useState<string | null>(null);
  const [incidentBusyId, setIncidentBusyId] =
    useState<string | null>(null);
  const [incidentError, setIncidentError] = useState(false);

  useEffect(() => {
    if (targetEventId !== null) {
      targetEventRef.current?.focus();
    }
  }, [review.timeline, targetEventId]);

  async function releaseFeedback() {
    setReleasing(true);
    setReleaseErrorKey(null);
    try {
      await api.releaseFeedback(review.assignment.assignmentId);
      await onRefresh();
    } catch (error) {
      setReleaseErrorKey(errorMessageKey(error));
    } finally {
      setReleasing(false);
    }
  }

  async function replayAt(sequenceNumber: number) {
    setReplayLoadingSequence(sequenceNumber);
    setReplayErrorKey(null);
    try {
      setReplay(await api.loadRunReplay(runId, sequenceNumber));
    } catch (error) {
      setReplayErrorKey(errorMessageKey(error));
    } finally {
      setReplayLoadingSequence(null);
    }
  }

  async function releaseIncident(incidentId: string) {
    if (
      api.releaseInstructorIncident === undefined ||
      review.instructorIncidents === undefined
    ) {
      return;
    }
    setIncidentBusyId(incidentId);
    setIncidentError(false);
    try {
      await api.releaseInstructorIncident(
        runId,
        review.instructorIncidents.runVersion,
        incidentId,
      );
      await onRefresh();
    } catch {
      setIncidentError(true);
    } finally {
      setIncidentBusyId(null);
    }
  }

  return (
    <div className="instructor-review__results" aria-live="polite">
      <section className="card card--brief">
        <h2>{t("instructorReview.summaryHeading")}</h2>
        <p>
          {t("instructorReview.summary", {
            runId,
            eventCount: review.timeline.length,
            competencyCount: review.competencies.length,
            criterionCount: review.rubricEvidence.length,
          })}
        </p>
        <dl className="instructor-review__facts">
          <div>
            <dt>{t("instructorReview.assignmentId")}</dt>
            <dd>
              <code>{review.assignment.assignmentId}</code>
            </dd>
          </div>
          <div>
            <dt>{t("instructorReview.feedbackStatus")}</dt>
            <dd>
              {t(
                `instructorReview.feedback.${review.assignment.feedbackReleaseStatus}`,
              )}
            </dd>
          </div>
        </dl>
        {mayReleaseFeedback &&
        review.assignment.feedbackReleaseStatus === "withheld" ? (
          <button
            className="button button--secondary"
            type="button"
            disabled={isReleasing}
            onClick={() => void releaseFeedback()}
          >
            {isReleasing
              ? t("instructorReview.feedbackReleasing")
              : t("instructorReview.feedbackRelease")}
          </button>
        ) : null}
        {releaseErrorKey === null ? null : (
          <p className="notice notice--standalone" role="alert">
            {t(releaseErrorKey)}
          </p>
        )}
      </section>

      {!mayReleaseFeedback ||
      review.instructorIncidents === undefined ||
      review.instructorIncidents.incidents.length === 0 ? null : (
        <section className="card card--work">
          <h2>{t("instructorReview.director.heading")}</h2>
          <p>{t("instructorReview.director.help")}</p>
          <ul className="instructor-review__evidence-list">
            {review.instructorIncidents.incidents.map((incident) => (
              <li key={incident.incidentId}>
                <span>
                  <strong>{runLocalizedText(incident.title, t)}</strong>
                  <br />
                  {runLocalizedText(incident.message, t)}
                </span>
                {incident.status === "released" ? (
                  <StatusPill tone="pass">
                    {t("instructorReview.director.released")}
                  </StatusPill>
                ) : (
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={
                      incident.status !== "available" ||
                      incidentBusyId !== null
                    }
                    onClick={() =>
                      void releaseIncident(incident.incidentId)
                    }
                  >
                    {incidentBusyId === incident.incidentId
                      ? t("instructorReview.director.releasing")
                      : incident.status === "available"
                        ? t("instructorReview.director.release")
                        : t("instructorReview.director.unavailable")}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {incidentError ? (
            <p className="notice notice--standalone" role="alert">
              {t("instructorReview.director.error")}
            </p>
          ) : null}
        </section>
      )}

      {review.timeline.some(
        (event) => event.eventType === "RUN_COMPLETED",
      ) &&
      review.assignment.counterfactualReplay.enabled &&
      api.counterfactuals !== undefined ? (
        <CounterfactualExplorer
          api={api.counterfactuals}
          sourceRunId={runId}
          renderContinuation={(options) => (
            <HostedRunActionControls {...options} />
          )}
        />
      ) : null}

      <section className="card card--reference">
        <h2>{t("instructorReview.timelineHeading")}</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t("instructorReview.sequence")}</th>
                <th scope="col">{t("instructorReview.event")}</th>
                <th scope="col">{t("instructorReview.context")}</th>
                <th scope="col">{t("instructorReview.time")}</th>
                <th scope="col">{t("instructorReview.replay")}</th>
              </tr>
            </thead>
            <tbody>
              {review.timeline.map((item) => {
                const isTargetEvent = item.eventId === targetEventId;
                return (
                <tr
                  aria-current={isTargetEvent ? "true" : undefined}
                  className={
                    isTargetEvent
                      ? "instructor-review__target-event"
                      : undefined
                  }
                  key={item.eventId}
                  ref={isTargetEvent ? targetEventRef : undefined}
                  tabIndex={isTargetEvent ? -1 : undefined}
                >
                  <td>{item.sequenceNumber}</td>
                  <td>
                    <code>{item.eventId}</code>
                    <br />
                    <code>{item.eventType}</code>
                  </td>
                  <td>
                    <code>{item.organizationId}</code>
                    <br />
                    <code>{item.roleId}</code>
                  </td>
                  <td>
                    <time dateTime={item.occurredAt}>{item.occurredAt}</time>
                  </td>
                  <td>
                    <button
                      aria-label={t(
                        "instructorReview.replayAtEvent",
                        { sequence: item.sequenceNumber },
                      )}
                      className="button button--secondary"
                      type="button"
                      disabled={replayLoadingSequence !== null}
                      onClick={() =>
                        void replayAt(item.sequenceNumber)
                      }
                    >
                      {replayLoadingSequence === item.sequenceNumber
                        ? t("instructorReview.replayLoading")
                        : t("instructorReview.replay")}
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {replayErrorKey === null ? null : (
          <p className="notice notice--standalone" role="alert">
            {t(replayErrorKey)}
          </p>
        )}
        {replay === null ? null : (
          <div
            className="instructor-review__replay"
            role="status"
          >
            <h3>
              {t("instructorReview.replayHeading", {
                sequence: replay.throughSequenceNumber,
              })}
            </h3>
            <p>{t("instructorReview.replayHelp")}</p>
            {replay.projection.staffProfile === undefined ? null : (
              <HostedStaffIdentity
                profile={replay.projection.staffProfile}
                labelKey="instructorReview.replayRole"
                compact
              />
            )}
            <dl className="instructor-review__facts">
              <div>
                <dt>{t("instructorReview.event")}</dt>
                <dd>
                  <code>{replay.selectedEvent.eventType}</code>
                </dd>
              </div>
              <div>
                <dt>{t("instructorReview.replayPosition")}</dt>
                <dd>
                  {t("instructorReview.replayPositionValue", {
                    sequence: replay.throughSequenceNumber,
                    total: replay.totalEventCount,
                  })}
                </dd>
              </div>
              <div>
                <dt>{t("instructorReview.replayRole")}</dt>
                <dd>
                  <code>{replay.projection.roleId}</code>
                </dd>
              </div>
              <div>
                <dt>{t("instructorReview.replayNode")}</dt>
                <dd>
                  <code>
                    {replay.projection.workflowState.currentNodeId}
                  </code>
                </dd>
              </div>
              <div>
                <dt>{t("instructorReview.replayVisibleEvidence")}</dt>
                <dd>
                  {replay.projection.audit?.evidence.length ??
                    replay.projection.informationState.length}
                </dd>
              </div>
              <div>
                <dt>{t("instructorReview.replayPermittedActions")}</dt>
                <dd>
                  {replay.projection.workflowState.permittedActionIds
                    .length === 0
                    ? t("instructorReview.none")
                    : replay.projection.workflowState.permittedActionIds.join(
                        ", ",
                      )}
                </dd>
              </div>
            </dl>
            {replay.projection.audit?.report === undefined ? null : (
              <HostedAuditReport
                report={replay.projection.audit.report}
              />
            )}
            <AuditFindingReplay
              replay={replay}
              timeline={review.timeline}
            />
            <DecisionTimeReview
              replay={replay}
              timeline={review.timeline}
            />
          </div>
        )}
      </section>

      <section className="card card--reference">
        <h2>{t("instructorReview.competencyHeading")}</h2>
        {review.competencies.length === 0 ? (
          <p>{t("instructorReview.noCompetencyEvidence")}</p>
        ) : (
          <ul className="instructor-review__evidence-list">
            {review.competencies.map((competency) => (
              <li key={competency.indicatorId}>
                <code>{competency.indicatorId}</code>
                <span>
                  {t("instructorReview.evidenceCount", {
                    count: competency.evidence.length,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card card--reference">
        <h2>{t("instructorReview.rubricHeading")}</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t("instructorReview.criterion")}</th>
                <th scope="col">{t("instructorReview.status")}</th>
                <th scope="col">{t("instructorReview.evidence")}</th>
                <th scope="col">{t("instructorReview.manualRating")}</th>
              </tr>
            </thead>
            <tbody>
              {review.rubricEvidence.map((criterion) => {
                const currentRating = review.ratings.find(
                  (rating) =>
                    rating.rubricId === criterion.rubricId &&
                    rating.criterionId === criterion.criterionId,
                );
                const currentResolution =
                  review.moderationResolutions.find(
                    (resolution) =>
                      resolution.rubricId === criterion.rubricId &&
                      resolution.criterionId ===
                        criterion.criterionId,
                  );
                const sourceRatings = review.ratings.filter(
                  (rating) =>
                    rating.rubricId === criterion.rubricId &&
                    rating.criterionId === criterion.criterionId,
                );
                return (
                  <RubricRatingRow
                    api={api}
                    criterion={criterion}
                    currentRating={currentRating}
                    currentResolution={currentResolution}
                    fallbackEvidenceId={
                      review.timeline[0]?.eventId ?? null
                    }
                    key={`${criterion.rubricId}:${criterion.criterionId}`}
                    onRefresh={onRefresh}
                    mayModerate={mayModerate}
                    runId={runId}
                    sourceRatings={sourceRatings}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AuditFindingReplay({
  replay,
  timeline,
}: {
  readonly replay: InstructorRunReplayV1;
  readonly timeline: readonly InstructorTimelineItem[];
}): ReactNode {
  const t = useTranslator();
  const selected = timeline.find(
    (event) => event.eventId === replay.selectedEvent.eventId,
  );
  if (
    selected === undefined ||
    (selected.eventType !== "AUDIT_FINDING_SUBMITTED" &&
      selected.eventType !== "AUDIT_FINDING_AMENDED" &&
      selected.eventType !== "AUDIT_FINDING_WITHDRAWN")
  ) {
    return null;
  }
  const payloadFinding = instructorRecord(selected.payload.finding);
  const findingId =
    typeof payloadFinding?.findingId === "string"
      ? payloadFinding.findingId
      : typeof selected.payload.findingId === "string"
        ? selected.payload.findingId
        : null;
  const finding =
    findingId === null
      ? undefined
      : replay.projection.audit?.findings.find(
          (candidate) => candidate.findingId === findingId,
        );
  const evidenceIds =
    finding?.evidenceIds ??
    stringList(payloadFinding?.evidenceIds);
  const policyIds =
    finding?.policyIds ??
    stringList(payloadFinding?.policyIds);
  return (
    <section className="instructor-review__finding-replay">
      <h4>{t("instructorReview.auditFindingReplayHeading")}</h4>
      <p>{t("instructorReview.auditFindingReplayHelp")}</p>
      <dl className="instructor-review__facts">
        <div>
          <dt>{t("instructorReview.auditFindingId")}</dt>
          <dd><code>{findingId ?? replay.selectedEvent.eventId}</code></dd>
        </div>
        <div>
          <dt>{t("instructorReview.event")}</dt>
          <dd><code>{selected.eventType}</code></dd>
        </div>
        <div>
          <dt>{t("instructorReview.auditFindingRevision")}</dt>
          <dd>
            {finding?.revision ??
              (typeof selected.payload.revision === "number"
                ? selected.payload.revision
                : typeof payloadFinding?.revision === "number"
                  ? payloadFinding.revision
                  : t("instructorReview.none"))}
          </dd>
        </div>
        <div>
          <dt>{t("instructorReview.auditFindingStatus")}</dt>
          <dd>
            {finding?.status ??
              (selected.eventType === "AUDIT_FINDING_WITHDRAWN"
                ? "WITHDRAWN"
                : "SUBMITTED")}
          </dd>
        </div>
        <div>
          <dt>{t("instructorReview.auditFindingSeverity")}</dt>
          <dd>{finding?.severity ?? t("instructorReview.none")}</dd>
        </div>
        <div>
          <dt>{t("instructorReview.auditFindingMateriality")}</dt>
          <dd>{finding?.materiality ?? t("instructorReview.none")}</dd>
        </div>
        <div>
          <dt>{t("instructorReview.auditEvidence")}</dt>
          <dd>
            {evidenceIds.length === 0
              ? t("instructorReview.none")
              : evidenceIds.join(", ")}
          </dd>
        </div>
        <div>
          <dt>{t("instructorReview.auditPolicies")}</dt>
          <dd>
            {policyIds.length === 0
              ? t("instructorReview.none")
              : policyIds.join(", ")}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function DecisionTimeReview({
  replay,
  timeline,
}: {
  readonly replay: InstructorRunReplayV1;
  readonly timeline: readonly InstructorTimelineItem[];
}): ReactNode {
  const t = useTranslator();
  const selectedEvent = timeline.find(
    (item) => item.eventId === replay.selectedEvent.eventId,
  );
  const citedEvidenceIds =
    selectedEvent === undefined
      ? null
      : citedIdsFromPayload(
          selectedEvent.payload,
          "citedEvidenceIds",
        );
  const citedPolicyIds =
    selectedEvent === undefined
      ? null
      : citedIdsFromPayload(
          selectedEvent.payload,
          "citedPolicyIds",
        );
  const availablePolicies =
    replay.projection.policyState.flatMap((record) => {
      if (
        typeof record.value !== "object" ||
        record.value === null ||
        Array.isArray(record.value)
      ) {
        return [];
      }
      const candidate = record.value as Readonly<
        Record<string, unknown>
      >;
      return typeof candidate.policyId === "string"
        ? [
            {
              record,
              policyId: candidate.policyId,
              titleKey:
                typeof candidate.titleKey === "string"
                  ? candidate.titleKey
                  : null,
            },
          ]
        : [];
    });
  return (
    <div className="instructor-review__decision-time-review">
      <section>
        <h4>{t("instructorReview.selectedResponseHeading")}</h4>
        <p>{t("instructorReview.selectedResponseHelp")}</p>
        <p>
          <code>{replay.selectedEvent.eventId}</code>
          {" — "}
          <code>{replay.selectedEvent.eventType}</code>
        </p>
        <pre className="instructor-review__json-evidence">
          <code>
            {JSON.stringify(selectedEvent?.payload ?? {}, null, 2)}
          </code>
        </pre>
      </section>
      <section>
        <h4>{t("instructorReview.availableEvidenceHeading")}</h4>
        <p>{t("instructorReview.availableEvidenceHelp")}</p>
        {citedEvidenceIds === null ? null : (
          <p>{t("instructorReview.evidenceUseHelp")}</p>
        )}
        {replay.projection.informationState.length === 0 ? (
          <p>{t("instructorReview.noVisibleEvidence")}</p>
        ) : (
          <div className="instructor-review__visible-evidence">
            {replay.projection.informationState.map((record) => {
              const wasCited =
                citedEvidenceIds?.has(record.recordId) ?? null;
              return (
                <details key={record.recordId}>
                  <summary>
                    <span>
                      <code>{record.recordId}</code>
                      {wasCited === null ? null : (
                        <span
                          className={`instructor-review__evidence-use instructor-review__evidence-use--${wasCited ? "cited" : "not-cited"}`}
                        >
                          {t(
                            wasCited
                              ? "instructorReview.evidenceCited"
                              : "instructorReview.evidenceNotCited",
                          )}
                        </span>
                      )}
                    </span>
                  </summary>
                  <pre className="instructor-review__json-evidence">
                    <code>{JSON.stringify(record.value, null, 2)}</code>
                  </pre>
                </details>
              );
            })}
          </div>
        )}
      </section>
      {availablePolicies.length === 0 &&
      citedPolicyIds === null ? null : (
        <section>
          <h4>{t("instructorReview.availablePoliciesHeading")}</h4>
          <p>{t("instructorReview.availablePoliciesHelp")}</p>
          {citedPolicyIds === null ? null : (
            <p>{t("instructorReview.policyUseHelp")}</p>
          )}
          {availablePolicies.length === 0 ? (
            <p>{t("instructorReview.noVisiblePolicies")}</p>
          ) : (
            <div className="instructor-review__visible-evidence">
              {availablePolicies.map(
                ({ record, policyId, titleKey }) => {
                  const wasCited =
                    citedPolicyIds?.has(policyId) ?? null;
                  return (
                    <details key={record.recordId}>
                      <summary>
                        <span>
                          <code>{policyId}</code>
                          {titleKey === null
                            ? null
                            : ` — ${t(titleKey)}`}
                          {wasCited === null ? null : (
                            <span
                              className={`instructor-review__evidence-use instructor-review__evidence-use--${wasCited ? "cited" : "not-cited"}`}
                            >
                              {t(
                                wasCited
                                  ? "instructorReview.evidenceCited"
                                  : "instructorReview.evidenceNotCited",
                              )}
                            </span>
                          )}
                        </span>
                      </summary>
                      <pre className="instructor-review__json-evidence">
                        <code>
                          {JSON.stringify(record.value, null, 2)}
                        </code>
                      </pre>
                    </details>
                  );
                },
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function instructorRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter(
        (candidate): candidate is string =>
          typeof candidate === "string",
      )
    : [];
}

function citedIdsFromPayload(
  payload: Readonly<Record<string, unknown>>,
  fieldName: "citedEvidenceIds" | "citedPolicyIds",
): ReadonlySet<string> | null {
  if (
    !Object.prototype.hasOwnProperty.call(payload, fieldName) ||
    !Array.isArray(payload[fieldName])
  ) {
    return null;
  }
  const citedIds = new Set<string>();
  for (const value of payload[fieldName]) {
    if (typeof value === "string") citedIds.add(value);
  }
  return citedIds;
}

function RubricRatingRow({
  api,
  criterion,
  currentRating,
  currentResolution,
  fallbackEvidenceId,
  onRefresh,
  mayModerate,
  runId,
  sourceRatings,
}: {
  readonly api: InstructorReviewApi;
  readonly criterion: RubricEvidenceProjection;
  readonly currentRating: ManualRubricRatingV1 | undefined;
  readonly currentResolution:
    | RubricModerationResolutionV1
    | undefined;
  readonly fallbackEvidenceId: string | null;
  readonly onRefresh: () => Promise<void>;
  readonly mayModerate: boolean;
  readonly runId: string;
  readonly sourceRatings: readonly ManualRubricRatingV1[];
}): ReactNode {
  const t = useTranslator();
  const [level, setLevel] = useState(
    currentRating?.levelValue ??
      criterion.allowedLevelValues[0] ??
      0,
  );
  const [comment, setComment] = useState(currentRating?.comment ?? "");
  const [isSaving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [moderationLevel, setModerationLevel] = useState(
    currentResolution?.levelValue ??
      currentRating?.levelValue ??
      criterion.allowedLevelValues[0] ??
      0,
  );
  const [moderationComment, setModerationComment] = useState(
    currentResolution?.comment ?? "",
  );
  const [isModerating, setModerating] = useState(false);
  const [moderationErrorKey, setModerationErrorKey] =
    useState<string | null>(null);
  const linkedEvidenceIds =
    criterion.observedEvidenceIds.length > 0
      ? criterion.observedEvidenceIds
      : fallbackEvidenceId === null
        ? []
        : [fallbackEvidenceId];

  async function save() {
    setSaving(true);
    setErrorKey(null);
    try {
      await api.saveRating(runId, {
        rubricId: criterion.rubricId,
        criterionId: criterion.criterionId,
        levelValue: level,
        comment,
        linkedEvidenceIds,
        expectedRevision: currentRating?.revision ?? 0,
      });
      await onRefresh();
    } catch (error) {
      setErrorKey(errorMessageKey(error));
    } finally {
      setSaving(false);
    }
  }

  async function moderate() {
    setModerating(true);
    setModerationErrorKey(null);
    try {
      await api.saveModeration(runId, {
        rubricId: criterion.rubricId,
        criterionId: criterion.criterionId,
        levelValue: moderationLevel,
        comment: moderationComment,
        sourceRatingIds: sourceRatings.map(
          (rating) => rating.ratingId,
        ),
        expectedRevision: currentResolution?.revision ?? 0,
      });
      await onRefresh();
    } catch (error) {
      setModerationErrorKey(errorMessageKey(error));
    } finally {
      setModerating(false);
    }
  }

  const controlId = `${criterion.rubricId}-${criterion.criterionId}`;
  return (
    <tr>
      <td>
        <code>{criterion.criterionId}</code>
      </td>
      <td>
        <StatusPill
          tone={
            criterion.status === "observed" ? "pass" : "neutral"
          }
        >
          {t(
            criterion.status === "observed"
              ? "instructorReview.observed"
              : "instructorReview.notObserved",
          )}
        </StatusPill>
      </td>
      <td>{criterion.observedEvidenceIds.length}</td>
      <td>
        <div className="instructor-review__rating">
          <label
            className="field__label"
            htmlFor={`${controlId}-level`}
          >
            {t("instructorReview.ratingLevel")}
          </label>
          <select
            className="field__control"
            id={`${controlId}-level`}
            value={level}
            onChange={(event) => setLevel(Number(event.target.value))}
          >
            {criterion.allowedLevelValues.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <label
            className="field__label"
            htmlFor={`${controlId}-comment`}
          >
            {t("instructorReview.ratingComment")}
          </label>
          <textarea
            className="field__control"
            id={`${controlId}-comment`}
            maxLength={1000}
            rows={2}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <button
            className="button button--secondary"
            type="button"
            disabled={isSaving || linkedEvidenceIds.length === 0}
            onClick={() => void save()}
          >
            {isSaving
              ? t("instructorReview.ratingSaving")
              : t("instructorReview.ratingSave")}
          </button>
          {currentRating === undefined ? null : (
            <span className="field__hint">
              {t("instructorReview.ratingRevision", {
                revision: currentRating.revision,
              })}
            </span>
          )}
          {errorKey === null ? null : (
            <span className="field__hint" role="alert">
              {t(errorKey)}
            </span>
          )}
          {!mayModerate || sourceRatings.length === 0 ? null : (
            <div className="instructor-review__moderation">
              <strong>{t("instructorReview.moderationHeading")}</strong>
              <span className="field__hint">
                {t("instructorReview.moderationSources", {
                  count: sourceRatings.length,
                })}
              </span>
              <label
                className="field__label"
                htmlFor={`${controlId}-moderation-level`}
              >
                {t("instructorReview.moderationLevel")}
              </label>
              <select
                className="field__control"
                id={`${controlId}-moderation-level`}
                value={moderationLevel}
                onChange={(event) =>
                  setModerationLevel(Number(event.target.value))
                }
              >
                {criterion.allowedLevelValues.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <label
                className="field__label"
                htmlFor={`${controlId}-moderation-comment`}
              >
                {t("instructorReview.moderationComment")}
              </label>
              <textarea
                className="field__control"
                id={`${controlId}-moderation-comment`}
                maxLength={1000}
                required
                rows={2}
                value={moderationComment}
                onChange={(event) =>
                  setModerationComment(event.target.value)
                }
              />
              <button
                className="button button--secondary"
                type="button"
                disabled={
                  isModerating ||
                  moderationComment.trim().length === 0
                }
                onClick={() => void moderate()}
              >
                {isModerating
                  ? t("instructorReview.moderationSaving")
                  : t("instructorReview.moderationSave")}
              </button>
              {currentResolution === undefined ? null : (
                <span className="field__hint">
                  {t("instructorReview.moderationRevision", {
                    revision: currentResolution.revision,
                  })}
                </span>
              )}
              {moderationErrorKey === null ? null : (
                <span className="field__hint" role="alert">
                  {t(moderationErrorKey)}
                </span>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
