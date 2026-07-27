import type { HostedRunModeConfigurationV1 } from "../contracts/scenario-pack";
import { resolveHostedExperienceConfigurationFromPolicy } from "./experience-configuration";

export function hostedExperienceFixture(options: {
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly runtimeConfiguration:
    HostedRunModeConfigurationV1;
}) {
  return resolveHostedExperienceConfigurationFromPolicy({
    ...options,
    decisions: {
      requireRationale: false,
      requireEvidenceCitations: false,
      requirePolicyCitations: false,
      requireConfidence: false,
      requireRiskEstimate: false,
      allowDrafts: false,
    },
    locale: "vi",
  });
}
