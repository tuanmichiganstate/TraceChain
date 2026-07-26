import en from "../../locales/en.json";
import vi from "../../locales/vi.json";
import type {
  LearnerRunLocalizedTextV1,
  LearnerRunStaffProfileV1,
} from "../contracts/run-events";
import type {
  ScenarioDefinitionV1,
  ScenarioPackV1,
} from "../contracts/scenario-pack";

function localizedText(
  pack: ScenarioPackV1,
  localizationKey: string,
): LearnerRunLocalizedTextV1 {
  const fallbackCatalogs: Readonly<
    Record<string, Readonly<Record<string, string>>>
  > = { en, vi };
  return {
    localizationKey,
    valuesByLocale: Object.fromEntries(
      pack.supportedLocales.flatMap((locale) => {
        const value =
          pack.localizationCatalogs?.[locale]?.[localizationKey] ??
          fallbackCatalogs[locale]?.[localizationKey];
        return value === undefined ? [] : [[locale, value]];
      }),
    ),
  };
}

export function staffProfileProjection(
  pack: ScenarioPackV1,
  scenario: ScenarioDefinitionV1,
  roleId: string,
): LearnerRunStaffProfileV1 | undefined {
  const profile = scenario.staffProfiles.find(
    (candidate) =>
      candidate.roleId === roleId &&
      candidate.visibility === "LEARNER_VISIBLE",
  );
  if (profile === undefined) return undefined;
  const organization = scenario.organizations.find(
    (candidate) =>
      candidate.organizationId === profile.organizationId,
  );
  const portrait = pack.portraitAssets.find(
    (candidate) => candidate.assetId === profile.portraitAssetId,
  );
  if (organization === undefined || portrait === undefined) return undefined;

  return {
    staffProfileId: profile.staffProfileId,
    displayName: localizedText(pack, profile.displayName.localizationKey),
    roleTitle: localizedText(pack, profile.roleTitle.localizationKey),
    organizationName: localizedText(
      pack,
      organization.displayName.localizationKey,
    ),
    portraitPath: `./${portrait.filePath}`,
    portraitAlt: localizedText(pack, profile.portraitAlt.localizationKey),
    ...(profile.shortProfile === undefined
      ? {}
      : {
          shortProfile: localizedText(
            pack,
            profile.shortProfile.localizationKey,
          ),
        }),
    ...(profile.professionalResponsibility === undefined
      ? {}
      : {
          professionalResponsibility: localizedText(
            pack,
            profile.professionalResponsibility.localizationKey,
          ),
        }),
    fictional: true,
  };
}
