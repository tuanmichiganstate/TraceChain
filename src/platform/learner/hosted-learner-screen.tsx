import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import type {
  HostedLearnerAssignmentV1,
  ManualRubricRatingV1,
  RubricModerationResolutionV1,
} from "../contracts/assessment";
import type {
  HostedLearnerCompetencyProfileV1,
} from "../contracts/competency-report";
import type {
  ApplicationRole,
  LearnerRunAuthoredFeedbackV1,
  LearnerRunLocalizedTextV1,
  LearnerRunProjectionV1,
} from "../contracts/run-events";
import type {
  DecisionEvidenceCitationConfigurationV1,
  DecisionNumericResponseConfigurationV1,
  DecisionPolicyCitationConfigurationV1,
  StructuredDecisionResponseConfigurationV1,
} from "../contracts/scenario-pack";
import {
  createCounterfactualExplorerApi,
  type CounterfactualExplorerApi,
} from "../counterfactual/counterfactual-api";
import { CounterfactualExplorer } from "../counterfactual/counterfactual-explorer";

interface LearnerSession {
  readonly userId: string;
  readonly email: string;
  readonly roles: readonly ApplicationRole[];
}

interface HostedLearnerFeedback {
  readonly assignmentId: string;
  readonly releasedAt?: string;
  readonly authoredFeedback?:
    readonly LearnerRunAuthoredFeedbackV1[];
  readonly ratings: readonly ManualRubricRatingV1[];
  readonly moderationResolutions:
    readonly RubricModerationResolutionV1[];
  readonly competencyProfile: HostedLearnerCompetencyProfileV1;
}

export interface HostedLearnerApi {
  loadSession(): Promise<LearnerSession>;
  loadAssignments(): Promise<readonly HostedLearnerAssignmentV1[]>;
  startRun(assignmentId: string): Promise<string>;
  loadRun(runId: string): Promise<LearnerRunProjectionV1>;
  loadFeedback(runId: string): Promise<HostedLearnerFeedback>;
  submit(
    runId: string,
    command: Readonly<Record<string, unknown>>,
  ): Promise<LearnerRunProjectionV1>;
  readonly counterfactuals?: CounterfactualExplorerApi;
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class HostedLearnerApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "HostedLearnerApiError";
  }
}

async function apiJson<T>(
  fetcher: FetchLike,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(path, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = (await response.json()) as T & {
    readonly error?: { readonly code?: string };
  };
  if (!response.ok) {
    throw new HostedLearnerApiError(
      body.error?.code ?? "HOSTED_LEARNER_REQUEST_FAILED",
    );
  }
  return body;
}

function commandId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createHostedLearnerApi(
  fetcher: FetchLike = globalThis.fetch.bind(globalThis),
): HostedLearnerApi {
  return {
    counterfactuals: createCounterfactualExplorerApi(fetcher),
    loadSession: () =>
      apiJson<LearnerSession>(fetcher, "/api/v1/session"),
    async loadAssignments() {
      return (
        await apiJson<{
          readonly assignments: readonly HostedLearnerAssignmentV1[];
        }>(fetcher, "/api/v1/learner/assignments")
      ).assignments;
    },
    async startRun(assignmentId) {
      const result = await apiJson<{ readonly runId: string }>(
        fetcher,
        `/api/v1/assignments/${encodeURIComponent(assignmentId)}/start-run`,
        {
          method: "POST",
          body: JSON.stringify({
            commandId: commandId("COMMAND_LEARNER_START"),
            runId: commandId("RUN_LEARNER"),
          }),
        },
      );
      return result.runId;
    },
    async loadRun(runId) {
      return (
        await apiJson<{ readonly projection: LearnerRunProjectionV1 }>(
          fetcher,
          `/api/v1/runs/${encodeURIComponent(runId)}`,
        )
      ).projection;
    },
    async loadFeedback(runId) {
      return apiJson<HostedLearnerFeedback>(
        fetcher,
        `/api/v1/runs/${encodeURIComponent(runId)}/feedback`,
      );
    },
    async submit(runId, command) {
      return (
        await apiJson<{ readonly projection: LearnerRunProjectionV1 }>(
          fetcher,
          `/api/v1/runs/${encodeURIComponent(runId)}/commands`,
          {
            method: "POST",
            body: JSON.stringify(command),
          },
        )
      ).projection;
    },
  };
}

const browserApi = createHostedLearnerApi();
const optionLocalizationKeys: Readonly<Record<string, string>> = {
  VALID:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_CERTIFICATE_DECISION.fields.certificateAssessment.options.VALID.label",
  EXPIRED:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_CERTIFICATE_DECISION.fields.certificateAssessment.options.EXPIRED.label",
  CONTENT_INVALID:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_CERTIFICATE_DECISION.fields.certificateAssessment.options.CONTENT_INVALID.label",
  RECOGNIZED_AUTHORIZED:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_CERTIFICATE_DECISION.fields.issuerAssessment.options.RECOGNIZED_AUTHORIZED.label",
  RECOGNIZED_UNAUTHORIZED:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_CERTIFICATE_DECISION.fields.issuerAssessment.options.RECOGNIZED_UNAUTHORIZED.label",
  UNRECOGNIZED:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_CERTIFICATE_DECISION.fields.issuerAssessment.options.UNRECOGNIZED.label",
  HASH_OFF_CHAIN:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_CERTIFICATE_DECISION.fields.storageChoice.options.HASH_OFF_CHAIN.label",
  FULL_DOCUMENT_ON_CHAIN:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_CERTIFICATE_DECISION.fields.storageChoice.options.FULL_DOCUMENT_ON_CHAIN.label",
  CONTINUE:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_CERTIFICATE_DECISION.fields.lotDisposition.options.CONTINUE.label",
  HOLD:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_CERTIFICATE_DECISION.fields.lotDisposition.options.HOLD.label",
  IGNORE:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_DISCREPANCY_DECISION.fields.action.options.IGNORE.label",
  OVERWRITE:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_DISCREPANCY_DECISION.fields.action.options.OVERWRITE.label",
  DELETE:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_DISCREPANCY_DECISION.fields.action.options.DELETE.label",
  APPEND_CORRECTION:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_DISCREPANCY_DECISION.fields.action.options.APPEND_CORRECTION.label",
  INVESTIGATE_THEN_CORRECT:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_DISCREPANCY_DECISION.fields.action.options.INVESTIGATE_THEN_CORRECT.label",
  TYPING_ERROR:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_DISCREPANCY_DECISION.fields.causeCode.options.TYPING_ERROR.label",
  UNIT_MISMATCH:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_DISCREPANCY_DECISION.fields.causeCode.options.UNIT_MISMATCH.label",
  PHYSICAL_LOSS:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_DISCREPANCY_DECISION.fields.causeCode.options.PHYSICAL_LOSS.label",
  FRAUD:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_DISCREPANCY_DECISION.fields.causeCode.options.FRAUD.label",
  UNKNOWN:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_DISCREPANCY_DECISION.fields.causeCode.options.UNKNOWN.label",
  OPT_NEW_INDEPENDENT_BATCH:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_TRANSFORMATION_PROVENANCE_DECISION.fields.provenanceRelationship.options.OPT_NEW_INDEPENDENT_BATCH.label",
  OPT_LINKED_TO_INPUT:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_TRANSFORMATION_PROVENANCE_DECISION.fields.provenanceRelationship.options.OPT_LINKED_TO_INPUT.label",
  OPT_INPUT_DELETED:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_TRANSFORMATION_PROVENANCE_DECISION.fields.provenanceRelationship.options.OPT_INPUT_DELETED.label",
  OPT_PREVENTS_EDITING: "check.tamperIntegrity.optionPrevents",
  OPT_MAKES_EDIT_DETECTABLE: "check.tamperIntegrity.optionDetectable",
  OPT_ONLY_LAST_BLOCK: "check.tamperIntegrity.optionLastBlock",
  OPT_ALWAYS_BETTER: "check.blockchainNecessity.optionAlwaysBetter",
  OPT_INDEPENDENT_ORGANIZATIONS:
    "check.blockchainNecessity.optionIndependent",
  OPT_FASTER_THAN_DATABASE:
    "check.blockchainNecessity.optionFaster",
  OPT_GUARANTEES_TRUTH:
    "check.blockchainNecessity.optionGuarantees",
  CAT_ON_CHAIN: "check.dataGovernance.categoryOnChain",
  CAT_OFF_CHAIN_HASH: "check.dataGovernance.categoryOffChainHash",
  CAT_AUTHORIZED_ONLY: "check.dataGovernance.categoryAuthorizedOnly",
  CAT_DO_NOT_COLLECT: "check.dataGovernance.categoryDoNotCollect",
  BAT_PACKAGED_COFFEE_001: "check.recallScope.optionAffectedLot",
  BAT_PACKAGED_COFFEE_002: "check.recallScope.optionNearMissLot",
  BAT_PACKAGED_COFFEE_003: "check.recallScope.optionUnrelatedLot",
  BAT_ROASTED_COFFEE_001: "check.recallScope.optionRoastedBatch",
};

const roleLocalizationKeys: Readonly<Record<string, string>> = {
  PRODUCER_MANAGER:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.roles.ORG_PRODUCER_COOP.displayName",
  CERTIFICATION_OFFICER:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.roles.ORG_CERTIFICATION_BODY.displayName",
  LOGISTICS_COORDINATOR:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.roles.ORG_LOGISTICS_PROVIDER.displayName",
  PROCESSING_MANAGER:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.roles.ORG_COFFEE_PROCESSOR.displayName",
  DISTRIBUTION_MANAGER:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.roles.ORG_DISTRIBUTOR.displayName",
  RETAIL_MANAGER:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.roles.ORG_RETAILER.displayName",
  REGULATORY_AUDITOR:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.roles.ORG_REGULATOR.displayName",
};

const evidenceLocalizationKeys: Readonly<Record<string, string>> = {
  EVID_CERTIFICATE_RECORD:
    "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.evidenceItems.EVID_CERTIFICATE_RECORD.title",
};

function runText(
  value: LearnerRunLocalizedTextV1,
  t: ReturnType<typeof useTranslator>,
): string {
  return (
    value.valuesByLocale[t.locale] ??
    value.valuesByLocale.en ??
    Object.values(value.valuesByLocale)[0] ??
    t(value.localizationKey)
  );
}

export function HostedLearnerScreen({
  api = browserApi,
  initialAssignmentId = assignmentIdFromLocation(),
}: {
  readonly api?: HostedLearnerApi;
  readonly initialAssignmentId?: string | null;
}): ReactNode {
  const t = useTranslator();
  const [session, setSession] = useState<LearnerSession | null>(null);
  const [assignments, setAssignments] =
    useState<readonly HostedLearnerAssignmentV1[]>([]);
  const [runId, setRunId] = useState("");
  const [projection, setProjection] =
    useState<LearnerRunProjectionV1 | null>(null);
  const [feedback, setFeedback] =
    useState<HostedLearnerFeedback | "withheld" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([api.loadSession(), api.loadAssignments()]).then(
      ([loadedSession, loadedAssignments]) => {
        if (!active) return;
        setSession(loadedSession);
        setAssignments(loadedAssignments);
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  async function openRun(requestedRunId: string) {
    setBusy(true);
    setError(false);
    try {
      setRunId(requestedRunId);
      await publishProjection(
        requestedRunId,
        await api.loadRun(requestedRunId),
      );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function start(assignmentId: string) {
    setBusy(true);
    setError(false);
    try {
      const createdRunId = await api.startRun(assignmentId);
      const [loadedProjection, loadedAssignments] = await Promise.all([
        api.loadRun(createdRunId),
        api.loadAssignments(),
      ]);
      setRunId(createdRunId);
      await publishProjection(createdRunId, loadedProjection);
      setAssignments(loadedAssignments);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function submit(
    input: Readonly<Record<string, unknown>>,
  ) {
    if (projection === null) return;
    setBusy(true);
    setError(false);
    try {
      await publishProjection(
        runId,
        await api.submit(runId, {
          ...input,
          commandId: commandId("COMMAND_LEARNER_ACTION"),
          runId,
          expectedRunVersion: projection.version,
        }),
      );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function publishProjection(
    requestedRunId: string,
    loadedProjection: LearnerRunProjectionV1,
  ) {
    setProjection(loadedProjection);
    setFeedback(null);
    if (loadedProjection.workflowState.permittedActionIds.length > 0) {
      return;
    }
    try {
      setFeedback(await api.loadFeedback(requestedRunId));
    } catch (feedbackError) {
      if (
        feedbackError instanceof HostedLearnerApiError &&
        feedbackError.code === "FEEDBACK_NOT_RELEASED"
      ) {
        setFeedback("withheld");
        return;
      }
      throw feedbackError;
    }
  }

  const isLearner = session?.roles.includes("learner") ?? false;
  const focusedAssignments =
    initialAssignmentId === null
      ? assignments
      : assignments.filter(
          ({ assignment }) =>
            assignment.assignmentId === initialAssignmentId,
        );
  const counterfactualAssignment = assignments.find(
    ({ assignment, runs }) =>
      assignment.mode === "sandbox" &&
      assignment.counterfactualReplay.enabled &&
      runs.some((run) => run.runId === runId),
  )?.assignment;
  const counterfactualApi =
    counterfactualAssignment !== undefined &&
    (counterfactualAssignment.counterfactualReplay
      .learnerAvailability === "AFTER_RUN_COMPLETION" ||
      (counterfactualAssignment.counterfactualReplay
        .learnerAvailability === "AFTER_FEEDBACK_RELEASE" &&
        feedback !== null &&
        feedback !== "withheld"))
      ? api.counterfactuals
      : undefined;
  return (
    <main className="start" id="main-content">
      <div className="start__inner">
        <header className="instructor-review__header">
          <p className="eyebrow">{t("hostedLearner.eyebrow")}</p>
          <h1>{t("hostedLearner.title")}</h1>
          <p className="start__subtitle">{t("hostedLearner.subtitle")}</p>
        </header>

        {session === null ? (
          <p role="status">{t("hostedLearner.loading")}</p>
        ) : !isLearner ? (
          <p className="notice notice--standalone" role="alert">
            {t("hostedLearner.notAuthorized")}
          </p>
        ) : (
          <section className="card card--reference">
            <h2>{t("hostedLearner.account")}</h2>
            <p>{session.email}</p>
          </section>
        )}

        {isLearner ? (
          <section className="card card--reference">
            <h2>{t("hostedLearner.assignments")}</h2>
            {initialAssignmentId === null ? null : (
              <p>
                {t("hostedLearner.deepLink", {
                  assignmentId: initialAssignmentId,
                })}
              </p>
            )}
            {focusedAssignments.length === 0 ? (
              <p>
                {initialAssignmentId === null
                  ? t("hostedLearner.noAssignments")
                  : t("hostedLearner.deepLinkUnavailable")}
              </p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">{t("hostedLearner.assignment")}</th>
                      <th scope="col">{t("hostedLearner.mode")}</th>
                      <th scope="col">{t("hostedLearner.status")}</th>
                      <th scope="col">{t("hostedLearner.action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {focusedAssignments.map(({ assignment, startAvailability, runs }) => {
                      const latest = runs[0];
                      return (
                        <tr key={assignment.assignmentId}>
                          <td>
                            <strong>{assignment.title}</strong>
                            <br />
                            <code>{assignment.assignmentId}</code>
                          </td>
                          <td>{t(`scenarioAuthor.mode.${assignment.mode}`)}</td>
                          <td>
                            {latest === undefined
                              ? startAvailability.status ===
                                "available"
                                ? t("hostedLearner.notStarted")
                                : t(
                                    `hostedLearner.assignmentAvailability.${startAvailability.status}`,
                                    {
                                      availableFrom:
                                        assignment.availableFrom ??
                                        "",
                                      availableUntil:
                                        assignment.availableUntil ??
                                        "",
                                    },
                                  )
                              : t(`hostedLearner.run.${latest.status}`)}
                          </td>
                          <td>
                            {latest === undefined ? (
                              <button
                                className="button button--primary"
                                type="button"
                                disabled={
                                  busy ||
                                  startAvailability.status !==
                                    "available"
                                }
                                onClick={() =>
                                  void start(assignment.assignmentId)
                                }
                              >
                                {t("hostedLearner.start")}
                              </button>
                            ) : (
                              <button
                                className="button button--secondary"
                                type="button"
                                disabled={busy}
                                onClick={() => void openRun(latest.runId)}
                              >
                                {t(
                                  latest.status === "completed"
                                    ? "hostedLearner.review"
                                    : "hostedLearner.resume",
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {projection === null ? null : (
          <>
            <RunWorkspace
              projection={projection}
              busy={busy}
              onSubmit={submit}
            />
            {projection.workflowState.permittedActionIds.length === 0 ? (
              <>
                <LearnerFeedback feedback={feedback} />
                {counterfactualApi !== undefined ? (
                  <CounterfactualExplorer
                    api={counterfactualApi}
                    sourceRunId={runId}
                    renderContinuation={(options) => (
                      <HostedRunActionControls {...options} />
                    )}
                  />
                ) : null}
              </>
            ) : null}
          </>
        )}

        {error ? (
          <p className="notice notice--standalone" role="alert">
            {t("hostedLearner.error")}
          </p>
        ) : null}
      </div>
    </main>
  );
}

function assignmentIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(
    "assignmentId",
  );
  return value === null || value.trim().length === 0
    ? null
    : value.trim();
}

function LearnerFeedback({
  feedback,
}: {
  readonly feedback: HostedLearnerFeedback | "withheld" | null;
}): ReactNode {
  const t = useTranslator();
  return (
    <section className="card card--reference">
      <h2>{t("hostedLearner.feedback")}</h2>
      {feedback === null ? (
        <p role="status">{t("hostedLearner.feedbackLoading")}</p>
      ) : feedback === "withheld" ? (
        <p>{t("hostedLearner.feedbackWithheld")}</p>
      ) : (
        <>
          {feedback.authoredFeedback?.map((item) => (
            <article key={item.feedbackCode}>
              <h3>{runText(item.title, t)}</h3>
              <p>{runText(item.message, t)}</p>
            </article>
          ))}
          {feedback.moderationResolutions.length > 0 ? (
            <ul>
              {feedback.moderationResolutions.map((resolution) => (
                <li key={resolution.resolutionId}>
                  <strong>{resolution.criterionId}</strong>:{" "}
                  {t("hostedLearner.feedbackLevel", {
                    level: resolution.levelValue,
                  })}
                  <br />
                  {resolution.comment}
                </li>
              ))}
            </ul>
          ) : feedback.ratings.length > 0 ? (
            <ul>
              {feedback.ratings.map((rating) => (
                <li key={rating.ratingId}>
                  <strong>{rating.criterionId}</strong>:{" "}
                  {t("hostedLearner.feedbackLevel", {
                    level: rating.levelValue,
                  })}
                  <br />
                  {rating.comment}
                </li>
              ))}
            </ul>
          ) : (feedback.authoredFeedback?.length ?? 0) === 0 ? (
            <p>{t("hostedLearner.feedbackEmpty")}</p>
          ) : null}
          <LearnerCompetencyProfile
            profile={feedback.competencyProfile}
          />
        </>
      )}
    </section>
  );
}

function LearnerCompetencyProfile({
  profile,
}: {
  readonly profile: HostedLearnerCompetencyProfileV1;
}): ReactNode {
  const t = useTranslator();
  return (
    <section className="hosted-learner__competency-profile">
      <h3>{t("hostedLearner.competencyHeading")}</h3>
      <p>{t("hostedLearner.competencyInterpretation")}</p>
      <p>
        <strong>{t("hostedLearner.competencyScenario")}</strong>{" "}
        <code>
          {profile.scenarioId}@{profile.scenarioVersion}
        </code>
      </p>
      {profile.learner.indicators.map((indicator) => (
        <details key={indicator.indicatorId}>
          <summary>
            <strong>{t(indicator.competencyTitleKey)}</strong>{" "}
            <code>{indicator.indicatorId}</code>
          </summary>
          <p>{t(indicator.indicatorStatementKey)}</p>
          <dl className="instructor-review__facts">
            <div>
              <dt>{t("hostedLearner.competencyTarget")}</dt>
              <dd>
                {t(
                  `hostedLearner.competencyTarget.${indicator.targetType}`,
                )}
              </dd>
            </div>
            <div>
              <dt>{t("hostedLearner.competencyEvidenceCount")}</dt>
              <dd>{indicator.evidenceCount}</dd>
            </div>
            <div>
              <dt>{t("hostedLearner.competencyLatest")}</dt>
              <dd>
                {indicator.latestObservedAt === undefined ? (
                  t("hostedLearner.competencyNoLatest")
                ) : (
                  <time dateTime={indicator.latestObservedAt}>
                    {indicator.latestObservedAt}
                  </time>
                )}
              </dd>
            </div>
          </dl>
          <h4>{t("hostedLearner.competencyObservations")}</h4>
          {indicator.observations.length === 0 ? (
            <p>{t("hostedLearner.competencyNoEvidence")}</p>
          ) : (
            <ul>
              {indicator.observations.map((observation) => (
                <li
                  key={`${observation.runId}:${observation.competencyEvidenceId}`}
                >
                  <p>
                    {t("hostedLearner.competencyObservation", {
                      runId: observation.runId,
                      evidenceId:
                        observation.competencyEvidenceId,
                    })}
                  </p>
                  <p>
                    <strong>
                      {t("hostedLearner.competencySourceEvents")}
                    </strong>{" "}
                    {observation.sourceEventIds.map(
                      (eventId, index) => (
                        <span key={eventId}>
                          {index === 0 ? null : ", "}
                          <code>{eventId}</code>
                        </span>
                      ),
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </details>
      ))}
    </section>
  );
}

function RunWorkspace({
  projection,
  busy,
  onSubmit,
}: {
  readonly projection: LearnerRunProjectionV1;
  readonly busy: boolean;
  readonly onSubmit: (
    input: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  const actions = projection.workflowState.permittedActionIds;
  const isExpired = projection.timing?.status === "expired";
  const presentation = projection.presentation;
  const currentNode = presentation?.currentNode;
  return (
    <>
      <section className="card card--brief">
        <h2>{t("hostedLearner.workspace")}</h2>
        <dl className="instructor-review__facts">
          <div>
            <dt>{t("hostedLearner.runId")}</dt>
            <dd><code>{projection.runId}</code></dd>
          </div>
          <div>
            <dt>{t("hostedLearner.role")}</dt>
            <dd>
              {presentation === undefined
                ? t(
                    roleLocalizationKeys[projection.roleId] ??
                      "hostedLearner.roleUnknown",
                    { roleId: projection.roleId },
                  )
                : runText(presentation.roleName, t)}
            </dd>
          </div>
          <div>
            <dt>{t("hostedLearner.step")}</dt>
            <dd>
              {currentNode === undefined
                ? projection.workflowState.permittedActionIds[0] ===
                  undefined
                  ? t("hostedLearner.complete")
                  : t(
                      `hostedLearner.action.${projection.workflowState.permittedActionIds[0]}`,
                    )
                : runText(currentNode.title, t)}
            </dd>
          </div>
        </dl>
        {presentation === undefined ? null : (
          <>
            <h3>{runText(presentation.scenarioTitle, t)}</h3>
            {currentNode?.body === undefined ? null : (
              <p>{runText(currentNode.body, t)}</p>
            )}
            {currentNode?.message === undefined ? null : (
              <p>{runText(currentNode.message, t)}</p>
            )}
          </>
        )}
      </section>
      {isExpired ? (
        <p className="notice notice--standalone" role="status">
          {t("hostedLearner.timeLimitExpired", {
            minutes: projection.timing?.timeLimitMinutes ?? 0,
          })}
        </p>
      ) : null}
      {(presentation?.instructorIncidents.length ?? 0) === 0 ? null : (
        <section className="card card--brief" aria-live="polite">
          <h2>{t("hostedLearner.instructorIncidents")}</h2>
          {presentation?.instructorIncidents.map((incident) => (
            <article key={incident.incidentId}>
              <h3>{runText(incident.title, t)}</h3>
              <p>{runText(incident.message, t)}</p>
              <p>
                <small>
                  {t("hostedLearner.instructorIncidentReleasedAt", {
                    releasedAt: incident.releasedAt,
                  })}
                </small>
              </p>
            </article>
          ))}
        </section>
      )}
      <section className="card card--reference">
        <h2>{t("hostedLearner.evidence")}</h2>
        {projection.informationState.length === 0 ? (
          <p>{t("hostedLearner.none")}</p>
        ) : (
          <ul>
            {projection.informationState.map((record) => {
              const authoredTitle =
                presentation?.evidenceTitles[record.recordId];
              const title =
                authoredTitle === undefined
                  ? t(
                      evidenceLocalizationKeys[record.recordId] ??
                        "hostedLearner.evidenceUnknown",
                      { evidenceId: record.recordId },
                    )
                  : runText(authoredTitle, t);
              return (
                <li key={record.recordId}>
                  {presentation === undefined ? (
                    title
                  ) : (
                    <details>
                      <summary>{title}</summary>
                      <p>
                        <code>{JSON.stringify(record.value)}</code>
                      </p>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {(presentation?.professionalConsequences.length ?? 0) === 0 ? null : (
        <section className="card card--reference">
          <h2>{t("hostedLearner.professionalConsequences")}</h2>
          <p>{t("hostedLearner.professionalConsequencesHelp")}</p>
          <dl className="instructor-review__facts">
            {presentation?.professionalConsequences.map((dimension) => (
              <div key={dimension.dimensionId}>
                <dt>{runText(dimension.title, t)}</dt>
                <dd>
                  {dimension.value}
                  {dimension.unit === undefined
                    ? ""
                    : ` ${dimension.unit}`}
                  <br />
                  <small>
                    {runText(dimension.description, t)}{" "}
                    {t(
                      `hostedLearner.professionalConsequenceDirection.${dimension.direction}`,
                    )}
                  </small>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section className="card card--reference">
        <h2>{t("hostedLearner.traceability")}</h2>
        <details>
          <summary>{t("hostedLearner.viewRoleState")}</summary>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("hostedLearner.record")}</th>
                  <th scope="col">{t("hostedLearner.value")}</th>
                </tr>
              </thead>
              <tbody>
                {[...projection.businessState, ...projection.policyState].map(
                  (record) => (
                    <tr key={record.recordId}>
                      <td><code>{record.recordId}</code></td>
                      <td><code>{JSON.stringify(record.value)}</code></td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </details>
        <details>
          <summary>{t("hostedLearner.viewLedger")}</summary>
          <LedgerTransactions ledgerState={projection.ledgerState} />
        </details>
      </section>
      <section className="card card--work">
        <h2>{t("hostedLearner.currentAction")}</h2>
        {currentNode?.prompt === undefined ? null : (
          <p>{runText(currentNode.prompt, t)}</p>
        )}
        {actions.length === 0 ? (
          <p>
            {currentNode?.nodeType === "COMPLETION"
              ? runText(currentNode.title, t)
              : t("hostedLearner.complete")}
          </p>
        ) : (
          actions.map((action) => (
            <ActionControl
              key={action}
              action={action}
              projection={projection}
              busy={busy || isExpired}
              onSubmit={onSubmit}
            />
          ))
        )}
      </section>
    </>
  );
}

function LedgerTransactions({
  ledgerState,
}: {
  readonly ledgerState: Readonly<Record<string, unknown>>;
}): ReactNode {
  const t = useTranslator();
  const transactions = Array.isArray(ledgerState.transactions)
    ? ledgerState.transactions.filter(
        (item): item is Readonly<Record<string, unknown>> =>
          typeof item === "object" &&
          item !== null &&
          !Array.isArray(item),
      )
    : [];
  if (transactions.length === 0) {
    return <p>{t("hostedLearner.noLedgerTransactions")}</p>;
  }
  return (
    <ol>
      {transactions.map((transaction, index) => (
        <li key={String(transaction.transactionId ?? index)}>
          <code>{String(transaction.transactionType ?? "")}</code>
          {" — "}
          {String(transaction.transactionStatus ?? "")}
          {transaction.transactionId === undefined ? null : (
            <>
              {" "}
              <code>{String(transaction.transactionId)}</code>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

function stringField(
  projection: LearnerRunProjectionV1,
  recordId: string,
  field: string,
): string {
  const value = projection.policyState.find(
    (record) => record.recordId === recordId,
  )?.value;
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const record = value as Readonly<Record<string, unknown>>;
    return typeof record[field] === "string"
      ? record[field]
      : "";
  }
  return "";
}

function numericResponseConfiguration(
  value: unknown,
): DecisionNumericResponseConfigurationV1 | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return undefined;
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  if (
    typeof candidate.required !== "boolean" ||
    typeof candidate.minimum !== "number" ||
    typeof candidate.maximum !== "number"
  ) {
    return undefined;
  }
  return {
    required: candidate.required,
    minimum: candidate.minimum,
    maximum: candidate.maximum,
  };
}

function citationConfiguration(
  value: unknown,
):
  | DecisionEvidenceCitationConfigurationV1
  | DecisionPolicyCitationConfigurationV1
  | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return undefined;
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  if (
    typeof candidate.required !== "boolean" ||
    typeof candidate.minimumItems !== "number" ||
    typeof candidate.maximumItems !== "number"
  ) {
    return undefined;
  }
  return {
    required: candidate.required,
    minimumItems: candidate.minimumItems,
    maximumItems: candidate.maximumItems,
  };
}

function structuredDecisionResponseConfiguration(
  projection: LearnerRunProjectionV1,
): StructuredDecisionResponseConfigurationV1 | undefined {
  const value = projection.policyState.find(
    (record) =>
      record.recordId === "DECISION_RESPONSE_REQUIREMENTS",
  )?.value;
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return undefined;
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  const evidenceCitations = citationConfiguration(
    candidate.evidenceCitations,
  );
  const policyCitations = citationConfiguration(
    candidate.policyCitations,
  );
  const confidenceRating = numericResponseConfiguration(
    candidate.confidenceRating,
  );
  const adverseEventProbabilityPercent =
    numericResponseConfiguration(
      candidate.adverseEventProbabilityPercent,
    );
  if (
    evidenceCitations === undefined &&
    policyCitations === undefined &&
    confidenceRating === undefined &&
    adverseEventProbabilityPercent === undefined
  ) {
    return undefined;
  }
  return {
    ...(evidenceCitations === undefined
      ? {}
      : { evidenceCitations }),
    ...(policyCitations === undefined
      ? {}
      : { policyCitations }),
    ...(confidenceRating === undefined
      ? {}
      : { confidenceRating }),
    ...(adverseEventProbabilityPercent === undefined
      ? {}
      : { adverseEventProbabilityPercent }),
  };
}

interface DecisionPolicyReference {
  readonly policyId: string;
  readonly titleKey: string;
}

function decisionPolicyReferences(
  projection: LearnerRunProjectionV1,
): readonly DecisionPolicyReference[] {
  return projection.policyState.flatMap((record) => {
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
    return typeof candidate.policyId === "string" &&
      typeof candidate.titleKey === "string"
      ? [
          {
            policyId: candidate.policyId,
            titleKey: candidate.titleKey,
          },
        ]
      : [];
  });
}

function ActionControl({
  action,
  projection,
  busy,
  onSubmit,
}: {
  readonly action: string;
  readonly projection: LearnerRunProjectionV1;
  readonly busy: boolean;
  readonly onSubmit: (
    input: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  if (action === "INSPECT_EVIDENCE") {
    return (
      <SelectActionForm
        action={action}
        options={projection.informationState.map((item) => {
          const title =
            projection.presentation?.evidenceTitles[item.recordId];
          return {
            value: item.recordId,
            labelKey: null,
            ...(title === undefined
              ? {}
              : { label: runText(title, t) }),
          };
        })}
        busy={busy}
        onSubmit={(evidenceId) =>
          onSubmit({ commandType: action, evidenceId })
        }
      />
    );
  }
  if (action === "SUBMIT_CERTIFICATE_DECISION") {
    return (
      <CertificateDecisionForm
        projection={projection}
        busy={busy}
        onSubmit={onSubmit}
      />
    );
  }
  if (action === "SUBMIT_STRUCTURED_DECISION") {
    return (
      <GenericDecisionForm
        projection={projection}
        busy={busy}
        onSubmit={onSubmit}
      />
    );
  }
  if (action === "CREATE_CUSTODY_TRANSFER_PROPOSAL") {
    return <CustodyProposalForm busy={busy} onSubmit={onSubmit} />;
  }
  if (action === "SUBMIT_DISCREPANCY_DECISION") {
    return <DiscrepancyDecisionForm busy={busy} onSubmit={onSubmit} />;
  }
  if (action === "CREATE_CORRECTION_PROPOSAL") {
    return <CorrectionProposalForm busy={busy} onSubmit={onSubmit} />;
  }
  if (action === "SUBMIT_KNOWLEDGE_DECISION") {
    return (
      <KnowledgeDecisionForm
        step={projection.workflowState.currentNodeId}
        busy={busy}
        onSubmit={onSubmit}
      />
    );
  }
  if (action === "SUBMIT_DATA_GOVERNANCE_DECISION") {
    return <GovernanceDecisionForm busy={busy} onSubmit={onSubmit} />;
  }
  if (action === "SUBMIT_RECALL_SCOPE_DECISION") {
    return <RecallScopeForm busy={busy} onSubmit={onSubmit} />;
  }
  const proposalId =
    action.includes("CORRECTION")
      ? stringField(
          projection,
          "CORRECTION_PROPOSAL_POLICY",
          "proposalId",
        )
      : stringField(
          projection,
          "CUSTODY_PROPOSAL_POLICY",
          "proposalId",
        );
  return (
    <SimpleAction
      action={action}
      busy={busy}
      onSubmit={() =>
        onSubmit({
          commandType: action,
          ...([
            "ENDORSE_CUSTODY_TRANSFER",
            "COMMIT_CUSTODY_TRANSFER",
            "ENDORSE_CORRECTION",
            "COMMIT_CORRECTION",
          ].includes(action)
            ? { proposalId }
            : {}),
        })
      }
    />
  );
}

export function HostedRunActionControls({
  projection,
  busy,
  onSubmit,
}: {
  readonly projection: LearnerRunProjectionV1;
  readonly busy: boolean;
  readonly onSubmit: (
    input: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
}): ReactNode {
  return projection.workflowState.permittedActionIds.map(
    (action) => (
      <ActionControl
        key={`${projection.version}-${action}`}
        action={action}
        projection={projection}
        busy={busy}
        onSubmit={onSubmit}
      />
    ),
  );
}

function SimpleAction({
  action,
  busy,
  onSubmit,
}: {
  readonly action: string;
  readonly busy: boolean;
  readonly onSubmit: () => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  return (
    <div className="start__actions">
      <button
        className="button button--primary"
        type="button"
        disabled={busy}
        onClick={() => void onSubmit()}
      >
        {t(`hostedLearner.action.${action}`)}
      </button>
    </div>
  );
}

function SelectActionForm({
  action,
  options,
  busy,
  onSubmit,
}: {
  readonly action: string;
  readonly options: readonly {
    readonly value: string;
    readonly labelKey: string | null;
    readonly label?: string;
  }[];
  readonly busy: boolean;
  readonly onSubmit: (value: string) => Promise<void>;
}): ReactNode {
  const t = useTranslator();
  const [value, setValue] = useState(options[0]?.value ?? "");
  return (
    <form
      className="instructor-review__inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(value);
      }}
    >
      <div className="field">
        <label className="field__label" htmlFor={`action-${action}`}>
          {t(`hostedLearner.action.${action}`)}
        </label>
        <select
          className="field__control"
          id={`action-${action}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label !== undefined
                ? option.label
                : option.labelKey === null
                  ? option.value
                : t(option.labelKey)}
            </option>
          ))}
        </select>
      </div>
      <button
        className="button button--primary"
        disabled={busy || value.length === 0}
      >
        {t("hostedLearner.submit")}
      </button>
    </form>
  );
}

function GenericDecisionForm({
  projection,
  busy,
  onSubmit,
}: ActionFormProps & {
  readonly projection: LearnerRunProjectionV1;
}): ReactNode {
  const t = useTranslator();
  const node = projection.presentation?.currentNode;
  const fields = node?.fields ?? [];
  const responseConfiguration = node?.structuredResponse;
  const [responses, setResponses] = useState<
    Readonly<Record<string, readonly string[]>>
  >({});
  const [justification, setJustification] = useState("");
  const [citedEvidenceIds, setCitedEvidenceIds] = useState<
    readonly string[]
  >([]);
  const [citedPolicyIds, setCitedPolicyIds] = useState<
    readonly string[]
  >([]);
  const [confidenceRating, setConfidenceRating] = useState("");
  const [
    adverseEventProbabilityPercent,
    setAdverseEventProbabilityPercent,
  ] = useState("");
  if (
    node === undefined ||
    node.nodeType !== "DECISION" ||
    node.decisionId === undefined
  ) {
    return null;
  }

  const evidenceCitations =
    responseConfiguration?.evidenceCitations;
  const policyCitations =
    responseConfiguration?.policyCitations;
  const confidence = responseConfiguration?.confidenceRating;
  const adverseProbability =
    responseConfiguration?.adverseEventProbabilityPercent;
  const fieldsValid = fields.every((field) => {
    const selected = responses[field.fieldId] ?? [];
    return (
      selected.length > 0 &&
      (field.selection === "multiple" || selected.length === 1)
    );
  });
  const justificationValid =
    node.justification === undefined ||
    ((!node.justification.required ||
      justification.trim().length > 0) &&
      justification.length <= node.justification.maximumLength);
  const citationsValid =
    evidenceCitations === undefined
      ? citedEvidenceIds.length === 0
      : citedEvidenceIds.length >=
          evidenceCitations.minimumItems &&
        citedEvidenceIds.length <=
          evidenceCitations.maximumItems;
  const policyCitationsValid =
    policyCitations === undefined
      ? citedPolicyIds.length === 0
      : citedPolicyIds.length >= policyCitations.minimumItems &&
        citedPolicyIds.length <= policyCitations.maximumItems;
  const confidenceValid =
    confidence === undefined
      ? confidenceRating.length === 0
      : (!confidence.required && confidenceRating.length === 0) ||
        (confidenceRating.length > 0 &&
          Number.isFinite(Number(confidenceRating)) &&
          Number(confidenceRating) >= confidence.minimum &&
          Number(confidenceRating) <= confidence.maximum);
  const adverseProbabilityValid =
    adverseProbability === undefined
      ? adverseEventProbabilityPercent.length === 0
      : (!adverseProbability.required &&
          adverseEventProbabilityPercent.length === 0) ||
        (adverseEventProbabilityPercent.length > 0 &&
          Number.isFinite(Number(adverseEventProbabilityPercent)) &&
          Number(adverseEventProbabilityPercent) >=
            adverseProbability.minimum &&
          Number(adverseEventProbabilityPercent) <=
            adverseProbability.maximum);

  function toggleResponse(
    fieldId: string,
    optionId: string,
    checked: boolean,
  ) {
    setResponses((current) => {
      const selected = current[fieldId] ?? [];
      return {
        ...current,
        [fieldId]: checked
          ? [...selected, optionId]
          : selected.filter((candidate) => candidate !== optionId),
      };
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          commandType: "SUBMIT_STRUCTURED_DECISION",
          decisionId: node.decisionId,
          responses,
          ...(node.justification === undefined
            ? {}
            : { justification }),
          ...(evidenceCitations === undefined
            ? {}
            : { citedEvidenceIds }),
          ...(policyCitations === undefined
            ? {}
            : { citedPolicyIds }),
          ...(confidence === undefined ||
          confidenceRating.length === 0
            ? {}
            : {
                confidenceRating: Number(confidenceRating),
              }),
          ...(adverseProbability === undefined ||
          adverseEventProbabilityPercent.length === 0
            ? {}
            : {
                adverseEventProbabilityPercent: Number(
                  adverseEventProbabilityPercent,
                ),
              }),
        });
      }}
    >
      {fields.map((field) =>
        field.selection === "single" ? (
          <div className="field" key={field.fieldId}>
            <label
              className="field__label"
              htmlFor={`generic-decision-${field.fieldId}`}
            >
              {runText(field.prompt, t)}
            </label>
            <select
              className="field__control"
              id={`generic-decision-${field.fieldId}`}
              value={responses[field.fieldId]?.[0] ?? ""}
              required
              onChange={(event) =>
                setResponses((current) => ({
                  ...current,
                  [field.fieldId]:
                    event.target.value.length === 0
                      ? []
                      : [event.target.value],
                }))
              }
            >
              <option value="" />
              {field.options.map((option) => (
                <option key={option.optionId} value={option.optionId}>
                  {runText(option.label, t)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <fieldset key={field.fieldId}>
            <legend>{runText(field.prompt, t)}</legend>
            {field.options.map((option) => {
              const checked = (
                responses[field.fieldId] ?? []
              ).includes(option.optionId);
              return (
                <label key={option.optionId}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      toggleResponse(
                        field.fieldId,
                        option.optionId,
                        event.target.checked,
                      )
                    }
                  />{" "}
                  {runText(option.label, t)}
                </label>
              );
            })}
          </fieldset>
        ),
      )}
      {node.justification === undefined ? null : (
        <div className="field">
          <label
            className="field__label"
            htmlFor={`generic-justification-${node.decisionId}`}
          >
            {t("hostedLearner.justification")}
          </label>
          <textarea
            className="field__control"
            id={`generic-justification-${node.decisionId}`}
            value={justification}
            required={node.justification.required}
            maxLength={node.justification.maximumLength}
            onChange={(event) =>
              setJustification(event.target.value)
            }
          />
        </div>
      )}
      {evidenceCitations === undefined ? null : (
        <fieldset className="hosted-decision__citations">
          <legend>{t("hostedLearner.evidenceCitations")}</legend>
          <p className="field__hint">
            {t("hostedLearner.evidenceCitationHelp", {
              minimum: evidenceCitations.minimumItems,
              maximum: evidenceCitations.maximumItems,
            })}
          </p>
          {projection.informationState.map((record) => {
            const checked = citedEvidenceIds.includes(
              record.recordId,
            );
            const authored =
              projection.presentation?.evidenceTitles[
                record.recordId
              ];
            const label =
              authored === undefined
                ? t("hostedLearner.evidenceUnknown", {
                    evidenceId: record.recordId,
                  })
                : runText(authored, t);
            return (
              <label key={record.recordId}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={
                    !checked &&
                    citedEvidenceIds.length >=
                      evidenceCitations.maximumItems
                  }
                  onChange={(event) =>
                    setCitedEvidenceIds((current) =>
                      event.target.checked
                        ? [...current, record.recordId]
                        : current.filter(
                            (candidate) =>
                              candidate !== record.recordId,
                          ),
                    )
                  }
                />{" "}
                {t("hostedLearner.citeEvidence", {
                  evidence: label,
                })}
              </label>
            );
          })}
        </fieldset>
      )}
      {policyCitations === undefined ? null : (
        <fieldset className="hosted-decision__citations">
          <legend>{t("hostedLearner.policyCitations")}</legend>
          <p className="field__hint">
            {t("hostedLearner.policyCitationHelp", {
              minimum: policyCitations.minimumItems,
              maximum: policyCitations.maximumItems,
            })}
          </p>
          {projection.policyState.map((record) => {
            const checked = citedPolicyIds.includes(record.recordId);
            const authored =
              projection.presentation?.policyTitles[record.recordId];
            const label =
              authored === undefined
                ? record.recordId
                : runText(authored, t);
            return (
              <label key={record.recordId}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={
                    !checked &&
                    citedPolicyIds.length >=
                      policyCitations.maximumItems
                  }
                  onChange={(event) =>
                    setCitedPolicyIds((current) =>
                      event.target.checked
                        ? [...current, record.recordId]
                        : current.filter(
                            (candidate) =>
                              candidate !== record.recordId,
                          ),
                    )
                  }
                />{" "}
                {t("hostedLearner.citePolicy", { policy: label })}
              </label>
            );
          })}
        </fieldset>
      )}
      {confidence === undefined ? null : (
        <NumericDecisionField
          id={`generic-confidence-${node.decisionId}`}
          label={t("hostedLearner.confidence")}
          configuration={confidence}
          value={confidenceRating}
          onChange={setConfidenceRating}
          kind="select"
        />
      )}
      {adverseProbability === undefined ? null : (
        <NumericDecisionField
          id={`generic-adverse-probability-${node.decisionId}`}
          label={t("hostedLearner.adverseEventProbability")}
          configuration={adverseProbability}
          value={adverseEventProbabilityPercent}
          onChange={setAdverseEventProbabilityPercent}
          kind="number"
        />
      )}
      <button
        className="button button--primary"
        disabled={
          busy ||
          !fieldsValid ||
          !justificationValid ||
          !citationsValid ||
          !policyCitationsValid ||
          !confidenceValid ||
          !adverseProbabilityValid
        }
      >
        {t("hostedLearner.submit")}
      </button>
    </form>
  );
}

function CertificateDecisionForm({
  projection,
  busy,
  onSubmit,
}: ActionFormProps & {
  readonly projection: LearnerRunProjectionV1;
}): ReactNode {
  const t = useTranslator();
  const responseConfiguration =
    structuredDecisionResponseConfiguration(projection);
  const [certificateAssessment, setCertificate] = useState("VALID");
  const [issuerAssessment, setIssuer] =
    useState("RECOGNIZED_AUTHORIZED");
  const [storageChoice, setStorage] = useState("HASH_OFF_CHAIN");
  const [lotDisposition, setDisposition] = useState("CONTINUE");
  const [justification, setJustification] = useState("");
  const [citedEvidenceIds, setCitedEvidenceIds] = useState<
    readonly string[]
  >([]);
  const [citedPolicyIds, setCitedPolicyIds] = useState<
    readonly string[]
  >([]);
  const [confidenceRating, setConfidenceRating] = useState("");
  const [
    adverseEventProbabilityPercent,
    setAdverseEventProbabilityPercent,
  ] = useState("");
  const citations =
    responseConfiguration?.evidenceCitations;
  const policyCitations =
    responseConfiguration?.policyCitations;
  const availablePolicies =
    decisionPolicyReferences(projection);
  const confidence =
    responseConfiguration?.confidenceRating;
  const adverseProbability =
    responseConfiguration?.adverseEventProbabilityPercent;
  const citationsValid =
    citations === undefined ||
    (citedEvidenceIds.length >= citations.minimumItems &&
      citedEvidenceIds.length <= citations.maximumItems);
  const policyCitationsValid =
    policyCitations === undefined ||
    (citedPolicyIds.length >= policyCitations.minimumItems &&
      citedPolicyIds.length <= policyCitations.maximumItems);
  const confidenceValid =
    confidence === undefined ||
    (!confidence.required && confidenceRating === "") ||
    (confidenceRating !== "" &&
      Number.isInteger(Number(confidenceRating)) &&
      Number(confidenceRating) >= confidence.minimum &&
      Number(confidenceRating) <= confidence.maximum);
  const adverseProbabilityValid =
    adverseProbability === undefined ||
    (!adverseProbability.required &&
      adverseEventProbabilityPercent === "") ||
    (adverseEventProbabilityPercent !== "" &&
      Number.isInteger(Number(adverseEventProbabilityPercent)) &&
      Number(adverseEventProbabilityPercent) >=
        adverseProbability.minimum &&
      Number(adverseEventProbabilityPercent) <=
        adverseProbability.maximum);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          commandType: "SUBMIT_CERTIFICATE_DECISION",
          decision: {
            certificateAssessment,
            issuerAssessment,
            storageChoice,
            lotDisposition,
          },
          justification,
          ...(citations === undefined
            ? {}
            : { citedEvidenceIds }),
          ...(policyCitations === undefined
            ? {}
            : { citedPolicyIds }),
          ...(confidence === undefined ||
          confidenceRating === ""
            ? {}
            : {
                confidenceRating: Number(confidenceRating),
              }),
          ...(adverseProbability === undefined ||
          adverseEventProbabilityPercent === ""
            ? {}
            : {
                adverseEventProbabilityPercent: Number(
                  adverseEventProbabilityPercent,
                ),
              }),
        });
      }}
    >
      <DecisionSelect
        id="certificate-assessment"
        label={t("hostedLearner.certificateAssessment")}
        value={certificateAssessment}
        onChange={setCertificate}
        options={["VALID", "EXPIRED", "CONTENT_INVALID"]}
      />
      <DecisionSelect
        id="issuer-assessment"
        label={t("hostedLearner.issuerAssessment")}
        value={issuerAssessment}
        onChange={setIssuer}
        options={[
          "RECOGNIZED_AUTHORIZED",
          "RECOGNIZED_UNAUTHORIZED",
          "UNRECOGNIZED",
        ]}
      />
      <DecisionSelect
        id="storage-choice"
        label={t("hostedLearner.storageChoice")}
        value={storageChoice}
        onChange={setStorage}
        options={["HASH_OFF_CHAIN", "FULL_DOCUMENT_ON_CHAIN"]}
      />
      <DecisionSelect
        id="lot-disposition"
        label={t("hostedLearner.lotDisposition")}
        value={lotDisposition}
        onChange={setDisposition}
        options={["CONTINUE", "HOLD"]}
      />
      <div className="field">
        <label className="field__label" htmlFor="certificate-justification">
          {t("hostedLearner.justification")}
        </label>
        <textarea
          className="field__control"
          id="certificate-justification"
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
          maxLength={1000}
          required
        />
      </div>
      {citations === undefined ? null : (
        <fieldset className="hosted-decision__citations">
          <legend>{t("hostedLearner.evidenceCitations")}</legend>
          <p className="field__hint">
            {t("hostedLearner.evidenceCitationHelp", {
              minimum: citations.minimumItems,
              maximum: citations.maximumItems,
            })}
          </p>
          {projection.informationState.map((record) => {
            const checked = citedEvidenceIds.includes(record.recordId);
            const citationLabel = t(
              evidenceLocalizationKeys[record.recordId] ??
                "hostedLearner.evidenceUnknown",
              { evidenceId: record.recordId },
            );
            return (
              <label key={record.recordId}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={
                    !checked &&
                    citedEvidenceIds.length >=
                      citations.maximumItems
                  }
                  onChange={(event) =>
                    setCitedEvidenceIds((current) =>
                      event.target.checked
                        ? [...current, record.recordId]
                        : current.filter(
                            (item) => item !== record.recordId,
                          ),
                    )
                  }
                />{" "}
                {t("hostedLearner.citeEvidence", {
                  evidence: citationLabel,
                })}
              </label>
            );
          })}
        </fieldset>
      )}
      {policyCitations === undefined ? null : (
        <fieldset className="hosted-decision__citations">
          <legend>{t("hostedLearner.policyCitations")}</legend>
          <p className="field__hint">
            {t("hostedLearner.policyCitationHelp", {
              minimum: policyCitations.minimumItems,
              maximum: policyCitations.maximumItems,
            })}
          </p>
          {availablePolicies.map((policy) => {
            const checked = citedPolicyIds.includes(policy.policyId);
            return (
              <label key={policy.policyId}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={
                    !checked &&
                    citedPolicyIds.length >=
                      policyCitations.maximumItems
                  }
                  onChange={(event) =>
                    setCitedPolicyIds((current) =>
                      event.target.checked
                        ? [...current, policy.policyId]
                        : current.filter(
                            (item) => item !== policy.policyId,
                          ),
                    )
                  }
                />{" "}
                {t("hostedLearner.citePolicy", {
                  policy: t(policy.titleKey),
                })}
              </label>
            );
          })}
        </fieldset>
      )}
      {confidence === undefined ? null : (
        <NumericDecisionField
          id="certificate-confidence"
          label={t("hostedLearner.confidence")}
          configuration={confidence}
          value={confidenceRating}
          onChange={setConfidenceRating}
          kind="select"
        />
      )}
      {adverseProbability === undefined ? null : (
        <NumericDecisionField
          id="certificate-adverse-probability"
          label={t("hostedLearner.adverseEventProbability")}
          configuration={adverseProbability}
          value={adverseEventProbabilityPercent}
          onChange={setAdverseEventProbabilityPercent}
          kind="number"
        />
      )}
      <button
        className="button button--primary"
        disabled={
          busy ||
          !citationsValid ||
          !policyCitationsValid ||
          !confidenceValid ||
          !adverseProbabilityValid
        }
      >
        {t("hostedLearner.submit")}
      </button>
    </form>
  );
}

function NumericDecisionField({
  id,
  label,
  configuration,
  value,
  onChange,
  kind,
}: {
  readonly id: string;
  readonly label: string;
  readonly configuration: DecisionNumericResponseConfigurationV1;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly kind: "number" | "select";
}): ReactNode {
  const values = Array.from(
    {
      length:
        configuration.maximum - configuration.minimum + 1,
    },
    (_, index) => configuration.minimum + index,
  );
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      {kind === "select" ? (
        <select
          className="field__control"
          id={id}
          value={value}
          required={configuration.required}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="" />
          {values.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="field__control"
          id={id}
          type="number"
          min={configuration.minimum}
          max={configuration.maximum}
          step={1}
          required={configuration.required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

interface ActionFormProps {
  readonly busy: boolean;
  readonly onSubmit: (
    input: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
}

function DecisionSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly string[];
}): ReactNode {
  const t = useTranslator();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <select
        className="field__control"
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(
              optionLocalizationKeys[option] ??
                "hostedLearner.optionUnknown",
              { option },
            )}
          </option>
        ))}
      </select>
    </div>
  );
}

function CustodyProposalForm({
  busy,
  onSubmit,
}: ActionFormProps): ReactNode {
  const t = useTranslator();
  const [alsoTransfersOwnership, setOwnership] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          commandType: "CREATE_CUSTODY_TRANSFER_PROPOSAL",
          alsoTransfersOwnership,
        });
      }}
    >
      <label>
        <input
          type="checkbox"
          checked={alsoTransfersOwnership}
          onChange={(event) => setOwnership(event.target.checked)}
        />{" "}
        {t("hostedLearner.alsoTransferOwnership")}
      </label>
      <div className="start__actions">
        <button className="button button--primary" disabled={busy}>
          {t("hostedLearner.submit")}
        </button>
      </div>
    </form>
  );
}

function DiscrepancyDecisionForm({
  busy,
  onSubmit,
}: ActionFormProps): ReactNode {
  const t = useTranslator();
  const [action, setAction] = useState("APPEND_CORRECTION");
  const [causeCode, setCause] = useState("TYPING_ERROR");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          commandType: "SUBMIT_DISCREPANCY_DECISION",
          decision: { action, causeCode },
        });
      }}
    >
      <DecisionSelect
        id="discrepancy-action"
        label={t("hostedLearner.discrepancyAction")}
        value={action}
        onChange={setAction}
        options={[
          "IGNORE",
          "OVERWRITE",
          "DELETE",
          "APPEND_CORRECTION",
          "INVESTIGATE_THEN_CORRECT",
        ]}
      />
      <DecisionSelect
        id="discrepancy-cause"
        label={t("hostedLearner.discrepancyCause")}
        value={causeCode}
        onChange={setCause}
        options={[
          "TYPING_ERROR",
          "UNIT_MISMATCH",
          "PHYSICAL_LOSS",
          "FRAUD",
          "UNKNOWN",
        ]}
      />
      <button className="button button--primary" disabled={busy}>
        {t("hostedLearner.submit")}
      </button>
    </form>
  );
}

function CorrectionProposalForm({
  busy,
  onSubmit,
}: ActionFormProps): ReactNode {
  const t = useTranslator();
  const [reason, setReason] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          commandType: "CREATE_CORRECTION_PROPOSAL",
          reason,
        });
      }}
    >
      <div className="field">
        <label className="field__label" htmlFor="correction-reason">
          {t("hostedLearner.correctionReason")}
        </label>
        <textarea
          className="field__control"
          id="correction-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={10}
          maxLength={240}
          required
        />
      </div>
      <button className="button button--primary" disabled={busy}>
        {t("hostedLearner.submit")}
      </button>
    </form>
  );
}

function KnowledgeDecisionForm({
  step,
  busy,
  onSubmit,
}: ActionFormProps & { readonly step: string }): ReactNode {
  const definition =
    step === "transformation-knowledge"
      ? {
          decisionId: "INT_TRANSFORMATION_PROVENANCE",
          options: [
            "OPT_NEW_INDEPENDENT_BATCH",
            "OPT_LINKED_TO_INPUT",
            "OPT_INPUT_DELETED",
          ],
        }
      : step === "tamper-knowledge"
        ? {
            decisionId: "INT_TAMPER_DEMONSTRATION",
            options: [
              "OPT_PREVENTS_EDITING",
              "OPT_MAKES_EDIT_DETECTABLE",
              "OPT_ONLY_LAST_BLOCK",
            ],
          }
        : {
            decisionId: "INT_BLOCKCHAIN_NECESSITY",
            options: [
              "OPT_ALWAYS_BETTER",
              "OPT_INDEPENDENT_ORGANIZATIONS",
              "OPT_FASTER_THAN_DATABASE",
              "OPT_GUARANTEES_TRUTH",
            ],
          };
  return (
    <SelectActionForm
      action="SUBMIT_KNOWLEDGE_DECISION"
      options={definition.options.map((value) => ({
        value,
        labelKey: optionLocalizationKeys[value] ?? null,
      }))}
      busy={busy}
      onSubmit={(selectedOptionId) =>
        onSubmit({
          commandType: "SUBMIT_KNOWLEDGE_DECISION",
          decisionId: definition.decisionId,
          selectedOptionId,
        })
      }
    />
  );
}

const governanceItems = [
  "ITEM_BATCH_ID",
  "ITEM_RECALL_STATUS",
  "ITEM_CERTIFICATE_PDF",
  "ITEM_SENSOR_DATASET",
  "ITEM_WHOLESALE_PRICE",
  "ITEM_CUSTOMER_ADDRESS",
] as const;
const governanceCategories = [
  "CAT_ON_CHAIN",
  "CAT_OFF_CHAIN_HASH",
  "CAT_AUTHORIZED_ONLY",
  "CAT_DO_NOT_COLLECT",
] as const;

function GovernanceDecisionForm({
  busy,
  onSubmit,
}: ActionFormProps): ReactNode {
  const t = useTranslator();
  const [categoryByItem, setCategories] = useState<
    Readonly<Record<string, string>>
  >(
    Object.fromEntries(
      governanceItems.map((item) => [item, "CAT_ON_CHAIN"]),
    ),
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          commandType: "SUBMIT_DATA_GOVERNANCE_DECISION",
          decisionId: "INT_DATA_GOVERNANCE_CLASSIFICATION",
          categoryByItem,
        });
      }}
    >
      {governanceItems.map((item) => (
        <DecisionSelect
          key={item}
          id={`governance-${item}`}
          label={t(
            {
              ITEM_BATCH_ID: "check.dataGovernance.itemBatchId",
              ITEM_RECALL_STATUS: "check.dataGovernance.itemRecallStatus",
              ITEM_CERTIFICATE_PDF:
                "check.dataGovernance.itemCertificatePdf",
              ITEM_SENSOR_DATASET:
                "check.dataGovernance.itemSensorDataset",
              ITEM_WHOLESALE_PRICE:
                "check.dataGovernance.itemWholesalePrice",
              ITEM_CUSTOMER_ADDRESS:
                "check.dataGovernance.itemCustomerAddress",
            }[item],
          )}
          value={categoryByItem[item] ?? governanceCategories[0]}
          onChange={(value) =>
            setCategories((current) => ({
              ...current,
              [item]: value,
            }))
          }
          options={governanceCategories}
        />
      ))}
      <button className="button button--primary" disabled={busy}>
        {t("hostedLearner.submit")}
      </button>
    </form>
  );
}

const recallAssets = [
  "BAT_PACKAGED_COFFEE_001",
  "BAT_PACKAGED_COFFEE_002",
  "BAT_PACKAGED_COFFEE_003",
  "BAT_ROASTED_COFFEE_001",
] as const;

function RecallScopeForm({
  busy,
  onSubmit,
}: ActionFormProps): ReactNode {
  const t = useTranslator();
  const [selected, setSelected] = useState<readonly string[]>([]);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          commandType: "SUBMIT_RECALL_SCOPE_DECISION",
          decisionId: "INT_RECALL_SCOPE",
          selectedAssetIds: selected,
        });
      }}
    >
      <fieldset>
        <legend>{t("hostedLearner.recallScope")}</legend>
        {recallAssets.map((assetId) => (
          <label key={assetId}>
            <input
              type="checkbox"
              checked={selected.includes(assetId)}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, assetId]
                    : current.filter((item) => item !== assetId),
                )
              }
            />{" "}
            {t(optionLocalizationKeys[assetId] ?? "hostedLearner.optionUnknown", {
              option: assetId,
            })}
          </label>
        ))}
      </fieldset>
      <button className="button button--primary" disabled={busy}>
        {t("hostedLearner.submit")}
      </button>
    </form>
  );
}
