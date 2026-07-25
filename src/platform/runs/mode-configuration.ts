import type {
  HostedRunMode,
  HostedRunModeConfigurationV1,
  ScenarioDefinitionV1,
} from "../contracts/scenario-pack";

export class HostedModeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostedModeConfigurationError";
  }
}

const MODES: readonly HostedRunMode[] = [
  "tutorial",
  "standard",
  "sandbox",
  "configured",
];
const FEEDBACK_TIMINGS = [
  "immediate",
  "stage-end",
  "final",
] as const;
const OUTCOME_STRATEGIES = [
  "forced",
  "probabilistic",
] as const;
const SEED_POLICIES = ["supplied", "generated"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateHostedModeConfiguration(
  value: unknown,
  expectedMode?: HostedRunMode,
): HostedRunModeConfigurationV1 {
  if (!isRecord(value)) {
    throw new HostedModeConfigurationError(
      "Hosted mode configuration must be an object.",
    );
  }
  const mode = value.mode;
  if (
    typeof mode !== "string" ||
    !MODES.includes(mode as HostedRunMode) ||
    (expectedMode !== undefined && mode !== expectedMode)
  ) {
    throw new HostedModeConfigurationError(
      "Hosted mode configuration does not match the assignment mode.",
    );
  }
  for (const key of [
    "allowHints",
    "allowRetry",
    "allowBacktracking",
    "showScores",
    "allowCommunication",
    "allowEvidenceRequests",
  ] as const) {
    if (typeof value[key] !== "boolean") {
      throw new HostedModeConfigurationError(
        `${key} must be a boolean.`,
      );
    }
  }
  if (
    typeof value.feedbackTiming !== "string" ||
    !FEEDBACK_TIMINGS.includes(
      value.feedbackTiming as (typeof FEEDBACK_TIMINGS)[number],
    ) ||
    typeof value.outcomeStrategy !== "string" ||
    !OUTCOME_STRATEGIES.includes(
      value.outcomeStrategy as (typeof OUTCOME_STRATEGIES)[number],
    ) ||
    typeof value.seedPolicy !== "string" ||
    !SEED_POLICIES.includes(
      value.seedPolicy as (typeof SEED_POLICIES)[number],
    )
  ) {
    throw new HostedModeConfigurationError(
      "Hosted feedback, outcome, or seed configuration is unsupported.",
    );
  }
  if (
    value.timeLimitMinutes !== undefined &&
    (!Number.isInteger(value.timeLimitMinutes) ||
      (value.timeLimitMinutes as number) < 1 ||
      (value.timeLimitMinutes as number) > 1440)
  ) {
    throw new HostedModeConfigurationError(
      "Hosted time limit must be 1 to 1,440 minutes.",
    );
  }
  for (const key of [
    "outcomeModelId",
    "forcedOutcomeCode",
  ] as const) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" ||
        (value[key] as string).length === 0)
    ) {
      throw new HostedModeConfigurationError(
        `${key} must be a non-empty string when present.`,
      );
    }
  }
  return structuredClone(
    value as unknown as HostedRunModeConfigurationV1,
  );
}

export function modeConfigurationFor(
  scenario: ScenarioDefinitionV1,
  mode: HostedRunMode,
): HostedRunModeConfigurationV1 {
  if (!scenario.supportedModes.includes(mode)) {
    throw new HostedModeConfigurationError(
      `Scenario does not support hosted mode ${mode}.`,
    );
  }
  if (scenario.modeConfigurations === undefined) {
    throw new HostedModeConfigurationError(
      `Scenario has no authored configuration for hosted mode ${mode}.`,
    );
  }
  const matches = scenario.modeConfigurations.filter(
    (configuration) => configuration.mode === mode,
  );
  if (matches.length !== 1) {
    throw new HostedModeConfigurationError(
      `Scenario must define exactly one configuration for hosted mode ${mode}.`,
    );
  }
  const configuration = matches[0];
  if (configuration === undefined) {
    throw new HostedModeConfigurationError(
      `Scenario has no configuration for hosted mode ${mode}.`,
    );
  }
  return validateHostedModeConfiguration(configuration, mode);
}
