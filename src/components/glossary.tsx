import type { ReactNode } from "react";
import { useTranslator } from "../app/providers/locale-provider";

/**
 * The glossary (specification section 6.2).
 *
 * Every entry shows the Vietnamese term with the English in parentheses. That
 * pairing belongs here, in tooltips, and at first use in an explanation --
 * section 6.2 is explicit that it should *not* be repeated in every button and
 * table cell, where it would be noise.
 */
const TERM_KEYS: readonly string[] = [
  "terms.transaction",
  "terms.block",
  "terms.hash",
  "terms.ledger",
  "terms.worldState",
  "terms.smartContract",
  "terms.ownership",
  "terms.custody",
  "terms.provenance",
  "terms.endorsement",
  "terms.orderingService",
  "terms.oracle",
  "terms.permissionedBlockchain",
];

const DEFINITION_KEYS: Readonly<Record<string, string>> = Object.fromEntries(
  TERM_KEYS.map((key) => [key, `${key}Definition`]),
);

export function Glossary(): ReactNode {
  const t = useTranslator();

  return (
    <section className="glossary" aria-labelledby="glossary-heading">
      <h2 id="glossary-heading">{t("workspace.tabs.glossary")}</h2>
      <dl className="glossary__list">
        {TERM_KEYS.map((termKey) => (
          <div key={termKey} className="glossary__entry">
            <dt>{t(termKey)}</dt>
            <dd>{t(DEFINITION_KEYS[termKey] as string)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
