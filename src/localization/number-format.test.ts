import { describe, expect, it } from "vitest";
import { createTranslator } from "./i18n";

/**
 * A fractional figure has to be written the way its language writes one.
 *
 * The hint disclosure is the only place a learner meets a decimal -- "up to 1.2
 * points" -- and Vietnamese writes that 1,2. It went through `String(value)`,
 * so every locale got the English separator.
 *
 * Grouping stays off on purpose. Vietnamese groups thousands with a full stop,
 * so switching it on would print "1.000 kg" beside the manifest panel's "1000
 * kg" -- the same trade already refused in format-correction-value.ts.
 */
const vi = createTranslator("vi");
const en = createTranslator("en");

describe("numbers inside translated sentences", () => {
  it("writes a decimal with each language's own separator", () => {
    expect(vi("hint.penaltyNotice", { activities: "X", percent: 70, points: 1.2 })).toContain(
      "1,2",
    );
    expect(en("hint.penaltyNotice", { activities: "X", percent: 70, points: 1.2 })).toContain(
      "1.2",
    );
  });

  it("leaves whole numbers exactly as they were", () => {
    // Every other numeric placeholder in the catalogues is an integer, so this
    // is the assertion that the change is confined to decimals.
    for (const t of [vi, en]) {
      expect(t("workspace.progressValue", { current: 2, total: 9 })).toContain("2");
      expect(t("workspace.progressValue", { current: 2, total: 9 })).toContain("9");
      expect(t("start.scoringPass", { points: 70 })).toContain("70");
      expect(t("start.estimatedTime", { minutes: 40 })).toContain("40");
    }
  });

  it("does not group thousands in any locale", () => {
    // 1000 must stay 1000, not "1.000" (vi) or "1,000" (en): the correction
    // lineage and the manifest panel both write it plainly.
    for (const t of [vi, en]) {
      expect(t("start.scoringPass", { points: 1000 })).toContain("1000");
    }
  });

  it("still leaves a string parameter untouched", () => {
    expect(vi("hint.penaltyNoticeNone", { activities: "“Tạo lô”" })).toContain(
      "“Tạo lô”",
    );
  });
});
