/**
 * Shared domain fixtures. Kept outside `src` so nothing in the production
 * bundle can reach them, but inside the TypeScript project so they are
 * type-checked against the real models.
 */

import {
  ActorRole,
  AssetType,
  OrganizationType,
  QuantityUnit,
  TransactionType,
} from "../../src/domain/types/enums";
import type { Actor, Organization } from "../../src/domain/types/models";
import type { CreateBatchCommand } from "../../src/domain/commands/commands";
import type { ValidationContext } from "../../src/domain/rules/types";
import { createEmptyDomainState } from "../../src/domain/ledger/domain-state";

export const ORG_PRODUCER_COOP = "ORG_PRODUCER_COOP";
export const ORG_LOGISTICS_PROVIDER = "ORG_LOGISTICS_PROVIDER";
export const ACT_PRODUCER_MANAGER = "ACT_PRODUCER_MANAGER";
export const ACT_LOGISTICS_COORDINATOR = "ACT_LOGISTICS_COORDINATOR";
export const LOC_PRODUCER_FARM = "LOC_PRODUCER_FARM";

export const organizations: Record<string, Organization> = {
  [ORG_PRODUCER_COOP]: {
    organizationId: ORG_PRODUCER_COOP,
    organizationType: OrganizationType.PRODUCER,
    displayNameKey: "organizations.producerCoop.name",
    authorizedActions: [
      TransactionType.CREATE_BATCH,
      TransactionType.TRANSFER_CUSTODY,
      TransactionType.TRANSFER_OWNERSHIP,
    ],
    isActive: true,
  },
  [ORG_LOGISTICS_PROVIDER]: {
    organizationId: ORG_LOGISTICS_PROVIDER,
    organizationType: OrganizationType.LOGISTICS_PROVIDER,
    displayNameKey: "organizations.logisticsProvider.name",
    // Deliberately cannot create batches: a logistics provider inventing a
    // harvest is exactly the authorization failure stage 2 teaches.
    authorizedActions: [TransactionType.RECORD_TRANSPORT_CONDITION],
    isActive: true,
  },
};

export const actors: Record<string, Actor> = {
  [ACT_PRODUCER_MANAGER]: {
    actorId: ACT_PRODUCER_MANAGER,
    actorRole: ActorRole.PRODUCER_MANAGER,
    organizationId: ORG_PRODUCER_COOP,
    displayNameKey: "actors.producerManager.name",
    isAuthorized: true,
  },
  [ACT_LOGISTICS_COORDINATOR]: {
    actorId: ACT_LOGISTICS_COORDINATOR,
    actorRole: ActorRole.LOGISTICS_COORDINATOR,
    organizationId: ORG_LOGISTICS_PROVIDER,
    displayNameKey: "actors.logisticsCoordinator.name",
    isAuthorized: true,
  },
};

export function makeValidationContext(
  overrides: Partial<Omit<ValidationContext, "state">> = {},
): Omit<ValidationContext, "state"> {
  return {
    organizationsById: organizations,
    actorsById: actors,
    actorId: ACT_PRODUCER_MANAGER,
    organizationId: ORG_PRODUCER_COOP,
    ...overrides,
  };
}

/** The green coffee batch from the coffee scenario, stage 2. */
export function makeCreateBatchCommand(
  overrides: Partial<CreateBatchCommand> = {},
): CreateBatchCommand {
  return {
    commandType: TransactionType.CREATE_BATCH,
    assetId: "BAT_GREEN_COFFEE_001",
    assetType: AssetType.GREEN_COFFEE_BATCH,
    productName: "Arabica green coffee",
    originLocation: "Lam Dong",
    productionDate: "2025-12-10T02:00:00.000Z",
    quantity: 100,
    quantityUnit: QuantityUnit.KG,
    packageSizeGrams: null,
    producerOrganizationId: ORG_PRODUCER_COOP,
    locationId: LOC_PRODUCER_FARM,
    initiatedByActorId: ACT_PRODUCER_MANAGER,
    scenarioTimestamp: "2025-12-10T02:00:00.000Z",
    ...overrides,
  };
}

export { createEmptyDomainState };
