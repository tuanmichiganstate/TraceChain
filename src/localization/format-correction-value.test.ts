import { describe, expect, it } from "vitest";
import { formatCorrectionValueLabel } from "./format-correction-value";
import { createTranslator } from "./i18n";
import { formatCorrectionValue, type CorrectionValue } from "../domain/types/correction";
import { QuantityUnit } from "../domain/types/enums";

/**
 * The canonical form and the learner-facing form are deliberately different.
 * Stage 5 shows a corrected quantity next to the manifest panel and the asset
 * card, so all three have to spell the unit the same way -- while the value the
 * ledger holds, hashes and serializes stays exactly as it was.
 */
const vi = createTranslator("vi");
const en = createTranslator("en");

const kilograms = (amount: number): Extract<CorrectionValue, { kind: "QUANTITY" }> => ({
  kind: "QUANTITY",
  amount,
  unit: QuantityUnit.KG,
});

describe("learner-facing correction values", () => {
  it("writes a quantity with the translated unit label", () => {
    expect(formatCorrectionValueLabel(kilograms(1000), vi)).toBe("1000 kg");
    expect(formatCorrectionValueLabel(kilograms(100), vi)).toBe("100 kg");
    expect(formatCorrectionValueLabel(kilograms(105), vi)).toBe("105 kg");
  });

  it("renders every value in a correction chain the same way", () => {
    // The 1000 -> 100 -> 105 chain the lineage panel draws.
    expect([1000, 100, 105].map((amount) => formatCorrectionValueLabel(kilograms(amount), vi))).toEqual([
      "1000 kg",
      "100 kg",
      "105 kg",
    ]);
  });

  it("uses each language's own word for a unit that is a word, not a symbol", () => {
    const packages: CorrectionValue = { kind: "QUANTITY", amount: 820, unit: QuantityUnit.UNIT };
    expect(formatCorrectionValueLabel(packages, vi)).toBe("820 gói");
    expect(formatCorrectionValueLabel(packages, en)).toBe("820 packages");
    // Kilograms happen to be spelled the same in both, which is the point of
    // going through the catalogue rather than assuming an SI abbreviation.
    expect(formatCorrectionValueLabel(kilograms(100), en)).toBe("100 kg");
  });

  it("groups no digits, so it matches the panels either side of it", () => {
    // The asset card groups with toLocaleString, but nothing it shows reaches
    // 1000. The manifest does, and it is written plainly there too.
    expect(formatCorrectionValueLabel(kilograms(1000), vi)).not.toContain(".");
    expect(formatCorrectionValueLabel(kilograms(1000), vi)).not.toContain(",");
  });

  it("passes text and dates through unchanged", () => {
    const text: CorrectionValue = { kind: "TEXT", value: "Arabica Lâm Đồng" };
    const date: CorrectionValue = { kind: "DATE", value: "2026-06-17" };
    expect(formatCorrectionValueLabel(text, vi)).toBe("Arabica Lâm Đồng");
    expect(formatCorrectionValueLabel(date, vi)).toBe("2026-06-17");
  });

  it("leaves the canonical form alone", () => {
    // What the ledger holds is unchanged: presentation is a separate function,
    // so nothing here can reach a payload, a hash or suspend data.
    const value = kilograms(1000);
    expect(formatCorrectionValue(value)).toBe("1000 KG");
    expect(value).toEqual({ kind: "QUANTITY", amount: 1000, unit: QuantityUnit.KG });
    expect(value.unit).toBe(QuantityUnit.KG);
    expect(JSON.stringify(value)).toBe('{"kind":"QUANTITY","amount":1000,"unit":"KG"}');
  });
});
