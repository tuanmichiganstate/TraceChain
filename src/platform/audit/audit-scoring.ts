import type {
  AuditCaseDefinitionV1,
  AuditConclusionSubmissionV1,
  AuditFindingDefinitionV1,
  AuditFindingSubmissionV1,
  AuditReportV1,
  AuditScoreLineV1,
} from "../contracts/audit";

export type AuditFindingClassification =
  | {
      readonly kind: "CONFIRMED";
      readonly definition: AuditFindingDefinitionV1;
    }
  | {
      readonly kind: "LEGITIMATE_EXCEPTION";
      readonly decoyDefinitionId: string;
      readonly explanationKey: string;
    }
  | {
      readonly kind: "UNSUPPORTED";
    };

export function classifyAuditFinding(
  auditCase: AuditCaseDefinitionV1,
  finding: AuditFindingSubmissionV1,
): AuditFindingClassification {
  const definition = auditCase.findingDefinitions.find(
    (candidate) =>
      candidate.categoryId === finding.categoryId &&
      candidate.entityId === finding.entityId,
  );
  if (definition !== undefined) {
    return { kind: "CONFIRMED", definition };
  }
  const decoy = auditCase.decoyDefinitions.find(
    (candidate) =>
      candidate.categoryId === finding.categoryId &&
      candidate.entityId === finding.entityId,
  );
  return decoy === undefined
    ? { kind: "UNSUPPORTED" }
    : {
        kind: "LEGITIMATE_EXCEPTION",
        decoyDefinitionId: decoy.decoyDefinitionId,
        explanationKey: decoy.explanation.localizationKey,
      };
}

function ratioScore(maximum: number, numerator: number, denominator: number) {
  if (denominator === 0) return maximum;
  return Math.round((maximum * numerator) / denominator);
}

function intersectionCount(
  selected: readonly string[],
  expected: readonly string[],
): number {
  const selectedSet = new Set(selected);
  return expected.filter((value) => selectedSet.has(value)).length;
}

function line(
  scorableItemId: AuditScoreLineV1["scorableItemId"],
  score: number,
  maximumScore: number,
  findings: readonly AuditFindingSubmissionV1[],
): AuditScoreLineV1 {
  return {
    scorableItemId,
    score,
    maximumScore,
    sourceFindingIds: findings.map((finding) => finding.findingId),
    sourceEvidenceIds: [
      ...new Set(findings.flatMap((finding) => finding.evidenceIds)),
    ].sort(),
    sourcePolicyIds: [
      ...new Set(findings.flatMap((finding) => finding.policyIds)),
    ].sort(),
  };
}
export function createAuditReport(options: {
  readonly auditCase: AuditCaseDefinitionV1;
  readonly sourceStateHash: string;
  readonly findings: readonly AuditFindingSubmissionV1[];
  readonly conclusion: AuditConclusionSubmissionV1;
}): AuditReportV1 {
  const activeFindings = options.findings.filter(
    (finding) => finding.status === "SUBMITTED",
  );
  const classifications = activeFindings.map((finding) => ({
    finding,
    classification: classifyAuditFinding(
      options.auditCase,
      finding,
    ),
  }));
  const confirmed = classifications.filter(
    (
      value,
    ): value is {
      finding: AuditFindingSubmissionV1;
      classification: Extract<
        AuditFindingClassification,
        { kind: "CONFIRMED" }
      >;
    } => value.classification.kind === "CONFIRMED",
  );
  const unsupported = classifications.filter(
    (value) => value.classification.kind !== "CONFIRMED",
  );
  const confirmedDefinitionIds = new Set(
    confirmed.map(
      ({ classification }) =>
        classification.definition.findingDefinitionId,
    ),
  );
  const missed = options.auditCase.findingDefinitions.filter(
    (definition) =>
      !confirmedDefinitionIds.has(definition.findingDefinitionId),
  );

  const detection = ratioScore(
    25,
    confirmedDefinitionIds.size,
    options.auditCase.findingDefinitions.length,
  );
  const falsePositiveAvoidance = Math.max(
    0,
    Math.round(15 - unsupported.length * 7.5),
  );
  const evidenceUnits = confirmed.reduce(
    (total, { finding, classification }) =>
      total +
      intersectionCount(
        finding.evidenceIds,
        classification.definition.requiredEvidenceIds,
      ) /
        classification.definition.requiredEvidenceIds.length,
    0,
  );
  const evidence = ratioScore(
    15,
    evidenceUnits,
    options.auditCase.findingDefinitions.length,
  );
  const policyUnits = confirmed.reduce(
    (total, { finding, classification }) =>
      total +
      intersectionCount(
        finding.policyIds,
        classification.definition.applicablePolicyIds,
      ) /
        classification.definition.applicablePolicyIds.length,
    0,
  );
  const policy = ratioScore(
    10,
    policyUnits,
    options.auditCase.findingDefinitions.length,
  );
  const classificationUnits = confirmed.reduce(
    (total, { finding, classification }) =>
      total +
      (finding.severity ===
      classification.definition.expectedSeverity
        ? 0.4
        : 0) +
      (finding.materiality ===
      classification.definition.expectedMateriality
        ? 0.2
        : 0) +
      (classification.definition.acceptableRootCauseCodes.includes(
        finding.rootCauseCode,
      )
        ? 0.4
        : 0),
    0,
  );
  const classificationScore = ratioScore(
    10,
    classificationUnits,
    options.auditCase.findingDefinitions.length,
  );
  const recommendationUnits = confirmed.reduce(
    (total, { finding, classification }) =>
      total +
      (finding.recommendation.trim().length > 0 &&
      classification.definition.acceptableRecommendationCodes.includes(
        finding.recommendationCode,
      )
        ? 1
        : 0),
    0,
  );
  const recommendation = ratioScore(
    10,
    recommendationUnits,
    options.auditCase.findingDefinitions.length,
  );
  const conclusionTextFields = [
    options.conclusion.scopeSummary,
    options.conclusion.materialFindingsSummary,
    options.conclusion.nonMaterialFindingsSummary,
    options.conclusion.limitations,
    options.conclusion.uncertainty,
    options.conclusion.recommendations,
  ];
  const conclusion =
    (options.conclusion.conclusionCategory ===
    options.auditCase.expectedConclusionCategory
      ? 7
      : 0) +
    conclusionTextFields.filter((value) => value.trim().length > 0)
      .length +
    (options.conclusion.confidence >= 0 &&
    options.conclusion.confidence <= 100
      ? 2
      : 0);

  const scoreLines = [
    line("AUD_DETECTION", detection, 25, activeFindings),
    line(
      "AUD_FALSE_POSITIVE_AVOIDANCE",
      falsePositiveAvoidance,
      15,
      unsupported.map(({ finding }) => finding),
    ),
    line("AUD_EVIDENCE", evidence, 15, activeFindings),
    line("AUD_POLICY", policy, 10, activeFindings),
    line(
      "AUD_CLASSIFICATION",
      classificationScore,
      10,
      activeFindings,
    ),
    line(
      "AUD_RECOMMENDATION",
      recommendation,
      10,
      activeFindings,
    ),
    line("AUD_CONCLUSION", conclusion, 15, activeFindings),
  ] satisfies readonly AuditScoreLineV1[];
  const score = scoreLines.reduce(
    (total, scoreLine) => total + scoreLine.score,
    0,
  );

  return {
    schemaVersion: "1.0.0",
    auditCaseId: options.auditCase.auditCaseId,
    auditCaseVersion: options.auditCase.version,
    sourceProcessId: options.auditCase.sourceProcessId,
    sourceProcessVersion: options.auditCase.sourceProcessVersion,
    sourceStateHash: options.sourceStateHash,
    score,
    maximumScore: 100,
    passScore: options.auditCase.scoringBlueprint.passScore,
    passed: score >= options.auditCase.scoringBlueprint.passScore,
    scoreLines,
    confirmedFindingIds: confirmed
      .map(({ finding }) => finding.findingId)
      .sort(),
    unsupportedFindingIds: unsupported
      .map(({ finding }) => finding.findingId)
      .sort(),
    missedFindingDefinitionIds: missed
      .map((definition) => definition.findingDefinitionId)
      .sort(),
    conclusionCategory:
      options.conclusion.conclusionCategory,
    generatedAt: options.conclusion.submittedAt,
  };
}
