import type {
  JsonWebKeySetV1,
  LtiPlatformRegistrationV1,
} from "../contracts/lti";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const PRIVATE_JWK_MEMBERS = new Set([
  "d",
  "p",
  "q",
  "dp",
  "dq",
  "qi",
  "oth",
  "k",
]);

export class LtiRegistrationError extends Error {
  constructor(
    readonly code:
      | "LTI_REGISTRATION_CONFIGURATION_INVALID"
      | "LTI_REGISTRATION_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "LtiRegistrationError";
  }
}

function invalid(message: string): never {
  throw new LtiRegistrationError(
    "LTI_REGISTRATION_CONFIGURATION_INVALID",
    message,
  );
}

function record(
  value: unknown,
  path: string,
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    invalid(`${path} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function text(
  value: unknown,
  path: string,
  maximumLength = 2048,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximumLength
  ) {
    invalid(`${path} must be bounded non-empty text.`);
  }
  return value.trim();
}

function configuredUrl(value: unknown, path: string): string {
  const candidate = text(value, path);
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    invalid(`${path} must be an absolute URL.`);
  }
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    invalid(`${path} must use HTTPS except for an explicit loopback URL.`);
  }
  if (url.username.length > 0 || url.password.length > 0) {
    invalid(`${path} must not contain URL credentials.`);
  }
  return url.toString();
}

function configuredIssuer(value: unknown, path: string): string {
  const candidate = text(value, path);
  configuredUrl(candidate, path);
  return candidate;
}

export function parsePublicJwks(
  value: unknown,
  path: string,
): JsonWebKeySetV1 {
  const candidate = record(value, path);
  if (
    !Array.isArray(candidate.keys) ||
    candidate.keys.length === 0 ||
    candidate.keys.length > 8
  ) {
    invalid(`${path}.keys must contain 1 to 8 public keys.`);
  }
  const keys = candidate.keys.map((keyValue, index) => {
    const key = record(keyValue, `${path}.keys[${String(index)}]`);
    if (
      typeof key.kty !== "string" ||
      key.kty.length === 0 ||
      typeof key.kid !== "string" ||
      key.kid.length === 0
    ) {
      invalid(`${path}.keys[${String(index)}] requires kty and kid.`);
    }
    if ([...PRIVATE_JWK_MEMBERS].some((member) => member in key)) {
      invalid(`${path}.keys[${String(index)}] must contain public material only.`);
    }
    return key;
  });
  if (new Set(keys.map((key) => key.kid)).size !== keys.length) {
    invalid(`${path}.keys must use unique key IDs.`);
  }
  return { keys };
}

export function parseLtiPlatformRegistrations(
  configuration: string | undefined,
): readonly LtiPlatformRegistrationV1[] {
  if (configuration === undefined || configuration.trim().length === 0) {
    return [];
  }
  if (configuration.length > 64 * 1024) {
    invalid("TRACECHAIN_LTI_REGISTRATIONS_JSON exceeds its size limit.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(configuration);
  } catch {
    invalid("TRACECHAIN_LTI_REGISTRATIONS_JSON is not valid JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 16) {
    invalid("LTI configuration must contain 1 to 16 registrations.");
  }
  const registrations = parsed.map((value, index) => {
    const path = `registrations[${String(index)}]`;
    const candidate = record(value, path);
    const registrationId = text(candidate.registrationId, `${path}.registrationId`, 128);
    if (!IDENTIFIER_PATTERN.test(registrationId)) {
      invalid(`${path}.registrationId is invalid.`);
    }
    const registration: LtiPlatformRegistrationV1 = {
      schemaVersion: "1.0.0",
      registrationId,
      issuer: configuredIssuer(candidate.issuer, `${path}.issuer`),
      clientId: text(candidate.clientId, `${path}.clientId`, 256),
      deploymentId: text(candidate.deploymentId, `${path}.deploymentId`, 256),
      authorizationEndpoint: configuredUrl(
        candidate.authorizationEndpoint,
        `${path}.authorizationEndpoint`,
      ),
      jwksUri: configuredUrl(candidate.jwksUri, `${path}.jwksUri`),
      ...(candidate.tokenEndpoint === undefined
        ? {}
        : {
            tokenEndpoint: configuredUrl(
              candidate.tokenEndpoint,
              `${path}.tokenEndpoint`,
            ),
          }),
      ...(candidate.platformJwks === undefined
        ? {}
        : {
            platformJwks: parsePublicJwks(
              candidate.platformJwks,
              `${path}.platformJwks`,
            ),
          }),
    };
    return registration;
  });
  const identities = registrations.map(
    (registration) =>
      `${registration.issuer}\u0000${registration.clientId}\u0000${registration.deploymentId}`,
  );
  if (
    new Set(registrations.map((registration) => registration.registrationId))
      .size !== registrations.length ||
    new Set(identities).size !== identities.length
  ) {
    invalid("LTI registrations must use unique IDs and platform identities.");
  }
  return registrations;
}

export function findLtiRegistration(options: {
  readonly registrations: readonly LtiPlatformRegistrationV1[];
  readonly issuer: string;
  readonly clientId?: string;
  readonly deploymentId?: string;
}): LtiPlatformRegistrationV1 {
  const matches = options.registrations.filter(
    (registration) =>
      registration.issuer === options.issuer &&
      (options.clientId === undefined ||
        registration.clientId === options.clientId) &&
      (options.deploymentId === undefined ||
        registration.deploymentId === options.deploymentId),
  );
  if (matches.length !== 1) {
    throw new LtiRegistrationError(
      "LTI_REGISTRATION_NOT_FOUND",
      "The LTI launch does not match one active platform registration.",
    );
  }
  return matches[0]!;
}

export function parseToolPublicJwks(
  configuration: string | undefined,
): JsonWebKeySetV1 {
  if (configuration === undefined || configuration.trim().length === 0) {
    throw new LtiRegistrationError(
      "LTI_REGISTRATION_CONFIGURATION_INVALID",
      "TRACECHAIN_LTI_TOOL_JWKS_JSON is required for the LTI keyset endpoint.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(configuration);
  } catch {
    invalid("TRACECHAIN_LTI_TOOL_JWKS_JSON is not valid JSON.");
  }
  return parsePublicJwks(parsed, "toolJwks");
}

export function parseToolPrivateJwk(
  configuration: string | undefined,
  publicJwks: JsonWebKeySetV1,
): Readonly<Record<string, unknown>> {
  if (configuration === undefined || configuration.trim().length === 0) {
    throw new LtiRegistrationError(
      "LTI_REGISTRATION_CONFIGURATION_INVALID",
      "TRACECHAIN_LTI_TOOL_PRIVATE_JWK_JSON is required for LTI service signing.",
    );
  }
  if (configuration.length > 32 * 1024) {
    invalid("TRACECHAIN_LTI_TOOL_PRIVATE_JWK_JSON exceeds its size limit.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(configuration);
  } catch {
    invalid("TRACECHAIN_LTI_TOOL_PRIVATE_JWK_JSON is not valid JSON.");
  }
  const key = record(parsed, "toolPrivateJwk");
  const requiredMembers = [
    "kty",
    "kid",
    "alg",
    "use",
    "n",
    "e",
    "d",
    "p",
    "q",
    "dp",
    "dq",
    "qi",
  ] as const;
  if (
    requiredMembers.some(
      (member) =>
        typeof key[member] !== "string" ||
        (key[member] as string).length === 0,
    ) ||
    key.kty !== "RSA" ||
    key.alg !== "RS256" ||
    key.use !== "sig"
  ) {
    invalid(
      "toolPrivateJwk must be one complete RSA RS256 signing key.",
    );
  }
  const publicMatch = publicJwks.keys.find(
    (candidate) =>
      candidate.kid === key.kid &&
      candidate.kty === "RSA" &&
      candidate.alg === "RS256" &&
      candidate.use === "sig",
  );
  if (
    publicMatch === undefined ||
    publicMatch.n !== key.n ||
    publicMatch.e !== key.e
  ) {
    invalid(
      "toolPrivateJwk must match one public key exposed by the tool JWKS.",
    );
  }
  return key;
}
