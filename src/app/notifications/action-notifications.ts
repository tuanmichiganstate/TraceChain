import type { AppNotification } from "../providers/notification-provider";

export type PersistedActionNotification =
  | {
      readonly kind: "DECISION_RECORDED";
      readonly operationId: string;
      readonly outcome: "RECORDED" | "RISK_REMAINS" | "REJECTED";
    }
  | {
      readonly kind: "MITIGATION_RECORDED";
      readonly operationId: string;
    }
  | {
      readonly kind: "TRANSACTION_RESULT";
      readonly operationId: string;
      readonly accepted: boolean;
      readonly reasonKey?: string;
    }
  | {
      readonly kind: "PROPOSAL_CREATED";
      readonly operationId: string;
      readonly accepted: boolean;
      readonly missingOrganization?: string;
      readonly reasonKey?: string;
    }
  | {
      readonly kind: "ENDORSEMENT_RECORDED";
      readonly operationId: string;
      readonly accepted: boolean;
      readonly satisfied: boolean;
      readonly missingOrganization?: string;
      readonly reasonKey?: string;
    }
  | {
      readonly kind: "ENDORSEMENT_DECLINED";
      readonly operationId: string;
    }
  | {
      readonly kind: "BLOCK_COMMITTED";
      readonly operationId: string;
      readonly transactionKind:
        | "CORRECTION"
        | "RECALL"
        | "TRANSACTION";
      readonly blockNumber: string;
    }
  | {
      readonly kind: "ROLE_HANDOFF";
      readonly operationId: string;
      readonly role: string;
    }
  | {
      readonly kind: "HASH_COPIED";
      readonly operationId: string;
    }
  | {
      readonly kind: "HASH_COPY_FAILED";
      readonly operationId: string;
    }
  | {
      readonly kind: "UNSUPPORTED";
      readonly operationId: string;
    };

const SUCCESS_DISMISS_MS = 5_000;
const WARNING_DISMISS_MS = 7_000;
const REJECTION_DISMISS_MS = 8_000;

/**
 * Presentation adapter for results that are already durable.
 *
 * This function does not inspect domain state and cannot make an action true.
 * Its caller invokes it only after transactional persistence has succeeded.
 */
export function notificationForPersistedAction(
  result: PersistedActionNotification,
): AppNotification | null {
  const base = {
    notificationId: `action:${result.operationId}`,
    sourceCommandId: result.operationId,
  } as const;

  switch (result.kind) {
    case "DECISION_RECORDED":
      if (result.outcome === "REJECTED") {
        return {
          ...base,
          tone: "error",
          titleKey: "notification.decisionRejected.title",
          messageKey: "notification.decisionRejected.message",
          autoDismissMs: REJECTION_DISMISS_MS,
        };
      }
      if (result.outcome === "RISK_REMAINS") {
        return {
          ...base,
          tone: "warning",
          titleKey: "notification.decisionRisk.title",
          messageKey: "notification.decisionRisk.message",
          autoDismissMs: WARNING_DISMISS_MS,
        };
      }
      return {
        ...base,
        tone: "success",
        titleKey: "notification.decisionRecorded.title",
        messageKey: "notification.decisionRecorded.message",
        autoDismissMs: SUCCESS_DISMISS_MS,
      };

    case "MITIGATION_RECORDED":
      return {
        ...base,
        tone: "success",
        titleKey: "notification.mitigationRecorded.title",
        messageKey: "notification.mitigationRecorded.message",
        autoDismissMs: SUCCESS_DISMISS_MS,
      };

    case "TRANSACTION_RESULT":
      return result.accepted
        ? {
            ...base,
            tone: "info",
            titleKey: "notification.transactionAccepted.title",
            messageKey: "notification.transactionAccepted.message",
            autoDismissMs: SUCCESS_DISMISS_MS,
          }
        : {
            ...base,
            tone: "error",
            titleKey: "notification.transactionRejected.title",
            messageKey:
              result.reasonKey ??
              "notification.transactionRejected.message",
            autoDismissMs: REJECTION_DISMISS_MS,
          };

    case "PROPOSAL_CREATED":
      if (!result.accepted) {
        return {
          ...base,
          tone: "error",
          titleKey: "notification.transactionRejected.title",
          messageKey:
            result.reasonKey ??
            "notification.transactionRejected.message",
          autoDismissMs: REJECTION_DISMISS_MS,
        };
      }
      return {
        ...base,
        tone: "info",
        titleKey: "notification.proposalCreated.title",
        messageKey:
          result.missingOrganization === undefined
            ? "notification.proposalCreated.message"
            : "notification.proposalCreated.awaiting",
        ...(result.missingOrganization === undefined
          ? {}
          : {
              interpolation: {
                organization: result.missingOrganization,
              },
            }),
        autoDismissMs: SUCCESS_DISMISS_MS,
      };

    case "ENDORSEMENT_RECORDED":
      if (!result.accepted) {
        return {
          ...base,
          tone: "error",
          titleKey: "notification.endorsementRejected.title",
          messageKey:
            result.reasonKey ??
            "notification.endorsementRejected.message",
          autoDismissMs: REJECTION_DISMISS_MS,
        };
      }
      if (result.satisfied) {
        return {
          ...base,
          tone: "success",
          titleKey: "notification.endorsementSatisfied.title",
          messageKey: "notification.endorsementSatisfied.message",
          autoDismissMs: SUCCESS_DISMISS_MS,
        };
      }
      return {
        ...base,
        tone: "info",
        titleKey: "notification.endorsementPending.title",
        messageKey:
          result.missingOrganization === undefined
            ? "notification.endorsementPending.message"
            : "notification.endorsementPending.organization",
        ...(result.missingOrganization === undefined
          ? {}
          : {
              interpolation: {
                organization: result.missingOrganization,
              },
            }),
        autoDismissMs: SUCCESS_DISMISS_MS,
      };

    case "ENDORSEMENT_DECLINED":
      return {
        ...base,
        tone: "warning",
        titleKey: "notification.endorsementDeclined.title",
        messageKey: "notification.endorsementDeclined.message",
        autoDismissMs: WARNING_DISMISS_MS,
      };

    case "BLOCK_COMMITTED": {
      const prefix =
        result.transactionKind === "CORRECTION"
          ? "notification.correctionCommitted"
          : result.transactionKind === "RECALL"
            ? "notification.recallCommitted"
            : "notification.transactionCommitted";
      return {
        ...base,
        tone: "success",
        titleKey: `${prefix}.title`,
        messageKey: `${prefix}.message`,
        interpolation: { blockNumber: result.blockNumber },
        autoDismissMs: SUCCESS_DISMISS_MS,
      };
    }

    case "ROLE_HANDOFF":
      return {
        ...base,
        tone: "info",
        titleKey: "notification.roleHandoff.title",
        messageKey: "notification.roleHandoff.message",
        interpolation: { role: result.role },
        autoDismissMs: SUCCESS_DISMISS_MS,
      };

    case "HASH_COPIED":
      return {
        ...base,
        tone: "success",
        titleKey: "notification.hashCopied.title",
        autoDismissMs: SUCCESS_DISMISS_MS,
      };

    case "HASH_COPY_FAILED":
      return {
        ...base,
        tone: "error",
        titleKey: "notification.hashCopyFailed.title",
        messageKey: "notification.hashCopyFailed.message",
        autoDismissMs: REJECTION_DISMISS_MS,
      };

    case "UNSUPPORTED":
      return null;
  }
}
