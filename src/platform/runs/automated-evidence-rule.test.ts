import { describe, expect, it } from "vitest";

import type { AutomatedEvidenceRuleV1 } from "../contracts/rubric";
import type { RunEventV1 } from "../contracts/run-events";
import { evaluateAutomatedEvidenceRule } from "./automated-evidence-rule";

function event(
  eventType: RunEventV1["eventType"],
  payload: RunEventV1["payload"],
): RunEventV1 {
  return {
    schemaVersion: "1.0.0",
    eventId: "EVT_EVIDENCE_RULE_001",
    runId: "RUN_EVIDENCE_RULE_001",
    idempotencyKey: "CMD_EVIDENCE_RULE_001:0",
    serverTimestampUtc: "2026-07-25T00:00:00.000Z",
    authenticatedUserId: "LEARNER_001",
    simulationActorId: "ACTOR_001",
    organizationId: "ORG_001",
    roleId: "ROLE_001",
    eventType,
    packId: "PACK_001",
    packVersion: "1.0.0",
    scenarioId: "SCENARIO_001",
    scenarioVersion: "1.0.0",
    payload,
    causationId: "CMD_EVIDENCE_RULE_001",
    correlationId: "RUN_EVIDENCE_RULE_001",
    previousStateHash: "before",
    resultingStateHash: "after",
    sequenceNumber: 1,
  };
}

function rule(
  overrides: Partial<AutomatedEvidenceRuleV1>,
): AutomatedEvidenceRuleV1 {
  return {
    evidenceRuleId: "RULE_001",
    version: "1.0.0",
    indicatorIds: ["INDICATOR_001"],
    operator: "EVENT_OCCURRED",
    eventType: "DECISION_SUBMITTED",
    ...overrides,
  };
}

describe("automated evidence rule evaluation", () => {
  it("matches EVENT_OCCURRED only for the authored event type", () => {
    expect(
      evaluateAutomatedEvidenceRule(
        rule({}),
        event("DECISION_SUBMITTED", {}),
      ),
    ).toEqual({ matched: true });
    expect(
      evaluateAutomatedEvidenceRule(
        rule({}),
        event("TRANSACTION_COMMITTED", {}),
      ),
    ).toEqual({
      matched: false,
      reason: "EVENT_TYPE_MISMATCH",
    });
  });

  it("resolves bounded payload paths for FIELD_EQUALS", () => {
    const fieldRule = rule({
      operator: "FIELD_EQUALS",
      eventType: "EVIDENCE_INSPECTED",
      fieldPath: "record.evidenceId",
      expectedValue: "EVID_CERTIFICATE_RECORD",
    });

    expect(
      evaluateAutomatedEvidenceRule(
        fieldRule,
        event("EVIDENCE_INSPECTED", {
          record: { evidenceId: "EVID_CERTIFICATE_RECORD" },
        }),
      ),
    ).toEqual({ matched: true });
    expect(
      evaluateAutomatedEvidenceRule(
        fieldRule,
        event("EVIDENCE_INSPECTED", {
          record: { evidenceId: "EVID_OTHER" },
        }),
      ),
    ).toEqual({
      matched: false,
      reason: "FIELD_VALUE_MISMATCH",
    });
  });

  it("matches FIELD_IN against the authored scalar set", () => {
    const fieldRule = rule({
      operator: "FIELD_IN",
      eventType: "TRANSACTION_REJECTED",
      fieldPath: "validationRuleId",
      expectedValues: [
        "RULE_ORGANIZATION_NOT_AUTHORIZED",
        "RULE_ROLE_NOT_AUTHORIZED",
      ],
    });

    expect(
      evaluateAutomatedEvidenceRule(
        fieldRule,
        event("TRANSACTION_REJECTED", {
          validationRuleId: "RULE_ORGANIZATION_NOT_AUTHORIZED",
        }),
      ),
    ).toEqual({ matched: true });
  });

  it("does not traverse missing, array, or prototype fields", () => {
    const fieldRule = rule({
      operator: "FIELD_EQUALS",
      fieldPath: "__proto__.polluted",
      expectedValue: true,
    });

    expect(
      evaluateAutomatedEvidenceRule(
        fieldRule,
        event("DECISION_SUBMITTED", { values: ["one"] }),
      ),
    ).toEqual({
      matched: false,
      reason: "FIELD_NOT_FOUND",
    });
  });
});
