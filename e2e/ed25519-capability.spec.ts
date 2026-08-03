import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { resolve } from "node:path";

const fixture = {
  privateKey:
    "MC4CAQAwBQYDK2VwBCIEIJ1hsZ3v_VpguoRK9JLsLMREScVpezJpGXA7rAMcrn9g",
  publicKey:
    "MCowBQYDK2VwAyEA11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
  expectedSignature:
    "5VZDAMNgrHKQhuLMgG6CioSHfx645dl02HPgZSJJAVVfuIIVkKM7r" +
    "MYeOXAc-bRr0lv18FlbviRlUUFDjnoQCw",
};

let providerBundle = "";

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      resolve(
        process.cwd(),
        "src/crypto/signatures/noble-ed25519-provider.ts",
      ),
    ],
    bundle: true,
    format: "iife",
    globalName: "SimuLedgerEd25519",
    platform: "browser",
    target: "safari15",
    write: false,
  });
  providerBundle = result.outputFiles[0]?.text ?? "";
  expect(providerBundle.length).toBeGreaterThan(0);
});

test("the selected Ed25519 provider signs and verifies identically", async ({ page }) => {
  await page.route("**/ed25519-provider.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: providerBundle,
    }),
  );
  await page.goto("/");
  await page.addScriptTag({ url: "/ed25519-provider.js" });

  const result = await page.evaluate(async (input) => {
    const encode = (value: Uint8Array): string => {
      let binary = "";
      for (const byte of value) binary += String.fromCharCode(byte);
      return btoa(binary)
        .replace(/\+/gu, "-")
        .replace(/\//gu, "_")
        .replace(/=+$/u, "");
    };
    const Provider = (
      window as typeof window & {
        SimuLedgerEd25519: {
          NobleEd25519Provider: new () => {
            sign(
              key: { algorithm: "Ed25519"; pkcs8Base64Url: string },
              message: Uint8Array,
            ): Promise<Uint8Array>;
            verify(
              key: { algorithm: "Ed25519"; spkiBase64Url: string },
              message: Uint8Array,
              signature: Uint8Array,
            ): Promise<boolean>;
          };
        };
      }
    ).SimuLedgerEd25519.NobleEd25519Provider;
    const provider = new Provider();
    const privateKey = {
      algorithm: "Ed25519" as const,
      pkcs8Base64Url: input.privateKey,
    };
    const publicKey = {
      algorithm: "Ed25519" as const,
      spkiBase64Url: input.publicKey,
    };
    const message = new Uint8Array();
    const first = await provider.sign(privateKey, message);
    const second = await provider.sign(privateKey, message);
    const modified = Uint8Array.of(1);
    return {
      signature: encode(first),
      repeatedSignature: encode(second),
      verified: await provider.verify(
        publicKey,
        message,
        first,
      ),
      modifiedVerified: await provider.verify(
        publicKey,
        modified,
        first,
      ),
    };
  }, fixture);

  expect(result).toEqual({
    signature: fixture.expectedSignature,
    repeatedSignature: fixture.expectedSignature,
    verified: true,
    modifiedVerified: false,
  });
});
