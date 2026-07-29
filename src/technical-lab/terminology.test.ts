import { describe, expect, it } from "vitest";
import { getCatalogue } from "../localization/i18n";
import { FIRST_TECHNICAL_LAB_MODULE_IDS } from "./contracts";

const INITIAL_ENGLISH_TERMS: Readonly<
  Record<(typeof FIRST_TECHNICAL_LAB_MODULE_IDS)[number], readonly string[]>
> = {
  TL1: ["avalanche effect", "SHA-256 digest"],
  TL2: ["canonical serialization"],
  TL3: ["digital signature", "public key"],
  TL4: ["identity recognition", "authorization"],
  TL5: ["endorsement policy"],
  TL6: [
    "proposal-content mismatch",
    "canonical proposal digest",
  ],
  TL7: ["state-version conflict", "optimistic concurrency"],
};

describe("Technical Laboratory Vietnamese terminology", () => {
  it("introduces each module's English terms once in its opening summary", () => {
    const catalogue = getCatalogue("vi");

    for (const moduleId of FIRST_TECHNICAL_LAB_MODULE_IDS) {
      const prefix = `technicalLab.${moduleId}.`;
      const moduleContent = Object.entries(catalogue)
        .filter(([key]) => key.startsWith(prefix))
        .map(([, value]) => value)
        .join("\n");
      const summary = catalogue[`${prefix}summary`];

      expect(summary).toBeDefined();
      for (const term of INITIAL_ENGLISH_TERMS[moduleId]) {
        const parenthetical = `(${term})`;
        expect(summary).toContain(parenthetical);
        expect(moduleContent.split(parenthetical)).toHaveLength(2);
      }
    }
  });
});
