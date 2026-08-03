import assert from "node:assert/strict";
import test from "node:test";
import {
  assertStaticApplicationBuildPaths,
  classifyPackageBuild,
  classifyPackageFileName,
} from "./scorm-package-policy.mjs";

test("a clean strict build is a release build", () => {
  assert.deepEqual(
    classifyPackageBuild({ dirty: false, allowDirty: false }),
    { releaseBuild: true, reproducibleSource: true },
  );
});

test("a dirty strict build is rejected", () => {
  assert.throws(
    () => classifyPackageBuild({ dirty: true, allowDirty: false }),
    /clean working tree/u,
  );
});

test("--allow-dirty always marks output as non-release", () => {
  for (const dirty of [false, true]) {
    assert.deepEqual(
      classifyPackageBuild({ dirty, allowDirty: true }),
      { releaseBuild: false, reproducibleSource: false },
    );
  }
});

test("non-release archives carry an unambiguous filename suffix", () => {
  assert.equal(
    classifyPackageFileName("SimuLedger_Guided_vi_v2.1.0.zip", false),
    "SimuLedger_Guided_vi_v2.1.0_NON_RELEASE.zip",
  );
  assert.equal(
    classifyPackageFileName("SimuLedger_Guided_vi_v2.1.0.zip", true),
    "SimuLedger_Guided_vi_v2.1.0.zip",
  );
});

test("package filename classification rejects non-ZIP names", () => {
  assert.throws(
    () => classifyPackageFileName("SimuLedger_Guided_vi_v2.1.0", false),
    /end in \.zip/u,
  );
});

test("SCORM input rejects a nested hosted Sites bundle", () => {
  assert.doesNotThrow(() =>
    assertStaticApplicationBuildPaths([
      "index.html",
      "assets/index.js",
      "scenario.json",
    ]),
  );
  assert.throws(
    () =>
      assertStaticApplicationBuildPaths([
        "index.html",
        "assets/index.js",
        "client/scorm-packages/package.zip",
      ]),
    /cannot reuse hosted build content/u,
  );
});
