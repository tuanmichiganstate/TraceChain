import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { embedConfiguration } from "../src/config/hash";
import { TECHNICAL_LAB_PRESET } from "../src/config/presets";
import { sha256Hex } from "../src/infrastructure/hashing/sha256";
import { technicalLabCryptographicRuntime } from "../src/technical-lab/cryptographic-runtime";
import { createPermissionedFoundationsLabBundle } from "../src/technical-lab/permissioned-foundations-pack-definition";
import { installScormApi, peek } from "./scorm-harness";

const configuration = {
  ...structuredClone(TECHNICAL_LAB_PRESET),
  locale: "en" as const,
};

const permissionedFoundationsLabBundle =
  createPermissionedFoundationsLabBundle({
    vi: JSON.parse(
      readFileSync(
        new URL("../src/locales/vi.json", import.meta.url),
        "utf8",
      ),
    ) as Readonly<Record<string, string>>,
    en: JSON.parse(
      readFileSync(
        new URL("../src/locales/en.json", import.meta.url),
        "utf8",
      ),
    ) as Readonly<Record<string, string>>,
  });

const cryptographicFiles = {
  "identity-registry.json":
    technicalLabCryptographicRuntime.identityRegistry,
  "educational-signing-keys.json":
    technicalLabCryptographicRuntime.signingKeys,
  "authorization-policies.json":
    technicalLabCryptographicRuntime.authorizationPolicies,
  "endorsement-policies.json":
    technicalLabCryptographicRuntime.endorsementPolicies,
} as const;

const runtimeFiles: Readonly<Record<string, unknown>> = {
  "tracechain.config.json": embedConfiguration(configuration),
  "technical-lab-pack.json":
    permissionedFoundationsLabBundle,
  ...cryptographicFiles,
  "build-info.json": {
    technicalLabPackHash: sha256Hex(
      `${JSON.stringify(
        permissionedFoundationsLabBundle,
        null,
        2,
      )}\n`,
    ),
    technicalLabPackContentHash:
      permissionedFoundationsLabBundle.pack.publication
        ?.contentHash,
    technicalLabPersistenceSchemaVersion: "TL1",
    cryptographicEvidenceSchemaVersion: "2",
    cryptographicRuntimeHashes: Object.fromEntries(
      Object.entries(cryptographicFiles).map(
        ([fileName, value]) => [
          fileName,
          sha256Hex(`${JSON.stringify(value, null, 2)}\n`),
        ],
      ),
    ),
  },
};

async function installTechnicalLabRuntime(page: Page): Promise<void> {
  await page.route(
    /\/(?:technical-lab-runtime\/)?(?:tracechain\.config|technical-lab-pack|build-info|identity-registry|educational-signing-keys|authorization-policies|endorsement-policies)\.json$/u,
    async (route) => {
      const fileName = new URL(route.request().url()).pathname
        .split("/")
        .at(-1)!;
      const value = runtimeFiles[fileName];
      await route.fulfill(
        value === undefined
          ? { status: 404, body: "Not found" }
          : {
              contentType: "application/json",
              body: JSON.stringify(value),
            },
      );
    },
  );
}

test("runs and resumes a genuine Technical Laboratory module", async ({
  page,
  context,
}) => {
  await installScormApi(page);
  await installTechnicalLabRuntime(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Permissioned Blockchain Foundations Laboratory",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Signing, signature verification, canonical serialization",
      { exact: false },
    ),
  ).toBeVisible();

  for (const action of [
    "inspect the authored input",
    "compute SHA-256",
    "change one bounded input value",
    "compute SHA-256",
    "compare proposal digests",
  ]) {
    await page
      .getByRole("button", { name: `Run: ${action}` })
      .click();
  }

  const interpretation = page
    .getByRole("heading", { name: "Explain the result" })
    .locator("..");
  await interpretation
    .getByLabel(
      "The checked content has not changed relative to the recorded digest.",
    )
    .check();
  await interpretation
    .getByRole("button", { name: "Submit answer" })
    .click();

  const application = page
    .getByRole("heading", { name: "Apply the mechanism" })
    .locator("..");
  await application
    .getByLabel(
      "Keep the document off chain and record its genuine content digest on chain.",
    )
    .check();
  await application
    .getByRole("button", { name: "Submit answer" })
    .click();

  await expect(
    page.getByText(
      "Module complete. Its experiment and checkpoint history are retained.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Current score: 10 / 100")).toBeVisible();
  const stored = await peek(page, "cmi.suspend_data");
  expect(stored.startsWith("TL1.")).toBe(true);
  expect(stored.length).toBeLessThan(3_800);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);

  const resumed = await context.newPage();
  await installScormApi(resumed, {
    initialValues: {
      "cmi.core.entry": "resume",
      "cmi.core.lesson_status": "incomplete",
      "cmi.core.lesson_location": "TL1",
      "cmi.suspend_data": stored,
    },
  });
  await installTechnicalLabRuntime(resumed);
  await resumed.goto("/");
  await expect(
    resumed.getByRole("button", {
      name: "Continue to next module",
    }),
  ).toBeVisible();
  await expect(
    resumed.getByText("Current score: 10 / 100"),
  ).toBeVisible();
});
