import courseOverlay from "../../../curriculum-overlays/pharmaceutical-pilot-course.overlay.json";
import programOverlay from "../../../curriculum-overlays/pharmaceutical-pilot-program.overlay.json";
import type {
  CurriculumCrosswalkOverlayV2,
} from "../contracts/curriculum-crosswalk";
import { validateCurriculumOverlay } from "./validation";

function validatedOverlay(value: unknown): CurriculumCrosswalkOverlayV2 {
  const result = validateCurriculumOverlay(value);
  if (!result.isValid) {
    throw new Error(
      result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("\n"),
    );
  }
  return result.overlay;
}

export const repositoryCurriculumOverlays:
  readonly CurriculumCrosswalkOverlayV2[] = [
    validatedOverlay(courseOverlay),
    validatedOverlay(programOverlay),
  ];
