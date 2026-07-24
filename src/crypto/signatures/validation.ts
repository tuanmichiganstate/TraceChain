import { TransactionType } from "../../domain/types/enums";
import type { ScenarioDefinition } from "../../domain/types/scenario";
import { encodeBase64Url } from "./base64url";
import { endorsementAuthorizationCommandType } from "../endorsements/policy-evaluator";
import type {
  CryptographicRuntime,
  EndorsementPolicyExpression,
  SignatureProvider,
} from "./types";

export interface CryptographicRuntimeValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface CryptographicRuntimeValidationResult {
  readonly isValid: boolean;
  readonly issues: readonly CryptographicRuntimeValidationIssue[];
}

export async function validateCryptographicRuntime(options: {
  readonly runtime: CryptographicRuntime;
  readonly scenario: ScenarioDefinition;
  readonly provider: SignatureProvider;
}): Promise<CryptographicRuntimeValidationResult> {
  const issues: CryptographicRuntimeValidationIssue[] = [];
  const issue = (path: string, message: string): void => {
    issues.push({ path, message });
  };
  const { runtime, scenario, provider } = options;
  if (runtime.identityRegistry.schemaVersion !== "1") {
    issue("identityRegistry.schemaVersion", "must be 1");
  }
  if (runtime.signingKeys.schemaVersion !== "1") {
    issue("signingKeys.schemaVersion", "must be 1");
  }
  if (runtime.authorizationPolicies.schemaVersion !== "1") {
    issue("authorizationPolicies.schemaVersion", "must be 1");
  }
  if (runtime.endorsementPolicies.schemaVersion !== "1") {
    issue("endorsementPolicies.schemaVersion", "must be 1");
  }

  const organizationIds = new Set(
    scenario.organizations.map((organization) => organization.organizationId),
  );
  const roleIds = new Set<string>(
    scenario.actors.map((actor) => actor.actorRole),
  );
  const domainCommandTypes = new Set<string>(Object.values(TransactionType));
  const commandTypes = new Set<string>([
    ...domainCommandTypes,
    ...[...domainCommandTypes].map(endorsementAuthorizationCommandType),
  ]);
  const identityIds = new Set<string>();
  const keyIds = new Set<string>();

  for (const [index, identity] of runtime.identityRegistry.identities.entries()) {
    const path = `identityRegistry.identities[${index}]`;
    if (identityIds.has(identity.organizationId)) {
      issue(`${path}.organizationId`, "is duplicated");
    }
    identityIds.add(identity.organizationId);
    if (!organizationIds.has(identity.organizationId)) {
      issue(`${path}.organizationId`, "does not exist in the scenario");
    }
    if (identity.activeKeyIds.length === 0) {
      issue(`${path}.activeKeyIds`, "must identify at least one key");
    }
  }

  for (const [index, key] of runtime.signingKeys.keys.entries()) {
    const path = `signingKeys.keys[${index}]`;
    if (keyIds.has(key.keyId)) issue(`${path}.keyId`, "is duplicated");
    keyIds.add(key.keyId);
    if (key.educationalOnly !== true) {
      issue(`${path}.educationalOnly`, "must be true");
    }
    if (key.algorithm !== "Ed25519") {
      issue(`${path}.algorithm`, "must be Ed25519");
      continue;
    }
    if (!organizationIds.has(key.organizationId)) {
      issue(`${path}.organizationId`, "does not exist in the scenario");
    }
    try {
      const message = new TextEncoder().encode(
        `TraceChain key-pair validation:${key.keyId}`,
      );
      const signature = await provider.sign(
        {
          algorithm: key.algorithm,
          pkcs8Base64Url: key.privateKeyPkcs8Base64Url,
        },
        message,
      );
      const matches = await provider.verify(
        {
          algorithm: key.algorithm,
          spkiBase64Url: key.publicKeySpkiBase64Url,
        },
        message,
        signature,
      );
      if (!matches || encodeBase64Url(signature).length !== 86) {
        issue(path, "public and private key material does not match");
      }
    } catch (error) {
      issue(
        path,
        `key material is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  for (const [index, identity] of runtime.identityRegistry.identities.entries()) {
    for (const keyId of identity.activeKeyIds) {
      const key = runtime.signingKeys.keys.find(
        (candidate) => candidate.keyId === keyId,
      );
      if (key === undefined) {
        issue(
          `identityRegistry.identities[${index}].activeKeyIds`,
          `references unknown key "${keyId}"`,
        );
      } else if (key.organizationId !== identity.organizationId) {
        issue(
          `identityRegistry.identities[${index}].activeKeyIds`,
          `key "${keyId}" belongs to another organization`,
        );
      }
    }
  }

  const policyIds = new Set<string>();
  for (
    const [index, policy] of
    runtime.authorizationPolicies.policies.entries()
  ) {
    const path = `authorizationPolicies.policies[${index}]`;
    if (policyIds.has(policy.authorizationPolicyId)) {
      issue(`${path}.authorizationPolicyId`, "is duplicated");
    }
    policyIds.add(policy.authorizationPolicyId);
    if (policy.commandTypes.length === 0) {
      issue(`${path}.commandTypes`, "must not be empty");
    }
    if (
      policy.allowedOrganizationIds.length === 0 ||
      policy.allowedRoleIds.length === 0
    ) {
      issue(path, "must explicitly allow at least one organization and role");
    }
    for (const commandType of policy.commandTypes) {
      if (!commandTypes.has(commandType)) {
        issue(`${path}.commandTypes`, `contains unknown command "${commandType}"`);
      }
    }
    for (const organizationId of policy.allowedOrganizationIds) {
      if (!organizationIds.has(organizationId)) {
        issue(
          `${path}.allowedOrganizationIds`,
          `contains unknown organization "${organizationId}"`,
        );
      }
    }
    for (const roleId of policy.allowedRoleIds) {
      if (!roleIds.has(roleId)) {
        issue(`${path}.allowedRoleIds`, `contains unknown role "${roleId}"`);
      }
    }
  }

  for (const commandType of domainCommandTypes) {
    if (
      !runtime.authorizationPolicies.policies.some((policy) =>
        policy.commandTypes.includes(commandType),
      )
    ) {
      issue(
        "authorizationPolicies.policies",
        `has no applicable rule for "${commandType}"`,
      );
    }
  }

  const activeExpressions = new Set<object>();
  const expressionOrganizations = (
    expression: EndorsementPolicyExpression,
    path: string,
  ): readonly string[] => {
    if (activeExpressions.has(expression)) {
      issue(path, "must not contain cyclic policy expressions");
      return [];
    }
    activeExpressions.add(expression);
    try {
      switch (expression.kind) {
        case "SIGNED_BY":
          if (!organizationIds.has(expression.organizationId)) {
            issue(
              `${path}.organizationId`,
              `references unknown organization "${expression.organizationId}"`,
            );
          }
          return [expression.organizationId];
        case "ALL_OF":
        case "ANY_OF": {
          if (expression.policies.length === 0) {
            issue(`${path}.policies`, "must not be empty");
          }
          return expression.policies.flatMap(
            (policyExpression, index) =>
              expressionOrganizations(
                policyExpression,
                `${path}.policies[${index}]`,
              ),
          );
        }
        case "THRESHOLD": {
          const uniqueOrganizations = new Set(
            expression.organizationIds,
          );
          if (
            !Number.isInteger(expression.required) ||
            expression.required < 1 ||
            expression.required > uniqueOrganizations.size
          ) {
            issue(
              `${path}.required`,
              "must be between 1 and the unique organization count",
            );
          }
          if (
            uniqueOrganizations.size !==
            expression.organizationIds.length
          ) {
            issue(
              `${path}.organizationIds`,
              "must not contain duplicates",
            );
          }
          for (const organizationId of expression.organizationIds) {
            if (!organizationIds.has(organizationId)) {
              issue(
                `${path}.organizationIds`,
                `references unknown organization "${organizationId}"`,
              );
            }
          }
          return expression.organizationIds;
        }
      }
    } finally {
      activeExpressions.delete(expression);
    }
  };

  const endorsementPolicyIds = new Set<string>();
  const endorsementPolicyCommandTypes = new Map<string, number>();
  for (
    const [index, endorsementPolicy] of
    runtime.endorsementPolicies.policies.entries()
  ) {
    const path = `endorsementPolicies.policies[${index}]`;
    if (
      endorsementPolicyIds.has(
        endorsementPolicy.endorsementPolicyId,
      )
    ) {
      issue(`${path}.endorsementPolicyId`, "is duplicated");
    }
    endorsementPolicyIds.add(
      endorsementPolicy.endorsementPolicyId,
    );
    if (endorsementPolicy.appliesToCommandTypes.length === 0) {
      issue(`${path}.appliesToCommandTypes`, "must not be empty");
    }
    const expressionOrganizationIds =
      expressionOrganizations(
        endorsementPolicy.expression,
        `${path}.expression`,
      );
    const policyOrganizations = new Set(
      expressionOrganizationIds,
    );
    if (
      policyOrganizations.size !==
      expressionOrganizationIds.length
    ) {
      issue(
        `${path}.expression`,
        "must not repeat an organization",
      );
    }
    for (
      const commandType of
      endorsementPolicy.appliesToCommandTypes
    ) {
      if (!domainCommandTypes.has(commandType)) {
        issue(
          `${path}.appliesToCommandTypes`,
          `contains unknown command "${commandType}"`,
        );
      }
      endorsementPolicyCommandTypes.set(
        commandType,
        (endorsementPolicyCommandTypes.get(commandType) ?? 0) + 1,
      );
      const endorsementAction =
        endorsementAuthorizationCommandType(commandType);
      for (const organizationId of policyOrganizations) {
        const contexts = scenario.runtime.trustedContexts.filter(
          (context) => context.organizationId === organizationId,
        );
        const canSatisfy = contexts.some((context) =>
          runtime.authorizationPolicies.policies.some(
            (authorizationPolicy) =>
              authorizationPolicy.commandTypes.includes(
                endorsementAction,
              ) &&
              authorizationPolicy.allowedOrganizationIds.includes(
                organizationId,
              ) &&
              authorizationPolicy.allowedRoleIds.includes(
                context.roleId,
              ),
          ),
        );
        if (!canSatisfy) {
          issue(
            `${path}.expression`,
            `organization "${organizationId}" has no permitted trusted role for "${commandType}"`,
          );
        }
      }
    }
  }
  for (const [commandType, count] of endorsementPolicyCommandTypes) {
    if (count > 1) {
      issue(
        "endorsementPolicies.policies",
        `has ${count} ambiguous policies for "${commandType}"`,
      );
    }
  }
  for (const context of scenario.runtime.trustedContexts) {
    if (!identityIds.has(context.organizationId)) {
      issue(
        "identityRegistry.identities",
        `has no identity for trusted context "${context.contextId}"`,
      );
    }
  }

  return { isValid: issues.length === 0, issues };
}

export async function assertValidCryptographicRuntime(options: {
  readonly runtime: CryptographicRuntime;
  readonly scenario: ScenarioDefinition;
  readonly provider: SignatureProvider;
}): Promise<void> {
  const result = await validateCryptographicRuntime(options);
  if (!result.isValid) {
    throw new Error(
      `Cryptographic runtime is invalid:\n${result.issues
        .map((entry) => `  ${entry.path}: ${entry.message}`)
        .join("\n")}`,
    );
  }
}
