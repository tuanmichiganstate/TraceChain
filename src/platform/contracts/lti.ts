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

export const LTI_INSTRUCTOR_ROLE =
  "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor";
export const LTI_LEARNER_ROLE =
  "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner";
export const LTI_CONTENT_DEVELOPER_ROLE =
  "http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper";
export const LTI_MENTOR_ROLE =
  "http://purl.imsglobal.org/vocab/lis/v2/membership#Mentor";

export type LtiApplicationRole = "instructor" | "learner";

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

export interface LtiLearningContextV1 {
  readonly schemaVersion: "1.0.0";
  readonly provider: "lti-1.3";
  readonly issuer: string;
  readonly clientId: string;
  readonly deploymentId: string;
  readonly contextId: string;
  readonly resourceLinkId: string;
  readonly contextLabel?: string;
  readonly contextTitle?: string;
  readonly returnUrl?: string;
}

export interface LtiSessionProjectionV1 {
  readonly authenticationSource: "lti";
  readonly displayName?: string;
  readonly applicationRole: LtiApplicationRole;
  readonly ltiAssignmentId?: string;
  readonly learningContext: LtiLearningContextV1;
}
