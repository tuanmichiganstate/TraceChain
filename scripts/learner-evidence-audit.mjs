#!/usr/bin/env node
/**
 * Build and verify the learner-evidence sufficiency inventory.
 *
 * The inventory is derived from the compiled SCORM scenarios and every
 * published-platform pack. The checked-in contract supplies human-reviewed
 * evidence sources and engine alignment. A newly authored decision therefore
 * cannot silently bypass the audit.
 */

import { build } from "esbuild";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const contractPath = join(
  projectRoot,
  "docs",
  "content-review",
  "learner-evidence-contract.json",
);
const reportPath = join(
  projectRoot,
  "docs",
  "LEARNER_EVIDENCE_SUFFICIENCY_AUDIT.md",
);
const hostedPackPaths = [
  "scenario-packs/standard-coffee-stage3/tracechain.pack.json",
  "scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json",
];
const latentCertificateChecks = new Set([
  "INT_CERTIFICATE_STORAGE_CHOICE",
  "INT_CERTIFICATE_ISSUER_CHECK",
]);

function interactionKey(item) {
  return [
    item.surface,
    item.scenarioId,
    item.stageOrNodeId,
    item.decisionId,
    item.fieldId,
  ].join("|");
}

function scormInventory(scenario, modes) {
  const items = [];
  for (const stage of scenario.stages) {
    for (const check of stage.knowledgeChecks) {
      if (latentCertificateChecks.has(check.knowledgeCheckId)) continue;
      const fieldIds =
        check.checkType === "CLASSIFICATION"
          ? check.options.map((option) => option.optionId)
          : ["response"];
      for (const fieldId of fieldIds) {
        items.push({
          surface: "SCORM",
          scenarioId: scenario.scenarioId,
          scenarioVersion: scenario.scenarioVersion,
          modes,
          stageOrNodeId: stage.stageId,
          decisionId: check.knowledgeCheckId,
          fieldId,
          classification: check.isScored ? "KNOWLEDGE" : "DIAGNOSTIC",
          scored: check.isScored,
          evidenceTiming: "PRE_SUBMISSION",
        });
      }
    }
  }
  const authored = [
    [
      "STG_03_ANCHOR_CERTIFICATE",
      "INT_CERTIFICATE_INITIAL_SUBMITTED",
      [
        "certificateAssessment",
        "issuerAssessment",
        "storageChoice",
        "lotDisposition",
      ],
    ],
    [
      "STG_05_RECEIVE_AND_CORRECT",
      "INT_DISCREPANCY_INITIAL_SUBMITTED",
      ["action", "causeCode"],
    ],
    [
      "STG_09_RECALL_AND_DEBRIEF",
      "INT_RECALL_COMMITTED",
      ["authorizationPath"],
    ],
  ];
  for (const [stageOrNodeId, decisionId, fieldIds] of authored) {
    for (const fieldId of fieldIds) {
      items.push({
        surface: "SCORM",
        scenarioId: scenario.scenarioId,
        scenarioVersion: scenario.scenarioVersion,
        modes,
        stageOrNodeId,
        decisionId,
        fieldId,
        classification: "CONSEQUENTIAL_DECISION",
        scored: true,
        evidenceTiming: "PRE_SUBMISSION",
      });
    }
  }
  for (const [stageOrNodeId, decisionId] of [
    [
      "STG_04_SHIP_AND_MONITOR",
      "INT_CUSTODY_TRANSFERRED_TRANSACTION",
    ],
    [
      "STG_05_RECEIVE_AND_CORRECT",
      "INT_CORRECTION_RECORDED",
    ],
  ]) {
    items.push({
      surface: "SCORM",
      scenarioId: scenario.scenarioId,
      scenarioVersion: scenario.scenarioVersion,
      modes,
      stageOrNodeId,
      decisionId,
      fieldId: "endorsementAction",
      classification: "ENDORSEMENT_JUDGMENT",
      scored: true,
      evidenceTiming: "PRE_SUBMISSION",
    });
  }
  for (const [stageOrNodeId, decisionId, fieldIds] of [
    [
      "STG_03_ANCHOR_CERTIFICATE",
      "MITIGATION_CERTIFICATE",
      ["REVIEW_ISSUER", "REMEDIATE_STORAGE", "SUSPEND_LOT"],
    ],
    [
      "STG_05_RECEIVE_AND_CORRECT",
      "MITIGATION_DISCREPANCY",
      ["INVESTIGATE_DISCREPANCY"],
    ],
  ]) {
    for (const fieldId of fieldIds) {
      items.push({
        surface: "SCORM",
        scenarioId: scenario.scenarioId,
        scenarioVersion: scenario.scenarioVersion,
        modes,
        stageOrNodeId,
        decisionId,
        fieldId,
        classification: "MITIGATION",
        scored: false,
        evidenceTiming: "AFTER_OUTCOME",
      });
    }
  }
  return items;
}

function hostedInventory(pack) {
  const items = [];
  for (const scenario of pack.scenarios) {
    const modes = scenario.supportedModes;
    for (const node of scenario.nodes) {
      if (node.nodeType === "ENDORSEMENT") {
        items.push({
          surface: "HOSTED",
          scenarioId: scenario.scenarioId,
          scenarioVersion: scenario.version,
          modes,
          stageOrNodeId: node.nodeId,
          decisionId: node.nodeId,
          fieldId: "endorsementAction",
          classification: "ENDORSEMENT_JUDGMENT",
          scored: true,
          evidenceTiming: "PRE_SUBMISSION",
        });
        continue;
      }
      if (node.nodeType !== "DECISION") continue;
      for (const field of node.fields) {
        const base = {
          scenarioId: scenario.scenarioId,
          scenarioVersion: scenario.version,
          modes,
          stageOrNodeId: node.nodeId,
          decisionId: node.decisionId,
          fieldId: field.fieldId,
          classification: "HOSTED_DECISION",
          scored: true,
          evidenceTiming: "PRE_SUBMISSION",
        };
        items.push({ ...base, surface: "HOSTED" });
        if (node.counterfactual?.enabled === true) {
          items.push({
            ...base,
            surface: "HOSTED_COUNTERFACTUAL",
            classification: "COUNTERFACTUAL_DECISION",
            scored: false,
          });
        }
      }
      if (node.counterfactual?.enabled === true) {
        items.push({
          surface: "HOSTED_COUNTERFACTUAL",
          scenarioId: scenario.scenarioId,
          scenarioVersion: scenario.version,
          modes,
          stageOrNodeId: node.nodeId,
          decisionId: "COUNTERFACTUAL_REFLECTION",
          fieldId: "response",
          classification: "REFLECTION",
          scored: false,
          evidenceTiming: "AFTER_OUTCOME",
        });
      }
    }
    if (scenario.scenarioId === "SCN_COFFEE_STAGE3_FOUNDATION") {
      items.push({
        surface: "HOSTED",
        scenarioId: scenario.scenarioId,
        scenarioVersion: scenario.version,
        modes,
        stageOrNodeId: "NODE_DISCREPANCY_MITIGATION",
        decisionId: "MITIGATION_DISCREPANCY",
        fieldId: "INVESTIGATE_DISCREPANCY",
        classification: "MITIGATION",
        scored: false,
        evidenceTiming: "AFTER_OUTCOME",
      });
    }
  }
  return items;
}

async function loadScormScenarios(root) {
  const cacheRoot = join(root, "node_modules", ".cache");
  mkdirSync(cacheRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(cacheRoot, "tracechain-evidence-audit-"),
  );
  const bundlePath = join(temporaryDirectory, "audit-entry.mjs");
  try {
    await build({
      entryPoints: [join(root, "scripts", "evidence-audit-entry.ts")],
      outfile: bundlePath,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node20",
      logLevel: "silent",
    });
    return await import(pathToFileURL(bundlePath).href);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function buildLearnerInteractionInventory(root = projectRoot) {
  const { coffeeScenario, challengeAScenario } =
    await loadScormScenarios(root);
  const items = [
    ...scormInventory(coffeeScenario, ["guided", "assessment"]),
    ...scormInventory(challengeAScenario, ["challenge"]),
  ];
  for (const relativePath of hostedPackPaths) {
    const pack = JSON.parse(
      readFileSync(join(root, relativePath), "utf8"),
    );
    items.push(...hostedInventory(pack));
  }
  return items.sort((left, right) =>
    interactionKey(left).localeCompare(interactionKey(right)),
  );
}

function matches(rule, item) {
  const match = rule.match;
  const contains = (values, value) =>
    values === undefined ||
    values.includes("*") ||
    values.includes(value);
  return (
    contains(match.surfaces, item.surface) &&
    contains(match.scenarioIds, item.scenarioId) &&
    contains(match.decisionIds, item.decisionId) &&
    contains(match.fieldIds, item.fieldId)
  );
}

function sourceFile(location) {
  return location.split("#")[0].split(":")[0];
}

export function validateEvidenceAudit({
  contract,
  inventory,
  root = projectRoot,
  locales,
}) {
  const problems = [];
  const sourceById = new Map();
  for (const source of contract.evidenceSources ?? []) {
    if (sourceById.has(source.sourceId)) {
      problems.push(`Duplicate evidence source ${source.sourceId}.`);
    }
    sourceById.set(source.sourceId, source);
    if (!["PRE_SUBMISSION", "AFTER_OUTCOME"].includes(source.timing)) {
      problems.push(`${source.sourceId} has unsupported timing ${source.timing}.`);
    }
    if (
      !["DECISION_ROLE", "ALL_LEARNERS"].includes(source.roleVisibility)
    ) {
      problems.push(
        `${source.sourceId} is not explicitly visible to the decision role.`,
      );
    }
    for (const location of source.locations ?? []) {
      if (!existsSync(join(root, sourceFile(location)))) {
        problems.push(
          `${source.sourceId} references missing source ${location}.`,
        );
      }
    }
    const sourceCatalogs =
      source.localizedInPack === true
        ? (() => {
            const packLocation = (source.locations ?? []).find(
              (location) =>
                location.endsWith(".json") &&
                location.startsWith("scenario-packs/"),
            );
            if (packLocation === undefined) return undefined;
            const pack = JSON.parse(
              readFileSync(join(root, packLocation), "utf8"),
            );
            return pack.localizationCatalogs;
          })()
        : locales;
    for (const localeKey of source.localeKeys ?? []) {
      for (const locale of ["en", "vi"]) {
        if (
          sourceCatalogs === undefined ||
          typeof sourceCatalogs[locale] !== "object" ||
          !(localeKey in sourceCatalogs[locale])
        ) {
          problems.push(
            `${source.sourceId} locale key ${localeKey} is missing from ${locale}.`,
          );
        }
      }
    }
    if (
      (source.localeKeys ?? []).length === 0 &&
      source.localizedInPack !== true
    ) {
      problems.push(
        `${source.sourceId} does not declare catalog keys or pack-localized evidence.`,
      );
    }
  }

  const resolved = [];
  for (const item of inventory) {
    const matchingRules = (contract.coverageRules ?? []).filter((rule) =>
      matches(rule, item),
    );
    if (matchingRules.length !== 1) {
      problems.push(
        `${interactionKey(item)} matched ${matchingRules.length} coverage rules; expected exactly one.`,
      );
      continue;
    }
    const rule = matchingRules[0];
    const sources = (rule.sourceIds ?? [])
      .map((sourceId) => sourceById.get(sourceId))
      .filter(Boolean);
    if (sources.length !== (rule.sourceIds ?? []).length) {
      problems.push(`${rule.ruleId} references an unknown evidence source.`);
    }
    if (
      item.evidenceTiming === "PRE_SUBMISSION" &&
      !sources.some((source) => source.timing === "PRE_SUBMISSION")
    ) {
      problems.push(
        `${interactionKey(item)} has no evidence available before submission.`,
      );
    }
    if (
      !["REFLECTION", "MITIGATION"].includes(item.classification) &&
      sources.some((source) => source.sourceType === "FEEDBACK")
    ) {
      problems.push(
        `${interactionKey(item)} incorrectly uses post-answer feedback as evidence.`,
      );
    }
    if (!Array.isArray(rule.answerAuthority) || rule.answerAuthority.length === 0) {
      problems.push(`${rule.ruleId} has no engine-alignment reference.`);
    } else {
      for (const location of rule.answerAuthority) {
        if (!existsSync(join(root, sourceFile(location)))) {
          problems.push(
            `${rule.ruleId} references missing answer authority ${location}.`,
          );
        }
      }
    }
    resolved.push({ item, rule, sources });
  }

  for (const finding of contract.findings ?? []) {
    if (
      finding.status === "OPEN" &&
      ["BLOCKER", "HIGH"].includes(finding.severity)
    ) {
      problems.push(
        `Open ${finding.severity.toLowerCase()} finding ${finding.findingId}: ${finding.summary}`,
      );
    }
  }
  return { problems, resolved };
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderEvidenceAudit({ contract, resolved }) {
  const countBySurface = new Map();
  for (const { item } of resolved) {
    countBySurface.set(
      item.surface,
      (countBySurface.get(item.surface) ?? 0) + 1,
    );
  }
  const findings = contract.findings ?? [];
  const lines = [
    "# TraceChain learner evidence sufficiency audit",
    "",
    "This report is generated from the compiled SCORM scenarios, all hosted scenario packs, and `docs/content-review/learner-evidence-contract.json`.",
    "",
    "## Contract",
    "",
    "- Every consequential or scored field has evidence available before submission.",
    "- Evidence is visible to the role making the decision and exists in Vietnamese and English where it is learner-facing.",
    "- Feedback shown after submission is never counted as evidence for the original answer.",
    "- Counterfactual branches reuse the source-run information state at the fork; reflections use the completed comparison.",
    "- Answer keys remain aligned with deterministic scenario and scoring code.",
    "",
    "## Coverage summary",
    "",
    `- Audited fields: **${resolved.length}**`,
    ...[...countBySurface.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([surface, count]) => `- ${surface}: **${count}**`),
    `- Open blocker/high findings: **${findings.filter((item) => item.status === "OPEN" && ["BLOCKER", "HIGH"].includes(item.severity)).length}**`,
    "",
    "## Field-level inventory",
    "",
    "| Surface | Scenario | Mode | Stage/node | Decision | Field/item | Class | Evidence available before answer | Result |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const { item, rule, sources } of resolved) {
    lines.push(
      `| ${escapeCell(item.surface)} | ${escapeCell(`${item.scenarioId}@${item.scenarioVersion}`)} | ${escapeCell(item.modes.join(", "))} | ${escapeCell(item.stageOrNodeId)} | ${escapeCell(item.decisionId)} | ${escapeCell(item.fieldId)} | ${escapeCell(item.classification)} | ${escapeCell(sources.map((source) => source.label).join("; "))} | ${escapeCell(rule.result)} |`,
    );
  }
  lines.push(
    "",
    "## Findings and remediation",
    "",
    "| ID | Severity | Status | Finding | Remediation or disposition |",
    "|---|---|---|---|---|",
  );
  for (const finding of findings) {
    lines.push(
      `| ${escapeCell(finding.findingId)} | ${escapeCell(finding.severity)} | ${escapeCell(finding.status)} | ${escapeCell(finding.summary)} | ${escapeCell(finding.disposition)} |`,
    );
  }
  lines.push(
    "",
    "## Exclusions",
    "",
    ...contract.exclusions.map((item) => `- ${item}`),
    "",
    "Generated by `npm run generate:evidence-audit`; verified by `npm run verify:evidence-audit`.",
    "",
  );
  return lines.join("\n");
}

async function audit(root = projectRoot) {
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  const inventory = await buildLearnerInteractionInventory(root);
  const locales = {
    en: JSON.parse(readFileSync(join(root, "src/locales/en.json"), "utf8")),
    vi: JSON.parse(readFileSync(join(root, "src/locales/vi.json"), "utf8")),
  };
  const validation = validateEvidenceAudit({
    contract,
    inventory,
    root,
    locales,
  });
  if (validation.problems.length > 0) {
    throw new Error(validation.problems.join("\n"));
  }
  return {
    contract,
    inventory,
    report: renderEvidenceAudit({
      contract,
      resolved: validation.resolved,
    }),
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await audit();
    if (process.argv.includes("--write")) {
      writeFileSync(reportPath, result.report);
      console.log(
        `Learner evidence audit generated: ${result.inventory.length} fields.`,
      );
    } else {
      const committed = existsSync(reportPath)
        ? readFileSync(reportPath, "utf8")
        : "";
      if (committed !== result.report) {
        throw new Error(
          "Learner evidence audit is stale; run npm run generate:evidence-audit.",
        );
      }
      console.log(
        `Learner evidence audit verified: ${result.inventory.length} fields, 0 open blocker/high findings.`,
      );
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}
