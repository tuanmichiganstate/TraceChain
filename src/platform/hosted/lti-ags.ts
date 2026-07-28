import { importJWK, SignJWT, type JWK } from "jose";
import type {
  Clock,
  IdGenerator,
} from "../../domain/simulation/environment";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import {
  LTI_AGS_SCORE_SCOPE,
  type LtiAgsDeliveryProjectionV1,
  type LtiAgsScoreV1,
  type LtiPlatformRegistrationV1,
} from "../contracts/lti";
import type {
  ActiveLtiAgsContext,
} from "../persistence/d1-lti-authentication-repository";
import type {
  LtiAgsDeliveryRepository,
} from "../persistence/d1-lti-ags-repository";
import type {
  HostedRuntimeOfficialGradeV1,
} from "./hosted-runtime-service";

const CLIENT_ASSERTION_LIFETIME_SECONDS = 5 * 60;
const MAXIMUM_ACCESS_TOKEN_LENGTH = 8 * 1024;
const SCORE_MEDIA_TYPE =
  "application/vnd.ims.lis.v1.score+json";

export class LtiAgsError extends Error {
  constructor(
    readonly code:
      | "LTI_AGS_CONFIGURATION_INVALID"
      | "LTI_AGS_TOKEN_REQUEST_FAILED"
      | "LTI_AGS_SCORE_REQUEST_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "LtiAgsError";
  }
}

function epochSeconds(value: string): number {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new LtiAgsError(
      "LTI_AGS_CONFIGURATION_INVALID",
      "The LTI AGS clock timestamp is invalid.",
    );
  }
  return Math.floor(milliseconds / 1_000);
}

function scoreUrl(lineItemUrl: string): string {
  const url = new URL(lineItemUrl);
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/scores`;
  url.hash = "";
  return url.toString();
}

function scorePayload(options: {
  readonly context: ActiveLtiAgsContext;
  readonly grade: HostedRuntimeOfficialGradeV1;
  readonly completedAt: string;
}): LtiAgsScoreV1 {
  epochSeconds(options.completedAt);
  if (options.grade.gradingProgress === "PendingManual") {
    return {
      userId: options.context.platformUserId,
      timestamp: options.completedAt,
      activityProgress: "Completed",
      gradingProgress: "PendingManual",
    };
  }
  if (
    !Number.isFinite(options.grade.scoreGiven) ||
    options.grade.scoreGiven < 0 ||
    options.grade.scoreGiven > options.grade.scoreMaximum
  ) {
    throw new LtiAgsError(
      "LTI_AGS_CONFIGURATION_INVALID",
      "The completed run score is outside its declared range.",
    );
  }
  return {
    userId: options.context.platformUserId,
    timestamp: options.completedAt,
    activityProgress: "Completed",
    gradingProgress: "FullyGraded",
    scoreGiven: options.grade.scoreGiven,
    scoreMaximum: options.grade.scoreMaximum,
  };
}

async function clientAssertion(options: {
  readonly registration: LtiPlatformRegistrationV1;
  readonly privateJwk: Readonly<Record<string, unknown>>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}): Promise<string> {
  const tokenEndpoint = options.registration.tokenEndpoint;
  if (tokenEndpoint === undefined) {
    throw new LtiAgsError(
      "LTI_AGS_CONFIGURATION_INVALID",
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
      .setJti(options.ids.nextId("LTI_AGS_JTI"))
      .sign(key);
  } catch (error) {
    if (error instanceof LtiAgsError) throw error;
    throw new LtiAgsError(
      "LTI_AGS_CONFIGURATION_INVALID",
      "The LTI AGS OAuth client assertion could not be signed" +
        (error instanceof Error ? `: ${error.message}` : "."),
    );
  }
}

async function accessToken(options: {
  readonly registration: LtiPlatformRegistrationV1;
  readonly privateJwk: Readonly<Record<string, unknown>>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly fetcher: typeof fetch;
}): Promise<string> {
  const tokenEndpoint = options.registration.tokenEndpoint;
  if (tokenEndpoint === undefined) {
    throw new LtiAgsError(
      "LTI_AGS_CONFIGURATION_INVALID",
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
        scope: LTI_AGS_SCORE_SCOPE,
      }),
      redirect: "error",
    });
  } catch (error) {
    throw new LtiAgsError(
      "LTI_AGS_TOKEN_REQUEST_FAILED",
      "The Moodle OAuth token endpoint could not be reached" +
        (error instanceof Error ? `: ${error.message}` : "."),
    );
  }
  if (!response.ok) {
    throw new LtiAgsError(
      "LTI_AGS_TOKEN_REQUEST_FAILED",
      `The Moodle OAuth token endpoint returned ${String(response.status)}.`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LtiAgsError(
      "LTI_AGS_TOKEN_REQUEST_FAILED",
      "The Moodle OAuth token response is not valid JSON.",
    );
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new LtiAgsError(
      "LTI_AGS_TOKEN_REQUEST_FAILED",
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
        !returnedScope.split(/\s+/u).includes(LTI_AGS_SCORE_SCOPE)))
  ) {
    throw new LtiAgsError(
      "LTI_AGS_TOKEN_REQUEST_FAILED",
      "The Moodle OAuth token response does not grant AGS score access.",
    );
  }
  return token;
}

async function postScore(options: {
  readonly registration: LtiPlatformRegistrationV1;
  readonly privateJwk: Readonly<Record<string, unknown>>;
  readonly context: ActiveLtiAgsContext;
  readonly score: LtiAgsScoreV1;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly fetcher: typeof fetch;
}): Promise<void> {
  const token = await accessToken(options);
  let response: Response;
  try {
    response = await options.fetcher(
      scoreUrl(options.context.endpoint.lineItemUrl),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": SCORE_MEDIA_TYPE,
        },
        body: JSON.stringify(options.score),
        redirect: "error",
      },
    );
  } catch (error) {
    throw new LtiAgsError(
      "LTI_AGS_SCORE_REQUEST_FAILED",
      "The Moodle AGS score endpoint could not be reached" +
        (error instanceof Error ? `: ${error.message}` : "."),
    );
  }
  if (response.status !== 204) {
    throw new LtiAgsError(
      "LTI_AGS_SCORE_REQUEST_FAILED",
      `The Moodle AGS score endpoint returned ${String(response.status)}.`,
    );
  }
}

export function supportsLtiAgsScore(
  context: ActiveLtiAgsContext,
): boolean {
  return context.endpoint.scopes.includes(LTI_AGS_SCORE_SCOPE);
}

export async function deliverLtiAgsScore(options: {
  readonly runId: string;
  readonly completedAt: string;
  readonly grade: HostedRuntimeOfficialGradeV1;
  readonly context: ActiveLtiAgsContext;
  readonly registration: LtiPlatformRegistrationV1;
  readonly privateJwk: Readonly<Record<string, unknown>>;
  readonly repository: LtiAgsDeliveryRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly fetcher?: typeof fetch;
}): Promise<LtiAgsDeliveryProjectionV1> {
  if (
    options.context.registrationId !==
      options.registration.registrationId ||
    !supportsLtiAgsScore(options.context)
  ) {
    throw new LtiAgsError(
      "LTI_AGS_CONFIGURATION_INVALID",
      "The learner launch does not grant AGS score delivery for this registration.",
    );
  }
  const score = scorePayload(options);
  const deliveryId = `LTI_AGS_${sha256Hex(
    `${options.runId}\u0000${options.context.assignmentId}`,
  )
    .slice(0, 32)
    .toUpperCase()}`;
  const stored = await options.repository.createOrFind({
    deliveryId,
    runId: options.runId,
    assignmentId: options.context.assignmentId,
    registrationId: options.context.registrationId,
    platformUserId: options.context.platformUserId,
    lineItemUrl: options.context.endpoint.lineItemUrl,
    score,
  });
  if (stored.status === "delivered") return stored;
  const claimed = await options.repository.claim(deliveryId);
  if (!claimed.wasClaimed) return claimed.delivery;
  try {
    await postScore({
      registration: options.registration,
      privateJwk: options.privateJwk,
      context: options.context,
      score,
      clock: options.clock,
      ids: options.ids,
      fetcher: options.fetcher ?? fetch,
    });
    return await options.repository.markDelivered(deliveryId);
  } catch (error) {
    return options.repository.markFailed(deliveryId, error);
  }
}
