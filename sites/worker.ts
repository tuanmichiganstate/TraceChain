import type { ScenarioPackV1 } from "../src/platform/contracts/scenario-pack";
import type {
  CreateHostedAssignmentRequest,
  HostedAssignmentLearnerOptionV1,
  HostedAssignmentScenarioOptionV1,
  HostedAssignmentMonitorV1,
  HostedRunMonitorV1,
} from "../src/platform/contracts/assessment";
import type {
  HostedAssignmentDecisionOutcomeReportV1,
} from "../src/platform/contracts/decision-outcome-report";
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
import type { ApplicationRole } from "../src/platform/contracts/run-events";
import en from "../src/locales/en.json";
import vi from "../src/locales/vi.json";
import {
  AuthenticatedPrincipalError,
  AUTHENTICATED_USER_EMAIL_HEADER,
  resolveAuthenticatedPrincipal,
} from "../src/platform/hosted/authenticated-principal";
import { provisionBootstrapAdministrator } from "../src/platform/hosted/bootstrap-principal";
import {
  HostedAuthorizationError,
  requireAssignedLearner,
  requireApplicationRole,
} from "../src/platform/hosted/access";
import {
  SystemUtcClock,
  WebCryptoIdGenerator,
} from "../src/platform/hosted/server-environment";
import {
  HostedRunCommandError,
  HostedStage3RunService,
} from "../src/platform/hosted/stage3-run-service";
import type {
  CreateHostedStage3RunRequest,
  HostedStage3Command,
} from "../src/platform/hosted/stage3-types";
import { D1ApplicationPrincipalRepository } from "../src/platform/persistence/d1-principal-repository";
import {
  ApplicationAccessRepositoryError,
  D1ApplicationAccessRepository,
} from "../src/platform/persistence/d1-application-access-repository";
import {
  AssignmentRepositoryError,
  D1AssignmentRepository,
} from "../src/platform/persistence/d1-assignment-repository";
import { D1RunEventStore } from "../src/platform/persistence/d1-run-event-store";
import { ensureD1FoundationSchema } from "../src/platform/persistence/d1-schema";
import { D1ScenarioPackRepository } from "../src/platform/persistence/d1-scenario-pack-repository";
import {
  D1ScormPackageJobRepository,
  ScormPackageJobRepositoryError,
} from "../src/platform/persistence/d1-scorm-package-job-repository";
import type { D1DatabaseLike } from "../src/platform/persistence/d1-types";
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
  AssignmentCompetencyReportError,
  createAssignmentCompetencyReport,
  createLearnerCompetencyProfile,
} from "../src/platform/reporting/assignment-competency-report";
import { modeConfigurationFor } from "../src/platform/runs/mode-configuration";
import { assignmentStartAvailability } from "../src/platform/runs/assignment-availability";
import { ScenarioPackPublicationError } from "../src/platform/scenario-packs/publication";
import {
  compareScenarioPackVersions,
  createScenarioRolePreview,
  ScenarioAuthoringError,
  scenarioPackValidationReport,
} from "../src/platform/scenario-packs/authoring";
import { hasRegisteredHostedRuntime } from "../src/platform/hosted/runtime-registry";

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface R2ObjectBodyLike {
  readonly body: ReadableStream<Uint8Array> | null;
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
}

const securityHeaders = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
};

const API_PREFIX = "/api/v1/";
const MAXIMUM_COMMAND_BYTES = 64 * 1024;
const MAXIMUM_PACK_BYTES = 2 * 1024 * 1024;
const MAXIMUM_SCORM_ARTIFACT_BYTES = 25 * 1024 * 1024;
const scenarioPackCatalogs = { en, vi } as const;

function assignmentOptionLabels(
  pack: ScenarioPackV1,
  packTitleKey: string,
  scenarioTitleKey: string,
): HostedAssignmentScenarioOptionV1["labelsByLocale"] {
  return Object.fromEntries(
    pack.supportedLocales.map((locale) => {
      const bundledCatalog: Readonly<Record<string, string>> | undefined =
        locale === "en" ? en : locale === "vi" ? vi : undefined;
      const catalog =
        pack.localizationCatalogs?.[locale] ?? bundledCatalog;
      return [
        locale,
        {
          packTitle: catalog?.[packTitleKey] ?? packTitleKey,
          scenarioTitle:
            catalog?.[scenarioTitleKey] ?? scenarioTitleKey,
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
  if (error instanceof AssignmentExportError) {
    return jsonResponse(500, {
      error: { code: error.code },
    });
  }
  if (error instanceof AssignmentCompetencyReportError) {
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
    catalog.schemaVersion !== "1.0.0" ||
    !Array.isArray(catalog.packages)
  ) {
    throw new ScormPackageJobRepositoryError(
      "PACKAGE_JOB_STORAGE_FAILED",
      "The generated SCORM package catalog is invalid.",
    );
  }
  return catalog;
}

async function hostedServiceForRun(
  environment: WorkerEnvironment,
  principalUserId: string,
  runId: string,
): Promise<{
  readonly pack: ScenarioPackV1;
  readonly service: HostedStage3RunService;
}> {
  const store = new D1RunEventStore(environment.DB);
  const events = await store.load(runId);
  const first = events[0];
  if (first === undefined) {
    throw new HostedRunCommandError(
      "RUN_NOT_FOUND",
      `Run ${runId} does not exist.`,
    );
  }
  const clock = new SystemUtcClock();
  const pack = await new D1ScenarioPackRepository(
    environment.DB,
    clock,
    principalUserId,
  ).find(first.packId, first.packVersion);
  if (pack === null) {
    throw new HostedRunCommandError(
      "PACK_CONTRACT_MISMATCH",
      "The run's exact published scenario pack is unavailable.",
    );
  }
  return {
    pack,
    service: new HostedStage3RunService(
      pack,
      store,
      clock,
      new WebCryptoIdGenerator(),
    ),
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
  let principal;
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
        clock: new SystemUtcClock(),
      }))
    ) {
      throw error;
    }
    principal = await resolveAuthenticatedPrincipal(
      request,
      principalRepository,
    );
  }
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/api/v1/session") {
    return jsonResponse(200, {
      userId: principal.userId,
      email: principal.email,
      roles: principal.roles,
    });
  }

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
    return jsonResponse(200, { assignments });
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
    const pack = body.pack as ScenarioPackV1;
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
    const published = await new D1ScenarioPackRepository(
      environment.DB,
      clock,
      principal.userId,
    ).publish(publishPackVersion.packId, publishPackVersion.version, {
      publishedAt: clock.now(),
      publishedBy: principal.userId,
    });
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
    const pack = body.pack as unknown as ScenarioPackV1;
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
    const options: HostedAssignmentScenarioOptionV1[] =
      publishedPacks.flatMap((pack) =>
        pack === null || pack.status !== "published"
          ? []
          : pack.scenarios
              .filter(hasRegisteredHostedRuntime)
              .map((scenario) => ({
                schemaVersion: "1.0.0",
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
                  pack.manifest.title.localizationKey,
                  scenario.title.localizationKey,
                ),
                supportedModes: scenario.supportedModes,
                modeConfigurations: scenario.supportedModes.map(
                  (mode) => modeConfigurationFor(scenario, mode),
                ),
              })),
      );
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
    const learners: HostedAssignmentLearnerOptionV1[] = (
      await new D1ApplicationAccessRepository(
        environment.DB,
        new SystemUtcClock(),
      ).list()
    )
      .filter(
        (user) =>
          user.status === "active" &&
          user.roles.includes("learner"),
      )
      .map<HostedAssignmentLearnerOptionV1>((user) => ({
        schemaVersion: "1.0.0",
        userId: user.userId,
        email: user.email,
      }))
      .sort((left, right) => {
        const leftKey = `${left.email}\u0000${left.userId}`;
        const rightKey = `${right.email}\u0000${right.userId}`;
        return leftKey < rightKey
          ? -1
          : leftKey > rightKey
            ? 1
            : 0;
      });
    return jsonResponse(200, { learners });
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
    const publishedPack = await new D1ScenarioPackRepository(
      environment.DB,
      clock,
      principal.userId,
    ).find(packId, packVersion);
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
    const result = await new D1AssignmentRepository(
      environment.DB,
      clock,
    ).create(
      {
        ...(body as unknown as CreateHostedAssignmentRequest),
        mode,
        runConfiguration: modeConfigurationFor(scenario, mode),
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
    return jsonResponse(200, { assignment });
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
    const pack = await new D1ScenarioPackRepository(
      environment.DB,
      clock,
      principal.userId,
    ).find(assignment.packId, assignment.packVersion);
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
    const result = await new HostedStage3RunService(
      pack,
      new D1RunEventStore(environment.DB),
      clock,
      new WebCryptoIdGenerator(),
    ).createRun(principal, {
      commandId: requiredText(body.commandId, "commandId"),
      runId: requiredText(body.runId, "runId"),
      assignmentId: assignment.assignmentId,
      learnerUserId,
      mode: assignment.mode,
      modeConfiguration: assignment.runConfiguration,
      ...(assignment.runConfiguration.seedPolicy === "generated"
        ? {}
        : {
            scenarioSeed: runCreator.roles.includes("learner")
              ? `assignment:${assignment.assignmentId}:${learnerUserId}`
              : requiredText(body.scenarioSeed, "scenarioSeed"),
          }),
      caseVariant: runCreator.roles.includes("learner")
        ? (
            assignment.runConfiguration.forcedOutcomeCode ??
            "authorized-certifier"
          ) as CreateHostedStage3RunRequest["caseVariant"]
        : requiredText(
            body.caseVariant,
            "caseVariant",
          ) as CreateHostedStage3RunRequest["caseVariant"],
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
    const report = await new D1AssignmentRepository(
      environment.DB,
      new SystemUtcClock(),
    ).report(reportAssignmentId);
    return jsonResponse(200, { report });
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
    const report = await repository.report(
      decisionOutcomeAssignmentId,
    );
    const pack = await new D1ScenarioPackRepository(
      environment.DB,
      clock,
      principal.userId,
    ).find(
      report.assignment.packId,
      report.assignment.packVersion,
    );
    if (pack === null || pack.status !== "published") {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Decision reporting requires the assignment's exact published pack.",
      );
    }
    const service = new HostedStage3RunService(
      pack,
      new D1RunEventStore(environment.DB),
      clock,
      new WebCryptoIdGenerator(),
    );
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
    const report = await repository.report(monitorAssignmentId);
    const pack = await new D1ScenarioPackRepository(
      environment.DB,
      clock,
      principal.userId,
    ).find(
      report.assignment.packId,
      report.assignment.packVersion,
    );
    if (pack === null || pack.status !== "published") {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Live monitoring requires the assignment's exact published pack.",
      );
    }
    const service = new HostedStage3RunService(
      pack,
      new D1RunEventStore(environment.DB),
      clock,
      new WebCryptoIdGenerator(),
    );
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
    const report = await repository.report(competencyAssignmentId);
    const pack = await new D1ScenarioPackRepository(
      environment.DB,
      clock,
      principal.userId,
    ).find(
      report.assignment.packId,
      report.assignment.packVersion,
    );
    if (pack === null || pack.status !== "published") {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Competency reporting requires the assignment's exact published pack.",
      );
    }
    const service = new HostedStage3RunService(
      pack,
      new D1RunEventStore(environment.DB),
      clock,
      new WebCryptoIdGenerator(),
    );
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
    const identityMode = assignmentExportIdentityMode(url);
    const report = await repository.report(exportAssignmentId);
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
    const assignment = await repository.findForRun(ratingRunId);
    if (assignment === null) {
      throw new AssignmentRepositoryError(
        "RUN_NOT_ASSIGNED",
        "Run is not linked to an assignment.",
      );
    }
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
      ratings: await repository.currentRatings(feedbackRunId),
      moderationResolutions:
        await repository.currentModerationResolutions(feedbackRunId),
      competencyProfile,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/runs") {
    requireApplicationRole(principal, [
      "instructor",
      "scenario-author",
      "administrator",
    ]);
    const body = await readJson(request, MAXIMUM_COMMAND_BYTES);
    if (!isRecord(body) || !isRecord(body.command)) {
      throw new HostedRunCommandError(
        "INVALID_COMMAND",
        "Run request must contain a command object.",
      );
    }
    const packId = requiredText(body.packId, "packId");
    const packVersion = requiredText(body.packVersion, "packVersion");
    const packRepository = new D1ScenarioPackRepository(
      environment.DB,
      new SystemUtcClock(),
      principal.userId,
    );
    const pack = await packRepository.find(packId, packVersion);
    if (pack === null || pack.status !== "published") {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "Run creation requires an exact published scenario pack.",
      );
    }
    const service = new HostedStage3RunService(
      pack,
      new D1RunEventStore(environment.DB),
      new SystemUtcClock(),
      new WebCryptoIdGenerator(),
    );
    const result = await service.createRun(
      principal,
      body.command as unknown as CreateHostedStage3RunRequest,
    );
    return jsonResponse(201, {
      runId: result.state.runId,
      version: result.state.version,
      status: result.state.status,
      packId: result.state.packId,
      packVersion: result.state.packVersion,
      scenarioId: result.state.scenarioId,
      scenarioVersion: result.state.scenarioVersion,
      learnerUserId: result.state.learnerUserId,
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
    const packRepository = new D1ScenarioPackRepository(
      environment.DB,
      new SystemUtcClock(),
      principal.userId,
    );
    const pack = await packRepository.find(
      first.packId,
      first.packVersion,
    );
    if (pack === null) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The run's exact published scenario pack is unavailable.",
      );
    }
    const service = new HostedStage3RunService(
      pack,
      store,
      new SystemUtcClock(),
      new WebCryptoIdGenerator(),
    );
    const result = await service.submit(
      principal,
      body as unknown as HostedStage3Command,
    );
    return jsonResponse(200, {
      projection: await service.learnerProjection(
        principal,
        commandRunId,
      ),
      appendedEventIds: result.appendedEventIds,
      wasIdempotentReplay: result.wasIdempotentReplay,
    });
  }

  const runId =
    pathRunId(url.pathname) ??
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
    const pack = await new D1ScenarioPackRepository(
      environment.DB,
      new SystemUtcClock(),
      principal.userId,
    ).find(first.packId, first.packVersion);
    if (pack === null) {
      throw new HostedRunCommandError(
        "PACK_CONTRACT_MISMATCH",
        "The run's exact published scenario pack is unavailable.",
      );
    }
    const service = new HostedStage3RunService(
      pack,
      store,
      new SystemUtcClock(),
      new WebCryptoIdGenerator(),
    );
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
    if (pathname.startsWith(API_PREFIX)) {
      try {
        return await apiResponse(request, environment);
      } catch (error) {
        return errorResponse(error);
      }
    }

    const assetResponse = await environment.ASSETS.fetch(request);
    if (
      assetResponse.status !== 404 ||
      !shouldServeAppShell(request)
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
