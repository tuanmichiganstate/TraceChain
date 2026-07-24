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

async function standardCoffeePack() {
  return JSON.parse(
    await readFile(
      new URL(
        "../scenario-packs/standard-coffee-stage3/tracechain.pack.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
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
    new Request("https://tracechain.example/instructor", {
      headers: { accept: "text/html,application/xhtml+xml" },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), appShell);
  assert.deepEqual(requestedPaths, ["/instructor", "/index.html"]);
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

test("creates an exact published assignment for a provisioned learner", async () => {
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
      "USER_INSTRUCTOR_ASSIGNMENT",
      "assignment-instructor@example.edu",
      ["instructor", "scenario-author"],
    );
    seedUser(
      database,
      "USER_LEARNER_ASSIGNMENT",
      "assignment-learner@example.edu",
      ["learner"],
    );
    const pack = await standardCoffeePack();
    const publish = await worker.fetch(
      apiRequest("/api/v1/scenario-packs/publish", {
        method: "POST",
        email: "assignment-instructor@example.edu",
        body: { pack },
      }),
      env,
    );
    assert.equal(publish.status, 201, await publish.clone().text());

    const assignmentBody = {
      commandId: "COMMAND_ASSIGNMENT_CREATE_001",
      assignmentId: "ASSIGNMENT_COFFEE_001",
      title: "Coffee governance cohort",
      packId: pack.packId,
      packVersion: pack.version,
      scenarioId: pack.scenarios[0].scenarioId,
      scenarioVersion: pack.scenarios[0].version,
      mode: "standard",
      learnerUserIds: ["USER_LEARNER_ASSIGNMENT"],
    };
    const create = await worker.fetch(
      apiRequest("/api/v1/assignments", {
        method: "POST",
        email: "assignment-instructor@example.edu",
        body: assignmentBody,
      }),
      env,
    );
    assert.equal(create.status, 201, await create.clone().text());
    const created = await create.json();
    assert.deepEqual(created.assignment, {
      schemaVersion: "1.0.0",
      assignmentId: "ASSIGNMENT_COFFEE_001",
      title: "Coffee governance cohort",
      packId: pack.packId,
      packVersion: pack.version,
      scenarioId: pack.scenarios[0].scenarioId,
      scenarioVersion: pack.scenarios[0].version,
      mode: "standard",
      learnerUserIds: ["USER_LEARNER_ASSIGNMENT"],
      status: "active",
      feedbackReleaseStatus: "withheld",
      createdAt: created.assignment.createdAt,
      createdByUserId: "USER_INSTRUCTOR_ASSIGNMENT",
    });
    assert.match(created.assignment.createdAt, /^\d{4}-\d{2}-\d{2}T/u);
    assert.equal(created.wasIdempotentReplay, false);

    const repeated = await worker.fetch(
      apiRequest("/api/v1/assignments", {
        method: "POST",
        email: "assignment-instructor@example.edu",
        body: assignmentBody,
      }),
      env,
    );
    assert.equal(repeated.status, 200, await repeated.clone().text());
    assert.equal((await repeated.json()).wasIdempotentReplay, true);

    const loaded = await worker.fetch(
      apiRequest("/api/v1/assignments/ASSIGNMENT_COFFEE_001", {
        email: "assignment-instructor@example.edu",
      }),
      env,
    );
    assert.equal(loaded.status, 200, await loaded.clone().text());
    assert.equal(
      (await loaded.json()).assignment.assignmentId,
      "ASSIGNMENT_COFFEE_001",
    );

    const start = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_COFFEE_001/start-run",
        {
          method: "POST",
          email: "assignment-instructor@example.edu",
          body: {
            commandId: "COMMAND_ASSIGNMENT_RUN_001",
            runId: "RUN_ASSIGNMENT_COFFEE_001",
            learnerUserId: "USER_LEARNER_ASSIGNMENT",
            scenarioSeed: "assignment-seed-001",
            caseVariant: "authorized-certifier",
          },
        },
      ),
      env,
    );
    assert.equal(start.status, 201, await start.clone().text());
    assert.deepEqual(await start.json(), {
      runId: "RUN_ASSIGNMENT_COFFEE_001",
      assignmentId: "ASSIGNMENT_COFFEE_001",
      learnerUserId: "USER_LEARNER_ASSIGNMENT",
      status: "active",
      version: 2,
      wasIdempotentReplay: false,
    });
  } finally {
    database.close();
  }
});

test("persists and replays the authenticated Stage 3 through 9 coffee path in D1", async () => {
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

    const pack = await standardCoffeePack();
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
    const assignmentCreate = await worker.fetch(
      apiRequest("/api/v1/assignments", {
        method: "POST",
        email: "instructor@example.edu",
        body: {
          commandId: "COMMAND_SITE_ASSIGNMENT_001",
          assignmentId: "ASSIGNMENT_SITE_001",
          title: "Complete hosted coffee journey",
          packId: pack.packId,
          packVersion: pack.version,
          scenarioId: pack.scenarios[0].scenarioId,
          scenarioVersion: pack.scenarios[0].version,
          mode: "standard",
          learnerUserIds: ["USER_LEARNER_001"],
        },
      }),
      env,
    );
    assert.equal(
      assignmentCreate.status,
      201,
      await assignmentCreate.clone().text(),
    );
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
            caseVariant: "authorized-certifier",
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
    const certificate = await transaction.json();
    assert.equal(certificate.projection.version, 10);
    assert.equal(
      certificate.projection.workflowState.currentNodeId,
      "custody-proposal",
    );
    assert.equal(
      JSON.stringify(certificate.projection).includes(
        "site-stage3-seed-001",
      ),
      false,
    );

    const rejectedCustody = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "CREATE_CUSTODY_TRANSFER_PROPOSAL",
          commandId: "COMMAND_SITE_CUSTODY_REJECTED_001",
          runId,
          expectedRunVersion: 10,
          alsoTransfersOwnership: true,
        },
      }),
      env,
    );
    assert.equal(
      rejectedCustody.status,
      200,
      await rejectedCustody.clone().text(),
    );
    assert.equal(
      (await rejectedCustody.json()).projection.version,
      11,
    );

    const custodyProposal = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "CREATE_CUSTODY_TRANSFER_PROPOSAL",
          commandId: "COMMAND_SITE_CUSTODY_PROPOSAL_001",
          runId,
          expectedRunVersion: 11,
          alsoTransfersOwnership: false,
        },
      }),
      env,
    );
    assert.equal(
      custodyProposal.status,
      200,
      await custodyProposal.clone().text(),
    );
    const proposed = await custodyProposal.json();
    assert.equal(proposed.projection.version, 12);
    const custodyPolicy = proposed.projection.policyState.find(
      (record) => record.recordId === "CUSTODY_PROPOSAL_POLICY",
    );
    const proposalId = custodyPolicy?.value?.proposalId;
    assert.equal(typeof proposalId, "string");

    const endorsement = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "ENDORSE_CUSTODY_TRANSFER",
          commandId: "COMMAND_SITE_CUSTODY_ENDORSE_001",
          runId,
          expectedRunVersion: 12,
          proposalId,
        },
      }),
      env,
    );
    assert.equal(
      endorsement.status,
      200,
      await endorsement.clone().text(),
    );
    assert.equal((await endorsement.json()).projection.version, 14);

    const commitment = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "COMMIT_CUSTODY_TRANSFER",
          commandId: "COMMAND_SITE_CUSTODY_COMMIT_001",
          runId,
          expectedRunVersion: 14,
          proposalId,
        },
      }),
      env,
    );
    assert.equal(
      commitment.status,
      200,
      await commitment.clone().text(),
    );
    assert.equal((await commitment.json()).projection.version, 15);

    const transport = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "RECORD_TRANSPORT_CONDITION",
          commandId: "COMMAND_SITE_TRANSPORT_001",
          runId,
          expectedRunVersion: 15,
        },
      }),
      env,
    );
    assert.equal(transport.status, 200, await transport.clone().text());
    const transported = await transport.json();
    assert.equal(transported.projection.version, 18);
    assert.equal(
      transported.projection.workflowState.currentNodeId,
      "receipt-transaction",
    );

    const receipt = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "RECEIVE_BATCH",
          commandId: "COMMAND_SITE_RECEIVE_001",
          runId,
          expectedRunVersion: 18,
        },
      }),
      env,
    );
    assert.equal(receipt.status, 200, await receipt.clone().text());
    assert.equal((await receipt.json()).projection.version, 19);

    const purchase = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "PURCHASE_ON_RECEIPT",
          commandId: "COMMAND_SITE_PURCHASE_001",
          runId,
          expectedRunVersion: 19,
        },
      }),
      env,
    );
    assert.equal(purchase.status, 200, await purchase.clone().text());
    assert.equal((await purchase.json()).projection.version, 20);

    const discrepancy = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "SUBMIT_DISCREPANCY_DECISION",
          commandId: "COMMAND_SITE_DISCREPANCY_001",
          runId,
          expectedRunVersion: 20,
          decision: {
            action: "OVERWRITE",
            causeCode: "TYPING_ERROR",
          },
        },
      }),
      env,
    );
    assert.equal(
      discrepancy.status,
      200,
      await discrepancy.clone().text(),
    );
    assert.equal((await discrepancy.json()).projection.version, 22);

    const investigation = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "INVESTIGATE_DISCREPANCY",
          commandId: "COMMAND_SITE_INVESTIGATE_001",
          runId,
          expectedRunVersion: 22,
        },
      }),
      env,
    );
    assert.equal(
      investigation.status,
      200,
      await investigation.clone().text(),
    );
    assert.equal((await investigation.json()).projection.version, 23);

    const correctionProposal = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "CREATE_CORRECTION_PROPOSAL",
          commandId: "COMMAND_SITE_CORRECTION_PROPOSAL_001",
          runId,
          expectedRunVersion: 23,
          reason:
            "The processor investigated the manifest and confirmed a typing error.",
        },
      }),
      env,
    );
    assert.equal(
      correctionProposal.status,
      200,
      await correctionProposal.clone().text(),
    );
    const proposedCorrection = await correctionProposal.json();
    assert.equal(proposedCorrection.projection.version, 24);
    const correctionPolicy =
      proposedCorrection.projection.policyState.find(
        (record) =>
          record.recordId === "CORRECTION_PROPOSAL_POLICY",
      );
    const correctionProposalId =
      correctionPolicy?.value?.proposalId;
    assert.equal(typeof correctionProposalId, "string");

    const correctionEndorsement = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "ENDORSE_CORRECTION",
          commandId: "COMMAND_SITE_CORRECTION_ENDORSE_001",
          runId,
          expectedRunVersion: 24,
          proposalId: correctionProposalId,
        },
      }),
      env,
    );
    assert.equal(
      correctionEndorsement.status,
      200,
      await correctionEndorsement.clone().text(),
    );
    assert.equal(
      (await correctionEndorsement.json()).projection.version,
      26,
    );

    const correctionCommit = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "COMMIT_CORRECTION",
          commandId: "COMMAND_SITE_CORRECTION_COMMIT_001",
          runId,
          expectedRunVersion: 26,
          proposalId: correctionProposalId,
        },
      }),
      env,
    );
    assert.equal(
      correctionCommit.status,
      200,
      await correctionCommit.clone().text(),
    );
    const corrected = await correctionCommit.json();
    assert.equal(corrected.projection.version, 29);
    assert.equal(
      corrected.projection.workflowState.currentNodeId,
      "transformation-transaction",
    );

    const transformation = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "TRANSFORM_BATCH",
          commandId: "COMMAND_SITE_TRANSFORM_001",
          runId,
          expectedRunVersion: 29,
        },
      }),
      env,
    );
    assert.equal(
      transformation.status,
      200,
      await transformation.clone().text(),
    );
    assert.equal((await transformation.json()).projection.version, 31);

    const provenanceDecision = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "SUBMIT_KNOWLEDGE_DECISION",
          commandId: "COMMAND_SITE_PROVENANCE_001",
          runId,
          expectedRunVersion: 31,
          decisionId: "INT_TRANSFORMATION_PROVENANCE",
          selectedOptionId: "OPT_LINKED_TO_INPUT",
        },
      }),
      env,
    );
    assert.equal(
      provenanceDecision.status,
      200,
      await provenanceDecision.clone().text(),
    );
    assert.equal(
      (await provenanceDecision.json()).projection.version,
      33,
    );

    const packaging = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "PACKAGE_BATCH",
          commandId: "COMMAND_SITE_PACKAGE_001",
          runId,
          expectedRunVersion: 33,
        },
      }),
      env,
    );
    assert.equal(packaging.status, 200, await packaging.clone().text());
    assert.equal((await packaging.json()).projection.version, 34);

    const ownership = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "TRANSFER_DISTRIBUTION_OWNERSHIP",
          commandId: "COMMAND_SITE_DISTRIBUTION_OWNERSHIP_001",
          runId,
          expectedRunVersion: 34,
        },
      }),
      env,
    );
    assert.equal(ownership.status, 200, await ownership.clone().text());
    assert.equal((await ownership.json()).projection.version, 35);

    const dispatch = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "DISPATCH_BATCH",
          commandId: "COMMAND_SITE_DISPATCH_001",
          runId,
          expectedRunVersion: 35,
        },
      }),
      env,
    );
    assert.equal(dispatch.status, 200, await dispatch.clone().text());
    const distributed = await dispatch.json();
    assert.equal(distributed.projection.version, 38);
    assert.equal(
      distributed.projection.workflowState.currentNodeId,
      "tamper-demonstration",
    );

    const tamper = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "RUN_TAMPER_DEMONSTRATION",
          commandId: "COMMAND_SITE_TAMPER_001",
          runId,
          expectedRunVersion: 38,
        },
      }),
      env,
    );
    assert.equal(tamper.status, 200, await tamper.clone().text());
    assert.equal((await tamper.json()).projection.version, 40);

    const tamperDecision = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "SUBMIT_KNOWLEDGE_DECISION",
          commandId: "COMMAND_SITE_TAMPER_DECISION_001",
          runId,
          expectedRunVersion: 40,
          decisionId: "INT_TAMPER_DEMONSTRATION",
          selectedOptionId: "OPT_MAKES_EDIT_DETECTABLE",
        },
      }),
      env,
    );
    assert.equal(
      tamperDecision.status,
      200,
      await tamperDecision.clone().text(),
    );
    assert.equal((await tamperDecision.json()).projection.version, 42);

    const governance = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "SUBMIT_DATA_GOVERNANCE_DECISION",
          commandId: "COMMAND_SITE_GOVERNANCE_001",
          runId,
          expectedRunVersion: 42,
          decisionId: "INT_DATA_GOVERNANCE_CLASSIFICATION",
          categoryByItem: {
            ITEM_BATCH_ID: "CAT_ON_CHAIN",
            ITEM_RECALL_STATUS: "CAT_ON_CHAIN",
            ITEM_CERTIFICATE_PDF: "CAT_OFF_CHAIN_HASH",
            ITEM_SENSOR_DATASET: "CAT_OFF_CHAIN_HASH",
            ITEM_WHOLESALE_PRICE: "CAT_AUTHORIZED_ONLY",
            ITEM_CUSTOMER_ADDRESS: "CAT_DO_NOT_COLLECT",
          },
        },
      }),
      env,
    );
    assert.equal(
      governance.status,
      200,
      await governance.clone().text(),
    );
    assert.equal((await governance.json()).projection.version, 44);

    const scope = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "SUBMIT_RECALL_SCOPE_DECISION",
          commandId: "COMMAND_SITE_RECALL_SCOPE_001",
          runId,
          expectedRunVersion: 44,
          decisionId: "INT_RECALL_SCOPE",
          selectedAssetIds: [
            "BAT_PACKAGED_COFFEE_001",
            "BAT_ROASTED_COFFEE_001",
          ],
        },
      }),
      env,
    );
    assert.equal(scope.status, 200, await scope.clone().text());
    assert.equal((await scope.json()).projection.version, 46);

    const unauthorizedRecall = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "SUBMIT_RECALL_TRANSACTION",
          commandId: "COMMAND_SITE_UNAUTHORIZED_RECALL_001",
          runId,
          expectedRunVersion: 46,
        },
      }),
      env,
    );
    assert.equal(
      unauthorizedRecall.status,
      200,
      await unauthorizedRecall.clone().text(),
    );
    assert.equal(
      (await unauthorizedRecall.json()).projection.version,
      48,
    );

    const handoff = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "REQUEST_RECALL_HANDOFF",
          commandId: "COMMAND_SITE_RECALL_HANDOFF_001",
          runId,
          expectedRunVersion: 48,
        },
      }),
      env,
    );
    assert.equal(handoff.status, 200, await handoff.clone().text());
    assert.equal((await handoff.json()).projection.version, 49);

    const authorizedRecall = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "RESUBMIT_AUTHORIZED_RECALL",
          commandId: "COMMAND_SITE_AUTHORIZED_RECALL_001",
          runId,
          expectedRunVersion: 49,
        },
      }),
      env,
    );
    assert.equal(
      authorizedRecall.status,
      200,
      await authorizedRecall.clone().text(),
    );
    assert.equal(
      (await authorizedRecall.json()).projection.version,
      51,
    );

    const debrief = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "learner@example.edu",
        body: {
          commandType: "SUBMIT_KNOWLEDGE_DECISION",
          commandId: "COMMAND_SITE_DEBRIEF_001",
          runId,
          expectedRunVersion: 51,
          decisionId: "INT_BLOCKCHAIN_NECESSITY",
          selectedOptionId: "OPT_INDEPENDENT_ORGANIZATIONS",
        },
      }),
      env,
    );
    assert.equal(debrief.status, 200, await debrief.clone().text());
    const completed = await debrief.json();
    assert.equal(completed.projection.version, 54);
    assert.equal(
      completed.projection.workflowState.currentNodeId,
      "complete",
    );

    const withheldFeedback = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/feedback`, {
        email: "learner@example.edu",
      }),
      env,
    );
    assert.equal(withheldFeedback.status, 409);
    assert.equal(
      (await withheldFeedback.json()).error.code,
      "FEEDBACK_NOT_RELEASED",
    );

    const rubricEvidenceResponse = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/rubric-evidence`, {
        email: "instructor@example.edu",
      }),
      env,
    );
    assert.equal(
      rubricEvidenceResponse.status,
      200,
      await rubricEvidenceResponse.clone().text(),
    );
    const evidenceCriterion = (
      await rubricEvidenceResponse.json()
    ).rubricEvidence.find(
      (criterion) =>
        criterion.criterionId === "CRITERION_EVIDENCE_USE",
    );
    assert.equal(evidenceCriterion.status, "observed");
    assert.equal(evidenceCriterion.observedEvidenceIds.length > 0, true);

    const ratingBody = {
      commandId: "COMMAND_SITE_RATING_001",
      runId,
      rubricId: "RUBRIC_CERTIFICATE_DECISION",
      criterionId: "CRITERION_EVIDENCE_USE",
      levelValue: 3,
      comment: "The learner inspected and used the certificate evidence.",
      linkedEvidenceIds: [
        evidenceCriterion.observedEvidenceIds[0],
      ],
      expectedRevision: 0,
    };
    const rating = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/ratings`, {
        method: "POST",
        email: "instructor@example.edu",
        body: ratingBody,
      }),
      env,
    );
    assert.equal(rating.status, 201, await rating.clone().text());
    const rated = await rating.json();
    assert.equal(rated.rating.revision, 1);
    assert.equal(rated.rating.rubricVersion, "1.0.0");
    assert.equal(rated.wasIdempotentReplay, false);

    const repeatedRating = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/ratings`, {
        method: "POST",
        email: "instructor@example.edu",
        body: ratingBody,
      }),
      env,
    );
    assert.equal(
      repeatedRating.status,
      200,
      await repeatedRating.clone().text(),
    );
    assert.equal(
      (await repeatedRating.json()).wasIdempotentReplay,
      true,
    );

    const release = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/feedback-release",
        {
          method: "POST",
          email: "instructor@example.edu",
          body: { commandId: "COMMAND_SITE_RELEASE_001" },
        },
      ),
      env,
    );
    assert.equal(release.status, 200, await release.clone().text());
    assert.equal(
      (await release.json()).assignment.feedbackReleaseStatus,
      "released",
    );

    const learnerFeedback = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/feedback`, {
        email: "learner@example.edu",
      }),
      env,
    );
    assert.equal(
      learnerFeedback.status,
      200,
      await learnerFeedback.clone().text(),
    );
    assert.equal((await learnerFeedback.json()).ratings.length, 1);

    const report = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/report",
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(report.status, 200, await report.clone().text());
    const classReport = (await report.json()).report;
    assert.equal(classReport.learners.length, 1);
    assert.deepEqual(classReport.learners[0].runs, [
      {
        runId,
        learnerUserId: "USER_LEARNER_001",
        status: "completed",
        eventCount: 54,
        ratings: [rated.rating],
      },
    ]);

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
    assert.equal(timeline.length, 54);
    assert.equal(
      timeline.some(
        (event) =>
          event.eventType === "ENDORSEMENT_PROPOSAL_REJECTED",
      ),
      true,
    );
    assert.equal(
      timeline.some(
        (event) => event.eventType === "ENDORSEMENT_RECORDED",
      ),
      true,
    );
    assert.equal(
      timeline.some(
        (event) => event.eventType === "DECISION_REJECTED",
      ),
      true,
    );
    assert.equal(
      database.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM hosted_run_events WHERE run_id = ?",
        )
        .get(runId).count,
      54,
    );
  } finally {
    database.close();
  }
});
