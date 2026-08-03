import { canonicalize } from "../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../infrastructure/hashing/sha256";
import type {
  ActivityType,
  DeliveryPurpose,
  FeedbackPolicy,
  GuidancePolicy,
  HintPolicy,
  OutcomeStrategy,
  RetryPolicy,
  SupportProfile,
  SimuLedgerExperienceConfigurationV2,
} from "./types";

export type CurrentExperiencePresetId =
  | "guided"
  | "practice"
  | "challenge"
  | "assessment"
  | "audit-guided"
  | "audit-practice"
  | "audit-challenge"
  | "audit-assessment"
  | "technical-lab"
  | "tutorial"
  | "standard"
  | "sandbox"
  | "configured";

export interface ProductDimensions {
  readonly activityType: ActivityType;
  readonly supportProfile: SupportProfile;
  readonly deliveryPurpose: DeliveryPurpose;
  readonly outcomeStrategy: OutcomeStrategy;
}

const FIXED_PRESET_DIMENSIONS = {
  guided: {
    activityType: "OPERATIONS",
    supportProfile: "GUIDED",
    deliveryPurpose: "FORMATIVE",
    outcomeStrategy: "FIXED",
  },
  practice: {
    activityType: "OPERATIONS",
    supportProfile: "PRACTICE",
    deliveryPurpose: "FORMATIVE",
    outcomeStrategy: "CURATED_VARIANT",
  },
  challenge: {
    activityType: "OPERATIONS",
    supportProfile: "CHALLENGE",
    deliveryPurpose: "FORMATIVE",
    outcomeStrategy: "CURATED_VARIANT",
  },
  assessment: {
    activityType: "OPERATIONS",
    supportProfile: "CHALLENGE",
    deliveryPurpose: "ASSESSMENT",
    // The current reviewed assessment is one fixed case. A curated
    // assessment bank belongs to the later variation phase.
    outcomeStrategy: "FIXED",
  },
  "audit-guided": {
    activityType: "AUDIT",
    supportProfile: "GUIDED",
    deliveryPurpose: "FORMATIVE",
    outcomeStrategy: "FIXED",
  },
  "audit-practice": {
    activityType: "AUDIT",
    supportProfile: "PRACTICE",
    deliveryPurpose: "FORMATIVE",
    outcomeStrategy: "CURATED_VARIANT",
  },
  "audit-challenge": {
    activityType: "AUDIT",
    supportProfile: "CHALLENGE",
    deliveryPurpose: "FORMATIVE",
    outcomeStrategy: "CURATED_VARIANT",
  },
  "audit-assessment": {
    activityType: "AUDIT",
    supportProfile: "CHALLENGE",
    deliveryPurpose: "ASSESSMENT",
    outcomeStrategy: "CURATED_VARIANT",
  },
  "technical-lab": {
    activityType: "TECHNICAL_LAB",
    supportProfile: "PRACTICE",
    deliveryPurpose: "FORMATIVE",
    outcomeStrategy: "FIXED",
  },
  tutorial: {
    activityType: "OPERATIONS",
    supportProfile: "GUIDED",
    deliveryPurpose: "FORMATIVE",
    outcomeStrategy: "FIXED",
  },
  standard: {
    activityType: "OPERATIONS",
    supportProfile: "CHALLENGE",
    deliveryPurpose: "ASSESSMENT",
    outcomeStrategy: "FIXED",
  },
} as const satisfies Readonly<
  Record<
    Exclude<
      CurrentExperiencePresetId,
      "sandbox" | "configured"
    >,
    ProductDimensions
  >
>;

export function resolveProductDimensions<
  PresetId extends keyof typeof FIXED_PRESET_DIMENSIONS,
>(
  presetId: PresetId,
): (typeof FIXED_PRESET_DIMENSIONS)[PresetId];
export function resolveProductDimensions(
  presetId: "sandbox" | "configured",
  hostedOutcomeStrategy: "forced" | "probabilistic",
): ProductDimensions;
export function resolveProductDimensions(
  presetId: CurrentExperiencePresetId,
  hostedOutcomeStrategy?: "forced" | "probabilistic",
): ProductDimensions;
export function resolveProductDimensions(
  presetId: CurrentExperiencePresetId,
  hostedOutcomeStrategy?: "forced" | "probabilistic",
): ProductDimensions {
  if (presetId === "sandbox" || presetId === "configured") {
    if (hostedOutcomeStrategy === undefined) {
      throw new Error(
        `Hosted preset ${presetId} requires its authored outcome strategy.`,
      );
    }
    return {
      activityType: "OPERATIONS",
      supportProfile:
        presetId === "sandbox" ? "PRACTICE" : "CHALLENGE",
      deliveryPurpose: "SANDBOX",
      outcomeStrategy:
        hostedOutcomeStrategy === "probabilistic"
          ? "SEEDED_STOCHASTIC"
          : "FIXED",
    };
  }
  return FIXED_PRESET_DIMENSIONS[presetId];
}

export function guidancePolicyFor(
  supportProfile: SupportProfile,
): GuidancePolicy {
  if (supportProfile === "GUIDED") {
    return {
      missionDetail: "FULL",
      evidenceGuidance: "DIRECT",
      policyGuidance: "DIRECT",
      nextActionGuidance: "EXPLICIT",
      fadeByProgress: true,
      showWorkedExamples: true,
      referenceWorkspace: true,
    };
  }
  if (supportProfile === "PRACTICE") {
    return {
      missionDetail: "CONCISE",
      evidenceGuidance: "SUGGESTED",
      policyGuidance: "SUGGESTED",
      nextActionGuidance: "GOAL_ONLY",
      fadeByProgress: false,
      showWorkedExamples: false,
      referenceWorkspace: true,
    };
  }
  return {
    missionDetail: "MINIMAL",
    evidenceGuidance: "NONE",
    policyGuidance: "NONE",
    nextActionGuidance: "NONE",
    fadeByProgress: false,
    showWorkedExamples: false,
    referenceWorkspace: true,
  };
}

export function feedbackPolicyFor(
  timing: FeedbackPolicy["timing"],
): FeedbackPolicy {
  return {
    timing,
    showCorrectness: true,
    showCausalConsequences: true,
    showWorkedExplanation: timing !== "FINAL",
  };
}

export function hintPolicyFor(
  availability: HintPolicy["availability"],
  supportProfile: SupportProfile,
): HintPolicy {
  return {
    availability,
    proactiveOffer:
      availability === "DISABLED"
        ? "NOT_AVAILABLE"
        : supportProfile === "GUIDED"
          ? "OFFERED"
          : "AVAILABLE_ON_REQUEST",
    itemScoped: true,
    disclosureRequired: availability !== "DISABLED",
  };
}

export function retryPolicyFor(
  supportProfile: SupportProfile,
  deliveryPurpose: DeliveryPurpose,
): RetryPolicy {
  if (deliveryPurpose === "ASSESSMENT") {
    return {
      knowledgeRetry: "DISABLED",
      professionalDecisionRevision: "ONE_SHOT",
      maximumKnowledgeAttempts: 1,
      maximumMitigationActions: 0,
    };
  }
  return {
    knowledgeRetry:
      supportProfile === "CHALLENGE" ? "LIMITED" : "ENABLED",
    professionalDecisionRevision: "APPEND_ONLY_MITIGATION",
    maximumKnowledgeAttempts: 2,
    maximumMitigationActions: 1,
  };
}

const ALLOWED_COMBINATIONS = new Set([
  "OPERATIONS|GUIDED|FORMATIVE|FIXED",
  "OPERATIONS|PRACTICE|FORMATIVE|CURATED_VARIANT",
  "OPERATIONS|CHALLENGE|FORMATIVE|CURATED_VARIANT",
  "OPERATIONS|CHALLENGE|ASSESSMENT|CURATED_VARIANT",
  "OPERATIONS|PRACTICE|SANDBOX|SEEDED_STOCHASTIC",
  "OPERATIONS|CHALLENGE|SANDBOX|SEEDED_STOCHASTIC",
  // Current reviewed fixed Assessment and hosted Standard behavior.
  "OPERATIONS|CHALLENGE|ASSESSMENT|FIXED",
  // A hosted Sandbox may intentionally use a fixed authored outcome.
  "OPERATIONS|PRACTICE|SANDBOX|FIXED",
  "OPERATIONS|CHALLENGE|SANDBOX|FIXED",
  "AUDIT|GUIDED|FORMATIVE|FIXED",
  "AUDIT|PRACTICE|FORMATIVE|CURATED_VARIANT",
  "AUDIT|CHALLENGE|FORMATIVE|CURATED_VARIANT",
  "AUDIT|CHALLENGE|ASSESSMENT|CURATED_VARIANT",
  "AUDIT|PRACTICE|SANDBOX|SEEDED_STOCHASTIC",
  "TECHNICAL_LAB|PRACTICE|FORMATIVE|FIXED",
]);

export function isAllowedExperienceCombination(
  value: Pick<
    SimuLedgerExperienceConfigurationV2,
    | "activityType"
    | "supportProfile"
    | "deliveryPurpose"
    | "outcomeStrategy"
  >,
): boolean {
  return ALLOWED_COMBINATIONS.has(
    [
      value.activityType,
      value.supportProfile,
      value.deliveryPurpose,
      value.outcomeStrategy,
    ].join("|"),
  );
}

export function experienceConfigurationHash(
  configuration: SimuLedgerExperienceConfigurationV2,
): string {
  return sha256Hex(canonicalize(configuration));
}

export function simulationFeedbackTiming(
  timing: FeedbackPolicy["timing"],
): SimulationFeedbackTiming {
  if (timing === "STAGE_END" || timing === "MODULE_END") {
    return "stage-end";
  }
  return timing === "FINAL" ? "final" : "immediate";
}

export type SimulationFeedbackTiming =
  | "immediate"
  | "stage-end"
  | "final";

export interface ExperienceValidationIssue {
  readonly path: string;
  readonly message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

const PORTABLE_IDENTIFIER = /^[A-Za-z0-9_.:-]{1,96}$/;

function portableIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    PORTABLE_IDENTIFIER.test(value)
  );
}

function exactFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  issue: (path: string, message: string) => void,
): void {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      issue(
        `${path}.${field}`,
        "is not a documented Configuration Schema V2 field",
      );
    }
  }
}

function optionalBoundedInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  issue: (path: string, message: string) => void,
): void {
  if (
    value !== undefined &&
    (!Number.isInteger(value) ||
      (value as number) < minimum ||
      (value as number) > maximum)
  ) {
    issue(path, `must be an integer from ${minimum} to ${maximum}`);
  }
}

const CONTENT_FIELDS = new Set([
  "packId",
  "packVersion",
  "scenarioId",
  "scenarioVersion",
  "variantBankId",
  "variantBankVersion",
  "laboratoryPackId",
  "laboratoryPackVersion",
]);
const GUIDANCE_FIELDS = new Set([
  "missionDetail",
  "evidenceGuidance",
  "policyGuidance",
  "nextActionGuidance",
  "fadeByProgress",
  "showWorkedExamples",
  "referenceWorkspace",
]);
const FEEDBACK_FIELDS = new Set([
  "timing",
  "showCorrectness",
  "showCausalConsequences",
  "showWorkedExplanation",
  "releaseRuleId",
]);
const HINT_FIELDS = new Set([
  "availability",
  "proactiveOffer",
  "itemScoped",
  "disclosureRequired",
  "maximumHintsPerRun",
]);
const RETRY_FIELDS = new Set([
  "knowledgeRetry",
  "professionalDecisionRevision",
  "maximumKnowledgeAttempts",
  "maximumMitigationActions",
]);
const DECISION_FIELDS = new Set([
  "requireRationale",
  "requireEvidenceCitations",
  "requirePolicyCitations",
  "requireConfidence",
  "requireRiskEstimate",
  "allowDrafts",
]);
const SCORING_FIELDS = new Set([
  "scoringBlueprintId",
  "scoringBlueprintVersion",
  "maximumScore",
  "passScore",
  "official",
  "competencyEvidenceEnabled",
  "reportDiagnosticDimensions",
]);
const REPORTING_FIELDS = new Set([
  "causalReport",
  "auditReport",
  "competencyReport",
  "activitySummary",
  "showTechnicalMetadataToLearner",
]);
const DELIVERY_FIELDS = new Set([
  "channel",
  "persistencePolicyId",
  "attemptPolicyId",
  "timeLimitMinutes",
  "availabilityRuleId",
]);

/**
 * Validate the channel-neutral Configuration Schema V2 contract.
 *
 * Runtime-specific validators remain responsible for content availability
 * and engine extensions. This function owns the shared dimension and policy
 * invariants used by hosted assignments and SCORM packages.
 */
export function validateExperienceConfiguration(
  value: unknown,
): readonly ExperienceValidationIssue[] {
  const issues: ExperienceValidationIssue[] = [];
  const issue = (path: string, message: string): void => {
    issues.push({ path, message });
  };
  if (!isRecord(value)) {
    return [{ path: "$", message: "must be an object" }];
  }
  if (value.configurationSchemaVersion !== "2") {
    issue(
      "configurationSchemaVersion",
      "must be the active schema version 2",
    );
  }
  if (!portableIdentifier(value.presetId)) {
    issue("presetId", "must be a bounded portable identifier");
  }
  if (
    !["OPERATIONS", "AUDIT", "TECHNICAL_LAB"].includes(
      String(value.activityType),
    )
  ) {
    issue("activityType", "is not supported");
  }
  if (
    !["GUIDED", "PRACTICE", "CHALLENGE"].includes(
      String(value.supportProfile),
    )
  ) {
    issue("supportProfile", "is not supported");
  }
  if (
    !["FORMATIVE", "ASSESSMENT", "SANDBOX"].includes(
      String(value.deliveryPurpose),
    )
  ) {
    issue("deliveryPurpose", "is not supported");
  }
  if (
    ![
      "FIXED",
      "CURATED_VARIANT",
      "SEEDED_STOCHASTIC",
      "FORCED_CONDITION",
    ].includes(String(value.outcomeStrategy))
  ) {
    issue("outcomeStrategy", "is not supported");
  }
  if (
    typeof value.activityType === "string" &&
    typeof value.supportProfile === "string" &&
    typeof value.deliveryPurpose === "string" &&
    typeof value.outcomeStrategy === "string" &&
    !isAllowedExperienceCombination(
      value as unknown as Parameters<
        typeof isAllowedExperienceCombination
      >[0],
    )
  ) {
    issue(
      "activityType",
      "activity, support, delivery, and outcome dimensions are incompatible",
    );
  }
  if (!isRecord(value.content)) {
    issue("content", "must be an object");
  } else {
    exactFields(value.content, CONTENT_FIELDS, "content", issue);
    for (const field of ["packId", "packVersion"] as const) {
      if (!portableIdentifier(value.content[field])) {
        issue(
          `content.${field}`,
          "must be a bounded portable identifier",
        );
      }
    }
    for (const field of [
      "scenarioId",
      "scenarioVersion",
      "variantBankId",
      "variantBankVersion",
      "laboratoryPackId",
      "laboratoryPackVersion",
    ] as const) {
      if (
        value.content[field] !== undefined &&
        !portableIdentifier(value.content[field])
      ) {
        issue(
          `content.${field}`,
          "must be a bounded portable identifier",
        );
      }
    }
  }
  if (!isRecord(value.guidance)) {
    issue("guidance", "must be an object");
  } else {
    exactFields(value.guidance, GUIDANCE_FIELDS, "guidance", issue);
    if (
      !["FULL", "CONCISE", "MINIMAL"].includes(
        String(value.guidance.missionDetail),
      )
    ) {
      issue("guidance.missionDetail", "is not supported");
    }
    for (const field of [
      "evidenceGuidance",
      "policyGuidance",
    ] as const) {
      if (
        !["DIRECT", "SUGGESTED", "NONE"].includes(
          String(value.guidance[field]),
        )
      ) {
        issue(`guidance.${field}`, "is not supported");
      }
    }
    if (
      !["EXPLICIT", "GOAL_ONLY", "NONE"].includes(
        String(value.guidance.nextActionGuidance),
      )
    ) {
      issue("guidance.nextActionGuidance", "is not supported");
    }
    for (const field of [
      "fadeByProgress",
      "showWorkedExamples",
      "referenceWorkspace",
    ] as const) {
      if (typeof value.guidance[field] !== "boolean") {
        issue(`guidance.${field}`, "must be boolean");
      }
    }
  }
  if (!isRecord(value.feedback)) {
    issue("feedback", "must be an object");
  } else {
    exactFields(value.feedback, FEEDBACK_FIELDS, "feedback", issue);
    if (
      !["IMMEDIATE", "STAGE_END", "MODULE_END", "FINAL"].includes(
        String(value.feedback.timing),
      )
    ) {
      issue("feedback.timing", "is not supported");
    }
    for (const field of [
      "showCorrectness",
      "showCausalConsequences",
      "showWorkedExplanation",
    ] as const) {
      if (typeof value.feedback[field] !== "boolean") {
        issue(`feedback.${field}`, "must be boolean");
      }
    }
    if (
      value.feedback.releaseRuleId !== undefined &&
      !portableIdentifier(value.feedback.releaseRuleId)
    ) {
      issue(
        "feedback.releaseRuleId",
        "must be a bounded portable identifier",
      );
    }
  }
  if (!isRecord(value.hints)) {
    issue("hints", "must be an object");
  } else {
    exactFields(value.hints, HINT_FIELDS, "hints", issue);
    if (
      !["ENABLED", "LIMITED", "DISABLED"].includes(
        String(value.hints.availability),
      )
    ) {
      issue("hints.availability", "is not supported");
    }
    if (
      ![
        "OFFERED",
        "AVAILABLE_ON_REQUEST",
        "NOT_AVAILABLE",
      ].includes(String(value.hints.proactiveOffer))
    ) {
      issue("hints.proactiveOffer", "is not supported");
    }
    if (value.hints.itemScoped !== true) {
      issue("hints.itemScoped", "must remain true");
    }
    if (typeof value.hints.disclosureRequired !== "boolean") {
      issue("hints.disclosureRequired", "must be boolean");
    }
    optionalBoundedInteger(
      value.hints.maximumHintsPerRun,
      "hints.maximumHintsPerRun",
      0,
      100,
      issue,
    );
  }
  if (!isRecord(value.retries)) {
    issue("retries", "must be an object");
  } else {
    exactFields(value.retries, RETRY_FIELDS, "retries", issue);
    if (
      !["ENABLED", "LIMITED", "DISABLED"].includes(
        String(value.retries.knowledgeRetry),
      )
    ) {
      issue("retries.knowledgeRetry", "is not supported");
    }
    if (
      ![
        "APPEND_ONLY_MITIGATION",
        "ONE_SHOT",
        "FREE_REVISION",
      ].includes(
        String(value.retries.professionalDecisionRevision),
      )
    ) {
      issue(
        "retries.professionalDecisionRevision",
        "is not supported",
      );
    }
    optionalBoundedInteger(
      value.retries.maximumKnowledgeAttempts,
      "retries.maximumKnowledgeAttempts",
      1,
      20,
      issue,
    );
    optionalBoundedInteger(
      value.retries.maximumMitigationActions,
      "retries.maximumMitigationActions",
      0,
      20,
      issue,
    );
  }
  if (!isRecord(value.decisions)) {
    issue("decisions", "must be an object");
  } else {
    exactFields(value.decisions, DECISION_FIELDS, "decisions", issue);
    for (const field of DECISION_FIELDS) {
      if (typeof value.decisions[field] !== "boolean") {
        issue(`decisions.${field}`, "must be boolean");
      }
    }
  }
  if (!isRecord(value.scoring)) {
    issue("scoring", "must be an object");
  } else {
    exactFields(value.scoring, SCORING_FIELDS, "scoring", issue);
    if (
      !portableIdentifier(value.scoring.scoringBlueprintId) ||
      !portableIdentifier(
        value.scoring.scoringBlueprintVersion,
      ) ||
      typeof value.scoring.maximumScore !== "number" ||
      !Number.isFinite(value.scoring.maximumScore) ||
      value.scoring.maximumScore <= 0 ||
      typeof value.scoring.passScore !== "number" ||
      !Number.isFinite(value.scoring.passScore) ||
      value.scoring.passScore < 0 ||
      value.scoring.passScore > value.scoring.maximumScore ||
      typeof value.scoring.official !== "boolean" ||
      typeof value.scoring.competencyEvidenceEnabled !== "boolean" ||
      typeof value.scoring.reportDiagnosticDimensions !== "boolean"
    ) {
      issue("scoring", "contains invalid scoring metadata");
    }
  }
  if (!isRecord(value.reporting)) {
    issue("reporting", "must be an object");
  } else {
    exactFields(value.reporting, REPORTING_FIELDS, "reporting", issue);
    for (const field of REPORTING_FIELDS) {
      if (typeof value.reporting[field] !== "boolean") {
        issue(`reporting.${field}`, "must be boolean");
      }
    }
  }
  if (!isRecord(value.delivery)) {
    issue("delivery", "must be an object");
  } else {
    exactFields(value.delivery, DELIVERY_FIELDS, "delivery", issue);
    if (
      !["HOSTED", "SCORM"].includes(
        String(value.delivery.channel),
      ) ||
      !portableIdentifier(value.delivery.persistencePolicyId) ||
      !portableIdentifier(value.delivery.attemptPolicyId)
    ) {
      issue("delivery", "contains invalid delivery metadata");
    }
    optionalBoundedInteger(
      value.delivery.timeLimitMinutes,
      "delivery.timeLimitMinutes",
      1,
      1440,
      issue,
    );
    if (
      value.delivery.availabilityRuleId !== undefined &&
      !portableIdentifier(value.delivery.availabilityRuleId)
    ) {
      issue(
        "delivery.availabilityRuleId",
        "must be a bounded portable identifier",
      );
    }
  }
  if (!["vi", "en"].includes(String(value.locale))) {
    issue("locale", "must be vi or en");
  }
  if (
    value.deliveryPurpose === "ASSESSMENT" &&
    (isRecord(value.feedback) &&
      value.feedback.timing !== "FINAL")
  ) {
    issue(
      "feedback.timing",
      "assessment delivery requires final feedback",
    );
  }
  if (
    value.deliveryPurpose === "ASSESSMENT" &&
    isRecord(value.hints) &&
    value.hints.availability !== "DISABLED"
  ) {
    issue(
      "hints.availability",
      "assessment delivery requires disabled hints",
    );
  }
  if (
    value.deliveryPurpose === "ASSESSMENT" &&
    isRecord(value.scoring) &&
    value.scoring.official !== true
  ) {
    issue(
      "scoring.official",
      "assessment delivery requires official scoring",
    );
  }
  return issues;
}

export function assertValidExperienceConfiguration(
  value: unknown,
): asserts value is SimuLedgerExperienceConfigurationV2 {
  const issues = validateExperienceConfiguration(value);
  if (issues.length > 0) {
    throw new Error(
      `SimuLedger experience configuration is invalid:\n${issues
        .map((entry) => `  ${entry.path}: ${entry.message}`)
        .join("\n")}`,
    );
  }
}
