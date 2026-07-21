#!/usr/bin/env node
/**
 * Validate the scenario definition before the application ever boots
 * (specification section 27: "Validate all imported scenario data at startup").
 *
 * Catching these at build time matters because most of them are silent at
 * runtime. A timeline whose receipt precedes its dispatch does not crash -- it
 * produces a stage the learner simply cannot complete, and the cause is three
 * layers away in a validation rule.
 *
 * The scenario modules are TypeScript with enums, which Node's type stripping
 * cannot execute, so they are bundled with esbuild first. esbuild is already
 * present as a Vite dependency.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const errors = [];
const checks = [];

function check(description, condition, detail = "") {
  checks.push({ description, passed: Boolean(condition) });
  if (!condition) errors.push(`${description}${detail ? ` -- ${detail}` : ""}`);
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "tracechain-scenario-"));
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
  });

  const scenario = await import(pathToFileURL(bundlePath).href);
  const locale = JSON.parse(readFileSync(join(projectRoot, "src", "locales", "vi.json"), "utf8"));

  const {
    SCENARIO_TIMELINE,
    TIMELINE_ORDERING_CONSTRAINTS,
    organizations,
    actors,
    locations,
    DECISION_IDS,
    HINT_IDS,
    SCENARIO_STAGE_ORDER,
    STAGE_ACTOR,
    STAGE_TITLE_KEY,
    TRANSACTION_TO_EVENT,
    TransactionType,
  } = scenario;

  // ---- Timeline ordering ----------------------------------------------

  for (const [earlier, later, reason] of TIMELINE_ORDERING_CONSTRAINTS) {
    const earlierTime = Date.parse(SCENARIO_TIMELINE[earlier]);
    const laterTime = Date.parse(SCENARIO_TIMELINE[later]);
    check(
      `Timeline: ${earlier} precedes ${later}`,
      Number.isFinite(earlierTime) && Number.isFinite(laterTime) && earlierTime < laterTime,
      reason,
    );
  }

  for (const [key, value] of Object.entries(SCENARIO_TIMELINE)) {
    check(
      `Timeline entry "${key}" is a valid ISO 8601 UTC instant`,
      typeof value === "string" && value.endsWith("Z") && Number.isFinite(Date.parse(value)),
      value,
    );
  }

  // ---- Localization keys referenced by scenario data -------------------

  const referencedKeys = [
    ...organizations.map((organization) => organization.displayNameKey),
    ...actors.map((actor) => actor.displayNameKey),
    ...locations.map((location) => location.displayNameKey),
    ...Object.values(STAGE_TITLE_KEY),
  ];

  const missingKeys = referencedKeys.filter((key) => !(key in locale));
  check(
    "Every scenario display key exists in vi.json",
    missingKeys.length === 0,
    missingKeys.join(", "),
  );

  // ---- Referential integrity ------------------------------------------

  const organizationIds = new Set(organizations.map((o) => o.organizationId));

  const actorsWithUnknownOrganization = actors.filter(
    (actor) => !organizationIds.has(actor.organizationId),
  );
  check(
    "Every actor belongs to a defined organization",
    actorsWithUnknownOrganization.length === 0,
    actorsWithUnknownOrganization.map((a) => a.actorId).join(", "),
  );

  const locationsWithUnknownOperator = locations.filter(
    (location) => !organizationIds.has(location.operatedByOrganizationId),
  );
  check(
    "Every location is operated by a defined organization",
    locationsWithUnknownOperator.length === 0,
    locationsWithUnknownOperator.map((l) => l.locationId).join(", "),
  );

  const actorIds = new Set(actors.map((actor) => actor.actorId));
  const stagesWithUnknownActor = Object.entries(STAGE_ACTOR).filter(
    ([, actorId]) => actorId !== undefined && !actorIds.has(actorId),
  );
  check(
    "Every stage's active actor is defined",
    stagesWithUnknownActor.length === 0,
    stagesWithUnknownActor.map(([stage]) => stage).join(", "),
  );

  // ---- Identifier conventions (specification section 5.3) --------------

  const badOrganizationIds = organizations.filter((o) => !o.organizationId.startsWith("ORG_"));
  check("Organization identifiers use the ORG_ prefix", badOrganizationIds.length === 0);

  const badActorIds = actors.filter((a) => !a.actorId.startsWith("ACT_"));
  check("Actor identifiers use the ACT_ prefix", badActorIds.length === 0);

  const badLocationIds = locations.filter((l) => !l.locationId.startsWith("LOC_"));
  check("Location identifiers use the LOC_ prefix", badLocationIds.length === 0);

  // ---- Compact state codec key ----------------------------------------

  check(
    "Decision identifiers are unique",
    new Set(DECISION_IDS).size === DECISION_IDS.length,
    "The codec stores decisions positionally; a duplicate corrupts saved state",
  );
  check("Hint identifiers are unique", new Set(HINT_IDS).size === HINT_IDS.length);
  check(
    "Every stage appears exactly once in the stage order",
    new Set(SCENARIO_STAGE_ORDER).size === SCENARIO_STAGE_ORDER.length,
  );
  check(
    "Every stage in the order has a title key",
    SCENARIO_STAGE_ORDER.every((stageId) => STAGE_TITLE_KEY[stageId] !== undefined),
  );

  // ---- Transaction and event symmetry ----------------------------------

  const transactionTypes = Object.values(TransactionType);
  const unmappedTransactions = transactionTypes.filter(
    (type) => TRANSACTION_TO_EVENT[type] === undefined,
  );
  check(
    "Every transaction type maps to a past-tense event",
    unmappedTransactions.length === 0,
    unmappedTransactions.join(", "),
  );

  const mappedEvents = Object.values(TRANSACTION_TO_EVENT);
  check(
    "No two transaction types share an event type",
    new Set(mappedEvents).size === mappedEvents.length,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

const passed = checks.filter((entry) => entry.passed).length;

if (errors.length > 0) {
  console.error(`\nScenario validation FAILED (${passed}/${checks.length} checks passed):\n`);
  for (const error of errors) console.error(`  error  ${error}`);
  console.error("");
  process.exit(1);
}

console.log(`Scenario validation passed: ${passed}/${checks.length} checks.`);
