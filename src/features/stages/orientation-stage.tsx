import type { ReactNode } from "react";
import { ScenarioStageId } from "../../domain/types/enums";
import { useScenario } from "../../app/providers/scenario-provider";
import { StageShell } from "../../components/stage-shell";
import { KnowledgeCheckPanel } from "../../components/knowledge-check-panel";
import { SupplyChainDiagram } from "../orientation/supply-chain-diagram";

/**
 * Stage 1. The supply chain, the organizations, and the caveat everything else
 * rests on: a blockchain records who claimed what and when, not whether the
 * claim is true.
 *
 * The question is diagnostic and unscored. Section 8.1 requires that, and it is
 * right to: penalising a starting assumption teaches defensive guessing rather
 * than honest self-assessment.
 */
export function OrientationStage(): ReactNode {
  const { stage } = useScenario();
  const check = stage(ScenarioStageId.ORIENTATION)?.knowledgeChecks[0];

  return (
    <StageShell stageId={ScenarioStageId.ORIENTATION}>
      <section className="card">
        <SupplyChainDiagram />
      </section>
      {check !== undefined ? <KnowledgeCheckPanel check={check} /> : null}
    </StageShell>
  );
}
