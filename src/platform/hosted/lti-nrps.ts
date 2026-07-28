import type {
  Clock,
  IdGenerator,
} from "../../domain/simulation/environment";
import {
  LTI_LEARNER_ROLE,
  LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE,
  LTI_NRPS_MEMBERSHIP_MEDIA_TYPE,
  type LtiNrpsLearnerMemberV1,
  type LtiNrpsRosterSnapshotV1,
  type LtiPlatformRegistrationV1,
} from "../contracts/lti";
import type {
  ActiveLtiNrpsContext,
} from "../persistence/d1-lti-authentication-repository";
import {
  LtiServiceOAuthError,
  requestLtiServiceAccessToken,
} from "./lti-service-oauth";

const MAXIMUM_NRPS_RESPONSE_BYTES = 1024 * 1024;
const MAXIMUM_NRPS_PAGES = 20;
const MAXIMUM_NRPS_MEMBERS = 1_000;
const NRPS_PAGE_LIMIT = 100;

export class LtiNrpsError extends Error {
  constructor(
    readonly code:
      | "LTI_NRPS_CONFIGURATION_INVALID"
      | "LTI_NRPS_TOKEN_REQUEST_FAILED"
      | "LTI_NRPS_REQUEST_FAILED"
      | "LTI_NRPS_RESPONSE_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "LtiNrpsError";
  }
}

function invalidResponse(message: string): never {
  throw new LtiNrpsError(
    "LTI_NRPS_RESPONSE_INVALID",
    message,
  );
}

function serviceUrl(
  value: string,
  issuer: string,
  source: "configuration" | "response" = "configuration",
): URL {
  let url: URL;
  let issuerUrl: URL;
  try {
    url = new URL(value);
    issuerUrl = new URL(issuer);
  } catch {
    if (source === "response") {
      invalidResponse("The NRPS pagination URL is invalid.");
    }
    throw new LtiNrpsError(
      "LTI_NRPS_CONFIGURATION_INVALID",
      "The LTI NRPS service URL is invalid.",
    );
  }
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  if (
    url.origin !== issuerUrl.origin ||
    (url.protocol !== "https:" &&
      !(loopback && url.protocol === "http:")) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0
  ) {
    if (source === "response") {
      invalidResponse(
        "The NRPS pagination URL must use the registered Moodle origin.",
      );
    }
    throw new LtiNrpsError(
      "LTI_NRPS_CONFIGURATION_INVALID",
      "The LTI NRPS URL must use the registered Moodle origin.",
    );
  }
  return url;
}

function boundedOptionalText(
  value: unknown,
  name: string,
  maximumLength: number,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    invalidResponse(`${name} must be a string when present.`);
  }
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maximumLength
  ) {
    invalidResponse(`${name} exceeds its permitted length.`);
  }
  return normalized;
}

function memberDisplayName(
  member: Readonly<Record<string, unknown>>,
): string | undefined {
  const name = boundedOptionalText(member.name, "name", 200);
  if (name !== undefined) return name;
  const given = boundedOptionalText(
    member.given_name,
    "given_name",
    100,
  );
  const family = boundedOptionalText(
    member.family_name,
    "family_name",
    100,
  );
  const combined = [given, family]
    .filter((value): value is string => value !== undefined)
    .join(" ");
  return combined.length === 0 ? undefined : combined;
}

function memberEmail(
  member: Readonly<Record<string, unknown>>,
): string | undefined {
  const email = boundedOptionalText(member.email, "email", 320)
    ?.toLowerCase();
  if (
    email !== undefined &&
    !/^[^\s@]+@[^\s@]+$/u.test(email)
  ) {
    invalidResponse("email is not a valid bounded address.");
  }
  return email;
}

function hasLearnerRole(roles: readonly string[]): boolean {
  return roles.some((role) => {
    const normalized = role.trim();
    return (
      normalized === LTI_LEARNER_ROLE ||
      normalized.toLowerCase() === "learner" ||
      normalized
        .split(/[/#]/u)
        .at(-1)
        ?.toLowerCase() === "learner"
    );
  });
}

function normalizedMember(
  value: unknown,
): LtiNrpsLearnerMemberV1 | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    invalidResponse("Every NRPS member must be an object.");
  }
  const member = value as Readonly<Record<string, unknown>>;
  const platformUserId = boundedOptionalText(
    member.user_id,
    "user_id",
    512,
  );
  if (platformUserId === undefined) {
    invalidResponse("Every NRPS member requires user_id.");
  }
  if (
    !Array.isArray(member.roles) ||
    member.roles.length === 0 ||
    member.roles.length > 32 ||
    member.roles.some(
      (role) =>
        typeof role !== "string" ||
        role.trim().length === 0 ||
        role.length > 512,
    )
  ) {
    invalidResponse("Every NRPS member requires bounded roles.");
  }
  const roles = [
    ...new Set(member.roles.map((role) => role.trim())),
  ].sort();
  if (!hasLearnerRole(roles)) return null;
  const rawStatus = member.status ?? "Active";
  if (rawStatus !== "Active" && rawStatus !== "Inactive") {
    invalidResponse(
      "A full NRPS snapshot may contain only Active or Inactive memberships.",
    );
  }
  const displayName = memberDisplayName(member);
  const email = memberEmail(member);
  return {
    platformUserId,
    status: rawStatus === "Active" ? "active" : "inactive",
    roles,
    ...(displayName === undefined ? {} : { displayName }),
    ...(email === undefined ? {} : { email }),
  };
}

function splitLinkHeader(value: string): readonly string[] {
  const parts: string[] = [];
  let start = 0;
  let inAngles = false;
  let inQuotes = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "<" && !inQuotes) inAngles = true;
    if (character === ">" && !inQuotes) inAngles = false;
    if (
      character === '"' &&
      value[index - 1] !== "\\"
    ) {
      inQuotes = !inQuotes;
    }
    if (character === "," && !inAngles && !inQuotes) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter((part) => part.length > 0);
}

function nextLink(value: string | null): string | null {
  if (value === null) return null;
  let next: string | null = null;
  for (const part of splitLinkHeader(value)) {
    const match = /^<([^>]+)>(.*)$/u.exec(part);
    if (match === null) invalidResponse("The NRPS Link header is invalid.");
    const href = match[1];
    if (href === undefined) {
      invalidResponse("The NRPS Link header has no target.");
    }
    const parameters = (match[2] ?? "")
      .split(";")
      .map((parameter) => parameter.trim())
      .filter((parameter) => parameter.length > 0);
    const relation = parameters
      .map((parameter) =>
        /^rel=(?:"([^"]+)"|([^\s]+))$/iu.exec(parameter),
      )
      .find((candidate) => candidate !== null);
    const relations = (relation?.[1] ?? relation?.[2] ?? "")
      .split(/\s+/u);
    if (!relations.includes("next")) continue;
    if (next !== null) {
      invalidResponse("The NRPS response contains multiple next links.");
    }
    next = href;
  }
  return next;
}

function pagePayload(value: unknown, contextId: string): readonly unknown[] {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    invalidResponse("The NRPS membership container must be an object.");
  }
  const payload = value as Readonly<Record<string, unknown>>;
  if (
    typeof payload.context !== "object" ||
    payload.context === null ||
    Array.isArray(payload.context) ||
    (payload.context as Readonly<Record<string, unknown>>).id !==
      contextId ||
    !Array.isArray(payload.members)
  ) {
    invalidResponse(
      "The NRPS membership container does not match the launched course.",
    );
  }
  return payload.members;
}

async function responsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers
    .get("content-type")
    ?.toLowerCase();
  if (
    contentType === undefined ||
    !contentType.startsWith(LTI_NRPS_MEMBERSHIP_MEDIA_TYPE)
  ) {
    invalidResponse("The NRPS response media type is invalid.");
  }
  const declaredLength = Number(
    response.headers.get("content-length"),
  );
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAXIMUM_NRPS_RESPONSE_BYTES
  ) {
    invalidResponse("The NRPS response exceeds its size limit.");
  }
  const body = await response.text();
  if (
    new TextEncoder().encode(body).length >
    MAXIMUM_NRPS_RESPONSE_BYTES
  ) {
    invalidResponse("The NRPS response exceeds its size limit.");
  }
  try {
    return JSON.parse(body);
  } catch {
    invalidResponse("The NRPS response is not valid JSON.");
  }
}

export async function fetchLtiNrpsRoster(options: {
  readonly context: ActiveLtiNrpsContext;
  readonly registration: LtiPlatformRegistrationV1;
  readonly privateJwk: Readonly<Record<string, unknown>>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly fetcher?: typeof fetch;
}): Promise<LtiNrpsRosterSnapshotV1> {
  if (
    options.registration.registrationId !==
      options.context.registrationId ||
    options.registration.issuer !== options.context.issuer ||
    options.registration.clientId !== options.context.clientId ||
    options.registration.deploymentId !==
      options.context.deploymentId ||
    !options.context.endpoint.serviceVersions.includes("2.0")
  ) {
    throw new LtiNrpsError(
      "LTI_NRPS_CONFIGURATION_INVALID",
      "The NRPS launch context does not match its LTI registration.",
    );
  }
  const fetcher = options.fetcher ?? fetch;
  let token: string;
  try {
    token = await requestLtiServiceAccessToken({
      registration: options.registration,
      privateJwk: options.privateJwk,
      scope: LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE,
      clock: options.clock,
      ids: options.ids,
      jtiPrefix: "LTI_NRPS_JTI",
      fetcher,
    });
  } catch (error) {
    if (error instanceof LtiServiceOAuthError) {
      throw new LtiNrpsError(
        error.code === "LTI_SERVICE_CONFIGURATION_INVALID"
          ? "LTI_NRPS_CONFIGURATION_INVALID"
          : "LTI_NRPS_TOKEN_REQUEST_FAILED",
        error.message,
      );
    }
    throw error;
  }
  const initialUrl = serviceUrl(
    options.context.endpoint.contextMembershipsUrl,
    options.context.issuer,
  );
  initialUrl.searchParams.set("role", "Learner");
  initialUrl.searchParams.set("limit", String(NRPS_PAGE_LIMIT));
  let currentUrl: URL | null = initialUrl;
  const visited = new Set<string>();
  const members: LtiNrpsLearnerMemberV1[] = [];
  const memberIds = new Set<string>();
  let rawMemberCount = 0;
  let pageCount = 0;
  while (currentUrl !== null) {
    if (
      pageCount >= MAXIMUM_NRPS_PAGES ||
      visited.has(currentUrl.toString())
    ) {
      invalidResponse(
        "The NRPS pagination exceeds its bounded traversal.",
      );
    }
    visited.add(currentUrl.toString());
    pageCount += 1;
    let response: Response;
    try {
      response = await fetcher(currentUrl, {
        method: "GET",
        headers: {
          accept: LTI_NRPS_MEMBERSHIP_MEDIA_TYPE,
          authorization: `Bearer ${token}`,
        },
        redirect: "error",
      });
    } catch (error) {
      throw new LtiNrpsError(
        "LTI_NRPS_REQUEST_FAILED",
        "The Moodle NRPS endpoint could not be reached" +
          (error instanceof Error ? `: ${error.message}` : "."),
      );
    }
    if (!response.ok) {
      throw new LtiNrpsError(
        "LTI_NRPS_REQUEST_FAILED",
        `The Moodle NRPS endpoint returned ${String(response.status)}.`,
      );
    }
    const pageMembers = pagePayload(
      await responsePayload(response),
      options.context.contextId,
    );
    rawMemberCount += pageMembers.length;
    if (rawMemberCount > MAXIMUM_NRPS_MEMBERS) {
      invalidResponse("The NRPS roster exceeds 1000 members.");
    }
    for (const value of pageMembers) {
      const member = normalizedMember(value);
      if (member === null) continue;
      if (memberIds.has(member.platformUserId)) {
        invalidResponse(
          "The NRPS roster contains a duplicate learner identifier.",
        );
      }
      memberIds.add(member.platformUserId);
      members.push(member);
    }
    const next = nextLink(response.headers.get("link"));
    currentUrl =
      next === null
        ? null
        : serviceUrl(next, options.context.issuer, "response");
  }
  return {
    pageCount,
    members,
  };
}
