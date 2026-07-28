import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
} from "jose";
import type { Clock } from "../../domain/simulation/environment";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import {
  LTI_CONTEXT_CLAIM,
  LTI_CUSTOM_CLAIM,
  LTI_DEPLOYMENT_ID_CLAIM,
  LTI_INSTRUCTOR_ROLE,
  LTI_LAUNCH_PRESENTATION_CLAIM,
  LTI_LEARNER_ROLE,
  LTI_MESSAGE_TYPE_CLAIM,
  LTI_RESOURCE_LINK_CLAIM,
  LTI_ROLES_CLAIM,
  LTI_VERSION_CLAIM,
  type LtiApplicationRole,
  type LtiLearningContextV1,
  type LtiPlatformRegistrationV1,
} from "../contracts/lti";
import type { HostedAssignmentV1 } from "../contracts/assessment";
import {
  D1LtiAuthenticationRepository,
  type ConsumedLtiLoginState,
} from "../persistence/d1-lti-authentication-repository";
import {
  findLtiRegistration,
} from "./lti-registration";

export const LTI_SESSION_COOKIE = "__Host-tracechain-lti";
const LTI_LOGIN_STATE_LIFETIME_MS = 10 * 60 * 1000;
const LTI_SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const MAXIMUM_LTI_PARAMETER_LENGTH = 8 * 1024;

const remoteKeySets = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();

export class LtiAuthenticationError extends Error {
  constructor(
    readonly code:
      | "LTI_REQUEST_INVALID"
      | "LTI_LOGIN_STATE_INVALID"
      | "LTI_TOKEN_INVALID"
      | "LTI_INSTRUCTOR_ROLE_REQUIRED"
      | "LTI_CONTEXT_REQUIRED"
      | "LTI_SESSION_REQUIRED"
      | "LTI_ASSIGNMENT_REQUIRED"
      | "LTI_ASSIGNMENT_ACCESS_DENIED",
    message: string,
    readonly recoveryPath: "/instructor" | "/learner" =
      "/instructor",
  ) {
    super(message);
    this.name = "LtiAuthenticationError";
  }
}

function boundedParameter(
  value: string | null | undefined,
  name: string,
  required = true,
): string | undefined {
  const normalized = value?.trim();
  if (
    normalized === undefined ||
    normalized.length === 0
  ) {
    if (!required) return undefined;
    throw new LtiAuthenticationError(
      "LTI_REQUEST_INVALID",
      `${name} is required.`,
    );
  }
  if (normalized.length > MAXIMUM_LTI_PARAMETER_LENGTH) {
    throw new LtiAuthenticationError(
      "LTI_REQUEST_INVALID",
      `${name} exceeds its size limit.`,
    );
  }
  return normalized;
}

function opaqueToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function isoAfter(now: string, durationMs: number): string {
  const milliseconds = Date.parse(now);
  if (!Number.isFinite(milliseconds)) {
    throw new LtiAuthenticationError(
      "LTI_REQUEST_INVALID",
      "The server clock did not provide a valid timestamp.",
    );
  }
  return new Date(milliseconds + durationMs).toISOString();
}

function sameOriginLtiLaunchTarget(
  request: Request,
  value: string,
): string {
  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new LtiAuthenticationError(
      "LTI_REQUEST_INVALID",
      "target_link_uri must be an absolute URL.",
    );
  }
  const requestUrl = new URL(request.url);
  if (
    target.origin !== requestUrl.origin ||
    target.pathname !== "/api/lti/v1/launch" ||
    target.search.length > 0 ||
    target.hash.length > 0
  ) {
    throw new LtiAuthenticationError(
      "LTI_REQUEST_INVALID",
      "target_link_uri must be the registered TraceChain launch endpoint.",
    );
  }
  return target.toString();
}

function objectClaim(
  payload: JWTPayload,
  name: string,
): Readonly<Record<string, unknown>> {
  const value = payload[name];
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new LtiAuthenticationError(
      "LTI_TOKEN_INVALID",
      `${name} must be an object claim.`,
    );
  }
  return value as Readonly<Record<string, unknown>>;
}

function claimText(
  value: unknown,
  name: string,
  maximumLength = 2048,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximumLength
  ) {
    throw new LtiAuthenticationError(
      "LTI_TOKEN_INVALID",
      `${name} must be bounded non-empty text.`,
    );
  }
  return value.trim();
}

function optionalClaimText(
  value: unknown,
  maximumLength: number,
): string | undefined {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximumLength
    ? value.trim()
    : undefined;
}

function safeReturnUrl(
  value: unknown,
  registration: LtiPlatformRegistrationV1,
): string | undefined {
  const candidate = optionalClaimText(value, 2048);
  if (candidate === undefined) return undefined;
  try {
    const returnUrl = new URL(candidate);
    const issuer = new URL(registration.issuer);
    return returnUrl.origin === issuer.origin
      ? returnUrl.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function sessionCookie(token: string, maximumAgeSeconds: number): string {
  return [
    `${LTI_SESSION_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${String(maximumAgeSeconds)}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function clearLtiSessionCookie(): string {
  return sessionCookie("", 0);
}

export function ltiSessionToken(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (cookie === null) return null;
  for (const part of cookie.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === LTI_SESSION_COOKIE) {
      const value = valueParts.join("=");
      return /^[A-Za-z0-9_-]{32,256}$/u.test(value) ? value : null;
    }
  }
  return null;
}

export interface LtiLoginRequest {
  readonly issuer: string;
  readonly loginHint: string;
  readonly targetLinkUri: string;
  readonly clientId?: string;
  readonly deploymentId?: string;
  readonly messageHint?: string;
}

export function parseLtiLoginRequest(
  request: Request,
  parameters: URLSearchParams,
): LtiLoginRequest {
  const clientId = boundedParameter(
    parameters.get("client_id"),
    "client_id",
    false,
  );
  const deploymentId = boundedParameter(
    parameters.get("lti_deployment_id"),
    "lti_deployment_id",
    false,
  );
  const messageHint = boundedParameter(
    parameters.get("lti_message_hint"),
    "lti_message_hint",
    false,
  );
  return {
    issuer: boundedParameter(parameters.get("iss"), "iss")!,
    loginHint: boundedParameter(
      parameters.get("login_hint"),
      "login_hint",
    )!,
    targetLinkUri: sameOriginLtiLaunchTarget(
      request,
      boundedParameter(
        parameters.get("target_link_uri"),
        "target_link_uri",
      )!,
    ),
    ...(clientId === undefined ? {} : { clientId }),
    ...(deploymentId === undefined ? {} : { deploymentId }),
    ...(messageHint === undefined ? {} : { messageHint }),
  };
}

export async function beginLtiLogin(options: {
  readonly request: Request;
  readonly input: LtiLoginRequest;
  readonly registrations: readonly LtiPlatformRegistrationV1[];
  readonly repository: D1LtiAuthenticationRepository;
  readonly clock: Clock;
}): Promise<Response> {
  const registration = findLtiRegistration({
    registrations: options.registrations,
    issuer: options.input.issuer,
    ...(options.input.clientId === undefined
      ? {}
      : { clientId: options.input.clientId }),
    ...(options.input.deploymentId === undefined
      ? {}
      : { deploymentId: options.input.deploymentId }),
  });
  const state = opaqueToken();
  const nonce = opaqueToken();
  const now = options.clock.now();
  await options.repository.createLoginState({
    stateHash: sha256Hex(state),
    nonceHash: sha256Hex(nonce),
    registrationId: registration.registrationId,
    targetLinkUri: options.input.targetLinkUri,
    expiresAt: isoAfter(now, LTI_LOGIN_STATE_LIFETIME_MS),
  });

  const authorizationUrl = new URL(
    registration.authorizationEndpoint,
  );
  authorizationUrl.searchParams.set("scope", "openid");
  authorizationUrl.searchParams.set("response_type", "id_token");
  authorizationUrl.searchParams.set("response_mode", "form_post");
  authorizationUrl.searchParams.set("prompt", "none");
  authorizationUrl.searchParams.set(
    "client_id",
    registration.clientId,
  );
  authorizationUrl.searchParams.set(
    "redirect_uri",
    new URL("/api/lti/v1/launch", options.request.url).toString(),
  );
  authorizationUrl.searchParams.set(
    "login_hint",
    options.input.loginHint,
  );
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("nonce", nonce);
  if (options.input.messageHint !== undefined) {
    authorizationUrl.searchParams.set(
      "lti_message_hint",
      options.input.messageHint,
    );
  }
  return new Response(null, {
    status: 302,
    headers: {
      "cache-control": "no-store",
      location: authorizationUrl.toString(),
    },
  });
}

function keySetFor(
  registration: LtiPlatformRegistrationV1,
) {
  if (registration.platformJwks !== undefined) {
    return createLocalJWKSet(
      registration.platformJwks as unknown as JSONWebKeySet,
    );
  }
  const existing = remoteKeySets.get(registration.jwksUri);
  if (existing !== undefined) return existing;
  const created = createRemoteJWKSet(new URL(registration.jwksUri), {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60 * 1_000,
  });
  remoteKeySets.set(registration.jwksUri, created);
  return created;
}

async function verifiedLaunchPayload(options: {
  readonly idToken: string;
  readonly loginState: ConsumedLtiLoginState;
  readonly registration: LtiPlatformRegistrationV1;
}): Promise<JWTPayload> {
  try {
    const verified = await jwtVerify(
      options.idToken,
      keySetFor(options.registration),
      {
        algorithms: ["RS256"],
        issuer: options.registration.issuer,
        audience: options.registration.clientId,
        clockTolerance: 10,
        maxTokenAge: 5 * 60,
        requiredClaims: ["sub", "iat", "exp", "nonce"],
      },
    );
    if (
      Array.isArray(verified.payload.aud) &&
      verified.payload.aud.length > 1 &&
      verified.payload.azp !== options.registration.clientId
    ) {
      throw new LtiAuthenticationError(
        "LTI_TOKEN_INVALID",
        "A multi-audience LTI token must identify TraceChain as its authorized party.",
      );
    }
    if (
      sha256Hex(claimText(verified.payload.nonce, "nonce")) !==
      options.loginState.nonceHash
    ) {
      throw new LtiAuthenticationError(
        "LTI_TOKEN_INVALID",
        "The LTI launch nonce does not match the initiated login.",
      );
    }
    return verified.payload;
  } catch (error) {
    if (error instanceof LtiAuthenticationError) throw error;
    throw new LtiAuthenticationError(
      "LTI_TOKEN_INVALID",
      "The LTI launch token is invalid.",
    );
  }
}

function learningContext(
  payload: JWTPayload,
  registration: LtiPlatformRegistrationV1,
): {
  readonly context: LtiLearningContextV1;
  readonly roles: readonly string[];
  readonly applicationRole: LtiApplicationRole;
  readonly assignmentId?: string;
} {
  if (payload[LTI_VERSION_CLAIM] !== "1.3.0") {
    throw new LtiAuthenticationError(
      "LTI_TOKEN_INVALID",
      "The LTI version claim is not supported.",
    );
  }
  if (payload[LTI_MESSAGE_TYPE_CLAIM] !== "LtiResourceLinkRequest") {
    throw new LtiAuthenticationError(
      "LTI_TOKEN_INVALID",
      "Only an LTI resource-link launch is supported.",
    );
  }
  if (
    payload[LTI_DEPLOYMENT_ID_CLAIM] !== registration.deploymentId
  ) {
    throw new LtiAuthenticationError(
      "LTI_TOKEN_INVALID",
      "The LTI deployment does not match the registered Moodle deployment.",
    );
  }
  const rolesValue = payload[LTI_ROLES_CLAIM];
  if (
    !Array.isArray(rolesValue) ||
    !rolesValue.every((role) => typeof role === "string")
  ) {
    throw new LtiAuthenticationError(
      "LTI_INSTRUCTOR_ROLE_REQUIRED",
      "The Moodle launch does not carry a supported application role.",
    );
  }
  const applicationRole: LtiApplicationRole =
    rolesValue.includes(LTI_INSTRUCTOR_ROLE)
      ? "instructor"
      : rolesValue.includes(LTI_LEARNER_ROLE)
        ? "learner"
        : (() => {
            throw new LtiAuthenticationError(
              "LTI_INSTRUCTOR_ROLE_REQUIRED",
              "The Moodle launch does not carry a supported TraceChain role.",
            );
          })();
  const contextClaim = objectClaim(payload, LTI_CONTEXT_CLAIM);
  const contextId = claimText(
    contextClaim.id,
    `${LTI_CONTEXT_CLAIM}.id`,
    512,
  );
  const resourceLinkClaim = objectClaim(
    payload,
    LTI_RESOURCE_LINK_CLAIM,
  );
  const resourceLinkId = claimText(
    resourceLinkClaim.id,
    `${LTI_RESOURCE_LINK_CLAIM}.id`,
    512,
  );
  const launchPresentation =
    typeof payload[LTI_LAUNCH_PRESENTATION_CLAIM] === "object" &&
    payload[LTI_LAUNCH_PRESENTATION_CLAIM] !== null &&
    !Array.isArray(payload[LTI_LAUNCH_PRESENTATION_CLAIM])
      ? (payload[LTI_LAUNCH_PRESENTATION_CLAIM] as Readonly<
          Record<string, unknown>
        >)
      : {};
  const contextLabel = optionalClaimText(contextClaim.label, 200);
  const contextTitle = optionalClaimText(contextClaim.title, 500);
  const returnUrl = safeReturnUrl(
    launchPresentation.return_url,
    registration,
  );
  let assignmentId: string | undefined;
  if (applicationRole === "learner") {
    const custom = payload[LTI_CUSTOM_CLAIM];
    if (
      typeof custom !== "object" ||
      custom === null ||
      Array.isArray(custom)
    ) {
      throw new LtiAuthenticationError(
        "LTI_ASSIGNMENT_REQUIRED",
        "A learner launch must identify one TraceChain assignment.",
        "/learner",
      );
    }
    const candidate = (custom as Readonly<Record<string, unknown>>)
      .tracechain_assignment_id;
    if (
      typeof candidate !== "string" ||
      candidate.trim().length === 0 ||
      candidate.length > 128 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(candidate.trim())
    ) {
      throw new LtiAuthenticationError(
        "LTI_ASSIGNMENT_REQUIRED",
        "The learner launch assignment identifier is missing or invalid.",
        "/learner",
      );
    }
    assignmentId = candidate.trim();
  }
  return {
    roles: [...new Set(rolesValue)].sort(),
    applicationRole,
    ...(assignmentId === undefined ? {} : { assignmentId }),
    context: {
      schemaVersion: "1.0.0",
      provider: "lti-1.3",
      issuer: registration.issuer,
      clientId: registration.clientId,
      deploymentId: registration.deploymentId,
      contextId,
      resourceLinkId,
      ...(contextLabel === undefined ? {} : { contextLabel }),
      ...(contextTitle === undefined ? {} : { contextTitle }),
      ...(returnUrl === undefined ? {} : { returnUrl }),
    },
  };
}

function assignmentMatchesLaunch(
  assignment: HostedAssignmentV1,
  context: LtiLearningContextV1,
): boolean {
  const assignedContext = assignment.learningContext;
  return (
    assignedContext !== undefined &&
    assignedContext.issuer === context.issuer &&
    assignedContext.clientId === context.clientId &&
    assignedContext.deploymentId === context.deploymentId &&
    assignedContext.contextId === context.contextId
  );
}

export interface LtiLearnerAssignmentResolver {
  find(assignmentId: string): Promise<HostedAssignmentV1 | null>;
}

export async function completeLtiLaunch(options: {
  readonly idToken: string;
  readonly state: string;
  readonly registrations: readonly LtiPlatformRegistrationV1[];
  readonly repository: D1LtiAuthenticationRepository;
  readonly assignmentResolver: LtiLearnerAssignmentResolver;
  readonly clock: Clock;
}): Promise<Response> {
  const loginState = await options.repository.consumeLoginState(
    sha256Hex(options.state),
  );
  const registration = options.registrations.find(
    (candidate) =>
      candidate.registrationId === loginState.registrationId,
  );
  if (registration === undefined) {
    throw new LtiAuthenticationError(
      "LTI_LOGIN_STATE_INVALID",
      "The initiated LTI registration is no longer active.",
    );
  }
  const payload = await verifiedLaunchPayload({
    idToken: options.idToken,
    loginState,
    registration,
  });
  const {
    context,
    roles,
    applicationRole,
    assignmentId,
  } = learningContext(payload, registration);
  const assignment =
    applicationRole === "learner" && assignmentId !== undefined
      ? await options.assignmentResolver.find(assignmentId)
      : undefined;
  if (
    applicationRole === "learner" &&
    (assignment === null ||
      assignment === undefined ||
      !assignmentMatchesLaunch(assignment, context))
  ) {
    throw new LtiAuthenticationError(
      "LTI_ASSIGNMENT_ACCESS_DENIED",
      "The learner launch is not bound to this Moodle course and TraceChain assignment.",
      "/learner",
    );
  }
  const subject = claimText(payload.sub, "sub", 512);
  const email = optionalClaimText(payload.email, 320);
  const displayName = optionalClaimText(payload.name, 200);
  const userId = await options.repository.resolveOrProvisionUser({
    issuer: registration.issuer,
    clientId: registration.clientId,
    deploymentId: registration.deploymentId,
    subject,
    ...(email === undefined ? {} : { email }),
    ...(displayName === undefined ? {} : { displayName }),
    applicationRole,
    ...(assignment === undefined || assignment === null
      ? {}
      : {
          assignment: {
            assignmentId: assignment.assignmentId,
            assignedByUserId: assignment.createdByUserId,
          },
        }),
  });
  const sessionToken = opaqueToken(48);
  const issuedAt = options.clock.now();
  const expiresAt = isoAfter(issuedAt, LTI_SESSION_LIFETIME_MS);
  await options.repository.createSession(
    {
      sessionTokenHash: sha256Hex(sessionToken),
      registrationId: registration.registrationId,
      issuer: registration.issuer,
      clientId: registration.clientId,
      deploymentId: registration.deploymentId,
      subject,
      ...(email === undefined ? {} : { email }),
      ...(displayName === undefined ? {} : { displayName }),
      context,
      platformRoles: roles,
      applicationRole,
      ...(assignmentId === undefined ? {} : { assignmentId }),
      issuedAt,
      expiresAt,
    },
    userId,
  );
  const locale =
    typeof payload.locale === "string" &&
    payload.locale.toLowerCase().startsWith("en")
      ? "en"
      : "vi";
  const location =
    applicationRole === "instructor"
      ? `/instructor?locale=${locale}`
      : `/learner?assignmentId=${encodeURIComponent(
          assignmentId!,
        )}&locale=${locale}`;
  return new Response(null, {
    status: 303,
    headers: {
      "cache-control": "no-store",
      location,
      "set-cookie": sessionCookie(
        sessionToken,
        Math.floor(LTI_SESSION_LIFETIME_MS / 1_000),
      ),
    },
  });
}

export function ltiLoginParameter(
  value: FormDataEntryValue | null,
  name: string,
): string {
  if (typeof value !== "string") {
    throw new LtiAuthenticationError(
      "LTI_REQUEST_INVALID",
      `${name} is required.`,
    );
  }
  return boundedParameter(value, name)!;
}
