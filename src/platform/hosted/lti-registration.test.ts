import { describe, expect, it } from "vitest";
import {
  parseLtiPlatformRegistrations,
  parseToolPublicJwks,
} from "./lti-registration";

const publicJwk = {
  kty: "RSA",
  kid: "PUBLIC_KEY_001",
  use: "sig",
  alg: "RS256",
  n: "PUBLIC_MODULUS",
  e: "AQAB",
};

function registration(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    registrationId: "MOODLE_001",
    issuer: "https://moodle.example",
    clientId: "TRACECHAIN_CLIENT",
    deploymentId: "TRACECHAIN_DEPLOYMENT",
    authorizationEndpoint:
      "https://moodle.example/mod/lti/auth.php",
    jwksUri: "https://moodle.example/mod/lti/certs.php",
    ...overrides,
  };
}

describe("LTI registration validation", () => {
  it("preserves the exact issuer identifier", () => {
    const [parsed] = parseLtiPlatformRegistrations(
      JSON.stringify([registration()]),
    );

    expect(parsed?.issuer).toBe("https://moodle.example");
    expect(parsed?.authorizationEndpoint).toBe(
      "https://moodle.example/mod/lti/auth.php",
    );
  });

  it("rejects private material in a public keyset", () => {
    expect(() =>
      parseToolPublicJwks(
        JSON.stringify({
          keys: [{ ...publicJwk, d: "PRIVATE_EXPONENT" }],
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "LTI_REGISTRATION_CONFIGURATION_INVALID",
      }),
    );
  });

  it("rejects duplicate platform identities", () => {
    expect(() =>
      parseLtiPlatformRegistrations(
        JSON.stringify([
          registration(),
          registration({ registrationId: "MOODLE_002" }),
        ]),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "LTI_REGISTRATION_CONFIGURATION_INVALID",
      }),
    );
  });
});
