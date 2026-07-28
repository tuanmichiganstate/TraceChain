import { importJWK, SignJWT, type JWK } from "jose";
import type {
  Clock,
  IdGenerator,
} from "../../domain/simulation/environment";
import type {
  LtiPlatformRegistrationV1,
} from "../contracts/lti";

const CLIENT_ASSERTION_LIFETIME_SECONDS = 5 * 60;
const MAXIMUM_ACCESS_TOKEN_LENGTH = 8 * 1024;

export class LtiServiceOAuthError extends Error {
  constructor(
    readonly code:
      | "LTI_SERVICE_CONFIGURATION_INVALID"
      | "LTI_SERVICE_TOKEN_REQUEST_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "LtiServiceOAuthError";
  }
}

function epochSeconds(value: string): number {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new LtiServiceOAuthError(
      "LTI_SERVICE_CONFIGURATION_INVALID",
      "The LTI service clock timestamp is invalid.",
    );
  }
  return Math.floor(milliseconds / 1_000);
}

async function clientAssertion(options: {
  readonly registration: LtiPlatformRegistrationV1;
  readonly privateJwk: Readonly<Record<string, unknown>>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly jtiPrefix: string;
}): Promise<string> {
  const tokenEndpoint = options.registration.tokenEndpoint;
  if (tokenEndpoint === undefined) {
    throw new LtiServiceOAuthError(
      "LTI_SERVICE_CONFIGURATION_INVALID",
      "The LTI platform registration has no OAuth token endpoint.",
    );
  }
  try {
    const issuedAt = epochSeconds(options.clock.now());
    const key = await importJWK(
      options.privateJwk as JWK,
      "RS256",
    );
    return await new SignJWT({})
      .setProtectedHeader({
        alg: "RS256",
        kid: String(options.privateJwk.kid),
        typ: "JWT",
      })
      .setIssuer(options.registration.clientId)
      .setSubject(options.registration.clientId)
      .setAudience(tokenEndpoint)
      .setIssuedAt(issuedAt)
      .setExpirationTime(
        issuedAt + CLIENT_ASSERTION_LIFETIME_SECONDS,
      )
      .setJti(options.ids.nextId(options.jtiPrefix))
      .sign(key);
  } catch (error) {
    if (error instanceof LtiServiceOAuthError) throw error;
    throw new LtiServiceOAuthError(
      "LTI_SERVICE_CONFIGURATION_INVALID",
      "The LTI OAuth client assertion could not be signed" +
        (error instanceof Error ? `: ${error.message}` : "."),
    );
  }
}

export async function requestLtiServiceAccessToken(options: {
  readonly registration: LtiPlatformRegistrationV1;
  readonly privateJwk: Readonly<Record<string, unknown>>;
  readonly scope: string;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly jtiPrefix: string;
  readonly fetcher: typeof fetch;
}): Promise<string> {
  const tokenEndpoint = options.registration.tokenEndpoint;
  if (tokenEndpoint === undefined) {
    throw new LtiServiceOAuthError(
      "LTI_SERVICE_CONFIGURATION_INVALID",
      "The LTI platform registration has no OAuth token endpoint.",
    );
  }
  const assertion = await clientAssertion(options);
  let response: Response;
  try {
    response = await options.fetcher(tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_assertion_type:
          "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion: assertion,
        scope: options.scope,
      }),
      redirect: "error",
    });
  } catch (error) {
    throw new LtiServiceOAuthError(
      "LTI_SERVICE_TOKEN_REQUEST_FAILED",
      "The Moodle OAuth token endpoint could not be reached" +
        (error instanceof Error ? `: ${error.message}` : "."),
    );
  }
  if (!response.ok) {
    throw new LtiServiceOAuthError(
      "LTI_SERVICE_TOKEN_REQUEST_FAILED",
      `The Moodle OAuth token endpoint returned ${String(response.status)}.`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LtiServiceOAuthError(
      "LTI_SERVICE_TOKEN_REQUEST_FAILED",
      "The Moodle OAuth token response is not valid JSON.",
    );
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new LtiServiceOAuthError(
      "LTI_SERVICE_TOKEN_REQUEST_FAILED",
      "The Moodle OAuth token response is invalid.",
    );
  }
  const token = (payload as Readonly<Record<string, unknown>>)
    .access_token;
  const tokenType = (payload as Readonly<Record<string, unknown>>)
    .token_type;
  const returnedScope = (payload as Readonly<Record<string, unknown>>)
    .scope;
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAXIMUM_ACCESS_TOKEN_LENGTH ||
    typeof tokenType !== "string" ||
    tokenType.toLowerCase() !== "bearer" ||
    (returnedScope !== undefined &&
      (typeof returnedScope !== "string" ||
        !returnedScope.split(/\s+/u).includes(options.scope)))
  ) {
    throw new LtiServiceOAuthError(
      "LTI_SERVICE_TOKEN_REQUEST_FAILED",
      "The Moodle OAuth token response does not grant the requested LTI service scope.",
    );
  }
  return token;
}
