/**
 * Supplies the active scenario.
 *
 * Everything a scenario decides -- stage order, titles, active roles,
 * completion conditions, knowledge checks, hints, seeds, scoring weights --
 * flows from here. Swapping to a different scenario is a change to the prop at
 * the application root and nothing else.
 *
 * The scenario is validated before it is served (specification section 27).
 * A scenario with a stage that can never be completed, or a knowledge check
 * missing from the codec key, fails loudly at startup rather than silently
 * stranding a learner mid-activity.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ScenarioDefinition, ScenarioStageDefinition } from "../../domain/types/scenario";
import { findStage } from "../../domain/types/scenario";
import { validateScenario } from "../../domain/scenario/validate-scenario";
import type { ScenarioStageId } from "../../domain/types/enums";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import { isDeveloperMode } from "../configuration";

interface ScenarioContextValue {
  readonly scenario: ScenarioDefinition;
  stage(stageId: ScenarioStageId): ScenarioStageDefinition | undefined;
}

const ScenarioContext = createContext<ScenarioContextValue | null>(null);

export function ScenarioProvider({
  scenario = coffeeScenario,
  children,
}: {
  scenario?: ScenarioDefinition;
  children: ReactNode;
}): ReactNode {
  const value = useMemo<ScenarioContextValue>(() => {
    const result = validateScenario(scenario);

    if (!result.isValid) {
      const errors = result.issues
        .filter((issue) => issue.severity === "ERROR")
        .map((issue) => `${issue.path}: ${issue.message}`);
      throw new Error(
        `Scenario "${scenario.scenarioId}" failed validation:\n  ${errors.join("\n  ")}`,
      );
    }

    if (isDeveloperMode()) {
      for (const issue of result.issues) {
        console.warn(`[scenario] ${issue.path}: ${issue.message}`);
      }
    }

    return {
      scenario,
      stage: (stageId) => findStage(scenario, stageId),
    };
  }, [scenario]);

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

export function useScenario(): ScenarioContextValue {
  const value = useContext(ScenarioContext);
  if (value === null) {
    throw new Error("useScenario must be used inside a ScenarioProvider");
  }
  return value;
}
