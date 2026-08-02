import standardCoffeePackJson from "../../../scenario-packs/standard-coffee-stage3/tracechain.pack.json";
import guidedAuditPackJson from "../../../scenario-packs/guided-coffee-audit/tracechain.pack.json";
import pharmaceuticalPackJson from "../../../scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json";
import { allScorableItems } from "../../domain/types/scenario";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import {
  permissionedFoundationsLabBundle,
} from "../../technical-lab/permissioned-foundations-pack";
import {
  technicalLabHostedPackAdapter,
} from "../../technical-lab/hosted-pack-adapter";
import type { ScenarioPackV2 } from "../contracts/scenario-pack";
import { projectInstructorScenarioSummary } from "./instructor-summary";

const pack = (value: unknown) => value as ScenarioPackV2;

describe("instructor scenario summary", () => {
  it("summarizes the authored Operations workflow without answer-bearing state", () => {
    const source = pack(standardCoffeePackJson);
    const summary = projectInstructorScenarioSummary(
      source,
      source.scenarios[0]!,
    );

    expect(summary.runtimeKind).toBe("OPERATIONS");
    expect(summary.activity).toEqual({
      kind: "WORKFLOW",
      decisionCount: 12,
      reflectionCount: 0,
      learningStageCount: 9,
    });
    expect(summary.authoredNodeCount).toBe(49);
    expect(summary.competencyTargetCount).toBe(13);
    expect(summary.assessment).toEqual({
      scoredElementCount: allScorableItems(coffeeScenario).length,
      maximumScore: 100,
    });
    expect(summary.requiredResponses).toEqual({
      writtenJustification: true,
      evidenceCitations: true,
      policyCitations: true,
      confidenceRating: true,
      adverseEventProbability: true,
    });
    expect(JSON.stringify(summary)).not.toContain("actualState");
    expect(JSON.stringify(summary)).not.toContain(
      "correctOptionIdsByField",
    );
  });

  it("summarizes the specialized Audit workbench instead of its two-node wrapper", () => {
    const source = pack(guidedAuditPackJson);
    const summary = projectInstructorScenarioSummary(
      source,
      source.scenarios[0]!,
    );

    expect(summary.runtimeKind).toBe("AUDIT");
    expect(summary.authoredNodeCount).toBe(2);
    expect(summary.activity).toEqual({
      kind: "AUDIT",
      sourceRecordCount: 7,
      maximumFindingCount: 4,
      conclusionRequired: true,
    });
    expect(summary.assessment).toEqual({
      scoredElementCount: 7,
      maximumScore: 100,
    });
  });

  it("summarizes the seven real Technical Laboratory modules", () => {
    const summary = projectInstructorScenarioSummary(
      technicalLabHostedPackAdapter,
      technicalLabHostedPackAdapter.scenarios[0]!,
      {
        technicalLabModuleCount:
          permissionedFoundationsLabBundle.modules.length,
        technicalLabMaximumScore:
          permissionedFoundationsLabBundle.pack.scoringContract
            .maximumScore,
      },
    );

    expect(summary.runtimeKind).toBe("TECHNICAL_LAB");
    expect(summary.activity).toEqual({
      kind: "TECHNICAL_LAB",
      moduleCount: 7,
    });
    expect(summary.assessment).toEqual({
      scoredElementCount: 7,
      maximumScore: 100,
    });
  });

  it("reports the exact structured response required by the starter case", () => {
    const source = pack(pharmaceuticalPackJson);
    const summary = projectInstructorScenarioSummary(
      source,
      source.scenarios[0]!,
    );

    expect(summary.runtimeKind).toBe("GENERIC");
    expect(summary.requiredResponses).toEqual({
      writtenJustification: true,
      evidenceCitations: true,
      policyCitations: true,
      confidenceRating: true,
      adverseEventProbability: true,
    });
    expect(summary.learnerVisibleStaffCount).toBe(1);
    expect(summary.referencedImageCount).toBe(2);
  });
});
