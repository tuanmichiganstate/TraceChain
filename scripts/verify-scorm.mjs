#!/usr/bin/env node
/**
 * Verify the SCORM package before it is uploaded anywhere.
 *
 * Everything checked here is a failure mode that otherwise surfaces as
 * "Moodle rejected the package" or, worse, as a blank iframe in front of a
 * class: a manifest nested inside a folder, a file listed but not shipped, an
 * absolute asset path, a CDN reference that dies without internet.
 */

import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const zipPath = join(projectRoot, `tracechain-scorm-v${packageJson.version}.zip`);

const errors = [];
const checks = [];

function check(description, condition, detail = "") {
  checks.push({ description, passed: Boolean(condition) });
  if (!condition) errors.push(`${description}${detail ? ` -- ${detail}` : ""}`);
}

if (!existsSync(zipPath)) {
  console.error(`Package not found: ${zipPath}\nRun \`npm run build:scorm\` first.`);
  process.exit(1);
}

const zip = new AdmZip(zipPath);
const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
const entryNames = entries.map((entry) => entry.entryName);

// ---- Archive layout ----------------------------------------------------

check(
  "imsmanifest.xml is at the archive root",
  entryNames.includes("imsmanifest.xml"),
  "SCORM requires the manifest at the root, not inside a folder",
);
check("index.html is at the archive root", entryNames.includes("index.html"));
check("version.json is present", entryNames.includes("version.json"));
check("README.txt is present", entryNames.includes("README.txt"));
check(
  "Archive entries are deterministically ordered",
  JSON.stringify(entryNames) ===
    JSON.stringify(
      [...entryNames].sort((left, right) => {
        const folded = left.toLowerCase().localeCompare(right.toLowerCase(), "en");
        return folded === 0 ? left.localeCompare(right, "en") : folded;
      }),
    ),
);
check(
  "Archive entries use the reproducible timestamp",
  entries.every((entry) => {
    const time = entry.header.time;
    return (
      time.getFullYear() === 2000 &&
      time.getMonth() === 0 &&
      time.getDate() === 1 &&
      time.getHours() === 0 &&
      time.getMinutes() === 0 &&
      time.getSeconds() === 0
    );
  }),
);

if (!entryNames.includes("imsmanifest.xml")) {
  report();
}

// ---- Manifest ----------------------------------------------------------

const manifest = zip.readAsText("imsmanifest.xml");

check("Manifest declares the XML prolog", manifest.startsWith("<?xml"));
check("Manifest declares ADL SCORM", manifest.includes("<schema>ADL SCORM</schema>"));
check("Manifest declares schema version 1.2", manifest.includes("<schemaversion>1.2</schemaversion>"));
check('Manifest declares adlcp:scormtype="sco"', /adlcp:scormtype="sco"/.test(manifest));
check('Resource href points at index.html', /href="index\.html"/.test(manifest));
check("Manifest declares a mastery score", /<adlcp:masteryscore>\d+<\/adlcp:masteryscore>/.test(manifest));
check("Manifest has exactly one organization default", /organizations\s+default="/.test(manifest));

// ---- Release metadata -------------------------------------------------

let versionMetadata = null;
try {
  versionMetadata = JSON.parse(zip.readAsText("version.json"));
} catch {
  // The checks below report the malformed metadata without hiding the rest of
  // the package findings behind an exception.
}
check("version.json is valid JSON", versionMetadata !== null);
check("version.json matches the package version", versionMetadata?.version === packageJson.version);
check(
  "version.json declares a reproducible build",
  versionMetadata?.reproducibleBuild === true && versionMetadata?.builtAt === undefined,
);

// Tags must be balanced, or Moodle's parser rejects the package outright.
const openTags = [...manifest.matchAll(/<(?!\?|!|\/)([a-zA-Z:][\w:.-]*)/g)].map((m) => m[1]);
const closeTags = [...manifest.matchAll(/<\/([a-zA-Z:][\w:.-]*)/g)].map((m) => m[1]);
const selfClosing = [...manifest.matchAll(/<([a-zA-Z:][\w:.-]*)[^>]*\/>/g)].map((m) => m[1]);
const balanced = openTags.filter((tag) => {
  const opens = openTags.filter((t) => t === tag).length;
  const closes = closeTags.filter((t) => t === tag).length;
  const selfs = selfClosing.filter((t) => t === tag).length;
  return opens !== closes + selfs;
});
check("Manifest XML tags are balanced", balanced.length === 0, [...new Set(balanced)].join(", "));

// ---- Every declared file ships, and every shipped asset is declared ----

const declaredFiles = [...manifest.matchAll(/<file\s+href="([^"]+)"/g)].map((match) =>
  match[1].replace(/&amp;/g, "&"),
);

check("Manifest declares at least one file", declaredFiles.length > 0);

const missingFromZip = declaredFiles.filter((file) => !entryNames.includes(file));
check(
  "Every file declared in the manifest is in the archive",
  missingFromZip.length === 0,
  missingFromZip.join(", "),
);

const packagingFiles = new Set(["imsmanifest.xml", "version.json", "README.txt"]);
const undeclared = entryNames.filter(
  (name) => !packagingFiles.has(name) && !declaredFiles.includes(name),
);
check(
  "Every shipped asset is declared in the manifest",
  undeclared.length === 0,
  undeclared.join(", "),
);

// ---- Runtime independence ----------------------------------------------

const indexHtml = zip.readAsText("index.html");

const absolutePaths = [...indexHtml.matchAll(/(?:src|href)="(\/[^/][^"]*)"/g)].map((m) => m[1]);
check(
  "index.html uses no absolute paths",
  absolutePaths.length === 0,
  `Moodle unpacks to an arbitrary directory. Found: ${absolutePaths.join(", ")}`,
);

const externalReferences = [...indexHtml.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)].map(
  (m) => m[0],
);
check(
  "index.html references no external origin",
  externalReferences.length === 0,
  `The package must work without a network connection. Found: ${externalReferences.join(", ")}`,
);

const jsEntries = entries.filter((entry) => entry.entryName.endsWith(".js"));
const cdnPattern = /https?:\/\/(?:cdn|unpkg|jsdelivr|fonts\.googleapis|ajax\.googleapis)/i;
const bundlesWithCdn = jsEntries
  .filter((entry) => cdnPattern.test(zip.readAsText(entry)))
  .map((entry) => entry.entryName);
check(
  "No bundle contains a CDN reference",
  bundlesWithCdn.length === 0,
  bundlesWithCdn.join(", "),
);

// ---- Report ------------------------------------------------------------

function report() {
  const passed = checks.filter((entry) => entry.passed).length;

  if (errors.length > 0) {
    console.error(`\nSCORM package verification FAILED (${passed}/${checks.length} checks passed):\n`);
    for (const error of errors) console.error(`  error  ${error}`);
    console.error("");
    process.exit(1);
  }

  const sizeKilobytes = (readFileSync(zipPath).length / 1024).toFixed(1);
  console.log(
    `SCORM package verified: ${passed}/${checks.length} checks passed, ` +
      `${entries.length} files, ${sizeKilobytes} kB.`,
  );
}

report();
