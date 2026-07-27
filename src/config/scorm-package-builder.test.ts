import { describe, expect, it } from "vitest";
import {
  SCORM_PACKAGE_PRESET_PREVIEWS,
  resolveScormPackagePreset,
  scormPackagePresetPreview,
} from "./scorm-package-builder";

describe("SCORM package builder preset catalogue", () => {
  it("derives all nine accepted package previews from resolved presets", () => {
    expect(
      SCORM_PACKAGE_PRESET_PREVIEWS.map(
        (preview) => preview.presetId,
      ),
    ).toEqual([
      "guided",
      "practice",
      "challenge",
      "assessment",
      "audit-guided",
      "audit-practice",
      "audit-challenge",
      "audit-assessment",
      "technical-lab",
    ]);
    expect(scormPackagePresetPreview("audit-assessment")).toMatchObject({
      activityType: "AUDIT",
      supportProfile: "CHALLENGE",
      deliveryPurpose: "ASSESSMENT",
      outcomeStrategy: "CURATED_VARIANT",
      feedbackTiming: "FINAL",
      hintAvailability: "DISABLED",
      official: true,
      variantBankId: "BANK_COFFEE_AUDIT_CHALLENGE_V1",
    });
    expect(scormPackagePresetPreview("technical-lab")).toMatchObject({
      activityType: "TECHNICAL_LAB",
      supportProfile: "PRACTICE",
      deliveryPurpose: "FORMATIVE",
      outcomeStrategy: "FIXED",
      feedbackTiming: "IMMEDIATE",
      hintAvailability: "ENABLED",
      official: false,
      scenarioId: null,
    });
  });

  it("resolves only complete accepted dimension combinations", () => {
    expect(
      resolveScormPackagePreset({
        activityType: "AUDIT",
        supportProfile: "PRACTICE",
        deliveryPurpose: "FORMATIVE",
        outcomeStrategy: "CURATED_VARIANT",
      })?.presetId,
    ).toBe("audit-practice");
    expect(
      resolveScormPackagePreset({
        activityType: "AUDIT",
        supportProfile: "GUIDED",
        deliveryPurpose: "ASSESSMENT",
        outcomeStrategy: "FIXED",
      }),
    ).toBeNull();
  });
});
