/**
 * Organizations, actors and locations for the coffee scenario
 * (specification section 7.3, 7.4, and the Location entity added to close a
 * gap in section 10.3).
 *
 * Authorized actions are deliberately narrow. A logistics provider that cannot
 * create a batch, and a distributor that cannot issue a certificate, are what
 * make RULE_ACTOR_AUTHORIZED teach something instead of always passing.
 */

import { ActorRole, OrganizationType, TransactionType } from "../../domain/types/enums";
import type { Actor, Location, Organization } from "../../domain/types/models";

export const OrganizationId = {
  PRODUCER_COOP: "ORG_PRODUCER_COOP",
  CERTIFICATION_BODY: "ORG_CERTIFICATION_BODY",
  LOGISTICS_PROVIDER: "ORG_LOGISTICS_PROVIDER",
  COFFEE_PROCESSOR: "ORG_COFFEE_PROCESSOR",
  DISTRIBUTOR: "ORG_DISTRIBUTOR",
  RETAILER: "ORG_RETAILER",
  REGULATOR: "ORG_REGULATOR",
  /**
   * Not part of the recognized network. It exists so stage 3 can present a
   * certificate from an unauthorized issuer for the learner to reject.
   */
  UNRECOGNIZED_CERTIFIER: "ORG_UNRECOGNIZED_CERTIFIER",
} as const;

export const ActorId = {
  PRODUCER_MANAGER: "ACT_PRODUCER_MANAGER",
  CERTIFICATION_OFFICER: "ACT_CERTIFICATION_OFFICER",
  UNRECOGNIZED_CERTIFICATION_OFFICER:
    "ACT_UNRECOGNIZED_CERTIFICATION_OFFICER",
  LOGISTICS_COORDINATOR: "ACT_LOGISTICS_COORDINATOR",
  PROCESSING_MANAGER: "ACT_PROCESSING_MANAGER",
  DISTRIBUTION_MANAGER: "ACT_DISTRIBUTION_MANAGER",
  RETAIL_MANAGER: "ACT_RETAIL_MANAGER",
  REGULATORY_AUDITOR: "ACT_REGULATORY_AUDITOR",
  /** Files the erroneous dispatch manifest before the learner's first shift. */
  SHIPPING_CLERK: "ACT_SHIPPING_CLERK",
} as const;

export const LocationId = {
  PRODUCER_FARM: "LOC_PRODUCER_FARM",
  TRANSIT_STATION: "LOC_TRANSIT_STATION",
  PROCESSING_PLANT: "LOC_PROCESSING_PLANT",
  DISTRIBUTION_CENTRE: "LOC_DISTRIBUTION_CENTRE",
  RETAIL_STORE: "LOC_RETAIL_STORE",
} as const;

export const organizations: readonly Organization[] = [
  {
    organizationId: OrganizationId.PRODUCER_COOP,
    organizationType: OrganizationType.PRODUCER,
    displayNameKey: "organizations.producerCoop.name",
    authorizedActions: [
      TransactionType.CREATE_BATCH,
      TransactionType.TRANSFER_CUSTODY,
      TransactionType.TRANSFER_OWNERSHIP,
      TransactionType.ANCHOR_DOCUMENT,
      TransactionType.DISPATCH_BATCH,
    ],
    isActive: true,
  },
  {
    organizationId: OrganizationId.CERTIFICATION_BODY,
    organizationType: OrganizationType.CERTIFIER,
    displayNameKey: "organizations.certificationBody.name",
    authorizedActions: [TransactionType.ISSUE_CERTIFICATE, TransactionType.ANCHOR_DOCUMENT],
    isActive: true,
  },
  {
    organizationId: OrganizationId.LOGISTICS_PROVIDER,
    organizationType: OrganizationType.LOGISTICS_PROVIDER,
    displayNameKey: "organizations.logisticsProvider.name",
    authorizedActions: [
      TransactionType.RECORD_TRANSPORT_CONDITION,
      TransactionType.TRANSFER_CUSTODY,
      TransactionType.ANCHOR_DOCUMENT,
      TransactionType.DISPATCH_BATCH,
    ],
    isActive: true,
  },
  {
    organizationId: OrganizationId.COFFEE_PROCESSOR,
    organizationType: OrganizationType.PROCESSOR,
    displayNameKey: "organizations.coffeeProcessor.name",
    authorizedActions: [
      TransactionType.RECEIVE_BATCH,
      TransactionType.RECORD_CORRECTION,
      TransactionType.TRANSFORM_BATCH,
      TransactionType.PACKAGE_BATCH,
      TransactionType.TRANSFER_OWNERSHIP,
      TransactionType.TRANSFER_CUSTODY,
    ],
    isActive: true,
  },
  {
    organizationId: OrganizationId.DISTRIBUTOR,
    organizationType: OrganizationType.DISTRIBUTOR,
    displayNameKey: "organizations.distributor.name",
    authorizedActions: [
      TransactionType.RECEIVE_BATCH,
      TransactionType.DISPATCH_BATCH,
      TransactionType.TRANSFER_OWNERSHIP,
      TransactionType.TRANSFER_CUSTODY,
    ],
    isActive: true,
  },
  {
    organizationId: OrganizationId.RETAILER,
    organizationType: OrganizationType.RETAILER,
    displayNameKey: "organizations.retailer.name",
    authorizedActions: [TransactionType.RECEIVE_BATCH],
    isActive: true,
  },
  {
    organizationId: OrganizationId.REGULATOR,
    organizationType: OrganizationType.REGULATOR,
    displayNameKey: "organizations.regulator.name",
    authorizedActions: [TransactionType.RECALL_BATCH],
    isActive: true,
  },
  {
    organizationId: OrganizationId.UNRECOGNIZED_CERTIFIER,
    organizationType: OrganizationType.CERTIFIER,
    displayNameKey: "organizations.unrecognizedCertifier.name",
    authorizedActions: [],
    isActive: false,
  },
];

export const actors: readonly Actor[] = [
  {
    actorId: ActorId.PRODUCER_MANAGER,
    actorRole: ActorRole.PRODUCER_MANAGER,
    organizationId: OrganizationId.PRODUCER_COOP,
    displayNameKey: "actors.producerManager.name",
    isAuthorized: true,
  },
  {
    actorId: ActorId.CERTIFICATION_OFFICER,
    actorRole: ActorRole.CERTIFICATION_OFFICER,
    organizationId: OrganizationId.CERTIFICATION_BODY,
    displayNameKey: "actors.certificationOfficer.name",
    isAuthorized: true,
  },
  {
    actorId: ActorId.UNRECOGNIZED_CERTIFICATION_OFFICER,
    actorRole: ActorRole.CERTIFICATION_OFFICER,
    organizationId: OrganizationId.UNRECOGNIZED_CERTIFIER,
    displayNameKey: "actors.unrecognizedCertificationOfficer.name",
    isAuthorized: false,
  },
  {
    actorId: ActorId.LOGISTICS_COORDINATOR,
    actorRole: ActorRole.LOGISTICS_COORDINATOR,
    organizationId: OrganizationId.LOGISTICS_PROVIDER,
    displayNameKey: "actors.logisticsCoordinator.name",
    isAuthorized: true,
  },
  {
    actorId: ActorId.PROCESSING_MANAGER,
    actorRole: ActorRole.PROCESSING_MANAGER,
    organizationId: OrganizationId.COFFEE_PROCESSOR,
    displayNameKey: "actors.processingManager.name",
    isAuthorized: true,
  },
  {
    actorId: ActorId.DISTRIBUTION_MANAGER,
    actorRole: ActorRole.DISTRIBUTION_MANAGER,
    organizationId: OrganizationId.DISTRIBUTOR,
    displayNameKey: "actors.distributionManager.name",
    isAuthorized: true,
  },
  {
    actorId: ActorId.RETAIL_MANAGER,
    actorRole: ActorRole.RETAIL_MANAGER,
    organizationId: OrganizationId.RETAILER,
    displayNameKey: "actors.retailManager.name",
    isAuthorized: true,
  },
  {
    actorId: ActorId.REGULATORY_AUDITOR,
    actorRole: ActorRole.REGULATORY_AUDITOR,
    organizationId: OrganizationId.REGULATOR,
    displayNameKey: "actors.regulatoryAuditor.name",
    isAuthorized: true,
  },
  {
    actorId: ActorId.SHIPPING_CLERK,
    actorRole: ActorRole.SHIPPING_CLERK,
    organizationId: OrganizationId.PRODUCER_COOP,
    displayNameKey: "actors.shippingClerk.name",
    isAuthorized: true,
  },
];

export const locations: readonly Location[] = [
  {
    locationId: LocationId.PRODUCER_FARM,
    displayNameKey: "locations.producerFarm.name",
    operatedByOrganizationId: OrganizationId.PRODUCER_COOP,
  },
  {
    locationId: LocationId.TRANSIT_STATION,
    displayNameKey: "locations.transitStation.name",
    operatedByOrganizationId: OrganizationId.LOGISTICS_PROVIDER,
  },
  {
    locationId: LocationId.PROCESSING_PLANT,
    displayNameKey: "locations.processingPlant.name",
    operatedByOrganizationId: OrganizationId.COFFEE_PROCESSOR,
  },
  {
    locationId: LocationId.DISTRIBUTION_CENTRE,
    displayNameKey: "locations.distributionCentre.name",
    operatedByOrganizationId: OrganizationId.DISTRIBUTOR,
  },
  {
    locationId: LocationId.RETAIL_STORE,
    displayNameKey: "locations.retailStore.name",
    operatedByOrganizationId: OrganizationId.RETAILER,
  },
];

export const organizationsById: Readonly<Record<string, Organization>> = Object.fromEntries(
  organizations.map((organization) => [organization.organizationId, organization]),
);

export const actorsById: Readonly<Record<string, Actor>> = Object.fromEntries(
  actors.map((actor) => [actor.actorId, actor]),
);

export const locationsById: Readonly<Record<string, Location>> = Object.fromEntries(
  locations.map((location) => [location.locationId, location]),
);
