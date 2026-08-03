import { describe, expect, it } from "vitest";
import packJson from "../../../scenario-packs/standard-coffee-stage3/simuledger.pack.json";
import en from "../../locales/en.json";
import vi from "../../locales/vi.json";
import { validateScenarioPack } from "../scenario-packs/validation";
import { staffProfileProjection } from "./staff-profile-projection";

function validatedPack() {
  const result = validateScenarioPack(structuredClone(packJson), {
    localizationCatalogs: { en, vi },
  });
  if (!result.isValid) {
    throw new Error(JSON.stringify(result.issues, null, 2));
  }
  return result.pack;
}

describe("historical hosted staff projection", () => {
  it("resolves role identity and immutable media from the selected pack version", () => {
    const pack = validatedPack();
    const scenario = pack.scenarios[0]!;

    const profile = staffProfileProjection(
      pack,
      scenario,
      "CERTIFICATION_OFFICER",
    );

    expect(profile).toMatchObject({
      staffProfileId: "STAFF_CERTIFICATION_OFFICER",
      portraitPath: "./media/staff/certification-officer.webp",
      fictional: true,
      displayName: {
        localizationKey: "staff.certificationOfficer.name",
        valuesByLocale: {
          en: "Trần Minh Anh",
          vi: "Trần Minh Anh",
        },
      },
    });
  });

  it("does not invent a person for an unprofiled role", () => {
    const pack = validatedPack();

    expect(
      staffProfileProjection(
        pack,
        pack.scenarios[0]!,
        "DISTRIBUTION_MANAGER",
      ),
    ).toBeUndefined();
  });
});
