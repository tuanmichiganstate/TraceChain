/**
 * Verifies the committed content-review pack against the live locale file.
 *
 * The pack's whole value is its completeness claim, and an earlier draft made
 * that claim while containing 204 of 509 strings. This turns the claim into
 * something CI can fail on.
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const PACK = "docs/content-review/tracechain-content-review-2026-07-21.html";
const MANIFEST = "docs/content-review/MANIFEST.md";
const escape = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

if (!existsSync(PACK)) {
  console.error(`Content review pack missing: ${PACK}`);
  process.exit(1);
}

const vi = JSON.parse(readFileSync("src/locales/vi.json", "utf8"));
const raw = readFileSync(PACK);
const html = raw.toString("utf8");
const problems = [];

const keys = Object.keys(vi);
const missing = keys.filter((k) => !html.includes(escape(vi[k])));
if (missing.length > 0) {
  problems.push(`${missing.length} locale string(s) absent from the pack, e.g. ${missing.slice(0, 3).join(", ")}`);
}

// Duplicate *values* are legitimate; duplicate keys would mean a malformed file.
const seen = new Set();
for (const k of keys) {
  if (seen.has(k)) problems.push(`Duplicate locale key: ${k}`);
  seen.add(k);
}

const digest = createHash("sha256").update(raw).digest("hex");
const manifest = readFileSync(MANIFEST, "utf8");
if (!manifest.includes(digest)) {
  problems.push(`MANIFEST.md records a stale SHA-256; the pack is now ${digest}`);
}
if (!manifest.includes(`${keys.length - missing.length}/${keys.length}`)) {
  problems.push(`MANIFEST.md records a stale parity count; it is now ${keys.length - missing.length}/${keys.length}`);
}

if (problems.length > 0) {
  console.error("Content review pack is out of date:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("Regenerate the pack and update docs/content-review/MANIFEST.md.");
  process.exit(1);
}

console.log(`Content review pack verified: ${keys.length}/${keys.length} strings, sha256 ${digest.slice(0, 16)}…`);
