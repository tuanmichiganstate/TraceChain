import { describe, expect, it } from "vitest";
import { ScenarioStageId } from "../domain/types/enums";
import { guidancePolicyFor } from "./experience";
import { resolveOperationsStageSupport } from "./operations-support";

describe("Operations support profiles", () => {
  it("fades Guided evidence and policy direction by authored phase", () => {
    const guidance = guidancePolicyFor("GUIDED");

    expect(
      resolveOperationsStageSupport(
        guidance,
        ScenarioStageId.ANCHOR_CERTIFICATE,
      ),
    ).toMatchObject({
      content: { phase: "EARLY" },
      evidenceGuidance: "DIRECT",
      policyGuidance: "DIRECT",
    });
    expect(
      resolveOperationsStageSupport(
        guidance,
        ScenarioStageId.RECEIVE_AND_CORRECT,
      ),
    ).toMatchObject({
      content: { phase: "MIDDLE" },
      evidenceGuidance: "SUGGESTED",
      policyGuidance: "SUGGESTED",
    });
    expect(
      resolveOperationsStageSupport(
        guidance,
        ScenarioStageId.RECALL_AND_DEBRIEF,
      ),
    ).toMatchObject({
      content: { phase: "LATE" },
      evidenceGuidance: "NONE",
      policyGuidance: "NONE",
    });
  });

  it("keeps Practice suggestions available without highlighting them", () => {
    expect(
      resolveOperationsStageSupport(
        guidancePolicyFor("PRACTICE"),
        ScenarioStageId.ANCHOR_CERTIFICATE,
      ),
    ).toMatchObject({
      evidenceGuidance: "SUGGESTED",
      policyGuidance: "SUGGESTED",
    });
    expect(
      resolveOperationsStageSupport(
        guidancePolicyFor("PRACTICE"),
        ScenarioStageId.RECALL_AND_DEBRIEF,
      ),
    ).toMatchObject({
      evidenceGuidance: "SUGGESTED",
      policyGuidance: "SUGGESTED",
    });
  });

  it("does not expose support prompts in Challenge", () => {
    expect(
      resolveOperationsStageSupport(
        guidancePolicyFor("CHALLENGE"),
        ScenarioStageId.ANCHOR_CERTIFICATE,
      ),
    ).toMatchObject({
      evidenceGuidance: "NONE",
      policyGuidance: "NONE",
    });
  });
});
