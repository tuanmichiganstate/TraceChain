import type { JsonObject } from "../contracts/json";
import type {
  ScenarioEvidenceLearnerMetadataV1,
} from "../contracts/scenario-pack";

export function learnerEvidenceMetadataToJson(
  metadata: ScenarioEvidenceLearnerMetadataV1,
): JsonObject {
  return {
    ...(metadata.createdAt === undefined
      ? {}
      : { createdAt: metadata.createdAt }),
    ...(metadata.effectiveFrom === undefined
      ? {}
      : { effectiveFrom: metadata.effectiveFrom }),
    ...(metadata.ownerOrganizationId === undefined
      ? {}
      : {
          ownerOrganizationId: metadata.ownerOrganizationId,
        }),
    signatureStatus: metadata.signatureStatus,
    ledgerStatus: metadata.ledgerStatus,
    completeness: metadata.completeness,
    access: {
      classification: metadata.access.classification,
      acquisitionMode: metadata.access.acquisitionMode,
      delayMinutes: metadata.access.delayMinutes,
      costUnits: metadata.access.costUnits,
      ...(metadata.access.permissionPolicyId === undefined
        ? {}
        : {
            permissionPolicyId:
              metadata.access.permissionPolicyId,
          }),
    },
  };
}
