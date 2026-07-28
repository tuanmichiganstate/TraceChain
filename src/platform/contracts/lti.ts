export const LTI_VERSION_CLAIM =
  "https://purl.imsglobal.org/spec/lti/claim/version";
export const LTI_MESSAGE_TYPE_CLAIM =
  "https://purl.imsglobal.org/spec/lti/claim/message_type";
export const LTI_DEPLOYMENT_ID_CLAIM =
  "https://purl.imsglobal.org/spec/lti/claim/deployment_id";
export const LTI_ROLES_CLAIM =
  "https://purl.imsglobal.org/spec/lti/claim/roles";
export const LTI_CONTEXT_CLAIM =
  "https://purl.imsglobal.org/spec/lti/claim/context";
export const LTI_RESOURCE_LINK_CLAIM =
  "https://purl.imsglobal.org/spec/lti/claim/resource_link";
export const LTI_LAUNCH_PRESENTATION_CLAIM =
  "https://purl.imsglobal.org/spec/lti/claim/launch_presentation";
export const LTI_CUSTOM_CLAIM =
  "https://purl.imsglobal.org/spec/lti/claim/custom";
export const LTI_DEEP_LINKING_SETTINGS_CLAIM =
  "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings";
export const LTI_DEEP_LINKING_DATA_CLAIM =
  "https://purl.imsglobal.org/spec/lti-dl/claim/data";
export const LTI_DEEP_LINKING_CONTENT_ITEMS_CLAIM =
  "https://purl.imsglobal.org/spec/lti-dl/claim/content_items";
export const LTI_AGS_ENDPOINT_CLAIM =
  "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint";
export const LTI_AGS_SCORE_SCOPE =
  "https://purl.imsglobal.org/spec/lti-ags/scope/score";
export const LTI_NRPS_NAMES_AND_ROLES_CLAIM =
  "https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice";
export const LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE =
  "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly";
export const LTI_NRPS_MEMBERSHIP_MEDIA_TYPE =
  "application/vnd.ims.lti-nrps.v2.membershipcontainer+json";

export const LTI_INSTRUCTOR_ROLE =
  "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor";
export const LTI_LEARNER_ROLE =
  "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner";
export const LTI_CONTENT_DEVELOPER_ROLE =
  "http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper";
export const LTI_MENTOR_ROLE =
  "http://purl.imsglobal.org/vocab/lis/v2/membership#Mentor";

export type LtiApplicationRole = "instructor" | "learner";
export type LtiLaunchType = "resource-link" | "deep-linking";

export interface JsonWebKeySetV1 {
  readonly keys: readonly Readonly<Record<string, unknown>>[];
}

export interface LtiPlatformRegistrationV1 {
  readonly schemaVersion: "1.0.0";
  readonly registrationId: string;
  readonly issuer: string;
  readonly clientId: string;
  readonly deploymentId: string;
  readonly authorizationEndpoint: string;
  readonly jwksUri: string;
  readonly tokenEndpoint?: string;
  /**
   * Test and isolated-development fixture only. Hosted registrations should
   * use the platform JWKS URI so Moodle key rotation remains effective.
   */
  readonly platformJwks?: JsonWebKeySetV1;
}

export interface LtiLearningContextV2 {
  readonly schemaVersion: "2.0.0";
  readonly provider: "lti-1.3";
  readonly launchType: LtiLaunchType;
  readonly issuer: string;
  readonly clientId: string;
  readonly deploymentId: string;
  readonly contextId: string;
  readonly resourceLinkId?: string;
  readonly contextLabel?: string;
  readonly contextTitle?: string;
  readonly returnUrl?: string;
}

export interface LtiSessionProjectionV2 {
  readonly authenticationSource: "lti";
  readonly displayName?: string;
  readonly applicationRole: LtiApplicationRole;
  readonly ltiLaunchType: LtiLaunchType;
  readonly ltiAssignmentId?: string;
  readonly learningContext: LtiLearningContextV2;
}

export interface LtiDeepLinkingSettingsV1 {
  readonly returnUrl: string;
  readonly data?: string;
  readonly acceptedTypes: readonly string[];
  readonly acceptedPresentationTargets: readonly string[];
  readonly acceptsLineItem: boolean;
}

export interface LtiDeepLinkAssignmentOptionV1 {
  readonly schemaVersion: "1.0.0";
  readonly assignmentId: string;
  readonly title: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly mode: string;
}

export interface LtiAgsEndpointV1 {
  readonly lineItemUrl: string;
  readonly scopes: readonly string[];
}

export interface LtiNrpsEndpointV1 {
  readonly contextMembershipsUrl: string;
  readonly serviceVersions: readonly string[];
}

export type LtiNrpsMembershipStatus = "active" | "inactive";

export interface LtiNrpsLearnerMemberV1 {
  readonly platformUserId: string;
  readonly status: LtiNrpsMembershipStatus;
  readonly roles: readonly string[];
  readonly displayName?: string;
  readonly email?: string;
}

export interface LtiNrpsRosterSnapshotV1 {
  readonly pageCount: number;
  readonly members: readonly LtiNrpsLearnerMemberV1[];
}

export interface LtiNrpsSyncProjectionV1 {
  readonly schemaVersion: "1.0.0";
  readonly syncId: string;
  readonly contextId: string;
  readonly receivedMemberCount: number;
  readonly activeLearnerCount: number;
  readonly inactiveLearnerCount: number;
  readonly pageCount: number;
  readonly synchronizedAt: string;
}

export type LtiAgsActivityProgress =
  | "Initialized"
  | "Started"
  | "InProgress"
  | "Submitted"
  | "Completed";

export type LtiAgsGradingProgress =
  | "NotReady"
  | "Failed"
  | "Pending"
  | "PendingManual"
  | "FullyGraded";

export interface LtiAgsScoreV1 {
  readonly userId: string;
  readonly timestamp: string;
  readonly activityProgress: LtiAgsActivityProgress;
  readonly gradingProgress: LtiAgsGradingProgress;
  readonly scoreGiven?: number;
  readonly scoreMaximum?: number;
}

export type LtiAgsDeliveryStatus =
  | "pending"
  | "delivering"
  | "delivered"
  | "failed";

export interface LtiAgsDeliveryProjectionV1 {
  readonly schemaVersion: "1.0.0";
  readonly deliveryId: string;
  readonly runId: string;
  readonly assignmentId: string;
  readonly status: LtiAgsDeliveryStatus;
  readonly attemptCount: number;
  readonly deliveredAt?: string;
}
