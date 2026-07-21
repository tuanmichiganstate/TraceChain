#!/usr/bin/env node
/**
 * Localization audit (specification section 30.6).
 *
 * Fails the build when:
 *   - vi.json and en.json do not have identical key sets
 *   - a value is empty
 *   - a key is duplicated in the raw JSON (JSON.parse silently keeps the last)
 *   - placeholders differ between the two catalogues
 *   - a t("key") call in src/ references a key that does not exist
 *   - Vietnamese text appears in source outside the locale files
 *
 * The last check is the important one. It is what keeps learner-facing text
 * from drifting into components, where no translator will ever find it.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const localesDirectory = join(projectRoot, "src", "locales");
const sourceDirectory = join(projectRoot, "src");

/** Characters that only appear in Vietnamese, not in English or code. */
const VIETNAMESE_PATTERN =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/;

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function listFiles(directory, extensions) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      found.push(...listFiles(fullPath, extensions));
    } else if (extensions.some((extension) => entry.endsWith(extension))) {
      found.push(fullPath);
    }
  }
  return found;
}

function extractPlaceholders(value) {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

/** Detect duplicate keys, which JSON.parse would silently collapse. */
function findDuplicateKeys(rawJson) {
  const seen = new Set();
  const duplicates = new Set();
  for (const match of rawJson.matchAll(/^\s*"([^"]+)"\s*:/gm)) {
    const key = match[1];
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

// ---- Load catalogues --------------------------------------------------

const rawVi = readFileSync(join(localesDirectory, "vi.json"), "utf8");
const rawEn = readFileSync(join(localesDirectory, "en.json"), "utf8");
const vi = JSON.parse(rawVi);
const en = JSON.parse(rawEn);

for (const [name, raw] of [["vi.json", rawVi], ["en.json", rawEn]]) {
  for (const duplicate of findDuplicateKeys(raw)) {
    fail(`${name}: duplicate key "${duplicate}"`);
  }
}

// ---- Key parity -------------------------------------------------------

const viKeys = new Set(Object.keys(vi));
const enKeys = new Set(Object.keys(en));

for (const key of viKeys) {
  if (!enKeys.has(key)) fail(`en.json is missing key "${key}"`);
}
for (const key of enKeys) {
  if (!viKeys.has(key)) fail(`vi.json is missing key "${key}"`);
}

// ---- Values and placeholders ------------------------------------------

for (const [key, value] of Object.entries(vi)) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`vi.json: key "${key}" has an empty value`);
  }
  const enValue = en[key];
  if (typeof enValue === "string") {
    const viPlaceholders = extractPlaceholders(value);
    const enPlaceholders = extractPlaceholders(enValue);
    if (viPlaceholders.join(",") !== enPlaceholders.join(",")) {
      fail(
        `Placeholder mismatch for "${key}": vi has [${viPlaceholders}], en has [${enPlaceholders}]`,
      );
    }
  }
}

for (const [key, value] of Object.entries(en)) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`en.json: key "${key}" has an empty value`);
  }
}

// ---- Vietnamese must render with its diacritics intact -----------------

const diacriticProbe = vi["organizations.producerCoop.name"] ?? "";
if (!VIETNAMESE_PATTERN.test(diacriticProbe)) {
  fail("vi.json appears to have lost its Vietnamese diacritics");
}

// ---- Source scanning --------------------------------------------------

const sourceFiles = listFiles(sourceDirectory, [".ts", ".tsx"]).filter(
  (file) => !file.startsWith(localesDirectory),
);

const referencedKeys = new Set();

for (const file of sourceFiles) {
  const contents = readFileSync(file, "utf8");
  const relativePath = relative(projectRoot, file);
  const isTestFile = /\.test\.tsx?$/.test(file);

  for (const match of contents.matchAll(/\bt\(\s*["'`]([\w.]+)["'`]/g)) {
    referencedKeys.add(match[1]);
  }

  // Test files legitimately contain Vietnamese: several of them exist
  // specifically to prove that diacritics survive hashing and serialization.
  if (isTestFile) continue;

  contents.split("\n").forEach((line, index) => {
    const withoutComments = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    if (VIETNAMESE_PATTERN.test(withoutComments)) {
      fail(
        `${relativePath}:${index + 1} contains Vietnamese text outside the locale files. ` +
          "Move it to src/locales/vi.json and reference it by key.",
      );
    }
  });
}

for (const key of referencedKeys) {
  if (!viKeys.has(key)) {
    fail(`Source references translation key "${key}", which is not in vi.json`);
  }
}

const unusedKeys = [...viKeys].filter((key) => !referencedKeys.has(key));
if (unusedKeys.length > 0) {
  // Not an error: keys are added ahead of the screens that use them.
  warnings.push(`${unusedKeys.length} translation keys are not yet referenced in source.`);
}

// ---- Report -----------------------------------------------------------

for (const warning of warnings) {
  console.warn(`  warning  ${warning}`);
}

if (errors.length > 0) {
  console.error(`\nLocalization audit failed with ${errors.length} problem(s):\n`);
  for (const error of errors) {
    console.error(`  error  ${error}`);
  }
  console.error("");
  process.exit(1);
}

console.log(
  `Localization audit passed: ${viKeys.size} keys, vi and en in sync, ` +
    `${referencedKeys.size} referenced in source.`,
);
