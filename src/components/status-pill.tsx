import type { ReactNode } from "react";

/**
 * A verdict: was this right, did this pass, did this fail.
 *
 * Kept to exactly these four. `validation-results.tsx` and
 * `transaction-history.tsx` both map a status enum onto this type, and those
 * maps are only meaningful while every member is a judgement -- widening it to
 * carry classifications too made `{ FAILED: "affected" }` type-check.
 */
export type StatusTone = "pass" | "warn" | "fail" | "neutral";

/**
 * A fact about the goods, which is not the same kind of thing as a verdict.
 *
 * Stage 9 needs to say whether contamination reached a lot. That question has
 * nothing to do with whether the learner answered correctly, and reusing the
 * verdict tones for it handed a learner who correctly identified contaminated
 * stock a rejection cross for getting it right.
 */
export type ClassificationTone = "affected" | "unaffected";

/**
 * Status is never carried by colour alone (specification section 26). Each tone
 * pairs a distinct glyph with a text label, so the meaning survives greyscale,
 * colour blindness, and a screen reader -- which reads the label only, because
 * the glyph is decorative and hidden from it.
 */
const VERDICT_GLYPH: Readonly<Record<StatusTone, string>> = {
  pass: "✓",
  warn: "⚠",
  fail: "✕",
  neutral: "•",
};

/** Filled versus hollow, so the pair also survives being read in one hue. */
const CLASSIFICATION_GLYPH: Readonly<Record<ClassificationTone, string>> = {
  affected: "●",
  unaffected: "○",
};

function Pill({
  tone,
  glyph,
  children,
}: {
  tone: string;
  glyph: string;
  children: ReactNode;
}): ReactNode {
  return (
    <span className={`status status--${tone}`}>
      <span aria-hidden="true">{glyph}</span>
      <span>{children}</span>
    </span>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: StatusTone;
  children: ReactNode;
}): ReactNode {
  return (
    <Pill tone={tone} glyph={VERDICT_GLYPH[tone]}>
      {children}
    </Pill>
  );
}

/**
 * Deliberately a separate component rather than two more tones on `StatusPill`.
 * The distinction it exists to protect is one a type can enforce and a comment
 * cannot: nothing can now pass "affected" where a verdict belongs, or a verdict
 * where a classification belongs.
 */
export function ClassificationPill({
  tone,
  children,
}: {
  tone: ClassificationTone;
  children: ReactNode;
}): ReactNode {
  return (
    <Pill tone={tone} glyph={CLASSIFICATION_GLYPH[tone]}>
      {children}
    </Pill>
  );
}
