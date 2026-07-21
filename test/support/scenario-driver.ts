/**
 * A headless driver for the coffee scenario.
 *
 * This exists so domain tests can say "given the batch has reached the
 * processor, when the learner does X" without twenty lines of setup each time,
 * and so the Milestone 2 exit condition -- create, transfer, transform and
 * recall with no interface at all -- can be expressed as a script.
 *
 * It uses the REAL scenario data, not invented fixtures. That means the tests
 * exercise the actual authorization matrix, the actual timeline, and the actual
 * seeded distractor lots.
 */

import { sha256Hex } from "../../src/infrastructure/hashing/sha256";
import { AssetType, QuantityUnit, TransactionType } from "../../src/domain/types/enums";
import type { CommandContext, SupplyChainCommand } from "../../src/domain/commands/commands";
import type { TransactionResult } from "../../src/domain/ledger/ledger-engine";
import { SimulatedLedgerAdapter } from "../../src/domain/ledger/simulated-ledger-adapter";
import { applyScenarioSeed } from "../../src/domain/scenario/seed-replay";
import { coffeeScenario } from "../../src/scenarios/coffee-traceability/scenario";
import {
  ActorId,
  LocationId,
  OrganizationId,
} from "../../src/scenarios/coffee-traceability/organizations";
import { SCENARIO_TIMELINE } from "../../src/scenarios/coffee-traceability/timeline";
import {
  GREEN_COFFEE_BATCH_ID,
  PACKAGED_COFFEE_LOT_ID,
  ROASTED_COFFEE_BATCH_ID,
} from "../../src/scenarios/coffee-traceability/stages";

export {
  ActorId,
  LocationId,
  OrganizationId,
  SCENARIO_TIMELINE,
  GREEN_COFFEE_BATCH_ID,
  ROASTED_COFFEE_BATCH_ID,
  PACKAGED_COFFEE_LOT_ID,
  coffeeScenario,
};

const registries = {
  organizationsById: Object.fromEntries(
    coffeeScenario.organizations.map((organization) => [
      organization.organizationId,
      organization,
    ]),
  ),
  actorsById: Object.fromEntries(
    coffeeScenario.actors.map((actor) => [actor.actorId, actor]),
  ),
};

/** Who each actor works for, so tests need only name the actor. */
const ORGANIZATION_OF: Readonly<Record<string, string>> = Object.fromEntries(
  coffeeScenario.actors.map((actor) => [actor.actorId, actor.organizationId]),
);

export function contextFor(actorId: string): CommandContext {
  return { actorId, organizationId: ORGANIZATION_OF[actorId] as string };
}

export interface DriverOptions {
  /** Include the seeded background lots. Off by default to keep tests focused. */
  readonly withSeed?: boolean;
}

export function createDriver(options: DriverOptions = {}): SimulatedLedgerAdapter {
  const initialState = options.withSeed
    ? applyScenarioSeed(coffeeScenario, sha256Hex, registries).state
    : undefined;

  return new SimulatedLedgerAdapter({
    hash: sha256Hex,
    configuration: coffeeScenario.ledgerConfiguration,
    registries,
    ...(initialState === undefined ? {} : { initialState }),
  });
}

// ---- Command builders, one per scenario step ---------------------------

export const commands = {
  createBatch(overrides: Partial<Extract<SupplyChainCommand, { commandType: TransactionType.CREATE_BATCH }>> = {}) {
    return {
      commandType: TransactionType.CREATE_BATCH,
      assetId: GREEN_COFFEE_BATCH_ID,
      assetType: AssetType.GREEN_COFFEE_BATCH,
      productName: "Arabica green coffee",
      originLocation: "Lam Dong",
      productionDate: SCENARIO_TIMELINE.batchCreated,
      quantity: 100,
      quantityUnit: QuantityUnit.KG,
      packageSizeGrams: null,
      producerOrganizationId: OrganizationId.PRODUCER_COOP,
      locationId: LocationId.PRODUCER_FARM,
      initiatedByActorId: ActorId.PRODUCER_MANAGER,
      scenarioTimestamp: SCENARIO_TIMELINE.batchCreated,
      ...overrides,
    } as SupplyChainCommand;
  },

  anchorCertificate(overrides: Record<string, unknown> = {}) {
    return {
      commandType: TransactionType.ANCHOR_DOCUMENT,
      assetId: GREEN_COFFEE_BATCH_ID,
      documentAnchorId: "DOC_QUALITY_CERTIFICATE_001",
      documentType: "QUALITY_CERTIFICATE",
      fileName: "quality-certificate-001.pdf",
      contentHash: sha256Hex("simulated quality certificate content"),
      issuerOrganizationId: OrganizationId.CERTIFICATION_BODY,
      issuedAt: SCENARIO_TIMELINE.certificateIssued,
      expiresAt: SCENARIO_TIMELINE.certificateExpires,
      initiatedByActorId: ActorId.CERTIFICATION_OFFICER,
      scenarioTimestamp: SCENARIO_TIMELINE.certificateIssued,
      ...overrides,
    } as unknown as SupplyChainCommand;
  },

  issueCertificate(overrides: Record<string, unknown> = {}) {
    return {
      commandType: TransactionType.ISSUE_CERTIFICATE,
      assetId: GREEN_COFFEE_BATCH_ID,
      certificateId: "CERT_QUALITY_001",
      documentAnchorId: "DOC_QUALITY_CERTIFICATE_001",
      issuerOrganizationId: OrganizationId.CERTIFICATION_BODY,
      initiatedByActorId: ActorId.CERTIFICATION_OFFICER,
      scenarioTimestamp: SCENARIO_TIMELINE.certificateIssued,
      ...overrides,
    } as unknown as SupplyChainCommand;
  },

  transferCustody(overrides: Record<string, unknown> = {}) {
    return {
      commandType: TransactionType.TRANSFER_CUSTODY,
      assetId: GREEN_COFFEE_BATCH_ID,
      fromOrganizationId: OrganizationId.PRODUCER_COOP,
      toOrganizationId: OrganizationId.LOGISTICS_PROVIDER,
      toLocationId: LocationId.TRANSIT_STATION,
      alsoTransfersOwnership: false,
      initiatedByActorId: ActorId.PRODUCER_MANAGER,
      scenarioTimestamp: SCENARIO_TIMELINE.custodyTransferred,
      ...overrides,
    } as unknown as SupplyChainCommand;
  },

  recordTransportCondition(overrides: Record<string, unknown> = {}) {
    return {
      commandType: TransactionType.RECORD_TRANSPORT_CONDITION,
      assetId: GREEN_COFFEE_BATCH_ID,
      sensorId: "SENSOR_HUMIDITY_001",
      humidityPercent: 72,
      allowedMaximumHumidityPercent: 70,
      locationId: LocationId.TRANSIT_STATION,
      datasetAnchorId: null,
      initiatedByActorId: ActorId.LOGISTICS_COORDINATOR,
      scenarioTimestamp: SCENARIO_TIMELINE.sensorReading,
      ...overrides,
    } as unknown as SupplyChainCommand;
  },

  receiveBatch(overrides: Record<string, unknown> = {}) {
    return {
      commandType: TransactionType.RECEIVE_BATCH,
      assetId: GREEN_COFFEE_BATCH_ID,
      receivingOrganizationId: OrganizationId.COFFEE_PROCESSOR,
      locationId: LocationId.PROCESSING_PLANT,
      observedQuantity: 100,
      quantityUnit: QuantityUnit.KG,
      initiatedByActorId: ActorId.PROCESSING_MANAGER,
      scenarioTimestamp: SCENARIO_TIMELINE.batchReceived,
      ...overrides,
    } as unknown as SupplyChainCommand;
  },

  recordCorrection(overrides: Record<string, unknown> = {}) {
    return {
      commandType: TransactionType.RECORD_CORRECTION,
      assetId: GREEN_COFFEE_BATCH_ID,
      correctionOfTransactionId: "TX_000001",
      fieldName: "quantity",
      incorrectValue: "1000",
      correctedValue: "100",
      reason: "Can lai tai nha may cho ket qua 100 kg, khong phai 1000 kg",
      initiatedByActorId: ActorId.PROCESSING_MANAGER,
      scenarioTimestamp: SCENARIO_TIMELINE.correctionRecorded,
      ...overrides,
    } as unknown as SupplyChainCommand;
  },

  transformBatch(overrides: Record<string, unknown> = {}) {
    return {
      commandType: TransactionType.TRANSFORM_BATCH,
      inputAssetId: GREEN_COFFEE_BATCH_ID,
      outputAssetId: ROASTED_COFFEE_BATCH_ID,
      outputAssetType: AssetType.ROASTED_COFFEE_BATCH,
      outputProductName: "Arabica roasted coffee",
      outputQuantity: 82,
      outputQuantityUnit: QuantityUnit.KG,
      outputPackageSizeGrams: null,
      initiatedByActorId: ActorId.PROCESSING_MANAGER,
      scenarioTimestamp: SCENARIO_TIMELINE.batchRoasted,
      ...overrides,
    } as unknown as SupplyChainCommand;
  },

  packageBatch(overrides: Record<string, unknown> = {}) {
    return {
      commandType: TransactionType.PACKAGE_BATCH,
      inputAssetId: ROASTED_COFFEE_BATCH_ID,
      outputAssetId: PACKAGED_COFFEE_LOT_ID,
      outputProductName: "Ca phe Arabica Lam Dong 100g",
      packageCount: 820,
      packageSizeGrams: 100,
      initiatedByActorId: ActorId.PROCESSING_MANAGER,
      scenarioTimestamp: SCENARIO_TIMELINE.batchPackaged,
      ...overrides,
    } as unknown as SupplyChainCommand;
  },

  /** The processor buys the batch on delivery: title moves, separately from custody. */
  purchaseOnReceipt(overrides: Record<string, unknown> = {}) {
    return {
      commandType: TransactionType.TRANSFER_OWNERSHIP,
      assetId: GREEN_COFFEE_BATCH_ID,
      fromOrganizationId: OrganizationId.PRODUCER_COOP,
      toOrganizationId: OrganizationId.COFFEE_PROCESSOR,
      alsoTransfersCustody: false,
      initiatedByActorId: ActorId.PRODUCER_MANAGER,
      scenarioTimestamp: SCENARIO_TIMELINE.batchReceived,
      ...overrides,
    } as unknown as SupplyChainCommand;
  },

  transferOwnership(overrides: Record<string, unknown> = {}) {
    return {
      commandType: TransactionType.TRANSFER_OWNERSHIP,
      assetId: PACKAGED_COFFEE_LOT_ID,
      fromOrganizationId: OrganizationId.COFFEE_PROCESSOR,
      toOrganizationId: OrganizationId.DISTRIBUTOR,
      alsoTransfersCustody: false,
      initiatedByActorId: ActorId.PROCESSING_MANAGER,
      scenarioTimestamp: SCENARIO_TIMELINE.ownershipTransferred,
      ...overrides,
    } as unknown as SupplyChainCommand;
  },

  dispatchBatch(overrides: Record<string, unknown> = {}) {
    return {
      commandType: TransactionType.DISPATCH_BATCH,
      assetId: PACKAGED_COFFEE_LOT_ID,
      fromOrganizationId: OrganizationId.DISTRIBUTOR,
      toOrganizationId: OrganizationId.RETAILER,
      toLocationId: LocationId.RETAIL_STORE,
      initiatedByActorId: ActorId.DISTRIBUTION_MANAGER,
      scenarioTimestamp: SCENARIO_TIMELINE.batchDispatched,
      ...overrides,
    } as unknown as SupplyChainCommand;
  },

  recallBatch(overrides: Record<string, unknown> = {}) {
    return {
      commandType: TransactionType.RECALL_BATCH,
      sourceAssetId: GREEN_COFFEE_BATCH_ID,
      selectedAssetIds: [
        GREEN_COFFEE_BATCH_ID,
        ROASTED_COFFEE_BATCH_ID,
        PACKAGED_COFFEE_LOT_ID,
      ],
      reason: "Phong thi nghiem phat hien du luong thuoc bao ve thuc vat vuot nguong",
      externalEvidenceReference: "LAB_REPORT_2026_0705",
      initiatedByActorId: ActorId.REGULATORY_AUDITOR,
      scenarioTimestamp: SCENARIO_TIMELINE.laboratoryResult,
      ...overrides,
    } as unknown as SupplyChainCommand;
  },
};

/**
 * Run the scenario's happy path up to and including the named step.
 * Returns the adapter so a test can continue from there.
 */
export async function runUpTo(
  step:
    | "created"
    | "certified"
    | "inTransit"
    | "monitored"
    | "received"
    | "roasted"
    | "packaged"
    | "sold",
  options: DriverOptions = {},
): Promise<SimulatedLedgerAdapter> {
  const ledger = createDriver(options);

  const steps: ReadonlyArray<readonly [string, () => Promise<TransactionResult>]> = [
    ["created", () => ledger.submitCommand(commands.createBatch(), contextFor(ActorId.PRODUCER_MANAGER))],
    ["certified", async () => {
      await ledger.submitCommand(commands.anchorCertificate(), contextFor(ActorId.CERTIFICATION_OFFICER));
      return ledger.submitCommand(commands.issueCertificate(), contextFor(ActorId.CERTIFICATION_OFFICER));
    }],
    ["inTransit", () => ledger.submitCommand(commands.transferCustody(), contextFor(ActorId.PRODUCER_MANAGER))],
    ["monitored", () => ledger.submitCommand(commands.recordTransportCondition(), contextFor(ActorId.LOGISTICS_COORDINATOR))],
    ["received", async () => {
      await ledger.submitCommand(commands.receiveBatch(), contextFor(ActorId.PROCESSING_MANAGER));
      // Booking goods in and buying them are separate events, proposed by
      // different organizations. Custody moved on receipt; title moves here.
      return ledger.submitCommand(commands.purchaseOnReceipt(), contextFor(ActorId.PRODUCER_MANAGER));
    }],
    ["roasted", () => ledger.submitCommand(commands.transformBatch(), contextFor(ActorId.PROCESSING_MANAGER))],
    ["packaged", () => ledger.submitCommand(commands.packageBatch(), contextFor(ActorId.PROCESSING_MANAGER))],
    ["sold", async () => {
      await ledger.submitCommand(commands.transferOwnership(), contextFor(ActorId.PROCESSING_MANAGER));
      return ledger.submitCommand(commands.dispatchBatch(), contextFor(ActorId.DISTRIBUTION_MANAGER));
    }],
  ];

  for (const [name, run] of steps) {
    const result = await run();
    if (!result.isAccepted) {
      const reasons = result.validation.failures.map((failure) => failure.messageKey).join(", ");
      throw new Error(`Scenario driver failed at "${name}": ${reasons}`);
    }
    if (name === step) break;
  }

  return ledger;
}
