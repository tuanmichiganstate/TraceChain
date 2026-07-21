/**
 * Which React component renders each stage.
 *
 * This is the *only* thing about a stage that is not data. Everything else --
 * order, title, active role, required actions, completion conditions, hints,
 * knowledge checks, point allocation -- lives in the scenario definition, so a
 * content author changes the activity without touching a component, and a
 * developer adds a stage interface without touching the scenario.
 *
 * A stage marked `isImplemented: true` in the scenario but absent here is a
 * wiring mistake, and `npm run validate:scenario` catches it.
 */

import type { ComponentType } from "react";
import { ScenarioStageId } from "../domain/types/enums";
import { OrientationStage } from "./stages/orientation-stage";
import { CreateBatchStage } from "./stages/create-batch-stage";
import { AnchorCertificateStage } from "./stages/anchor-certificate-stage";
import { ShipAndMonitorStage } from "./stages/ship-and-monitor-stage";
import { ReceiveAndCorrectStage } from "./stages/receive-and-correct-stage";
import { TransformBatchStage } from "./stages/transform-batch-stage";
import { PackageAndDistributeStage } from "./stages/package-and-distribute-stage";
import { VerifyAndTamperStage } from "./stages/verify-and-tamper-stage";
import { RecallAndDebriefStage } from "./stages/recall-and-debrief-stage";

export const STAGE_COMPONENTS: Partial<Record<ScenarioStageId, ComponentType>> = {
  [ScenarioStageId.ORIENTATION]: OrientationStage,
  [ScenarioStageId.CREATE_BATCH]: CreateBatchStage,
  [ScenarioStageId.ANCHOR_CERTIFICATE]: AnchorCertificateStage,
  [ScenarioStageId.SHIP_AND_MONITOR]: ShipAndMonitorStage,
  [ScenarioStageId.RECEIVE_AND_CORRECT]: ReceiveAndCorrectStage,
  [ScenarioStageId.TRANSFORM_BATCH]: TransformBatchStage,
  [ScenarioStageId.PACKAGE_AND_DISTRIBUTE]: PackageAndDistributeStage,
  [ScenarioStageId.VERIFY_AND_TAMPER]: VerifyAndTamperStage,
  [ScenarioStageId.RECALL_AND_DEBRIEF]: RecallAndDebriefStage,
};
