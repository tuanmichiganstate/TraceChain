import type { ApplicationRole } from "../contracts/run-events";

export interface ApplicationPrincipal {
  readonly userId: string;
  readonly email: string;
  readonly roles: readonly ApplicationRole[];
}

export class HostedAuthorizationError extends Error {
  constructor(
    readonly code:
      | "AUTHENTICATION_REQUIRED"
      | "APPLICATION_ROLE_REQUIRED"
      | "RUN_ACCESS_DENIED",
    message: string,
  ) {
    super(message);
    this.name = "HostedAuthorizationError";
  }
}

export function requireApplicationRole(
  principal: ApplicationPrincipal | null,
  allowedRoles: readonly ApplicationRole[],
): ApplicationPrincipal {
  if (principal === null) {
    throw new HostedAuthorizationError(
      "AUTHENTICATION_REQUIRED",
      "An authenticated application user is required.",
    );
  }
  if (!principal.roles.some((role) => allowedRoles.includes(role))) {
    throw new HostedAuthorizationError(
      "APPLICATION_ROLE_REQUIRED",
      `One of these application roles is required: ${allowedRoles.join(", ")}.`,
    );
  }
  return principal;
}

export function requireAssignedLearner(
  principal: ApplicationPrincipal | null,
  learnerUserId: string,
): ApplicationPrincipal {
  const learner = requireApplicationRole(principal, ["learner"]);
  if (learner.userId !== learnerUserId) {
    throw new HostedAuthorizationError(
      "RUN_ACCESS_DENIED",
      "The authenticated learner is not assigned to this run.",
    );
  }
  return learner;
}
