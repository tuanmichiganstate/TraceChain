import {
  LECTURER_PRESETS,
  type LecturerPresetId,
} from "./presets";
import type {
  ActivityType,
  DeliveryPurpose,
  FeedbackTiming,
  HintAvailability,
  OutcomeStrategy,
  SupportProfile,
} from "./types";

export interface ScormPackagePresetPreview {
  readonly presetId: LecturerPresetId;
  readonly activityType: ActivityType;
  readonly supportProfile: SupportProfile;
  readonly deliveryPurpose: DeliveryPurpose;
  readonly outcomeStrategy: OutcomeStrategy;
  readonly feedbackTiming: FeedbackTiming;
  readonly hintAvailability: HintAvailability;
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string | null;
  readonly scenarioVersion: string | null;
  readonly variantBankId: string | null;
  readonly variantBankVersion: string | null;
  readonly scoringBlueprintId: string;
  readonly scoringBlueprintVersion: string;
  readonly maximumScore: number;
  readonly passScore: number;
  readonly official: boolean;
  readonly locale: string;
}

export const SCORM_PACKAGE_PRESET_PREVIEWS:
  readonly ScormPackagePresetPreview[] = Object.entries(
    LECTURER_PRESETS,
  ).map(([presetId, configuration]) => ({
    presetId: presetId as LecturerPresetId,
    activityType: configuration.activityType,
    supportProfile: configuration.supportProfile,
    deliveryPurpose: configuration.deliveryPurpose,
    outcomeStrategy: configuration.outcomeStrategy,
    feedbackTiming: configuration.feedback.timing,
    hintAvailability: configuration.hints.availability,
    packId: configuration.content.packId,
    packVersion: configuration.content.packVersion,
    scenarioId: configuration.content.scenarioId ?? null,
    scenarioVersion: configuration.content.scenarioVersion ?? null,
    variantBankId: configuration.content.variantBankId ?? null,
    variantBankVersion:
      configuration.content.variantBankVersion ?? null,
    scoringBlueprintId: configuration.scoring.scoringBlueprintId,
    scoringBlueprintVersion:
      configuration.scoring.scoringBlueprintVersion,
    maximumScore: configuration.scoring.maximumScore,
    passScore: configuration.scoring.passScore,
    official: configuration.scoring.official,
    locale: configuration.locale,
  }));

export function scormPackagePresetPreview(
  presetId: LecturerPresetId,
): ScormPackagePresetPreview {
  const preview = SCORM_PACKAGE_PRESET_PREVIEWS.find(
    (candidate) => candidate.presetId === presetId,
  );
  if (preview === undefined) {
    throw new Error(`Unknown SCORM package preset ${presetId}.`);
  }
  return preview;
}

export function resolveScormPackagePreset(options: {
  readonly activityType: ActivityType;
  readonly supportProfile: SupportProfile;
  readonly deliveryPurpose: DeliveryPurpose;
  readonly outcomeStrategy: OutcomeStrategy;
}): ScormPackagePresetPreview | null {
  return (
    SCORM_PACKAGE_PRESET_PREVIEWS.find(
      (candidate) =>
        candidate.activityType === options.activityType &&
        candidate.supportProfile === options.supportProfile &&
        candidate.deliveryPurpose === options.deliveryPurpose &&
        candidate.outcomeStrategy === options.outcomeStrategy,
    ) ?? null
  );
}
