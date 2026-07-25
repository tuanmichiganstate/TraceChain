import type { ScenarioDefinitionV1 } from "../contracts/scenario-pack";

/**
 * One registry predicate controls both assignment creation and its UI.
 *
 * The pharmaceutical starter deliberately validates and previews without
 * claiming a hosted runtime. New runtime adapters must be registered here
 * before instructors can assign their scenarios.
 */
export function hasRegisteredHostedRuntime(
  scenario: ScenarioDefinitionV1,
): boolean {
  return (
    scenario.legacyCompatibility?.adapterId ===
      "tracechain-coffee-v2" &&
    scenario.legacyCompatibility.stageId ===
      "STG_03_ANCHOR_CERTIFICATE"
  );
}
