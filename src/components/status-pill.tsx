import type { ReactNode } from "react";

/**
 * `pass`, `warn`, `fail` and `neutral` are *verdicts* -- they answer "was this
 * right". `affected` and `unaffected` are a *classification* -- they answer
 * "did the contamination reach this lot", which is a fact about the goods and
 * not a judgement of the learner.
 *
 * Keeping them apart matters. Stage 9 first used `fail` for an affected lot, so
 * a learner who correctly identified contaminated stock was handed a rejection
 * cross for getting it right. Whether the answer was right is the accuracy
 * summary's job, and it is stated separately.
 */
export type StatusTone =
  | "pass"
  | "warn"
  | "fail"
  | "neutral"
  | "affected"
  | "unaffected";

/**
 * Status is never carried by colour alone (specification section 26). Each tone
 * pairs a distinct glyph with a text label, so the meaning survives greyscale,
 * colour blindness, and a screen reader. The classification pair differs by
 * fill as well as by colour, so it also survives being read in one hue.
 */
const GLYPH: Readonly<Record<StatusTone, string>> = {
  pass: "✓",
  warn: "⚠",
  fail: "✕",
  neutral: "•",
  affected: "●",
  unaffected: "○",
};

export function StatusPill({
  tone,
  children,
}: {
  tone: StatusTone;
  children: ReactNode;
}): ReactNode {
  return (
    <span className={`status status--${tone}`}>
      <span aria-hidden="true">{GLYPH[tone]}</span>
      <span>{children}</span>
    </span>
  );
}
