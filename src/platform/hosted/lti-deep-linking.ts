import { importJWK, SignJWT, type JWK } from "jose";
import type { HostedAssignmentV1 } from "../contracts/assessment";
import {
  LTI_DEEP_LINKING_CONTENT_ITEMS_CLAIM,
  LTI_DEEP_LINKING_DATA_CLAIM,
  LTI_DEPLOYMENT_ID_CLAIM,
  LTI_MESSAGE_TYPE_CLAIM,
  LTI_VERSION_CLAIM,
  type LtiPlatformRegistrationV1,
} from "../contracts/lti";
import type {
  ActiveLtiDeepLinkSession,
} from "../persistence/d1-lti-authentication-repository";
import { LtiAuthenticationError } from "./lti-authentication";

const RESPONSE_LIFETIME_SECONDS = 5 * 60;

function epochSeconds(value: string): number {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new LtiAuthenticationError(
      "LTI_DEEP_LINK_UNSUPPORTED",
      "The LTI Deep Linking completion timestamp is invalid.",
    );
  }
  return Math.floor(milliseconds / 1_000);
}

function assignmentMatchesSession(
  assignment: HostedAssignmentV1,
  session: ActiveLtiDeepLinkSession,
): boolean {
  const context = assignment.learningContext;
  return (
    assignment.status === "active" &&
    context !== undefined &&
    context.issuer === session.issuer &&
    context.clientId === session.clientId &&
    context.deploymentId === session.deploymentId &&
    context.contextId === session.contextId
  );
}

export function assertDeepLinkAssignmentAccess(
  assignment: HostedAssignmentV1,
  session: ActiveLtiDeepLinkSession,
): void {
  if (!assignmentMatchesSession(assignment, session)) {
    throw new LtiAuthenticationError(
      "LTI_ASSIGNMENT_ACCESS_DENIED",
      "The selected assignment is not active in this Moodle course.",
    );
  }
}

export async function createDeepLinkResponseJwt(options: {
  readonly registration: LtiPlatformRegistrationV1;
  readonly privateJwk: Readonly<Record<string, unknown>>;
  readonly session: ActiveLtiDeepLinkSession;
  readonly assignment: HostedAssignmentV1 | null;
  readonly launchUrl: string;
}): Promise<string> {
  if (options.session.completedAt === undefined) {
    throw new LtiAuthenticationError(
      "LTI_DEEP_LINK_UNSUPPORTED",
      "The LTI Deep Linking selection is not complete.",
    );
  }
  if (options.assignment !== null) {
    assertDeepLinkAssignmentAccess(
      options.assignment,
      options.session,
    );
  }
  const issuedAt = epochSeconds(options.session.completedAt);
  const contentItems =
    options.assignment === null
      ? []
      : [
          {
            type: "ltiResourceLink",
            title: options.assignment.title,
            url: options.launchUrl,
            custom: {
              tracechain_assignment_id:
                options.assignment.assignmentId,
            },
            presentation: {
              documentTarget: "window",
            },
          },
        ];
  try {
    const key = await importJWK(
      options.privateJwk as JWK,
      "RS256",
    );
    const keyId = String(options.privateJwk.kid);
    return await new SignJWT({
      [LTI_VERSION_CLAIM]: "1.3.0",
      [LTI_MESSAGE_TYPE_CLAIM]: "LtiDeepLinkingResponse",
      [LTI_DEPLOYMENT_ID_CLAIM]:
        options.registration.deploymentId,
      nonce: options.session.responseNonce,
      ...(options.session.settings.data === undefined
        ? {}
        : {
            [LTI_DEEP_LINKING_DATA_CLAIM]:
              options.session.settings.data,
          }),
      [LTI_DEEP_LINKING_CONTENT_ITEMS_CLAIM]: contentItems,
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: keyId,
        typ: "JWT",
      })
      .setIssuer(options.registration.clientId)
      .setAudience(options.registration.issuer)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + RESPONSE_LIFETIME_SECONDS)
      .setJti(options.session.responseNonce)
      .sign(key);
  } catch (error) {
    if (error instanceof LtiAuthenticationError) throw error;
    throw new LtiAuthenticationError(
      "LTI_DEEP_LINK_UNSUPPORTED",
      "The LTI Deep Linking response could not be signed.",
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function deepLinkAutoSubmitResponse(options: {
  readonly returnUrl: string;
  readonly jwt: string;
  readonly language: "en" | "vi";
  readonly submitLabel: string;
  readonly scriptNonce: string;
}): Response {
  const returnUrl = new URL(options.returnUrl);
  const nonce = escapeHtml(options.scriptNonce);
  const html = `<!doctype html>
<html lang="${options.language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(options.submitLabel)}</title>
</head>
<body>
  <form id="lti-deep-link-response" method="post" action="${escapeHtml(options.returnUrl)}">
    <input type="hidden" name="JWT" value="${escapeHtml(options.jwt)}">
    <button type="submit">${escapeHtml(options.submitLabel)}</button>
  </form>
  <script nonce="${nonce}">document.getElementById("lti-deep-link-response").submit();</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-security-policy":
        `default-src 'none'; form-action ${returnUrl.origin}; ` +
        `script-src 'nonce-${options.scriptNonce}'; style-src 'none'`,
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}
