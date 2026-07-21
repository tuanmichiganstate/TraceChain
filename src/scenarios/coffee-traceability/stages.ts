/**
 * Stage metadata for the coffee scenario.
 *
 * Nine stages rather than the specification's ten: the original stages 4 and 5
 * are merged into SHIP_AND_MONITOR, because both are logistics and the custody
 * handoff *is* the moment transport begins. All twelve learning objectives
 * survive; what was cut is repetition, to protect the 30-45 minute budget.
 */

import { ScenarioStageId } from "../../domain/types/enums";
import { ActorId } from "./organizations";

/** The role the learner holds during each stage, shown in the top bar. */
export const STAGE_ACTOR: Readonly<Record<ScenarioStageId, string | undefined>> = {
  [ScenarioStageId.ORIENTATION]: undefined,
  [ScenarioStageId.CREATE_BATCH]: ActorId.PRODUCER_MANAGER,
  [ScenarioStageId.ANCHOR_CERTIFICATE]: ActorId.CERTIFICATION_OFFICER,
  // Begins as the producer transferring custody, then continues as the carrier
  // recording transport conditions. The role switch is scenario-driven.
  [ScenarioStageId.SHIP_AND_MONITOR]: ActorId.PRODUCER_MANAGER,
  [ScenarioStageId.RECEIVE_AND_CORRECT]: ActorId.PROCESSING_MANAGER,
  [ScenarioStageId.TRANSFORM_BATCH]: ActorId.PROCESSING_MANAGER,
  [ScenarioStageId.PACKAGE_AND_DISTRIBUTE]: ActorId.PROCESSING_MANAGER,
  [ScenarioStageId.VERIFY_AND_TAMPER]: ActorId.RETAIL_MANAGER,
  [ScenarioStageId.RECALL_AND_DEBRIEF]: ActorId.REGULATORY_AUDITOR,
};

export const STAGE_TITLE_KEY: Readonly<Record<ScenarioStageId, string>> = {
  [ScenarioStageId.ORIENTATION]: "stage.orientation.title",
  [ScenarioStageId.CREATE_BATCH]: "stage.createBatch.title",
  [ScenarioStageId.ANCHOR_CERTIFICATE]: "stage.anchorCertificate.title",
  [ScenarioStageId.SHIP_AND_MONITOR]: "stage.shipAndMonitor.title",
  [ScenarioStageId.RECEIVE_AND_CORRECT]: "stage.receiveAndCorrect.title",
  [ScenarioStageId.TRANSFORM_BATCH]: "stage.transformBatch.title",
  [ScenarioStageId.PACKAGE_AND_DISTRIBUTE]: "stage.packageAndDistribute.title",
  [ScenarioStageId.VERIFY_AND_TAMPER]: "stage.verifyAndTamper.title",
  [ScenarioStageId.RECALL_AND_DEBRIEF]: "stage.recallAndDebrief.title",
};

/** Stages with a learner interface. The rest arrive in later milestones. */
export const IMPLEMENTED_STAGES: ReadonlySet<ScenarioStageId> = new Set([
  ScenarioStageId.ORIENTATION,
  ScenarioStageId.CREATE_BATCH,
]);
