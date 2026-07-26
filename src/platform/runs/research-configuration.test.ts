import { describe, expect, it } from "vitest";
import type {
  HostedRunModeConfigurationV1,
} from "../contracts/scenario-pack";
import {
  validateAssignmentResearchConfiguration,
} from "./research-configuration";

const suppliedMode: HostedRunModeConfigurationV1 = {
  mode: "standard",
  allowHints: false,
  allowRetry: false,
  allowBacktracking: false,
  feedbackTiming: "final",
  showScores: false,
  outcomeStrategy: "forced",
  seedPolicy: "supplied",
  allowCommunication: false,
  allowEvidenceRequests: true,
};

describe("assignment research configuration", () => {
  it("resolves the bounded controlled-study metadata", () => {
    expect(
      validateAssignmentResearchConfiguration(
        {
          enabled: true,
          experimentalConditionId: "CONDITION_GUIDED",
          randomAssignmentRecordId: "RANDOMIZATION_001",
          fixedScenarioSeed: "SEED_RESEARCH_001",
          consentStatusReference: "CONSENT_LEDGER_001",
          preTestLinkageId: "PRETEST_001",
          postTestLinkageId: "POSTTEST_001",
          blindedRaters: true,
          interventionVersion: "1.0.0",
          retentionPolicyReference: "RETENTION_POLICY_001",
        },
        suppliedMode,
      ),
    ).toEqual({
      enabled: true,
      experimentalConditionId: "CONDITION_GUIDED",
      randomAssignmentRecordId: "RANDOMIZATION_001",
      fixedScenarioSeed: "SEED_RESEARCH_001",
      consentStatusReference: "CONSENT_LEDGER_001",
      preTestLinkageId: "PRETEST_001",
      postTestLinkageId: "POSTTEST_001",
      blindedRaters: true,
      interventionVersion: "1.0.0",
      retentionPolicyReference: "RETENTION_POLICY_001",
    });
  });

  it("requires a supplied-seed scenario mode", () => {
    expect(() =>
      validateAssignmentResearchConfiguration(
        {
          enabled: true,
          experimentalConditionId: "CONDITION_GUIDED",
          randomAssignmentRecordId: "RANDOMIZATION_001",
          fixedScenarioSeed: "SEED_RESEARCH_001",
          consentStatusReference: "CONSENT_LEDGER_001",
          blindedRaters: false,
          interventionVersion: "1.0.0",
          retentionPolicyReference: "RETENTION_POLICY_001",
        },
        {
          ...suppliedMode,
          seedPolicy: "generated",
        },
      ),
    ).toThrow("supplied-seed");
  });

  it("does not preserve metadata when research is disabled", () => {
    expect(() =>
      validateAssignmentResearchConfiguration(
        {
          enabled: false,
          experimentalConditionId: "STALE_CONDITION",
        },
        suppliedMode,
      ),
    ).toThrow("cannot retain");
  });
});
