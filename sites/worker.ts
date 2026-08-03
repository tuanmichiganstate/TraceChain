import type {
  DecisionNodeV1,
  ScenarioDefinitionV1,
  ScenarioPackV2,
} from "../src/platform/contracts/scenario-pack";
import type {
  CreateHostedAssignmentRequest,
  HostedAssignmentLearnerOptionV2,
  HostedAssignmentV1,
  HostedAssignmentScenarioOptionV1,
  HostedAssignmentMonitorV1,
  HostedRunMonitorV1,
} from "../src/platform/contracts/assessment";
import type {
  HostedAssignmentDecisionOutcomeReportV1,
} from "../src/platform/contracts/decision-outcome-report";
import type {
  AssignmentCounterfactualReportV1,
  CounterfactualRunMetadataV1,
} from "../src/platform/contracts/counterfactual";
import type {
  AssignmentExportIdentityMode,
} from "../src/platform/contracts/assignment-export";
import type {
  CreateScormPackageJobRequest,
  HostedScormPackageCatalogV1,
} from "../src/platform/contracts/scorm-package-job";
import type {
  ApplicationUserStatus,
} from "../src/platform/contracts/access-administration";
import type { AuditVariantAssignmentV1 } from "../src/platform/contracts/audit";
import type { ApplicationRole } from "../src/platform/contracts/run-events";
import en from "../src/locales/en.json";
import vi from "../src/locales/vi.json";
import { sha256Hex } from "../src/infrastructure/hashing/sha256";
import {
  AuthenticatedPrincipalError,
  AUTHENTICATED_USER_EMAIL_HEADER,
  resolveAuthenticatedPrincipal,
} from "../src/platform/hosted/authenticated-principal";
import {
  authorizeLtiSessionPrincipal,
  beginLtiLogin,
  clearLtiSessionCookie,
  completeLtiLaunch,
  LtiAuthenticationError,
  ltiLoginParameter,
  ltiSessionToken,
  parseLtiLoginRequest,
} from "../src/platform/hosted/lti-authentication";
import {
  LtiRegistrationError,
  parseLtiPlatformRegistrations,
  parseToolPrivateJwk,
  parseToolPublicJwks,
} from "../src/platform/hosted/lti-registration";
import {
  assertDeepLinkAssignmentAccess,
  createDeepLinkResponseJwt,
  deepLinkAutoSubmitResponse,
} from "../src/platform/hosted/lti-deep-linking";
import {
  deliverLtiAgsScore,
  supportsLtiAgsScore,
} from "../src/platform/hosted/lti-ags";
import {
  fetchLtiNrpsRoster,
  LtiNrpsError,
} from "../src/platform/hosted/lti-nrps";
import { provisionBootstrapAdministrator } from "../src/platform/hosted/bootstrap-principal";
import {
  HostedAuthorizationError,
  requireAssignedLearner,
  requireApplicationRole,
  type ApplicationPrincipal,
} from "../src/platform/hosted/access";
import {
  SystemUtcClock,
  WebCryptoIdGenerator,
} from "../src/platform/hosted/server-environment";
import { HostedRunCommandError } from "../src/platform/hosted/run-command-error";
import type {
  HostedRuntimeCommand,
  HostedRuntimeService,
} from "../src/platform/hosted/hosted-runtime-service";
import {
  createHostedRuntimeService,
} from "../src/platform/hosted/hosted-runtime-service";
import {
  createCounterfactualComparison,
} from "../src/platform/hosted/counterfactual-comparison";
import {
  counterfactualConditionPoints,
  counterfactualDecisionPoints,
  validateConditionDecisionReuse,
  validateCounterfactualIntervention,
} from "../src/platform/hosted/counterfactual-points";
import {
  commandForCounterfactualReplay,
  sourceDecisionCommandAtFork,
  sourceCommandBatchesAfterFork,
} from "../src/platform/hosted/counterfactual-replay";
import { D1ApplicationPrincipalRepository } from "../src/platform/persistence/d1-principal-repository";
import {
  D1LtiAuthenticationRepository,
  LtiAuthenticationRepositoryError,
} from "../src/platform/persistence/d1-lti-authentication-repository";
import {
  D1LtiAgsRepository,
} from "../src/platform/persistence/d1-lti-ags-repository";
import {
  D1LtiNrpsRepository,
  LtiNrpsRepositoryError,
} from "../src/platform/persistence/d1-lti-nrps-repository";
import {
  ApplicationAccessRepositoryError,
  D1ApplicationAccessRepository,
} from "../src/platform/persistence/d1-application-access-repository";
import {
  AssignmentRepositoryError,
  D1AssignmentRepository,
} from "../src/platform/persistence/d1-assignment-repository";
import {
  D1CounterfactualRunRepository,
  D1CounterfactualRunRepositoryError,
} from "../src/platform/persistence/d1-counterfactual-run-repository";
import {
  CounterfactualReflectionRepositoryError,
  D1CounterfactualReflectionRepository,
  normalizeCounterfactualReflectionResponse,
} from "../src/platform/persistence/d1-counterfactual-reflection-repository";
import { D1RunEventStore } from "../src/platform/persistence/d1-run-event-store";
import { ensureD1FoundationSchema } from "../src/platform/persistence/d1-schema";
import { D1ScenarioPackRepository } from "../src/platform/persistence/d1-scenario-pack-repository";
import {
  D1ScormPackageJobRepository,
  ScormPackageJobRepositoryError,
} from "../src/platform/persistence/d1-scorm-package-job-repository";
import type { D1DatabaseLike } from "../src/platform/persistence/d1-types";
import {
  CounterfactualBranchEngine,
  CounterfactualBranchError,
} from "../src/platform/runs/counterfactual-branch";
import {
  CounterfactualRunRepositoryError,
} from "../src/platform/runs/counterfactual-repository";
import {
  AssignmentCounterfactualConfigurationError,
  validateAssignmentCounterfactualConfiguration,
} from "../src/platform/runs/counterfactual-assignment";
import {
  AssignmentResearchConfigurationError,
  validateAssignmentResearchConfiguration,
} from "../src/platform/runs/research-configuration";
import {
  RunEventStoreConflictError,
} from "../src/platform/runs/event-store";
import {
  AssignmentExportError,
  assignmentEvidenceFilename,
  createAssignmentEvidenceExport,
  serializeAssignmentEvidenceCsv,
  serializeAssignmentEvidenceJson,
} from "../src/platform/reporting/assignment-export";
import {
  CounterfactualExportError,
  counterfactualComparisonFilename,
  createCounterfactualComparisonExport,
  serializeCounterfactualComparisonCsv,
  serializeCounterfactualComparisonJson,
} from "../src/platform/reporting/counterfactual-export";
import { createAssignmentCounterfactualReportSummary } from "../src/platform/reporting/counterfactual-report";
import {
  AssignmentCompetencyReportError,
  createAssignmentCompetencyReport,
  createLearnerCompetencyProfile,
} from "../src/platform/reporting/assignment-competency-report";
import {
  assignmentCurriculumCrosswalkFilename,
  createAssignmentCurriculumCrosswalkReport,
  CurriculumCrosswalkReportError,
  serializeAssignmentCurriculumCrosswalkReportJson,
} from "../src/platform/reporting/curriculum-crosswalk-report";
import { createAssignmentProcessAnalytics } from "../src/platform/reporting/process-analytics";
import { createAuditAssignmentReport } from "../src/platform/reporting/audit-assignment-report";
import {
  repositoryCurriculumOverlays,
} from "../src/platform/curriculum-overlays/repository-overlays";
import { modeConfigurationFor } from "../src/platform/runs/mode-configuration";
import {
  assertHostedExperienceIdentity,
  resolveHostedExperienceConfiguration,
} from "../src/platform/runs/experience-configuration";
import { assignmentStartAvailability } from "../src/platform/runs/assignment-availability";
import { ScenarioPackPublicationError } from "../src/platform/scenario-packs/publication";
import {
  inspectScenarioImage,
  MAXIMUM_SCENARIO_IMAGE_BYTES,
  scenarioImageFilePath,
  ScenarioImageError,
} from "../src/platform/scenario-packs/image-assets";
import {
  createScenarioPackBundle,
  scenarioPackBundleFilename,
  ScenarioPackBundleError,
} from "../src/platform/scenario-packs/scenario-pack-bundle";
import { projectInstructorScenarioSummary } from "../src/platform/scenario-packs/instructor-summary";
import {
  compareScenarioPackVersions,
  createScenarioRolePreview,
  ScenarioAuthoringError,
  scenarioPackValidationReport,
} from "../src/platform/scenario-packs/authoring";
import {
  createAssignmentEvidenceAssessmentCatalog,
  EvidenceAssessmentCatalogError,
} from "../src/platform/scenario-packs/evidence-assessment-catalog";
import { hasRegisteredHostedRuntime } from "../src/platform/hosted/runtime-registry";
import {
  isTechnicalLabHostedContent,
  resolveHostedTechnicalLabExperience,
  TECHNICAL_LAB_HOSTED_MAXIMUM_SCORE,
  TECHNICAL_LAB_HOSTED_MODULE_COUNT,
  technicalLabHostedPackAdapter,
} from "../src/technical-lab/hosted-pack-adapter";
import {
  createTechnicalLabAssignmentReport,
  createTechnicalLabRunReport,
} from "../src/technical-lab/hosted-report";

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface R2ObjectBodyLike {
  readonly body: ReadableStream<Uint8Array> | null;
  readonly httpMetadata?: {
    readonly contentType?: string;
  };
}

interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer,
    options?: {
      readonly httpMetadata?: {
        readonly contentType?: string;
        readonly contentDisposition?: string;
      };
      readonly customMetadata?: Readonly<Record<string, string>>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
}

interface WorkerEnvironment {
  readonly ASSETS: AssetBinding;
  readonly DB: D1DatabaseLike;
  readonly ARTIFACTS: R2BucketLike;
  readonly TRACECHAIN_BOOTSTRAP_ADMIN_EMAILS?: string;
  readonly TRACECHAIN_LTI_REGISTRATIONS_JSON?: string;
  readonly TRACECHAIN_LTI_TOOL_JWKS_JSON?: string;
  readonly TRACECHAIN_LTI_TOOL_PRIVATE_JWK_JSON?: string;
}

const securityHeaders = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
};

const API_PREFIX = "/api/v1/";
const LTI_API_PREFIX = "/api/lti/v1/";
const HOSTED_APP_ROUTE =
  /^\/(?:platform|instructor|author|learner|admin)\/?$/u;
const MAXIMUM_COMMAND_BYTES = 64 * 1024;
const MAXIMUM_PACK_BYTES = 2 * 1024 * 1024;
const MAXIMUM_SCORM_ARTIFACT_BYTES = 25 * 1024 * 1024;
const SCENARIO_IMAGE_STORAGE_PREFIX = "scenario-images/";
const scenarioPackCatalogs = { en, vi } as const;

function runnableHostedModeProfiles(
  pack: ScenarioPackV2,
  scenario: ScenarioDefinitionV1,
): Pick<
  HostedAssignmentScenarioOptionV1,
  | "supportedModes"
  | "modeConfigurations"
  | "experienceConfigurations"
> {
  const locale = pack.supportedLocales.includes("vi") ? "vi" : "en";
  const profiles = scenario.supportedModes.flatMap((mode) => {
    try {
      const runtimeConfiguration = modeConfigurationFor(
        scenario,
        mode,
      );
      const experience =
        scenario.hostedRuntime?.runtimeId ===
        "tracechain-technical-lab-v1"
          ? resolveHostedTechnicalLabExperience(locale)
          : resolveHostedExperienceConfiguration({
              packId: pack.packId,
              packVersion: pack.version,
              scenario,
              runtimeConfiguration,
              locale,
            });
      return [{ runtimeConfiguration, experience }];
    } catch {
      return [];
    }
  });
  return {
    supportedModes: profiles.map(
      ({ runtimeConfiguration }) => runtimeConfiguration.mode,
    ),
    modeConfigurations: profiles.map(
      ({ runtimeConfiguration }) => runtimeConfiguration,
    ),
    experienceConfigurations: profiles.map(
      ({ runtimeConfiguration, experience }) => ({
        mode: runtimeConfiguration.mode,
        ...experience,
      }),
    ),
  };
}

function assignmentOptionLabels(
  pack: ScenarioPackV2,
  scenario: ScenarioDefinitionV1,
  counterfactualDecisionTitles: Readonly<
    Record<string, string>
  >,
): HostedAssignmentScenarioOptionV1["labelsByLocale"] {
  return Object.fromEntries(
    pack.supportedLocales.map((locale) => {
      const bundledCatalog: Readonly<Record<string, string>> | undefined =
        locale === "en" ? en : locale === "vi" ? vi : undefined;
      const catalog: Readonly<Record<string, string>> = {
        ...(bundledCatalog ?? {}),
        ...(pack.localizationCatalogs?.[locale] ?? {}),
      };
      return [
        locale,
        {
          packTitle:
            catalog?.[pack.manifest.title.localizationKey] ??
            pack.manifest.title.localizationKey,
          scenarioTitle:
            catalog?.[scenario.title.localizationKey] ??
            scenario.title.localizationKey,
          description:
            catalog?.[pack.manifest.description.localizationKey] ??
            pack.manifest.description.localizationKey,
          educationalPurpose:
            catalog?.[
              pack.manifest.educationalPurpose.localizationKey
            ] ?? pack.manifest.educationalPurpose.localizationKey,
          organizationTitles: Object.fromEntries(
            scenario.organizations.map((organization) => [
              organization.organizationId,
              catalog?.[
                organization.displayName.localizationKey
              ] ?? organization.displayName.localizationKey,
            ]),
          ),
          roleTitles: Object.fromEntries(
            scenario.roles.map((role) => [
              role.roleId,
              catalog?.[role.displayName.localizationKey] ??
                role.displayName.localizationKey,
            ]),
          ),
          evidenceTitles: Object.fromEntries(
            scenario.evidenceItems.map((evidence) => [
              evidence.evidenceId,
              catalog?.[evidence.title.localizationKey] ??
                evidence.title.localizationKey,
            ]),
          ),
          policyTitles: Object.fromEntries(
            scenario.policies.map((policy) => [
              policy.policyId,
              catalog?.[policy.title.localizationKey] ??
                policy.title.localizationKey,
            ]),
          ),
          counterfactualDecisionTitles: Object.fromEntries(
            Object.entries(counterfactualDecisionTitles).map(
              ([nodeId, localizationKey]) => [
                nodeId,
                catalog?.[localizationKey] ?? localizationKey,
              ],
            ),
          ),
        },
      ];
    }),
  );
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(
  status: number,
  body: Readonly<Record<string, unknown>>,
): Response {
  return withSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    }),
  );
}

function downloadResponse(
  body: string,
  contentType: string,
  filename: string,
): Response {
  return withSecurityHeaders(
    new Response(body, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="${filename}"`,
        "content-type": contentType,
      },
    }),
  );
}

function acceptsHtml(request: Request): boolean {
  return request.headers.get("accept")?.includes("text/html") ?? false;
}

function shouldServeAppShell(request: Request): boolean {
  if (request.method !== "GET") return false;
  const pathname = new URL(request.url).pathname;
  return pathname === "/" || acceptsHtml(request);
}

function isHostedAppRoute(request: Request): boolean {
  return (
    request.method === "GET" &&
    HOSTED_APP_ROUTE.test(new URL(request.url).pathname)
  );
}

function isAppShellFallbackResponse(response: Response): boolean {
  return (
    response.status === 404 ||
    (response.status >= 300 &&
      response.status < 400 &&
      response.headers.get("location") === "/")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assignmentExportIdentityMode(
  url: URL,
): AssignmentExportIdentityMode {
  const value = url.searchParams.get("identity");
  if (value === null || value === "identified") return "identified";
  if (value === "pseudonymous") return "pseudonymous";
  throw new HostedRunCommandError(
    "INVALID_COMMAND",
    "Assignment export identity mode is invalid.",
  );
}

function requiredText(
  value: unknown,
  path: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      `${path} must be a non-empty string.`,
    );
  }
  return value;
}

function pathScenarioAsset(pathname: string): string | null {
  const match = /^\/api\/v1\/scenario-assets\/([a-f0-9]{64})$/u.exec(
    pathname,
  );
  return match?.[1] ?? null;
}

function pathRunAsset(
  pathname: string,
): { readonly runId: string; readonly assetId: string } | null {
  const match =
    /^\/api\/v1\/runs\/([^/]+)\/assets\/([^/]+)$/u.exec(pathname);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  return {
    runId: decodeURIComponent(match[1]),
    assetId: decodeURIComponent(match[2]),
  };
}

async function boundedRequestBytes(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maximumBytes
  ) {
    throw new ScenarioImageError(
      "IMAGE_TOO_LARGE",
      "The uploaded image exceeds its authored size limit.",
    );
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maximumBytes) {
    throw new ScenarioImageError(
      "IMAGE_TOO_LARGE",
      "The uploaded image exceeds its authored size limit.",
    );
  }
  return bytes;
}

function scenarioImageStorageKey(sha256: string): string {
  return `${SCENARIO_IMAGE_STORAGE_PREFIX}${sha256}`;
}

async function storedObjectBytes(
  object: R2ObjectBodyLike | null,
): Promise<Uint8Array | null> {
  if (object?.body === null || object === null) return null;
  return new Uint8Array(await new Response(object.body).arrayBuffer());
}

async function scenarioImageBytes(
  request: Request,
  environment: WorkerEnvironment,
  image: ScenarioPackV2["imageAssets"][number],
): Promise<Uint8Array | null> {
  const stored = await storedObjectBytes(
    await environment.ARTIFACTS.get(
      scenarioImageStorageKey(image.sha256),
    ),
  );
  const bytes =
    stored ??
    (await (async () => {
      const response = await environment.ASSETS.fetch(
        new Request(new URL(`/${image.filePath}`, request.url)),
      );
      return response.ok
        ? new Uint8Array(await response.arrayBuffer())
        : null;
    })());
  if (bytes === null) return null;
  try {
    const inspected = inspectScenarioImage(
      bytes,
      image.originalFileName,
    );
    return inspected.sha256 === image.sha256 &&
      inspected.byteLength === image.byteLength &&
      inspected.width === image.width &&
      inspected.height === image.height &&
      inspected.mimeType === image.mimeType
      ? bytes
      : null;
  } catch {
    return null;
  }
}

async function scenarioPackAssetBytes(
  request: Request,
  environment: WorkerEnvironment,
  pack: ScenarioPackV2,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const assets = new Map<string, Uint8Array>();
  for (const image of pack.imageAssets) {
    const bytes = await scenarioImageBytes(request, environment, image);
    if (bytes === null) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        `Declared scenario image ${image.assetId} is unavailable or does not match its metadata.`,
      );
    }
    assets.set(image.filePath, bytes);
  }
  return assets;
}

function storedAuditVariantAssignment(
  value: unknown,
): AuditVariantAssignmentV1 | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "Stored Audit variant identity is invalid.",
    );
  }
  const textFields = [
    "bankId",
    "bankVersion",
    "variantId",
    "variantVersion",
    "variantContentHash",
    "attemptSeed",
    "caseReference",
  ] as const;
  if (
    textFields.some(
      (field) =>
        typeof value[field] !== "string" ||
        (value[field] as string).trim().length === 0,
    ) ||
    !Number.isSafeInteger(value.variantIndex) ||
    (value.variantIndex as number) < 0 ||
    value.selectionAlgorithmVersion !== "1" ||
    (value.assignmentSource !== "SCORM_ATTEMPT" &&
      value.assignmentSource !== "STANDALONE_ATTEMPT" &&
      value.assignmentSource !== "HOSTED_ASSIGNMENT")
  ) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "Stored Audit variant identity is invalid.",
    );
  }
  return {
    bankId: value.bankId as string,
    bankVersion: value.bankVersion as string,
    variantIndex: value.variantIndex as number,
    variantId: value.variantId as string,
    variantVersion: value.variantVersion as string,
    variantContentHash: value.variantContentHash as string,
    attemptSeed: value.attemptSeed as string,
    selectionAlgorithmVersion: "1",
    caseReference: value.caseReference as string,
    assignmentSource: value.assignmentSource,
  };
}

async function readJson(
  request: Request,
  maximumBytes: number,
): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "API requests must use application/json.",
    );
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maximumBytes
  ) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "API request body exceeds its authored size limit.",
    );
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maximumBytes) {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "API request body exceeds its authored size limit.",
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HostedRunCommandError(
      "INVALID_COMMAND",
      "API request body is not valid JSON.",
    );
  }
}

async function readLtiForm(
  request: Request,
): Promise<URLSearchParams> {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    !contentType
      .toLowerCase()
      .startsWith("application/x-www-form-urlencoded")
  ) {
    throw new LtiAuthenticationError(
      "LTI_REQUEST_INVALID",
      "LTI form posts must use application/x-www-form-urlencoded.",
    );
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAXIMUM_COMMAND_BYTES
  ) {
    throw new LtiAuthenticationError(
      "LTI_REQUEST_INVALID",
      "The LTI form exceeds its size limit.",
    );
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAXIMUM_COMMAND_BYTES) {
    throw new LtiAuthenticationError(
      "LTI_REQUEST_INVALID",
      "The LTI form exceeds its size limit.",
    );
  }
  return new URLSearchParams(text);
}

function ltiErrorCode(error: unknown): string | null {
  if (
    error instanceof LtiAuthenticationError ||
    error instanceof LtiRegistrationError ||
    error instanceof LtiAuthenticationRepositoryError ||
    error instanceof LtiNrpsError ||
    error instanceof LtiNrpsRepositoryError
  ) {
    return error.code;
  }
  return null;
}

function ltiErrorResponse(
  request: Request,
  error: unknown,
): Response {
  const code = ltiErrorCode(error);
  if (code === null) {
    console.error("TraceChain LTI failure", error);
    return jsonResponse(500, {
      error: { code: "LTI_INTERNAL_ERROR" },
    });
  }
  const pathname = new URL(request.url).pathname;
  if (
    pathname === "/api/lti/v1/login" ||
    pathname === "/api/lti/v1/launch"
  ) {
    const recoveryPath =
      error instanceof LtiAuthenticationError ||
      error instanceof LtiAuthenticationRepositoryError
        ? error.recoveryPath
        : "/instructor";
    const location = new URL(recoveryPath, request.url);
    location.searchParams.set("ltiError", code);
    return withSecurityHeaders(
      new Response(null, {
        status: 303,
        headers: {
          "cache-control": "no-store",
          location: location.toString(),
        },
      }),
    );
  }
  const status =
    code === "LTI_INSTRUCTOR_ROLE_REQUIRED" ||
    code === "LTI_ASSIGNMENT_ACCESS_DENIED" ||
    code === "LTI_SESSION_REQUIRED"
      ? 403
      : code === "LTI_NRPS_SYNC_CONFLICT"
        ? 409
        : code === "LTI_NRPS_TOKEN_REQUEST_FAILED" ||
            code === "LTI_NRPS_REQUEST_FAILED" ||
            code === "LTI_NRPS_RESPONSE_INVALID"
          ? 502
          : code === "LTI_NRPS_CONFIGURATION_INVALID" ||
              code === "LTI_NRPS_STORAGE_FAILED"
            ? 500
            : 400;
  return jsonResponse(status, { error: { code } });
}

async function ltiResponse(
  request: Request,
  environment: WorkerEnvironment,
): Promise<Response> {
  await ensureD1FoundationSchema(environment.DB);
  const url = new URL(request.url);
  if (
    request.method === "GET" &&
    url.pathname === "/api/lti/v1/jwks"
  ) {
    const jwks = parseToolPublicJwks(
      environment.TRACECHAIN_LTI_TOOL_JWKS_JSON,
    );
    return jsonResponse(200, { keys: jwks.keys });
  }
  const registrations = parseLtiPlatformRegistrations(
    environment.TRACECHAIN_LTI_REGISTRATIONS_JSON,
  );
  const clock = new SystemUtcClock();
  const repository = new D1LtiAuthenticationRepository(
    environment.DB,
    clock,
  );
  if (
    (request.method === "GET" || request.method === "POST") &&
    url.pathname === "/api/lti/v1/login"
  ) {
    const parameters =
      request.method === "GET"
        ? url.searchParams
        : await readLtiForm(request);
    return withSecurityHeaders(
      await beginLtiLogin({
        request,
        input: parseLtiLoginRequest(request, parameters),
        registrations,
        repository,
        clock,
      }),
    );
  }
  if (
    request.method === "POST" &&
    url.pathname === "/api/lti/v1/launch"
  ) {
    const parameters = await readLtiForm(request);
    return withSecurityHeaders(
      await completeLtiLaunch({
        idToken: ltiLoginParameter(
          parameters.get("id_token"),
          "id_token",
        ),
        state: ltiLoginParameter(
          parameters.get("state"),
          "state",
        ),
        registrations,
        repository,
        assignmentResolver: new D1AssignmentRepository(
          environment.DB,
          clock,
        ),
        clock,
      }),
    );
  }
  if (
    request.method === "GET" &&
    url.pathname === "/api/lti/v1/deep-links/assignments"
  ) {
    const token = ltiSessionToken(request);
    if (token === null) {
      throw new LtiAuthenticationError(
        "LTI_SESSION_REQUIRED",
        "An active LTI Deep Linking session is required.",
      );
    }
    const tokenHash = sha256Hex(token);
    const principal = await repository.findActiveSession(tokenHash);
    const deepLink =
      await repository.findActiveDeepLinkSession(tokenHash);
    if (
      principal === null ||
      deepLink === null ||
      principal.ltiLaunchType !== "deep-linking" ||
      !principal.roles.includes("instructor")
    ) {
      throw new LtiAuthenticationError(
        "LTI_SESSION_REQUIRED",
        "An active instructor Deep Linking session is required.",
      );
    }
    if (deepLink.completedAt !== undefined) {
      throw new LtiAuthenticationError(
        "LTI_DEEP_LINK_COMPLETED",
        "This LTI Deep Linking selection is already complete.",
      );
    }
    const assignments =
      await new D1AssignmentRepository(
        environment.DB,
        clock,
      ).listActiveForLtiContext(principal.learningContext!);
    return jsonResponse(200, {
      assignments: assignments.map((assignment) => ({
        schemaVersion: "1.0.0",
        assignmentId: assignment.assignmentId,
        title: assignment.title,
        scenarioId: assignment.scenarioId,
        scenarioVersion: assignment.scenarioVersion,
        mode: assignment.mode,
      })),
    });
  }
  if (
    request.method === "POST" &&
    url.pathname === "/api/lti/v1/deep-links/response"
  ) {
    const origin = request.headers.get("origin");
    if (origin !== url.origin) {
      throw new LtiAuthenticationError(
        "LTI_REQUEST_INVALID",
        "A same-origin Deep Linking response is required.",
      );
    }
    const parameters = await readLtiForm(request);
    const token = ltiSessionToken(
      request,
      parameters.get("lti_session_token"),
    );
    if (token === null) {
      throw new LtiAuthenticationError(
        "LTI_SESSION_REQUIRED",
        "An active LTI Deep Linking session is required.",
      );
    }
    const cancel = parameters.get("cancel") === "1";
    const assignmentId = cancel
      ? null
      : ltiLoginParameter(
          parameters.get("assignment_id"),
          "assignment_id",
        );
    if (
      assignmentId !== null &&
      (assignmentId.length > 128 ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(assignmentId))
    ) {
      throw new LtiAuthenticationError(
        "LTI_REQUEST_INVALID",
        "The Deep Linking assignment identifier is invalid.",
      );
    }
    const tokenHash = sha256Hex(token);
    const principal = await repository.findActiveSession(tokenHash);
    const pending =
      await repository.findActiveDeepLinkSession(tokenHash);
    if (
      principal === null ||
      pending === null ||
      principal.ltiLaunchType !== "deep-linking" ||
      !principal.roles.includes("instructor")
    ) {
      throw new LtiAuthenticationError(
        "LTI_SESSION_REQUIRED",
        "An active instructor Deep Linking session is required.",
      );
    }
    if (pending.completedAt !== undefined) {
      if (
        (pending.selectedAssignmentId ?? null) !== assignmentId ||
        pending.responseJwt === undefined
      ) {
        throw new LtiAuthenticationError(
          "LTI_DEEP_LINK_COMPLETED",
          "This LTI Deep Linking selection is already complete.",
        );
      }
      const language =
        parameters.get("locale") === "en" ? "en" : "vi";
      return deepLinkAutoSubmitResponse({
        returnUrl: pending.settings.returnUrl,
        jwt: pending.responseJwt,
        language,
        submitLabel:
          language === "en"
            ? en["instructorReview.lti.deepLink.returnToMoodle"]
            : vi["instructorReview.lti.deepLink.returnToMoodle"],
        scriptNonce: pending.responseNonce,
      });
    }
    const assignment =
      assignmentId === null
        ? null
        : await new D1AssignmentRepository(
            environment.DB,
            clock,
          ).find(assignmentId);
    if (assignmentId !== null && assignment === null) {
      throw new LtiAuthenticationError(
        "LTI_ASSIGNMENT_ACCESS_DENIED",
        "The selected assignment is unavailable.",
      );
    }
    if (assignment !== null) {
      assertDeepLinkAssignmentAccess(assignment, pending);
    }
    const registration = registrations.find(
      (candidate) =>
        candidate.registrationId === pending.registrationId,
    );
    if (registration === undefined) {
      throw new LtiAuthenticationError(
        "LTI_LOGIN_STATE_INVALID",
        "The LTI Deep Linking registration is no longer active.",
      );
    }
    const toolJwks = parseToolPublicJwks(
      environment.TRACECHAIN_LTI_TOOL_JWKS_JSON,
    );
    const privateJwk = parseToolPrivateJwk(
      environment.TRACECHAIN_LTI_TOOL_PRIVATE_JWK_JSON,
      toolJwks,
    );
    const completedAt = clock.now();
    const prospectiveJwt = await createDeepLinkResponseJwt({
      registration,
      privateJwk,
      session: {
        ...pending,
        ...(assignmentId === null
          ? {}
          : { selectedAssignmentId: assignmentId }),
        completedAt,
      },
      assignment,
      launchUrl: new URL(
        "/api/lti/v1/launch",
        request.url,
      ).toString(),
    });
    const completed = await repository.completeDeepLinkSession(
      tokenHash,
      assignmentId,
      completedAt,
      prospectiveJwt,
    );
    const language =
      parameters.get("locale") === "en" ? "en" : "vi";
    return deepLinkAutoSubmitResponse({
      returnUrl: completed.settings.returnUrl,
      jwt: completed.responseJwt!,
      language,
      submitLabel:
        language === "en"
          ? en["instructorReview.lti.deepLink.returnToMoodle"]
          : vi["instructorReview.lti.deepLink.returnToMoodle"],
      scriptNonce: completed.responseNonce,
    });
  }
  if (
    request.method === "POST" &&
    url.pathname === "/api/lti/v1/logout"
  ) {
    enforceSameOriginMutation(request);
    const token = ltiSessionToken(request);
    if (token !== null) {
      await repository.revokeSession(sha256Hex(token));
    }
    return withSecurityHeaders(
      new Response(null, {
        status: 204,
        headers: {
          "cache-control": "no-store",
          "set-cookie": clearLtiSessionCookie(),
        },
      }),
    );
  }
  if (
    request.method === "POST" &&
    url.pathname === "/api/lti/v1/nrps/sync"
  ) {
    enforceSameOriginMutation(request);
    const token = ltiSessionToken(request);
    if (token === null) {
      throw new LtiAuthenticationError(
        "LTI_SESSION_REQUIRED",
        "An active Moodle instructor session is required.",
      );
    }
    const tokenHash = sha256Hex(token);
    const principal = await repository.findActiveSession(tokenHash);
    const nrps = await repository.findActiveNrpsContext(tokenHash);
    if (
      principal === null ||
      nrps === null ||
      principal.ltiLaunchType !== "resource-link" ||
      !principal.roles.includes("instructor")
    ) {
      throw new LtiAuthenticationError(
        "LTI_SESSION_REQUIRED",
        "An instructor resource-link launch with NRPS is required.",
      );
    }
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (
      !isRecord(body) ||
      typeof body.syncId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u.test(body.syncId)
    ) {
      throw new LtiNrpsRepositoryError(
        "LTI_NRPS_SYNC_INVALID",
        "A bounded NRPS sync ID is required.",
      );
    }
    const nrpsRepository = new D1LtiNrpsRepository(
      environment.DB,
      clock,
    );
    const replayed = await nrpsRepository.replay(
      body.syncId,
      nrps,
      principal.userId,
    );
    if (replayed !== null) {
      return jsonResponse(200, {
        sync: replayed,
        wasIdempotentReplay: true,
      });
    }
    const registration = registrations.find(
      (candidate) =>
        candidate.registrationId === nrps.registrationId,
    );
    if (registration === undefined) {
      throw new LtiNrpsError(
        "LTI_NRPS_CONFIGURATION_INVALID",
        "The NRPS registration is no longer active.",
      );
    }
    const publicJwks = parseToolPublicJwks(
      environment.TRACECHAIN_LTI_TOOL_JWKS_JSON,
    );
    const privateJwk = parseToolPrivateJwk(
      environment.TRACECHAIN_LTI_TOOL_PRIVATE_JWK_JSON,
      publicJwks,
    );
    const snapshot = await fetchLtiNrpsRoster({
      context: nrps,
      registration,
      privateJwk,
      clock,
      ids: new WebCryptoIdGenerator(),
    });
    const result = await nrpsRepository.synchronize({
      syncId: body.syncId,
      context: nrps,
      synchronizedByUserId: principal.userId,
      pageCount: snapshot.pageCount,
      members: snapshot.members,
    });
    return jsonResponse(201, {
      sync: result.sync,
      wasIdempotentReplay: result.wasIdempotentReplay,
    });
  }
  return jsonResponse(404, {
    error: { code: "LTI_ENDPOINT_NOT_FOUND" },
  });
}

function enforceSameOriginMutation(request: Request): void {
  if (
    request.method === "GET" ||
    request.method === "HEAD" ||
    request.method === "OPTIONS"
  ) {
    return;
  }
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) {
    throw new AuthenticatedPrincipalError(
      "AUTHENTICATION_REQUIRED",
      "A same-origin authenticated request is required.",
    );
  }
}

function errorResponse(error: unknown): Response {
  if (
    error instanceof ScenarioImageError ||
    error instanceof ScenarioPackBundleError
  ) {
    return jsonResponse(400, {
      error: { code: error.code },
    });
  }
  if (error instanceof AuthenticatedPrincipalError) {
    return jsonResponse(
      error.code === "AUTHENTICATION_REQUIRED" ? 401 : 403,
      { error: { code: error.code } },
    );
  }
  if (error instanceof HostedAuthorizationError) {
    return jsonResponse(
      error.code === "AUTHENTICATION_REQUIRED" ? 401 : 403,
      { error: { code: error.code } },
    );
  }
  if (error instanceof HostedRunCommandError) {
    const status =
      error.code === "RUN_NOT_FOUND"
        ? 404
        : error.code === "INVALID_COMMAND"
          ? 400
          : error.code === "PACK_CONTRACT_MISMATCH"
            ? 500
            : 409;
    return jsonResponse(status, {
      error: { code: error.code },
    });
  }
  if (
    error instanceof RunEventStoreConflictError ||
    error instanceof ScenarioPackPublicationError
  ) {
    return jsonResponse(409, {
      error: {
        code: error.name,
      },
    });
  }
  if (
    error instanceof CounterfactualBranchError ||
    error instanceof CounterfactualRunRepositoryError
  ) {
    const status =
      error instanceof CounterfactualBranchError &&
      (error.code === "SOURCE_RUN_NOT_FOUND" ||
        error.code === "COUNTERFACTUAL_BRANCH_NOT_FOUND")
        ? 404
        : error instanceof CounterfactualBranchError &&
            error.code === "INVALID_COUNTERFACTUAL_REQUEST"
          ? 400
          : 409;
    return jsonResponse(status, {
      error: { code: error.code },
    });
  }
  if (error instanceof D1CounterfactualRunRepositoryError) {
    return jsonResponse(500, {
      error: { code: error.code },
    });
  }
  if (error instanceof CounterfactualReflectionRepositoryError) {
    const status =
      error.code === "INVALID_COUNTERFACTUAL_REFLECTION"
        ? 400
        : error.code === "COUNTERFACTUAL_REFLECTION_CONFLICT"
          ? 409
          : 500;
    return jsonResponse(status, {
      error: { code: error.code },
    });
  }
  if (error instanceof ScenarioAuthoringError) {
    return jsonResponse(
      error.code === "SCENARIO_NOT_FOUND" ? 404 : 400,
      { error: { code: error.code } },
    );
  }
  if (error instanceof AssignmentRepositoryError) {
    const status =
      error.code === "ASSIGNMENT_NOT_FOUND"
        ? 404
        : error.code === "ASSIGNMENT_CONFLICT" ||
            error.code === "ASSIGNMENT_ALREADY_CLOSED" ||
            error.code === "ASSIGNMENT_CLOSED" ||
            error.code === "ASSIGNMENT_NOT_YET_AVAILABLE" ||
            error.code === "ASSIGNMENT_AVAILABILITY_ENDED" ||
            error.code === "RATING_REVISION_CONFLICT" ||
            error.code === "MODERATION_REVISION_CONFLICT" ||
            error.code === "FEEDBACK_ALREADY_RELEASED" ||
            error.code === "FEEDBACK_NOT_RELEASED" ||
            error.code === "RUN_NOT_ASSIGNED"
          ? 409
          : error.code === "ASSIGNMENT_STORAGE_FAILED"
            ? 500
            : 400;
    return jsonResponse(status, {
      error: { code: error.code },
    });
  }
  if (
    error instanceof AssignmentExportError ||
    error instanceof CounterfactualExportError ||
    error instanceof EvidenceAssessmentCatalogError
  ) {
    return jsonResponse(500, {
      error: { code: error.code },
    });
  }
  if (error instanceof AssignmentCompetencyReportError) {
    return jsonResponse(500, {
      error: { code: error.code },
    });
  }
  if (error instanceof CurriculumCrosswalkReportError) {
    return jsonResponse(500, {
      error: { code: error.code },
    });
  }
  if (error instanceof ApplicationAccessRepositoryError) {
    const status =
      error.code === "ACCESS_COMMAND_CONFLICT"
        ? 409
        : error.code === "ACCESS_STORAGE_FAILED"
          ? 500
          : 400;
    return jsonResponse(status, {
      error: { code: error.code },
    });
  }
  if (error instanceof ScormPackageJobRepositoryError) {
    const status =
      error.code === "PACKAGE_JOB_NOT_FOUND"
        ? 404
        : error.code === "PACKAGE_JOB_CONFLICT"
          ? 409
          : error.code === "PACKAGE_JOB_STORAGE_FAILED"
            ? 500
            : 400;
    return jsonResponse(status, {
      error: { code: error.code },
    });
  }
  console.error("TraceChain hosted API failure", error);
  return jsonResponse(500, {
    error: {
      code: "INTERNAL_SERVER_ERROR",
    },
  });
}

function pathRunId(
  pathname: string,
  suffix = "",
): string | null {
  const pattern = suffix.length === 0
    ? /^\/api\/v1\/runs\/([^/]+)$/u
    : new RegExp(
        `^/api/v1/runs/([^/]+)/${suffix.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`,
        "u",
      );
  const match = pattern.exec(pathname);
  return match?.[1] === undefined
    ? null
    : decodeURIComponent(match[1]);
}

function pathAssignmentId(
  pathname: string,
  suffix = "",
): string | null {
  const pattern = suffix.length === 0
    ? /^\/api\/v1\/assignments\/([^/]+)$/u
    : new RegExp(
        `^/api/v1/assignments/([^/]+)/${suffix.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`,
        "u",
      );
  const match = pattern.exec(pathname);
  return match?.[1] === undefined
    ? null
    : decodeURIComponent(match[1]);
}

function pathCounterfactualId(
  pathname: string,
  suffix = "",
): string | null {
  const escapedSuffix = suffix.replace(
    /[.*+?^${}()|[\]\\]/gu,
    "\\$&",
  );
  const pattern =
    suffix.length === 0
      ? /^\/api\/v1\/counterfactuals\/([^/]+)$/u
      : new RegExp(
          `^/api/v1/counterfactuals/([^/]+)/${escapedSuffix}$`,
          "u",
        );
  const match = pattern.exec(pathname);
  return match?.[1] === undefined
    ? null
    : decodeURIComponent(match[1]);
}

function pathScenarioPackVersion(
  pathname: string,
  suffix = "",
): { readonly packId: string; readonly version: string } | null {
  const escapedSuffix = suffix.replace(
    /[.*+?^${}()|[\]\\]/gu,
    "\\$&",
  );
  const pattern = suffix.length === 0
    ? /^\/api\/v1\/scenario-packs\/([^/]+)\/versions\/([^/]+)$/u
    : new RegExp(
        `^/api/v1/scenario-packs/([^/]+)/versions/([^/]+)/${escapedSuffix}$`,
        "u",
      );
  const match = pattern.exec(pathname);
  return match?.[1] === undefined || match[2] === undefined
    ? null
    : {
        packId: decodeURIComponent(match[1]),
        version: decodeURIComponent(match[2]),
      };
}

function pathScenarioPackComparison(
  pathname: string,
): string | null {
  const match =
    /^\/api\/v1\/scenario-packs\/([^/]+)\/compare$/u.exec(pathname);
  return match?.[1] === undefined
    ? null
    : decodeURIComponent(match[1]);
}

function pathScormPackageJob(
  pathname: string,
  suffix = "",
): string | null {
  const escapedSuffix = suffix.replace(
    /[.*+?^${}()|[\]\\]/gu,
    "\\$&",
  );
  const pattern = suffix.length === 0
    ? /^\/api\/v1\/scorm-package-jobs\/([^/]+)$/u
    : new RegExp(
        `^/api/v1/scorm-package-jobs/([^/]+)/${escapedSuffix}$`,
        "u",
      );
  const match = pattern.exec(pathname);
  return match?.[1] === undefined
    ? null
    : decodeURIComponent(match[1]);
}

function firstDecodedPathSegment(
  pathname: string,
  prefix: string,
): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const segment = pathname.slice(prefix.length).split("/")[0];
  if (segment === undefined || segment.length === 0) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new HostedAuthorizationError(
      "RUN_ACCESS_DENIED",
      "The requested resource identifier is invalid.",
    );
  }
}

function ltiContextMatchesAssignment(
  principal: ApplicationPrincipal,
  assignment: HostedAssignmentV1,
): boolean {
  const principalContext = principal.learningContext;
  const assignmentContext = assignment.learningContext;
  return (
    principal.authenticationSource === "lti" &&
    principalContext !== undefined &&
    assignmentContext !== undefined &&
    principalContext.issuer === assignmentContext.issuer &&
    principalContext.clientId === assignmentContext.clientId &&
    principalContext.deploymentId ===
      assignmentContext.deploymentId &&
    principalContext.contextId === assignmentContext.contextId
  );
}

async function enforceLtiCourseRequestScope(options: {
  readonly principal: ApplicationPrincipal;
  readonly pathname: string;
  readonly environment: WorkerEnvironment;
}): Promise<void> {
  if (options.principal.authenticationSource !== "lti") return;
  if (options.principal.learningContext === undefined) {
    throw new HostedAuthorizationError(
      "RUN_ACCESS_DENIED",
      "The LTI session has no Moodle course context.",
    );
  }
  if (options.pathname === "/api/v1/runs") {
    throw new HostedAuthorizationError(
      "RUN_ACCESS_DENIED",
      "Moodle-launched instructors must create runs through a course-bound assignment.",
    );
  }
  let assignmentId = firstDecodedPathSegment(
    options.pathname,
    "/api/v1/assignments/",
  );
  const runId = firstDecodedPathSegment(
    options.pathname,
    "/api/v1/runs/",
  );
  if (assignmentId === null && runId !== null) {
    assignmentId = (
      await new D1AssignmentRepository(
        options.environment.DB,
        new SystemUtcClock(),
      ).findForRun(runId)
    )?.assignmentId ?? null;
  }
  const branchId = firstDecodedPathSegment(
    options.pathname,
    "/api/v1/counterfactuals/",
  );
  if (assignmentId === null && branchId !== null) {
    const metadata = await new D1CounterfactualRunRepository(
      options.environment.DB,
    ).find(branchId);
    if (metadata !== null) {
      assignmentId = (
        await new D1AssignmentRepository(
          options.environment.DB,
          new SystemUtcClock(),
        ).findForRun(metadata.sourceRunId)
      )?.assignmentId ?? null;
    }
  }
  if (
    (runId !== null || branchId !== null) &&
    assignmentId === null
  ) {
    throw new HostedAuthorizationError(
      "RUN_ACCESS_DENIED",
      "The requested run is not bound to this Moodle course.",
    );
  }
  if (assignmentId === null) return;
  if (
    options.principal.roles.includes("learner") &&
    options.principal.ltiAssignmentId !== assignmentId
  ) {
    throw new HostedAuthorizationError(
      "RUN_ACCESS_DENIED",
      "The Moodle learner launch is bound to another TraceChain assignment.",
    );
  }
  const assignment = await new D1AssignmentRepository(
    options.environment.DB,
    new SystemUtcClock(),
  ).find(assignmentId);
  if (
    assignment === null ||
    !ltiContextMatchesAssignment(options.principal, assignment)
  ) {
    throw new HostedAuthorizationError(
      "RUN_ACCESS_DENIED",
      "The requested assignment belongs to another Moodle course.",
    );
  }
}

/**
 * The staff scope of one assignment, stated as what is allowed rather than
 * what is refused.
 *
 * An administrator reaches every assignment. An instructor reaches the ones
 * they created. On endpoints that explicitly admit raters, a rater reaches
 * the assignments they were named on. Keeping that endpoint permission
 * explicit prevents a dual-role instructor/rater from using rater membership
 * to perform instructor-only mutations on somebody else's assignment.
 *
 * Every staff projection of an assignment goes through here. The reports,
 * monitors, replays, ratings and exports are all views of the same learner
 * evidence, so a scope enforced on one of them and not the others is not a
 * scope at all.
 */
function assertAssignmentScope(
  principal: ApplicationPrincipal,
  assignment: HostedAssignmentV1,
  options: {
    readonly allowAssignedRater?: boolean;
  } = {},
): HostedAssignmentV1 {
  const permitted =
    principal.roles.includes("administrator") ||
    (principal.roles.includes("instructor") &&
      assignment.createdByUserId === principal.userId) ||
    (options.allowAssignedRater === true &&
      principal.roles.includes("rater") &&
      assignment.raterUserIds.includes(principal.userId));
  if (!permitted) {
    throw new HostedAuthorizationError(
      "RUN_ACCESS_DENIED",
      "The assignment is outside the authenticated user's assignment scope.",
    );
  }
  return assignment;
}

async function assertScopedAssignment(
  environment: WorkerEnvironment,
  principal: ApplicationPrincipal,
  assignmentId: string,
  options?: {
    readonly allowAssignedRater?: boolean;
  },
): Promise<HostedAssignmentV1> {
  const assignment = await new D1AssignmentRepository(
    environment.DB,
    new SystemUtcClock(),
  ).find(assignmentId);
  if (assignment === null) {
    throw new AssignmentRepositoryError(
      "ASSIGNMENT_NOT_FOUND",
      `Assignment ${assignmentId} does not exist.`,
    );
  }
  return assertAssignmentScope(principal, assignment, options);
}

async function assertScopedRunAssignment(
  environment: WorkerEnvironment,
  principal: ApplicationPrincipal,
  runId: string,
  options?: {
    readonly allowAssignedRater?: boolean;
  },
): Promise<HostedAssignmentV1> {
  const assignment = await new D1AssignmentRepository(
    environment.DB,
    new SystemUtcClock(),
  ).findForRun(runId);
  if (assignment === null) {
    throw new AssignmentRepositoryError(
      "RUN_NOT_ASSIGNED",
      "Run is not linked to an assignment.",
    );
  }
  return assertAssignmentScope(principal, assignment, options);
}

function byteHash(bytes: ArrayBuffer): Promise<string> {
  return crypto.subtle.digest("SHA-256", bytes).then((digest) =>
    [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join(""),
  );
}

async function loadScormPackageCatalog(
  request: Request,
  assets: AssetBinding,
): Promise<HostedScormPackageCatalogV1> {
  const response = await assets.fetch(
    new Request(new URL("/scorm-packages/catalog.json", request.url)),
  );
  if (!response.ok) {
    throw new ScormPackageJobRepositoryError(
      "PACKAGE_JOB_STORAGE_FAILED",
      "The generated SCORM package catalog is unavailable.",
    );
  }
  const catalog = (await response.json()) as HostedScormPackageCatalogV1;
  if (
    catalog.schemaVersion !== "2.0.0" ||
    !Array.isArray(catalog.packages)
  ) {
    throw new ScormPackageJobRepositoryError(
      "PACKAGE_JOB_STORAGE_FAILED",
      "The generated SCORM package catalog is invalid.",
    );
  }
  return catalog;
}

async function findHostedContentPack(
  environment: WorkerEnvironment,
  principalUserId: string,
  packId: string,
  packVersion: string,
): Promise<ScenarioPackV2 | null> {
  if (isTechnicalLabHostedContent(packId, packVersion)) {
    return technicalLabHostedPackAdapter;
  }
  return new D1ScenarioPackRepository(
    environment.DB,
    new SystemUtcClock(),
    principalUserId,
  ).find(packId, packVersion);
}

async function hostedServiceForRun(
  environment: WorkerEnvironment,
  principalUserId: string,
  runId: string,
): Promise<{
  readonly pack: ScenarioPackV2;
  readonly service: HostedRuntimeService;
}> {
  const store = new D1RunEventStore(environment.DB);
  const counterfactualRepository =
    new D1CounterfactualRunRepository(environment.DB);
  const counterfactual =
    await counterfactualRepository.find(runId);
  const events = await store.load(
    counterfactual?.sourceRunId ?? runId,
  );
  const first = events[0];
  if (first === undefined) {
    throw new HostedRunCommandError(
      "RUN_NOT_FOUND",
      `Run ${runId} does not exist.`,
    );
  }
  const clock = new SystemUtcClock();
  const pack = await findHostedContentPack(
    environment,
    principalUserId,
    first.packId,
    first.packVersion,
  );
  if (pack === null) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "The run's exact published scenario pack is unavailable.",
    );
  }
  const auditVariantAssignment =
    storedAuditVariantAssignment(
      first.payload.variantAssignment,
    );
  return {
    pack,
    service: createHostedRuntimeService({
      pack,
      scenarioId: first.scenarioId,
      scenarioVersion: first.scenarioVersion,
      eventStore: store,
      clock,
      ids: new WebCryptoIdGenerator(),
      counterfactualBranches: new CounterfactualBranchEngine(
        store,
        counterfactualRepository,
      ),
      ...(auditVariantAssignment === undefined
        ? {}
        : { auditVariantAssignment }),
    }),
  };
}

type LtiGradeReturnResponse =
  | {
      readonly status: "unavailable";
    }
  | {
      readonly status:
        | "pending"
        | "delivered"
        | "failed";
      readonly attemptCount: number;
    };

async function deliverCompletedRunToLtiAgs(options: {
  readonly environment: WorkerEnvironment;
  readonly sessionToken: string;
  readonly runId: string;
  readonly service: HostedRuntimeService;
  readonly assignmentId: string;
}): Promise<LtiGradeReturnResponse> {
  const clock = new SystemUtcClock();
  try {
    const context =
      await new D1LtiAuthenticationRepository(
        options.environment.DB,
        clock,
      ).findActiveAgsContext(sha256Hex(options.sessionToken));
    if (
      context === null ||
      context.assignmentId !== options.assignmentId ||
      !supportsLtiAgsScore(context)
    ) {
      return { status: "unavailable" };
    }
    const grade = await options.service.officialGrade(options.runId);
    if (grade === null) return { status: "unavailable" };
    const events = await new D1RunEventStore(
      options.environment.DB,
    ).load(options.runId);
    const completedAt = events
      .filter((event) => event.eventType === "RUN_COMPLETED")
      .at(-1)?.serverTimestampUtc;
    if (completedAt === undefined) {
      return { status: "failed", attemptCount: 0 };
    }
    const registration = parseLtiPlatformRegistrations(
      options.environment.TRACECHAIN_LTI_REGISTRATIONS_JSON,
    ).find(
      (candidate) =>
        candidate.registrationId === context.registrationId,
    );
    if (registration === undefined) {
      return { status: "failed", attemptCount: 0 };
    }
    const publicJwks = parseToolPublicJwks(
      options.environment.TRACECHAIN_LTI_TOOL_JWKS_JSON,
    );
    const privateJwk = parseToolPrivateJwk(
      options.environment.TRACECHAIN_LTI_TOOL_PRIVATE_JWK_JSON,
      publicJwks,
    );
    const delivery = await deliverLtiAgsScore({
      runId: options.runId,
      completedAt,
      grade,
      context,
      registration,
      privateJwk,
      repository: new D1LtiAgsRepository(
        options.environment.DB,
        clock,
      ),
      clock,
      ids: new WebCryptoIdGenerator(),
    });
    return {
      status:
        delivery.status === "delivering"
          ? "pending"
          : delivery.status,
      attemptCount: delivery.attemptCount,
    };
  } catch (error) {
    console.error(
      "TraceChain LTI AGS delivery failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return { status: "failed", attemptCount: 0 };
  }
}

async function counterfactualSourceContext(
  environment: WorkerEnvironment,
  principal: ApplicationPrincipal,
  sourceRunId: string,
) {
  const { pack, service } = await hostedServiceForRun(
    environment,
    principal.userId,
    sourceRunId,
  );
  const state = await service.loadState(sourceRunId);
  if (state.status !== "completed") {
    throw new HostedRunCommandError(
      "WORKFLOW_PRECONDITION_FAILED",
      "Counterfactual replay is available only after the source run is completed.",
    );
  }
  const assignmentRepository = new D1AssignmentRepository(
    environment.DB,
    new SystemUtcClock(),
  );
  const assignment =
    await assignmentRepository.findForRun(sourceRunId);
  if (assignment === null) {
    throw new AssignmentRepositoryError(
      "RUN_NOT_ASSIGNED",
      "Counterfactual replay requires an assignment-scoped source run.",
    );
  }
  const isAdministrator =
    principal.roles.includes("administrator");
  const isManagingInstructor =
    principal.roles.includes("instructor") &&
    assignment.createdByUserId === principal.userId;
  const isAssignedLearner =
    principal.roles.includes("learner") &&
    state.learnerUserId === principal.userId &&
    assignment.learnerUserIds.includes(principal.userId);
  if (
    !isAdministrator &&
    !isManagingInstructor &&
    !isAssignedLearner
  ) {
    throw new HostedAuthorizationError(
      "RUN_ACCESS_DENIED",
      "The source run is outside the authenticated user's assignment scope.",
    );
  }
  const creatorType =
    isAdministrator || isManagingInstructor
      ? ("INSTRUCTOR" as const)
      : ("LEARNER" as const);
  if (!assignment.counterfactualReplay.enabled) {
    throw new HostedAuthorizationError(
      "RUN_ACCESS_DENIED",
      "Counterfactual replay is disabled for this assignment.",
    );
  }
  if (
    creatorType === "LEARNER" &&
    (assignment.mode !== "sandbox" ||
      assignment.counterfactualReplay.learnerAvailability ===
        "DISABLED")
  ) {
    throw new HostedAuthorizationError(
      "RUN_ACCESS_DENIED",
      "Learner-created counterfactual branches require Sandbox mode.",
    );
  }
  return {
    assignment,
    creatorType,
    pack,
    service,
    state,
    store: new D1RunEventStore(environment.DB),
  };
}

function counterfactualPointIsAvailable(
  configuration: {
    readonly availability:
      | "AFTER_RUN_COMPLETION"
      | "AFTER_FEEDBACK_RELEASE"
      | "INSTRUCTOR_ONLY";
    readonly permittedCreators:
      readonly ("LEARNER" | "INSTRUCTOR" | "RATER")[];
  },
  creatorType: "LEARNER" | "INSTRUCTOR",
  feedbackReleased: boolean,
  assignmentConfiguration: {
    readonly enabled: boolean;
    readonly allowedDecisionNodeIds: readonly string[];
    readonly learnerAvailability:
      | "DISABLED"
      | "AFTER_RUN_COMPLETION"
      | "AFTER_FEEDBACK_RELEASE";
  },
  forkNodeId: string,
): boolean {
  const assignmentAllowsLearner =
    creatorType !== "LEARNER" ||
    (assignmentConfiguration.learnerAvailability ===
      "AFTER_RUN_COMPLETION" ||
      (assignmentConfiguration.learnerAvailability ===
        "AFTER_FEEDBACK_RELEASE" &&
        feedbackReleased));
  return (
    assignmentConfiguration.enabled &&
    assignmentConfiguration.allowedDecisionNodeIds.includes(
      forkNodeId,
    ) &&
    assignmentAllowsLearner &&
    configuration.permittedCreators.includes(creatorType) &&
    (configuration.availability === "AFTER_RUN_COMPLETION" ||
      (configuration.availability === "AFTER_FEEDBACK_RELEASE" &&
        feedbackReleased) ||
      (configuration.availability === "INSTRUCTOR_ONLY" &&
        creatorType === "INSTRUCTOR"))
  );
}

async function loadCounterfactualComparison(options: {
  readonly environment: WorkerEnvironment;
  readonly actor: ApplicationPrincipal;
  readonly metadata: CounterfactualRunMetadataV1;
}) {
  const context = await counterfactualSourceContext(
    options.environment,
    options.actor,
    options.metadata.sourceRunId,
  );
  const sourceEvents = await context.store.load(
    options.metadata.sourceRunId,
  );
  const branchEvents = await context.store.load(
    options.metadata.branchRunId,
  );
  if (branchEvents.length === 0) {
    throw new HostedRunCommandError(
      "WORKFLOW_PRECONDITION_FAILED",
      "Submit the alternative decision before requesting a comparison.",
    );
  }
  const point = counterfactualDecisionPoints({
    pack: context.pack,
    sourceRunId: options.metadata.sourceRunId,
    events: sourceEvents,
  }).find(
    (candidate) =>
      candidate.forkSequenceNumber ===
        options.metadata.forkSequenceNumber &&
      candidate.forkNodeId === options.metadata.forkNodeId,
  );
  const scenario = context.pack.scenarios.find(
    (candidate) =>
      candidate.scenarioId ===
        options.metadata.sourceScenarioId &&
      candidate.version ===
        options.metadata.sourceScenarioVersion,
  );
  if (point === undefined || scenario === undefined) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "The counterfactual point is missing from the exact source scenario.",
    );
  }
  const conditionConfiguration =
    options.metadata.counterfactualType === "CONDITION"
      ? scenario.counterfactualConditions.find(
          (candidate) =>
            candidate.conditionId ===
              options.metadata.conditionIntervention?.conditionId &&
            candidate.forkNodeId ===
              options.metadata.forkNodeId,
        )
      : undefined;
  if (
    options.metadata.counterfactualType === "CONDITION" &&
    conditionConfiguration === undefined
  ) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "The authored condition is missing from the exact source scenario.",
    );
  }
  const sourceCommandIds = new Set(
    sourceCommandBatchesAfterFork(
      sourceEvents,
      options.metadata.forkSequenceNumber,
    ).map((batch) => batch.commandId),
  );
  const manuallyChangedLaterDecision = branchEvents.some(
    (event) =>
      event.causationId !== options.metadata.interventionId &&
      !sourceCommandIds.has(event.causationId),
  );
  const branchState = await context.service.loadState(
    options.metadata.branchRunId,
  );
  const classification =
    branchState.status === "completed" &&
    !manuallyChangedLaterDecision
      ? ("SINGLE_INTERVENTION" as const)
      : ("EXPLORATORY_BRANCH" as const);
  return {
    comparison: createCounterfactualComparison({
      metadata: options.metadata,
      point,
      comparisonDimensionIds:
        conditionConfiguration?.comparisonDimensionIds ??
        point.configuration.comparisonDimensionIds,
      dimensions:
        scenario.counterfactualComparisonDimensions,
      sourceEvents,
      branchEvents,
      forkProjection:
        await context.service.counterfactualForkProjection(
          options.actor,
          options.metadata.sourceRunId,
          options.metadata.forkSequenceNumber,
          options.metadata.forkRoleId,
        ),
      originalProjection:
        await context.service.counterfactualSourceProjection(
          options.actor,
          options.metadata.sourceRunId,
        ),
      alternativeProjection:
        await context.service.counterfactualProjection(
          options.actor,
          options.metadata.branchRunId,
        ),
      originalMetrics:
        await context.service.counterfactualMetrics(
          options.actor,
          options.metadata.sourceRunId,
        ),
      alternativeMetrics:
        await context.service.counterfactualMetrics(
          options.actor,
          options.metadata.branchRunId,
        ),
      classification,
    }),
    reflection:
      await new D1CounterfactualReflectionRepository(
        options.environment.DB,
      ).find(options.metadata.branchRunId),
    branchStatus:
      branchState.status === "completed"
        ? ("COMPLETED" as const)
        : ("IN_PROGRESS" as const),
  };
}

async function apiResponse(
  request: Request,
  environment: WorkerEnvironment,
): Promise<Response> {
  enforceSameOriginMutation(request);
  await ensureD1FoundationSchema(environment.DB);
  const principalRepository = new D1ApplicationPrincipalRepository(
    environment.DB,
  );
  const clock = new SystemUtcClock();
  const sessionToken = ltiSessionToken(request);
  const ltiRegistrations =
    sessionToken === null
      ? []
      : parseLtiPlatformRegistrations(
          environment.TRACECHAIN_LTI_REGISTRATIONS_JSON,
        );
  let principal: ApplicationPrincipal | null =
    authorizeLtiSessionPrincipal(
      sessionToken === null
        ? null
        : await new D1LtiAuthenticationRepository(
            environment.DB,
            clock,
          ).findActiveSession(sha256Hex(sessionToken)),
      ltiRegistrations,
    );
  if (principal === null) {
    try {
      principal = await resolveAuthenticatedPrincipal(
        request,
        principalRepository,
      );
    } catch (error) {
      if (
        !(error instanceof AuthenticatedPrincipalError) ||
        error.code !== "APPLICATION_ACCESS_NOT_PROVISIONED"
      ) {
        throw error;
      }
      const verifiedEmail = request.headers.get(
        AUTHENTICATED_USER_EMAIL_HEADER,
      );
      if (
        verifiedEmail === null ||
        !(await provisionBootstrapAdministrator({
          database: environment.DB,
          verifiedEmail,
          configuredEmailAllowlist:
            environment.TRACECHAIN_BOOTSTRAP_ADMIN_EMAILS,
          clock,
        }))
      ) {
        throw error;
      }
      principal = await resolveAuthenticatedPrincipal(
        request,
        principalRepository,
      );
    }
  }
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/api/v1/session") {
    return jsonResponse(200, {
      userId: principal.userId,
      ...(principal.email === undefined
        ? {}
        : { email: principal.email }),
      ...(principal.displayName === undefined
        ? {}
        : { displayName: principal.displayName }),
      roles: principal.roles,
      ...(principal.authenticationSource === undefined
        ? {}
        : {
            authenticationSource:
              principal.authenticationSource,
          }),
      ...(principal.learningContext === undefined
        ? {}
        : { learningContext: principal.learningContext }),
      ...(principal.ltiLaunchType === undefined
        ? {}
        : { ltiLaunchType: principal.ltiLaunchType }),
      ...(principal.ltiAssignmentId === undefined
        ? {}
        : { ltiAssignmentId: principal.ltiAssignmentId }),
      ...(principal.ltiNrpsAvailable === undefined
        ? {}
        : { ltiNrpsAvailable: principal.ltiNrpsAvailable }),
    });
  }

  if (principal.ltiLaunchType === "deep-linking") {
    throw new HostedAuthorizationError(
      "RUN_ACCESS_DENIED",
      "An LTI Deep Linking session may only select one course assignment.",
    );
  }

  await enforceLtiCourseRequestScope({
    principal,
    pathname: url.pathname,
    environment,
  });

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/admin/access-audit"
  ) {
    requireApplicationRole(principal, ["administrator"]);
    const accessRepository = new D1ApplicationAccessRepository(
      environment.DB,
      new SystemUtcClock(),
    );
    return jsonResponse(200, {
      audit: await accessRepository.listAudit(),
    });
  }

  if (url.pathname === "/api/v1/admin/users") {
    requireApplicationRole(principal, ["administrator"]);
    const accessRepository = new D1ApplicationAccessRepository(
      environment.DB,
      new SystemUtcClock(),
    );
    if (request.method === "GET") {
      return jsonResponse(200, {
        users: await accessRepository.list(),
      });
    }
    if (request.method === "POST") {
      const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
      if (
        !isRecord(body) ||
        !Array.isArray(body.roles) ||
        !body.roles.every((role) => typeof role === "string")
      ) {
        throw new ApplicationAccessRepositoryError(
          "INVALID_ACCESS_COMMAND",
          "Application access requires a role list.",
        );
      }
      const result = await accessRepository.upsert(
        {
          commandId: requiredText(body.commandId, "commandId"),
          email: requiredText(body.email, "email"),
          status: requiredText(
            body.status,
            "status",
          ) as ApplicationUserStatus,
          roles: body.roles as ApplicationRole[],
        },
        principal,
      );
      return jsonResponse(
        result.wasIdempotentReplay ? 200 : 201,
        { ...result },
      );
    }
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/scenario-packs/validate"
  ) {
    requireApplicationRole(principal, [
      "scenario-author",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_PACK_BYTES);
    if (!isRecord(body) || !("pack" in body)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "pack must contain a scenario-pack object.",
      );
    }
    return jsonResponse(200, {
      report: scenarioPackValidationReport(
        body.pack,
        scenarioPackCatalogs,
      ),
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/scenario-assets"
  ) {
    requireApplicationRole(principal, [
      "scenario-author",
      "administrator",
    ]);
    const fileName = requiredText(
      url.searchParams.get("fileName"),
      "fileName",
    );
    const purpose = requiredText(
      url.searchParams.get("purpose"),
      "purpose",
    );
    if (
      purpose !== "STAFF_PORTRAIT" &&
      purpose !== "SCENE_ILLUSTRATION" &&
      purpose !== "EVIDENCE_IMAGE"
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "purpose must be a supported scenario-image purpose.",
      );
    }
    const bytes = await boundedRequestBytes(
      request,
      MAXIMUM_SCENARIO_IMAGE_BYTES,
    );
    const inspected = inspectScenarioImage(bytes, fileName);
    const filePath = scenarioImageFilePath(purpose, inspected);
    await environment.ARTIFACTS.put(
      scenarioImageStorageKey(inspected.sha256),
      Uint8Array.from(bytes).buffer,
      {
        httpMetadata: { contentType: inspected.mimeType },
        customMetadata: {
          sha256: inspected.sha256,
          filePath,
          uploadedByUserId: principal.userId,
        },
      },
    );
    return jsonResponse(201, {
      image: { ...inspected, purpose, filePath },
    });
  }

  const scenarioAssetSha256 = pathScenarioAsset(url.pathname);
  if (request.method === "GET" && scenarioAssetSha256 !== null) {
    requireApplicationRole(principal, [
      "scenario-author",
      "administrator",
    ]);
    const object = await environment.ARTIFACTS.get(
      scenarioImageStorageKey(scenarioAssetSha256),
    );
    let stored = await storedObjectBytes(object);
    let fallbackContentType: string | undefined;
    if (stored === null) {
      const filePath = url.searchParams.get("path") ?? "";
      const fileName = url.searchParams.get("fileName") ?? "";
      if (
        filePath.startsWith("media/") &&
        !filePath.includes("\\") &&
        !filePath.split("/").includes("..") &&
        fileName.length > 0
      ) {
        const response = await environment.ASSETS.fetch(
          new Request(new URL(`/${filePath}`, request.url)),
        );
        if (response.ok) {
          const candidate = new Uint8Array(await response.arrayBuffer());
          try {
            const inspected = inspectScenarioImage(candidate, fileName);
            if (inspected.sha256 === scenarioAssetSha256) {
              stored = candidate;
              fallbackContentType = inspected.mimeType;
            }
          } catch {
            // The endpoint returns not found when static bytes do not verify.
          }
        }
      }
    }
    if (stored === null) {
      return jsonResponse(404, {
        error: { code: "SCENARIO_IMAGE_NOT_FOUND" },
      });
    }
    const contentType =
      object?.httpMetadata?.contentType ??
      fallbackContentType ??
      "application/octet-stream";
    return withSecurityHeaders(
      new Response(Uint8Array.from(stored).buffer, {
        status: 200,
        headers: {
          "cache-control": "private, max-age=3600, immutable",
          "content-type": contentType,
          "x-content-sha256": scenarioAssetSha256,
        },
      }),
    );
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/scorm-package-jobs"
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    const jobs = await new D1ScormPackageJobRepository(
      environment.DB,
      new SystemUtcClock(),
    ).list(principal);
    return jsonResponse(200, {
      jobs: jobs.map((job) => ({
        ...job,
        downloadUrl: `/api/v1/scorm-package-jobs/${encodeURIComponent(job.jobId)}/download`,
      })),
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/learner/assignments"
  ) {
    const learner = requireApplicationRole(principal, ["learner"]);
    const assignments = await new D1AssignmentRepository(
      environment.DB,
      new SystemUtcClock(),
    ).listForLearner(learner.userId);
    return jsonResponse(200, {
      assignments:
        learner.authenticationSource === "lti" &&
        learner.ltiAssignmentId !== undefined
          ? assignments.filter(
              ({ assignment }) =>
                assignment.assignmentId ===
                learner.ltiAssignmentId,
            )
          : assignments,
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/scorm-package-jobs"
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (!isRecord(body)) {
      throw new ScormPackageJobRepositoryError(
        "INVALID_PACKAGE_JOB",
        "Package job request must be an object.",
      );
    }
    const packageRequest: CreateScormPackageJobRequest = {
      commandId: requiredText(body.commandId, "commandId"),
      jobId: requiredText(body.jobId, "jobId"),
      presetId: requiredText(
        body.presetId,
        "presetId",
      ) as CreateScormPackageJobRequest["presetId"],
    };
    const catalog = await loadScormPackageCatalog(
      request,
      environment.ASSETS,
    );
    const artifact = catalog.packages.find(
      (candidate) => candidate.presetId === packageRequest.presetId,
    );
    if (artifact === undefined) {
      throw new ScormPackageJobRepositoryError(
        "INVALID_PACKAGE_JOB",
        "Only a complete, accepted package preset may be generated.",
      );
    }
    const assetResponse = await environment.ASSETS.fetch(
      new Request(new URL(artifact.downloadPath, request.url)),
    );
    if (!assetResponse.ok) {
      throw new ScormPackageJobRepositoryError(
        "PACKAGE_JOB_STORAGE_FAILED",
        "The verified package artifact is unavailable.",
      );
    }
    const bytes = await assetResponse.arrayBuffer();
    if (
      bytes.byteLength !== artifact.sizeBytes ||
      bytes.byteLength > MAXIMUM_SCORM_ARTIFACT_BYTES ||
      (await byteHash(bytes)) !== artifact.sha256
    ) {
      throw new ScormPackageJobRepositoryError(
        "PACKAGE_JOB_STORAGE_FAILED",
        "The package artifact does not match its generated catalog.",
      );
    }
    const artifactKey =
      `scorm-packages/${artifact.sha256}/${artifact.filename}`;
    await environment.ARTIFACTS.put(artifactKey, bytes, {
      httpMetadata: {
        contentType: "application/zip",
        contentDisposition: `attachment; filename="${artifact.filename}"`,
      },
      customMetadata: {
        sha256: artifact.sha256,
        configurationHash: artifact.configurationHash,
        scenarioId: artifact.scenarioId,
        scenarioVersion: artifact.scenarioVersion,
      },
    });
    const result = await new D1ScormPackageJobRepository(
      environment.DB,
      new SystemUtcClock(),
    ).createCompleted(
      packageRequest,
      artifact,
      artifactKey,
      principal,
    );
    return jsonResponse(result.wasIdempotentReplay ? 200 : 201, {
      job: {
        ...result.job,
        downloadUrl: `/api/v1/scorm-package-jobs/${encodeURIComponent(result.job.jobId)}/download`,
      },
      wasIdempotentReplay: result.wasIdempotentReplay,
    });
  }

  const scormPackageJobId = pathScormPackageJob(url.pathname);
  if (request.method === "GET" && scormPackageJobId !== null) {
    requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    const job = await new D1ScormPackageJobRepository(
      environment.DB,
      new SystemUtcClock(),
    ).find(scormPackageJobId);
    if (job === null) {
      throw new ScormPackageJobRepositoryError(
        "PACKAGE_JOB_NOT_FOUND",
        "SCORM package job does not exist.",
      );
    }
    if (
      job.requestedByUserId !== principal.userId &&
      !principal.roles.includes("administrator")
    ) {
      throw new HostedAuthorizationError(
        "RUN_ACCESS_DENIED",
        "The package job belongs to another instructor.",
      );
    }
    return jsonResponse(200, {
      job: {
        ...job,
        downloadUrl: `/api/v1/scorm-package-jobs/${encodeURIComponent(job.jobId)}/download`,
      },
    });
  }

  const downloadScormPackageJobId = pathScormPackageJob(
    url.pathname,
    "download",
  );
  if (
    request.method === "GET" &&
    downloadScormPackageJobId !== null
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    const job = await new D1ScormPackageJobRepository(
      environment.DB,
      new SystemUtcClock(),
    ).find(downloadScormPackageJobId);
    if (job === null) {
      throw new ScormPackageJobRepositoryError(
        "PACKAGE_JOB_NOT_FOUND",
        "SCORM package job does not exist.",
      );
    }
    if (
      job.requestedByUserId !== principal.userId &&
      !principal.roles.includes("administrator")
    ) {
      throw new HostedAuthorizationError(
        "RUN_ACCESS_DENIED",
        "The package job belongs to another instructor.",
      );
    }
    const artifact = await environment.ARTIFACTS.get(job.artifactKey);
    if (artifact?.body === null || artifact === null) {
      throw new ScormPackageJobRepositoryError(
        "PACKAGE_JOB_STORAGE_FAILED",
        "The completed package artifact is unavailable.",
      );
    }
    return withSecurityHeaders(
      new Response(artifact.body, {
        status: 200,
        headers: {
          "cache-control": "private, no-store",
          "content-disposition": `attachment; filename="${job.filename}"`,
          "content-length": String(job.sizeBytes),
          "content-type": "application/zip",
          "x-content-sha256": job.sha256,
        },
      }),
    );
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/scenario-packs/import"
  ) {
    requireApplicationRole(principal, [
      "scenario-author",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_PACK_BYTES);
    if (!isRecord(body) || !("pack" in body)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "pack must contain a scenario-pack object.",
      );
    }
    const report = scenarioPackValidationReport(
      body.pack,
      scenarioPackCatalogs,
    );
    if (!report.valid) {
      return jsonResponse(422, { report });
    }
    const pack = body.pack as ScenarioPackV2;
    await scenarioPackAssetBytes(request, environment, pack);
    await new D1ScenarioPackRepository(
      environment.DB,
      new SystemUtcClock(),
      principal.userId,
    ).saveDraft(pack);
    return jsonResponse(201, { report });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/scenario-packs"
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "scenario-author",
      "administrator",
    ]);
    const packs = await new D1ScenarioPackRepository(
      environment.DB,
      new SystemUtcClock(),
      principal.userId,
    ).list();
    return jsonResponse(200, { packs });
  }

  const scenarioPackVersion = pathScenarioPackVersion(url.pathname);
  if (request.method === "GET" && scenarioPackVersion !== null) {
    requireApplicationRole(principal, [
      "instructor",
      "scenario-author",
      "administrator",
    ]);
    const pack = await new D1ScenarioPackRepository(
      environment.DB,
      new SystemUtcClock(),
      principal.userId,
    ).find(
      scenarioPackVersion.packId,
      scenarioPackVersion.version,
    );
    if (pack === null) {
      return jsonResponse(404, {
        error: { code: "SCENARIO_PACK_NOT_FOUND" },
      });
    }
    return jsonResponse(200, { pack });
  }

  const scenarioPackBundleVersion = pathScenarioPackVersion(
    url.pathname,
    "bundle",
  );
  if (
    request.method === "GET" &&
    scenarioPackBundleVersion !== null
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "scenario-author",
      "administrator",
    ]);
    const pack = await new D1ScenarioPackRepository(
      environment.DB,
      new SystemUtcClock(),
      principal.userId,
    ).find(
      scenarioPackBundleVersion.packId,
      scenarioPackBundleVersion.version,
    );
    if (pack === null) {
      return jsonResponse(404, {
        error: { code: "SCENARIO_PACK_NOT_FOUND" },
      });
    }
    const bytes = createScenarioPackBundle(
      pack,
      await scenarioPackAssetBytes(request, environment, pack),
    );
    return withSecurityHeaders(
      new Response(Uint8Array.from(bytes).buffer, {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "content-disposition":
            `attachment; filename="${scenarioPackBundleFilename(pack)}"`,
          "content-length": String(bytes.byteLength),
          "content-type": "application/zip",
        },
      }),
    );
  }

  const previewPackVersion = pathScenarioPackVersion(
    url.pathname,
    "preview",
  );
  if (request.method === "GET" && previewPackVersion !== null) {
    requireApplicationRole(principal, [
      "instructor",
      "scenario-author",
      "administrator",
    ]);
    const pack = await new D1ScenarioPackRepository(
      environment.DB,
      new SystemUtcClock(),
      principal.userId,
    ).find(previewPackVersion.packId, previewPackVersion.version);
    if (pack === null) {
      return jsonResponse(404, {
        error: { code: "SCENARIO_PACK_NOT_FOUND" },
      });
    }
    return jsonResponse(200, {
      preview: createScenarioRolePreview({
        pack,
        scenarioId: requiredText(
          url.searchParams.get("scenarioId"),
          "scenarioId",
        ),
        scenarioVersion: requiredText(
          url.searchParams.get("scenarioVersion"),
          "scenarioVersion",
        ),
        locale: requiredText(url.searchParams.get("locale"), "locale"),
        mode: requiredText(
          url.searchParams.get("mode"),
          "mode",
        ) as CreateHostedAssignmentRequest["mode"],
        roleId: requiredText(url.searchParams.get("roleId"), "roleId"),
        localizationCatalogs: scenarioPackCatalogs,
      }),
    });
  }

  const comparisonPackId = pathScenarioPackComparison(url.pathname);
  if (request.method === "GET" && comparisonPackId !== null) {
    requireApplicationRole(principal, [
      "instructor",
      "scenario-author",
      "administrator",
    ]);
    const fromVersion = requiredText(
      url.searchParams.get("fromVersion"),
      "fromVersion",
    );
    const toVersion = requiredText(
      url.searchParams.get("toVersion"),
      "toVersion",
    );
    const repository = new D1ScenarioPackRepository(
      environment.DB,
      new SystemUtcClock(),
      principal.userId,
    );
    const [from, to] = await Promise.all([
      repository.find(comparisonPackId, fromVersion),
      repository.find(comparisonPackId, toVersion),
    ]);
    if (from === null || to === null) {
      return jsonResponse(404, {
        error: { code: "SCENARIO_PACK_NOT_FOUND" },
      });
    }
    return jsonResponse(200, {
      comparison: compareScenarioPackVersions(from, to),
    });
  }

  const publishPackVersion = pathScenarioPackVersion(
    url.pathname,
    "publish",
  );
  if (request.method === "POST" && publishPackVersion !== null) {
    requireApplicationRole(principal, [
      "scenario-author",
      "administrator",
    ]);
    const clock = new SystemUtcClock();
    const repository = new D1ScenarioPackRepository(
      environment.DB,
      clock,
      principal.userId,
    );
    const draft = await repository.find(
      publishPackVersion.packId,
      publishPackVersion.version,
    );
    if (draft === null) {
      return jsonResponse(404, {
        error: { code: "SCENARIO_PACK_NOT_FOUND" },
      });
    }
    await scenarioPackAssetBytes(request, environment, draft);
    const published = await repository.publish(
      publishPackVersion.packId,
      publishPackVersion.version,
      {
      publishedAt: clock.now(),
      publishedBy: principal.userId,
      },
    );
    return jsonResponse(201, {
      packId: published.packId,
      version: published.version,
      status: published.status,
      contentHash: published.publication?.contentHash,
    });
  }

  const retirePackVersion = pathScenarioPackVersion(
    url.pathname,
    "retire",
  );
  if (request.method === "POST" && retirePackVersion !== null) {
    requireApplicationRole(principal, [
      "scenario-author",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (!isRecord(body)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Retirement request must be an object.",
      );
    }
    const clock = new SystemUtcClock();
    const result = await new D1ScenarioPackRepository(
      environment.DB,
      clock,
      principal.userId,
    ).retire(retirePackVersion.packId, retirePackVersion.version, {
      commandId: requiredText(body.commandId, "commandId"),
      retiredAt: clock.now(),
      retiredBy: principal.userId,
    });
    return jsonResponse(result.wasIdempotentReplay ? 200 : 201, {
      packId: result.pack.packId,
      version: result.pack.version,
      status: result.pack.status,
      contentHash: result.pack.publication?.contentHash,
      wasIdempotentReplay: result.wasIdempotentReplay,
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/scenario-packs/publish"
  ) {
    requireApplicationRole(principal, [
      "scenario-author",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_PACK_BYTES);
    if (!isRecord(body) || !isRecord(body.pack)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "pack must contain a scenario-pack object.",
      );
    }
    const clock = new SystemUtcClock();
    const repository = new D1ScenarioPackRepository(
      environment.DB,
      clock,
      principal.userId,
    );
    const pack = body.pack as unknown as ScenarioPackV2;
    await scenarioPackAssetBytes(request, environment, pack);
    await repository.saveDraft(pack);
    const published = await repository.publish(
      pack.packId,
      pack.version,
      {
        publishedAt: clock.now(),
        publishedBy: principal.userId,
      },
    );
    return jsonResponse(201, {
      packId: published.packId,
      version: published.version,
      status: published.status,
      contentHash: published.publication?.contentHash,
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/assignment-options"
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    const repository = new D1ScenarioPackRepository(
      environment.DB,
      new SystemUtcClock(),
      principal.userId,
    );
    const publishedItems = (await repository.list()).filter(
      (pack) => pack.status === "published",
    );
    const publishedPacks = await Promise.all(
      publishedItems.map((pack) =>
        repository.find(pack.packId, pack.version),
      ),
    );
    const scenarioOptions: HostedAssignmentScenarioOptionV1[] =
      publishedPacks.flatMap((pack) =>
        pack === null || pack.status !== "published"
          ? []
          : pack.scenarios
              .filter(hasRegisteredHostedRuntime)
              .flatMap((scenario) => {
                const runnableModes = runnableHostedModeProfiles(
                  pack,
                  scenario,
                );
                if (runnableModes.supportedModes.length === 0) {
                  return [];
                }
                const counterfactualNodes = scenario.nodes.filter(
                  (node): node is DecisionNodeV1 =>
                    node.nodeType === "DECISION" &&
                    node.counterfactual?.enabled === true,
                );
                const counterfactualDecisionTitles =
                  Object.fromEntries(
                    counterfactualNodes.map((node) => [
                      node.nodeId,
                      node.title.localizationKey,
                    ]),
                  );
                return [{
                  schemaVersion: "3.0.0" as const,
                  packId: pack.packId,
                  packVersion: pack.version,
                  scenarioId: scenario.scenarioId,
                  scenarioVersion: scenario.version,
                  packTitleKey:
                    pack.manifest.title.localizationKey,
                  scenarioTitleKey:
                    scenario.title.localizationKey,
                  labelsByLocale: assignmentOptionLabels(
                    pack,
                    scenario,
                    counterfactualDecisionTitles,
                  ),
                  summary: projectInstructorScenarioSummary(
                    pack,
                    scenario,
                  ),
                  ...runnableModes,
                  counterfactualDecisionPoints:
                    counterfactualNodes.map((node) => ({
                      nodeId: node.nodeId,
                      decisionId: node.decisionId,
                      titleKey: node.title.localizationKey,
                      availability:
                        node.counterfactual!.availability,
                      maximumBranchesPerLearner:
                        node.counterfactual!
                          .maxBranchesPerLearner ?? 20,
                      reflectionRequired:
                        node.counterfactual!
                          .reflectionRequired ?? false,
                    })),
                }];
              }),
      );
    const technicalScenario =
      technicalLabHostedPackAdapter.scenarios[0]!;
    const technicalExperience =
      resolveHostedTechnicalLabExperience(
        technicalLabHostedPackAdapter.supportedLocales.includes(
          "vi",
        )
          ? "vi"
          : "en",
      );
    const technicalOption: HostedAssignmentScenarioOptionV1 = {
      schemaVersion: "3.0.0",
      packId: technicalLabHostedPackAdapter.packId,
      packVersion: technicalLabHostedPackAdapter.version,
      scenarioId: technicalScenario.scenarioId,
      scenarioVersion: technicalScenario.version,
      packTitleKey:
        technicalLabHostedPackAdapter.manifest.title
          .localizationKey,
      scenarioTitleKey: technicalScenario.title.localizationKey,
      labelsByLocale: assignmentOptionLabels(
        technicalLabHostedPackAdapter,
        technicalScenario,
        {},
      ),
      summary: projectInstructorScenarioSummary(
        technicalLabHostedPackAdapter,
        technicalScenario,
        {
          technicalLabModuleCount:
            TECHNICAL_LAB_HOSTED_MODULE_COUNT,
          technicalLabMaximumScore:
            TECHNICAL_LAB_HOSTED_MAXIMUM_SCORE,
        },
      ),
      supportedModes: technicalScenario.supportedModes,
      modeConfigurations: technicalScenario.modeConfigurations,
      experienceConfigurations: [
        {
          mode: "tutorial",
          ...technicalExperience,
        },
      ],
      counterfactualDecisionPoints: [],
    };
    const options = [...scenarioOptions, technicalOption];
    return jsonResponse(200, {
      options: options.sort((left, right) => {
        const leftKey =
          `${left.packId}@${left.packVersion}/` +
          `${left.scenarioId}@${left.scenarioVersion}`;
        const rightKey =
          `${right.packId}@${right.packVersion}/` +
          `${right.scenarioId}@${right.scenarioVersion}`;
        return leftKey < rightKey
          ? -1
          : leftKey > rightKey
            ? 1
            : 0;
      }),
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/assignment-learners"
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    let learners: readonly HostedAssignmentLearnerOptionV2[];
    if (
      principal.authenticationSource === "lti" &&
      sessionToken !== null
    ) {
      const context =
        await new D1LtiAuthenticationRepository(
          environment.DB,
          clock,
        ).findActiveNrpsContext(sha256Hex(sessionToken));
      learners =
        context === null
          ? []
          : await new D1LtiNrpsRepository(
              environment.DB,
              clock,
            ).listActiveLearners(context);
    } else {
      learners = (
        await new D1ApplicationAccessRepository(
          environment.DB,
          clock,
        ).list()
      )
        .filter(
          (user) =>
            user.status === "active" &&
            user.roles.includes("learner"),
        )
        .map<HostedAssignmentLearnerOptionV2>((user) => ({
          schemaVersion: "2.0.0",
          userId: user.userId,
          displayName: user.email,
          email: user.email,
          source: "APPLICATION_ACCESS",
        }))
        .sort((left, right) => {
          const leftKey =
            `${left.displayName}\u0000${left.userId}`;
          const rightKey =
            `${right.displayName}\u0000${right.userId}`;
          return leftKey < rightKey
            ? -1
            : leftKey > rightKey
              ? 1
              : 0;
        });
    }
    return jsonResponse(200, { learners });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/assignment-raters"
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    /*
     * Raters are application-provisioned rather than course-derived: an NRPS
     * roster describes a Moodle course's learners and never names a rater, so
     * both authentication sources select from the same provisioned accounts.
     */
    const raters = (
      await new D1ApplicationAccessRepository(
        environment.DB,
        clock,
      ).list()
    )
      .filter(
        (user) =>
          user.status === "active" && user.roles.includes("rater"),
      )
      .map<HostedAssignmentLearnerOptionV2>((user) => ({
        schemaVersion: "2.0.0",
        userId: user.userId,
        displayName: user.email,
        email: user.email,
        source: "APPLICATION_ACCESS",
      }))
      .sort((left, right) => {
        const leftKey = `${left.displayName}\u0000${left.userId}`;
        const rightKey = `${right.displayName}\u0000${right.userId}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
    return jsonResponse(200, { raters });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/assignments"
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const repository = new D1AssignmentRepository(
      environment.DB,
      new SystemUtcClock(),
    );
    const assignments = (await repository.listForStaff(principal))
      .filter(
        (assignment) =>
          principal.authenticationSource !== "lti" ||
          ltiContextMatchesAssignment(principal, assignment),
      )
      .map((assignment) => ({
        schemaVersion: "1.0.0" as const,
        assignmentId: assignment.assignmentId,
        title: assignment.title,
        scenarioId: assignment.scenarioId,
        scenarioVersion: assignment.scenarioVersion,
        mode: assignment.mode,
        status: assignment.status,
        assignedLearnerCount: assignment.learnerUserIds.length,
        assignedRaterCount: assignment.raterUserIds.length,
        createdAt: assignment.createdAt,
      }));
    return jsonResponse(200, { assignments });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/assignments"
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (!isRecord(body)) {
      throw new AssignmentRepositoryError(
        "INVALID_ASSIGNMENT",
        "Assignment request must be an object.",
      );
    }
    const packId = requiredText(body.packId, "packId");
    const packVersion = requiredText(body.packVersion, "packVersion");
    const scenarioId = requiredText(body.scenarioId, "scenarioId");
    const scenarioVersion = requiredText(
      body.scenarioVersion,
      "scenarioVersion",
    );
    const clock = new SystemUtcClock();
    const publishedPack = await findHostedContentPack(
      environment,
      principal.userId,
      packId,
      packVersion,
    );
    const scenario = publishedPack?.scenarios.find(
      (candidate) =>
        candidate.scenarioId === scenarioId &&
        candidate.version === scenarioVersion,
    );
    if (
      publishedPack === null ||
      publishedPack.status !== "published" ||
      scenario === undefined
    ) {
      throw new AssignmentRepositoryError(
        "INVALID_ASSIGNMENT",
        "Assignment must reference one exact published scenario version.",
      );
    }
    if (!hasRegisteredHostedRuntime(scenario)) {
      throw new AssignmentRepositoryError(
        "INVALID_ASSIGNMENT",
        "The selected scenario has no registered hosted runtime adapter.",
      );
    }
    const mode = requiredText(
      body.mode,
      "mode",
    ) as CreateHostedAssignmentRequest["mode"];
    const locale = publishedPack.supportedLocales.includes("vi")
      ? "vi"
      : "en";
    const { runtimeConfiguration, experience } = (() => {
      try {
        const resolvedRuntimeConfiguration =
          modeConfigurationFor(scenario, mode);
        return {
          runtimeConfiguration: resolvedRuntimeConfiguration,
          experience:
            scenario.hostedRuntime?.runtimeId ===
            "tracechain-technical-lab-v1"
              ? resolveHostedTechnicalLabExperience(locale)
              : resolveHostedExperienceConfiguration({
                  packId: publishedPack.packId,
                  packVersion: publishedPack.version,
                  scenario,
                  runtimeConfiguration:
                    resolvedRuntimeConfiguration,
                  locale,
                }),
        };
      } catch {
        throw new AssignmentRepositoryError(
          "INVALID_ASSIGNMENT",
          "The selected scenario mode cannot produce a valid hosted experience.",
        );
      }
    })();
    let counterfactualReplay;
    let research;
    try {
      counterfactualReplay =
        validateAssignmentCounterfactualConfiguration(
          body.counterfactualReplay,
          mode,
        );
      research = validateAssignmentResearchConfiguration(
        body.research,
        runtimeConfiguration,
      );
    } catch (error) {
      if (
        error instanceof
          AssignmentCounterfactualConfigurationError ||
        error instanceof AssignmentResearchConfigurationError
      ) {
        throw new AssignmentRepositoryError(
          "INVALID_ASSIGNMENT",
          error.message,
        );
      }
      throw error;
    }
    const authoredCounterfactualNodeIds = new Set(
      scenario.nodes
        .filter(
          (node) =>
            node.nodeType === "DECISION" &&
            node.counterfactual?.enabled === true,
        )
        .map((node) => node.nodeId),
    );
    if (
      counterfactualReplay.allowedDecisionNodeIds.some(
        (nodeId) =>
          !authoredCounterfactualNodeIds.has(nodeId),
      )
    ) {
      throw new AssignmentRepositoryError(
        "INVALID_ASSIGNMENT",
        "Assignment counterfactual points must belong to the exact scenario version.",
      );
    }
    if (
      principal.authenticationSource === "lti" &&
      Array.isArray(body.learnerUserIds) &&
      body.learnerUserIds.length > 0
    ) {
      const nrpsContext =
        sessionToken === null
          ? null
          : await new D1LtiAuthenticationRepository(
              environment.DB,
              clock,
            ).findActiveNrpsContext(sha256Hex(sessionToken));
      const activeLearnerIds = new Set(
        nrpsContext === null
          ? []
          : (
              await new D1LtiNrpsRepository(
                environment.DB,
                clock,
              ).listActiveLearners(nrpsContext)
            ).map((learner) => learner.userId),
      );
      if (
        body.learnerUserIds.some(
          (learnerUserId) =>
            typeof learnerUserId !== "string" ||
            !activeLearnerIds.has(learnerUserId),
        )
      ) {
        throw new AssignmentRepositoryError(
          "LEARNER_NOT_PROVISIONED",
          "An LTI assignment may select only active learners synchronized from its exact Moodle course.",
        );
      }
    }
    const result = await new D1AssignmentRepository(
      environment.DB,
      clock,
    ).create(
      {
        ...(Object.fromEntries(
          Object.entries(body).filter(
            ([key]) => key !== "learningContext",
          ),
        ) as unknown as CreateHostedAssignmentRequest),
        mode,
        runConfiguration: runtimeConfiguration,
        experienceConfiguration: experience.configuration,
        experienceConfigurationHash:
          experience.configurationHash,
        counterfactualReplay,
        research,
        ...(principal.learningContext === undefined
          ? {}
          : { learningContext: principal.learningContext }),
      },
      principal,
    );
    return jsonResponse(
      result.wasIdempotentReplay ? 200 : 201,
      {
        assignment: result.assignment,
        wasIdempotentReplay: result.wasIdempotentReplay,
      },
    );
  }

  const assignmentId = pathAssignmentId(url.pathname);
  if (request.method === "GET" && assignmentId !== null) {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    return jsonResponse(200, {
      assignment: await assertScopedAssignment(
        environment,
        principal,
        assignmentId,
        { allowAssignedRater: true },
      ),
    });
  }

  const closeAssignmentId = pathAssignmentId(
    url.pathname,
    "close",
  );
  if (
    request.method === "POST" &&
    closeAssignmentId !== null
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (!isRecord(body)) {
      throw new AssignmentRepositoryError(
        "INVALID_ASSIGNMENT",
        "Assignment close request must be an object.",
      );
    }
    await assertScopedAssignment(
      environment,
      principal,
      closeAssignmentId,
    );
    const result = await new D1AssignmentRepository(
      environment.DB,
      new SystemUtcClock(),
    ).close(
      closeAssignmentId,
      requiredText(body.commandId, "commandId"),
      principal,
    );
    return jsonResponse(
      result.wasIdempotentReplay ? 200 : 201,
      {
        assignment: result.assignment,
        wasIdempotentReplay: result.wasIdempotentReplay,
      },
    );
  }

  const startRunAssignmentId = pathAssignmentId(
    url.pathname,
    "start-run",
  );
  if (
    request.method === "POST" &&
    startRunAssignmentId !== null
  ) {
    const runCreator = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (!isRecord(body)) {
      throw new AssignmentRepositoryError(
        "INVALID_ASSIGNMENT",
        "Assignment run request must be an object.",
      );
    }
    const clock = new SystemUtcClock();
    const assignment = await new D1AssignmentRepository(
      environment.DB,
      clock,
    ).find(startRunAssignmentId);
    if (assignment === null) {
      throw new AssignmentRepositoryError(
        "ASSIGNMENT_NOT_FOUND",
        `Assignment ${startRunAssignmentId} does not exist.`,
      );
    }
    if (!runCreator.roles.includes("learner")) {
      assertAssignmentScope(runCreator, assignment);
    }
    const learnerUserId = runCreator.roles.includes("learner")
      ? runCreator.userId
      : requiredText(body.learnerUserId, "learnerUserId");
    if (!assignment.learnerUserIds.includes(learnerUserId)) {
      throw new AssignmentRepositoryError(
        "INVALID_ASSIGNMENT",
        "The run requires an assigned learner.",
      );
    }
    const availability = assignmentStartAvailability(
      assignment,
      clock.now(),
    );
    if (availability.status !== "available") {
      const code =
        availability.status === "closed"
          ? "ASSIGNMENT_CLOSED"
          : availability.status === "not-yet-open"
            ? "ASSIGNMENT_NOT_YET_AVAILABLE"
            : "ASSIGNMENT_AVAILABILITY_ENDED";
      throw new AssignmentRepositoryError(
        code,
        `The assignment start status is ${availability.status}.`,
      );
    }
    const pack = await findHostedContentPack(
      environment,
      principal.userId,
      assignment.packId,
      assignment.packVersion,
    );
    const scenario = pack?.scenarios.find(
      (candidate) =>
        candidate.scenarioId === assignment.scenarioId &&
        candidate.version === assignment.scenarioVersion,
    );
    if (
      pack === null ||
      pack.status !== "published" ||
      scenario === undefined
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The assignment's exact published scenario is unavailable.",
      );
    }
    const locale = pack.supportedLocales.includes("vi")
      ? "vi"
      : "en";
    const expectedExperience =
      scenario.hostedRuntime?.runtimeId ===
      "tracechain-technical-lab-v1"
        ? resolveHostedTechnicalLabExperience(locale)
        : resolveHostedExperienceConfiguration({
            packId: pack.packId,
            packVersion: pack.version,
            scenario,
            runtimeConfiguration: assignment.runConfiguration,
            locale,
          });
    try {
      assertHostedExperienceIdentity({
        configuration: assignment.experienceConfiguration,
        configurationHash:
          assignment.experienceConfigurationHash,
        expected: expectedExperience,
      });
    } catch (error) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        error instanceof Error
          ? error.message
          : "Assignment experience configuration is invalid.",
      );
    }
    const service = createHostedRuntimeService({
      pack,
      scenarioId: scenario.scenarioId,
      scenarioVersion: scenario.version,
      eventStore: new D1RunEventStore(environment.DB),
      clock,
      ids: new WebCryptoIdGenerator(),
    });
    const result = await service.createRun(principal, {
      commandId: requiredText(body.commandId, "commandId"),
      runId: requiredText(body.runId, "runId"),
      assignmentId: assignment.assignmentId,
      learnerUserId,
      mode: assignment.mode,
      modeConfiguration: assignment.runConfiguration,
      ...(assignment.research.enabled
        ? {
            scenarioSeed: assignment.research.fixedScenarioSeed,
          }
        : assignment.runConfiguration.seedPolicy === "generated"
        ? {}
        : {
            scenarioSeed: runCreator.roles.includes("learner")
              ? `assignment:${assignment.assignmentId}:${learnerUserId}`
              : requiredText(body.scenarioSeed, "scenarioSeed"),
          }),
      ...(service.runtimeKind === "native-coffee-v2"
        ? {
            caseVariant: runCreator.roles.includes("learner")
              ? assignment.runConfiguration.forcedOutcomeCode ??
                "authorized-certifier"
              : requiredText(body.caseVariant, "caseVariant"),
          }
        : {}),
    });
    return jsonResponse(
      result.wasIdempotentReplay ? 200 : 201,
      {
        runId: result.state.runId,
        assignmentId: result.state.assignmentId,
        learnerUserId: result.state.learnerUserId,
        status: result.state.status,
        version: result.state.version,
        wasIdempotentReplay: result.wasIdempotentReplay,
      },
    );
  }

  const reportAssignmentId = pathAssignmentId(
    url.pathname,
    "report",
  );
  if (request.method === "GET" && reportAssignmentId !== null) {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    await assertScopedAssignment(
      environment,
      principal,
      reportAssignmentId,
      { allowAssignedRater: true },
    );
    const report = await new D1AssignmentRepository(
      environment.DB,
      new SystemUtcClock(),
    ).report(reportAssignmentId);
    return jsonResponse(200, { report });
  }

  const evidenceCatalogAssignmentId = pathAssignmentId(
    url.pathname,
    "evidence-catalog",
  );
  if (
    request.method === "GET" &&
    evidenceCatalogAssignmentId !== null
  ) {
    const catalogActor = requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const assignment = await assertScopedAssignment(
      environment,
      catalogActor,
      evidenceCatalogAssignmentId,
      { allowAssignedRater: true },
    );
    const pack = await findHostedContentPack(
      environment,
      catalogActor.userId,
      assignment.packId,
      assignment.packVersion,
    );
    if (pack === null) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The evidence catalog requires the assignment's exact scenario pack.",
      );
    }
    return jsonResponse(200, {
      evidenceCatalog:
        createAssignmentEvidenceAssessmentCatalog({
          assignment,
          pack,
          localizationCatalogs: scenarioPackCatalogs,
        }),
    });
  }

  const auditReportAssignmentId = pathAssignmentId(
    url.pathname,
    "audit-report",
  );
  if (
    request.method === "GET" &&
    auditReportAssignmentId !== null
  ) {
    const reportActor = requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const clock = new SystemUtcClock();
    const repository = new D1AssignmentRepository(
      environment.DB,
      clock,
    );
    const report = await repository.report(
      auditReportAssignmentId,
    );
    assertAssignmentScope(reportActor, report.assignment, {
      allowAssignedRater: true,
    });
    const pack = await findHostedContentPack(
      environment,
      reportActor.userId,
      report.assignment.packId,
      report.assignment.packVersion,
    );
    const assignmentScenario = pack?.scenarios.find(
      (scenario) =>
        scenario.scenarioId === report.assignment.scenarioId &&
        scenario.version === report.assignment.scenarioVersion,
    );
    if (
      pack === null ||
      pack.status !== "published" ||
      assignmentScenario === undefined
    ) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Audit reporting requires the assignment's exact published pack.",
      );
    }
    if (assignmentScenario.auditCase === undefined) {
      return jsonResponse(200, { auditReport: null });
    }
    const bank = pack.auditVariantBanks.find((candidate) =>
      candidate.variants.some(
        (variant) =>
          variant.scenarioId === assignmentScenario.scenarioId &&
          variant.scenarioVersion === assignmentScenario.version,
      ),
    );
    const sources = await Promise.all(
      report.learners.flatMap((learner) =>
        learner.runs.map(async (summary) => {
          const { service } = await hostedServiceForRun(
            environment,
            reportActor.userId,
            summary.runId,
          );
          const [replay, timeline] = await Promise.all([
            service.instructorReplay(
              reportActor,
              summary.runId,
            ),
            service.instructorTimeline(
              reportActor,
              summary.runId,
            ),
          ]);
          if (replay.projection.audit === undefined) {
            throw new HostedRunCommandError(
              "PACK_CONTRACT_MISMATCH",
              "An Audit assignment contains a non-Audit run.",
            );
          }
          return {
            summary,
            projection: replay.projection.audit,
            timeline,
          };
        }),
      ),
    );
    return jsonResponse(200, {
      auditReport: createAuditAssignmentReport({
        assignmentReport: report,
        runs: sources,
        ...(bank === undefined ? {} : { bank }),
      }),
    });
  }

  const technicalLabReportAssignmentId = pathAssignmentId(
    url.pathname,
    "technical-lab-report",
  );
  if (
    request.method === "GET" &&
    technicalLabReportAssignmentId !== null
  ) {
    const reportActor = requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const clock = new SystemUtcClock();
    const report = await new D1AssignmentRepository(
      environment.DB,
      clock,
    ).report(technicalLabReportAssignmentId);
    assertAssignmentScope(reportActor, report.assignment, {
      allowAssignedRater: true,
    });
    if (
      !isTechnicalLabHostedContent(
        report.assignment.packId,
        report.assignment.packVersion,
      )
    ) {
      return jsonResponse(200, { technicalLabReport: null });
    }
    const runs = await Promise.all(
      report.learners.flatMap((learner) =>
        learner.runs.map(async (summary) => {
          const { service } = await hostedServiceForRun(
            environment,
            reportActor.userId,
            summary.runId,
          );
          const [replay, timeline] = await Promise.all([
            service.instructorReplay(
              reportActor,
              summary.runId,
            ),
            service.instructorTimeline(
              reportActor,
              summary.runId,
            ),
          ]);
          if (replay.projection.technicalLab === undefined) {
            throw new HostedRunCommandError(
              "PACK_CONTRACT_MISMATCH",
              "A Technical Laboratory assignment contains a non-laboratory run.",
            );
          }
          return createTechnicalLabRunReport({
            learnerUserId: summary.learnerUserId,
            status: summary.status,
            projection: replay.projection,
            timeline,
          });
        }),
      ),
    );
    return jsonResponse(200, {
      technicalLabReport: createTechnicalLabAssignmentReport({
        assignmentReport: report,
        runs,
        generatedAt: clock.now(),
      }),
    });
  }

  const decisionOutcomeAssignmentId = pathAssignmentId(
    url.pathname,
    "decision-outcomes",
  );
  if (
    request.method === "GET" &&
    decisionOutcomeAssignmentId !== null
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const clock = new SystemUtcClock();
    const repository = new D1AssignmentRepository(
      environment.DB,
      clock,
    );
    await assertScopedAssignment(
      environment,
      principal,
      decisionOutcomeAssignmentId,
      { allowAssignedRater: true },
    );
    const report = await repository.report(
      decisionOutcomeAssignmentId,
    );
    const pack = await findHostedContentPack(
      environment,
      principal.userId,
      report.assignment.packId,
      report.assignment.packVersion,
    );
    if (pack === null || pack.status !== "published") {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Decision reporting requires the assignment's exact published pack.",
      );
    }
    const service = createHostedRuntimeService({
      pack,
      scenarioId: report.assignment.scenarioId,
      scenarioVersion: report.assignment.scenarioVersion,
      eventStore: new D1RunEventStore(environment.DB),
      clock,
      ids: new WebCryptoIdGenerator(),
    });
    const decisionOutcomes: HostedAssignmentDecisionOutcomeReportV1 = {
      schemaVersion: "1.0.0",
      interpretation:
        "DECISION_PROCESS_SEPARATE_FROM_REALIZED_OUTCOME",
      assignmentId: report.assignment.assignmentId,
      packId: report.assignment.packId,
      packVersion: report.assignment.packVersion,
      scenarioId: report.assignment.scenarioId,
      scenarioVersion: report.assignment.scenarioVersion,
      runs: await Promise.all(
        report.learners.flatMap((learner) =>
          learner.runs.map((run) =>
            service.instructorDecisionOutcomeEvidence(
              principal,
              run.runId,
            ),
          ),
        ),
      ),
    };
    return jsonResponse(200, { decisionOutcomes });
  }

  const monitorAssignmentId = pathAssignmentId(
    url.pathname,
    "monitor",
  );
  const processAnalyticsAssignmentId = pathAssignmentId(
    url.pathname,
    "process-analytics",
  );
  if (
    request.method === "GET" &&
    processAnalyticsAssignmentId !== null
  ) {
    const analyticsActor = requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    const clock = new SystemUtcClock();
    const repository = new D1AssignmentRepository(
      environment.DB,
      clock,
    );
    const report = await repository.report(
      processAnalyticsAssignmentId,
    );
    assertAssignmentScope(analyticsActor, report.assignment);
    const eventStore = new D1RunEventStore(environment.DB);
    const allRuns = report.learners.flatMap((learner) =>
      learner.runs.map((run) => run.runId),
    );
    const events = (
      await Promise.all(
        allRuns.map((runId) => eventStore.load(runId)),
      )
    ).flat();
    const service =
      allRuns.length === 0
        ? null
        : (
            await hostedServiceForRun(
              environment,
              principal.userId,
              allRuns[0]!,
            )
          ).service;
    const professionalConsequencesByRun =
      service === null
        ? {}
        : Object.fromEntries(
            await Promise.all(
              allRuns.map(async (runId) => [
                runId,
                await service.counterfactualMetrics(
                  principal,
                  runId,
                ),
              ]),
            ),
          );
    return jsonResponse(200, {
      analytics: createAssignmentProcessAnalytics({
        report,
        events,
        professionalConsequencesByRun,
        generatedAt: clock.now(),
      }),
    });
  }

  if (request.method === "GET" && monitorAssignmentId !== null) {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const clock = new SystemUtcClock();
    const repository = new D1AssignmentRepository(
      environment.DB,
      clock,
    );
    await assertScopedAssignment(
      environment,
      principal,
      monitorAssignmentId,
      { allowAssignedRater: true },
    );
    const report = await repository.report(monitorAssignmentId);
    const pack = await findHostedContentPack(
      environment,
      principal.userId,
      report.assignment.packId,
      report.assignment.packVersion,
    );
    if (pack === null || pack.status !== "published") {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Live monitoring requires the assignment's exact published pack.",
      );
    }
    const service = createHostedRuntimeService({
      pack,
      scenarioId: report.assignment.scenarioId,
      scenarioVersion: report.assignment.scenarioVersion,
      eventStore: new D1RunEventStore(environment.DB),
      clock,
      ids: new WebCryptoIdGenerator(),
    });
    const generatedAt = clock.now();
    const statuses = await Promise.all(
      report.learners.flatMap((learner) =>
        learner.runs.map(async (run): Promise<HostedRunMonitorV1> => {
          try {
            return await service.instructorMonitor(
              principal,
              run.runId,
              generatedAt,
            );
          } catch {
            return {
              runId: run.runId,
              learnerUserId: run.learnerUserId,
              status: run.status,
              eventCount: run.eventCount,
              currentStageId: null,
              activeRoleId: null,
              elapsedSeconds: null,
              lastActivityAt: null,
              pendingActionIds: [],
              technicalStatus: "error",
            };
          }
        }),
      ),
    );
    const monitor: HostedAssignmentMonitorV1 = {
      schemaVersion: "1.0.0",
      assignmentId: report.assignment.assignmentId,
      generatedAt,
      learners: report.learners.map((learner) => ({
        learnerUserId: learner.learnerUserId,
        runs: statuses.filter(
          (status) =>
            status.learnerUserId === learner.learnerUserId,
        ),
      })),
    };
    return jsonResponse(200, { monitor });
  }

  const competencyAssignmentId = pathAssignmentId(
    url.pathname,
    "competencies",
  );
  if (
    request.method === "GET" &&
    competencyAssignmentId !== null
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const clock = new SystemUtcClock();
    const repository = new D1AssignmentRepository(
      environment.DB,
      clock,
    );
    await assertScopedAssignment(
      environment,
      principal,
      competencyAssignmentId,
      { allowAssignedRater: true },
    );
    const report = await repository.report(competencyAssignmentId);
    const pack = await findHostedContentPack(
      environment,
      principal.userId,
      report.assignment.packId,
      report.assignment.packVersion,
    );
    if (pack === null || pack.status !== "published") {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Competency reporting requires the assignment's exact published pack.",
      );
    }
    const service = createHostedRuntimeService({
      pack,
      scenarioId: report.assignment.scenarioId,
      scenarioVersion: report.assignment.scenarioVersion,
      eventStore: new D1RunEventStore(environment.DB),
      clock,
      ids: new WebCryptoIdGenerator(),
    });
    const evidenceByRun = await Promise.all(
      report.learners.flatMap((learner) =>
        learner.runs.map(async (run) => ({
          runId: run.runId,
          indicators: await service.competencyReport(
            principal,
            run.runId,
          ),
        })),
      ),
    );
    return jsonResponse(200, {
      competencies: createAssignmentCompetencyReport({
        assignmentReport: report,
        pack,
        evidenceByRun,
      }),
    });
  }

  const curriculumCrosswalkAssignmentId = pathAssignmentId(
    url.pathname,
    "curriculum-crosswalks",
  );
  const curriculumCrosswalkDownloadAssignmentId = pathAssignmentId(
    url.pathname,
    "curriculum-crosswalks.json",
  );
  const requestedCurriculumCrosswalkAssignmentId =
    curriculumCrosswalkAssignmentId ??
    curriculumCrosswalkDownloadAssignmentId;
  if (
    request.method === "GET" &&
    requestedCurriculumCrosswalkAssignmentId !== null
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const clock = new SystemUtcClock();
    const repository = new D1AssignmentRepository(
      environment.DB,
      clock,
    );
    await assertScopedAssignment(
      environment,
      principal,
      requestedCurriculumCrosswalkAssignmentId,
      { allowAssignedRater: true },
    );
    const assignmentReport = await repository.report(
      requestedCurriculumCrosswalkAssignmentId,
    );
    const pack = await findHostedContentPack(
      environment,
      principal.userId,
      assignmentReport.assignment.packId,
      assignmentReport.assignment.packVersion,
    );
    if (pack === null || pack.status !== "published") {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Curriculum crosswalk reporting requires the assignment's exact published pack.",
      );
    }
    const service = createHostedRuntimeService({
      pack,
      scenarioId: assignmentReport.assignment.scenarioId,
      scenarioVersion:
        assignmentReport.assignment.scenarioVersion,
      eventStore: new D1RunEventStore(environment.DB),
      clock,
      ids: new WebCryptoIdGenerator(),
    });
    const evidenceByRun = await Promise.all(
      assignmentReport.learners.flatMap((learner) =>
        learner.runs.map(async (run) => ({
          runId: run.runId,
          indicators: await service.competencyReport(
            principal,
            run.runId,
          ),
        })),
      ),
    );
    const curriculumCrosswalks =
      createAssignmentCurriculumCrosswalkReport({
        pack,
        overlays: repositoryCurriculumOverlays,
        competencyReport: createAssignmentCompetencyReport({
          assignmentReport,
          pack,
          evidenceByRun,
        }),
      });
    if (curriculumCrosswalkDownloadAssignmentId !== null) {
      return downloadResponse(
        serializeAssignmentCurriculumCrosswalkReportJson(
          curriculumCrosswalks,
        ),
        "application/json; charset=utf-8",
        assignmentCurriculumCrosswalkFilename(
          requestedCurriculumCrosswalkAssignmentId,
        ),
      );
    }
    return jsonResponse(200, { curriculumCrosswalks });
  }

  const counterfactualReportAssignmentId = pathAssignmentId(
    url.pathname,
    "counterfactual-report",
  );
  if (
    request.method === "GET" &&
    counterfactualReportAssignmentId !== null
  ) {
    const actor = requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    const clock = new SystemUtcClock();
    const assignmentReport =
      await new D1AssignmentRepository(
        environment.DB,
        clock,
      ).report(counterfactualReportAssignmentId);
    assertAssignmentScope(actor, assignmentReport.assignment);
    const branchRepository =
      new D1CounterfactualRunRepository(environment.DB);
    const eventStore = new D1RunEventStore(environment.DB);
    const branches: AssignmentCounterfactualReportV1["branches"][number][] =
      [];
    for (const learner of assignmentReport.learners) {
      for (const run of learner.runs) {
        const metadataList =
          await branchRepository.listBySourceRun(run.runId);
        for (const metadata of metadataList) {
          const branchEvents = await eventStore.load(
            metadata.branchRunId,
          );
          if (branchEvents.length === 0) {
            branches.push({
              learnerUserId: learner.learnerUserId,
              metadata,
              branchStatus: "CREATED",
              comparison: null,
              reflection: null,
              originalOfficialGradeChanged: false,
            });
            continue;
          }
          const result = await loadCounterfactualComparison({
            environment,
            actor,
            metadata,
          });
          branches.push({
            learnerUserId: learner.learnerUserId,
            metadata,
            branchStatus: result.branchStatus,
            comparison: result.comparison,
            reflection: result.reflection,
            originalOfficialGradeChanged: false,
          });
        }
      }
    }
    const report: AssignmentCounterfactualReportV1 = {
      schemaVersion: "1.0.0",
      reportType:
        "TRACECHAIN_ASSIGNMENT_COUNTERFACTUAL_REPORT",
      assignmentId: counterfactualReportAssignmentId,
      generatedAt: clock.now(),
      summary:
        createAssignmentCounterfactualReportSummary(branches),
      branches,
    };
    return jsonResponse(200, { report });
  }

  const jsonExportAssignmentId = pathAssignmentId(
    url.pathname,
    "export.json",
  );
  const csvExportAssignmentId = pathAssignmentId(
    url.pathname,
    "export.csv",
  );
  const exportAssignmentId =
    jsonExportAssignmentId ?? csvExportAssignmentId;
  if (request.method === "GET" && exportAssignmentId !== null) {
    const exportActor = requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const clock = new SystemUtcClock();
    const repository = new D1AssignmentRepository(
      environment.DB,
      clock,
    );
    const identityMode = assignmentExportIdentityMode(url);
    const report = await repository.report(exportAssignmentId);
    assertAssignmentScope(exportActor, report.assignment, {
      allowAssignedRater: true,
    });
    const pack = await findHostedContentPack(
      environment,
      exportActor.userId,
      report.assignment.packId,
      report.assignment.packVersion,
    );
    if (pack === null) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The evidence export requires the assignment's exact scenario pack.",
      );
    }
    const evidenceCatalog =
      createAssignmentEvidenceAssessmentCatalog({
        assignment: report.assignment,
        pack,
        localizationCatalogs: scenarioPackCatalogs,
      });
    const eventStore = new D1RunEventStore(environment.DB);
    const events = (
      await Promise.all(
        report.learners.flatMap((learner) =>
          learner.runs.map((run) => eventStore.load(run.runId)),
        ),
      )
    ).flat();
    const exported = createAssignmentEvidenceExport({
      report,
      evidenceCatalog,
      events,
      ratingRevisions: await repository.ratingHistory(
        exportAssignmentId,
      ),
      moderationResolutions: await repository.moderationHistory(
        exportAssignmentId,
      ),
      generatedAt: clock.now(),
      identityMode,
    });
    if (jsonExportAssignmentId !== null) {
      return downloadResponse(
        serializeAssignmentEvidenceJson(exported),
        "application/json; charset=utf-8",
        assignmentEvidenceFilename(
          exportAssignmentId,
          "json",
          identityMode,
        ),
      );
    }
    return downloadResponse(
      serializeAssignmentEvidenceCsv(exported),
      "text/csv; charset=utf-8",
      assignmentEvidenceFilename(
        exportAssignmentId,
        "csv",
        identityMode,
      ),
    );
  }

  const feedbackReleaseAssignmentId = pathAssignmentId(
    url.pathname,
    "feedback-release",
  );
  if (
    request.method === "POST" &&
    feedbackReleaseAssignmentId !== null
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (!isRecord(body)) {
      throw new AssignmentRepositoryError(
        "INVALID_ASSIGNMENT",
        "Feedback release request must be an object.",
      );
    }
    await assertScopedAssignment(
      environment,
      principal,
      feedbackReleaseAssignmentId,
    );
    const result = await new D1AssignmentRepository(
      environment.DB,
      new SystemUtcClock(),
    ).releaseFeedback(
      feedbackReleaseAssignmentId,
      requiredText(body.commandId, "commandId"),
      principal,
    );
    return jsonResponse(200, {
      assignment: result.assignment,
      wasIdempotentReplay: result.wasIdempotentReplay,
    });
  }

  const ratingRunId = pathRunId(url.pathname, "ratings");
  if (ratingRunId !== null && request.method === "GET") {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const repository = new D1AssignmentRepository(
      environment.DB,
      new SystemUtcClock(),
    );
    const assignment = await assertScopedRunAssignment(
      environment,
      principal,
      ratingRunId,
      { allowAssignedRater: true },
    );
    return jsonResponse(200, {
      assignment,
      ratings: await repository.currentRatings(ratingRunId),
      moderationResolutions:
        await repository.currentModerationResolutions(ratingRunId),
    });
  }
  if (ratingRunId !== null && request.method === "POST") {
    requireApplicationRole(principal, [
      "instructor",
      "rater",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (
      !isRecord(body) ||
      requiredText(body.runId, "runId") !== ratingRunId
    ) {
      throw new AssignmentRepositoryError(
        "INVALID_RATING",
        "Rating run ID must match the API route.",
      );
    }
    await assertScopedRunAssignment(
      environment,
      principal,
      ratingRunId,
      { allowAssignedRater: true },
    );
    const { pack, service } = await hostedServiceForRun(
      environment,
      principal.userId,
      ratingRunId,
    );
    const state = await service.loadState(ratingRunId);
    if (state.status !== "completed") {
      throw new AssignmentRepositoryError(
        "INVALID_RATING",
        "Manual rating is available after run completion.",
      );
    }
    const rubricId = requiredText(body.rubricId, "rubricId");
    const criterionId = requiredText(
      body.criterionId,
      "criterionId",
    );
    const rubric = pack.rubrics.find(
      (candidate) => candidate.rubricId === rubricId,
    );
    const criterion = rubric?.criteria.find(
      (candidate) => candidate.criterionId === criterionId,
    );
    if (
      rubric === undefined ||
      criterion === undefined ||
      typeof body.levelValue !== "number" ||
      !rubric.levels.some(
        (level) => level.value === body.levelValue,
      )
    ) {
      throw new AssignmentRepositoryError(
        "INVALID_RATING",
        "Rating must use an authored rubric criterion and level.",
      );
    }
    const rubricEvidence = await service.rubricEvidence(
      principal,
      ratingRunId,
    );
    const evidence = rubricEvidence.find(
      (candidate) =>
        candidate.rubricId === rubricId &&
        candidate.criterionId === criterionId,
    );
    const timeline = await service.instructorTimeline(
      principal,
      ratingRunId,
    );
    const permittedEvidenceIds = new Set([
      ...(evidence?.observedEvidenceIds ?? []),
      ...timeline.map((event) => event.eventId),
    ]);
    if (
      !Array.isArray(body.linkedEvidenceIds) ||
      !body.linkedEvidenceIds.every(
        (evidenceId) =>
          typeof evidenceId === "string" &&
          permittedEvidenceIds.has(evidenceId),
      )
    ) {
      throw new AssignmentRepositoryError(
        "INVALID_RATING",
        "Rating evidence must link to this run's observable evidence.",
      );
    }
    const result = await new D1AssignmentRepository(
      environment.DB,
      new SystemUtcClock(),
    ).saveRating(
      {
        commandId: requiredText(body.commandId, "commandId"),
        runId: ratingRunId,
        rubricId,
        rubricVersion: rubric.version,
        criterionId,
        levelValue: body.levelValue,
        comment:
          typeof body.comment === "string" ? body.comment : "",
        linkedEvidenceIds:
          body.linkedEvidenceIds as readonly string[],
        expectedRevision:
          typeof body.expectedRevision === "number"
            ? body.expectedRevision
            : Number.NaN,
      },
      principal,
    );
    return jsonResponse(
      result.wasIdempotentReplay ? 200 : 201,
      {
        rating: result.rating,
        wasIdempotentReplay: result.wasIdempotentReplay,
      },
    );
  }

  const moderationRunId = pathRunId(
    url.pathname,
    "moderation",
  );
  if (
    moderationRunId !== null &&
    request.method === "POST"
  ) {
    requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (
      !isRecord(body) ||
      requiredText(body.runId, "runId") !== moderationRunId
    ) {
      throw new AssignmentRepositoryError(
        "INVALID_MODERATION",
        "Moderation run ID must match the API route.",
      );
    }
    await assertScopedRunAssignment(
      environment,
      principal,
      moderationRunId,
    );
    const { pack, service } = await hostedServiceForRun(
      environment,
      principal.userId,
      moderationRunId,
    );
    const state = await service.loadState(moderationRunId);
    if (state.status !== "completed") {
      throw new AssignmentRepositoryError(
        "INVALID_MODERATION",
        "Moderation is available after run completion.",
      );
    }
    const rubricId = requiredText(body.rubricId, "rubricId");
    const criterionId = requiredText(
      body.criterionId,
      "criterionId",
    );
    const rubric = pack.rubrics.find(
      (candidate) => candidate.rubricId === rubricId,
    );
    const criterion = rubric?.criteria.find(
      (candidate) => candidate.criterionId === criterionId,
    );
    if (
      rubric === undefined ||
      criterion === undefined ||
      typeof body.levelValue !== "number" ||
      !rubric.levels.some(
        (level) => level.value === body.levelValue,
      ) ||
      !Array.isArray(body.sourceRatingIds)
    ) {
      throw new AssignmentRepositoryError(
        "INVALID_MODERATION",
        "Moderation must use an authored rubric level and source ratings.",
      );
    }
    const repository = new D1AssignmentRepository(
      environment.DB,
      new SystemUtcClock(),
    );
    const result = await repository.saveModeration(
      {
        commandId: requiredText(body.commandId, "commandId"),
        runId: moderationRunId,
        rubricId,
        rubricVersion: rubric.version,
        criterionId,
        levelValue: body.levelValue,
        comment:
          typeof body.comment === "string" ? body.comment : "",
        sourceRatingIds:
          body.sourceRatingIds as readonly string[],
        expectedRevision:
          typeof body.expectedRevision === "number"
            ? body.expectedRevision
            : Number.NaN,
      },
      principal,
    );
    return jsonResponse(
      result.wasIdempotentReplay ? 200 : 201,
      {
        resolution: result.resolution,
        wasIdempotentReplay: result.wasIdempotentReplay,
      },
    );
  }

  const feedbackRunId = pathRunId(url.pathname, "feedback");
  if (feedbackRunId !== null && request.method === "GET") {
    const { pack, service } = await hostedServiceForRun(
      environment,
      principal.userId,
      feedbackRunId,
    );
    const state = await service.loadState(feedbackRunId);
    requireAssignedLearner(principal, state.learnerUserId);
    const repository = new D1AssignmentRepository(
      environment.DB,
      new SystemUtcClock(),
    );
    const assignment = await repository.findForRun(feedbackRunId);
    if (assignment === null) {
      throw new AssignmentRepositoryError(
        "RUN_NOT_ASSIGNED",
        "Run is not linked to an assignment.",
      );
    }
    if (assignment.feedbackReleaseStatus !== "released") {
      throw new AssignmentRepositoryError(
        "FEEDBACK_NOT_RELEASED",
        "Instructor feedback has not been released.",
      );
    }
    const assignmentReport = await repository.report(
      assignment.assignmentId,
    );
    const learnerReport = assignmentReport.learners.find(
      (learner) => learner.learnerUserId === principal.userId,
    );
    if (learnerReport === undefined) {
      throw new AssignmentCompetencyReportError(
        "COMPETENCY_REPORT_SOURCE_MISMATCH",
        "Released competency evidence does not contain the assigned learner.",
      );
    }
    const evidenceByRun = await Promise.all(
      learnerReport.runs.map(async (run) => ({
        runId: run.runId,
        indicators: await service.learnerCompetencyEvidence(
          principal,
          run.runId,
        ),
      })),
    );
    const competencyProfile = createLearnerCompetencyProfile(
      createAssignmentCompetencyReport({
        assignmentReport,
        pack,
        evidenceByRun,
      }),
      principal.userId,
    );
    return jsonResponse(200, {
      assignmentId: assignment.assignmentId,
      releasedAt: assignment.feedbackReleasedAt,
      authoredFeedback: await service.learnerAuthoredFeedback(
        principal,
        feedbackRunId,
      ),
      ratings: await repository.currentRatings(feedbackRunId),
      moderationResolutions:
        await repository.currentModerationResolutions(feedbackRunId),
      competencyProfile,
    });
  }

  const counterfactualPointsRunId = pathRunId(
    url.pathname,
    "counterfactual-points",
  );
  if (
    counterfactualPointsRunId !== null &&
    request.method === "GET"
  ) {
    const actor = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "administrator",
    ]);
    const context = await counterfactualSourceContext(
      environment,
      actor,
      counterfactualPointsRunId,
    );
    const sourceEvents = await context.store.load(
      counterfactualPointsRunId,
    );
    const points = counterfactualDecisionPoints({
      pack: context.pack,
      sourceRunId: counterfactualPointsRunId,
      events: sourceEvents,
    }).filter((point) =>
      counterfactualPointIsAvailable(
        point.configuration,
        context.creatorType,
        context.assignment.feedbackReleaseStatus === "released",
        context.assignment.counterfactualReplay,
        point.forkNodeId,
      ),
    );
    const conditions = counterfactualConditionPoints({
      pack: context.pack,
      sourceRunId: counterfactualPointsRunId,
      events: sourceEvents,
    }).filter((point) =>
      counterfactualPointIsAvailable(
        point.configuration,
        context.creatorType,
        context.assignment.feedbackReleaseStatus === "released",
        context.assignment.counterfactualReplay,
        point.forkNodeId,
      ),
    );
    return jsonResponse(200, {
      sourceRunId: counterfactualPointsRunId,
      points: await Promise.all(
        points.map(async (point) => ({
          ...point,
          configuration: {
            ...point.configuration,
            maxBranchesPerLearner: Math.min(
              point.configuration.maxBranchesPerLearner ?? 20,
              context.assignment.counterfactualReplay
                .maximumBranchesPerLearner,
            ),
            reflectionRequired:
              (point.configuration.reflectionRequired ?? false) ||
              context.assignment.counterfactualReplay
                .requireReflection,
          },
          forkProjection:
            await context.service.counterfactualForkProjection(
              actor,
              point.sourceRunId,
              point.forkSequenceNumber,
              point.roleId,
            ),
        })),
      ),
      conditions: await Promise.all(
        conditions.map(async (point) => ({
          ...point,
          configuration: {
            ...point.configuration,
            maxBranchesPerLearner: Math.min(
              point.configuration.maxBranchesPerLearner ?? 20,
              context.assignment.counterfactualReplay
                .maximumBranchesPerLearner,
            ),
            reflectionRequired:
              (point.configuration.reflectionRequired ?? false) ||
              context.assignment.counterfactualReplay
                .requireReflection,
          },
          forkProjection:
            await context.service.counterfactualForkProjection(
              actor,
              point.sourceRunId,
              point.forkSequenceNumber,
              point.roleId,
            ),
        })),
      ),
    });
  }

  const createCounterfactualRunId = pathRunId(
    url.pathname,
    "counterfactuals",
  );
  if (
    createCounterfactualRunId !== null &&
    request.method === "POST"
  ) {
    const actor = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (!isRecord(body)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Counterfactual creation requires an object.",
      );
    }
    const context = await counterfactualSourceContext(
      environment,
      actor,
      createCounterfactualRunId,
    );
    const sourceEvents = await context.store.load(
      createCounterfactualRunId,
    );
    const points = counterfactualDecisionPoints({
      pack: context.pack,
      sourceRunId: createCounterfactualRunId,
      events: sourceEvents,
    });
    const conditionPoints = counterfactualConditionPoints({
      pack: context.pack,
      sourceRunId: createCounterfactualRunId,
      events: sourceEvents,
    });
    const counterfactualType =
      body.counterfactualType === "CONDITION"
        ? ("CONDITION" as const)
        : body.counterfactualType === "DECISION"
          ? ("DECISION" as const)
          : (() => {
              throw new HostedRunCommandError(
                "INVALID_COMMAND",
                "Counterfactual type must be DECISION or CONDITION.",
              );
            })();
    const forkSequenceNumber =
      typeof body.forkSequenceNumber === "number"
        ? body.forkSequenceNumber
        : Number.NaN;
    const forkNodeId = requiredText(
      body.forkNodeId,
      "forkNodeId",
    );
    const decisionPoint = points.find(
      (candidate) =>
        candidate.forkSequenceNumber === forkSequenceNumber &&
        candidate.forkNodeId === forkNodeId,
    );
    const conditionPoint =
      counterfactualType === "CONDITION"
        ? conditionPoints.find(
            (candidate) =>
              candidate.forkSequenceNumber ===
                forkSequenceNumber &&
              candidate.forkNodeId === forkNodeId &&
              candidate.configuration.conditionId ===
                body.conditionId,
          )
        : undefined;
    const point =
      counterfactualType === "CONDITION"
        ? conditionPoint
        : decisionPoint;
    if (
      point === undefined ||
      !counterfactualPointIsAvailable(
        point.configuration,
        context.creatorType,
        context.assignment.feedbackReleaseStatus === "released",
        context.assignment.counterfactualReplay,
        point.forkNodeId,
      )
    ) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "The selected decision is not available for counterfactual replay.",
      );
    }
    const alternativeConditionValue =
      conditionPoint?.configuration.allowedValues.find(
        (candidate) =>
          candidate.conditionValueId ===
          body.conditionValueId,
      );
    if (
      counterfactualType === "CONDITION" &&
      (conditionPoint === undefined ||
        alternativeConditionValue === undefined ||
        alternativeConditionValue.conditionValueId ===
          conditionPoint.originalConditionValueId)
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "A condition counterfactual requires one different author-approved value.",
      );
    }
    const conditionIntervention =
      conditionPoint === undefined ||
      alternativeConditionValue === undefined
        ? undefined
        : {
            conditionId:
              conditionPoint.configuration.conditionId,
            runtimeConditionKey:
              conditionPoint.configuration.runtimeConditionKey,
            originalValueId:
              conditionPoint.originalConditionValueId,
            alternativeValueId:
              alternativeConditionValue.conditionValueId,
            runtimeValue: alternativeConditionValue.runtimeValue,
            affectsInformationBeforeFork:
              conditionPoint.configuration
                .affectsInformationBeforeFork,
          };
    const branchRunId = requiredText(
      body.branchRunId,
      "branchRunId",
    );
    const repository = new D1CounterfactualRunRepository(
      environment.DB,
    );
    const existing = await repository.find(branchRunId);
    if (existing === null) {
      const priorBranches = await repository.listBySourceRun(
        createCounterfactualRunId,
      );
      const creatorBranches = priorBranches.filter(
        (metadata) =>
          metadata.createdByUserId === actor.userId &&
          metadata.forkNodeId === point.forkNodeId &&
          metadata.counterfactualType === counterfactualType &&
          (counterfactualType === "DECISION" ||
            metadata.conditionIntervention?.conditionId ===
              conditionPoint?.configuration.conditionId),
      );
      const maximum = Math.min(
        point.configuration.maxBranchesPerLearner ?? 20,
        context.assignment.counterfactualReplay
          .maximumBranchesPerLearner,
      );
      if (creatorBranches.length >= maximum) {
        throw new HostedRunCommandError(
          "WORKFLOW_PRECONDITION_FAILED",
          "The authored counterfactual branch limit has been reached.",
        );
      }
    }
    const interventionId = requiredText(
      body.interventionId,
      "interventionId",
    );
    const result = await context.service.createCounterfactualBranch(
      actor,
      {
        branchRunId,
        sourceRunId: createCounterfactualRunId,
        forkSequenceNumber,
        forkNodeId,
        interventionId,
        comparisonMode: "SINGLE_INTERVENTION",
        createdByUserId: actor.userId,
        createdAt:
          existing?.createdAt ?? new SystemUtcClock().now(),
        ...(conditionIntervention === undefined
          ? {}
          : { conditionIntervention }),
      },
    );
    if (counterfactualType === "CONDITION") {
      const sourceDecision = sourceDecisionCommandAtFork(
        sourceEvents,
        forkSequenceNumber,
      );
      const replayCommand =
        sourceDecision === null
          ? null
          : commandForCounterfactualReplay(
              sourceDecision,
              branchRunId,
              0,
            );
      if (replayCommand === null || conditionPoint === undefined) {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "The condition fork does not retain its original decision command.",
        );
      }
      const interventionCommand = {
        ...replayCommand,
        commandId: interventionId,
      } as HostedRuntimeCommand;
      validateConditionDecisionReuse(
        conditionPoint,
        interventionCommand,
      );
      await context.service.submitCounterfactual(
        actor,
        interventionCommand,
      );
    }
    return jsonResponse(
      result.wasIdempotentReplay ? 200 : 201,
      {
        counterfactual: result.metadata,
        projection:
          await context.service.counterfactualProjection(
            actor,
            branchRunId,
          ),
        wasIdempotentReplay: result.wasIdempotentReplay,
      },
    );
  }

  const counterfactualId = pathCounterfactualId(url.pathname);
  if (
    counterfactualId !== null &&
    request.method === "GET"
  ) {
    const actor = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "administrator",
    ]);
    const repository = new D1CounterfactualRunRepository(
      environment.DB,
    );
    const metadata = await repository.find(counterfactualId);
    if (metadata === null) {
      throw new CounterfactualBranchError(
        "COUNTERFACTUAL_BRANCH_NOT_FOUND",
        `Counterfactual branch ${counterfactualId} does not exist.`,
      );
    }
    const context = await counterfactualSourceContext(
      environment,
      actor,
      metadata.sourceRunId,
    );
    return jsonResponse(200, {
      counterfactual: metadata,
      projection:
        await context.service.counterfactualProjection(
          actor,
          counterfactualId,
        ),
      reflection:
        await new D1CounterfactualReflectionRepository(
          environment.DB,
        ).find(counterfactualId),
    });
  }

  const counterfactualCommandId = pathCounterfactualId(
    url.pathname,
    "commands",
  );
  if (
    counterfactualCommandId !== null &&
    request.method === "POST"
  ) {
    const actor = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (
      !isRecord(body) ||
      requiredText(body.runId, "runId") !==
        counterfactualCommandId
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Counterfactual command run ID must match the API route.",
      );
    }
    const repository = new D1CounterfactualRunRepository(
      environment.DB,
    );
    const metadata = await repository.find(
      counterfactualCommandId,
    );
    if (metadata === null) {
      throw new CounterfactualBranchError(
        "COUNTERFACTUAL_BRANCH_NOT_FOUND",
        `Counterfactual branch ${counterfactualCommandId} does not exist.`,
      );
    }
    const context = await counterfactualSourceContext(
      environment,
      actor,
      metadata.sourceRunId,
    );
    const branchEvents = await context.store.load(
      counterfactualCommandId,
    );
    if (branchEvents.length === 0) {
      const sourceEvents = await context.store.load(
        metadata.sourceRunId,
      );
      const point = counterfactualDecisionPoints({
        pack: context.pack,
        sourceRunId: metadata.sourceRunId,
        events: sourceEvents,
      }).find(
        (candidate) =>
          candidate.forkSequenceNumber ===
            metadata.forkSequenceNumber &&
          candidate.forkNodeId === metadata.forkNodeId,
      );
      if (
        point === undefined ||
        !counterfactualPointIsAvailable(
          point.configuration,
          context.creatorType,
          context.assignment.feedbackReleaseStatus === "released",
          context.assignment.counterfactualReplay,
          point.forkNodeId,
        )
      ) {
        throw new HostedRunCommandError(
          "WORKFLOW_PRECONDITION_FAILED",
          "The branch intervention is no longer available.",
        );
      }
      if (
        requiredText(body.commandId, "commandId") !==
        metadata.interventionId
      ) {
        throw new HostedRunCommandError(
          "INVALID_COMMAND",
          "The first branch command must use the recorded intervention ID.",
        );
      }
      const command = body as unknown as HostedRuntimeCommand;
      if (metadata.counterfactualType === "CONDITION") {
        const conditionPoint = counterfactualConditionPoints({
          pack: context.pack,
          sourceRunId: metadata.sourceRunId,
          events: sourceEvents,
        }).find(
          (candidate) =>
            candidate.forkNodeId === metadata.forkNodeId &&
            candidate.configuration.conditionId ===
              metadata.conditionIntervention?.conditionId,
        );
        if (
          conditionPoint === undefined ||
          !counterfactualPointIsAvailable(
            conditionPoint.configuration,
            context.creatorType,
            context.assignment.feedbackReleaseStatus ===
              "released",
            context.assignment.counterfactualReplay,
            conditionPoint.forkNodeId,
          )
        ) {
          throw new HostedRunCommandError(
            "WORKFLOW_PRECONDITION_FAILED",
            "The condition intervention is no longer available.",
          );
        }
        validateConditionDecisionReuse(conditionPoint, command);
      } else {
        validateCounterfactualIntervention(point, command);
      }
    }
    const result = await context.service.submitCounterfactual(
      actor,
      body as unknown as HostedRuntimeCommand,
    );
    return jsonResponse(200, {
      counterfactual: metadata,
      projection:
        await context.service.counterfactualProjection(
          actor,
          counterfactualCommandId,
        ),
      appendedEventIds: result.appendedEventIds,
      wasIdempotentReplay: result.wasIdempotentReplay,
      officialGradeChanged: false,
    });
  }

  const completeCounterfactualId = pathCounterfactualId(
    url.pathname,
    "complete",
  );
  if (
    completeCounterfactualId !== null &&
    request.method === "POST"
  ) {
    const actor = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "administrator",
    ]);
    const repository = new D1CounterfactualRunRepository(
      environment.DB,
    );
    const metadata = await repository.find(
      completeCounterfactualId,
    );
    if (metadata === null) {
      throw new CounterfactualBranchError(
        "COUNTERFACTUAL_BRANCH_NOT_FOUND",
        `Counterfactual branch ${completeCounterfactualId} does not exist.`,
      );
    }
    const context = await counterfactualSourceContext(
      environment,
      actor,
      metadata.sourceRunId,
    );
    const sourceEvents = await context.store.load(
      metadata.sourceRunId,
    );
    let branchEvents = await context.store.load(
      completeCounterfactualId,
    );
    if (branchEvents.length === 0) {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "Submit the alternative decision before replaying the downstream path.",
      );
    }
    const sourceBatches = sourceCommandBatchesAfterFork(
      sourceEvents,
      metadata.forkSequenceNumber,
    );
    const sourceCommandIds = new Set(
      sourceBatches.map((batch) => batch.commandId),
    );
    const branchCommandIds = new Set(
      branchEvents.map((event) => event.causationId),
    );
    const manuallyChangedLaterDecision = [...branchCommandIds].some(
      (commandId) =>
        commandId !== metadata.interventionId &&
        !sourceCommandIds.has(commandId),
    );
    const reusedCommandIds: string[] = [];
    let paused:
      | {
          readonly sourceCommandId: string;
          readonly commandType: string | null;
          readonly reasonCode: string;
        }
      | null = null;
    let branchState = await context.service.loadState(
      completeCounterfactualId,
    );
    for (const batch of sourceBatches) {
      if (branchState.status === "completed") break;
      if (branchCommandIds.has(batch.commandId)) {
        reusedCommandIds.push(batch.commandId);
        continue;
      }
      const replayedCommand = commandForCounterfactualReplay(
        batch,
        completeCounterfactualId,
        branchState.version,
      );
      if (replayedCommand === null) {
        throw new HostedRunCommandError(
          "PACK_CONTRACT_MISMATCH",
          "A current hosted source run is missing its normalized replay command.",
        );
      }
      try {
        const result =
          await context.service.submitCounterfactual(
            actor,
            replayedCommand,
          );
        branchState = result.state;
        reusedCommandIds.push(batch.commandId);
        branchCommandIds.add(batch.commandId);
      } catch (error) {
        if (
          error instanceof HostedRunCommandError &&
          error.code === "WORKFLOW_PRECONDITION_FAILED"
        ) {
          paused = {
            sourceCommandId: batch.commandId,
            commandType: batch.commandType,
            reasonCode: error.code,
          };
          break;
        }
        throw error;
      }
    }
    branchEvents = await context.store.load(
      completeCounterfactualId,
    );
    const projection =
      await context.service.counterfactualProjection(
        actor,
        completeCounterfactualId,
      );
    const classification =
      manuallyChangedLaterDecision || paused !== null
        ? "EXPLORATORY_BRANCH"
        : "SINGLE_INTERVENTION";
    return jsonResponse(200, {
      counterfactual: metadata,
      status:
        projection.workflowState.permittedActionIds.length === 0 &&
        branchState.status === "completed"
          ? "completed"
          : "paused",
      classification,
      replayedCommandIds: reusedCommandIds,
      paused,
      projection,
      branchEventCount: branchEvents.length,
      originalAssessedResultPreserved: true,
      officialGradeChanged: false,
    });
  }

  const compareCounterfactualId = pathCounterfactualId(
    url.pathname,
    "comparison",
  );
  if (
    compareCounterfactualId !== null &&
    request.method === "GET"
  ) {
    const actor = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "administrator",
    ]);
    const repository = new D1CounterfactualRunRepository(
      environment.DB,
    );
    const metadata = await repository.find(
      compareCounterfactualId,
    );
    if (metadata === null) {
      throw new CounterfactualBranchError(
        "COUNTERFACTUAL_BRANCH_NOT_FOUND",
        `Counterfactual branch ${compareCounterfactualId} does not exist.`,
      );
    }
    const result = await loadCounterfactualComparison({
      environment,
      actor,
      metadata,
    });
    return jsonResponse(200, {
      comparison: result.comparison,
      reflection: result.reflection,
    });
  }

  const jsonCounterfactualExportId = pathCounterfactualId(
    url.pathname,
    "export.json",
  );
  const csvCounterfactualExportId = pathCounterfactualId(
    url.pathname,
    "export.csv",
  );
  const exportCounterfactualId =
    jsonCounterfactualExportId ?? csvCounterfactualExportId;
  if (
    exportCounterfactualId !== null &&
    request.method === "GET"
  ) {
    const actor = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "administrator",
    ]);
    const metadata =
      await new D1CounterfactualRunRepository(
        environment.DB,
      ).find(exportCounterfactualId);
    if (metadata === null) {
      throw new CounterfactualBranchError(
        "COUNTERFACTUAL_BRANCH_NOT_FOUND",
        `Counterfactual branch ${exportCounterfactualId} does not exist.`,
      );
    }
    const result = await loadCounterfactualComparison({
      environment,
      actor,
      metadata,
    });
    const exported = createCounterfactualComparisonExport({
      metadata,
      comparison: result.comparison,
      reflection: result.reflection,
      generatedAt: new SystemUtcClock().now(),
    });
    if (jsonCounterfactualExportId !== null) {
      return downloadResponse(
        serializeCounterfactualComparisonJson(exported),
        "application/json; charset=utf-8",
        counterfactualComparisonFilename(
          exportCounterfactualId,
          "json",
        ),
      );
    }
    return downloadResponse(
      serializeCounterfactualComparisonCsv(exported),
      "text/csv; charset=utf-8",
      counterfactualComparisonFilename(
        exportCounterfactualId,
        "csv",
      ),
    );
  }

  const reflectCounterfactualId = pathCounterfactualId(
    url.pathname,
    "reflection",
  );
  if (
    reflectCounterfactualId !== null &&
    request.method === "POST"
  ) {
    const actor = requireApplicationRole(principal, [
      "learner",
      "instructor",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (!isRecord(body)) {
      throw new CounterfactualReflectionRepositoryError(
        "INVALID_COUNTERFACTUAL_REFLECTION",
        "A reflection request object is required.",
      );
    }
    const branchRepository = new D1CounterfactualRunRepository(
      environment.DB,
    );
    const metadata = await branchRepository.find(
      reflectCounterfactualId,
    );
    if (metadata === null) {
      throw new CounterfactualBranchError(
        "COUNTERFACTUAL_BRANCH_NOT_FOUND",
        `Counterfactual branch ${reflectCounterfactualId} does not exist.`,
      );
    }
    const context = await counterfactualSourceContext(
      environment,
      actor,
      metadata.sourceRunId,
    );
    const branchState = await context.service.loadState(
      reflectCounterfactualId,
    );
    if (branchState.status !== "completed") {
      throw new HostedRunCommandError(
        "WORKFLOW_PRECONDITION_FAILED",
        "Complete the exploratory branch before submitting its reflection.",
      );
    }
    const response = normalizeCounterfactualReflectionResponse(
      body.response,
    );
    const result =
      await new D1CounterfactualReflectionRepository(
        environment.DB,
      ).create({
        schemaVersion: "1.0.0",
        reflectionId: requiredText(
          body.reflectionId,
          "reflectionId",
        ),
        branchRunId: reflectCounterfactualId,
        response,
        submittedByUserId: actor.userId,
        submittedAt: new SystemUtcClock().now(),
      });
    return jsonResponse(
      result.wasIdempotentReplay ? 200 : 201,
      {
        reflection: result.reflection,
        wasIdempotentReplay: result.wasIdempotentReplay,
        officialGradeChanged: false,
      },
    );
  }

  const instructorIncidentRunId = pathRunId(
    url.pathname,
    "instructor-incidents",
  );
  if (
    instructorIncidentRunId !== null &&
    (request.method === "GET" || request.method === "POST")
  ) {
    const actor = requireApplicationRole(principal, [
      "instructor",
      "administrator",
    ]);
    const assignment =
      await new D1AssignmentRepository(
        environment.DB,
        new SystemUtcClock(),
      ).findForRun(instructorIncidentRunId);
    if (
      assignment === null ||
      (!actor.roles.includes("administrator") &&
        assignment.createdByUserId !== actor.userId)
    ) {
      throw new HostedAuthorizationError(
        "RUN_ACCESS_DENIED",
        "The run is outside the instructor's assignment scope.",
      );
    }
    const { service } = await hostedServiceForRun(
      environment,
      actor.userId,
      instructorIncidentRunId,
    );
    if (request.method === "GET") {
      const state = await service.loadState(instructorIncidentRunId);
      return jsonResponse(200, {
        director: {
          schemaVersion: "1.0.0",
          runId: instructorIncidentRunId,
          runVersion: state.version,
          incidents: await service.instructorIncidents(
            actor,
            instructorIncidentRunId,
          ),
        },
      });
    }
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (
      !isRecord(body) ||
      requiredText(body.runId, "runId") !==
        instructorIncidentRunId
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Instructor incident run ID must match the API route.",
      );
    }
    const result = await service.releaseInstructorIncident(actor, {
      commandId: requiredText(body.commandId, "commandId"),
      runId: instructorIncidentRunId,
      expectedRunVersion: Number(body.expectedRunVersion),
      incidentId: requiredText(body.incidentId, "incidentId"),
    });
    return jsonResponse(200, {
      appendedEventIds: result.appendedEventIds,
      wasIdempotentReplay: result.wasIdempotentReplay,
    });
  }

  const commandRunId = pathRunId(url.pathname, "commands");
  if (request.method === "POST" && commandRunId !== null) {
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (
      !isRecord(body) ||
      requiredText(body.runId, "runId") !== commandRunId
    ) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Command run ID must match the API route.",
      );
    }
    const store = new D1RunEventStore(environment.DB);
    const events = await store.load(commandRunId);
    const first = events[0];
    if (first === undefined) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        `Run ${commandRunId} does not exist.`,
      );
    }
    const pack = await findHostedContentPack(
      environment,
      principal.userId,
      first.packId,
      first.packVersion,
    );
    if (pack === null) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The run's exact published scenario pack is unavailable.",
      );
    }
    const service = createHostedRuntimeService({
      pack,
      scenarioId: first.scenarioId,
      scenarioVersion: first.scenarioVersion,
      eventStore: store,
      clock: new SystemUtcClock(),
      ids: new WebCryptoIdGenerator(),
    });
    const result = await service.submit(
      principal,
      body as unknown as HostedRuntimeCommand,
    );
    const ltiGradeReturn =
      result.state.status === "completed" &&
      principal.authenticationSource === "lti" &&
      sessionToken !== null
        ? await deliverCompletedRunToLtiAgs({
            environment,
            sessionToken,
            runId: commandRunId,
            service,
            assignmentId: result.state.assignmentId,
          })
        : undefined;
    return jsonResponse(200, {
      projection: await service.learnerProjection(
        principal,
        commandRunId,
      ),
      appendedEventIds: result.appendedEventIds,
      wasIdempotentReplay: result.wasIdempotentReplay,
      ...(ltiGradeReturn === undefined
        ? {}
        : { ltiGradeReturn }),
    });
  }

  const runAsset = pathRunAsset(url.pathname);
  if (request.method === "GET" && runAsset !== null) {
    const { pack, service } = await hostedServiceForRun(
      environment,
      principal.userId,
      runAsset.runId,
    );
    const projection = await service.learnerProjection(
      principal,
      runAsset.runId,
    );
    const allowedAssetIds = new Set([
      projection.staffProfile?.portraitAssetId,
      projection.presentation?.currentNode.image?.assetId,
      ...Object.values(
        projection.presentation?.evidenceImages ?? {},
      ).map((image) => image.assetId),
    ]);
    if (!allowedAssetIds.has(runAsset.assetId)) {
      throw new HostedAuthorizationError(
        "RUN_ACCESS_DENIED",
        "The scenario image is not visible in the learner's current run projection.",
      );
    }
    const image = pack.imageAssets.find(
      (candidate) => candidate.assetId === runAsset.assetId,
    );
    if (image === undefined) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The visible scenario image is absent from the exact pack.",
      );
    }
    const bytes = await scenarioImageBytes(request, environment, image);
    if (bytes === null) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The visible scenario image does not match the exact pack.",
      );
    }
    return withSecurityHeaders(
      new Response(Uint8Array.from(bytes).buffer, {
        status: 200,
        headers: {
          "cache-control": "private, no-store",
          "content-length": String(bytes.byteLength),
          "content-type": image.mimeType,
          "x-content-sha256": image.sha256,
        },
      }),
    );
  }

  const learnerRunId = pathRunId(url.pathname);
  const runId =
    learnerRunId ??
    pathRunId(url.pathname, "timeline") ??
    pathRunId(url.pathname, "replay") ??
    pathRunId(url.pathname, "competencies") ??
    pathRunId(url.pathname, "rubric-evidence");
  if (request.method === "GET" && runId !== null) {
    const store = new D1RunEventStore(environment.DB);
    const events = await store.load(runId);
    const first = events[0];
    if (first === undefined) {
      throw new HostedRunCommandError(
        "RUN_NOT_FOUND",
        `Run ${runId} does not exist.`,
      );
    }
    /*
     * The bare run path is the learner's own projection, which the runtime
     * scopes to the assigned learner. Every suffix below it is a staff view of
     * that learner's evidence: the role decides whether the caller may hold
     * such a view at all, and the assignment scope decides which ones. Asking
     * in that order keeps a learner's refusal about their role rather than
     * about someone else's assignment.
     */
    if (learnerRunId === null) {
      requireApplicationRole(principal, [
        "instructor",
        "rater",
        "administrator",
      ]);
      await assertScopedRunAssignment(
        environment,
        principal,
        runId,
        { allowAssignedRater: true },
      );
    }
    const pack = await findHostedContentPack(
      environment,
      principal.userId,
      first.packId,
      first.packVersion,
    );
    if (pack === null) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The run's exact published scenario pack is unavailable.",
      );
    }
    const service = createHostedRuntimeService({
      pack,
      scenarioId: first.scenarioId,
      scenarioVersion: first.scenarioVersion,
      eventStore: store,
      clock: new SystemUtcClock(),
      ids: new WebCryptoIdGenerator(),
    });
    if (url.pathname.endsWith("/timeline")) {
      return jsonResponse(200, {
        timeline: await service.instructorTimeline(principal, runId),
      });
    }
    if (url.pathname.endsWith("/replay")) {
      const requestedSequence = url.searchParams.get("sequence");
      return jsonResponse(200, {
        replay: await service.instructorReplay(
          principal,
          runId,
          requestedSequence === null
            ? undefined
            : Number(requestedSequence),
        ),
      });
    }
    if (url.pathname.endsWith("/competencies")) {
      return jsonResponse(200, {
        competencies: await service.competencyReport(principal, runId),
      });
    }
    if (url.pathname.endsWith("/rubric-evidence")) {
      return jsonResponse(200, {
        rubricEvidence: await service.rubricEvidence(principal, runId),
      });
    }
    return jsonResponse(200, {
      projection: await service.learnerProjection(principal, runId),
    });
  }

  return jsonResponse(404, {
    error: {
      code: "API_ROUTE_NOT_FOUND",
    },
  });
}

const worker = {
  async fetch(
    request: Request,
    environment: WorkerEnvironment,
  ): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith(LTI_API_PREFIX)) {
      try {
        return await ltiResponse(request, environment);
      } catch (error) {
        return ltiErrorResponse(request, error);
      }
    }
    if (pathname.startsWith(API_PREFIX)) {
      try {
        return await apiResponse(request, environment);
      } catch (error) {
        return errorResponse(error);
      }
    }

    if (isHostedAppRoute(request)) {
      const indexUrl = new URL("/index.html", request.url);
      return withSecurityHeaders(
        await environment.ASSETS.fetch(
          new Request(indexUrl, request),
        ),
      );
    }

    const assetResponse = await environment.ASSETS.fetch(request);
    if (
      !shouldServeAppShell(request) ||
      !isAppShellFallbackResponse(assetResponse)
    ) {
      return withSecurityHeaders(assetResponse);
    }
    const indexUrl = new URL("/index.html", request.url);
    const indexRequest = new Request(indexUrl, request);
    return withSecurityHeaders(
      await environment.ASSETS.fetch(indexRequest),
    );
  },
};

export default worker;
