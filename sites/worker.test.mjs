/* global Request, Response, URL */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test, { after } from "node:test";
import { build } from "esbuild";

const buildDirectory = await mkdtemp(
  join(tmpdir(), "tracechain-worker-test-"),
);
const workerOutput = join(buildDirectory, "worker.mjs");
await build({
  entryPoints: [new URL("./worker.ts", import.meta.url).pathname],
  outfile: workerOutput,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
const { default: worker } = await import(
  `${pathToFileURL(workerOutput).href}?test=${String(Date.now())}`
);

after(async () => {
  await rm(buildDirectory, { recursive: true, force: true });
});

const appShell = "<!doctype html><title>TraceChain</title>";

function createAssetEnvironment() {
  const requestedPaths = [];

  return {
    requestedPaths,
    env: {
      ASSETS: {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          requestedPaths.push(pathname);

          if (pathname === "/index.html") {
            return new Response(appShell, {
              headers: { "content-type": "text/html; charset=utf-8" },
            });
          }

          return new Response("Not found", { status: 404 });
        },
      },
    },
  };
}

function createPrincipalDatabase(rows) {
  return {
    prepare(query) {
      if (/^CREATE (?:UNIQUE )?(?:TABLE|INDEX)/u.test(query)) {
        return { query };
      }
      assert.match(query, /application_role_assignments/u);
      return {
        bind(email) {
          return {
            async all() {
              return {
                success: true,
                results: rows.filter(
                  (row) =>
                    row.email.toLowerCase() ===
                    String(email).toLowerCase(),
                ),
              };
            },
          };
        },
      };
    },
    async batch(statements) {
      return statements.map(() => ({ success: true }));
    },
  };
}

class SqliteD1Statement {
  #database;
  #query;
  #bindings = [];

  constructor(database, query) {
    this.#database = database;
    this.#query = query;
  }

  bind(...bindings) {
    const statement = new SqliteD1Statement(
      this.#database,
      this.#query,
    );
    statement.#bindings = bindings;
    return statement;
  }

  async first() {
    return (
      this.#database.prepare(this.#query).get(...this.#bindings) ?? null
    );
  }

  async all() {
    return {
      success: true,
      results: this.#database
        .prepare(this.#query)
        .all(...this.#bindings),
    };
  }

  async run() {
    try {
      const result = this.#database
        .prepare(this.#query)
        .run(...this.#bindings);
      return {
        success: true,
        meta: { changes: Number(result.changes) },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        meta: { changes: 0 },
      };
    }
  }
}

class SqliteD1Database {
  sqlite = new DatabaseSync(":memory:");

  prepare(query) {
    return new SqliteD1Statement(this.sqlite, query);
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    const results = [];
    try {
      for (const statement of statements) {
        const result = await statement.run();
        results.push(result);
        if (!result.success) {
          this.sqlite.exec("ROLLBACK");
          return results;
        }
      }
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.sqlite.close();
  }
}

function apiRequest(pathname, options = {}) {
  const {
    body,
    email,
    method = "GET",
  } = options;
  return new Request(`https://tracechain.example${pathname}`, {
    method,
    headers: {
      ...(email === undefined
        ? {}
        : { "oai-authenticated-user-email": email }),
      ...(body === undefined
        ? {}
        : {
            "content-type": "application/json",
            origin: "https://tracechain.example",
          }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function seedUser(database, userId, email, roles) {
  database.sqlite
    .prepare(
      `INSERT INTO application_users (
        user_id, email, status, created_at_utc
      ) VALUES (?, ?, 'active', ?)`,
    )
    .run(userId, email, "2026-07-24T03:00:00.000Z");
  const statement = database.sqlite.prepare(
    `INSERT INTO application_role_assignments (
      user_id,
      application_role,
      assigned_at_utc,
      assigned_by_user_id
    ) VALUES (?, ?, ?, ?)`,
  );
  for (const role of roles) {
    statement.run(
      userId,
      role,
      "2026-07-24T03:00:00.000Z",
      "USER_ADMIN_001",
    );
  }
}

test("serves the application shell at the root without relying on Accept", async () => {
  const { env, requestedPaths } = createAssetEnvironment();
  const response = await worker.fetch(
    new Request("https://tracechain.example/", {
      headers: { accept: "*/*" },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), appShell);
  assert.deepEqual(requestedPaths, ["/", "/index.html"]);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("serves the application shell for browser navigation routes", async () => {
  const { env, requestedPaths } = createAssetEnvironment();
  const response = await worker.fetch(
    new Request("https://tracechain.example/stage/5", {
      headers: { accept: "text/html,application/xhtml+xml" },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), appShell);
  assert.deepEqual(requestedPaths, ["/stage/5", "/index.html"]);
});

test("preserves a missing-asset response for non-navigation requests", async () => {
  const { env, requestedPaths } = createAssetEnvironment();
  const response = await worker.fetch(
    new Request("https://tracechain.example/missing.js", {
      headers: { accept: "application/javascript" },
    }),
    env,
  );

  assert.equal(response.status, 404);
  assert.deepEqual(requestedPaths, ["/missing.js"]);
});

test("requires deployment authentication for hosted API routes", async () => {
  const { env } = createAssetEnvironment();
  env.DB = createPrincipalDatabase([]);
  const response = await worker.fetch(
    new Request("https://tracechain.example/api/v1/session"),
    env,
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: {
      code: "AUTHENTICATION_REQUIRED",
    },
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("returns only server-provisioned application roles", async () => {
  const { env } = createAssetEnvironment();
  env.DB = createPrincipalDatabase([
    {
      user_id: "USER_INSTRUCTOR_001",
      email: "instructor@example.edu",
      application_role: "instructor",
    },
    {
      user_id: "USER_INSTRUCTOR_001",
      email: "instructor@example.edu",
      application_role: "scenario-author",
    },
  ]);
  const response = await worker.fetch(
    new Request("https://tracechain.example/api/v1/session", {
      headers: {
        "oai-authenticated-user-email": "Instructor@example.edu",
        "x-tracechain-role": "administrator",
      },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    userId: "USER_INSTRUCTOR_001",
    email: "instructor@example.edu",
    roles: ["instructor", "scenario-author"],
  });
});

test("rejects cross-origin state-changing API requests before authorization", async () => {
  const { env } = createAssetEnvironment();
  env.DB = createPrincipalDatabase([]);
  const response = await worker.fetch(
    new Request("https://tracechain.example/api/v1/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-email": "instructor@example.edu",
        origin: "https://attacker.example",
      },
      body: "{}",
    }),
    env,
  );

  assert.equal(response.status, 401);
  assert.equal(
    (await response.json()).error.code,
    "AUTHENTICATION_REQUIRED",
  );
});

test("bootstraps only a server-allowlisted administrator into an empty D1 database", async () => {
  const database = new SqliteD1Database();
  const { env } = createAssetEnvironment();
  env.DB = database;
  env.TRACECHAIN_BOOTSTRAP_ADMIN_EMAILS = "owner@example.edu";
  try {
    const response = await worker.fetch(
      apiRequest("/api/v1/session", {
        email: "owner@example.edu",
      }),
      env,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      userId: `USER_BOOTSTRAP_${createHash("sha256")
        .update("owner@example.edu")
        .digest("hex")
        .slice(0, 24)
        .toUpperCase()}`,
      email: "owner@example.edu",
      roles: ["administrator", "instructor", "scenario-author"],
    });
    assert.equal(
      database.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM application_role_assignments",
        )
        .get().count,
      3,
    );

    const denied = await worker.fetch(
      apiRequest("/api/v1/session", {
        email: "unlisted@example.edu",
      }),
      env,
    );
    assert.equal(denied.status, 403);
  } finally {
    database.close();
  }
});

test("persists and replays the complete authenticated Stage 3 API slice in D1", async () => {
  const database = new SqliteD1Database();
  const { env } = createAssetEnvironment();
  env.DB = database;
  try {
    const initialize = await worker.fetch(
      apiRequest("/api/v1/session"),
      env,
    );
    assert.equal(initialize.status, 401);
    seedUser(
      database,
      "USER_INSTRUCTOR_001",
      "instructor@example.edu",
      ["instructor", "scenario-author"],
    );
    seedUser(
      database,
      "USER_LEARNER_001",
      "learner@example.edu",
      ["learner"],
    );

    const pack = JSON.parse(
      await readFile(
        new URL(
          "../scenario-packs/standard-coffee-stage3/tracechain.pack.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const publish = await worker.fetch(
      apiRequest("/api/v1/scenario-packs/publish", {
        method: "POST",
        email: "instructor@example.edu",
        body: { pack },
      }),
      env,
    );
    assert.equal(publish.status, 201, await publish.clone().text());
    const publication = await publish.json();
    assert.match(publication.contentHash, /^[a-f0-9]{64}$/u);

    const runId = "RUN_SITE_STAGE3_001";
    const create = await worker.fetch(
      apiRequest("/api/v1/runs", {
        method: "POST",
        email: "instructor@example.edu",
        body: {
          packId: pack.packId,
          packVersion: pack.version,
          command: {
            commandId: "COMMAND_SITE_CREATE_001",
            runId,
            assignmentId: "ASSIGNMENT_SITE_001",
            learnerUserId: "USER_LEARNER_001",
            mode: "standard",
            scenarioSeed: "site-stage3-seed-001",
            caseVariant: "unauthorized-transporter",
          },
        },
      }),
      env,
    );
    assert.equal(create.status, 201, await create.clone().text());
    assert.equal((await create.json()).version, 2);

    const inspect = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "INSPECT_EVIDENCE",
          commandId: "COMMAND_SITE_INSPECT_001",
          runId,
          expectedRunVersion: 2,
          evidenceId: "EVID_CERTIFICATE_RECORD",
        },
      }),
      env,
    );
    assert.equal(inspect.status, 200, await inspect.clone().text());
    assert.equal((await inspect.json()).projection.version, 4);

    const decision = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "SUBMIT_CERTIFICATE_DECISION",
          commandId: "COMMAND_SITE_DECISION_001",
          runId,
          expectedRunVersion: 4,
          decision: {
            certificateAssessment: "VALID",
            issuerAssessment: "RECOGNIZED_AUTHORIZED",
            storageChoice: "HASH_OFF_CHAIN",
            lotDisposition: "CONTINUE",
          },
          justification:
            "The signed evidence is intact, but transaction authorization must be evaluated separately.",
        },
      }),
      env,
    );
    assert.equal(decision.status, 200, await decision.clone().text());
    assert.equal((await decision.json()).projection.version, 6);

    const transaction = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "SUBMIT_CERTIFICATE_TRANSACTION",
          commandId: "COMMAND_SITE_TRANSACTION_001",
          runId,
          expectedRunVersion: 6,
        },
      }),
      env,
    );
    assert.equal(
      transaction.status,
      200,
      await transaction.clone().text(),
    );
    const completed = await transaction.json();
    assert.equal(completed.projection.version, 10);
    assert.equal(
      completed.projection.workflowState.currentNodeId,
      "complete",
    );
    assert.equal(
      JSON.stringify(completed.projection).includes(
        "site-stage3-seed-001",
      ),
      false,
    );

    const timelineResponse = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/timeline`, {
        email: "instructor@example.edu",
      }),
      env,
    );
    assert.equal(
      timelineResponse.status,
      200,
      await timelineResponse.clone().text(),
    );
    const timeline = (await timelineResponse.json()).timeline;
    assert.equal(timeline.length, 10);
    assert.equal(
      timeline.some(
        (event) => event.eventType === "TRANSACTION_REJECTED",
      ),
      true,
    );
    assert.equal(
      database.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM hosted_run_events WHERE run_id = ?",
        )
        .get(runId).count,
      10,
    );
  } finally {
    database.close();
  }
});
