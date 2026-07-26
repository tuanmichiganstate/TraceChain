import { useMemo, useRef, useState, type ReactNode } from "react";
import type {
  CommandContext,
  SupplyChainCommand,
} from "../domain/commands/commands";
import { TransactionStatus } from "../domain/types/enums";
import type {
  EndorsementPolicyExpression,
} from "../crypto/signatures/types";
import { useTranslator } from "../app/providers/locale-provider";
import { useScenario } from "../app/providers/scenario-provider";
import { useSimulation } from "../app/providers/simulation-provider";
import { useOptionalConfiguration } from "../app/providers/configuration-provider";
import { SignatureTrustSummary } from "./signature-trust-summary";
import { StatusPill } from "./status-pill";
import { TransactionPipeline } from "./transaction-pipeline";
import { ValidationResults } from "./validation-results";

function policyOrganizations(
  expression: EndorsementPolicyExpression,
): readonly string[] {
  switch (expression.kind) {
    case "SIGNED_BY":
      return [expression.organizationId];
    case "ALL_OF":
    case "ANY_OF":
      return expression.policies.flatMap(policyOrganizations);
    case "THRESHOLD":
      return expression.organizationIds;
  }
}

/**
 * Feature-gated multi-organization transaction flow.
 *
 * The business command remains immutable after proposal creation. Scenario
 * handoffs select trusted signer context; learner-controlled payloads never
 * carry actor, organization, or role identity.
 */
export function EndorsedTransactionAction({
  decisionId,
  actionId,
  labelKey,
  summary,
  buildCommand,
  recordDecision = true,
  allowRejectedRetry = true,
  onCommitted,
}: {
  readonly decisionId: string;
  readonly actionId: string;
  readonly labelKey: string;
  readonly summary: ReadonlyArray<
    readonly [string, ReactNode]
  >;
  readonly buildCommand: () => SupplyChainCommand;
  readonly context: CommandContext;
  readonly isFirstOfType?: boolean;
  readonly recordDecision?: boolean;
  readonly allowRejectedRetry?: boolean;
  readonly onCommitted?: () => void;
}): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const configuration = useOptionalConfiguration();
  const {
    state,
    activeTrustedContext,
    createEndorsedProposal,
    endorsePendingProposal,
    declinePendingProposal,
    commitEndorsedProposal,
    requestRoleHandoff,
    sealPendingBlock,
  } = useSimulation();
  const [isSubmitting, setSubmitting] = useState(false);
  const [isHandoffPending, setHandoffPending] = useState(false);
  const [isSealing, setSealing] = useState(false);
  const submissionInFlight = useRef(false);
  const handoffInFlight = useRef(false);
  const sealInFlight = useRef(false);
  const [dismissedAuditIds, setDismissedAuditIds] = useState<
    readonly string[]
  >([]);
  const [submissionFailed, setSubmissionFailed] =
    useState(false);

  const pending = useMemo(
    () =>
      Object.values(
        state.simulation.pendingProposalsById,
      )
        .filter(
          (candidate) =>
            candidate.actionId === actionId &&
            candidate.status !== "SUPERSEDED",
        )
        .sort((left, right) =>
          right.proposalId.localeCompare(
            left.proposalId,
            "en",
          ),
        )[0] ?? null,
    [actionId, state.simulation.pendingProposalsById],
  );
  const commandType = buildCommand().commandType;
  const latestAudit =
    [...state.simulation.attemptAuditEvents]
      .reverse()
      .find((event) => {
        if (dismissedAuditIds.includes(event.auditEventId)) {
          return false;
        }
        const payload = event.submittedCommand.payload as {
          readonly commandType?: string;
          readonly proposalId?: string;
        };
        return (
          payload.commandType === commandType ||
          (pending !== null &&
            payload.proposalId === pending.proposalId)
        );
      }) ?? null;
  const transaction =
    pending?.transactionId === null ||
    pending?.transactionId === undefined
      ? null
      : (state.domain.transactionsById[
          pending.transactionId
        ] ?? null);
  const isOrdered =
    transaction?.transactionStatus === TransactionStatus.ORDERED;
  const isCommitted =
    transaction?.transactionStatus ===
    TransactionStatus.COMMITTED;
  const requiredOrganizations =
    pending === null
      ? []
      : [
          ...new Set(
            policyOrganizations(pending.policy.expression),
          ),
        ];
  const validEndorsementIds = new Set(
    pending?.evaluation.validEndorsementIds ?? [],
  );
  const signedOrganizations = new Set(
    pending?.endorsements
      .filter((record) =>
        validEndorsementIds.has(record.endorsementId),
      )
      .map((record) => record.organizationId) ?? [],
  );
  const missingOrganizations =
    pending?.evaluation.missingOrganizationIds ?? [];
  const activeMayEndorse =
    pending !== null &&
    pending.status !== "COMMITTED" &&
    pending.status !== "SUPERSEDED" &&
    missingOrganizations.includes(
      activeTrustedContext.organizationId,
    );
  const availableHandoff =
    pending === null
      ? null
      : scenario.runtime.roleHandoffs.find((handoff) => {
          if (
            handoff.stageId !== state.viewedStageId ||
            handoff.fromContextId !==
              activeTrustedContext.contextId
          ) {
            return false;
          }
          const target = scenario.runtime.trustedContexts.find(
            (candidate) =>
              candidate.contextId === handoff.toContextId,
          );
          return (
            target !== undefined &&
            missingOrganizations.includes(
              target.organizationId,
            )
          );
        }) ?? null;

  const submitProposal = async (): Promise<void> => {
    if (submissionInFlight.current) return;
    submissionInFlight.current = true;
    setSubmitting(true);
    setSubmissionFailed(false);
    try {
      await createEndorsedProposal(
        actionId,
        decisionId,
        buildCommand(),
        { recordDecision },
      );
    } catch {
      setSubmissionFailed(true);
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  };

  const endorse = async (): Promise<void> => {
    if (pending === null || submissionInFlight.current) return;
    submissionInFlight.current = true;
    setSubmitting(true);
    setSubmissionFailed(false);
    try {
      await endorsePendingProposal(pending.proposalId);
    } catch {
      setSubmissionFailed(true);
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  };

  const decline = async (): Promise<void> => {
    if (pending === null || submissionInFlight.current) return;
    submissionInFlight.current = true;
    setSubmitting(true);
    setSubmissionFailed(false);
    try {
      await declinePendingProposal(pending.proposalId);
    } catch {
      setSubmissionFailed(true);
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  };

  const commit = async (): Promise<void> => {
    if (pending === null || submissionInFlight.current) return;
    submissionInFlight.current = true;
    setSubmitting(true);
    setSubmissionFailed(false);
    try {
      await commitEndorsedProposal(
        pending.proposalId,
        decisionId,
        { recordDecision },
      );
    } catch {
      setSubmissionFailed(true);
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  };

  const seal = async (): Promise<void> => {
    if (sealInFlight.current) return;
    sealInFlight.current = true;
    setSealing(true);
    setSubmissionFailed(false);
    try {
      await sealPendingBlock();
      onCommitted?.();
    } catch {
      setSubmissionFailed(true);
    } finally {
      sealInFlight.current = false;
      setSealing(false);
    }
  };

  return (
    <section className="card card--work transaction-action">
      <h3>{t(labelKey)}</h3>

      <dl className="asset-card__grid">
        {summary.map(([labelKeyOrText, value]) => (
          <div
            key={labelKeyOrText}
            className="asset-card__row"
          >
            <dt>{t(labelKeyOrText)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">
        {t("transaction.signatureNoticeReal")}
      </p>

      {pending === null && latestAudit === null ? (
        <button
          type="button"
          className="button button--primary"
          onClick={() => void submitProposal()}
          disabled={state.isReadOnly || isSubmitting}
        >
          {t(
            isSubmitting
              ? "action.processing"
              : "transaction.submit",
          )}
        </button>
      ) : null}

      {submissionFailed ? (
        <p className="field__error" role="alert">
          {t("transaction.submissionFailed")}
        </p>
      ) : null}

      {latestAudit?.signatureEvidence !== undefined ? (
        <SignatureTrustSummary
          evidence={latestAudit.signatureEvidence}
        />
      ) : pending !== null ? (
        <SignatureTrustSummary
          evidence={pending.proposalEvidence}
          endorsementStatus={
            pending.evaluation.satisfied
              ? "SATISFIED"
              : "PENDING"
          }
        />
      ) : null}

      {latestAudit !== null ? (
        <section className="validation-results">
          <h4>{t("validation.heading")}</h4>
          <p>{t("validation.someFailed")}</p>
          <ul>
            {latestAudit.validationFailures.map((failure) => (
              <li key={failure.code}>
                {t(failure.messageKey)}
              </li>
            ))}
          </ul>
          {allowRejectedRetry &&
          pending === null ? (
            <button
              type="button"
              className="button button--secondary"
              onClick={() =>
                setDismissedAuditIds([
                  ...dismissedAuditIds,
                  latestAudit.auditEventId,
                ])
              }
            >
              {t("transaction.edit")}
            </button>
          ) : null}
        </section>
      ) : null}

      {pending !== null ? (
        <section
          className="endorsement-policy"
          aria-labelledby={`endorsement-policy-${pending.proposalId}`}
        >
          <h4 id={`endorsement-policy-${pending.proposalId}`}>
            {t("endorsement.policyHeading")}
          </h4>
          <p>{t(pending.policy.localizationKey)}</p>
          <ul className="endorsement-policy__organizations">
            {requiredOrganizations.map((organizationId) => {
              const organization =
                scenario.organizations.find(
                  (candidate) =>
                    candidate.organizationId === organizationId,
                );
              return (
                <li key={organizationId}>
                  <span>
                    {organization === undefined
                      ? organizationId
                      : t(organization.displayNameKey)}
                  </span>{" "}
                  <StatusPill
                    tone={
                      signedOrganizations.has(organizationId)
                        ? "pass"
                        : "neutral"
                    }
                  >
                    {t(
                      signedOrganizations.has(organizationId)
                        ? "endorsement.signedVerified"
                        : "endorsement.awaiting",
                    )}
                  </StatusPill>
                </li>
              );
            })}
          </ul>
          <p>
            <strong>{t("endorsement.policyStatus")}</strong>{" "}
            {t(
              pending.evaluation.satisfied
                ? "endorsement.policySatisfied"
                : "endorsement.policyProgress",
              {
                signed:
                  pending.evaluation.validEndorsementIds.length,
                required: requiredOrganizations.length,
              },
            )}
          </p>
          {pending.declineCommandIds.length > 0 ? (
            <p className="muted">
              {t("endorsement.declineRetained")}
            </p>
          ) : null}
          <details>
            <summary>{t("signature.viewEvidence")}</summary>
            <dl className="asset-card__grid">
              <div className="asset-card__row">
                <dt>{t("signature.digestLabel")}</dt>
                <dd>
                  <code className="technical-value">
                    {pending.proposalEvidence.proposalDigest}
                  </code>
                </dd>
              </div>
              <div className="asset-card__row">
                <dt>{t("endorsement.policyExpression")}</dt>
                <dd>
                  <code className="technical-value">
                    {JSON.stringify(pending.policy.expression)}
                  </code>
                </dd>
              </div>
              <div className="asset-card__row">
                <dt>{t("signature.stateVersionsLabel")}</dt>
                <dd>
                  <code className="technical-value">
                    {JSON.stringify(
                      pending.command.metadata
                        .expectedStateVersions,
                    )}
                  </code>
                </dd>
              </div>
            </dl>
            <h5>{t("endorsement.evidenceHeading")}</h5>
            <ul className="endorsement-policy__evidence-list">
              {pending.endorsements.map((record) => {
                const organization =
                  scenario.organizations.find(
                    (candidate) =>
                      candidate.organizationId ===
                      record.organizationId,
                  );
                return (
                  <li key={record.endorsementId}>
                    <strong>
                      {organization === undefined
                        ? record.organizationId
                        : t(organization.displayNameKey)}
                    </strong>
                    <dl className="asset-card__grid">
                      <div className="asset-card__row">
                        <dt>{t("signature.keyIdLabel")}</dt>
                        <dd>
                          <code>{record.keyId}</code>
                        </dd>
                      </div>
                      <div className="asset-card__row">
                        <dt>
                          {t("signature.fingerprintLabel")}
                        </dt>
                        <dd>
                          <code className="technical-value">
                            {record.verification
                              .publicKeyFingerprint ??
                              t("common.notAvailable")}
                          </code>
                        </dd>
                      </div>
                      <div className="asset-card__row">
                        <dt>{t("signature.signatureLabel")}</dt>
                        <dd>
                          <StatusPill
                            tone={
                              record.verification.signatureValid
                                ? "pass"
                                : "fail"
                            }
                          >
                            {t(
                              record.verification.signatureValid
                                ? "signature.valid"
                                : "signature.invalid",
                            )}
                          </StatusPill>
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          </details>
        </section>
      ) : null}

      {pending !== null &&
      !pending.evaluation.satisfied &&
      availableHandoff !== null ? (
        <section className="endorsement-actions">
          <p className="muted">
            {t(
              configuration?.configuration.mode ===
                "challenge"
                ? "endorsement.handoffChallengePrompt"
                : "endorsement.handoffGuidedPrompt",
            )}
          </p>
          <button
            type="button"
            className="button button--secondary"
            disabled={
              state.isReadOnly || isHandoffPending
            }
            onClick={() => {
              if (handoffInFlight.current) return;
              handoffInFlight.current = true;
              setHandoffPending(true);
              setSubmissionFailed(false);
              void requestRoleHandoff(availableHandoff.handoffId)
                .catch(() => setSubmissionFailed(true))
                .finally(() => {
                  handoffInFlight.current = false;
                  setHandoffPending(false);
                });
            }}
          >
            {t(
              isHandoffPending
                ? "action.processing"
                : configuration?.configuration.mode ===
                    "challenge"
                  ? "endorsement.handoffChallenge"
                  : availableHandoff.labelKey,
            )}
          </button>
        </section>
      ) : null}

      {pending !== null &&
      !pending.evaluation.satisfied &&
      activeMayEndorse ? (
        <section className="endorsement-actions">
          <p>{t("endorsement.reviewExactProposal")}</p>
          <button
            type="button"
            className="button button--primary"
            disabled={state.isReadOnly || isSubmitting}
            onClick={() => void endorse()}
          >
            {t(
              isSubmitting
                ? "action.processing"
                : "endorsement.endorse",
            )}
          </button>
          {pending.declineCommandIds.length === 0 ? (
            <button
              type="button"
              className="button button--secondary"
              disabled={state.isReadOnly || isSubmitting}
              onClick={() => void decline()}
            >
              {t(
                isSubmitting
                  ? "action.processing"
                  : "endorsement.decline",
              )}
            </button>
          ) : null}
        </section>
      ) : null}

      {pending?.evaluation.satisfied === true &&
      transaction === null ? (
        <button
          type="button"
          className="button button--primary"
          disabled={state.isReadOnly || isSubmitting}
          onClick={() => void commit()}
        >
          {t(
            isSubmitting
              ? "action.processing"
              : "endorsement.commit",
          )}
        </button>
      ) : null}

      {transaction !== null ? (
        <>
          <TransactionPipeline
            status={transaction.transactionStatus}
            blockId={transaction.blockId}
            failureCount={
              transaction.validationResults.filter(
                (result) => result.status === "FAILED",
              ).length
            }
          />
          <ValidationResults
            results={transaction.validationResults}
            isValid
          />
          {isOrdered ? (
            <button
              type="button"
              className="button button--primary"
              onClick={() => void seal()}
              disabled={state.isReadOnly || isSealing}
            >
              {t(
                isSealing
                  ? "action.processing"
                  : "stage.createBatch.sealBlock",
              )}
            </button>
          ) : null}
          {isCommitted ? (
            <p className="muted">
              {t("pipeline.announceCommitted", {
                blockId: transaction.blockId ?? "",
              })}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
