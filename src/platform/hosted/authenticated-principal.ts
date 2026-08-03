import type { ApplicationPrincipal } from "./access";

export const AUTHENTICATED_USER_EMAIL_HEADER =
  "oai-authenticated-user-email";

export interface ApplicationPrincipalLookup {
  findActiveByVerifiedEmail(
    verifiedEmail: string,
  ): Promise<ApplicationPrincipal | null>;
}

export class AuthenticatedPrincipalError extends Error {
  constructor(
    readonly code:
      | "AUTHENTICATION_REQUIRED"
      | "APPLICATION_ACCESS_NOT_PROVISIONED",
    message: string,
  ) {
    super(message);
    this.name = "AuthenticatedPrincipalError";
  }
}

/**
 * Resolve the deployment-authenticated email to server-owned application
 * roles. No role or user identifier is accepted from request payloads.
 */
export async function resolveAuthenticatedPrincipal(
  request: Request,
  lookup: ApplicationPrincipalLookup,
): Promise<ApplicationPrincipal> {
  const email = request.headers
    .get(AUTHENTICATED_USER_EMAIL_HEADER)
    ?.trim();
  if (email === undefined || email.length === 0) {
    throw new AuthenticatedPrincipalError(
      "AUTHENTICATION_REQUIRED",
      "The hosting identity boundary did not provide a verified user.",
    );
  }
  const principal = await lookup.findActiveByVerifiedEmail(email);
  if (principal === null) {
    throw new AuthenticatedPrincipalError(
      "APPLICATION_ACCESS_NOT_PROVISIONED",
      "The authenticated user has no active SimuLedger role.",
    );
  }
  return principal;
}
