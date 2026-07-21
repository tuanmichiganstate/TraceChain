/**
 * Scenario validation (specification section 27: "Validate all imported
 * scenario data at startup").
 *
 * Almost everything checked here is silent at runtime. A stage whose completion
 * condition references an asset that is never created does not crash -- it
 * produces a stage the learner simply cannot finish, and the cause is three
 * layers away. A knowledge check missing from `decisionIds` does not crash
 * either; it quietly stops being saved, and the learner loses that answer on
 * resume.
 *
 * So this runs both at build time (`npm run validate:scenario`) and at startup,
 * and it reports every problem at once rather than stopping at the first.
 */

import { SCENARIO_STAGE_ORDER, ScenarioStageId } from "../types/enums";
import { ScoreComponent } from "../types/scoring";
import {
  allHints,
  allKnowledgeChecks,
  allScorableItems,
  KnowledgeCheckType,
  type ScenarioDefinition,
} from "../types/scenario";

export interface ScenarioIssue {
  readonly severity: "ERROR" | "WARNING";
  readonly path: string;
  readonly message: string;
}

export interface ScenarioValidationResult {
  readonly isValid: boolean;
  readonly issues: readonly ScenarioIssue[];
  readonly checkedCount: number;
}

/** Identifier prefixes from specification section 5.3, plus LOC_. */
const ID_PREFIXES = {
  organization: "ORG_",
  actor: "ACT_",
  location: "LOC_",
  scenario: "SCN_",
} as const;

export function validateScenario(scenario: ScenarioDefinition): ScenarioValidationResult {
  const issues: ScenarioIssue[] = [];
  let checkedCount = 0;

  const error = (path: string, message: string): void => {
    issues.push({ severity: "ERROR", path, message });
  };
  const warn = (path: string, message: string): void => {
    issues.push({ severity: "WARNING", path, message });
  };
  const check = (
    condition: boolean,
    path: string,
    message: string,
    severity: "ERROR" | "WARNING" = "ERROR",
  ): void => {
    checkedCount += 1;
    if (!condition) {
      (severity === "ERROR" ? error : warn)(path, message);
    }
  };

  // ---- Identity --------------------------------------------------------

  check(
    scenario.scenarioId.startsWith(ID_PREFIXES.scenario),
    "scenarioId",
    `Scenario identifiers use the ${ID_PREFIXES.scenario} prefix`,
  );
  check(scenario.estimatedMinutes > 0, "estimatedMinutes", "Estimated minutes must be positive");

  // ---- Organizations, actors, locations --------------------------------

  const organizationIds = new Set(scenario.organizations.map((o) => o.organizationId));
  const actorIds = new Set(scenario.actors.map((a) => a.actorId));
  const locationIds = new Set(scenario.locations.map((l) => l.locationId));

  check(
    organizationIds.size === scenario.organizations.length,
    "organizations",
    "Organization identifiers must be unique",
  );
  check(actorIds.size === scenario.actors.length, "actors", "Actor identifiers must be unique");
  check(
    locationIds.size === scenario.locations.length,
    "locations",
    "Location identifiers must be unique",
  );

  for (const organization of scenario.organizations) {
    check(
      organization.organizationId.startsWith(ID_PREFIXES.organization),
      `organizations.${organization.organizationId}`,
      `Must use the ${ID_PREFIXES.organization} prefix`,
    );
    check(
      organization.displayNameKey.length > 0,
      `organizations.${organization.organizationId}`,
      "Must have a display name key",
    );
  }

  for (const actor of scenario.actors) {
    check(
      actor.actorId.startsWith(ID_PREFIXES.actor),
      `actors.${actor.actorId}`,
      `Must use the ${ID_PREFIXES.actor} prefix`,
    );
    check(
      organizationIds.has(actor.organizationId),
      `actors.${actor.actorId}`,
      `References unknown organization "${actor.organizationId}"`,
    );
  }

  for (const location of scenario.locations) {
    check(
      location.locationId.startsWith(ID_PREFIXES.location),
      `locations.${location.locationId}`,
      `Must use the ${ID_PREFIXES.location} prefix`,
    );
    check(
      organizationIds.has(location.operatedByOrganizationId),
      `locations.${location.locationId}`,
      `Operated by unknown organization "${location.operatedByOrganizationId}"`,
    );
  }

  // ---- Timeline --------------------------------------------------------

  for (const [key, value] of Object.entries(scenario.timeline)) {
    check(
      typeof value === "string" && value.endsWith("Z") && Number.isFinite(Date.parse(value)),
      `timeline.${key}`,
      `Must be a valid ISO 8601 UTC instant, found "${value}"`,
    );
  }

  // ---- Seed data -------------------------------------------------------

  const seedAssetIds = new Set(scenario.seedAssets.map((asset) => asset.assetId));

  for (const asset of scenario.seedAssets) {
    check(
      organizationIds.has(asset.ownerOrganizationId),
      `seedAssets.${asset.assetId}`,
      `Owner "${asset.ownerOrganizationId}" is not a defined organization`,
    );
    check(
      organizationIds.has(asset.custodianOrganizationId),
      `seedAssets.${asset.assetId}`,
      `Custodian "${asset.custodianOrganizationId}" is not a defined organization`,
    );
    check(
      locationIds.has(asset.locationId),
      `seedAssets.${asset.assetId}`,
      `Location "${asset.locationId}" is not a defined location`,
    );
    check(
      asset.quantity > 0,
      `seedAssets.${asset.assetId}`,
      "Seed quantity must be positive",
    );
    // Without a package size, a UNIT-measured asset cannot be compared against
    // a mass input, and the transformation rule has nothing to work with.
    check(
      asset.quantityUnit !== "UNIT" || asset.packageSizeGrams !== null,
      `seedAssets.${asset.assetId}`,
      "An asset measured in UNIT must declare packageSizeGrams",
    );
  }

  const seedIds = new Set(scenario.seedTransactions.map((seed) => seed.seedId));
  check(
    seedIds.size === scenario.seedTransactions.length,
    "seedTransactions",
    "Seed transaction identifiers must be unique",
  );

  for (const seed of scenario.seedTransactions) {
    check(
      actorIds.has(seed.actorId),
      `seedTransactions.${seed.seedId}`,
      `References unknown actor "${seed.actorId}"`,
    );
    check(
      organizationIds.has(seed.organizationId),
      `seedTransactions.${seed.seedId}`,
      `References unknown organization "${seed.organizationId}"`,
    );
    check(
      Number.isFinite(Date.parse(seed.command.scenarioTimestamp)),
      `seedTransactions.${seed.seedId}`,
      "Command must carry a valid scenario timestamp",
    );
  }

  for (const edge of scenario.seedProvenanceEdges) {
    const path = `seedProvenanceEdges.${edge.sourceAssetId}->${edge.targetAssetId}`;
    check(
      seedAssetIds.has(edge.sourceAssetId),
      path,
      `Source "${edge.sourceAssetId}" is not a seeded asset`,
    );
    check(
      seedAssetIds.has(edge.targetAssetId),
      path,
      `Target "${edge.targetAssetId}" is not a seeded asset`,
    );
    check(edge.sourceAssetId !== edge.targetAssetId, path, "An asset cannot derive from itself");
  }

  // ---- Stages ----------------------------------------------------------

  const stageIds = scenario.stages.map((stage) => stage.stageId);
  check(
    new Set(stageIds).size === stageIds.length,
    "stages",
    "Each stage may appear only once",
  );
  check(
    stageIds.length === SCENARIO_STAGE_ORDER.length,
    "stages",
    `Expected ${SCENARIO_STAGE_ORDER.length} stages, found ${stageIds.length}`,
  );
  check(
    stageIds.every((stageId, index) => stageId === SCENARIO_STAGE_ORDER[index]),
    "stages",
    "Stage order must match SCENARIO_STAGE_ORDER, which the state codec encodes positionally",
  );

  const knownAssetIds = new Set<string>(seedAssetIds);
  for (const seed of scenario.seedTransactions) {
    const command = seed.command as { assetId?: string; outputAssetId?: string };
    if (command.assetId !== undefined) knownAssetIds.add(command.assetId);
    if (command.outputAssetId !== undefined) knownAssetIds.add(command.outputAssetId);
  }
  /*
   * Assets a learner creates during play are legitimate condition targets, but
   * only where some stage declares that it produces them. A condition's own
   * target is deliberately NOT treated as evidence the asset exists -- that
   * would make the check vacuous, which is exactly what it did before.
   */
  for (const stage of scenario.stages) {
    for (const assetId of stage.producesAssetIds ?? []) {
      knownAssetIds.add(assetId);
    }
  }

  for (const stage of scenario.stages) {
    const path = `stages.${stage.stageId}`;

    check(stage.titleKey.length > 0, path, "Must have a title key");
    check(stage.instructionKey.length > 0, path, "Must have an instruction key");
    check(stage.activeActorIds.length > 0, path, "Must declare at least one active actor");

    for (const actorId of stage.activeActorIds) {
      check(actorIds.has(actorId), path, `Active actor "${actorId}" is not defined`);
    }

    check(
      stage.completionConditions.length > 0,
      path,
      "Must declare at least one completion condition, or the stage can never be finished",
      stage.isImplemented ? "ERROR" : "WARNING",
    );

    for (const condition of stage.completionConditions) {
      if (
        condition.conditionType === "ASSET_EXISTS" &&
        !knownAssetIds.has(condition.assetId)
      ) {
        error(path, `Completion condition references unknown asset "${condition.assetId}"`);
      }
      if (
        condition.conditionType === "KNOWLEDGE_CHECK_ANSWERED" &&
        !stage.knowledgeChecks.some((c) => c.knowledgeCheckId === condition.knowledgeCheckId)
      ) {
        error(
          path,
          `Completion condition references knowledge check "${condition.knowledgeCheckId}", ` +
            "which this stage does not define",
        );
      }
    }

    for (const action of stage.requiredActions) {
      if (
        action.knowledgeCheckId !== undefined &&
        !stage.knowledgeChecks.some((c) => c.knowledgeCheckId === action.knowledgeCheckId)
      ) {
        error(path, `Required action references unknown knowledge check "${action.knowledgeCheckId}"`);
      }
    }

    for (const assetId of stage.producesAssetIds ?? []) {
      check(
        !seedAssetIds.has(assetId),
        path,
        `Declares it produces "${assetId}", but that asset is already seeded`,
      );
    }

    if (stage.unlocksStageId !== undefined) {
      check(
        stageIds.includes(stage.unlocksStageId),
        path,
        `Unlocks unknown stage "${stage.unlocksStageId}"`,
      );
    }
  }

  // ---- Knowledge checks and the codec key ------------------------------

  const knowledgeChecks = allKnowledgeChecks(scenario);
  const knowledgeCheckIds = knowledgeChecks.map((c) => c.knowledgeCheckId);
  const decisionIdSet = new Set(scenario.decisionIds);
  const hintIdSet = new Set(scenario.hintIds);

  check(
    new Set(knowledgeCheckIds).size === knowledgeCheckIds.length,
    "knowledgeChecks",
    "Knowledge check identifiers must be unique across all stages",
  );
  check(
    decisionIdSet.size === scenario.decisionIds.length,
    "decisionIds",
    "Decision identifiers must be unique; the codec stores them positionally",
  );
  check(
    hintIdSet.size === scenario.hintIds.length,
    "hintIds",
    "Hint identifiers must be unique",
  );

  for (const knowledgeCheck of knowledgeChecks) {
    const path = `knowledgeChecks.${knowledgeCheck.knowledgeCheckId}`;

    // The failure this catches is quiet and nasty: an answer that is collected,
    // scored, and then silently lost on resume.
    check(
      decisionIdSet.has(knowledgeCheck.knowledgeCheckId),
      path,
      "Must appear in decisionIds, or the learner's answer will not be saved",
    );

    check(knowledgeCheck.options.length >= 2, path, "Must offer at least two options");
    check(knowledgeCheck.questionKey.length > 0, path, "Must have a question key");
    check(knowledgeCheck.feedbackKey.length > 0, path, "Must have a feedback key");

    const optionIds = new Set(knowledgeCheck.options.map((option) => option.optionId));
    check(
      optionIds.size === knowledgeCheck.options.length,
      path,
      "Option identifiers must be unique within a check",
    );

    for (const correctId of knowledgeCheck.correctOptionIds) {
      check(optionIds.has(correctId), path, `Correct option "${correctId}" is not among the options`);
    }

    if (knowledgeCheck.checkType === KnowledgeCheckType.SINGLE_CHOICE) {
      check(
        knowledgeCheck.correctOptionIds.length === 1,
        path,
        "A single-choice check must have exactly one correct option",
      );
    }

    if (knowledgeCheck.checkType === KnowledgeCheckType.CLASSIFICATION) {
      const categoryIds = new Set((knowledgeCheck.categories ?? []).map((c) => c.categoryId));
      check(categoryIds.size >= 2, path, "A classification check needs at least two categories");
      for (const option of knowledgeCheck.options) {
        check(
          option.categoryId !== undefined && categoryIds.has(option.categoryId),
          path,
          `Item "${option.optionId}" must be assigned to a declared category`,
        );
      }
    }

    check(
      knowledgeCheck.points >= 0,
      path,
      "Points must not be negative",
    );
    check(
      !knowledgeCheck.isScored || knowledgeCheck.points > 0,
      path,
      "A scored check must be worth more than zero points",
    );
  }

  for (const hint of allHints(scenario)) {
    check(
      hintIdSet.has(hint.hintId),
      `hints.${hint.hintId}`,
      "Must appear in hintIds, or its use will not be saved",
    );
    check(
      hint.penaltyPercent >= 0 && hint.penaltyPercent <= 100,
      `hints.${hint.hintId}`,
      "Penalty must be between 0 and 100 percent",
    );
  }

  /*
   * The reverse direction -- a decision id with no knowledge check -- is not
   * checked. Transaction outcomes and recall selections are decisions without
   * questions, so a warning here would fire on every valid scenario, and a
   * warning that always fires trains people to ignore warnings.
   */

  // ---- Scoring ---------------------------------------------------------

  const scoring = scenario.scoringConfiguration;
  const componentTotal = Object.values(ScoreComponent).reduce(
    (sum, component) => sum + (scoring.componentPoints[component] ?? 0),
    0,
  );

  check(
    componentTotal === scoring.maxScore,
    "scoringConfiguration",
    `Component points total ${componentTotal} but maxScore is ${scoring.maxScore}`,
  );
  check(
    scoring.passingScore > 0 && scoring.passingScore <= scoring.maxScore,
    "scoringConfiguration",
    "Passing score must be within 1..maxScore",
  );

  /*
   * Every component's declared budget must be exactly allocated across the
   * scorable items. Without this, a stage could quietly be worth more or less
   * than the scoring configuration says, and the total would still reach 100 --
   * so nothing else would notice.
   */
  const allocated = new Map<ScoreComponent, number>();
  for (const item of allScorableItems(scenario)) {
    allocated.set(item.scoreComponent, (allocated.get(item.scoreComponent) ?? 0) + item.points);
  }
  for (const component of Object.values(ScoreComponent)) {
    const budget = scoring.componentPoints[component] ?? 0;
    const assigned = allocated.get(component) ?? 0;
    check(
      assigned === budget,
      "scoringConfiguration",
      `${component} allocates ${assigned} points across its items but its budget is ${budget}`,
    );
  }

  const ladder = [
    scoring.firstAttemptCredit,
    scoring.secondAttemptCredit,
    scoring.afterHintCredit,
    scoring.multipleAttemptCredit,
  ];
  check(
    ladder.every((credit) => credit >= 0 && credit <= 1),
    "scoringConfiguration",
    "Every credit fraction must be between 0 and 1",
  );
  check(
    ladder.every((credit, index) => index === 0 || credit <= (ladder[index - 1] as number)),
    "scoringConfiguration",
    "Credit must not increase as attempts accumulate",
  );
  check(
    scoring.minimumProceduralCredit <= scoring.firstAttemptCredit,
    "scoringConfiguration",
    "Minimum procedural credit cannot exceed first-attempt credit",
  );

  // ---- Ledger ----------------------------------------------------------

  check(
    scenario.ledgerConfiguration.maxTransactionsPerBlock >= 1,
    "ledgerConfiguration",
    "A block must hold at least one transaction",
  );

  // ---- Knowledge coverage (section 20.1) -------------------------------

  const scoredComponents = new Set(
    knowledgeChecks.filter((c) => c.isScored).map((c) => c.scoreComponent),
  );
  if (scoredComponents.size < 3) {
    warn(
      "knowledgeChecks",
      `Scored knowledge checks currently cover ${scoredComponents.size} of ` +
        `${Object.values(ScoreComponent).length} score components. Section 20.1 ` +
        "expects one check per required concept; content is still incomplete.",
    );
  }

  return {
    isValid: issues.every((issue) => issue.severity !== "ERROR"),
    issues,
    checkedCount,
  };
}

/** Throwing form, for startup. */
export function assertValidScenario(scenario: ScenarioDefinition): void {
  const result = validateScenario(scenario);
  if (!result.isValid) {
    const errors = result.issues
      .filter((issue) => issue.severity === "ERROR")
      .map((issue) => `  ${issue.path}: ${issue.message}`)
      .join("\n");
    throw new Error(`Scenario "${scenario.scenarioId}" is invalid:\n${errors}`);
  }
}

export { ScenarioStageId };
