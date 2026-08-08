/**
 * Who may do what (specification section 13.3).
 *
 * These are the rules that make this a *permissioned* network. An organization
 * that is not recognized, or is recognized but not authorized for an action,
 * cannot write it -- which is the whole difference between this and an open
 * ledger, and the reason a certificate from an unrecognized body is rejected in
 * stage 3.
 */

import { OrganizationType, TransactionType } from "../types/enums";
import { ValidationRuleId } from "../types/rule-ids";
import type { SupplyChainCommand } from "../commands/commands";
import {
  ALL_TRANSACTION_TYPES,
  receivingOrganizationId,
} from "../commands/command-targets";
import { failed, passed, type ValidationRule } from "./types";

export const actorAuthorizedRule: ValidationRule = {
  ruleId: ValidationRuleId.ACTOR_AUTHORIZED,
  appliesTo: ALL_TRANSACTION_TYPES,
  evaluate(command, context) {
    const actor = context.actorsById[context.actorId];
    if (actor === undefined || !actor.isAuthorized) {
      return failed(ValidationRuleId.ACTOR_AUTHORIZED, "validation.actorNotAuthorized", {
        actorId: context.actorId,
      });
    }

    const organization = context.organizationsById[context.organizationId];
    if (organization === undefined) {
      return failed(ValidationRuleId.ACTOR_AUTHORIZED, "validation.organizationUnknown", {
        organizationId: context.organizationId,
      });
    }

    // An actor may only act on behalf of their own organization.
    if (actor.organizationId !== context.organizationId) {
      return failed(ValidationRuleId.ACTOR_AUTHORIZED, "validation.actorOrganizationMismatch", {
        actorOrganization: actor.organizationId,
        claimedOrganization: context.organizationId,
      });
    }

    if (!organization.authorizedActions.includes(command.commandType)) {
      return failed(ValidationRuleId.ACTOR_AUTHORIZED, "validation.actionNotPermitted", {
        organizationId: context.organizationId,
        action: command.commandType,
      });
    }

    // A batch must be created under the organization actually proposing it --
    // a producer cannot register a harvest on someone else's behalf.
    if (
      command.commandType === TransactionType.CREATE_BATCH &&
      command.producerOrganizationId !== context.organizationId
    ) {
      return failed(ValidationRuleId.ACTOR_AUTHORIZED, "validation.producerMismatch", {
        declaredProducer: command.producerOrganizationId,
        actualOrganization: context.organizationId,
      });
    }

    return passed(ValidationRuleId.ACTOR_AUTHORIZED, "validation.actorAuthorized");
  },
};

export const organizationActiveRule: ValidationRule = {
  ruleId: ValidationRuleId.ORGANIZATION_ACTIVE,
  appliesTo: ALL_TRANSACTION_TYPES,
  evaluate(_command, context) {
    const organization = context.organizationsById[context.organizationId];
    if (organization === undefined || !organization.isActive) {
      return failed(ValidationRuleId.ORGANIZATION_ACTIVE, "validation.organizationInactive", {
        organizationId: context.organizationId,
      });
    }
    return passed(ValidationRuleId.ORGANIZATION_ACTIVE, "validation.organizationActive");
  },
};

/** The counterparty must be a real, active organization on the network. */
export const receiverAuthorizedRule: ValidationRule = {
  ruleId: ValidationRuleId.RECEIVER_AUTHORIZED,
  appliesTo: [
    TransactionType.TRANSFER_CUSTODY,
    TransactionType.TRANSFER_OWNERSHIP,
    TransactionType.DISPATCH_BATCH,
    TransactionType.RECEIVE_BATCH,
  ],
  evaluate(command, context) {
    const receiverId = receivingOrganizationId(command);
    if (receiverId === null) {
      return passed(ValidationRuleId.RECEIVER_AUTHORIZED, "validation.receiverAuthorized");
    }

    const receiver = context.organizationsById[receiverId];
    if (receiver === undefined) {
      return failed(ValidationRuleId.RECEIVER_AUTHORIZED, "validation.receiverUnknown", {
        organizationId: receiverId,
      });
    }
    if (!receiver.isActive) {
      return failed(ValidationRuleId.RECEIVER_AUTHORIZED, "validation.receiverInactive", {
        organizationId: receiverId,
      });
    }

    if (
      command.commandType === TransactionType.RECEIVE_BATCH &&
      receiverId !== context.organizationId
    ) {
      return failed(
        ValidationRuleId.RECEIVER_AUTHORIZED,
        "validation.receiverMustBeActingOrganization",
        {
          declaredReceiver: receiverId,
          actingOrganization: context.organizationId,
        },
      );
    }

    /*
     * Handing something to yourself is not a transfer. This applies only to the
     * outgoing transaction types: on a RECEIVE_BATCH the receiver *is* the
     * acting organization, which is the whole point of booking goods in.
     */
    const isOutgoingTransfer =
      command.commandType === TransactionType.TRANSFER_CUSTODY ||
      command.commandType === TransactionType.TRANSFER_OWNERSHIP ||
      command.commandType === TransactionType.DISPATCH_BATCH;

    if (isOutgoingTransfer && receiverId === context.organizationId) {
      return failed(ValidationRuleId.RECEIVER_AUTHORIZED, "validation.receiverSameAsSender");
    }

    return passed(ValidationRuleId.RECEIVER_AUTHORIZED, "validation.receiverAuthorized");
  },
};

/**
 * Only a recognized certification body may issue a certificate.
 *
 * This is what stage 3's second half turns on: a certificate arrives from an
 * organization that looks plausible but is not on the network, and the learner
 * must reject it. A hash proves a document has not changed; it says nothing
 * about whether its issuer had any standing to issue it.
 */
export const certifierAuthorizedRule: ValidationRule = {
  ruleId: ValidationRuleId.CERTIFIER_AUTHORIZED,
  appliesTo: [TransactionType.ISSUE_CERTIFICATE, TransactionType.ANCHOR_DOCUMENT],
  evaluate(command, context) {
    if (
      command.commandType !== TransactionType.ISSUE_CERTIFICATE &&
      command.commandType !== TransactionType.ANCHOR_DOCUMENT
    ) {
      return passed(ValidationRuleId.CERTIFIER_AUTHORIZED, "validation.certifierAuthorized");
    }

    const issuer = context.organizationsById[command.issuerOrganizationId];
    if (issuer === undefined) {
      return failed(ValidationRuleId.CERTIFIER_AUTHORIZED, "validation.certifierUnknown", {
        organizationId: command.issuerOrganizationId,
      });
    }
    if (!issuer.isActive) {
      return failed(ValidationRuleId.CERTIFIER_AUTHORIZED, "validation.certifierNotRecognized", {
        organizationId: command.issuerOrganizationId,
      });
    }

    if (command.commandType === TransactionType.ISSUE_CERTIFICATE) {
      if (command.issuerOrganizationId !== context.organizationId) {
        return failed(
          ValidationRuleId.CERTIFIER_AUTHORIZED,
          "validation.certifierOrganizationMismatch",
          {
            declaredIssuer: command.issuerOrganizationId,
            actingOrganization: context.organizationId,
          },
        );
      }
      if (issuer.organizationType !== OrganizationType.CERTIFIER) {
        return failed(ValidationRuleId.CERTIFIER_AUTHORIZED, "validation.certifierWrongType", {
          organizationId: command.issuerOrganizationId,
          organizationType: issuer.organizationType,
        });
      }
      if (!issuer.authorizedActions.includes(TransactionType.ISSUE_CERTIFICATE)) {
        return failed(
          ValidationRuleId.CERTIFIER_AUTHORIZED,
          "validation.certifierNotAuthorized",
          { organizationId: command.issuerOrganizationId },
        );
      }
    }

    return passed(ValidationRuleId.CERTIFIER_AUTHORIZED, "validation.certifierAuthorized");
  },
};

/** Only the regulator may recall. */
export const recallAuthorizedRule: ValidationRule = {
  ruleId: ValidationRuleId.RECALL_AUTHORIZED,
  appliesTo: [TransactionType.RECALL_BATCH],
  evaluate(_command, context) {
    const organization = context.organizationsById[context.organizationId];
    if (organization?.organizationType !== OrganizationType.REGULATOR) {
      return failed(ValidationRuleId.RECALL_AUTHORIZED, "validation.recallNotAuthorized", {
        organizationId: context.organizationId,
      });
    }
    return passed(ValidationRuleId.RECALL_AUTHORIZED, "validation.recallAuthorized");
  },
};

export const authorizationRules: readonly ValidationRule<SupplyChainCommand>[] = [
  actorAuthorizedRule,
  organizationActiveRule,
  receiverAuthorizedRule,
  certifierAuthorizedRule,
  recallAuthorizedRule,
];
