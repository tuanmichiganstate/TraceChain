import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
  assertCatalogParity,
  generateContentReview,
  parseFlatStringCatalog,
} from "./generate-content-review.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

test("flat locale parsing rejects duplicate keys before JSON can overwrite them", () => {
  assert.throws(
    () => parseFlatStringCatalog('{"same":"first","same":"second"}', "duplicate.json"),
    /duplicate locale key "same"/u,
  );
});

test("locale parity rejects keys missing from either language", () => {
  const vi = new Map([["only.vi", "Tiếng Việt"]]);
  const en = new Map([["only.en", "English"]]);
  assert.throws(() => assertCatalogParity(vi, en), /Missing from en\.json: only\.vi/u);
});

test("two generations from the same sources are byte-identical", async () => {
  const first = mkdtempSync(join(tmpdir(), "tracechain-review-first-"));
  const second = mkdtempSync(join(tmpdir(), "tracechain-review-second-"));
  const sourceCommit = "0123456789abcdef0123456789abcdef01234567";
  try {
    await generateContentReview({ projectRoot, outputDirectory: first, sourceCommit });
    await generateContentReview({ projectRoot, outputDirectory: second, sourceCommit });
    const firstFiles = readdirSync(first).sort();
    assert.deepEqual(firstFiles, readdirSync(second).sort());
    for (const fileName of firstFiles) {
      assert.deepEqual(readFileSync(join(first, fileName)), readFileSync(join(second, fileName)));
    }
    const document = new JSDOM(
      readFileSync(join(first, "tracechain-content-review.html"), "utf8"),
    ).window.document;
    const expectedLocaleCount = parseFlatStringCatalog(
      readFileSync(join(projectRoot, "src/locales/vi.json"), "utf8"),
      "src/locales/vi.json",
    ).size;
    assert.equal(document.querySelectorAll("h1").length, 1);
    assert.equal(document.querySelectorAll("[data-locale-key]").length, expectedLocaleCount);
    for (const link of document.querySelectorAll('nav a[href^="#"]')) {
      assert.notEqual(document.getElementById(link.getAttribute("href").slice(1)), null);
    }
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});
