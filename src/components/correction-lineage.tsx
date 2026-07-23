import type { ReactNode } from "react";
import type { DomainState } from "../domain/ledger/domain-state";
import type { CorrectionTarget } from "../domain/types/correction";
import { formatCorrectionValueLabel } from "../localization/format-correction-value";
import { buildEffectiveValueView } from "../domain/scenario/effective-value-view";
import { useTranslator } from "../app/providers/locale-provider";

/**
 * What the ledger still says, and what the application now uses.
 *
 * The activity's third stated objective is "distinguish current state from
 * transaction history", and stage 5 is the one place the two genuinely disagree:
 * the manifest says 1000 kg forever, and the effective quantity is 100 kg. Until
 * this panel existed the learner could only infer that by opening the reference
 * workspace, switching tabs, and comparing an asset card against a transaction
 * table -- which is asking them to reconstruct the lesson rather than see it.
 *
 * Rendered as an ordered list, so the append order is conveyed structurally
 * rather than by the arrows, which are decorative and hidden from assistive
 * technology.
 *
 * No `StatusPill` here, deliberately. Its tones mean validation outcomes, and
 * the superseded manifest figure is not a failed rule -- it is a committed
 * historical fact that the ledger still holds. Marking it with the rejection
 * glyph said the opposite of the lesson. The step labels carry the meaning
 * instead, and no value is struck through: the original was not erased, and
 * showing it as though it had been would undo the entire point of the stage.
 */
export function CorrectionLineage({
  state,
  target,
}: {
  state: DomainState;
  target: CorrectionTarget;
}): ReactNode {
  const t = useTranslator();
  const view = buildEffectiveValueView(state, target);
  if (view === null) return null;

  const hasCorrection = view.correctionTransactionIds.length > 0;

  return (
    <section className="card card--reference lineage" aria-labelledby="lineage-heading">
      <h3 id="lineage-heading">{t("lineage.heading")}</h3>

      <ol className="lineage__chain">
        <li className="lineage__step lineage__step--original">
          <p className="lineage__label">{t("lineage.originalLabel")}</p>
          <p className="lineage__value">{formatCorrectionValueLabel(view.originalValue, t)}</p>
          <p className="muted">{t("lineage.originalNote")}</p>
          <p className="lineage__source">
            {t("lineage.recordedIn")} <code>{view.originalTransactionId}</code>
          </p>
        </li>

        {/* Each correction carries the value *it* established. Rendering the
            final effective value against every step is correct by accident for
            a single correction and wrong the moment there are two: a
            1000 -> 100 -> 105 chain would show 105 against the step that
            actually established 100. */}
        {view.corrections.map((correction) => (
          <li className="lineage__step lineage__step--correction" key={correction.transactionId}>
            <span className="lineage__arrow" aria-hidden="true">
              ↓
            </span>
            <p className="lineage__label">{t("lineage.correctionLabel")}</p>
            <p className="lineage__value">{formatCorrectionValueLabel(correction.value, t)}</p>
            <p className="muted">{t("lineage.correctionNote")}</p>
            <p className="lineage__source">
              {t("lineage.recordedIn")} <code>{correction.transactionId}</code>
            </p>
          </li>
        ))}

        <li className="lineage__step lineage__step--effective">
          <span className="lineage__arrow" aria-hidden="true">
            ↓
          </span>
          <p className="lineage__label">{t("lineage.effectiveLabel")}</p>
          <p className="lineage__value lineage__value--effective">
            <strong>{formatCorrectionValueLabel(view.effectiveValue, t)}</strong>
          </p>
          <p className="muted">
            {t(hasCorrection ? "lineage.effectiveNote" : "lineage.uncorrectedNote")}
          </p>
        </li>
      </ol>

      {hasCorrection ? <p className="lineage__conclusion">{t("lineage.conclusion")}</p> : null}
    </section>
  );
}
