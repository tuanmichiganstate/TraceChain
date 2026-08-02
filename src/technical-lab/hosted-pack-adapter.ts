import {
  assertValidExperienceConfiguration,
  experienceConfigurationHash,
} from "../config/experience";
import { TECHNICAL_LAB_PRESET } from "../config/presets";
import type {
  TechnicalLabConfiguration,
} from "../config/types";
import type {
  HostedRunModeConfigurationV1,
  ScenarioPackV2,
} from "../platform/contracts/scenario-pack";
import type {
  HostedExperienceConfigurationIdentityV2,
} from "../platform/runs/experience-configuration";
import { permissionedFoundationsLabBundle } from "./permissioned-foundations-pack";

export const TECHNICAL_LAB_HOSTED_SCENARIO_ID =
  "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS";
export const TECHNICAL_LAB_HOSTED_SCENARIO_VERSION = "1.0.0";
export const TECHNICAL_LAB_HOSTED_MODULE_COUNT =
  permissionedFoundationsLabBundle.modules.length;
export const TECHNICAL_LAB_HOSTED_MAXIMUM_SCORE =
  permissionedFoundationsLabBundle.pack.scoringContract.maximumScore;

export const TECHNICAL_LAB_HOSTED_MODE_CONFIGURATION:
  HostedRunModeConfigurationV1 = {
    mode: "tutorial",
    allowHints: true,
    allowRetry: true,
    allowBacktracking: true,
    feedbackTiming: "immediate",
    showScores: true,
    outcomeStrategy: "forced",
    seedPolicy: "supplied",
    allowCommunication: false,
    allowEvidenceRequests: false,
    forcedOutcomeCode: "FIXED_LAB_FIXTURES",
  };

export function hostedTechnicalLabConfiguration(
  locale: "vi" | "en" = "vi",
): TechnicalLabConfiguration {
  return {
    ...structuredClone(TECHNICAL_LAB_PRESET),
    content: {
      ...TECHNICAL_LAB_PRESET.content,
      scenarioId: TECHNICAL_LAB_HOSTED_SCENARIO_ID,
      scenarioVersion: TECHNICAL_LAB_HOSTED_SCENARIO_VERSION,
    },
    delivery: {
      channel: "HOSTED",
      persistencePolicyId: "SERVER_APPEND_ONLY_EVENT_STREAM",
      attemptPolicyId: "ASSIGNMENT_MANAGED",
    },
    locale,
  };
}

export function resolveHostedTechnicalLabExperience(
  locale: "vi" | "en" = "vi",
): HostedExperienceConfigurationIdentityV2 {
  const configuration = hostedTechnicalLabConfiguration(locale);
  assertValidExperienceConfiguration(configuration);
  return {
    configuration,
    configurationHash:
      experienceConfigurationHash(configuration),
  };
}

/**
 * Assignment and reporting APIs are scenario-pack oriented. This immutable
 * adapter exposes the laboratory content identity to those APIs while the
 * actual modules remain in TechnicalLabPack and run through the lab engine.
 */
export const technicalLabHostedPackAdapter: ScenarioPackV2 = {
  schemaVersion: "2.0.0",
  packId: permissionedFoundationsLabBundle.pack.labPackId,
  version: permissionedFoundationsLabBundle.pack.labPackVersion,
  status: "published",
  supportedLocales:
    permissionedFoundationsLabBundle.pack.supportedLocales,
  localizationCatalogs:
    permissionedFoundationsLabBundle.localizationCatalogs,
  manifest: {
    title: permissionedFoundationsLabBundle.pack.title,
    description:
      permissionedFoundationsLabBundle.pack.description,
    domain: "permissioned-blockchain-verification",
    educationalPurpose: {
      localizationKey:
        "technicalLab.pack.educationalPurpose",
    },
  },
  competencyFrameworks: [],
  rubrics: [],
  evidenceRules: [],
  imageAssets: [],
  auditVariantBanks: [],
  scenarios: [
    {
      scenarioId: TECHNICAL_LAB_HOSTED_SCENARIO_ID,
      version: TECHNICAL_LAB_HOSTED_SCENARIO_VERSION,
      status: "published",
      title: permissionedFoundationsLabBundle.pack.title,
      supportedModes: ["tutorial"],
      modeConfigurations: [
        TECHNICAL_LAB_HOSTED_MODE_CONFIGURATION,
      ],
      outcomeModels: [],
      competencyTargets: [],
      organizations: [
        {
          organizationId: "ORG_TECHNICAL_LAB",
          displayName: {
            localizationKey:
              "technicalLab.hosted.organization",
          },
        },
      ],
      roles: [
        {
          roleId: "TECHNICAL_LEARNER",
          organizationId: "ORG_TECHNICAL_LAB",
          displayName: {
            localizationKey: "technicalLab.hosted.role",
          },
        },
      ],
      staffProfiles: [],
      assetTypes: [],
      initialState: {
        actualState: {},
        businessState: {},
        ledgerState: {},
        informationState: {},
      },
      policies: [],
      evidenceItems: [],
      instructorIncidents: [],
      counterfactualComparisonDimensions: [],
      counterfactualConditions: [],
      entryNodeId: "TL1",
      nodes: [
        {
          nodeId: "TL1",
          nodeType: "COMPLETION",
          title:
            permissionedFoundationsLabBundle.modules[0]!.title,
          outcomeCode: "TECHNICAL_LAB_RUNTIME",
          transitions: [],
        },
      ],
      rubricIds: [],
      evidenceRuleIds: [],
      hostedRuntime: {
        runtimeId: "tracechain-technical-lab-v1",
        labPackId:
          permissionedFoundationsLabBundle.pack.labPackId,
        labPackVersion:
          permissionedFoundationsLabBundle.pack.labPackVersion,
      },
    },
  ],
  assetHashes: {},
  publication:
    permissionedFoundationsLabBundle.pack.publication!,
};

export function isTechnicalLabHostedContent(
  packId: string,
  packVersion: string,
): boolean {
  return (
    packId === technicalLabHostedPackAdapter.packId &&
    packVersion === technicalLabHostedPackAdapter.version
  );
}
