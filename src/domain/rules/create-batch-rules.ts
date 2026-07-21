/**
 * Rules governing CREATE_BATCH (specification section 8.2).
 *
 * Every failure message is a localization key resolved against the Vietnamese
 * catalogue, and every message explains the *business* reason. "Invalid
 * transaction" is explicitly forbidden by specification section 18.4.
 */

import { QuantityUnit, TransactionType } from "../types/enums";
import { ValidationRuleId } from "../types/rule-ids";
import { isConvertibleToGrams } from "../units/convert";
import type { CreateBatchCommand } from "../commands/commands";
import { failed, passed, type ValidationRule } from "./types";

const APPLIES_TO = [TransactionType.CREATE_BATCH] as const;

export const actorAuthorizedRule: ValidationRule<CreateBatchCommand> = {
  ruleId: ValidationRuleId.ACTOR_AUTHORIZED,
  appliesTo: APPLIES_TO,
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
    if (!organization.authorizedActions.includes(TransactionType.CREATE_BATCH)) {
      return failed(ValidationRuleId.ACTOR_AUTHORIZED, "validation.actionNotPermitted", {
        organizationId: context.organizationId,
        action: TransactionType.CREATE_BATCH,
      });
    }
    // The batch must be created under the organization actually proposing it.
    if (command.producerOrganizationId !== context.organizationId) {
      return failed(ValidationRuleId.ACTOR_AUTHORIZED, "validation.producerMismatch", {
        declaredProducer: command.producerOrganizationId,
        actualOrganization: context.organizationId,
      });
    }
    return passed(ValidationRuleId.ACTOR_AUTHORIZED, "validation.actorAuthorized");
  },
};

export const organizationActiveRule: ValidationRule<CreateBatchCommand> = {
  ruleId: ValidationRuleId.ORGANIZATION_ACTIVE,
  appliesTo: APPLIES_TO,
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

export const assetIdUniqueRule: ValidationRule<CreateBatchCommand> = {
  ruleId: ValidationRuleId.ASSET_ID_UNIQUE,
  appliesTo: APPLIES_TO,
  evaluate(command, context) {
    if (context.state.assetsById[command.assetId] !== undefined) {
      return failed(ValidationRuleId.ASSET_ID_UNIQUE, "validation.assetIdAlreadyExists", {
        assetId: command.assetId,
      });
    }
    if (command.assetId.trim().length === 0) {
      return failed(ValidationRuleId.ASSET_ID_UNIQUE, "validation.assetIdRequired");
    }
    return passed(ValidationRuleId.ASSET_ID_UNIQUE, "validation.assetIdUnique");
  },
};

export const validQuantityRule: ValidationRule<CreateBatchCommand> = {
  ruleId: ValidationRuleId.VALID_QUANTITY,
  appliesTo: APPLIES_TO,
  evaluate(command) {
    if (!Number.isFinite(command.quantity)) {
      return failed(ValidationRuleId.VALID_QUANTITY, "validation.quantityNotANumber");
    }
    if (command.quantity <= 0) {
      return failed(ValidationRuleId.VALID_QUANTITY, "validation.quantityMustBePositive", {
        quantity: command.quantity,
      });
    }
    return passed(ValidationRuleId.VALID_QUANTITY, "validation.quantityValid");
  },
};

export const unitCompatibleRule: ValidationRule<CreateBatchCommand> = {
  ruleId: ValidationRuleId.UNIT_COMPATIBLE,
  appliesTo: APPLIES_TO,
  evaluate(command) {
    // An asset measured in UNIT must declare a package size, or later
    // transformation rules have no way to compare its mass against an input.
    if (!isConvertibleToGrams(command.quantityUnit, command.packageSizeGrams)) {
      return failed(ValidationRuleId.UNIT_COMPATIBLE, "validation.packageSizeRequired", {
        quantityUnit: command.quantityUnit,
      });
    }
    if (command.quantityUnit !== QuantityUnit.UNIT && command.packageSizeGrams !== null) {
      return failed(ValidationRuleId.UNIT_COMPATIBLE, "validation.packageSizeNotApplicable", {
        quantityUnit: command.quantityUnit,
      });
    }
    return passed(ValidationRuleId.UNIT_COMPATIBLE, "validation.unitCompatible");
  },
};

export const createBatchRules: readonly ValidationRule<CreateBatchCommand>[] = [
  actorAuthorizedRule,
  organizationActiveRule,
  assetIdUniqueRule,
  validQuantityRule,
  unitCompatibleRule,
];
