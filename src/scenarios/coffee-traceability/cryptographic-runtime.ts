import {
  ActorRole,
  TransactionType,
} from "../../domain/types/enums";
import type {
  AuthorizationPolicy,
  CryptographicRuntime,
  EducationalKeyRecord,
  EndorsementPolicyDefinition,
} from "../../crypto/signatures/types";
import { endorsementAuthorizationCommandType } from "../../crypto/endorsements/policy-evaluator";
import { OrganizationId } from "./organizations";

const key = (
  keyId: string,
  organizationId: string,
  privateKeyPkcs8Base64Url: string,
  publicKeySpkiBase64Url: string,
  status: EducationalKeyRecord["status"] = "ACTIVE",
  validUntil?: string,
): EducationalKeyRecord => ({
  keyId,
  organizationId,
  algorithm: "Ed25519",
  publicKeySpkiBase64Url,
  privateKeyPkcs8Base64Url,
  status,
  validFrom: "2020-01-01T00:00:00.000Z",
  ...(validUntil === undefined ? {} : { validUntil }),
  educationalOnly: true,
});

const keys: readonly EducationalKeyRecord[] = [
  key(
    "KEY_PRODUCER_001",
    OrganizationId.PRODUCER_COOP,
    "MC4CAQAwBQYDK2VwBCIEIE6opLsXwwLgUjqO0n1qfsXR9l86xwbm6uJnn8OL59vx",
    "MCowBQYDK2VwAyEAU7HoqYqEgKabN4hCXf0cn-ovou8Ggn3Hd_YYJcfs1IM",
  ),
  key(
    "KEY_CERTIFIER_001",
    OrganizationId.CERTIFICATION_BODY,
    "MC4CAQAwBQYDK2VwBCIEIOn7NGWIom-y9J3ifoYlEfs_YYI_wSZcLYGkqUQkPTYk",
    "MCowBQYDK2VwAyEAZoX3wb_XdKmMyyWLsGJbGzIiF_UPJU6ZXBwIlaIttCw",
  ),
  key(
    "KEY_LOGISTICS_001",
    OrganizationId.LOGISTICS_PROVIDER,
    "MC4CAQAwBQYDK2VwBCIEIGIJkWFII2YCHXGz3LYiL_JYP_9NeID22k4_ZK9Ss7iu",
    "MCowBQYDK2VwAyEAS8vHi12wMwE87hbBuzJF3OOsTs1ifdlWsCi2hpFIYpI",
  ),
  key(
    "KEY_PROCESSOR_001",
    OrganizationId.COFFEE_PROCESSOR,
    "MC4CAQAwBQYDK2VwBCIEIOM5qRnm5QjBtqumEb_GwqwraoAq5EFjFTWSNtU2ko_U",
    "MCowBQYDK2VwAyEA77Klv4BczqPqWKCKY7TUdyAIiruq2OGgNbVZiJMy290",
  ),
  key(
    "KEY_DISTRIBUTOR_001",
    OrganizationId.DISTRIBUTOR,
    "MC4CAQAwBQYDK2VwBCIEIGxbJRH6aY6a7S7h5jPx_FHE5i4p3VK_6S0iavmgX3ef",
    "MCowBQYDK2VwAyEAGRhCQCM19g_F-N50mRcDxAKYlTCHp71hhDgW_Lav0i8",
  ),
  key(
    "KEY_RETAILER_001",
    OrganizationId.RETAILER,
    "MC4CAQAwBQYDK2VwBCIEIPcpUr6Fmrx1IdSeP8s3DKpUdpnuZ55AizamlsxlAukq",
    "MCowBQYDK2VwAyEA12hEIhXqEdYw5K30v9ZxSPXpBekIhbKfKAM__5j4DsI",
  ),
  key(
    "KEY_REGULATOR_001",
    OrganizationId.REGULATOR,
    "MC4CAQAwBQYDK2VwBCIEIHW1hwJTby57o9A5LNf9G49tiDFkFyp1oL9TcC_O0rrC",
    "MCowBQYDK2VwAyEAQnUoeIu5h0WzPVjLNAlQyKXZQKXnuV_IBUY05V-pz04",
  ),
  key(
    "KEY_UNRECOGNIZED_001",
    OrganizationId.UNRECOGNIZED_CERTIFIER,
    "MC4CAQAwBQYDK2VwBCIEIIwcKzSVD_nu_Yt_OYkvsPcobN-AEYvT0BbeNNeY4QoB",
    "MCowBQYDK2VwAyEAYFDsPfHzZPg5aFN1HcEogFIu7Xjn4LG-zLqLmgVkb6A",
  ),
  key(
    "KEY_CERTIFIER_EXPIRED_001",
    OrganizationId.CERTIFICATION_BODY,
    "MC4CAQAwBQYDK2VwBCIEIDZ8yERDbxzKD2mu7vovJm8Km8xTWihhwdipQdU6T8Id",
    "MCowBQYDK2VwAyEATEvSDHCguopcqTg1RDwYriCOdn921rpuGWpjebPhQ4g",
    "EXPIRED",
    "2024-12-31T23:59:59.000Z",
  ),
  key(
    "KEY_LOGISTICS_REVOKED_001",
    OrganizationId.LOGISTICS_PROVIDER,
    "MC4CAQAwBQYDK2VwBCIEIGazITRcStIjz7OLp2lHPwWC3nYZPn7Mc1B_L2fA9XdI",
    "MCowBQYDK2VwAyEA0oRXPRENlqyp61KMRh0kGs--tRpgu3ITCbIFMRF_h_A",
    "REVOKED",
  ),
];

const policy = (
  authorizationPolicyId: string,
  commandTypes: readonly string[],
  allowedOrganizationIds: readonly string[],
  allowedRoleIds: readonly ActorRole[],
): AuthorizationPolicy => ({
  authorizationPolicyId,
  commandTypes,
  allowedOrganizationIds,
  allowedRoleIds,
  signerOrganizationMustMatchActorOrganization: true,
  localizationKey: `authorization.${authorizationPolicyId}`,
});

const authorizationPolicies: readonly AuthorizationPolicy[] = [
  policy(
    "AUTH_CREATE_BATCH",
    [TransactionType.CREATE_BATCH],
    [OrganizationId.PRODUCER_COOP],
    [ActorRole.PRODUCER_MANAGER],
  ),
  policy(
    "AUTH_ANCHOR_DOCUMENT",
    [TransactionType.ANCHOR_DOCUMENT],
    [
      OrganizationId.PRODUCER_COOP,
      OrganizationId.CERTIFICATION_BODY,
      OrganizationId.LOGISTICS_PROVIDER,
    ],
    [
      ActorRole.PRODUCER_MANAGER,
      ActorRole.CERTIFICATION_OFFICER,
      ActorRole.LOGISTICS_COORDINATOR,
      ActorRole.SHIPPING_CLERK,
    ],
  ),
  policy(
    "AUTH_ISSUE_CERTIFICATE",
    [TransactionType.ISSUE_CERTIFICATE],
    [OrganizationId.CERTIFICATION_BODY],
    [ActorRole.CERTIFICATION_OFFICER],
  ),
  policy(
    "AUTH_TRANSFER",
    [
      TransactionType.TRANSFER_OWNERSHIP,
      TransactionType.TRANSFER_CUSTODY,
    ],
    [
      OrganizationId.PRODUCER_COOP,
      OrganizationId.LOGISTICS_PROVIDER,
      OrganizationId.COFFEE_PROCESSOR,
      OrganizationId.DISTRIBUTOR,
    ],
    [
      ActorRole.PRODUCER_MANAGER,
      ActorRole.LOGISTICS_COORDINATOR,
      ActorRole.PROCESSING_MANAGER,
      ActorRole.DISTRIBUTION_MANAGER,
    ],
  ),
  policy(
    "AUTH_TRANSPORT",
    [TransactionType.RECORD_TRANSPORT_CONDITION],
    [OrganizationId.LOGISTICS_PROVIDER],
    [ActorRole.LOGISTICS_COORDINATOR],
  ),
  policy(
    "AUTH_RECEIVE",
    [TransactionType.RECEIVE_BATCH],
    [
      OrganizationId.COFFEE_PROCESSOR,
      OrganizationId.DISTRIBUTOR,
      OrganizationId.RETAILER,
    ],
    [
      ActorRole.PROCESSING_MANAGER,
      ActorRole.DISTRIBUTION_MANAGER,
      ActorRole.RETAIL_MANAGER,
    ],
  ),
  policy(
    "AUTH_PROCESS",
    [
      TransactionType.RECORD_CORRECTION,
      TransactionType.TRANSFORM_BATCH,
      TransactionType.PACKAGE_BATCH,
    ],
    [OrganizationId.COFFEE_PROCESSOR],
    [ActorRole.PROCESSING_MANAGER],
  ),
  policy(
    "AUTH_DISPATCH",
    [TransactionType.DISPATCH_BATCH],
    [
      OrganizationId.PRODUCER_COOP,
      OrganizationId.LOGISTICS_PROVIDER,
      OrganizationId.DISTRIBUTOR,
    ],
    [
      ActorRole.PRODUCER_MANAGER,
      ActorRole.LOGISTICS_COORDINATOR,
      ActorRole.DISTRIBUTION_MANAGER,
    ],
  ),
  policy(
    "AUTH_RECALL",
    [TransactionType.RECALL_BATCH],
    [OrganizationId.REGULATOR],
    [ActorRole.REGULATORY_AUDITOR],
  ),
  policy(
    "AUTH_ENDORSE_CUSTODY_TRANSFER",
    [
      endorsementAuthorizationCommandType(
        TransactionType.TRANSFER_CUSTODY,
      ),
    ],
    [
      OrganizationId.PRODUCER_COOP,
      OrganizationId.LOGISTICS_PROVIDER,
    ],
    [
      ActorRole.PRODUCER_MANAGER,
      ActorRole.LOGISTICS_COORDINATOR,
    ],
  ),
  policy(
    "AUTH_ENDORSE_QUANTITY_CORRECTION",
    [
      endorsementAuthorizationCommandType(
        TransactionType.RECORD_CORRECTION,
      ),
    ],
    [
      OrganizationId.COFFEE_PROCESSOR,
      OrganizationId.PRODUCER_COOP,
    ],
    [
      ActorRole.PROCESSING_MANAGER,
      ActorRole.PRODUCER_MANAGER,
    ],
  ),
];

const endorsementPolicies: readonly EndorsementPolicyDefinition[] = [
  {
    endorsementPolicyId: "ENDORSE_CUSTODY_SENDER_AND_RECEIVER",
    appliesToCommandTypes: [TransactionType.TRANSFER_CUSTODY],
    expression: {
      kind: "ALL_OF",
      policies: [
        {
          kind: "SIGNED_BY",
          organizationId: OrganizationId.PRODUCER_COOP,
        },
        {
          kind: "SIGNED_BY",
          organizationId: OrganizationId.LOGISTICS_PROVIDER,
        },
      ],
    },
    localizationKey: "endorsement.policy.custody",
  },
  {
    endorsementPolicyId: "ENDORSE_CORRECTION_PRODUCER_AND_PROCESSOR",
    appliesToCommandTypes: [TransactionType.RECORD_CORRECTION],
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
    localizationKey: "endorsement.policy.correction",
  },
];

export const coffeeCryptographicRuntime: CryptographicRuntime = {
  identityRegistry: {
    schemaVersion: "1",
    identities: [
      {
        organizationId: OrganizationId.PRODUCER_COOP,
        recognized: true,
        displayNameKey: "organizations.producerCoop.name",
        activeKeyIds: ["KEY_PRODUCER_001"],
      },
      {
        organizationId: OrganizationId.CERTIFICATION_BODY,
        recognized: true,
        displayNameKey: "organizations.certificationBody.name",
        activeKeyIds: ["KEY_CERTIFIER_001"],
      },
      {
        organizationId: OrganizationId.LOGISTICS_PROVIDER,
        recognized: true,
        displayNameKey: "organizations.logisticsProvider.name",
        activeKeyIds: ["KEY_LOGISTICS_001"],
      },
      {
        organizationId: OrganizationId.COFFEE_PROCESSOR,
        recognized: true,
        displayNameKey: "organizations.coffeeProcessor.name",
        activeKeyIds: ["KEY_PROCESSOR_001"],
      },
      {
        organizationId: OrganizationId.DISTRIBUTOR,
        recognized: true,
        displayNameKey: "organizations.distributor.name",
        activeKeyIds: ["KEY_DISTRIBUTOR_001"],
      },
      {
        organizationId: OrganizationId.RETAILER,
        recognized: true,
        displayNameKey: "organizations.retailer.name",
        activeKeyIds: ["KEY_RETAILER_001"],
      },
      {
        organizationId: OrganizationId.REGULATOR,
        recognized: true,
        displayNameKey: "organizations.regulator.name",
        activeKeyIds: ["KEY_REGULATOR_001"],
      },
      {
        organizationId: OrganizationId.UNRECOGNIZED_CERTIFIER,
        recognized: false,
        displayNameKey: "organizations.unrecognizedCertifier.name",
        activeKeyIds: ["KEY_UNRECOGNIZED_001"],
      },
    ],
  },
  signingKeys: {
    schemaVersion: "1",
    keys,
  },
  authorizationPolicies: {
    schemaVersion: "1",
    policies: authorizationPolicies,
  },
  endorsementPolicies: {
    schemaVersion: "1",
    policies: endorsementPolicies,
  },
};
