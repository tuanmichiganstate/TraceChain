/**
 * Translating a validated command into the event that records its outcome.
 *
 * This runs only after the rule engine has accepted the command, so it may
 * assume the world is in a state where the event makes sense. It reads state
 * for two reasons only: to record the *previous* holder on a transfer (history
 * needs to say what changed, not just what it changed to), and to compute
 * recall scope from the provenance graph.
 */

import {
  ComplianceStatus,
  LedgerEventType,
  ProvenanceRelationshipType,
  TransactionType,
} from "../types/enums";
import type { SupplyChainCommand } from "../commands/commands";
import type { LedgerDomainEvent } from "../events/events";
import { calculateRecallScope } from "../provenance/recall-scope";
import type { DomainState } from "./domain-state";

export function commandToEvent(
  command: SupplyChainCommand,
  transactionId: string,
  state: DomainState,
): LedgerDomainEvent {
  const committedAt = command.scenarioTimestamp;

  switch (command.commandType) {
    case TransactionType.CREATE_BATCH:
      return {
        eventType: LedgerEventType.BATCH_CREATED,
        transactionId,
        committedAt,
        assetId: command.assetId,
        assetType: command.assetType,
        productName: command.productName,
        originLocation: command.originLocation,
        productionDate: command.productionDate,
        quantity: command.quantity,
        quantityUnit: command.quantityUnit,
        packageSizeGrams: command.packageSizeGrams,
        // A newly harvested batch is owned and held by its producer.
        ownerOrganizationId: command.producerOrganizationId,
        custodianOrganizationId: command.producerOrganizationId,
        locationId: command.locationId,
      };

    case TransactionType.ANCHOR_DOCUMENT:
      return {
        eventType: LedgerEventType.DOCUMENT_ANCHORED,
        transactionId,
        committedAt,
        assetId: command.assetId,
        documentAnchorId: command.documentAnchorId,
        documentType: command.documentType,
        fileName: command.fileName,
        contentHash: command.contentHash,
        metadata: command.metadata,
        issuerOrganizationId: command.issuerOrganizationId,
        issuedAt: command.issuedAt,
        ...(command.expiresAt === undefined ? {} : { expiresAt: command.expiresAt }),
      };

    case TransactionType.ISSUE_CERTIFICATE: {
      const asset = state.assetsById[command.assetId];
      return {
        eventType: LedgerEventType.CERTIFICATE_ISSUED,
        transactionId,
        committedAt,
        assetId: command.assetId,
        certificateId: command.certificateId,
        /*
         * A certificate does not clear a batch that is already under
         * inspection. A humidity excursion recorded in transit stays flagged
         * until it is actually inspected -- a certificate issued before the
         * journey cannot retrospectively vouch for what happened during it.
         */
        complianceStatus:
          asset?.complianceStatus === ComplianceStatus.INSPECTION_REQUIRED
            ? ComplianceStatus.INSPECTION_REQUIRED
            : ComplianceStatus.COMPLIANT,
      };
    }

    case TransactionType.TRANSFER_OWNERSHIP: {
      const asset = state.assetsById[command.assetId];
      return {
        eventType: LedgerEventType.OWNERSHIP_TRANSFERRED,
        transactionId,
        committedAt,
        assetId: command.assetId,
        previousOwnerId: asset?.currentOwnerId ?? command.fromOrganizationId,
        newOwnerId: command.toOrganizationId,
      };
    }

    case TransactionType.TRANSFER_CUSTODY: {
      const asset = state.assetsById[command.assetId];
      return {
        eventType: LedgerEventType.CUSTODY_TRANSFERRED,
        transactionId,
        committedAt,
        assetId: command.assetId,
        previousCustodianId: asset?.currentCustodianId ?? command.fromOrganizationId,
        newCustodianId: command.toOrganizationId,
        newLocationId: command.toLocationId,
      };
    }

    case TransactionType.RECORD_TRANSPORT_CONDITION: {
      const isThresholdViolated =
        command.humidityPercent > command.allowedMaximumHumidityPercent;
      return {
        eventType: LedgerEventType.TRANSPORT_CONDITION_RECORDED,
        transactionId,
        committedAt,
        assetId: command.assetId,
        sensorId: command.sensorId,
        humidityPercent: command.humidityPercent,
        isThresholdViolated,
        // An excursion does not condemn the batch; it requires someone to look
        // at it. The distinction matters -- blockchain records the reading, a
        // human decides what it means.
        resultingComplianceStatus: isThresholdViolated
          ? ComplianceStatus.INSPECTION_REQUIRED
          : (state.assetsById[command.assetId]?.complianceStatus ?? ComplianceStatus.COMPLIANT),
        locationId: command.locationId,
      };
    }

    case TransactionType.RECEIVE_BATCH:
      return {
        eventType: LedgerEventType.BATCH_RECEIVED,
        transactionId,
        committedAt,
        assetId: command.assetId,
        receivingOrganizationId: command.receivingOrganizationId,
        locationId: command.locationId,
        recordedQuantity: command.observedQuantity,
      };

    case TransactionType.RECORD_CORRECTION:
      return {
        eventType: LedgerEventType.CORRECTION_RECORDED,
        transactionId,
        committedAt,
        assetId: command.assetId,
        correctionOfTransactionId: command.correctionOfTransactionId,
        target: command.target,
        incorrectValue: command.incorrectValue,
        correctedValue: command.correctedValue,
        reason: command.reason,
      };

    case TransactionType.TRANSFORM_BATCH:
      return {
        eventType: LedgerEventType.BATCH_TRANSFORMED,
        transactionId,
        committedAt,
        inputAssetId: command.inputAssetId,
        outputAssetId: command.outputAssetId,
        outputAssetType: command.outputAssetType,
        outputProductName: command.outputProductName,
        outputQuantity: command.outputQuantity,
        outputQuantityUnit: command.outputQuantityUnit,
        outputPackageSizeGrams: command.outputPackageSizeGrams,
        relationshipType: ProvenanceRelationshipType.TRANSFORMED_INTO,
      };

    case TransactionType.PACKAGE_BATCH:
      return {
        eventType: LedgerEventType.BATCH_PACKAGED,
        transactionId,
        committedAt,
        inputAssetId: command.inputAssetId,
        outputAssetId: command.outputAssetId,
        outputProductName: command.outputProductName,
        packageCount: command.packageCount,
        packageSizeGrams: command.packageSizeGrams,
      };

    case TransactionType.DISPATCH_BATCH: {
      const asset = state.assetsById[command.assetId];
      return {
        eventType: LedgerEventType.BATCH_DISPATCHED,
        transactionId,
        committedAt,
        assetId: command.assetId,
        fromOrganizationId: asset?.currentOwnerId ?? command.fromOrganizationId,
        toOrganizationId: command.toOrganizationId,
        toLocationId: command.toLocationId,
      };
    }

    case TransactionType.RECALL_BATCH: {
      /*
       * The recall's true extent is computed from the provenance graph, not
       * taken from the learner's selection. The learner's answer is scored
       * against this, but the ledger records what is actually affected -- a
       * learner's mistake must not leave contaminated stock marked as saleable.
       */
      const scope = calculateRecallScope(command.sourceAssetId, state);
      return {
        eventType: LedgerEventType.BATCH_RECALLED,
        transactionId,
        committedAt,
        sourceAssetId: command.sourceAssetId,
        affectedAssetIds: scope.affectedAssetIds,
        reason: command.reason,
        externalEvidenceReference: command.externalEvidenceReference,
      };
    }

    default: {
      const unhandled: never = command;
      return unhandled;
    }
  }
}
