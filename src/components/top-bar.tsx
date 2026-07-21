import type { ReactNode } from "react";
import { SCENARIO_STAGE_ORDER } from "../domain/types/enums";
import { useTranslator } from "../app/providers/locale-provider";
import { useSimulation } from "../app/providers/simulation-provider";
import { stageNumber } from "../app/session/session-state";
import { actorsById, organizationsById } from "../scenarios/coffee-traceability/organizations";
import { STAGE_ACTOR } from "../scenarios/coffee-traceability/stages";
import { StatusPill } from "./status-pill";

const SAVE_STATUS_KEY = {
  IDLE: "status.saved",
  SAVING: "status.saving",
  SAVED: "status.saved",
  FAILED: "status.saveFailed",
} as const;

/**
 * Always-visible context: which role the learner currently holds, how far
 * through they are, and whether their work is saved (specification section
 * 18.2 and 31.4).
 */
export function TopBar(): ReactNode {
  const t = useTranslator();
  const { state } = useSimulation();

  const actorId = STAGE_ACTOR[state.currentStageId];
  const actor = actorId === undefined ? undefined : actorsById[actorId];
  const organization =
    actor === undefined ? undefined : organizationsById[actor.organizationId];

  return (
    <header className="top-bar">
      <div className="top-bar__inner">
        <div className="top-bar__brand">
          <span className="top-bar__title">{t("app.shortTitle")}</span>
          <span className="top-bar__simulation-flag">{t("app.simulationNotice")}</span>
        </div>

        <dl className="top-bar__meta">
          <div className="top-bar__item">
            <dt>{t("workspace.progress")}</dt>
            <dd>
              {t("workspace.progressValue", {
                current: stageNumber(state.currentStageId),
                total: SCENARIO_STAGE_ORDER.length,
              })}
            </dd>
          </div>

          {/*
            The role row is always present, per specification section 31.4.
            Orientation genuinely has no role yet -- the learner is observing,
            not acting -- so it says so explicitly rather than either hiding the
            row or inventing a role the learner has not been given.
          */}
          <div className="top-bar__item">
            <dt>{t("workspace.currentRole")}</dt>
            <dd>
              {actor !== undefined && organization !== undefined
                ? t("workspace.currentRoleValue", {
                    role: t(actor.displayNameKey),
                    organization: t(organization.displayNameKey),
                  })
                : t("workspace.currentRoleObserver")}
            </dd>
          </div>

          <div className="top-bar__item">
            <dt>{t("status.saved")}</dt>
            <dd>
              <StatusPill tone={state.saveStatus === "FAILED" ? "fail" : "pass"}>
                {t(SAVE_STATUS_KEY[state.saveStatus])}
              </StatusPill>
            </dd>
          </div>
        </dl>
      </div>

      <progress
        className="top-bar__progress"
        max={SCENARIO_STAGE_ORDER.length}
        value={state.completedStageIds.length}
      >
        {state.completedStageIds.length} / {SCENARIO_STAGE_ORDER.length}
      </progress>
    </header>
  );
}
