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
  ApplicationRole,
  LearnerRunProjectionV1,
} from "../contracts/run-events";

interface LearnerSession {
  readonly userId: string;
  readonly email: string;
  readonly roles: readonly ApplicationRole[];
}

interface HostedLearnerFeedback {
  readonly assignmentId: string;
  readonly releasedAt?: string;
  readonly ratings: readonly ManualRubricRatingV1[];
  readonly moderationResolutions:
    readonly RubricModerationResolutionV1[];
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

export function HostedLearnerScreen({
  api = browserApi,
}: {
  readonly api?: HostedLearnerApi;
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
            {assignments.length === 0 ? (
              <p>{t("hostedLearner.noAssignments")}</p>
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
                    {assignments.map(({ assignment, runs }) => {
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
                              ? t("hostedLearner.notStarted")
                              : t(`hostedLearner.run.${latest.status}`)}
                          </td>
                          <td>
                            {latest === undefined ? (
                              <button
                                className="button button--primary"
                                type="button"
                                disabled={
                                  busy || assignment.status !== "active"
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
              <LearnerFeedback feedback={feedback} />
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
      ) : feedback.moderationResolutions.length > 0 ? (
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
      ) : (
        <p>{t("hostedLearner.feedbackEmpty")}</p>
      )}
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
              {t(
                roleLocalizationKeys[projection.roleId] ??
                  "hostedLearner.roleUnknown",
                { roleId: projection.roleId },
              )}
            </dd>
          </div>
          <div>
            <dt>{t("hostedLearner.step")}</dt>
            <dd>
              {projection.workflowState.permittedActionIds[0] === undefined
                ? t("hostedLearner.complete")
                : t(
                    `hostedLearner.action.${projection.workflowState.permittedActionIds[0]}`,
                  )}
            </dd>
          </div>
        </dl>
      </section>
      <section className="card card--reference">
        <h2>{t("hostedLearner.evidence")}</h2>
        {projection.informationState.length === 0 ? (
          <p>{t("hostedLearner.none")}</p>
        ) : (
          <ul>
            {projection.informationState.map((record) => (
              <li key={record.recordId}>
                {t(
                  evidenceLocalizationKeys[record.recordId] ??
                    "hostedLearner.evidenceUnknown",
                  { evidenceId: record.recordId },
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
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
        {actions.length === 0 ? (
          <p>{t("hostedLearner.complete")}</p>
        ) : (
          actions.map((action) => (
            <ActionControl
              key={action}
              action={action}
              projection={projection}
              busy={busy}
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
  if (action === "INSPECT_EVIDENCE") {
    return (
      <SelectActionForm
        action={action}
        options={projection.informationState.map((item) => ({
          value: item.recordId,
          labelKey: null,
        }))}
        busy={busy}
        onSubmit={(evidenceId) =>
          onSubmit({ commandType: action, evidenceId })
        }
      />
    );
  }
  if (action === "SUBMIT_CERTIFICATE_DECISION") {
    return <CertificateDecisionForm busy={busy} onSubmit={onSubmit} />;
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
              {option.labelKey === null
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

function CertificateDecisionForm({
  busy,
  onSubmit,
}: ActionFormProps): ReactNode {
  const t = useTranslator();
  const [certificateAssessment, setCertificate] = useState("VALID");
  const [issuerAssessment, setIssuer] =
    useState("RECOGNIZED_AUTHORIZED");
  const [storageChoice, setStorage] = useState("HASH_OFF_CHAIN");
  const [lotDisposition, setDisposition] = useState("CONTINUE");
  const [justification, setJustification] = useState("");
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
      <button className="button button--primary" disabled={busy}>
        {t("hostedLearner.submit")}
      </button>
    </form>
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
