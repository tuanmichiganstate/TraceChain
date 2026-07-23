/**
 * Typed package-generator surface.
 *
 * Node bundles this file before packaging so the CLI consumes the exact preset,
 * scenario, validation, and hashing code used by the player.
 */

export { LECTURER_PRESETS } from "../src/config/presets";
export { embedConfiguration, hashConfiguration } from "../src/config/hash";
export { validateConfiguration } from "../src/config/validation";
export { validateScenario } from "../src/domain/scenario/validate-scenario";
export { coffeeScenario } from "../src/scenarios/coffee-traceability/scenario";
export { challengeAScenario } from "../src/scenarios/challenge-a/scenario";
