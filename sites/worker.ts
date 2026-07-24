import type { ScenarioPackV1 } from "../src/platform/contracts/scenario-pack";
import {
  AuthenticatedPrincipalError,
  AUTHENTICATED_USER_EMAIL_HEADER,
  resolveAuthenticatedPrincipal,
} from "../src/platform/hosted/authenticated-principal";
import { provisionBootstrapAdministrator } from "../src/platform/hosted/bootstrap-principal";
import {
  HostedAuthorizationError,
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
import { D1RunEventStore } from "../src/platform/persistence/d1-run-event-store";
import { ensureD1FoundationSchema } from "../src/platform/persistence/d1-schema";
import { D1ScenarioPackRepository } from "../src/platform/persistence/d1-scenario-pack-repository";
import type { D1DatabaseLike } from "../src/platform/persistence/d1-types";
import {
  RunEventStoreConflictError,
} from "../src/platform/runs/event-store";
import { ScenarioPackPublicationError } from "../src/platform/scenario-packs/publication";

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnvironment {
  readonly ASSETS: AssetBinding;
  readonly DB: D1DatabaseLike;
  readonly TRACECHAIN_BOOTSTRAP_ADMIN_EMAILS?: string;
}

const securityHeaders = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
};

const API_PREFIX = "/api/v1/";
const MAXIMUM_COMMAND_BYTES = 64 * 1024;
const MAXIMUM_PACK_BYTES = 2 * 1024 * 1024;

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
