import { TransactionType } from "../../domain/types/enums";
import type { ScriptedTransactionDefinition } from "../../domain/types/scenario";
import {
  SHIPPING_MANIFEST_ANCHOR_ID,
  anchorShippingManifestCommand,
} from "./commands";
import { ActorId, OrganizationId } from "./organizations";
import { GREEN_COFFEE_BATCH_ID } from "./stages";

/**
 * The manifest is authored by the shipping clerk only after the learner's
 * custody handoff is committed. Its declaration is intentionally wrong so the
 * learner must append a correction in Stage 5.
 */
export const coffeeScriptedTransactions: readonly ScriptedTransactionDefinition[] = [
  {
    scriptId: "SCRIPT_SHIPPING_MANIFEST_AFTER_CUSTODY",
    trigger: {
      kind: "AFTER_COMMITTED_TRANSACTION",
      transactionType: TransactionType.TRANSFER_CUSTODY,
      assetId: GREEN_COFFEE_BATCH_ID,
    },
    idempotencyGuard: {
      kind: "DOCUMENT_ANCHOR_ABSENT",
      documentAnchorId: SHIPPING_MANIFEST_ANCHOR_ID,
    },
    command: anchorShippingManifestCommand(),
    actorId: ActorId.SHIPPING_CLERK,
    organizationId: OrganizationId.PRODUCER_COOP,
  },
];
