import type {
  TechnicalExperimentActionType,
  TechnicalLabRendererId,
} from "./contracts";

export interface TechnicalLabRendererContract {
  readonly rendererId: TechnicalLabRendererId;
  readonly permittedActions:
    ReadonlySet<TechnicalExperimentActionType>;
}

function actions(
  ...values: readonly TechnicalExperimentActionType[]
): ReadonlySet<TechnicalExperimentActionType> {
  return new Set(values);
}

/**
 * This is a capability registry, not a React-component registry. Pack content
 * may select a reviewed renderer and its bounded actions, but cannot provide
 * executable code. UI components are wired to these IDs in the shell increment.
 */
export const TECHNICAL_LAB_RENDERER_REGISTRY: Readonly<
  Record<TechnicalLabRendererId, TechnicalLabRendererContract>
> = {
  "hash-avalanche": {
    rendererId: "hash-avalanche",
    permittedActions: actions(
      "VIEW_INPUT",
      "EDIT_INPUT",
      "HASH",
      "COMPARE_DIGESTS",
      "RESET_EXPERIMENT_COPY",
    ),
  },
  "canonical-serialization": {
    rendererId: "canonical-serialization",
    permittedActions: actions(
      "VIEW_INPUT",
      "EDIT_INPUT",
      "CANONICALIZE",
      "HASH",
      "COMPARE_DIGESTS",
      "RESET_EXPERIMENT_COPY",
    ),
  },
  "digital-signature": {
    rendererId: "digital-signature",
    permittedActions: actions(
      "VIEW_INPUT",
      "EDIT_INPUT",
      "CANONICALIZE",
      "HASH",
      "SIGN",
      "VERIFY_SIGNATURE",
      "RESET_EXPERIMENT_COPY",
    ),
  },
  "identity-authorization": {
    rendererId: "identity-authorization",
    permittedActions: actions(
      "VIEW_INPUT",
      "VERIFY_SIGNATURE",
      "RESOLVE_IDENTITY",
      "CHECK_AUTHORIZATION",
      "COMMIT_TRANSACTION",
      "RESET_EXPERIMENT_COPY",
    ),
  },
  "endorsement-policy": {
    rendererId: "endorsement-policy",
    permittedActions: actions(
      "VIEW_INPUT",
      "SIGN",
      "VERIFY_SIGNATURE",
      "ADD_ENDORSEMENT",
      "EVALUATE_POLICY",
      "RESET_EXPERIMENT_COPY",
    ),
  },
  "proposal-mismatch": {
    rendererId: "proposal-mismatch",
    permittedActions: actions(
      "VIEW_INPUT",
      "EDIT_INPUT",
      "CANONICALIZE",
      "HASH",
      "SIGN",
      "VERIFY_SIGNATURE",
      "ADD_ENDORSEMENT",
      "EVALUATE_POLICY",
      "COMPARE_DIGESTS",
      "RESET_EXPERIMENT_COPY",
    ),
  },
  "state-version-conflict": {
    rendererId: "state-version-conflict",
    permittedActions: actions(
      "VIEW_INPUT",
      "EDIT_INPUT",
      "CANONICALIZE",
      "HASH",
      "SIGN",
      "VERIFY_SIGNATURE",
      "RESOLVE_IDENTITY",
      "CHECK_AUTHORIZATION",
      "ADD_ENDORSEMENT",
      "EVALUATE_POLICY",
      "ADVANCE_ASSET_VERSION",
      "VALIDATE_STATE_VERSION",
      "COMMIT_TRANSACTION",
      "RESET_EXPERIMENT_COPY",
    ),
  },
};

export function rendererPermitsAction(
  rendererId: TechnicalLabRendererId,
  actionType: TechnicalExperimentActionType,
): boolean {
  return TECHNICAL_LAB_RENDERER_REGISTRY[
    rendererId
  ].permittedActions.has(actionType);
}
