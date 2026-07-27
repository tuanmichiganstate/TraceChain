import { endorsementAuthorizationCommandType } from "../crypto/endorsements/policy-evaluator";
import type {
  AuthorizationPolicy,
  CryptographicRuntime,
  EndorsementPolicyDefinition,
} from "../crypto/signatures/types";
import { ActorRole } from "../domain/types/enums";
import { coffeeCryptographicRuntime } from "../scenarios/coffee-traceability/cryptographic-runtime";
import { OrganizationId } from "../scenarios/coffee-traceability/organizations";
import { TechnicalLabCommandType } from "./cryptographic-contract";

const LABORATORY_ORGANIZATION_IDS: readonly string[] = [
  OrganizationId.PRODUCER_COOP,
  OrganizationId.COFFEE_PROCESSOR,
  OrganizationId.CERTIFICATION_BODY,
  OrganizationId.LOGISTICS_PROVIDER,
];

const policy = (
  authorizationPolicyId: string,
  commandTypes: readonly string[],
  allowedOrganizationIds: readonly string[],
  allowedRoleIds: readonly string[],
): AuthorizationPolicy => ({
  authorizationPolicyId,
  commandTypes,
  allowedOrganizationIds,
  allowedRoleIds,
  signerOrganizationMustMatchActorOrganization: true,
  localizationKey: `technicalLab.authorization.${authorizationPolicyId}`,
});

const laboratoryAuthorizationPolicies: readonly AuthorizationPolicy[] = [
  policy(
    "AUTH_LAB_TRANSFER_CUSTODY",
    [TechnicalLabCommandType.TRANSFER_CUSTODY],
    [OrganizationId.PRODUCER_COOP],
    [ActorRole.PRODUCER_MANAGER],
  ),
  policy(
    "AUTH_LAB_ISSUE_CERTIFICATE",
    [TechnicalLabCommandType.ISSUE_CERTIFICATE],
    [OrganizationId.CERTIFICATION_BODY],
    [ActorRole.CERTIFICATION_OFFICER],
  ),
  policy(
    "AUTH_LAB_ENDORSE_POLICY_DEMO",
    [
      endorsementAuthorizationCommandType(
        TechnicalLabCommandType.POLICY_DEMO,
      ),
      "ENDORSE:LAB_POLICY_ANY",
      "ENDORSE:LAB_POLICY_THRESHOLD",
    ],
    [
      OrganizationId.PRODUCER_COOP,
      OrganizationId.COFFEE_PROCESSOR,
      OrganizationId.CERTIFICATION_BODY,
    ],
    [
      ActorRole.PRODUCER_MANAGER,
      ActorRole.PROCESSING_MANAGER,
      ActorRole.CERTIFICATION_OFFICER,
    ],
  ),
  policy(
    "AUTH_LAB_ENDORSE_CORRECTION",
    [
      endorsementAuthorizationCommandType(
        TechnicalLabCommandType.CORRECTION,
      ),
    ],
    [
      OrganizationId.PRODUCER_COOP,
      OrganizationId.COFFEE_PROCESSOR,
    ],
    [
      ActorRole.PRODUCER_MANAGER,
      ActorRole.PROCESSING_MANAGER,
    ],
  ),
  policy(
    "AUTH_LAB_ENDORSE_STATE_CHANGE",
    [
      endorsementAuthorizationCommandType(
        TechnicalLabCommandType.STATE_CHANGE,
      ),
    ],
    [
      OrganizationId.PRODUCER_COOP,
      OrganizationId.COFFEE_PROCESSOR,
    ],
    [
      ActorRole.PRODUCER_MANAGER,
      ActorRole.PROCESSING_MANAGER,
    ],
  ),
];

export const technicalLabEndorsementPolicies: readonly EndorsementPolicyDefinition[] =
  [
    {
      endorsementPolicyId: "LAB_SIGNED_BY_PRODUCER",
      appliesToCommandTypes: [
        TechnicalLabCommandType.POLICY_DEMO,
      ],
      expression: {
        kind: "SIGNED_BY",
        organizationId: OrganizationId.PRODUCER_COOP,
      },
      localizationKey: "technicalLab.policy.signedByProducer",
    },
    {
      endorsementPolicyId: "LAB_ALL_PRODUCER_PROCESSOR",
      appliesToCommandTypes: [
        TechnicalLabCommandType.CORRECTION,
      ],
      expression: {
        kind: "ALL_OF",
        policies: [
          {
            kind: "SIGNED_BY",
            organizationId: OrganizationId.PRODUCER_COOP,
          },
          {
            kind: "SIGNED_BY",
            organizationId: OrganizationId.COFFEE_PROCESSOR,
          },
        ],
      },
      localizationKey: "technicalLab.policy.allProducerProcessor",
    },
    {
      endorsementPolicyId: "LAB_ANY_PRODUCER_CERTIFIER",
      appliesToCommandTypes: ["LAB_POLICY_ANY"],
      expression: {
        kind: "ANY_OF",
        policies: [
          {
            kind: "SIGNED_BY",
            organizationId: OrganizationId.PRODUCER_COOP,
          },
          {
            kind: "SIGNED_BY",
            organizationId: OrganizationId.CERTIFICATION_BODY,
          },
        ],
      },
      localizationKey: "technicalLab.policy.anyProducerCertifier",
    },
    {
      endorsementPolicyId: "LAB_THRESHOLD_TWO_OF_THREE",
      appliesToCommandTypes: ["LAB_POLICY_THRESHOLD"],
      expression: {
        kind: "THRESHOLD",
        required: 2,
        organizationIds: [
          OrganizationId.PRODUCER_COOP,
          OrganizationId.COFFEE_PROCESSOR,
          OrganizationId.CERTIFICATION_BODY,
        ],
      },
      localizationKey: "technicalLab.policy.thresholdTwoOfThree",
    },
    {
      endorsementPolicyId: "LAB_STATE_PRODUCER_PROCESSOR",
      appliesToCommandTypes: [
        TechnicalLabCommandType.STATE_CHANGE,
      ],
      expression: {
        kind: "ALL_OF",
        policies: [
          {
            kind: "SIGNED_BY",
            organizationId: OrganizationId.PRODUCER_COOP,
          },
          {
            kind: "SIGNED_BY",
            organizationId: OrganizationId.COFFEE_PROCESSOR,
          },
        ],
      },
      localizationKey: "technicalLab.policy.stateProducerProcessor",
    },
  ];

export const technicalLabCryptographicRuntime: CryptographicRuntime = {
  identityRegistry: {
    schemaVersion: "1",
    identities:
      coffeeCryptographicRuntime.identityRegistry.identities.filter(
        (identity) =>
          LABORATORY_ORGANIZATION_IDS.includes(identity.organizationId),
      ),
  },
  signingKeys: {
    schemaVersion: "1",
    keys: coffeeCryptographicRuntime.signingKeys.keys.filter((key) =>
      LABORATORY_ORGANIZATION_IDS.includes(key.organizationId),
    ),
  },
  authorizationPolicies: {
    schemaVersion: "1",
    policies: laboratoryAuthorizationPolicies,
  },
  endorsementPolicies: {
    schemaVersion: "1",
    policies: technicalLabEndorsementPolicies,
  },
};
