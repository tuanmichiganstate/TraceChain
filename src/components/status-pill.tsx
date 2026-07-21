import type { ReactNode } from "react";

export type StatusTone = "pass" | "warn" | "fail" | "neutral";

/**
 * Status is never carried by colour alone (specification section 26). Each tone
 * pairs a distinct glyph with a text label, so the meaning survives greyscale,
 * colour blindness, and a screen reader.
 */
const GLYPH: Readonly<Record<StatusTone, string>> = {
  pass: "✓",
  warn: "⚠",
  fail: "✕",
  neutral: "•",
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
