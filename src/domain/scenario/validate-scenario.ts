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
  const actorsById = new Map(scenario.actors.map((actor) => [actor.actorId, actor]));

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

  // ---- Fictional staff and local portrait media ------------------------

  const portraitAssetIds = new Set(
    scenario.portraitAssets.map((asset) => asset.assetId),
  );
  const staffProfileIds = new Set(
    scenario.staffProfiles.map((profile) => profile.staffProfileId),
  );
  check(
    portraitAssetIds.size === scenario.portraitAssets.length,
    "portraitAssets",
    "Portrait asset identifiers must be unique",
  );
  check(
    staffProfileIds.size === scenario.staffProfiles.length,
    "staffProfiles",
    "Staff-profile identifiers must be unique",
  );

  for (const asset of scenario.portraitAssets) {
    const path = `portraitAssets.${asset.assetId}`;
    check(asset.assetId.startsWith("PORTRAIT_"), path, "Must use the PORTRAIT_ prefix");
    check(
      asset.sourceType === "AI_GENERATED" ||
        asset.sourceType === "LICENSED_STOCK" ||
        asset.sourceType === "ORIGINAL_WITH_RELEASE",
      path,
      "Portrait must use an approved source type",
    );
    check(asset.fictionalSubject, path, "Portrait subject must be declared fictional");
    check(!asset.developmentPlaceholder, path, "Release scenarios cannot use placeholders");
    check(asset.format === "webp", path, "Runtime portraits must use WebP");
    check(asset.width >= 320 && asset.height >= 400, path, "Portrait dimensions are too small");
    check(/^[a-f0-9]{64}$/u.test(asset.sha256), path, "Must contain a SHA-256 digest");
    check(
      asset.filePath.startsWith("media/staff/") &&
        !asset.filePath.includes("..") &&
        !asset.filePath.includes("\\") &&
        !/^[a-z][a-z0-9+.-]*:/iu.test(asset.filePath),
      path,
      "Portrait path must be a safe local media/staff path",
    );
    check(
      asset.licenseOrApprovalReference.length > 0,
      path,
      "Portrait must have an approval or license reference",
    );
  }

  for (const profile of scenario.staffProfiles) {
    const path = `staffProfiles.${profile.staffProfileId}`;
    const actor = actorsById.get(profile.actorId);
    check(profile.staffProfileId.startsWith("STAFF_"), path, "Must use the STAFF_ prefix");
    check(profile.fictional, path, "Staff profiles must be declared fictional");
    check(
      profile.visibility === "LEARNER_VISIBLE" ||
        profile.visibility === "INSTRUCTOR_ONLY",
      path,
      "Staff profile visibility is invalid",
    );
    check(actor !== undefined, path, `References unknown actor "${profile.actorId}"`);
    check(
      organizationIds.has(profile.organizationId),
      path,
      `References unknown organization "${profile.organizationId}"`,
    );
    check(
      actor?.organizationId === profile.organizationId,
      path,
      "Profile actor must belong to its organization",
    );
    check(
      actor?.actorRole === profile.roleId,
      path,
      "Profile role must match the declared actor role",
    );
    check(
      profile.locationId === undefined || locationIds.has(profile.locationId),
      path,
      `References unknown location "${profile.locationId ?? ""}"`,
    );
    check(
      portraitAssetIds.has(profile.portraitAssetId),
      path,
      `References unknown portrait "${profile.portraitAssetId}"`,
    );
    for (const [field, key] of Object.entries({
      displayNameKey: profile.displayNameKey,
      roleTitleKey: profile.roleTitleKey,
      portraitAltKey: profile.portraitAltKey,
      departmentKey: profile.departmentKey,
      shortProfileKey: profile.shortProfileKey,
      professionalResponsibilityKey: profile.professionalResponsibilityKey,
    })) {
      check(
        key === undefined || key.length > 0,
        `${path}.${field}`,
        "Localization key cannot be empty",
      );
    }
  }

  for (const attribution of scenario.evidenceStaffAttributions) {
    const path = `evidenceStaffAttributions.${attribution.evidenceId}`;
    check(attribution.evidenceId.length > 0, path, "Evidence identifier cannot be empty");
    check(
      staffProfileIds.has(attribution.staffProfileId),
      path,
      `References unknown staff profile "${attribution.staffProfileId}"`,
    );
    check(
      attribution.occurredAt === undefined ||
        Number.isFinite(Date.parse(attribution.occurredAt)),
      path,
      "Evidence attribution time must be a valid ISO instant",
    );
  }

  // ---- Trusted execution contexts -------------------------------------

  const trustedContextIds = new Set(
    scenario.runtime.trustedContexts.map((context) => context.contextId),
  );
  check(
    trustedContextIds.size === scenario.runtime.trustedContexts.length,
    "runtime.trustedContexts",
    "Trusted-context identifiers must be unique",
  );

  for (const context of scenario.runtime.trustedContexts) {
    const path = `runtime.trustedContexts.${context.contextId}`;
    const actor = actorsById.get(context.actorId);
    check(actor !== undefined, path, `References unknown actor "${context.actorId}"`);
    check(
      organizationIds.has(context.organizationId),
      path,
      `References unknown organization "${context.organizationId}"`,
    );
    check(
      actor?.organizationId === context.organizationId,
      path,
      "Trusted-context actor must belong to its organization",
    );
    check(
      actor?.actorRole === context.roleId,
      path,
      "Trusted-context role must match the declared actor role",
    );
  }

  for (const stageId of SCENARIO_STAGE_ORDER) {
    const contextId = scenario.runtime.initialContextByStage[stageId];
    check(
      typeof contextId === "string" && trustedContextIds.has(contextId),
      `runtime.initialContextByStage.${stageId}`,
      `Must name a defined trusted context, found "${contextId ?? ""}"`,
    );
  }

  const handoffIds = new Set(scenario.runtime.roleHandoffs.map((handoff) => handoff.handoffId));
  check(
    handoffIds.size === scenario.runtime.roleHandoffs.length,
    "runtime.roleHandoffs",
    "Role-handoff identifiers must be unique",
  );
  for (const handoff of scenario.runtime.roleHandoffs) {
    const path = `runtime.roleHandoffs.${handoff.handoffId}`;
    check(
      SCENARIO_STAGE_ORDER.includes(handoff.stageId),
      path,
      `References unknown stage "${handoff.stageId}"`,
    );
    check(
      trustedContextIds.has(handoff.fromContextId),
      path,
      `References unknown source context "${handoff.fromContextId}"`,
    );
    check(
      trustedContextIds.has(handoff.toContextId),
      path,
      `References unknown target context "${handoff.toContextId}"`,
    );
    check(
      handoff.fromContextId !== handoff.toContextId,
      path,
      "A role handoff must change the trusted context",
    );
    check(handoff.labelKey.length > 0, path, "A role handoff must have a label key");
  }

  const commandActions = Object.keys(scenario.runtime.commandContextByAction);
  const templateActions = Object.keys(scenario.runtime.learnerCommandTemplates);
  check(
    commandActions.length === new Set(commandActions).size,
    "runtime.commandContextByAction",
    "Command action identifiers must be unique",
  );
  check(
    templateActions.length === new Set(templateActions).size,
    "runtime.learnerCommandTemplates",
    "Command-template action identifiers must be unique",
  );
  for (const actionId of commandActions) {
    const contextId = scenario.runtime.commandContextByAction[actionId] as string;
    check(
      trustedContextIds.has(contextId),
      `runtime.commandContextByAction.${actionId}`,
      `References unknown trusted context "${contextId}"`,
    );
    check(
      scenario.runtime.learnerCommandTemplates[actionId] !== undefined,
      `runtime.commandContextByAction.${actionId}`,
      "Has no matching learner command template",
    );
  }
  for (const actionId of templateActions) {
    const command = scenario.runtime.learnerCommandTemplates[actionId];
    check(
      scenario.runtime.commandContextByAction[actionId] !== undefined,
      `runtime.learnerCommandTemplates.${actionId}`,
      "Has no matching scenario-controlled command context",
    );
    check(
      command !== undefined &&
        typeof command.scenarioTimestamp === "string" &&
        Number.isFinite(Date.parse(command.scenarioTimestamp)),
      `runtime.learnerCommandTemplates.${actionId}`,
      "Must carry a valid scenario timestamp",
    );
  }
  for (const [actionId, command] of Object.entries(
    scenario.runtime.mitigationCommandTemplates ?? {},
  )) {
    check(
      scenario.runtime.learnerCommandTemplates[actionId] !== undefined,
      `runtime.mitigationCommandTemplates.${actionId}`,
      "Has no matching initial command template",
    );
    check(
      typeof command.scenarioTimestamp === "string" &&
        Number.isFinite(Date.parse(command.scenarioTimestamp)),
      `runtime.mitigationCommandTemplates.${actionId}`,
      "Must carry a valid scenario timestamp",
    );
  }

  const journalLimits = scenario.runtime.journalLimits;
  check(
    ["VALID", "EXPIRED", "CONTENT_INVALID"].includes(
      scenario.runtime.consequentialCases.certificate.certificateAssessment,
    ),
    "runtime.consequentialCases.certificate.certificateAssessment",
    "Must use an authored certificate assessment code",
  );
  check(
    [
      "RECOGNIZED_AUTHORIZED",
      "RECOGNIZED_UNAUTHORIZED",
      "UNRECOGNIZED",
    ].includes(scenario.runtime.consequentialCases.certificate.issuerAssessment),
    "runtime.consequentialCases.certificate.issuerAssessment",
    "Must use an authored issuer assessment code",
  );
  check(
    [
      "TYPING_ERROR",
      "UNIT_MISMATCH",
      "PHYSICAL_LOSS",
      "FRAUD",
      "UNKNOWN",
    ].includes(scenario.runtime.consequentialCases.discrepancy.authoredCauseCode),
    "runtime.consequentialCases.discrepancy.authoredCauseCode",
    "Must use an authored discrepancy cause code",
  );
  check(
    scenario.runtime.consequentialCases.discrepancy.reasonSuggestionKey
      .length > 0,
    "runtime.consequentialCases.discrepancy.reasonSuggestionKey",
    "Must name a localized correction-reason suggestion",
  );
  for (const [name, value] of Object.entries(journalLimits)) {
    check(
      Number.isInteger(value) && value >= 0,
      `runtime.journalLimits.${name}`,
      "Journal limits must be non-negative integers",
    );
  }
  check(
    journalLimits.maximumStage3Mitigations <= 3,
    "runtime.journalLimits.maximumStage3Mitigations",
    "Stage 3 mitigation count must remain within the authored TC3 budget",
  );
  check(
    journalLimits.maximumStage5Mitigations <= 2,
    "runtime.journalLimits.maximumStage5Mitigations",
    "Stage 5 mitigation count must remain within the authored TC3 budget",
  );
  check(
    journalLimits.maximumStage9Handoffs <= 2,
    "runtime.journalLimits.maximumStage9Handoffs",
    "Stage 9 handoff count must remain within the authored TC3 budget",
  );
  check(
    journalLimits.maximumStage9Resubmissions <= 1,
    "runtime.journalLimits.maximumStage9Resubmissions",
    "Stage 9 resubmission count must remain within the authored TC3 budget",
  );
  check(
    journalLimits.maximumEndorsementHandoffs <= 2,
    "runtime.journalLimits.maximumEndorsementHandoffs",
    "Endorsement handoff count must remain within the authored TC3 budget",
  );
  check(
    journalLimits.maximumEndorsementDeclines <= 2,
    "runtime.journalLimits.maximumEndorsementDeclines",
    "Endorsement decline count must remain within the authored TC3 budget",
  );
  check(
    journalLimits.correctionReasonMaximumUtf8Bytes > 0 &&
      journalLimits.correctionReasonMaximumUtf8Bytes <= 240,
    "runtime.journalLimits.correctionReasonMaximumUtf8Bytes",
    "Correction reasons must have an explicit ceiling of at most 240 UTF-8 bytes",
  );

  const recallStageId = ScenarioStageId.RECALL_AND_DEBRIEF;
  const initialRecallContext =
    scenario.runtime.initialContextByStage[recallStageId];
  const authorizedRecallContext =
    scenario.runtime.commandContextByAction["RECALL_BATCH"];
  if (
    typeof initialRecallContext === "string" &&
    typeof authorizedRecallContext === "string"
  ) {
    check(
      initialRecallContext !== authorizedRecallContext,
      `runtime.initialContextByStage.${recallStageId}`,
      "Stage 9 must begin outside the authorized recall context",
    );

    let frontier = new Set([initialRecallContext]);
    const visited = new Set(frontier);
    for (
      let step = 0;
      step < journalLimits.maximumStage9Handoffs;
      step += 1
    ) {
      const next = new Set<string>();
      for (const contextId of frontier) {
        for (const handoff of scenario.runtime.roleHandoffs) {
          if (
            handoff.stageId === recallStageId &&
            handoff.fromContextId === contextId &&
            !visited.has(handoff.toContextId)
          ) {
            visited.add(handoff.toContextId);
            next.add(handoff.toContextId);
          }
        }
      }
      frontier = next;
    }
    check(
      visited.has(authorizedRecallContext),
      "runtime.roleHandoffs",
      "Stage 9 cannot reach the authorized recall context within its authored handoff limit",
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

  const scriptIds = new Set(scenario.scriptedTransactions.map((script) => script.scriptId));
  check(
    scriptIds.size === scenario.scriptedTransactions.length,
    "scriptedTransactions",
    "Scripted transaction identifiers must be unique",
  );
  for (const script of scenario.scriptedTransactions) {
    const path = `scriptedTransactions.${script.scriptId}`;
    check(actorIds.has(script.actorId), path, `References unknown actor "${script.actorId}"`);
    check(
      organizationIds.has(script.organizationId),
      path,
      `References unknown organization "${script.organizationId}"`,
    );
    check(
      scenario.actors.find((actor) => actor.actorId === script.actorId)?.organizationId ===
        script.organizationId,
      path,
      "Script actor must belong to the proposing organization",
    );
    check(
      Number.isFinite(Date.parse(script.command.scenarioTimestamp)),
      path,
      "Command must carry a valid scenario timestamp",
    );
    check(
      script.idempotencyGuard.kind !== "DOCUMENT_ANCHOR_ABSENT" ||
        (script.command.commandType === "ANCHOR_DOCUMENT" &&
          script.command.documentAnchorId === script.idempotencyGuard.documentAnchorId),
      path,
      "Document idempotency guard must match the scripted anchor command",
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

  for (const [role, assetId] of Object.entries(scenario.runtime.assetRoles)) {
    check(
      knownAssetIds.has(assetId),
      `runtime.assetRoles.${role}`,
      `References asset "${assetId}", which is neither seeded nor produced by a stage`,
    );
  }
  check(
    new Set(Object.values(scenario.runtime.documentRoles)).size ===
      Object.values(scenario.runtime.documentRoles).length,
    "runtime.documentRoles",
    "Document roles must resolve to distinct anchors",
  );

  for (const stage of scenario.stages) {
    const path = `stages.${stage.stageId}`;

    check(stage.titleKey.length > 0, path, "Must have a title key");
    check(stage.instructionKey.length > 0, path, "Must have an instruction key");
    check(stage.activeActorIds.length > 0, path, "Must declare at least one active actor");

    for (const actorId of stage.activeActorIds) {
      check(actorIds.has(actorId), path, `Active actor "${actorId}" is not defined`);
    }
    for (const staffProfileId of stage.staffProfileIds ?? []) {
      check(
        staffProfileIds.has(staffProfileId),
        path,
        `References unknown staff profile "${staffProfileId}"`,
      );
    }

    check(
      stage.completionConditions.length > 0,
      path,
      "Must declare at least one completion condition, or the stage can never be finished",
      stage.isImplemented ? "ERROR" : "WARNING",
    );

    for (const condition of stage.completionConditions) {
      if (
        condition.conditionType === "TRANSACTION_COMMITTED" &&
        condition.evidence !== undefined
      ) {
        check(
          condition.transactionType === "RECORD_CORRECTION" &&
            condition.evidence.kind === "CORRECTION_RECORDED",
          path,
          "Correction completion evidence must be attached to RECORD_CORRECTION",
        );
      }
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
      if (
        condition.conditionType === "DECISION_RECORDED" &&
        !scenario.decisionIds.includes(condition.decisionId)
      ) {
        error(
          path,
          `Completion condition references unknown decision "${condition.decisionId}"`,
        );
      }
    }

    const seenActionDescriptions = new Set<string>();
    for (const action of stage.requiredActions) {
      if (action.transactionEvidence !== undefined) {
        check(
          action.transactionType === "RECORD_CORRECTION" &&
            action.transactionEvidence.kind === "CORRECTION_RECORDED",
          path,
          "Correction action evidence must be attached to RECORD_CORRECTION",
        );
      }
      if (
        action.knowledgeCheckId !== undefined &&
        !stage.knowledgeChecks.some((c) => c.knowledgeCheckId === action.knowledgeCheckId)
      ) {
        error(path, `Required action references unknown knowledge check "${action.knowledgeCheckId}"`);
      }

      // The panel reports whether each listed step is done, which it can only
      // do by asking either "has this transaction been submitted" or "has this
      // check been answered". An action naming neither can never be shown as
      // done; an action naming both would have two answers.
      checkedCount += 1;
      const discriminators =
        (action.transactionType !== undefined ? 1 : 0) +
        (action.knowledgeCheckId !== undefined ? 1 : 0);
      if (discriminators !== 1) {
        error(
          path,
          `Required action "${action.actionId}" must name exactly one of ` +
            `transactionType or knowledgeCheckId (names ${discriminators})`,
        );
      }

      // The outstanding-work panel prints one line per required action, so a
      // description that repeats the stage instruction -- or another action --
      // gives the learner a count of what is left with no way to tell the
      // items apart.
      checkedCount += 2;
      if (action.descriptionKey === stage.instructionKey) {
        error(
          path,
          `Required action "${action.actionId}" describes itself with the stage instruction ` +
            "instead of naming its own step",
        );
      }
      if (seenActionDescriptions.has(action.descriptionKey)) {
        error(
          path,
          `Required action "${action.actionId}" repeats the description of an earlier action ` +
            `("${action.descriptionKey}")`,
        );
      }
      seenActionDescriptions.add(action.descriptionKey);
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
  }

  /*
   * Hint scope. A hint caps exactly the items it names, so an unnamed,
   * duplicated, misspelled or cross-stage target is a scoring bug that would
   * otherwise be invisible: the learner is simply charged for the wrong work.
   * There is deliberately no fallback to "everything in this stage" -- that was
   * the previous behaviour and the reason this scope exists.
   */
  const scorableItems = allScorableItems(scenario);
  const itemsByDecisionId = new Map(scorableItems.map((item) => [item.decisionId, item]));

  for (const stage of scenario.stages) {
    for (const hint of stage.availableHints) {
      const targets = hint.targetScorableItemIds;
      const where = `hints.${hint.hintId}`;

      check(targets.length > 0, where, "Must name at least one scorable item it assists");
      check(
        new Set(targets).size === targets.length,
        where,
        "Must not name the same scorable item twice",
      );

      for (const decisionId of targets) {
        const item = itemsByDecisionId.get(decisionId);
        check(item !== undefined, where, `Targets "${decisionId}", which is not a scorable item`);
        if (item === undefined) continue;

        // Cross-stage targets are prohibited rather than justified: a hint is
        // offered inside one stage, and charging it against work in another
        // would be invisible at the point the learner decides to open it.
        check(
          item.stageId === stage.stageId,
          where,
          `Targets "${decisionId}" in ${item.stageId}, but hints may only cap items in their own stage (${stage.stageId})`,
        );
        check(
          item.nameKey !== undefined,
          where,
          `Targets "${decisionId}", which has no nameKey; the learner is told which activities a hint caps`,
        );
      }
    }
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
