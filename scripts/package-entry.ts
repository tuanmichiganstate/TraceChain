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
export { validateVariantBank } from "../src/domain/scenario/variant-bank";
export { coffeeScenario } from "../src/scenarios/coffee-traceability/scenario";
export { practiceAScenario } from "../src/scenarios/practice-a/scenario";
export { practiceVariantBank } from "../src/scenarios/practice-a/variant-bank";
export { challengeAScenario } from "../src/scenarios/challenge-a/scenario";
export { challengeBScenario } from "../src/scenarios/challenge-a/challenge-b";
export { challengeCScenario } from "../src/scenarios/challenge-a/challenge-c";
export { challengeVariantBank } from "../src/scenarios/challenge-a/variant-bank";
export { coffeeCryptographicRuntime } from "../src/scenarios/coffee-traceability/cryptographic-runtime";
export { validateCryptographicRuntime } from "../src/crypto/signatures/validation";
export { NobleEd25519Provider } from "../src/crypto/signatures/noble-ed25519-provider";
export { permissionedFoundationsLabBundle } from "../src/technical-lab/permissioned-foundations-pack";
export { technicalLabCryptographicRuntime } from "../src/technical-lab/cryptographic-runtime";
export {
  validateTechnicalLabConfigurationAgainstPack,
  validateTechnicalLabPackBundle,
} from "../src/technical-lab/validation";
export { verifyTechnicalLabContentHash } from "../src/technical-lab/content-hash";
export {
  publishScenarioPack,
} from "../src/platform/scenario-packs/publication";
export {
  validateScenarioPack,
} from "../src/platform/scenario-packs/validation";
export {
  validateAuditVariantBank,
} from "../src/platform/audit/audit-variant-bank";
export { default as guidedAuditPack } from "../scenario-packs/guided-coffee-audit/tracechain.pack.json";
export { default as practiceAuditPack } from "../scenario-packs/practice-coffee-audit/tracechain.pack.json";
export { default as challengeAuditPack } from "../scenario-packs/challenge-coffee-audit/tracechain.pack.json";
