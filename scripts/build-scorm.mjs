#!/usr/bin/env node
/**
 * Build the SCORM 1.2 package (specification section 4.4).
 *
 * The manifest's file list is generated from the actual build output rather
 * than maintained by hand. A manifest that omits a file it ships, or lists one
 * it does not, is the most common reason an LMS refuses a package -- and the
 * hashed asset filenames change on every build, so a hand-written list would be
 * wrong immediately.
 */

import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const distDirectory = join(projectRoot, "dist");
const packageDirectory = join(projectRoot, "dist-scorm");

const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const locale = JSON.parse(readFileSync(join(projectRoot, "src", "locales", "vi.json"), "utf8"));

const VERSION = packageJson.version;
const PACKAGE_NAME = `tracechain-scorm-v${VERSION}.zip`;
const MASTERY_SCORE = 70;
// ZIP stores local DOS timestamps. A fixed local value keeps byte output stable
// across rebuilds and across runner timezones.
const ZIP_ENTRY_TIME = new Date(2000, 0, 1, 0, 0, 0);

if (!existsSync(distDirectory)) {
  console.error("dist/ not found. Run `npm run build` first.");
  process.exit(1);
}

/** Escape text for inclusion in XML character data or an attribute value. */
function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function listFilesRecursively(directory, base = directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      found.push(...listFilesRecursively(fullPath, base));
    } else {
      // Manifest hrefs are always forward-slashed, regardless of build platform.
      found.push(relative(base, fullPath).split(sep).join(posix.sep));
    }
  }
  return found.sort();
}

// ---- Assemble the package directory ------------------------------------

rmSync(packageDirectory, { recursive: true, force: true });
mkdirSync(packageDirectory, { recursive: true });
cpSync(distDirectory, packageDirectory, { recursive: true });

const files = listFilesRecursively(packageDirectory);

if (!files.includes("index.html")) {
  console.error("The build output has no index.html at its root.");
  process.exit(1);
}

// ---- imsmanifest.xml ---------------------------------------------------

const title = escapeXml(locale["app.title"]);
const description = escapeXml(locale["app.subtitle"]);

const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="TRACECHAIN_SCN_COFFEE_001" version="${escapeXml(VERSION)}"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">

  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>

  <organizations default="TRACECHAIN_ORGANIZATION">
    <organization identifier="TRACECHAIN_ORGANIZATION" structure="hierarchical">
      <title>${title}</title>
      <item identifier="ITEM_TRACECHAIN" identifierref="RESOURCE_TRACECHAIN" isvisible="true">
        <title>${title}</title>
        <adlcp:masteryscore>${MASTERY_SCORE}</adlcp:masteryscore>
        <adlcp:maxtimeallowed></adlcp:maxtimeallowed>
        <adlcp:datafromlms></adlcp:datafromlms>
      </item>
      <metadata>
        <adlcp:location>${description}</adlcp:location>
      </metadata>
    </organization>
  </organizations>

  <resources>
    <resource identifier="RESOURCE_TRACECHAIN" type="webcontent" adlcp:scormtype="sco" href="index.html">
${files.map((file) => `      <file href="${escapeXml(file)}" />`).join("\n")}
    </resource>
  </resources>

</manifest>
`;

writeFileSync(join(packageDirectory, "imsmanifest.xml"), manifest, "utf8");

// ---- Supporting files --------------------------------------------------

writeFileSync(
  join(packageDirectory, "version.json"),
  `${JSON.stringify(
    {
      name: "tracechain",
      version: VERSION,
      scenarioId: "SCN_COFFEE_001",
      scormVersion: "1.2",
      packageFormatVersion: 1,
      reproducibleBuild: true,
      masteryScore: MASTERY_SCORE,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

writeFileSync(
  join(packageDirectory, "README.txt"),
  [
    `TraceChain ${VERSION}`,
    "A simulated permissioned blockchain for supply-chain traceability education.",
    "",
    "DEPLOYMENT",
    "  Upload tracechain-scorm-v" + VERSION + ".zip to Moodle as a SCORM package activity.",
    "  No server, database, blockchain node or network access is required at runtime.",
    "",
    "MOODLE ACTIVITY SETTINGS",
    "  Grading method     Highest grade",
    "  Maximum grade      100",
    "  Attempts           As permitted by the course design",
    "  Display            New window or embedded; both are supported.",
    "",
    "NOTES",
    "  The learner interface is Vietnamese. The ledger is simulated: it is not",
    "  connected to any real blockchain network, and no student identity is",
    "  written to it.",
    "",
    "  Passing score is " + MASTERY_SCORE + " of 100, declared as adlcp:masteryscore",
    "  in imsmanifest.xml.",
    "",
  ].join("\n"),
  "utf8",
);

// ---- Zip ---------------------------------------------------------------

const zip = new AdmZip();
// Files are added individually so the archive has no wrapping directory: a
// SCORM package must have imsmanifest.xml at the archive root.
for (const file of listFilesRecursively(packageDirectory)) {
  const directory = posix.dirname(file);
  zip.addLocalFile(join(packageDirectory, file), directory === "." ? "" : directory);
  const entry = zip.getEntry(file);
  if (entry === null || entry === undefined) {
    throw new Error(`Failed to add ${file} to the SCORM archive`);
  }
  entry.header.time = ZIP_ENTRY_TIME;
}

const zipPath = join(projectRoot, PACKAGE_NAME);
zip.writeZip(zipPath);

const sizeKilobytes = (statSync(zipPath).size / 1024).toFixed(1);
console.log(`SCORM package written: ${PACKAGE_NAME} (${sizeKilobytes} kB, ${files.length + 3} files)`);
