import type { ReactNode } from "react";
import { useTranslator } from "../app/providers/locale-provider";
import { useScenario } from "../app/providers/scenario-provider";
import { useSimulation } from "../app/providers/simulation-provider";
import { StatusPill } from "./status-pill";

const SAVE_STATUS_KEY = {
  IDLE: "status.saved",
  SAVING: "status.saving",
  SAVED: "status.saved",
  FAILED: "status.saveFailed",
} as const;

/**
 * Always-visible context: which role the learner currently holds, how far
 * through they are, and whether their work is saved (specification sections
 * 18.2 and 31.4).
 *
 * Everything shown here is read from the scenario definition, so a new scenario
 * with different stages and roles needs no change to this component.
 */
export function TopBar(): ReactNode {
  const t = useTranslator();
  const { state, scoreBreakdown } = useSimulation();
  const { scenario, stage } = useScenario();

  // The stage on screen, not the furthest one unlocked. Progression is derived,
  // so the moment a learner satisfies a stage's last condition the furthest
  // stage jumps forward while they are still reading the feedback that explains
  // their answer. Following that here would announce the next stage's number
  // and role over the screen they are still on.
  const definition = stage(state.viewedStageId);
  const stageNumber = scenario.stages.findIndex((s) => s.stageId === state.viewedStageId) + 1;

  // The first entry is the role the learner starts the stage in. Stages 4 and 7
  // hand over to a second role partway through.
  const activeActorId = definition?.activeActorIds[0];
  const actor = scenario.actors.find((candidate) => candidate.actorId === activeActorId);
  const organization = scenario.organizations.find(
    (candidate) => candidate.organizationId === actor?.organizationId,
  );

  // Orientation genuinely has no role: the learner is observing, not acting.
  const isObserving = definition?.stageId === scenario.stages[0]?.stageId;

  return (
    <header className="top-bar">
      <div className="top-bar__inner">
        <div className="top-bar__brand">
          {/* The workspace's h1. Without it the running activity opened at
              h2, so navigating by heading landed inside a stage with nothing
              above it naming what you were in. */}
          <h1 className="top-bar__title">{t("app.shortTitle")}</h1>
          <span className="top-bar__simulation-flag">{t("app.simulationNotice")}</span>
        </div>

        <dl className="top-bar__meta">
          <div className="top-bar__item top-bar__item--progress">
            <dt>{t("workspace.progress")}</dt>
            <dd>
              {t("workspace.progressValue", {
                current: stageNumber,
                total: scenario.stages.length,
              })}
            </dd>
          </div>

          {/* Always present, per specification section 31.4. */}
          <div className="top-bar__item top-bar__item--role">
            <dt>{t("workspace.currentRole")}</dt>
            <dd>
              {!isObserving && actor !== undefined && organization !== undefined
                ? t("workspace.currentRoleValue", {
                    role: t(actor.displayNameKey),
                    organization: t(organization.displayNameKey),
                  })
                : t("workspace.currentRoleObserver")}
            </dd>
          </div>

          <div className="top-bar__item top-bar__item--score">
            <dt>{t("workspace.score")}</dt>
            <dd>
              {scoreBreakdown.score.totalScore} / {scoreBreakdown.score.maxScore}
            </dd>
          </div>

          {/* A read-only attempt saves nothing, and the adapter reports success
              precisely because it wrote nothing. Showing "saved" here would be
              the one claim a learner in review mode must not be given. */}
          {state.isReadOnly ? null : (
            <div className="top-bar__item top-bar__item--save">
              <dt>{t("status.saved")}</dt>
              <dd>
                <StatusPill tone={state.saveStatus === "FAILED" ? "fail" : "pass"}>
                  {t(SAVE_STATUS_KEY[state.saveStatus])}
                </StatusPill>
              </dd>
            </div>
          )}
        </dl>
      </div>

      <progress
        className="top-bar__progress"
        max={scenario.stages.length}
        value={state.completedStageIds.length}
      >
        {state.completedStageIds.length} / {scenario.stages.length}
      </progress>
    </header>
  );
}
