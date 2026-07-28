import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import type {
  ScenarioPackComparisonV1,
  ScenarioPackValidationReportV1,
  ScenarioPreviewNodeV1,
  ScenarioRolePreviewV1,
} from "../contracts/scenario-authoring";
import type {
  HostedRunMode,
  ScenarioDefinitionV1,
  ScenarioPackV1,
} from "../contracts/scenario-pack";
import { modeConfigurationFor } from "../runs/mode-configuration";
import { validateScenarioPack } from "./validation";
import {
  createScenarioEvidenceAssessmentCatalog,
} from "./evidence-assessment-catalog";

export class ScenarioAuthoringError extends Error {
  constructor(
    readonly code:
      | "SCENARIO_NOT_FOUND"
      | "PREVIEW_CONFIGURATION_INVALID"
      | "PACK_COMPARISON_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "ScenarioAuthoringError";
  }
}

export function scenarioPackValidationReport(
  candidate: unknown,
  localizationCatalogs?: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >,
): ScenarioPackValidationReportV1 {
  const result = validateScenarioPack(
    candidate,
    localizationCatalogs === undefined
      ? {}
      : { localizationCatalogs },
  );
  if (!result.isValid) {
    return {
      schemaVersion: "1.0.0",
      valid: false,
      checkedCount: result.checkedCount,
      issues: result.issues,
    };
  }
  return {
    schemaVersion: "1.0.0",
    valid: true,
    checkedCount: result.checkedCount,
    issues: [],
    packId: result.pack.packId,
    version: result.pack.version,
  };
}

function localized(
  localizationKey: string,
  locale: string,
  catalogs: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >,
): string {
  const value = catalogs[locale]?.[localizationKey];
  if (typeof value !== "string" || value.length === 0) {
    throw new ScenarioAuthoringError(
      "PREVIEW_CONFIGURATION_INVALID",
      `Preview localization ${localizationKey} is missing for ${locale}.`,
    );
  }
  return value;
}

function reachableNodes(
  scenario: ScenarioDefinitionV1,
): readonly ScenarioDefinitionV1["nodes"][number][] {
  const byId = new Map(
    scenario.nodes.map((node) => [node.nodeId, node]),
  );
  const queued = [scenario.entryNodeId];
  const visited = new Set<string>();
  const result: ScenarioDefinitionV1["nodes"][number][] = [];
  while (queued.length > 0) {
    const nodeId = queued.shift();
    if (nodeId === undefined || visited.has(nodeId)) continue;
    visited.add(nodeId);
    const node = byId.get(nodeId);
    if (node === undefined) continue;
    result.push(node);
    queued.push(
      ...node.transitions.map((transition) => transition.toNodeId),
    );
  }
  return result;
}

export function createScenarioRolePreview(options: {
  readonly pack: ScenarioPackV1;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly locale: string;
  readonly mode: HostedRunMode;
  readonly roleId: string;
  readonly localizationCatalogs: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
}): ScenarioRolePreviewV1 {
  const localizationCatalogs = Object.fromEntries(
    options.pack.supportedLocales.map((locale) => [
      locale,
      {
        ...(options.localizationCatalogs[locale] ?? {}),
        ...(options.pack.localizationCatalogs?.[locale] ?? {}),
      },
    ]),
  );
  const scenario = options.pack.scenarios.find(
    (candidate) =>
      candidate.scenarioId === options.scenarioId &&
      candidate.version === options.scenarioVersion,
  );
  if (scenario === undefined) {
    throw new ScenarioAuthoringError(
      "SCENARIO_NOT_FOUND",
      "Scenario preview requires one exact scenario version.",
    );
  }
  if (
    !options.pack.supportedLocales.includes(options.locale) ||
    !scenario.roles.some((role) => role.roleId === options.roleId)
  ) {
    throw new ScenarioAuthoringError(
      "PREVIEW_CONFIGURATION_INVALID",
      "Preview locale or role is not defined by the scenario pack.",
    );
  }
  const modeConfiguration = modeConfigurationFor(
    scenario,
    options.mode,
  );
  const evidenceById = new Map(
    scenario.evidenceItems.map((evidence) => [
      evidence.evidenceId,
      evidence,
    ]),
  );
  const nodes: ScenarioPreviewNodeV1[] = reachableNodes(scenario).map(
    (node) => ({
      nodeId: node.nodeId,
      nodeType: node.nodeType,
      title: localized(
        node.title.localizationKey,
        options.locale,
        localizationCatalogs,
      ),
      visibleEvidenceIds:
        node.nodeType === "EVIDENCE_RELEASE"
          ? node.evidenceIds.filter((evidenceId) =>
              evidenceById
                .get(evidenceId)
                ?.visibleToRoleIds.includes(options.roleId),
            )
          : [],
      transitionNodeIds: node.transitions.map(
        (transition) => transition.toNodeId,
      ),
    }),
  );
  const evidenceCatalog =
    createScenarioEvidenceAssessmentCatalog({
      pack: options.pack,
      scenarioId: scenario.scenarioId,
      scenarioVersion: scenario.version,
      localizationCatalogs: options.localizationCatalogs,
      visibleToRoleId: options.roleId,
    });
  return {
    schemaVersion: "2.0.0",
    packId: options.pack.packId,
    packVersion: options.pack.version,
    scenarioId: scenario.scenarioId,
    scenarioVersion: scenario.version,
    locale: options.locale,
    mode: options.mode,
    roleId: options.roleId,
    scenarioTitle: localized(
      scenario.title.localizationKey,
      options.locale,
      localizationCatalogs,
    ),
    modeConfiguration: {
      allowHints: modeConfiguration.allowHints,
      allowRetry: modeConfiguration.allowRetry,
      allowBacktracking: modeConfiguration.allowBacktracking,
      feedbackTiming: modeConfiguration.feedbackTiming,
      showScores: modeConfiguration.showScores,
      outcomeStrategy: modeConfiguration.outcomeStrategy,
      seedPolicy: modeConfiguration.seedPolicy,
      ...(modeConfiguration.timeLimitMinutes === undefined
        ? {}
        : {
            timeLimitMinutes:
              modeConfiguration.timeLimitMinutes,
          }),
      allowCommunication: modeConfiguration.allowCommunication,
      allowEvidenceRequests:
        modeConfiguration.allowEvidenceRequests,
    },
    nodes,
    evidenceDefinitions: evidenceCatalog.evidenceDefinitions,
  };
}

function flatten(
  value: unknown,
  path: string,
  target: Map<string, string>,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      flatten(item, `${path}[${String(index)}]`, target),
    );
    if (value.length === 0) target.set(path, "[]");
    return;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    entries.forEach(([key, nested]) =>
      flatten(nested, path.length === 0 ? key : `${path}.${key}`, target),
    );
    if (entries.length === 0) target.set(path, "{}");
    return;
  }
  target.set(path, canonicalize(value));
}

export function compareScenarioPackVersions(
  from: ScenarioPackV1,
  to: ScenarioPackV1,
): ScenarioPackComparisonV1 {
  if (
    from.packId !== to.packId ||
    from.version === to.version
  ) {
    throw new ScenarioAuthoringError(
      "PACK_COMPARISON_INVALID",
      "Version comparison requires two different versions of one pack.",
    );
  }
  const fromPaths = new Map<string, string>();
  const toPaths = new Map<string, string>();
  flatten(from, "", fromPaths);
  flatten(to, "", toPaths);
  const addedPaths = [...toPaths.keys()]
    .filter((path) => !fromPaths.has(path))
    .sort();
  const removedPaths = [...fromPaths.keys()]
    .filter((path) => !toPaths.has(path))
    .sort();
  const changedPaths = [...fromPaths.keys()]
    .filter(
      (path) =>
        toPaths.has(path) &&
        fromPaths.get(path) !== toPaths.get(path),
    )
    .sort();
  return {
    schemaVersion: "1.0.0",
    packId: from.packId,
    fromVersion: from.version,
    toVersion: to.version,
    fromStatus: from.status,
    toStatus: to.status,
    addedPaths,
    removedPaths,
    changedPaths,
  };
}
