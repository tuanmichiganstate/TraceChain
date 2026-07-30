import type { ScenarioDefinitionV1 } from "../contracts/scenario-pack";

export type HostedRuntimeKind =
  | "native-coffee-v2"
  | "audit-v1"
  | "technical-lab-v1"
  | "generic-v1";

const GENERIC_V1_NODE_TYPES = new Set([
  "BRIEFING",
  "EVIDENCE_RELEASE",
  "DECISION",
  "TRANSACTION_PROPOSAL",
  "ENDORSEMENT",
  "POLICY_CHECK",
  "COMMUNICATION",
  "STOCHASTIC_EVENT",
  "CONSEQUENCE",
  "FEEDBACK",
  "REFLECTION",
  "COMPLETION",
]);

const GENERIC_V1_TRANSITION_CONDITIONS = new Set([
  "ALWAYS",
  "DECISION_OPTION_SELECTED",
  "POLICY_RESULT",
  "EVENT_OCCURRED",
]);

export function isGenericHostedRuntimeScenario(
  scenario: ScenarioDefinitionV1,
): boolean {
  return (
    scenario.hostedRuntime === undefined &&
    scenario.roles.length > 0 &&
    scenario.nodes.length > 0 &&
    scenario.nodes.every(
      (node) =>
        GENERIC_V1_NODE_TYPES.has(node.nodeType) &&
        node.transitions.every(
          (transition) =>
            GENERIC_V1_TRANSITION_CONDITIONS.has(
              transition.when.kind,
            ),
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
    scenario.hostedRuntime?.runtimeId ===
      "tracechain-technical-lab-v1"
  ) {
    return "technical-lab-v1";
  }
  if (
    scenario.hostedRuntime?.runtimeId ===
      "tracechain-audit-v1" &&
    scenario.auditCase !== undefined &&
    scenario.hostedRuntime.auditCaseId ===
      scenario.auditCase.auditCaseId
  ) {
    return "audit-v1";
  }
  if (
    scenario.hostedRuntime?.runtimeId ===
      "tracechain-coffee-v2" &&
    scenario.hostedRuntime.entryStageId ===
      "STG_03_ANCHOR_CERTIFICATE"
  ) {
    return "native-coffee-v2";
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
