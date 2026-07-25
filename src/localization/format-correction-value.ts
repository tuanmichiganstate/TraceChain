/**
 * Learner-facing rendering of a corrected value.
 *
 * `formatCorrectionValue` in the domain writes the canonical form -- the enum
 * member exactly as the ledger holds it, `1000 KG` -- which is right for a
 * diagnostic and wrong on screen. Stage 5 put it next to the manifest panel's
 * `1000 kg` and the asset card's `100 kg`, so one screen carried two spellings
 * of the same unit.
 *
 * The mapping lives here rather than in the domain because it is presentation:
 * `QuantityUnit.KG` stays `KG` in commands, payloads, hashes, suspend data and
 * the scenario contracts, and only the label a learner reads is translated.
 * `unit.UNIT` is not even a symbol -- it is an ordinary noun, and a different
 * one in each language -- which is precisely why this cannot be a lookup table
 * of SI abbreviations.
 *
 * Numbers are written plainly, without digit grouping. The asset card and
 * provenance viewer now use the translator's matching no-grouping formatter;
 * grouping here would still print `1.000 kg` in Vietnamese beside the manifest
 * panel's `1000 kg` -- trading one inconsistency for a worse one.
 */

import type { CorrectionValue } from "../domain/types/correction";
import { formatCorrectionValue } from "../domain/types/correction";
import type { Translator } from "./i18n";

export function formatCorrectionValueLabel(
  value: CorrectionValue,
  t: Translator,
): string {
  // Text and dates carry no unit, so the canonical form is already the readable
  // one. Delegating keeps a new CorrectionValue kind from silently rendering as
  // "[object Object]" here if it is added to the domain and missed here.
  return value.kind === "QUANTITY"
    ? `${value.amount} ${t(`unit.${value.unit}`)}`
    : formatCorrectionValue(value);
}
