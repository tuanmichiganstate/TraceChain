import { useId, type ReactNode } from "react";
import { TransactionStatus } from "../domain/types/enums";
import { useTranslator } from "../app/providers/locale-provider";

const PIPELINE_STEPS: readonly TransactionStatus[] = [
  TransactionStatus.DRAFT,
  TransactionStatus.SIGNED,
  TransactionStatus.SUBMITTED,
  TransactionStatus.VALIDATED,
  TransactionStatus.ENDORSED,
  TransactionStatus.ORDERED,
  TransactionStatus.COMMITTED,
];

function stepIndex(status: TransactionStatus): number {
  const index = PIPELINE_STEPS.indexOf(status);
  return index >= 0 ? index : PIPELINE_STEPS.length - 1;
}

/**
 * The transaction lifecycle, shown as an ordered list.
 *
 * ACCESSIBILITY NOTE. The specification asks for an animated status transition
 * and for `aria-live` on transaction status. Doing both naively announces seven
 * times per transaction, roughly fifteen times across the activity -- unusable
 * with a screen reader. So the animated indicator is `aria-hidden`, the steps
 * are exposed as a plain ordered list, and exactly one announcement is made,
 * for the terminal state.
 */
export function TransactionPipeline({
  status,
  blockId,
  failureCount,
}: {
  status: TransactionStatus | null;
  blockId?: string | undefined;
  failureCount?: number | undefined;
}): ReactNode {
  const t = useTranslator();
  // Unique per instance: several transaction panels can be on screen at once,
  // and a repeated id makes every aria-labelledby point at the first one.
  const headingId = useId();
  const isRejected = status === TransactionStatus.REJECTED;
  const currentIndex = status === null ? -1 : stepIndex(status);

  const announcement =
    status === TransactionStatus.COMMITTED
      ? t("pipeline.announceCommitted", { blockId: blockId ?? "" })
      : isRejected
        ? t("pipeline.announceRejected", { count: failureCount ?? 0 })
        : "";

  return (
    <section className="pipeline" aria-labelledby={headingId}>
      <h3 id={headingId}>{t("pipeline.heading")}</h3>

      <ol className="pipeline__steps">
        {PIPELINE_STEPS.map((step, index) => {
          const isDone = currentIndex >= index && !isRejected;
          const isCurrent = currentIndex === index && !isRejected;
          const state = isCurrent ? "current" : isDone ? "done" : "pending";
          return (
            <li key={step} className={`pipeline__step pipeline__step--${state}`}>
              <span className="pipeline__marker" aria-hidden="true">
                {isDone ? "✓" : index + 1}
              </span>
              <span className="pipeline__label">{t(`pipeline.${step}`)}</span>
              {isCurrent ? (
                <span className="visually-hidden">{t("validation.statusPassed")}</span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {isRejected ? (
        <p className="pipeline__rejected">
          <span aria-hidden="true">✕ </span>
          {t("pipeline.REJECTED")}
        </p>
      ) : null}

      {/* One announcement, on the terminal state only. */}
      <p aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
    </section>
  );
}
