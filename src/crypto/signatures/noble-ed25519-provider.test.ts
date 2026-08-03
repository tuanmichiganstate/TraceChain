import { describe, expect, it } from "vitest";
import {
  decodeBase64Url,
  encodeBase64Url,
} from "./base64url";
import { NobleEd25519Provider } from "./noble-ed25519-provider";
import type {
  EducationalPrivateKey,
  EducationalPublicKey,
} from "./types";

// RFC 8032, section 7.1, test vector 1. The DER wrappers are the standard
// PKCS#8 and SPKI encodings for the vector's 32-byte seed and public key.
const privateKey: EducationalPrivateKey = {
  algorithm: "Ed25519",
  pkcs8Base64Url:
    "MC4CAQAwBQYDK2VwBCIEIJ1hsZ3v_VpguoRK9JLsLMREScVpezJpGXA7rAMcrn9g",
};
const publicKey: EducationalPublicKey = {
  algorithm: "Ed25519",
  spkiBase64Url:
    "MCowBQYDK2VwAyEA11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
};
const expectedSignature =
  "5VZDAMNgrHKQhuLMgG6CioSHfx645dl02HPgZSJJAVVfuIIVkKM7rMYeOXAc-bRr0lv18FlbviRlUUFDjnoQCw";

describe("NobleEd25519Provider", () => {
  it("matches the RFC 8032 known-answer vector and signs deterministically", async () => {
    const provider = new NobleEd25519Provider();
    const message = new Uint8Array();

    const first = await provider.sign(privateKey, message);
    const second = await provider.sign(privateKey, message);

    expect(encodeBase64Url(first)).toBe(expectedSignature);
    expect(first).toEqual(second);
    await expect(provider.verify(publicKey, message, first)).resolves.toBe(true);
  });

  it("rejects modified messages, modified signatures, and the wrong public key", async () => {
    const provider = new NobleEd25519Provider();
    const message = new TextEncoder().encode("SimuLedger");
    const signature = await provider.sign(privateKey, message);
    const modifiedSignature = signature.slice();
    modifiedSignature[0] = (modifiedSignature[0] as number) ^ 1;
    const wrongPublicKey: EducationalPublicKey = {
      ...publicKey,
      spkiBase64Url:
        "MCowBQYDK2VwAyEAWOKnHCCYHG5Je6FjAJ4Yp4HnjtSTmkkykdC2qJpGf18",
    };

    await expect(
      provider.verify(
        publicKey,
        new TextEncoder().encode("SimuLedger!"),
        signature,
      ),
    ).resolves.toBe(false);
    await expect(
      provider.verify(publicKey, message, modifiedSignature),
    ).resolves.toBe(false);
    await expect(
      provider.verify(wrongPublicKey, message, signature),
    ).resolves.toBe(false);
  });

  it("derives a stable public-key fingerprint and round-trips base64url", async () => {
    const provider = new NobleEd25519Provider();
    const encoded = publicKey.spkiBase64Url;

    expect(encodeBase64Url(decodeBase64Url(encoded))).toBe(encoded);
    await expect(provider.fingerprint(publicKey)).resolves.toBe(
      "SHA-256:06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9",
    );
  });

  it("rejects non-canonical DER wrappers", async () => {
    const provider = new NobleEd25519Provider();
    const malformed = {
      ...privateKey,
      pkcs8Base64Url: privateKey.pkcs8Base64Url.slice(1),
    };
    await expect(
      provider.sign(malformed, new Uint8Array()),
    ).rejects.toThrow("canonical PKCS#8");
  });
});
