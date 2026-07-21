/**
 * Which React component renders each stage.
 *
 * This is the *only* thing about a stage that is not data. Everything else --
 * order, title, active role, required actions, completion conditions, hints,
 * knowledge checks -- lives in the scenario definition, so a content author
 * changes the activity without touching a component, and a developer adds a
 * stage interface without touching the scenario.
 *
 * A stage marked `isImplemented: true` in the scenario but absent here is a
 * wiring mistake, and a test asserts the two agree.
 */

import type { ComponentType } from "react";
import { ScenarioStageId } from "../domain/types/enums";
import { OrientationStage } from "./orientation/orientation-stage";
import { CreateBatchStage } from "./transactions/create-batch-stage";

export const STAGE_COMPONENTS: Partial<Record<ScenarioStageId, ComponentType>> = {
  [ScenarioStageId.ORIENTATION]: OrientationStage,
  [ScenarioStageId.CREATE_BATCH]: CreateBatchStage,
};
