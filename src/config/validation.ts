import type { TraceChainConfiguration } from "./types";

export interface ConfigurationValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ConfigurationValidationResult {
  readonly isValid: boolean;
  readonly issues: readonly ConfigurationValidationIssue[];
}

const MODES = new Set(["guided", "challenge", "assessment", "technical-lab"]);
const DIFFICULTIES = new Set(["introductory", "intermediate"]);
const FEEDBACK = new Set(["immediate", "stage-end", "final"]);
const HINTS = new Set(["enabled", "limited", "disabled"]);
const LOCALES = new Set(["vi", "en"]);
const IDENTIFIER = /^[A-Za-z0-9_.:-]{1,96}$/;
const TOP_LEVEL_FIELDS = new Set([
  "configurationVersion",
  "applicationCompatibilityVersion",
  "mode",
  "scenarioId",
  "scenarioVersion",
  "scenarioSeed",
  "difficulty",
  "feedbackTiming",
  "hints",
  "referenceWorkspace",
  "scenarioVariation",
  "technicalFeatures",
  "scoring",
  "locale",
]);
const TECHNICAL_FEATURE_FIELDS = new Set([
  "hashInspection",
  "digitalSignatures",
  "endorsementPolicies",
  "stateVersionConflicts",
  "merkleLab",
  "proofOfWorkLab",
]);
const SCORING_FIELDS = new Set([
  "maximumScore",
  "passScore",
  "reportDiagnosticDimensions",
]);
const FIXED_VARIATION_FIELDS = new Set([
  "strategy",
  "optionOrdering",
  "attemptPolicy",
  "displayCaseReferenceToLearner",
]);
const BANK_VARIATION_FIELDS = new Set([
  ...FIXED_VARIATION_FIELDS,
  "bankId",
  "bankVersion",
  "selectionAlgorithmVersion",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateConfiguration(value: unknown): ConfigurationValidationResult {
  const issues: ConfigurationValidationIssue[] = [];
  const issue = (path: string, message: string): void => {
    issues.push({ path, message });
  };

  if (!isObject(value)) {
    return {
      isValid: false,
      issues: [{ path: "$", message: "Configuration must be an object" }],
    };
  }

  for (const field of Object.keys(value)) {
    if (!TOP_LEVEL_FIELDS.has(field)) {
      issue(field, "is not a documented configuration field");
    }
  }

  const requiredIdentifiers = [
    "configurationVersion",
    "applicationCompatibilityVersion",
    "scenarioId",
    "scenarioVersion",
    "scenarioSeed",
  ] as const;
  for (const field of requiredIdentifiers) {
    if (typeof value[field] !== "string" || !IDENTIFIER.test(value[field])) {
      issue(field, "must be a bounded portable identifier");
    }
  }
  if (value.configurationVersion !== "2") {
    issue("configurationVersion", "is not supported by this generator");
  }
  if (value.applicationCompatibilityVersion !== "tc3-v2") {
    issue(
      "applicationCompatibilityVersion",
      "is not compatible with this player",
    );
  }
  if (!MODES.has(String(value.mode))) issue("mode", "is not supported");
  if (!DIFFICULTIES.has(String(value.difficulty))) issue("difficulty", "is not supported");
  if (!FEEDBACK.has(String(value.feedbackTiming))) {
    issue("feedbackTiming", "is not supported");
  }
  if (!HINTS.has(String(value.hints))) issue("hints", "is not supported");
  if (value.referenceWorkspace !== "enabled" && value.referenceWorkspace !== "disabled") {
    issue("referenceWorkspace", "must be enabled or disabled");
  }
  if (!LOCALES.has(String(value.locale))) issue("locale", "must be vi or en");

  if (!isObject(value.scenarioVariation)) {
    issue("scenarioVariation", "must be an object");
  } else {
    const strategy = value.scenarioVariation.strategy;
    const allowedFields =
      strategy === "FIXED"
        ? FIXED_VARIATION_FIELDS
        : BANK_VARIATION_FIELDS;
    for (const field of Object.keys(value.scenarioVariation)) {
      if (!allowedFields.has(field)) {
        issue(
          `scenarioVariation.${field}`,
          "is not a documented variation field for this strategy",
        );
      }
    }
    if (
      strategy !== "FIXED" &&
      strategy !== "SEEDED_VARIANT_BANK"
    ) {
      issue(
        "scenarioVariation.strategy",
        "must be FIXED or SEEDED_VARIANT_BANK",
      );
    }
    if (value.scenarioVariation.optionOrdering !== "FIXED") {
      issue(
        "scenarioVariation.optionOrdering",
        "only fixed option ordering is available in this release",
      );
    }
    if (
      value.scenarioVariation.attemptPolicy !==
      "STABLE_WITHIN_ATTEMPT"
    ) {
      issue(
        "scenarioVariation.attemptPolicy",
        "SCORM variation must remain stable within one attempt",
      );
    }
    if (
      typeof value.scenarioVariation.displayCaseReferenceToLearner !==
      "boolean"
    ) {
      issue(
        "scenarioVariation.displayCaseReferenceToLearner",
        "must be boolean",
      );
    }
    if (strategy === "FIXED") {
      if (value.scenarioVariation.displayCaseReferenceToLearner !== false) {
        issue(
          "scenarioVariation.displayCaseReferenceToLearner",
          "fixed scenarios do not expose a variant case reference",
        );
      }
    } else if (strategy === "SEEDED_VARIANT_BANK") {
      for (const field of [
        "bankId",
        "bankVersion",
        "selectionAlgorithmVersion",
      ] as const) {
        if (
          typeof value.scenarioVariation[field] !== "string" ||
          !IDENTIFIER.test(value.scenarioVariation[field])
        ) {
          issue(
            `scenarioVariation.${field}`,
            "must be a bounded portable identifier",
          );
        }
      }
      if (value.scenarioVariation.selectionAlgorithmVersion !== "1") {
        issue(
          "scenarioVariation.selectionAlgorithmVersion",
          "is not supported by this player",
        );
      }
    }
  }

  if (!isObject(value.technicalFeatures)) {
    issue("technicalFeatures", "must be an object");
  } else {
    const names = [
      "hashInspection",
      "digitalSignatures",
      "endorsementPolicies",
      "stateVersionConflicts",
      "merkleLab",
      "proofOfWorkLab",
    ] as const;
    for (const name of names) {
      if (typeof value.technicalFeatures[name] !== "boolean") {
        issue(`technicalFeatures.${name}`, "must be boolean");
      }
    }
    for (const field of Object.keys(value.technicalFeatures)) {
      if (!TECHNICAL_FEATURE_FIELDS.has(field)) {
        issue(
          `technicalFeatures.${field}`,
          "is not a documented technical feature",
        );
      }
    }
    if (value.technicalFeatures.hashInspection !== true) {
      issue(
        "technicalFeatures.hashInspection",
        "must remain enabled while the main scenario exposes real hashes",
      );
    }
    for (const unavailable of [
      "stateVersionConflicts",
      "merkleLab",
      "proofOfWorkLab",
    ] as const) {
      if (value.technicalFeatures[unavailable] === true) {
        issue(`technicalFeatures.${unavailable}`, "content is not available in this release");
      }
    }
    if (
      value.technicalFeatures.endorsementPolicies === true &&
      value.technicalFeatures.digitalSignatures !== true
    ) {
      issue(
        "technicalFeatures.endorsementPolicies",
        "requires digital signatures",
      );
    }
  }

  if (!isObject(value.scoring)) {
    issue("scoring", "must be an object");
  } else {
    for (const field of Object.keys(value.scoring)) {
      if (!SCORING_FIELDS.has(field)) {
        issue(`scoring.${field}`, "is not a documented scoring field");
      }
    }
    if (value.scoring.maximumScore !== 100) {
      issue("scoring.maximumScore", "must be exactly 100 in this release");
    }
    if (
      typeof value.scoring.passScore !== "number" ||
      !Number.isFinite(value.scoring.passScore) ||
      value.scoring.passScore < 0 ||
      value.scoring.passScore > 100
    ) {
      issue("scoring.passScore", "must be between 0 and 100");
    }
    if (typeof value.scoring.reportDiagnosticDimensions !== "boolean") {
      issue("scoring.reportDiagnosticDimensions", "must be boolean");
    }
  }

  if (value.mode === "assessment") {
    if (typeof value.scenarioSeed !== "string" || value.scenarioSeed.length === 0) {
      issue("scenarioSeed", "assessment mode requires a fixed seed");
    }
    if (value.feedbackTiming !== "final") {
      issue("feedbackTiming", "assessment mode requires final feedback");
    }
    if (value.hints !== "disabled") {
      issue("hints", "assessment mode requires disabled hints");
    }
    if (value.scenarioId !== "SCN_COFFEE_001") {
      issue(
        "scenarioId",
        "assessment mode requires the reviewed standard coffee scenario",
      );
    }
    if (
      isObject(value.scenarioVariation) &&
      value.scenarioVariation.strategy !== "FIXED"
    ) {
      issue(
        "scenarioVariation.strategy",
        "the formal Assessment variant bank is not available in this release",
      );
    }
  }
  if (value.feedbackTiming === "final" && value.mode === "guided") {
    issue("feedbackTiming", "guided mode requires feedback before the final report");
  }
  if (value.mode === "technical-lab") {
    issue("mode", "technical laboratory content is not available in this release");
  }
  if (
    value.mode === "guided" &&
    value.scenarioId !== "SCN_COFFEE_001"
  ) {
    issue("scenarioId", "guided mode requires the standard coffee scenario");
  }
  if (
    value.mode === "guided" &&
    isObject(value.scenarioVariation) &&
    value.scenarioVariation.strategy !== "FIXED"
  ) {
    issue(
      "scenarioVariation.strategy",
      "guided mode must remain fixed",
    );
  }
  if (
    value.mode === "challenge" &&
    value.scenarioId !== "SCN_COFFEE_CHALLENGE"
  ) {
    issue(
      "scenarioId",
      "challenge mode requires the curated Challenge variant bank",
    );
  }
  if (
    value.mode === "challenge" &&
    isObject(value.scenarioVariation) &&
    value.scenarioVariation.strategy !== "SEEDED_VARIANT_BANK"
  ) {
    issue(
      "scenarioVariation.strategy",
      "challenge mode requires the seeded curated variant bank",
    );
  }

  return { isValid: issues.length === 0, issues };
}

export function assertValidConfiguration(value: unknown): asserts value is TraceChainConfiguration {
  const result = validateConfiguration(value);
  if (!result.isValid) {
    throw new Error(
      `TraceChain configuration is invalid:\n${result.issues
        .map((entry) => `  ${entry.path}: ${entry.message}`)
        .join("\n")}`,
    );
  }
}
