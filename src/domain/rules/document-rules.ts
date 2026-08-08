/**
 * Documents and certificates (specification sections 8.3 and 13.3).
 *
 * The pedagogical point behind both rules: a hash tells you a referenced
 * document has not changed since it was anchored. It tells you nothing about
 * whether the document was true, or whether whoever signed it had any standing
 * to. Integrity is not authority, and neither is validity.
 */

import { DocumentType, TransactionType } from "../types/enums";
import { ValidationRuleId } from "../types/rule-ids";
import type { SupplyChainCommand } from "../commands/commands";
import { failed, notApplicable, passed, type ValidationRule } from "./types";

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * An anchored document must carry a digest. Recording only a filename -- one of
 * the wrong answers offered in stage 3 -- proves nothing at all: the file
 * behind that name can be swapped and the ledger will never notice.
 */
export const documentHashPresentRule: ValidationRule = {
  ruleId: ValidationRuleId.DOCUMENT_HASH_PRESENT,
  appliesTo: [TransactionType.ANCHOR_DOCUMENT, TransactionType.ISSUE_CERTIFICATE],
  evaluate(command, context) {
    // Anchoring creates the record, so the digest is checked on the command.
    if (command.commandType === TransactionType.ANCHOR_DOCUMENT) {
      if (!SHA256_HEX.test(command.contentHash)) {
        return failed(ValidationRuleId.DOCUMENT_HASH_PRESENT, "validation.documentHashMissing", {
          documentAnchorId: command.documentAnchorId,
        });
      }
      return passed(ValidationRuleId.DOCUMENT_HASH_PRESENT, "validation.documentHashPresent");
    }

    // Certifying references a document that must already be anchored.
    if (command.commandType !== TransactionType.ISSUE_CERTIFICATE) {
      return notApplicable(ValidationRuleId.DOCUMENT_HASH_PRESENT);
    }

    const anchor = context.state.documentAnchorsById[command.documentAnchorId];
    if (anchor === undefined) {
      return failed(ValidationRuleId.DOCUMENT_HASH_PRESENT, "validation.documentAnchorMissing", {
        documentAnchorId: command.documentAnchorId,
      });
    }
    if (!SHA256_HEX.test(anchor.contentHash)) {
      return failed(ValidationRuleId.DOCUMENT_HASH_PRESENT, "validation.documentHashMissing", {
        documentAnchorId: command.documentAnchorId,
      });
    }

    return passed(ValidationRuleId.DOCUMENT_HASH_PRESENT, "validation.documentHashPresent");
  },
};

/** Anchor identifiers are immutable, and certificates use their asset's anchor. */
export const documentAnchorValidRule: ValidationRule = {
  ruleId: ValidationRuleId.DOCUMENT_ANCHOR_VALID,
  appliesTo: [TransactionType.ANCHOR_DOCUMENT, TransactionType.ISSUE_CERTIFICATE],
  evaluate(command, context) {
    if (command.commandType === TransactionType.ANCHOR_DOCUMENT) {
      if (
        context.state.documentAnchorsById[command.documentAnchorId] !==
        undefined
      ) {
        return failed(
          ValidationRuleId.DOCUMENT_ANCHOR_VALID,
          "validation.documentAnchorIdAlreadyExists",
          { documentAnchorId: command.documentAnchorId },
        );
      }
      return passed(
        ValidationRuleId.DOCUMENT_ANCHOR_VALID,
        "validation.documentAnchorValid",
      );
    }

    if (command.commandType !== TransactionType.ISSUE_CERTIFICATE) {
      return notApplicable(ValidationRuleId.DOCUMENT_ANCHOR_VALID);
    }

    const anchor =
      context.state.documentAnchorsById[command.documentAnchorId];
    const asset = context.state.assetsById[command.assetId];
    if (anchor === undefined || asset === undefined) {
      return notApplicable(ValidationRuleId.DOCUMENT_ANCHOR_VALID);
    }
    if (!asset.documentAnchorIds.includes(command.documentAnchorId)) {
      return failed(
        ValidationRuleId.DOCUMENT_ANCHOR_VALID,
        "validation.documentAnchorNotLinkedToAsset",
        {
          assetId: command.assetId,
          documentAnchorId: command.documentAnchorId,
        },
      );
    }
    if (anchor.documentType !== DocumentType.QUALITY_CERTIFICATE) {
      return failed(
        ValidationRuleId.DOCUMENT_ANCHOR_VALID,
        "validation.documentAnchorNotCertificate",
        {
          documentAnchorId: command.documentAnchorId,
          documentType: anchor.documentType,
        },
      );
    }
    if (anchor.issuerOrganizationId !== command.issuerOrganizationId) {
      return failed(
        ValidationRuleId.DOCUMENT_ANCHOR_VALID,
        "validation.documentAnchorIssuerMismatch",
        {
          anchorIssuer: anchor.issuerOrganizationId,
          declaredIssuer: command.issuerOrganizationId,
        },
      );
    }

    return passed(
      ValidationRuleId.DOCUMENT_ANCHOR_VALID,
      "validation.documentAnchorValid",
    );
  },
};

/** The metadata discriminant must match the document and its values be valid. */
export const documentMetadataValidRule: ValidationRule = {
  ruleId: ValidationRuleId.DOCUMENT_METADATA_VALID,
  appliesTo: [TransactionType.ANCHOR_DOCUMENT],
  evaluate(command) {
    if (command.commandType !== TransactionType.ANCHOR_DOCUMENT) {
      return notApplicable(ValidationRuleId.DOCUMENT_METADATA_VALID);
    }

    if (command.metadata.kind !== command.documentType) {
      return failed(
        ValidationRuleId.DOCUMENT_METADATA_VALID,
        "validation.documentMetadataTypeMismatch",
      );
    }
    if (
      command.documentType === DocumentType.SHIPPING_MANIFEST &&
      (command.metadata.kind !== DocumentType.SHIPPING_MANIFEST ||
        !Number.isFinite(command.metadata.declaredQuantity.amount) ||
        command.metadata.declaredQuantity.amount <= 0)
    ) {
      return failed(
        ValidationRuleId.DOCUMENT_METADATA_VALID,
        "validation.documentMetadataInvalid",
      );
    }

    return passed(
      ValidationRuleId.DOCUMENT_METADATA_VALID,
      "validation.documentMetadataValid",
    );
  },
};

/** A certificate that has lapsed cannot be used to certify anything. */
export const certificateNotExpiredRule: ValidationRule = {
  ruleId: ValidationRuleId.CERTIFICATE_NOT_EXPIRED,
  appliesTo: [TransactionType.ISSUE_CERTIFICATE],
  evaluate(command, context) {
    if (command.commandType !== TransactionType.ISSUE_CERTIFICATE) {
      return notApplicable(ValidationRuleId.CERTIFICATE_NOT_EXPIRED);
    }

    const anchor = context.state.documentAnchorsById[command.documentAnchorId];
    if (anchor?.expiresAt === undefined) {
      // No expiry recorded is not the same as expired.
      return passed(ValidationRuleId.CERTIFICATE_NOT_EXPIRED, "validation.certificateNotExpired");
    }

    const expiresAt = Date.parse(anchor.expiresAt);
    const issuedAgainstAt = Date.parse(command.scenarioTimestamp);

    if (!Number.isFinite(expiresAt) || !Number.isFinite(issuedAgainstAt)) {
      return failed(ValidationRuleId.CERTIFICATE_NOT_EXPIRED, "validation.certificateDateInvalid", {
        documentAnchorId: command.documentAnchorId,
      });
    }
    if (expiresAt <= issuedAgainstAt) {
      return failed(ValidationRuleId.CERTIFICATE_NOT_EXPIRED, "validation.certificateExpired", {
        expiresAt: anchor.expiresAt,
      });
    }

    return passed(ValidationRuleId.CERTIFICATE_NOT_EXPIRED, "validation.certificateNotExpired");
  },
};

export const documentRules: readonly ValidationRule<SupplyChainCommand>[] = [
  documentHashPresentRule,
  documentAnchorValidRule,
  documentMetadataValidRule,
  certificateNotExpiredRule,
];
