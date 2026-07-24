import {
  EndorsementValidationRule,
  type EndorsementEvaluation,
  type EndorsementPolicyDefinition,
  type EndorsementPolicyExpression,
  type EndorsementRecord,
  type EndorsementValidationRuleId,
} from "../signatures/types";

export function endorsementAuthorizationCommandType(
  commandType: string,
): string {
  return `ENDORSE:${commandType}`;
}

function organizationsIn(
  expression: EndorsementPolicyExpression,
): readonly string[] {
  switch (expression.kind) {
    case "SIGNED_BY":
      return [expression.organizationId];
    case "ALL_OF":
    case "ANY_OF":
      return expression.policies.flatMap(organizationsIn);
    case "THRESHOLD":
      return expression.organizationIds;
  }
}

function isSatisfied(
  expression: EndorsementPolicyExpression,
  organizations: ReadonlySet<string>,
): boolean {
  switch (expression.kind) {
    case "SIGNED_BY":
      return organizations.has(expression.organizationId);
    case "ALL_OF":
      return expression.policies.every((policy) =>
        isSatisfied(policy, organizations),
      );
    case "ANY_OF":
      return expression.policies.some((policy) =>
        isSatisfied(policy, organizations),
      );
    case "THRESHOLD":
      return (
        expression.organizationIds.filter((organizationId) =>
          organizations.has(organizationId),
        ).length >= expression.required
      );
  }
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

export function endorsementPolicyFor(
  policies: readonly EndorsementPolicyDefinition[],
  commandType: string,
): EndorsementPolicyDefinition | null {
  const applicable = policies.filter((policy) =>
    policy.appliesToCommandTypes.includes(commandType),
  );
  if (applicable.length > 1) {
    throw new Error(
      `Command type "${commandType}" has multiple endorsement policies`,
    );
  }
  return applicable[0] ?? null;
}

/**
 * Pure policy projection over independently verifiable signature evidence.
 *
 * Each organization counts at most once. A valid signature over different
 * content is retained as evidence but cannot satisfy this proposal's policy.
 */
export function evaluateEndorsementPolicy(options: {
  readonly policy: EndorsementPolicyDefinition;
  readonly proposalId: string;
  readonly proposalDigest: string;
  readonly records: readonly EndorsementRecord[];
}): EndorsementEvaluation {
  const validEndorsementIds: string[] = [];
  const invalidEndorsementIds: string[] = [];
  const duplicateOrganizationIds: string[] = [];
  const proposalMismatchIds: string[] = [];
  const unauthorizedEndorserIds: string[] = [];
  const countedOrganizations = new Set<string>();

  for (const record of options.records) {
    const matchesProposal =
      record.proposalId === options.proposalId &&
      record.proposalDigest === options.proposalDigest &&
      record.signature.proposalDigest === options.proposalDigest &&
      record.verification.proposal.proposalId === options.proposalId &&
      record.verification.proposalDigest === options.proposalDigest;
    const signatureValid =
      record.verification.signatureValid &&
      record.verification.signature.signatureBase64Url ===
        record.signature.signatureBase64Url &&
      record.verification.signature.organizationId ===
        record.organizationId &&
      record.verification.signature.roleId === record.roleId &&
      record.verification.signature.keyId === record.keyId;
    const authorized = record.verification.authorization.authorized;

    if (!matchesProposal) {
      proposalMismatchIds.push(record.endorsementId);
    }
    if (!authorized) {
      unauthorizedEndorserIds.push(record.endorsementId);
    }
    if (!signatureValid || !matchesProposal || !authorized) {
      invalidEndorsementIds.push(record.endorsementId);
      continue;
    }
    if (countedOrganizations.has(record.organizationId)) {
      duplicateOrganizationIds.push(record.organizationId);
      invalidEndorsementIds.push(record.endorsementId);
      continue;
    }
    countedOrganizations.add(record.organizationId);
    validEndorsementIds.push(record.endorsementId);
  }

  const satisfied = isSatisfied(
    options.policy.expression,
    countedOrganizations,
  );
  const requiredOrganizations = unique(
    organizationsIn(options.policy.expression),
  );
  const missingOrganizationIds = satisfied
    ? []
    : requiredOrganizations.filter(
        (organizationId) => !countedOrganizations.has(organizationId),
      );
  const failureRuleIds: readonly EndorsementValidationRuleId[] = unique([
    ...(invalidEndorsementIds.some(
      (endorsementId) =>
        !proposalMismatchIds.includes(endorsementId) &&
        !unauthorizedEndorserIds.includes(endorsementId),
    )
      ? [EndorsementValidationRule.SIGNATURE_INVALID]
      : []),
    ...(unauthorizedEndorserIds.length > 0
      ? [EndorsementValidationRule.ENDORSER_NOT_AUTHORIZED]
      : []),
    ...(proposalMismatchIds.length > 0
      ? [EndorsementValidationRule.PROPOSAL_MISMATCH]
      : []),
    ...(duplicateOrganizationIds.length > 0
      ? [EndorsementValidationRule.DUPLICATE_ENDORSER]
      : []),
    ...(satisfied
      ? []
      : [EndorsementValidationRule.POLICY_NOT_SATISFIED]),
  ] as readonly EndorsementValidationRuleId[]);

  return {
    endorsementPolicyId: options.policy.endorsementPolicyId,
    satisfied,
    validEndorsementIds,
    invalidEndorsementIds: unique(invalidEndorsementIds),
    missingOrganizationIds,
    duplicateOrganizationIds: unique(duplicateOrganizationIds),
    proposalMismatchIds: unique(proposalMismatchIds),
    unauthorizedEndorserIds: unique(unauthorizedEndorserIds),
    failureRuleIds,
  };
}
