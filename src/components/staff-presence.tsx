import { useMemo, useState, type ReactNode } from "react";
import { useTranslator } from "../app/providers/locale-provider";
import { useScenario } from "../app/providers/scenario-provider";
import { useSimulation } from "../app/providers/simulation-provider";
import { useOptionalConfiguration } from "../app/providers/configuration-provider";
import type { ScenarioStaffProfile } from "../domain/types/scenario";
import type { ScenarioStageId } from "../domain/types/enums";

export type StaffPortraitSize = "compact" | "standard" | "briefing";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(-2)
    .map((part) => part.slice(0, 1).toLocaleUpperCase())
    .join("");
}

export function StaffPortrait({
  profile,
  size = "standard",
  informative = false,
}: {
  profile: ScenarioStaffProfile;
  size?: StaffPortraitSize;
  informative?: boolean;
}): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const asset = scenario.portraitAssets.find(
    (candidate) => candidate.assetId === profile.portraitAssetId,
  );
  const name = t(profile.displayNameKey);

  const failed = asset !== undefined && failedPath === asset.filePath;

  const dimensions =
    size === "briefing"
      ? { width: 128, height: 160 }
      : size === "compact"
        ? { width: 48, height: 60 }
        : { width: 80, height: 100 };

  if (asset === undefined || failed) {
    return (
      <span
        className={`staff-portrait staff-portrait--${size} staff-portrait--fallback`}
        aria-hidden={!informative}
        aria-label={informative ? t(profile.portraitAltKey) : undefined}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <img
      className={`staff-portrait staff-portrait--${size}`}
      src={`./${asset.filePath}`}
      width={dimensions.width}
      height={dimensions.height}
      alt={informative ? t(profile.portraitAltKey) : ""}
      loading={size === "briefing" ? "eager" : "lazy"}
      decoding="async"
      onError={() => {
        if (import.meta.env.DEV) {
          console.warn(`[staff] Could not load portrait "${asset.filePath}"`);
        }
        setFailedPath(asset.filePath);
      }}
    />
  );
}

export function StaffIdentityCard({
  staffProfileId,
  size = "standard",
  labelKey = "staff.currentRole",
  showResponsibility = true,
  className = "",
}: {
  staffProfileId: string;
  size?: StaffPortraitSize;
  labelKey?: string;
  showResponsibility?: boolean;
  className?: string;
}): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const profile = scenario.staffProfiles.find(
    (candidate) => candidate.staffProfileId === staffProfileId,
  );
  const organization = useMemo(
    () =>
      profile === undefined
        ? undefined
        : scenario.organizations.find(
            (candidate) =>
              candidate.organizationId === profile.organizationId,
          ),
    [profile, scenario.organizations],
  );
  const location = useMemo(
    () =>
      profile?.locationId === undefined
        ? undefined
        : scenario.locations.find(
            (candidate) => candidate.locationId === profile.locationId,
          ),
    [profile, scenario.locations],
  );

  if (profile === undefined || profile.visibility !== "LEARNER_VISIBLE") {
    return null;
  }

  return (
    <section
      className={`staff-identity staff-identity--${size} ${className}`.trim()}
      aria-label={t(labelKey)}
      data-staff-profile-id={profile.staffProfileId}
    >
      <StaffPortrait profile={profile} size={size} />
      <div className="staff-identity__body">
        <p className="eyebrow staff-identity__label">{t(labelKey)}</p>
        <h3 className="staff-identity__name">{t(profile.displayNameKey)}</h3>
        <p className="staff-identity__role">{t(profile.roleTitleKey)}</p>
        {organization !== undefined ? (
          <p className="staff-identity__organization">
            {t(organization.displayNameKey)}
          </p>
        ) : null}
        {location !== undefined ? (
          <p className="staff-identity__location">
            {t(location.displayNameKey)}
          </p>
        ) : null}
        {showResponsibility &&
        profile.professionalResponsibilityKey !== undefined ? (
          <p className="staff-identity__responsibility">
            {t(profile.professionalResponsibilityKey)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function ActiveRolePresence({
  stageId,
}: {
  stageId: ScenarioStageId;
}): ReactNode {
  const { stage, scenario } = useScenario();
  const { activeTrustedContext } = useSimulation();
  const configuration = useOptionalConfiguration()?.configuration;
  const definition = stage(stageId);
  if (definition === undefined) return null;

  const eligible = new Set(definition.staffProfileIds ?? []);
  const profile = scenario.staffProfiles.find(
    (candidate) =>
      eligible.has(candidate.staffProfileId) &&
      candidate.actorId === activeTrustedContext.actorId,
  );
  if (profile === undefined) return null;

  return (
    <StaffIdentityCard
      staffProfileId={profile.staffProfileId}
      size="briefing"
      showResponsibility={configuration?.mode === "guided"}
    />
  );
}

export function EvidenceAuthorIdentity({
  evidenceId,
}: {
  evidenceId: string;
}): ReactNode {
  const { scenario } = useScenario();
  const attribution = scenario.evidenceStaffAttributions.find(
    (candidate) => candidate.evidenceId === evidenceId,
  );
  if (attribution === undefined) return null;

  return (
    <StaffIdentityCard
      staffProfileId={attribution.staffProfileId}
      size="compact"
      labelKey={`staff.evidenceRelationship.${attribution.relationship}`}
      showResponsibility={false}
      className="staff-identity--evidence"
    />
  );
}

export function RoleHandoffPanel({
  fromActorId,
  toActorId,
  explanatoryTextKey,
}: {
  fromActorId: string;
  toActorId: string;
  explanatoryTextKey?: string;
}): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const mode = useOptionalConfiguration()?.configuration.mode;
  const fromProfile = scenario.staffProfiles.find(
    (candidate) => candidate.actorId === fromActorId,
  );
  const toProfile = scenario.staffProfiles.find(
    (candidate) => candidate.actorId === toActorId,
  );
  if (fromProfile === undefined || toProfile === undefined) return null;

  return (
    <section className="role-handoff card card--reference">
      <div className="role-handoff__heading">
        <p className="eyebrow">{t("staff.handoff")}</p>
        {mode === "guided" && explanatoryTextKey !== undefined ? (
          <p>{t(explanatoryTextKey)}</p>
        ) : null}
      </div>
      <div className="role-handoff__people">
        <StaffIdentityCard
          staffProfileId={fromProfile.staffProfileId}
          size="compact"
          labelKey="staff.handoffFrom"
          showResponsibility={false}
        />
        <span className="role-handoff__arrow" aria-hidden="true">
          ↓
        </span>
        <StaffIdentityCard
          staffProfileId={toProfile.staffProfileId}
          size="compact"
          labelKey="staff.handoffTo"
          showResponsibility={false}
        />
      </div>
    </section>
  );
}
