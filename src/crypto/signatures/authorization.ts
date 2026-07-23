import type { TrustedExecutionContext } from "../../domain/simulation/types";
import {
  SignatureValidationRule,
  type AuthorizationPolicyRegistry,
  type AuthorizationResult,
  type EducationalIdentity,
  type EducationalKeyRecord,
  type SignatureValidationRuleId,
} from "./types";

function instant(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid deterministic key time "${value}"`);
  return parsed;
}

export function isKeyActiveAt(
  key: EducationalKeyRecord,
  signedAt: string,
): boolean {
  if (key.status !== "ACTIVE") return false;
  const time = instant(signedAt);
  return (
    time >= instant(key.validFrom) &&
    (key.validUntil === undefined || time <= instant(key.validUntil))
  );
}

export function evaluateAuthorization(options: {
  readonly commandType: string;
  readonly trustedContext: TrustedExecutionContext;
  readonly signedOrganizationId: string;
  readonly signedRoleId: string;
  readonly identity: EducationalIdentity | undefined;
  readonly key: EducationalKeyRecord | undefined;
  readonly signedAt: string;
  readonly policies: AuthorizationPolicyRegistry;
}): AuthorizationResult {
  const recognizedIdentity = options.identity?.recognized === true;
  const keyActive =
    options.key !== undefined && isKeyActiveAt(options.key, options.signedAt);
  const contextMatches =
    options.signedOrganizationId === options.trustedContext.organizationId &&
    options.signedRoleId === options.trustedContext.roleId &&
    options.key?.organizationId === options.signedOrganizationId;
  const applicable = options.policies.policies.filter((policy) =>
    policy.commandTypes.includes(options.commandType),
  );
  const organizationAllowed = applicable.some((policy) =>
    policy.allowedOrganizationIds.includes(options.signedOrganizationId),
  );
  const roleAllowed = applicable.some((policy) =>
    policy.allowedRoleIds.includes(options.signedRoleId),
  );
  const policySatisfied = applicable.some(
    (policy) =>
      policy.allowedOrganizationIds.includes(options.signedOrganizationId) &&
      policy.allowedRoleIds.includes(options.signedRoleId) &&
      (!policy.signerOrganizationMustMatchActorOrganization ||
        options.signedOrganizationId ===
          options.trustedContext.organizationId),
  );

  const failures: SignatureValidationRuleId[] = [];
  if (!recognizedIdentity) {
    failures.push(SignatureValidationRule.SIGNER_IDENTITY_UNKNOWN);
  }
  if (options.key?.status === "EXPIRED" || (
    options.key?.status === "ACTIVE" &&
    options.key.validUntil !== undefined &&
    instant(options.signedAt) > instant(options.key.validUntil)
  )) {
    failures.push(SignatureValidationRule.SIGNING_KEY_EXPIRED);
  } else if (options.key?.status === "REVOKED") {
    failures.push(SignatureValidationRule.SIGNING_KEY_REVOKED);
  } else if (!keyActive) {
    failures.push(SignatureValidationRule.SIGNATURE_INVALID);
  }
  if (!contextMatches) {
    failures.push(SignatureValidationRule.SIGNER_CONTEXT_MISMATCH);
  }
  if (!organizationAllowed) {
    failures.push(SignatureValidationRule.ORGANIZATION_NOT_AUTHORIZED);
  }
  if (!roleAllowed) {
    failures.push(SignatureValidationRule.ROLE_NOT_AUTHORIZED);
  }

  return {
    recognizedIdentity,
    keyActive,
    organizationAllowed,
    roleAllowed,
    contextMatches,
    authorized:
      recognizedIdentity &&
      keyActive &&
      contextMatches &&
      policySatisfied,
    failureRuleIds: failures,
  };
}
