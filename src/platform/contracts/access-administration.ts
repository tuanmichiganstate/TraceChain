import type { ApplicationRole } from "./run-events";

export type ApplicationUserStatus = "active" | "disabled";

export interface ApplicationUserAccessV1 {
  readonly schemaVersion: "1.0.0";
  readonly userId: string;
  readonly email: string;
  readonly status: ApplicationUserStatus;
  readonly roles: readonly ApplicationRole[];
  readonly createdAt: string;
}

export interface ApplicationAccessAuditRecordV1 {
  readonly schemaVersion: "1.0.0";
  readonly commandId: string;
  readonly targetUserId: string;
  readonly targetEmail: string;
  readonly status: ApplicationUserStatus;
  readonly roles: readonly ApplicationRole[];
  readonly performedAt: string;
  readonly performedByUserId: string;
  readonly performedByEmail: string;
}

export interface UpsertApplicationUserAccessRequest {
  readonly commandId: string;
  readonly email: string;
  readonly status: ApplicationUserStatus;
  readonly roles: readonly ApplicationRole[];
}

export interface UpsertApplicationUserAccessResult {
  readonly user: ApplicationUserAccessV1;
  readonly wasIdempotentReplay: boolean;
}
