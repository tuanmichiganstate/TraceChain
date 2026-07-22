import { useId, type ReactNode } from "react";
import type { ValidationResult } from "../domain/types/models";
import { useTranslator } from "../app/providers/locale-provider";
import { StatusPill, type StatusTone } from "./status-pill";

const TONE_BY_STATUS: Readonly<Record<string, StatusTone>> = {
  PASSED: "pass",
  WARNING: "warn",
  FAILED: "fail",
  NOT_APPLICABLE: "neutral",
};

const LABEL_KEY_BY_STATUS: Readonly<Record<string, string>> = {
  PASSED: "validation.statusPassed",
  WARNING: "validation.statusWarning",
  FAILED: "validation.statusFailed",
  NOT_APPLICABLE: "validation.statusWarning",
};

/**
 * Every rule outcome, with the business reason for each failure.
 *
 * Specification section 18.4 forbids showing a bare "Invalid transaction": a
 * learner who cannot tell *which* rule they broke, or why it exists, learns
 * nothing from the rejection.
 */
export function ValidationResults({
  results,
  isValid,
}: {
  results: readonly ValidationResult[];
  isValid: boolean;
}): ReactNode {
  const t = useTranslator();
  // A stage can show three transaction panels at once, so a fixed id would be
  // issued three times and every aria-labelledby would resolve to whichever
  // heading came first -- silently mislabelling two of the three regions.
  const headingId = useId();
  if (results.length === 0) return null;

  // Failures first: they are what the learner must act on.
  const ordered = [...results].sort((left, right) => {
    const weight = (status: string): number =>
      status === "FAILED" ? 0 : status === "WARNING" ? 1 : 2;
    return weight(left.status) - weight(right.status);
  });

  return (
    <section className="validation" aria-labelledby={headingId}>
      <h3 id={headingId}>{t("validation.heading")}</h3>

      <p className={isValid ? "validation__summary" : "validation__summary validation__summary--failed"}>
        {t(isValid ? "validation.allPassed" : "validation.someFailed")}
      </p>

      <ul className="validation__list">
        {ordered.map((result) => (
          <li key={result.ruleId} className="validation__item">
            <span className="validation__message">{t(result.messageKey)}</span>
            <code className="validation__rule-id">{result.ruleId}</code>
            <StatusPill tone={TONE_BY_STATUS[result.status] ?? "neutral"}>
              {t(LABEL_KEY_BY_STATUS[result.status] ?? "validation.statusWarning")}
            </StatusPill>
          </li>
        ))}
      </ul>
    </section>
  );
}
