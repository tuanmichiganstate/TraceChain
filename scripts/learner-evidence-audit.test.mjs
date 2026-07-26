import assert from "node:assert/strict";
import test from "node:test";
import { validateEvidenceAudit } from "./learner-evidence-audit.mjs";

const inventoryItem = {
  surface: "SCORM",
  scenarioId: "SCENARIO",
  scenarioVersion: "1",
  modes: ["guided"],
  stageOrNodeId: "STAGE",
  decisionId: "DECISION",
  fieldId: "FIELD",
  classification: "KNOWLEDGE",
  scored: true,
  evidenceTiming: "PRE_SUBMISSION",
};

const source = {
  sourceId: "SOURCE",
  label: "Visible evidence",
  sourceType: "DOCUMENT",
  timing: "PRE_SUBMISSION",
  roleVisibility: "DECISION_ROLE",
  locations: ["package.json"],
  localeKeys: ["test.key"],
};

function validate(overrides = {}) {
  return validateEvidenceAudit({
    contract: {
      evidenceSources: [source],
      coverageRules: [
        {
          ruleId: "RULE",
          match: { decisionIds: ["DECISION"], fieldIds: ["FIELD"] },
          sourceIds: ["SOURCE"],
          answerAuthority: ["package.json"],
          result: "PASS",
        },
      ],
      findings: [],
      ...overrides,
    },
    inventory: [inventoryItem],
    root: new URL("..", import.meta.url).pathname,
    locales: {
      en: { "test.key": "Evidence" },
      vi: { "test.key": "Bằng chứng" },
    },
  });
}

test("accepts one pre-submission, role-visible, localized evidence mapping", () => {
  assert.deepEqual(validate().problems, []);
});

test("fails when a newly authored field is not covered", () => {
  const result = validate({ coverageRules: [] });
  assert.match(result.problems.join("\n"), /matched 0 coverage rules/u);
});

test("fails when feedback is used as the original answer evidence", () => {
  const result = validate({
    evidenceSources: [{ ...source, sourceType: "FEEDBACK" }],
  });
  assert.match(result.problems.join("\n"), /uses post-answer feedback/u);
});

test("fails when evidence appears only after submission", () => {
  const result = validate({
    evidenceSources: [{ ...source, timing: "AFTER_OUTCOME" }],
  });
  assert.match(result.problems.join("\n"), /no evidence available before/u);
});

test("fails an unresolved high-severity finding", () => {
  const result = validate({
    findings: [
      {
        findingId: "FINDING",
        severity: "HIGH",
        status: "OPEN",
        summary: "The answer cannot be derived.",
      },
    ],
  });
  assert.match(result.problems.join("\n"), /Open high finding/u);
});
