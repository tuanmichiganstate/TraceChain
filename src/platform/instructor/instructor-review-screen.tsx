import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import { StatusPill } from "../../components/status-pill";
import type { ApplicationRole } from "../contracts/run-events";
import type {
  AssignmentRunMode,
  CreateHostedAssignmentRequest,
  HostedAssignmentMonitorV1,
  HostedAssignmentReportV1,
  HostedAssignmentV1,
  ManualRubricRatingV1,
  RubricModerationResolutionV1,
} from "../contracts/assessment";
import type {
  HostedAssignmentCompetencyReportV1,
} from "../contracts/competency-report";
import type { InstructorRunReplayV1 } from "../contracts/run-replay";
import type {
  ScormPackageJobV1,
  ScormPackagePresetId,
} from "../contracts/scorm-package-job";
import type {
  CompetencyEvidenceProjection,
  InstructorTimelineItem,
  RubricEvidenceProjection,
} from "../hosted/stage3-types";

export interface InstructorSession {
  readonly userId: string;
  readonly email: string;
  readonly roles: readonly ApplicationRole[];
}

export interface InstructorRunReview {
  readonly assignment: HostedAssignmentV1;
  readonly timeline: readonly InstructorTimelineItem[];
  readonly competencies: readonly CompetencyEvidenceProjection[];
  readonly rubricEvidence: readonly RubricEvidenceProjection[];
  readonly ratings: readonly ManualRubricRatingV1[];
  readonly moderationResolutions:
    readonly RubricModerationResolutionV1[];
}

export type CreateInstructorAssignmentInput = Omit<
  CreateHostedAssignmentRequest,
  "commandId" | "runConfiguration"
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
  loadRunReview(runId: string): Promise<InstructorRunReview>;
  loadRunReplay(
    runId: string,
    throughSequenceNumber: number,
  ): Promise<InstructorRunReplayV1>;
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
  saveRating(
    runId: string,
    input: SaveInstructorRatingInput,
  ): Promise<ManualRubricRatingV1>;
  saveModeration(
    runId: string,
    input: SaveInstructorModerationInput,
  ): Promise<RubricModerationResolutionV1>;
  releaseFeedback(assignmentId: string): Promise<HostedAssignmentV1>;
  loadScormPackageJobs?(): Promise<
    readonly (ScormPackageJobV1 & { readonly downloadUrl: string })[]
  >;
  createScormPackageJob?(
    presetId: ScormPackagePresetId,
  ): Promise<ScormPackageJobV1 & { readonly downloadUrl: string }>;
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

export function createInstructorReviewApi(
  fetcher: FetchLike = globalThis.fetch.bind(globalThis),
): InstructorReviewApi {
  return {
    loadSession: () =>
      responseJson<InstructorSession>(fetcher, "/api/v1/session"),
    async loadRunReview(runId) {
      const encodedRunId = encodeURIComponent(runId);
      const [timeline, competencies, rubricEvidence, assessment] =
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
      ]);
      return {
        assignment: assessment.assignment,
        timeline: timeline.timeline,
        competencies: competencies.competencies,
        rubricEvidence: rubricEvidence.rubricEvidence,
        ratings: assessment.ratings,
        moderationResolutions:
          assessment.moderationResolutions ?? [],
      };
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

export function InstructorReviewScreen({
  api = browserApi,
}: {
  readonly api?: InstructorReviewApi;
}): ReactNode {
  const t = useTranslator();
  const [session, setSession] = useState<InstructorSession | null>(null);
  const [sessionErrorKey, setSessionErrorKey] = useState<string | null>(null);
  const [runId, setRunId] = useState("");
  const [review, setReview] = useState<InstructorRunReview | null>(null);
  const [targetEventId, setTargetEventId] = useState<string | null>(
    null,
  );
  const [reviewErrorKey, setReviewErrorKey] = useState<string | null>(null);
  const [isReviewLoading, setReviewLoading] = useState(false);

  useEffect(() => {
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
  }, [api]);

  const mayReview =
    session?.roles.some((role) => REVIEW_ROLES.includes(role)) ?? false;
  const mayManage =
    session?.roles.some(
      (role) => role === "instructor" || role === "administrator",
    ) ?? false;

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
                  <dt>{t("instructorReview.email")}</dt>
                  <dd>{session.email}</dd>
                </div>
                <div>
                  <dt>{t("instructorReview.roles")}</dt>
                  <dd>{session.roles.join(", ")}</dd>
                </div>
              </dl>
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

  if (
    api.loadScormPackageJobs === undefined ||
    api.createScormPackageJob === undefined
  ) {
    return null;
  }
  const loadJobs = api.loadScormPackageJobs;
  const createJob = api.createScormPackageJob;

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
        className="instructor-review__inline-form"
        onSubmit={(event) => void generate(event)}
      >
        <div className="field">
          <label className="field__label" htmlFor="scorm-package-preset">
            {t("instructorReview.packagePreset")}
          </label>
          <select
            className="field__control"
            id="scorm-package-preset"
            value={presetId}
            onChange={(event) =>
              setPresetId(
                event.target.value as ScormPackagePresetId,
              )
            }
          >
            <option value="guided">
              {t("instructorReview.packagePreset.guided")}
            </option>
            <option value="challenge">
              {t("instructorReview.packagePreset.challenge")}
            </option>
          </select>
          <span className="field__hint">
            {t(`instructorReview.packagePresetHelp.${presetId}`)}
          </span>
        </div>
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

function AssignmentCreation({
  api,
}: {
  readonly api: InstructorReviewApi;
}): ReactNode {
  const t = useTranslator();
  const [assignmentId, setAssignmentId] = useState("");
  const [title, setTitle] = useState("");
  const [packId, setPackId] = useState("");
  const [packVersion, setPackVersion] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [scenarioVersion, setScenarioVersion] = useState("");
  const [mode, setMode] = useState<AssignmentRunMode>("standard");
  const [learnerIds, setLearnerIds] = useState("");
  const [created, setCreated] = useState<HostedAssignmentV1 | null>(
    null,
  );
  const [isSaving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setCreated(null);
    setErrorKey(null);
    try {
      setCreated(
        await api.createAssignment({
          assignmentId: assignmentId.trim(),
          title: title.trim(),
          packId: packId.trim(),
          packVersion: packVersion.trim(),
          scenarioId: scenarioId.trim(),
          scenarioVersion: scenarioVersion.trim(),
          mode,
          learnerUserIds: learnerIds
            .split(/[\s,]+/u)
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
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
        <TextField
          id="assignment-pack-id"
          label={t("instructorReview.packId")}
          value={packId}
          onChange={setPackId}
        />
        <TextField
          id="assignment-pack-version"
          label={t("instructorReview.packVersion")}
          value={packVersion}
          onChange={setPackVersion}
        />
        <TextField
          id="assignment-scenario-id"
          label={t("instructorReview.scenarioId")}
          value={scenarioId}
          onChange={setScenarioId}
        />
        <TextField
          id="assignment-scenario-version"
          label={t("instructorReview.scenarioVersion")}
          value={scenarioVersion}
          onChange={setScenarioVersion}
        />
        <div className="field">
          <label className="field__label" htmlFor="assignment-mode">
            {t("instructorReview.mode")}
          </label>
          <select
            className="field__control"
            id="assignment-mode"
            value={mode}
            onChange={(event) =>
              setMode(event.target.value as AssignmentRunMode)
            }
          >
            <option value="tutorial">
              {t("instructorReview.mode.tutorial")}
            </option>
            <option value="standard">
              {t("instructorReview.mode.standard")}
            </option>
            <option value="sandbox">
              {t("instructorReview.mode.sandbox")}
            </option>
            <option value="configured">
              {t("instructorReview.mode.configured")}
            </option>
          </select>
          <span className="field__hint">
            {t(`instructorReview.modeHelp.${mode}`)}
          </span>
        </div>
        <div className="field">
          <label
            className="field__label"
            htmlFor="assignment-learners"
          >
            {t("instructorReview.learnerIds")}
          </label>
          <textarea
            className="field__control"
            id="assignment-learners"
            value={learnerIds}
            onChange={(event) => setLearnerIds(event.target.value)}
            rows={3}
            required
          />
          <span className="field__hint">
            {t("instructorReview.learnerIdsHint")}
          </span>
        </div>
        <div className="instructor-review__form-actions">
          <button
            className="button button--primary"
            type="submit"
            disabled={isSaving}
          >
            {isSaving
              ? t("instructorReview.assignmentCreating")
              : t("instructorReview.assignmentCreate")}
          </button>
        </div>
      </form>
      {created === null ? null : (
        <div className="notice notice--standalone" role="status">
          <p>
            {t("instructorReview.assignmentCreated", {
              assignmentId: created.assignmentId,
            })}
          </p>
          {created.runConfiguration === undefined ? null : (
            <p>
              {t("instructorReview.modeResolved", {
                feedback: t(
                  `instructorReview.feedbackTiming.${created.runConfiguration.feedbackTiming}`,
                ),
                outcome: t(
                  `instructorReview.outcomeStrategy.${created.runConfiguration.outcomeStrategy}`,
                ),
              })}
            </p>
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
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        className="field__control"
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        required
      />
    </div>
  );
}

function AssignmentReport({
  api,
  onReviewEvent,
}: {
  readonly api: InstructorReviewApi;
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
  const [isLoading, setLoading] = useState(false);
  const [isMonitorLoading, setMonitorLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setReport(null);
    setMonitor(null);
    setCompetencies(null);
    setErrorKey(null);
    try {
      const requestedAssignmentId = assignmentId.trim();
      const [loadedReport, loadedMonitor, loadedCompetencies] =
        await Promise.all([
          api.loadAssignmentReport(requestedAssignmentId),
          api.loadAssignmentMonitor(requestedAssignmentId),
          api.loadAssignmentCompetencies(requestedAssignmentId),
        ]);
      setReport(loadedReport);
      setMonitor(loadedMonitor);
      setCompetencies(loadedCompetencies);
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
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("instructorReview.learner")}</th>
                  <th scope="col">{t("instructorReview.runId")}</th>
                  <th scope="col">{t("instructorReview.status")}</th>
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
                          <td colSpan={4}>
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
                          <td>{run.eventCount}</td>
                          <td>{run.ratings.length}</td>
                        </tr>
                      )),
                )}
              </tbody>
            </table>
          </div>
          {competencies === null ? null : (
            <ClassCompetencyReport
              report={competencies}
              onReviewEvent={onReviewEvent}
            />
          )}
        </div>
      )}
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
                <dd>{replay.projection.informationState.length}</dd>
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
      : citedEvidenceIdsFromPayload(selectedEvent.payload);
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
    </div>
  );
}

function citedEvidenceIdsFromPayload(
  payload: Readonly<Record<string, unknown>>,
): ReadonlySet<string> | null {
  if (
    !Object.prototype.hasOwnProperty.call(payload, "citedEvidenceIds") ||
    !Array.isArray(payload.citedEvidenceIds)
  ) {
    return null;
  }
  const citedEvidenceIds = new Set<string>();
  for (const value of payload.citedEvidenceIds) {
    if (typeof value === "string") citedEvidenceIds.add(value);
  }
  return citedEvidenceIds;
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
