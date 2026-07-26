import type {
  AssignmentResearchConfigurationV1,
} from "../contracts/assessment";
import type {
  HostedRunModeConfigurationV1,
} from "../contracts/scenario-pack";

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

export class AssignmentResearchConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssignmentResearchConfigurationError";
  }
}

export function disabledAssignmentResearchConfiguration():
  AssignmentResearchConfigurationV1 {
  return { enabled: false };
}

function boundedIdentifier(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    value.length > 160 ||
    !IDENTIFIER.test(value)
  ) {
    throw new AssignmentResearchConfigurationError(
      `${label} must be a stable identifier of at most 160 characters.`,
    );
  }
  return value;
}

export function validateAssignmentResearchConfiguration(
  value: unknown,
  runConfiguration: HostedRunModeConfigurationV1,
): AssignmentResearchConfigurationV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as { enabled?: unknown }).enabled !== "boolean"
  ) {
    throw new AssignmentResearchConfigurationError(
      "research must be a resolved object.",
    );
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  if (candidate.enabled === false) {
    if (Object.keys(candidate).some((key) => key !== "enabled")) {
      throw new AssignmentResearchConfigurationError(
        "Disabled research configuration cannot retain study metadata.",
      );
    }
    return { enabled: false };
  }
  if (runConfiguration.seedPolicy !== "supplied") {
    throw new AssignmentResearchConfigurationError(
      "Research assignments require an authored supplied-seed mode.",
    );
  }
  if (typeof candidate.blindedRaters !== "boolean") {
    throw new AssignmentResearchConfigurationError(
      "blindedRaters must be a boolean.",
    );
  }
  const fixedScenarioSeed = boundedIdentifier(
    candidate.fixedScenarioSeed,
    "fixedScenarioSeed",
  );
  const interventionVersion = candidate.interventionVersion;
  if (
    typeof interventionVersion !== "string" ||
    !VERSION.test(interventionVersion)
  ) {
    throw new AssignmentResearchConfigurationError(
      "interventionVersion must be a semantic version.",
    );
  }
  const optionalLink = (
    key: "preTestLinkageId" | "postTestLinkageId",
  ): string | undefined =>
    candidate[key] === undefined
      ? undefined
      : boundedIdentifier(candidate[key], key);
  const preTestLinkageId = optionalLink("preTestLinkageId");
  const postTestLinkageId = optionalLink("postTestLinkageId");
  return {
    enabled: true,
    experimentalConditionId: boundedIdentifier(
      candidate.experimentalConditionId,
      "experimentalConditionId",
    ),
    randomAssignmentRecordId: boundedIdentifier(
      candidate.randomAssignmentRecordId,
      "randomAssignmentRecordId",
    ),
    fixedScenarioSeed,
    consentStatusReference: boundedIdentifier(
      candidate.consentStatusReference,
      "consentStatusReference",
    ),
    ...(preTestLinkageId === undefined
      ? {}
      : { preTestLinkageId }),
    ...(postTestLinkageId === undefined
      ? {}
      : { postTestLinkageId }),
    blindedRaters: candidate.blindedRaters,
    interventionVersion,
    retentionPolicyReference: boundedIdentifier(
      candidate.retentionPolicyReference,
      "retentionPolicyReference",
    ),
  };
}
