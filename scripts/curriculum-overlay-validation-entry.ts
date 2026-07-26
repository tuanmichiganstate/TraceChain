import en from "../src/locales/en.json";
import vi from "../src/locales/vi.json";
import {
  curriculumOverlayCompatibilityIssues,
  validateCurriculumOverlay,
} from "../src/platform/curriculum-overlays/validation";
import { validateScenarioPack } from "../src/platform/scenario-packs/validation";

export {
  curriculumOverlayCompatibilityIssues,
  validateCurriculumOverlay,
};

export function validateRepositoryScenarioPack(value: unknown) {
  return validateScenarioPack(value, {
    localizationCatalogs: { en, vi },
  });
}
