#!/usr/bin/env node
/**
 * Validate the scenario at build time (specification section 27).
 *
 * This runs the same `validateScenario` the application runs at startup, so the
 * build cannot pass a scenario the application would reject. It adds three
 * checks that only make sense outside the browser: the timeline ordering
 * constraints, the locale keys the scenario references, and agreement between
 * the scenario and the stage component registry.
 *
 * The scenario modules are TypeScript with enums, which Node's type stripping
 * cannot execute, so they are bundled with esbuild first. esbuild is already
 * present as a Vite dependency.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const errors = [];
const warnings = [];
let checkedCount = 0;

function check(description, condition, detail = "") {
  checkedCount += 1;
  if (!condition) errors.push(`${description}${detail ? ` -- ${detail}` : ""}`);
}

/*
 * The bundle must live inside the project so Node can resolve the externalized
 * `react` import from node_modules. A system temp directory cannot.
 */
const cacheRoot = join(projectRoot, "node_modules", ".cache");
mkdirSync(cacheRoot, { recursive: true });
const temporaryDirectory = mkdtempSync(join(cacheRoot, "tracechain-scenario-"));
const bundlePath = join(temporaryDirectory, "scenario.mjs");

try {
  await build({
    entryPoints: [join(projectRoot, "scripts", "scenario-entry.ts")],
    outfile: bundlePath,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    logLevel: "silent",
    // The stage registry pulls in React components; they are never rendered
    // here, only their keys are read.
    external: ["react", "react-dom", "react/jsx-runtime"],
    // Registry validation imports the real stage modules. Their visual assets
    // are irrelevant to this Node-side check, but esbuild still needs to emit
    // importable values for them while traversing the component graph.
    loader: {
      ".css": "empty",
      ".jpeg": "file",
      ".jpg": "file",
      ".png": "file",
      ".svg": "file",
      ".webp": "file",
    },
    assetNames: "assets/[name]-[hash]",
  });

  const module = await import(pathToFileURL(bundlePath).href);
  const {
    coffeeScenario,
    practiceAScenario,
    challengeAScenario,
    challengeBScenario,
    challengeCScenario,
    challengeVariantBank,
    practiceVariantBank,
    CHALLENGE_PRESET,
    PRACTICE_PRESET,
    validateScenario,
    validateVariantBank,
    ALL_SCENARIO_DATES,
    TIMELINE_ORDERING_CONSTRAINTS,
    STAGE_COMPONENTS,
    TRANSACTION_TO_EVENT,
    TransactionType,
  } = module;

  // ---- The shared validator -------------------------------------------

  const scenarios = [
    coffeeScenario,
    practiceAScenario,
    challengeAScenario,
    challengeBScenario,
    challengeCScenario,
  ];
  for (const scenario of scenarios) {
    const result = validateScenario(scenario);
    checkedCount += result.checkedCount;
    for (const issue of result.issues) {
      const line = `${scenario.scenarioId}.${issue.path}: ${issue.message}`;
      if (issue.severity === "ERROR") errors.push(line);
      else warnings.push(line);
    }
  }
  const bankResult = validateVariantBank({
    bank: challengeVariantBank,
    configuration: CHALLENGE_PRESET,
  });
  checkedCount += bankResult.issues.length + 1;
  for (const issue of bankResult.issues) {
    const line = `${challengeVariantBank.bankId}.${issue.path}: ${issue.message}`;
    if (issue.severity === "ERROR") errors.push(line);
    else warnings.push(line);
  }
  check(
    "Challenge variant bank passes its shared replay and scoring contract",
    bankResult.isValid,
  );
  const practiceBankResult = validateVariantBank({
    bank: practiceVariantBank,
    configuration: PRACTICE_PRESET,
  });
  checkedCount += practiceBankResult.issues.length + 1;
  for (const issue of practiceBankResult.issues) {
    const line = `${practiceVariantBank.bankId}.${issue.path}: ${issue.message}`;
    if (issue.severity === "ERROR") errors.push(line);
    else warnings.push(line);
  }
  check(
    "Practice case passes its shared replay and scoring contract",
    practiceBankResult.isValid,
  );

  // ---- Timeline ordering ----------------------------------------------

  for (const [earlier, later, reason] of TIMELINE_ORDERING_CONSTRAINTS) {
    const earlierTime = Date.parse(ALL_SCENARIO_DATES[earlier]);
    const laterTime = Date.parse(ALL_SCENARIO_DATES[later]);
    check(
      `Timeline: ${earlier} precedes ${later}`,
      Number.isFinite(earlierTime) && Number.isFinite(laterTime) && earlierTime < laterTime,
      reason,
    );
  }

  // ---- Locale keys ------------------------------------------------------

  const locale = JSON.parse(readFileSync(join(projectRoot, "src", "locales", "vi.json"), "utf8"));

  const referencedKeys = new Set(scenarios.flatMap((scenario) => [
    scenario.titleKey,
    scenario.descriptionKey,
    ...scenario.organizations.map((o) => o.displayNameKey),
    ...scenario.actors.map((a) => a.displayNameKey),
    ...scenario.locations.map((l) => l.displayNameKey),
    scenario.runtime.consequentialCases.certificate.contentEvidenceKey,
    scenario.runtime.consequentialCases.discrepancy.causeEvidenceKey,
    scenario.runtime.consequentialCases.discrepancy.reasonSuggestionKey,
    ...scenario.stages.flatMap((stage) => [
      stage.titleKey,
      stage.instructionKey,
      ...stage.requiredActions.map((action) => action.descriptionKey),
      ...stage.availableHints.map((hint) => hint.textKey),
      ...stage.knowledgeChecks.flatMap((knowledgeCheck) => [
        knowledgeCheck.questionKey,
        knowledgeCheck.feedbackKey,
        knowledgeCheck.scenarioConnectionKey,
        ...(knowledgeCheck.glossaryTermKey ? [knowledgeCheck.glossaryTermKey] : []),
        ...knowledgeCheck.options.map((option) => option.labelKey),
        ...(knowledgeCheck.categories ?? []).map((category) => category.labelKey),
      ]),
    ]),
  ]));

  const missingKeys = [...referencedKeys].filter((key) => !(key in locale));
  check(
    "Every localization key the scenario references exists in vi.json",
    missingKeys.length === 0,
    missingKeys.join(", "),
  );

  // ---- Scenario and registry agreement ---------------------------------

  const implementedStages = scenarios.flatMap((scenario) =>
    scenario.stages.filter((stage) => stage.isImplemented),
  );
  const unregistered = implementedStages.filter(
    (stage) => STAGE_COMPONENTS[stage.stageId] === undefined,
  );
  check(
    "Every stage marked implemented has a registered component",
    unregistered.length === 0,
    unregistered.map((stage) => stage.stageId).join(", "),
  );

  const orphanComponents = Object.keys(STAGE_COMPONENTS).filter(
    (stageId) =>
      !coffeeScenario.stages.some(
        (stage) => stage.isImplemented && stage.stageId === stageId,
      ),
  );
  check(
    "Every registered component belongs to a stage marked implemented",
    orphanComponents.length === 0,
    orphanComponents.join(", "),
  );

  // ---- Transaction and event symmetry ----------------------------------

  const transactionTypes = Object.values(TransactionType);
  const unmapped = transactionTypes.filter((type) => TRANSACTION_TO_EVENT[type] === undefined);
  check("Every transaction type maps to a past-tense event", unmapped.length === 0, unmapped.join(", "));

  const mappedEvents = Object.values(TRANSACTION_TO_EVENT);
  check(
    "No two transaction types share an event type",
    new Set(mappedEvents).size === mappedEvents.length,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

for (const warning of warnings) {
  console.warn(`  warning  ${warning}`);
}

if (errors.length > 0) {
  console.error(`\nScenario validation FAILED with ${errors.length} problem(s):\n`);
  for (const error of errors) console.error(`  error  ${error}`);
  console.error("");
  process.exit(1);
}

console.log(`Scenario validation passed: ${checkedCount} checks, ${warnings.length} warning(s).`);
