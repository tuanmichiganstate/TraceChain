export {
  validateScenarioPack,
  type ScenarioPackValidationIssue,
  type ScenarioPackValidationResult,
} from "../src/platform/scenario-packs/validation";
export { verifyScenarioPackContentHash } from "../src/platform/scenario-packs/publication";
import en from "../src/locales/en.json";
import vi from "../src/locales/vi.json";
import { validateScenarioPack } from "../src/platform/scenario-packs/validation";

export function validateRepositoryScenarioPack(value: unknown) {
  return validateScenarioPack(value, {
    localizationCatalogs: { en, vi },
  });
}
