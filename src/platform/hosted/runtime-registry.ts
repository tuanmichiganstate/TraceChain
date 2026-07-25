import type { ScenarioDefinitionV1 } from "../contracts/scenario-pack";

export type HostedRuntimeKind = "coffee-v2" | "generic-v1";

const GENERIC_V1_NODE_TYPES = new Set([
  "BRIEFING",
  "EVIDENCE_RELEASE",
  "DECISION",
  "CONSEQUENCE",
  "FEEDBACK",
  "COMPLETION",
]);

export function isGenericHostedRuntimeScenario(
  scenario: ScenarioDefinitionV1,
): boolean {
  return (
    scenario.legacyCompatibility === undefined &&
    scenario.roles.length > 0 &&
    scenario.nodes.length > 0 &&
    scenario.nodes.every(
      (node) =>
        GENERIC_V1_NODE_TYPES.has(node.nodeType) &&
        node.transitions.every(
          (transition) =>
            transition.when.kind === "ALWAYS" ||
            transition.when.kind ===
              "DECISION_OPTION_SELECTED",
        ),
    )
  );
}

/**
 * One registry predicate controls both assignment creation and its UI.
 */
export function hostedRuntimeKindFor(
  scenario: ScenarioDefinitionV1,
): HostedRuntimeKind | null {
  if (
    scenario.legacyCompatibility?.adapterId ===
      "tracechain-coffee-v2" &&
    scenario.legacyCompatibility.stageId ===
      "STG_03_ANCHOR_CERTIFICATE"
  ) {
    return "coffee-v2";
  }
  if (isGenericHostedRuntimeScenario(scenario)) {
    return "generic-v1";
  }
  return null;
}

export function hasRegisteredHostedRuntime(
  scenario: ScenarioDefinitionV1,
): boolean {
  return hostedRuntimeKindFor(scenario) !== null;
}
