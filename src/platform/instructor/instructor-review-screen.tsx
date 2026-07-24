import {
  useEffect,
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
  HostedAssignmentReportV1,
  HostedAssignmentV1,
  ManualRubricRatingV1,
} from "../contracts/assessment";
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
}

export type CreateInstructorAssignmentInput = Omit<
  CreateHostedAssignmentRequest,
  "commandId"
>;

export interface SaveInstructorRatingInput {
  readonly rubricId: string;
  readonly criterionId: string;
  readonly levelValue: number;
  readonly comment: string;
  readonly linkedEvidenceIds: readonly string[];
  readonly expectedRevision: number;
}

export interface InstructorReviewApi {
  loadSession(): Promise<InstructorSession>;
  loadRunReview(runId: string): Promise<InstructorRunReview>;
  createAssignment(
    input: CreateInstructorAssignmentInput,
  ): Promise<HostedAssignmentV1>;
  loadAssignmentReport(
    assignmentId: string,
  ): Promise<HostedAssignmentReportV1>;
  saveRating(
    runId: string,
    input: SaveInstructorRatingInput,
  ): Promise<ManualRubricRatingV1>;
  releaseFeedback(assignmentId: string): Promise<HostedAssignmentV1>;
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
      };
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
      error.code === "RATING_REVISION_CONFLICT"
    ) {
      return "instructorReview.error.rating";
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

  async function loadRequestedReview(requestedRunId: string) {
    if (requestedRunId.length === 0) return;
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

          {mayReview ? <AssignmentReport api={api} /> : null}

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
              onRefresh={() => loadRequestedReview(runId.trim())}
            />
          )}
        </div>
      </main>
    </>
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
        <p className="notice notice--standalone" role="status">
          {t("instructorReview.assignmentCreated", {
            assignmentId: created.assignmentId,
          })}
        </p>
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
}: {
  readonly api: InstructorReviewApi;
}): ReactNode {
  const t = useTranslator();
  const [assignmentId, setAssignmentId] = useState("");
  const [report, setReport] =
    useState<HostedAssignmentReportV1 | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setReport(null);
    setErrorKey(null);
    try {
      setReport(
        await api.loadAssignmentReport(assignmentId.trim()),
      );
    } catch (error) {
      setErrorKey(errorMessageKey(error));
    } finally {
      setLoading(false);
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
        <div className="table-scroll" aria-live="polite">
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
      )}
    </section>
  );
}

function RunReview({
  api,
  review,
  runId,
  mayReleaseFeedback,
  onRefresh,
}: {
  readonly api: InstructorReviewApi;
  readonly review: InstructorRunReview;
  readonly runId: string;
  readonly mayReleaseFeedback: boolean;
  readonly onRefresh: () => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  const [isReleasing, setReleasing] = useState(false);
  const [releaseErrorKey, setReleaseErrorKey] =
    useState<string | null>(null);

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
              </tr>
            </thead>
            <tbody>
              {review.timeline.map((item) => (
                <tr key={item.eventId}>
                  <td>{item.sequenceNumber}</td>
                  <td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                return (
                  <RubricRatingRow
                    api={api}
                    criterion={criterion}
                    currentRating={currentRating}
                    fallbackEvidenceId={
                      review.timeline[0]?.eventId ?? null
                    }
                    key={`${criterion.rubricId}:${criterion.criterionId}`}
                    onRefresh={onRefresh}
                    runId={runId}
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

function RubricRatingRow({
  api,
  criterion,
  currentRating,
  fallbackEvidenceId,
  onRefresh,
  runId,
}: {
  readonly api: InstructorReviewApi;
  readonly criterion: RubricEvidenceProjection;
  readonly currentRating: ManualRubricRatingV1 | undefined;
  readonly fallbackEvidenceId: string | null;
  readonly onRefresh: () => Promise<void>;
  readonly runId: string;
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
        </div>
      </td>
    </tr>
  );
}
