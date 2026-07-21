/**
 * Endorsement policies (specification section 14).
 *
 * Endorsement demonstrates that the organizations with a stake in a transaction
 * approve it. It is not a real signature scheme, and the interface says so.
 *
 * WHY THE COUNTERPARTY MATTERS
 * ----------------------------
 * A custody transfer needs both the current custodian and the receiving one. In
 * a real network each endorses from its own system; here the simulation
 * endorses for the party the learner is not currently playing.
 *
 * Those generated endorsements are rendered explicitly, labelled as
 * simulated. If the counterparty's approval were invisible, learners would
 * conclude that one party's say-so is enough to move goods -- which is the
 * opposite of what a shared ledger is for.
 */

import { OrganizationType, TransactionType } from "../types/enums";
import type { CommandContext, SupplyChainCommand } from "../commands/commands";
import { receivingOrganizationId, subjectAssetId } from "../commands/command-targets";
import type { DomainState } from "./domain-state";

export interface EndorsementPolicy {
  readonly policyId: string;
  readonly transactionTypes: readonly TransactionType[];
  readonly requiredOrganizationTypes: readonly OrganizationType[];
  readonly minimumEndorsements: number;
}

/** Declarative description of the policies, for display in the interface. */
export const ENDORSEMENT_POLICIES: readonly EndorsementPolicy[] = [
  {
    policyId: "POLICY_PRODUCER_ONLY",
    transactionTypes: [TransactionType.CREATE_BATCH],
    requiredOrganizationTypes: [OrganizationType.PRODUCER],
    minimumEndorsements: 1,
  },
  {
    policyId: "POLICY_CERTIFIER_ONLY",
    transactionTypes: [TransactionType.ISSUE_CERTIFICATE, TransactionType.ANCHOR_DOCUMENT],
    requiredOrganizationTypes: [OrganizationType.CERTIFIER],
    minimumEndorsements: 1,
  },
  {
    policyId: "POLICY_BOTH_CUSTODIANS",
    transactionTypes: [TransactionType.TRANSFER_CUSTODY],
    requiredOrganizationTypes: [],
    minimumEndorsements: 2,
  },
  {
    policyId: "POLICY_BOTH_OWNERS",
    transactionTypes: [TransactionType.TRANSFER_OWNERSHIP, TransactionType.DISPATCH_BATCH],
    requiredOrganizationTypes: [],
    minimumEndorsements: 2,
  },
  {
    policyId: "POLICY_RECEIVER",
    transactionTypes: [TransactionType.RECEIVE_BATCH],
    requiredOrganizationTypes: [],
    minimumEndorsements: 1,
  },
  {
    policyId: "POLICY_PROCESSOR",
    transactionTypes: [
      TransactionType.TRANSFORM_BATCH,
      TransactionType.PACKAGE_BATCH,
      TransactionType.RECORD_CORRECTION,
    ],
    requiredOrganizationTypes: [OrganizationType.PROCESSOR],
    minimumEndorsements: 1,
  },
  {
    policyId: "POLICY_REGULATOR",
    transactionTypes: [TransactionType.RECALL_BATCH],
    requiredOrganizationTypes: [OrganizationType.REGULATOR],
    minimumEndorsements: 1,
  },
];

/**
 * Which organizations must endorse this specific transaction.
 *
 * The proposer is always among them. A counterparty is added where the
 * transaction moves goods or title between two parties -- both sides of a
 * handover have to agree it happened.
 */
export function requiredEndorsers(
  command: SupplyChainCommand,
  context: CommandContext,
  state: DomainState,
): readonly string[] {
  const endorsers = new Set<string>([context.organizationId]);

  const receiver = receivingOrganizationId(command);
  if (receiver !== null) {
    endorsers.add(receiver);
  }

  // On a transfer, the party currently holding or owning the goods must also
  // endorse, even when the transaction is proposed by someone else.
  const assetId = subjectAssetId(command);
  const asset = assetId === null ? undefined : state.assetsById[assetId];

  if (asset !== undefined) {
    if (command.commandType === TransactionType.TRANSFER_CUSTODY) {
      endorsers.add(asset.currentCustodianId);
    }
    if (
      command.commandType === TransactionType.TRANSFER_OWNERSHIP ||
      command.commandType === TransactionType.DISPATCH_BATCH
    ) {
      endorsers.add(asset.currentOwnerId);
      endorsers.add(asset.currentCustodianId);
    }
  }

  return [...endorsers];
}

export function policyFor(
  transactionType: TransactionType,
): EndorsementPolicy | undefined {
  return ENDORSEMENT_POLICIES.find((policy) =>
    policy.transactionTypes.includes(transactionType),
  );
}
