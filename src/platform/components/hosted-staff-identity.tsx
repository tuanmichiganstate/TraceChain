import { useState, type ReactNode } from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import type {
  LearnerRunLocalizedTextV1,
  LearnerRunStaffProfileV1,
} from "../contracts/run-events";

function text(
  value: LearnerRunLocalizedTextV1,
  locale: "en" | "vi",
): string {
  return (
    value.valuesByLocale[locale] ??
    value.valuesByLocale.en ??
    Object.values(value.valuesByLocale)[0] ??
    value.localizationKey
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(-2)
    .map((part) => part.slice(0, 1).toLocaleUpperCase())
    .join("");
}

export function HostedStaffIdentity({
  profile,
  labelKey = "staff.currentRole",
  compact = false,
}: {
  profile: LearnerRunStaffProfileV1;
  labelKey?: string;
  compact?: boolean;
}): ReactNode {
  const t = useTranslator();
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const name = text(profile.displayName, t.locale);
  const failed = failedPath === profile.portraitPath;

  return (
    <section
      className={`staff-identity staff-identity--${compact ? "compact" : "briefing"} hosted-staff-identity`}
      aria-label={t(labelKey)}
      data-staff-profile-id={profile.staffProfileId}
    >
      {failed ? (
        <span
          className={`staff-portrait staff-portrait--${compact ? "compact" : "briefing"} staff-portrait--fallback`}
          aria-hidden="true"
        >
          {initials(name)}
        </span>
      ) : (
        <img
          className={`staff-portrait staff-portrait--${compact ? "compact" : "briefing"}`}
          src={profile.portraitPath}
          width={compact ? 48 : 128}
          height={compact ? 60 : 160}
          alt=""
          loading={compact ? "lazy" : "eager"}
          decoding="async"
          onError={() => setFailedPath(profile.portraitPath)}
        />
      )}
      <div className="staff-identity__body">
        <p className="eyebrow staff-identity__label">{t(labelKey)}</p>
        <h3 className="staff-identity__name">{name}</h3>
        <p className="staff-identity__role">
          {text(profile.roleTitle, t.locale)}
        </p>
        <p className="staff-identity__organization">
          {text(profile.organizationName, t.locale)}
        </p>
        {!compact && profile.professionalResponsibility !== undefined ? (
          <p className="staff-identity__responsibility">
            {text(profile.professionalResponsibility, t.locale)}
          </p>
        ) : null}
      </div>
    </section>
  );
}
