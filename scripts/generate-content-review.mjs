#!/usr/bin/env node
/** Deterministically generate the Vietnamese subject-review artifact. */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

export const GENERATOR_VERSION = "1.0.0";
export const FORMAT_VERSION = "1";
export const ARTIFACT_FILENAME = "tracechain-content-review.html";
export const MANIFEST_FILENAME = "MANIFEST.md";

const DEFAULT_PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_OUTPUT_DIRECTORY = "docs/content-review";
const VI_LOCALE = "src/locales/vi.json";
const EN_LOCALE = "src/locales/en.json";

const SOURCE_FILES = [
  VI_LOCALE,
  EN_LOCALE,
  "src/scenarios/coffee-traceability/",
  "src/scenarios/practice-a/",
  "src/scenarios/challenge-a/",
  "src/technical-lab/",
  "src/domain/types/scenario.ts",
  "src/domain/types/enums.ts",
  "src/domain/types/scoring.ts",
];

const REVIEW_SCOPE_EXCLUSIONS = [
  "Không loại trừ khóa ngôn ngữ nào: mọi khóa trong vi.json và en.json đều có đúng một mục rà soát.",
  "Giá trị sổ cái phát sinh lúc chạy (mã giao dịch, hàm băm, thời gian và trạng thái tài sản) không phải chuỗi trong danh mục ngôn ngữ.",
  "Dữ liệu mẫu không dịch nằm trong lệnh hoặc seed (ví dụ productName và originLocation) được giữ nguyên để hàm băm không phụ thuộc ngôn ngữ.",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function skipWhitespace(source, start) {
  let index = start;
  while (/\s/u.test(source[index] ?? "")) index += 1;
  return index;
}

function parseJsonString(source, start, fileName) {
  if (source[start] !== '"') {
    throw new Error(`${fileName}:${start + 1}: expected a JSON string`);
  }
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === '"') {
      const token = source.slice(start, index + 1);
      return { value: JSON.parse(token), next: index + 1 };
    }
    index += 1;
  }
  throw new Error(`${fileName}:${start + 1}: unterminated JSON string`);
}

/** Parse the flat string catalog without allowing JSON.parse to hide duplicate keys. */
export function parseFlatStringCatalog(source, fileName) {
  let index = skipWhitespace(source, 0);
  if (source[index] !== "{") throw new Error(`${fileName}: expected a JSON object`);
  index = skipWhitespace(source, index + 1);
  const catalog = new Map();

  while (source[index] !== "}") {
    const keyToken = parseJsonString(source, index, fileName);
    const key = keyToken.value;
    if (catalog.has(key)) throw new Error(`${fileName}: duplicate locale key "${key}"`);
    index = skipWhitespace(source, keyToken.next);
    if (source[index] !== ":") throw new Error(`${fileName}: expected ':' after "${key}"`);
    index = skipWhitespace(source, index + 1);
    const valueToken = parseJsonString(source, index, fileName);
    if (valueToken.value.length === 0) throw new Error(`${fileName}: empty value for "${key}"`);
    catalog.set(key, valueToken.value);
    index = skipWhitespace(source, valueToken.next);
    if (source[index] === ",") {
      index = skipWhitespace(source, index + 1);
      if (source[index] === "}") throw new Error(`${fileName}: trailing comma is not valid JSON`);
      continue;
    }
    if (source[index] !== "}") throw new Error(`${fileName}: expected ',' or '}'`);
  }

  index = skipWhitespace(source, index + 1);
  if (index !== source.length) throw new Error(`${fileName}: content follows the JSON object`);
  return catalog;
}

function readCatalog(projectRoot, relativePath) {
  return parseFlatStringCatalog(
    readFileSync(join(projectRoot, relativePath), "utf8"),
    relativePath,
  );
}

export function assertCatalogParity(vi, en) {
  const viKeys = [...vi.keys()].sort();
  const enKeys = [...en.keys()].sort();
  const missingEnglish = viKeys.filter((key) => !en.has(key));
  const missingVietnamese = enKeys.filter((key) => !vi.has(key));
  if (missingEnglish.length > 0 || missingVietnamese.length > 0) {
    throw new Error(
      [
        missingEnglish.length > 0
          ? `Missing from en.json: ${missingEnglish.join(", ")}`
          : "",
        missingVietnamese.length > 0
          ? `Missing from vi.json: ${missingVietnamese.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return viKeys;
}

async function loadScenario(projectRoot) {
  const cacheRoot = join(projectRoot, "node_modules", ".cache");
  mkdirSync(cacheRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(join(cacheRoot, "tracechain-review-"));
  const bundlePath = join(temporaryDirectory, "content-review.mjs");
  try {
    await build({
      entryPoints: [join(projectRoot, "scripts", "content-review-entry.ts")],
      outfile: bundlePath,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node20",
      logLevel: "silent",
    });
    return (await import(pathToFileURL(bundlePath).href)).coffeeScenario;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function addContext(contexts, key, context) {
  const existing = contexts.get(key) ?? [];
  if (!existing.includes(context)) contexts.set(key, [...existing, context]);
}

function buildScenarioReviewModel(scenario) {
  const contexts = new Map();
  addContext(contexts, scenario.titleKey, "Tên hoạt động");
  addContext(contexts, scenario.descriptionKey, "Mô tả hoạt động");
  for (const organization of scenario.organizations) {
    addContext(contexts, organization.displayNameKey, `Tổ chức ${organization.organizationId}`);
  }
  for (const actor of scenario.actors) {
    addContext(contexts, actor.displayNameKey, `Vai trò ${actor.actorId}`);
  }
  for (const location of scenario.locations) {
    addContext(contexts, location.displayNameKey, `Địa điểm ${location.locationId}`);
  }
  scenario.stages.forEach((stage, stageIndex) => {
    const stageLabel = `Bước ${stageIndex + 1} · ${stage.stageId}`;
    addContext(contexts, stage.titleKey, `${stageLabel} · tiêu đề`);
    addContext(contexts, stage.instructionKey, `${stageLabel} · lời dẫn`);
    for (const action of stage.requiredActions) {
      addContext(contexts, action.descriptionKey, `${stageLabel} · việc cần làm`);
    }
    for (const hint of stage.availableHints) {
      addContext(contexts, hint.textKey, `${stageLabel} · gợi ý`);
    }
    for (const check of stage.knowledgeChecks) {
      const checkLabel = `${stageLabel} · ${check.knowledgeCheckId}`;
      const scoreLabel = check.isScored ? `${check.points} điểm` : "không tính điểm";
      addContext(contexts, check.questionKey, `${checkLabel} · câu hỏi · ${scoreLabel}`);
      addContext(contexts, check.feedbackKey, `${checkLabel} · phản hồi`);
      addContext(contexts, check.scenarioConnectionKey, `${checkLabel} · liên hệ tình huống`);
      if (check.glossaryTermKey !== undefined) {
        addContext(contexts, check.glossaryTermKey, `${checkLabel} · thuật ngữ`);
      }
      for (const category of check.categories ?? []) {
        addContext(contexts, category.labelKey, `${checkLabel} · nhóm phân loại`);
      }
      for (const option of check.options) {
        const correctness = check.correctOptionIds.includes(option.optionId)
          ? " · ĐÁP ÁN ĐÚNG"
          : "";
        addContext(contexts, option.labelKey, `${checkLabel} · phương án${correctness}`);
      }
    }
    for (const action of stage.scoredActions) {
      addContext(
        contexts,
        action.descriptionKey,
        `${stageLabel} · thao tác chấm điểm ${action.points} điểm`,
      );
    }
  });

  return {
    scenarioId: scenario.scenarioId,
    scenarioVersion: scenario.scenarioVersion,
    estimatedMinutes: scenario.estimatedMinutes,
    maxScore: scenario.scoringConfiguration.maxScore,
    passingScore: scenario.scoringConfiguration.passingScore,
    stageIds: scenario.stages.map((stage) => stage.stageId),
    knowledgeCheckCount: scenario.stages.reduce(
      (count, stage) => count + stage.knowledgeChecks.length,
      0,
    ),
    contexts: Object.fromEntries(
      [...contexts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, values]) => [key, [...values].sort()]),
    ),
  };
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function groupForKey(key) {
  const parts = key.split(".");
  return parts[0] === "stage" && parts.length > 2
    ? `${parts[0]}.${parts[1]}`
    : (parts[0] ?? "other");
}

function renderEntry(key, vi, en, contexts) {
  const contextItems = (contexts[key] ?? [])
    .map((context) => `<li>${escapeHtml(context)}</li>`)
    .join("");
  return `<article class="entry" data-locale-key="${escapeHtml(key)}">
  <header><code>${escapeHtml(key)}</code>${contextItems ? `<ul class="context">${contextItems}</ul>` : ""}</header>
  <p class="vi" lang="vi">${escapeHtml(vi)}</p>
  <details><summary>Đối chiếu tiếng Anh</summary><p lang="en">${escapeHtml(en)}</p></details>
</article>`;
}

function renderHtml({ keys, vi, en, scenarioModel, sourceCommit, sourceDigest }) {
  const grouped = new Map();
  for (const key of keys) {
    const group = groupForKey(key);
    grouped.set(group, [...(grouped.get(group) ?? []), key]);
  }
  const groups = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
  const navigation = groups
    .map(
      ([group, groupKeys]) =>
        `<li><a href="#group-${escapeHtml(group)}"><span>${escapeHtml(group)}</span><b>${groupKeys.length}</b></a></li>`,
    )
    .join("\n");
  const sections = groups
    .map(([group, groupKeys]) => {
      const stageTitleKey = group.startsWith("stage.") ? `${group}.title` : null;
      const title = stageTitleKey !== null && vi.has(stageTitleKey)
        ? `${group} · ${vi.get(stageTitleKey)}`
        : group;
      return `<section id="group-${escapeHtml(group)}">
  <h2>${escapeHtml(title)} <span>${groupKeys.length} chuỗi</span></h2>
  ${groupKeys.map((key) => renderEntry(key, vi.get(key), en.get(key), scenarioModel.contexts)).join("\n  ")}
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Toàn bộ chuỗi ngôn ngữ tiếng Việt dành cho rà soát nội dung TraceChain.">
<title>Rà soát nội dung TraceChain</title>
<style>
:root{color-scheme:light dark;--ink:#172033;--muted:#5b6475;--page:#f4f6fa;--panel:#fff;--line:#d8deea;--brand:#28306f;--soft:#edf0fa;--good:#08664f;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--body:"Be Vietnam Pro","Segoe UI",system-ui,sans-serif}
@media(prefers-color-scheme:dark){:root{--ink:#edf0fa;--muted:#aeb6c8;--page:#111522;--panel:#1a2030;--line:#343d51;--brand:#b8c0ff;--soft:#242c41;--good:#75d8ba}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--page);color:var(--ink);font:16px/1.6 var(--body)}a{color:inherit}.skip{position:absolute;left:-9999px}.skip:focus{left:1rem;top:1rem;background:var(--panel);padding:.7rem;z-index:3}.layout{max-width:1280px;margin:auto;padding:0 1rem;display:grid;grid-template-columns:1fr;gap:2rem}@media(min-width:980px){.layout{grid-template-columns:17rem minmax(0,1fr)}nav{position:sticky;top:0;max-height:100vh;overflow:auto}}nav{padding:2rem 0}nav h2{font-size:.75rem;text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}nav ol{list-style:none;padding:0;margin:0}nav a{display:flex;justify-content:space-between;gap:.8rem;padding:.3rem .45rem;text-decoration:none;border-radius:.3rem;font:12px/1.4 var(--mono)}nav a:hover{background:var(--soft)}nav b{color:var(--muted)}main{min-width:0;padding:2.5rem 0 5rem}h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.1;margin:0;letter-spacing:-.03em}.lede{color:var(--muted);max-width:70ch}.status{margin:1.5rem 0;padding:1rem 1.2rem;background:var(--soft);border-left:4px solid var(--brand);border-radius:.3rem}.facts{display:flex;flex-wrap:wrap;gap:1rem 2rem;padding:0;margin:1.5rem 0;list-style:none}.facts b{display:block;font-size:1.25rem;color:var(--ink)}section{margin-top:4rem;scroll-margin-top:1rem}section h2{font-size:1.25rem;padding-bottom:.7rem;border-bottom:2px solid var(--brand)}section h2 span{font-size:.75rem;color:var(--muted);font-weight:400}.entry{margin:1rem 0;padding:1rem 1.1rem;background:var(--panel);border:1px solid var(--line);border-radius:.45rem;break-inside:avoid}.entry header{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:flex-start}.entry code{font:12px/1.5 var(--mono);color:var(--brand);overflow-wrap:anywhere}.context{display:flex;flex-wrap:wrap;gap:.3rem;list-style:none;padding:0;margin:0}.context li{font-size:.72rem;padding:.12rem .45rem;border-radius:99px;background:var(--soft);color:var(--muted)}.vi{font-size:1.05rem;margin:.75rem 0}.entry details{color:var(--muted);font-size:.9rem}.entry summary{cursor:pointer}.entry details p{margin:.4rem 0 0}.provenance{margin-top:4rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.82rem}.provenance code{font-family:var(--mono);overflow-wrap:anywhere}@media print{nav,.skip{display:none}.layout{display:block}.entry{background:#fff;color:#000}details{display:block}details summary{display:none}details p{display:block}}
</style>
</head>
<body>
<a class="skip" href="#main">Tới nội dung</a>
<div class="layout">
<nav aria-label="Nhóm chuỗi ngôn ngữ"><h2>Mục lục</h2><ol>${navigation}</ol></nav>
<main id="main">
<header>
  <h1>Rà soát nội dung TraceChain</h1>
  <p class="lede">Danh mục đầy đủ, được sinh trực tiếp từ hai tệp ngôn ngữ và định nghĩa kịch bản. Mỗi khóa xuất hiện đúng một lần; tiếng Anh chỉ dùng để đối chiếu.</p>
  <div class="status"><strong>Trạng thái: chưa được chuyên gia tiếng Việt rà soát.</strong> Tài liệu này không phải bằng chứng phê duyệt nội dung.</div>
  <ul class="facts">
    <li><b>${keys.length}/${keys.length}</b>chuỗi song ngữ</li>
    <li><b>${scenarioModel.stageIds.length}</b>bước</li>
    <li><b>${scenarioModel.knowledgeCheckCount}</b>câu hỏi</li>
    <li><b>${scenarioModel.passingScore}/${scenarioModel.maxScore}</b>điểm đạt</li>
    <li><b>${escapeHtml(FORMAT_VERSION)}</b>phiên bản định dạng</li>
  </ul>
</header>
${sections}
<footer class="provenance">
  <p>Nguồn: <code>${escapeHtml(sourceCommit)}</code> · SHA-256 nguồn: <code>${escapeHtml(sourceDigest)}</code> · Generator ${escapeHtml(GENERATOR_VERSION)}.</p>
  <p>Phạm vi loại trừ được ghi đầy đủ trong <code>MANIFEST.md</code>. Góp ý nên trích khóa ngôn ngữ hiển thị ở đầu mỗi mục.</p>
</footer>
</main>
</div>
</body>
</html>
`;
}

function validateArtifactRows(html, keys) {
  const rowKeys = [...html.matchAll(/data-locale-key="([^"]+)"/gu)].map((match) => match[1]);
  const duplicates = rowKeys.filter((key, index) => rowKeys.indexOf(key) !== index);
  const missing = keys.filter((key) => !rowKeys.includes(key));
  const unexpected = rowKeys.filter((key) => !keys.includes(key));
  if (duplicates.length > 0 || missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Generated locale rows are invalid: ${duplicates.length} duplicate, ` +
        `${missing.length} missing, ${unexpected.length} unexpected`,
    );
  }
}

function renderManifest({ sourceCommit, sourceDigest, artifactDigest, localeCount }) {
  const exclusions = REVIEW_SCOPE_EXCLUSIONS.map((item) => `- ${item}`).join("\n");
  const sources = SOURCE_FILES.map((source) => `- \`${source}\``).join("\n");
  return `# Content review pack

| | |
|---|---|
| Artifact | \`${ARTIFACT_FILENAME}\` |
| Generation command | \`npm run generate:content-review\` |
| Generator version | \`${GENERATOR_VERSION}\` |
| Format version | \`${FORMAT_VERSION}\` |
| Source commit | \`${sourceCommit}\` |
| Source SHA-256 | \`${sourceDigest}\` |
| Locale parity | **${localeCount}/${localeCount}** strings present, 0 missing |
| Artifact SHA-256 | \`${artifactDigest}\` |
| Review status | **Not yet reviewed** — awaiting Vietnamese subject-expert adjudication |

The source commit records the clean committed base used for generation. The
source SHA-256 covers the exact sorted locale catalogs, scenario review model,
format version, and exclusions, including any working-tree source changes.

## Authoritative sources

${sources}

## Verification

\`npm run verify:content-review\` regenerates into a temporary directory and
compares both files byte-for-byte. It does not rewrite this directory. It fails
for stale HTML, digest or parity metadata, duplicate or missing locale keys,
source changes, or exclusion drift.

## Explicit exclusions

${exclusions}

## Human review

No Vietnamese subject-expert adjudication has been supplied. Record future
decisions here against locale keys. The terminology question around “quyền lưu
giữ” remains open until a native-speaking subject expert decides it.
`;
}

function resolveSourceCommit(projectRoot) {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim();
}

export async function generateContentReview({
  projectRoot = DEFAULT_PROJECT_ROOT,
  outputDirectory = join(projectRoot, DEFAULT_OUTPUT_DIRECTORY),
  sourceCommit = resolveSourceCommit(projectRoot),
} = {}) {
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) {
    throw new Error(`Source commit must be a full lowercase SHA-1, found "${sourceCommit}"`);
  }
  const vi = readCatalog(projectRoot, VI_LOCALE);
  const en = readCatalog(projectRoot, EN_LOCALE);
  const keys = assertCatalogParity(vi, en);
  const scenario = await loadScenario(projectRoot);
  const scenarioModel = buildScenarioReviewModel(scenario);
  const missingScenarioKeys = Object.keys(scenarioModel.contexts).filter(
    (key) => !vi.has(key) || !en.has(key),
  );
  if (missingScenarioKeys.length > 0) {
    throw new Error(`Scenario references missing locale keys: ${missingScenarioKeys.join(", ")}`);
  }

  const sortedVi = Object.fromEntries(keys.map((key) => [key, vi.get(key)]));
  const sortedEn = Object.fromEntries(keys.map((key) => [key, en.get(key)]));
  const sourceDigest = sha256(
    JSON.stringify({
      formatVersion: FORMAT_VERSION,
      exclusions: REVIEW_SCOPE_EXCLUSIONS,
      vi: sortedVi,
      en: sortedEn,
      scenario: scenarioModel,
    }),
  );
  const html = renderHtml({ keys, vi, en, scenarioModel, sourceCommit, sourceDigest });
  validateArtifactRows(html, keys);
  const artifactDigest = sha256(html);
  const manifest = renderManifest({
    sourceCommit,
    sourceDigest,
    artifactDigest,
    localeCount: keys.length,
  });

  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, ARTIFACT_FILENAME), html, "utf8");
  writeFileSync(join(outputDirectory, MANIFEST_FILENAME), manifest, "utf8");
  return { artifactDigest, sourceDigest, localeCount: keys.length, sourceCommit };
}

function parseArguments(argumentsList) {
  let outputDirectory = join(DEFAULT_PROJECT_ROOT, DEFAULT_OUTPUT_DIRECTORY);
  let sourceCommit;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--output-dir") {
      const value = argumentsList[index + 1];
      if (value === undefined) throw new Error("--output-dir requires a path");
      outputDirectory = resolve(DEFAULT_PROJECT_ROOT, value);
      index += 1;
    } else if (argument === "--source-commit") {
      sourceCommit = argumentsList[index + 1];
      if (sourceCommit === undefined) throw new Error("--source-commit requires a SHA");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { outputDirectory, ...(sourceCommit === undefined ? {} : { sourceCommit }) };
}

const invokedPath = process.argv[1] === undefined ? "" : pathToFileURL(resolve(process.argv[1])).href;
if (import.meta.url === invokedPath) {
  const result = await generateContentReview(parseArguments(process.argv.slice(2)));
  console.log(
    `Content review generated: ${result.localeCount}/${result.localeCount} strings, ` +
      `sha256 ${result.artifactDigest}`,
  );
}
