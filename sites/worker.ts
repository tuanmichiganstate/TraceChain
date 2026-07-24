import type { ScenarioPackV1 } from "../src/platform/contracts/scenario-pack";
import type { CreateHostedAssignmentRequest } from "../src/platform/contracts/assessment";
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
  AssignmentRepositoryError,
  D1AssignmentRepository,
} from "../src/platform/persistence/d1-assignment-repository";
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
  if (error instanceof AssignmentRepositoryError) {
    const status =
      error.code === "ASSIGNMENT_NOT_FOUND"
        ? 404
        : error.code === "ASSIGNMENT_CONFLICT" ||
            error.code === "RATING_REVISION_CONFLICT" ||
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
    const result = await new D1AssignmentRepository(
      environment.DB,
      clock,
    ).create(
      body as unknown as CreateHostedAssignmentRequest,
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

  const startRunAssignmentId = pathAssignmentId(
    url.pathname,
    "start-run",
  );
  if (
    request.method === "POST" &&
    startRunAssignmentId !== null
  ) {
    requireApplicationRole(principal, [
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
    const learnerUserId = requiredText(
      body.learnerUserId,
      "learnerUserId",
    );
    if (
      assignment.status !== "active" ||
      !assignment.learnerUserIds.includes(learnerUserId)
    ) {
      throw new AssignmentRepositoryError(
        "INVALID_ASSIGNMENT",
        "The run requires an active assignment and assigned learner.",
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
      scenarioSeed: requiredText(body.scenarioSeed, "scenarioSeed"),
      caseVariant: requiredText(
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

  const feedbackRunId = pathRunId(url.pathname, "feedback");
  if (feedbackRunId !== null && request.method === "GET") {
    const { service } = await hostedServiceForRun(
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
    return jsonResponse(200, {
      assignmentId: assignment.assignmentId,
      releasedAt: assignment.feedbackReleasedAt,
      ratings: await repository.currentRatings(feedbackRunId),
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
