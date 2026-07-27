import {
  assertValidExperienceConfiguration,
  experienceConfigurationHash,
  feedbackPolicyFor,
  guidancePolicyFor,
  hintPolicyFor,
  resolveProductDimensions,
} from "../../config/experience";
import type {
  DecisionPolicy,
  TraceChainExperienceConfigurationV2,
} from "../../config/types";
import type {
  HostedRunModeConfigurationV1,
  ScenarioDefinitionV1,
} from "../contracts/scenario-pack";

export interface HostedExperienceConfigurationIdentityV2 {
  readonly configuration:
    TraceChainExperienceConfigurationV2;
  readonly configurationHash: string;
}

function decisionPolicyFor(
  scenario: ScenarioDefinitionV1,
): DecisionPolicy {
  const decisions = scenario.nodes.filter(
    (node) => node.nodeType === "DECISION",
  );
  return {
    requireRationale: decisions.some(
      (node) => node.justification?.required === true,
    ),
    requireEvidenceCitations: decisions.some(
      (node) =>
        node.structuredResponse?.evidenceCitations?.required ===
        true,
    ),
    requirePolicyCitations: decisions.some(
      (node) =>
        node.structuredResponse?.policyCitations?.required ===
        true,
    ),
    requireConfidence: decisions.some(
      (node) =>
        node.structuredResponse?.confidenceRating?.required ===
        true,
    ),
    requireRiskEstimate: decisions.some(
      (node) =>
        node.structuredResponse
          ?.adverseEventProbabilityPercent?.required === true,
    ),
    allowDrafts: false,
  };
}

function hostedFeedbackTiming(
  timing: HostedRunModeConfigurationV1["feedbackTiming"],
): "IMMEDIATE" | "STAGE_END" | "FINAL" {
  if (timing === "stage-end") return "STAGE_END";
  return timing === "final" ? "FINAL" : "IMMEDIATE";
}

export function resolveHostedExperienceConfiguration(options: {
  readonly packId: string;
  readonly packVersion: string;
  readonly scenario: ScenarioDefinitionV1;
  readonly runtimeConfiguration:
    HostedRunModeConfigurationV1;
  readonly locale?: "vi" | "en";
}): HostedExperienceConfigurationIdentityV2 {
  if (options.scenario.hostedRuntime?.runtimeId === "tracechain-audit-v1") {
    const auditCase = options.scenario.auditCase;
    const supportProfile = auditCase?.supportProfiles[0];
    const presetId =
      supportProfile === "GUIDED"
        ? "audit-guided"
        : supportProfile === "PRACTICE"
          ? "audit-practice"
          : options.runtimeConfiguration.mode === "standard"
            ? "audit-assessment"
            : "audit-challenge";
    const expectedModes =
      supportProfile === "GUIDED"
        ? ["tutorial"]
        : supportProfile === "PRACTICE"
          ? ["standard"]
          : ["configured", "standard"];
    if (
      auditCase === undefined ||
      (supportProfile !== "GUIDED" &&
        supportProfile !== "PRACTICE" &&
        supportProfile !== "CHALLENGE") ||
      !expectedModes.includes(options.runtimeConfiguration.mode)
    ) {
      throw new Error(
        "The Audit runtime configuration does not match the authored support profile.",
      );
    }
    const dimensions = resolveProductDimensions(presetId);
    const assessment =
      dimensions.deliveryPurpose === "ASSESSMENT";
    const hints =
      options.runtimeConfiguration.allowHints
        ? supportProfile === "CHALLENGE"
          ? "LIMITED"
          : "ENABLED"
        : "DISABLED";
    const configuration: TraceChainExperienceConfigurationV2 = {
      configurationSchemaVersion: "2",
      presetId: `hosted-${presetId}`,
      ...dimensions,
      content: {
        packId: options.packId,
        packVersion: options.packVersion,
        scenarioId: options.scenario.scenarioId,
        scenarioVersion: options.scenario.version,
      },
      guidance: guidancePolicyFor(supportProfile),
      feedback: feedbackPolicyFor(
        hostedFeedbackTiming(
          options.runtimeConfiguration.feedbackTiming,
        ),
      ),
      hints: {
        ...hintPolicyFor(hints, supportProfile),
        ...(hints === "LIMITED"
          ? { maximumHintsPerRun: 1 }
          : {}),
      },
      retries: {
        knowledgeRetry: "DISABLED",
        professionalDecisionRevision: assessment
          ? "ONE_SHOT"
          : "FREE_REVISION",
        maximumKnowledgeAttempts: 1,
        maximumMitigationActions: 0,
      },
      decisions: {
        requireRationale: true,
        requireEvidenceCitations: true,
        requirePolicyCitations: true,
        requireConfidence: true,
        requireRiskEstimate: false,
        allowDrafts: true,
      },
      scoring: {
        scoringBlueprintId:
          auditCase.scoringBlueprint.scoringBlueprintId,
        scoringBlueprintVersion:
          auditCase.scoringBlueprint.version,
        maximumScore: 100,
        passScore: auditCase.scoringBlueprint.passScore,
        official: assessment,
        competencyEvidenceEnabled: true,
        reportDiagnosticDimensions: true,
      },
      reporting: {
        causalReport: false,
        auditReport: true,
        competencyReport: true,
        activitySummary: true,
        showTechnicalMetadataToLearner: false,
      },
      delivery: {
        channel: "HOSTED",
        persistencePolicyId: "SERVER_APPEND_ONLY_EVENT_STREAM",
        attemptPolicyId: "ASSIGNMENT_MANAGED",
        ...(options.runtimeConfiguration.timeLimitMinutes === undefined
          ? {}
          : {
              timeLimitMinutes:
                options.runtimeConfiguration.timeLimitMinutes,
            }),
      },
      locale: options.locale ?? "vi",
    };
    assertValidExperienceConfiguration(configuration);
    return {
      configuration,
      configurationHash:
        experienceConfigurationHash(configuration),
    };
  }
  return resolveHostedExperienceConfigurationFromPolicy({
    packId: options.packId,
    packVersion: options.packVersion,
    scenarioId: options.scenario.scenarioId,
    scenarioVersion: options.scenario.version,
    runtimeConfiguration: options.runtimeConfiguration,
    decisions: decisionPolicyFor(options.scenario),
    ...(options.locale === undefined
      ? {}
      : { locale: options.locale }),
  });
}

export function resolveHostedExperienceConfigurationFromPolicy(options: {
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly runtimeConfiguration:
    HostedRunModeConfigurationV1;
  readonly decisions: DecisionPolicy;
  readonly locale?: "vi" | "en";
}): HostedExperienceConfigurationIdentityV2 {
  const { runtimeConfiguration } = options;
  const dimensions = resolveProductDimensions(
    runtimeConfiguration.mode,
    runtimeConfiguration.mode === "sandbox" ||
      runtimeConfiguration.mode === "configured"
      ? runtimeConfiguration.outcomeStrategy
      : undefined,
  );
  const hints =
    runtimeConfiguration.allowHints
      ? dimensions.supportProfile === "CHALLENGE"
        ? "LIMITED"
        : "ENABLED"
      : "DISABLED";
  const configuration: TraceChainExperienceConfigurationV2 = {
    configurationSchemaVersion: "2",
    presetId: `hosted-${runtimeConfiguration.mode}`,
    ...dimensions,
    content: {
      packId: options.packId,
      packVersion: options.packVersion,
      scenarioId: options.scenarioId,
      scenarioVersion: options.scenarioVersion,
    },
    guidance: guidancePolicyFor(dimensions.supportProfile),
    feedback: feedbackPolicyFor(
      hostedFeedbackTiming(
        runtimeConfiguration.feedbackTiming,
      ),
    ),
    hints: hintPolicyFor(
      hints,
      dimensions.supportProfile,
    ),
    retries: {
      knowledgeRetry: runtimeConfiguration.allowRetry
        ? "ENABLED"
        : "DISABLED",
      professionalDecisionRevision:
        "APPEND_ONLY_MITIGATION",
      maximumKnowledgeAttempts:
        runtimeConfiguration.allowRetry ? 2 : 1,
      maximumMitigationActions: 1,
    },
    decisions: options.decisions,
    scoring: {
      scoringBlueprintId: "HOSTED_RUBRIC_EVIDENCE_100",
      scoringBlueprintVersion: "1.0.0",
      maximumScore: 100,
      passScore: 70,
      official:
        dimensions.deliveryPurpose === "ASSESSMENT",
      competencyEvidenceEnabled: true,
      reportDiagnosticDimensions: true,
    },
    reporting: {
      causalReport: true,
      auditReport: false,
      competencyReport: true,
      activitySummary: true,
      showTechnicalMetadataToLearner: false,
    },
    delivery: {
      channel: "HOSTED",
      persistencePolicyId:
        "SERVER_APPEND_ONLY_EVENT_STREAM",
      attemptPolicyId: "ASSIGNMENT_MANAGED",
      ...(runtimeConfiguration.timeLimitMinutes === undefined
        ? {}
        : {
            timeLimitMinutes:
              runtimeConfiguration.timeLimitMinutes,
          }),
    },
    locale: options.locale ?? "vi",
  };
  assertValidExperienceConfiguration(configuration);
  return {
    configuration,
    configurationHash:
      experienceConfigurationHash(configuration),
  };
}

export function assertHostedExperienceIdentity(options: {
  readonly configuration: unknown;
  readonly configurationHash: unknown;
  readonly expected?: HostedExperienceConfigurationIdentityV2;
}): asserts options is {
  readonly configuration:
    TraceChainExperienceConfigurationV2;
  readonly configurationHash: string;
  readonly expected?:
    HostedExperienceConfigurationIdentityV2;
} {
  assertValidExperienceConfiguration(options.configuration);
  const calculated = experienceConfigurationHash(
    options.configuration,
  );
  if (
    typeof options.configurationHash !== "string" ||
    options.configurationHash !== calculated
  ) {
    throw new Error(
      "Hosted experience configuration hash does not match its canonical content.",
    );
  }
  if (
    options.expected !== undefined &&
    (options.configurationHash !==
      options.expected.configurationHash ||
      calculated !== options.expected.configurationHash)
  ) {
    throw new Error(
      "Hosted experience configuration does not match the exact published scenario profile.",
    );
  }
}
