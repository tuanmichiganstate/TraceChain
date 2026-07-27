import type { SimulationFeedbackTiming } from "../config/experience";
import type { ScenarioStageId } from "../domain/types/enums";

/** One disclosure rule shared by knowledge and consequential feedback. */
export function shouldRevealDetailedFeedback(options: {
  readonly timing: SimulationFeedbackTiming;
  readonly stageId: ScenarioStageId | undefined;
  readonly completedStageIds: readonly ScenarioStageId[];
  readonly simulationCompleted: boolean;
}): boolean {
  return (
    options.timing === "immediate" ||
    (options.timing === "stage-end" &&
      options.stageId !== undefined &&
      options.completedStageIds.includes(options.stageId)) ||
    (options.timing === "final" && options.simulationCompleted)
  );
}
