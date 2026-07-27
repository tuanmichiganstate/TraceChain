/* global Request, Response, TextEncoder, URL, URLSearchParams, structuredClone */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test, { after } from "node:test";
import { build } from "esbuild";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

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
const disabledCounterfactualReplay = {
  enabled: false,
  allowedDecisionNodeIds: [],
  maximumBranchesPerLearner: 1,
  learnerAvailability: "DISABLED",
  requireReflection: false,
};
const instructorCounterfactualReplay = {
  enabled: true,
  allowedDecisionNodeIds: ["NODE_CERTIFICATE_DECISION"],
  maximumBranchesPerLearner: 1,
  learnerAvailability: "DISABLED",
  requireReflection: true,
};

function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    )
    .join(",")}}`;
}

function standardHostedExperienceFixture({
  packId,
  packVersion,
  scenarioId,
  scenarioVersion,
}) {
  const configuration = {
    configurationSchemaVersion: "2",
    presetId: "hosted-standard",
    activityType: "OPERATIONS",
    supportProfile: "CHALLENGE",
    deliveryPurpose: "ASSESSMENT",
    outcomeStrategy: "FIXED",
    content: {
      packId,
      packVersion,
      scenarioId,
      scenarioVersion,
    },
    guidance: {
      missionDetail: "MINIMAL",
      evidenceGuidance: "NONE",
      policyGuidance: "NONE",
      nextActionGuidance: "NONE",
      fadeByProgress: false,
      showWorkedExamples: false,
      referenceWorkspace: true,
    },
    feedback: {
      timing: "FINAL",
      showCorrectness: true,
      showCausalConsequences: true,
      showWorkedExplanation: false,
    },
    hints: {
      availability: "DISABLED",
      proactiveOffer: "NOT_AVAILABLE",
      itemScoped: true,
      disclosureRequired: false,
    },
    retries: {
      knowledgeRetry: "DISABLED",
      professionalDecisionRevision: "APPEND_ONLY_MITIGATION",
      maximumKnowledgeAttempts: 1,
      maximumMitigationActions: 1,
    },
    decisions: {
      requireRationale: false,
      requireEvidenceCitations: false,
      requirePolicyCitations: false,
      requireConfidence: false,
      requireRiskEstimate: false,
      allowDrafts: false,
    },
    scoring: {
      scoringBlueprintId: "HOSTED_RUBRIC_EVIDENCE_100",
      scoringBlueprintVersion: "1.0.0",
      maximumScore: 100,
      passScore: 70,
      official: true,
      competencyEvidenceEnabled: true,
      reportDiagnosticDimensions: true,
    },
    reporting: {
      causalReport: true,
      auditReport: false,
      competencyReport: true,
      activitySummary: true,
      showTechnicalMetadataToLearner: false,
    },
    delivery: {
      channel: "HOSTED",
      persistencePolicyId: "SERVER_APPEND_ONLY_EVENT_STREAM",
      attemptPolicyId: "ASSIGNMENT_MANAGED",
    },
    locale: "vi",
  };
  return {
    configuration,
    configurationHash: createHash("sha256")
      .update(canonicalJson(configuration))
      .digest("hex"),
  };
}

function createAssetEnvironment(
  files = {},
  { redirectNavigationToRoot = false } = {},
) {
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
          const file = files[pathname];
          if (file !== undefined) {
            return new Response(file.body, {
              status: 200,
              headers: {
                "content-type":
                  file.contentType ?? "application/octet-stream",
              },
            });
          }
          if (
            redirectNavigationToRoot &&
            request.headers.get("accept")?.includes("text/html")
          ) {
            return new Response(null, {
              status: 307,
              headers: { location: "/" },
            });
          }

          return new Response("Not found", { status: 404 });
        },
      },
    },
  };
}

function createArtifactBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, options) {
      objects.set(key, {
        bytes: new Uint8Array(value.slice(0)),
        options,
      });
    },
    async get(key) {
      const object = objects.get(key);
      return object === undefined
        ? null
        : { body: new Response(object.bytes).body };
    },
  };
}

function createPrincipalDatabase(rows) {
  return {
    prepare(query) {
      if (/FROM sqlite_master/u.test(query)) {
        return {
          async first() {
            return null;
          },
        };
      }
      if (
        /^(?:CREATE (?:UNIQUE )?(?:TABLE|INDEX)|DROP TABLE|INSERT OR IGNORE)/u.test(
          query,
        )
      ) {
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

async function pharmaceuticalColdChainPack() {
  return JSON.parse(
    await readFile(
      new URL(
        "../scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

async function guidedCoffeeAuditPack() {
  return JSON.parse(
    await readFile(
      new URL(
        "../scenario-packs/guided-coffee-audit/tracechain.pack.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

async function practiceCoffeeAuditPack() {
  return JSON.parse(
    await readFile(
      new URL(
        "../scenario-packs/practice-coffee-audit/tracechain.pack.json",
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
  for (const pathname of [
    "/platform",
    "/learner",
    "/instructor",
    "/author",
    "/admin",
  ]) {
    const { env, requestedPaths } = createAssetEnvironment(
      {},
      { redirectNavigationToRoot: true },
    );
    const response = await worker.fetch(
      new Request(`https://tracechain.example${pathname}`, {
        headers: { accept: "text/html,application/xhtml+xml" },
      }),
      env,
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), appShell);
    assert.deepEqual(requestedPaths, ["/index.html"]);
  }
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

test("accepts one-use Moodle LTI 1.3 instructor launches and scopes assignments to the course", async () => {
  const database = new SqliteD1Database();
  const { env } = createAssetEnvironment();
  const issuer = "https://moodle.example";
  const clientId = "TRACECHAIN_CLIENT";
  const deploymentId = "TRACECHAIN_DEPLOYMENT";
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const publicJwk = {
    ...(await exportJWK(publicKey)),
    alg: "RS256",
    kid: "MOODLE_SIGNING_KEY",
    use: "sig",
  };
  env.DB = database;
  env.TRACECHAIN_LTI_REGISTRATIONS_JSON = JSON.stringify([
    {
      registrationId: "MOODLE_DEMO",
      issuer,
      clientId,
      deploymentId,
      authorizationEndpoint: `${issuer}/mod/lti/auth.php`,
      jwksUri: `${issuer}/mod/lti/certs.php`,
      platformJwks: { keys: [publicJwk] },
    },
  ]);
  env.TRACECHAIN_LTI_TOOL_JWKS_JSON = JSON.stringify({
    keys: [publicJwk],
  });

  async function initiateLogin() {
    const parameters = new URLSearchParams({
      iss: issuer,
      login_hint: "LOGIN_HINT",
      target_link_uri:
        "https://tracechain.example/api/lti/v1/launch",
      client_id: clientId,
      lti_deployment_id: deploymentId,
      lti_message_hint: "MESSAGE_HINT",
    });
    const response = await worker.fetch(
      new Request(
        `https://tracechain.example/api/lti/v1/login?${parameters.toString()}`,
      ),
      env,
    );
    assert.equal(response.status, 302);
    const authorization = new URL(response.headers.get("location"));
    assert.equal(
      authorization.origin + authorization.pathname,
      `${issuer}/mod/lti/auth.php`,
    );
    assert.equal(authorization.searchParams.get("prompt"), "none");
    assert.equal(
      authorization.searchParams.get("response_mode"),
      "form_post",
    );
    return {
      nonce: authorization.searchParams.get("nonce"),
      state: authorization.searchParams.get("state"),
    };
  }

  async function launch({
    nonce,
    state,
    roles = [
      "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor",
    ],
    contextId = "COURSE_ACCOUNTING_101",
    signingKey = privateKey,
  }) {
    const now = Math.floor(Date.now() / 1_000);
    const idToken = await new SignJWT({
      nonce,
      email: "instructor@example.edu",
      name: "Course instructor",
      locale: "en-US",
      "https://purl.imsglobal.org/spec/lti/claim/version":
        "1.3.0",
      "https://purl.imsglobal.org/spec/lti/claim/message_type":
        "LtiResourceLinkRequest",
      "https://purl.imsglobal.org/spec/lti/claim/deployment_id":
        deploymentId,
      "https://purl.imsglobal.org/spec/lti/claim/roles": roles,
      "https://purl.imsglobal.org/spec/lti/claim/context": {
        id: contextId,
        label: "ACC101",
        title: "Accounting 101",
      },
      "https://purl.imsglobal.org/spec/lti/claim/resource_link": {
        id: "RESOURCE_TRACECHAIN_INSTRUCTOR",
      },
      "https://purl.imsglobal.org/spec/lti/claim/launch_presentation":
        {
          return_url: `${issuer}/course/view.php?id=42`,
        },
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "MOODLE_SIGNING_KEY",
      })
      .setIssuer(issuer)
      .setAudience(clientId)
      .setSubject("MOODLE_USER_42")
      .setIssuedAt(now)
      .setExpirationTime(now + 120)
      .sign(signingKey);
    const form = new URLSearchParams({ id_token: idToken, state });
    return worker.fetch(
      new Request("https://tracechain.example/api/lti/v1/launch", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form,
      }),
      env,
    );
  }

  try {
    const keyset = await worker.fetch(
      new Request("https://tracechain.example/api/lti/v1/jwks"),
      env,
    );
    assert.equal(keyset.status, 200);
    assert.equal((await keyset.json()).keys[0].kid, "MOODLE_SIGNING_KEY");

    const login = await initiateLogin();
    const launched = await launch(login);
    assert.equal(launched.status, 303, await launched.clone().text());
    assert.equal(
      launched.headers.get("location"),
      "/instructor?locale=en",
    );
    const cookie = launched.headers
      .get("set-cookie")
      .split(";")[0];
    assert.match(cookie, /^__Host-tracechain-lti=/u);

    const session = await worker.fetch(
      new Request("https://tracechain.example/api/v1/session", {
        headers: { cookie },
      }),
      env,
    );
    assert.equal(session.status, 200);
    const sessionBody = await session.json();
    assert.deepEqual(sessionBody.roles, ["instructor"]);
    assert.equal(sessionBody.authenticationSource, "lti");
    assert.equal(
      sessionBody.learningContext.contextId,
      "COURSE_ACCOUNTING_101",
    );
    assert.equal(
      sessionBody.learningContext.returnUrl,
      `${issuer}/course/view.php?id=42`,
    );
    assert.equal(
      database.sqlite
        .prepare(
          "SELECT email FROM application_users WHERE user_id = ?",
        )
        .get(sessionBody.userId).email,
      null,
    );

    const modeConfiguration = (
      await standardCoffeePack()
    ).scenarios[0].modeConfigurations.find(
      (configuration) => configuration.mode === "standard",
    );
    const experience = standardHostedExperienceFixture({
      packId: "PACK",
      packVersion: "1.0.0",
      scenarioId: "SCENARIO",
      scenarioVersion: "1.0.0",
    });
    database.sqlite
      .prepare(
        `INSERT INTO scenario_pack_versions (
          pack_id,
          pack_version,
          lifecycle_status,
          pack_json,
          updated_at_utc,
          updated_by_user_id
        ) VALUES ('PACK', '1.0.0', 'published', '{}', ?, ?)`,
      )
      .run(
        "2026-07-26T08:00:00.000Z",
        sessionBody.userId,
      );
    const insertAssignment = database.sqlite.prepare(
      `INSERT INTO assignments (
        assignment_id,
        creation_command_id,
        title,
        pack_id,
        pack_version,
        scenario_id,
        scenario_version,
        run_mode,
        mode_configuration_json,
        experience_configuration_json,
        experience_configuration_hash,
        counterfactual_configuration_json,
        research_configuration_json,
        learning_platform_issuer,
        learning_platform_client_id,
        learning_platform_deployment_id,
        learning_context_id,
        learning_resource_link_id,
        lifecycle_status,
        feedback_release_status,
        created_at_utc,
        created_by_user_id
      ) VALUES (
        ?, ?, ?, 'PACK', '1.0.0', 'SCENARIO', '1.0.0',
        'standard', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        'active', 'withheld', ?, ?
      )`,
    );
    const assignmentArguments = [
      JSON.stringify(modeConfiguration),
      JSON.stringify(experience.configuration),
      experience.configurationHash,
      JSON.stringify(disabledCounterfactualReplay),
      JSON.stringify({ enabled: false }),
      issuer,
      clientId,
      deploymentId,
    ];
    insertAssignment.run(
      "ASSIGNMENT_SAME_COURSE",
      "COMMAND_SAME_COURSE",
      "Same course",
      ...assignmentArguments,
      "COURSE_ACCOUNTING_101",
      "RESOURCE_TRACECHAIN_INSTRUCTOR",
      "2026-07-26T08:00:00.000Z",
      sessionBody.userId,
    );
    insertAssignment.run(
      "ASSIGNMENT_OTHER_COURSE",
      "COMMAND_OTHER_COURSE",
      "Other course",
      ...assignmentArguments,
      "COURSE_ACCOUNTING_202",
      "RESOURCE_TRACECHAIN_INSTRUCTOR",
      "2026-07-26T08:00:00.000Z",
      sessionBody.userId,
    );

    const sameCourse = await worker.fetch(
      new Request(
        "https://tracechain.example/api/v1/assignments/ASSIGNMENT_SAME_COURSE",
        { headers: { cookie } },
      ),
      env,
    );
    assert.equal(sameCourse.status, 200, await sameCourse.clone().text());
    const otherCourse = await worker.fetch(
      new Request(
        "https://tracechain.example/api/v1/assignments/ASSIGNMENT_OTHER_COURSE",
        { headers: { cookie } },
      ),
      env,
    );
    assert.equal(otherCourse.status, 403);
    assert.equal(
      (await otherCourse.json()).error.code,
      "RUN_ACCESS_DENIED",
    );
    const unscopedRun = await worker.fetch(
      new Request("https://tracechain.example/api/v1/runs", {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
          origin: "https://tracechain.example",
        },
        body: "{}",
      }),
      env,
    );
    assert.equal(unscopedRun.status, 403);
    assert.equal(
      (await unscopedRun.json()).error.code,
      "RUN_ACCESS_DENIED",
    );

    const replayedLaunch = await launch(login);
    assert.equal(replayedLaunch.status, 303);
    assert.equal(
      new URL(replayedLaunch.headers.get("location")).searchParams.get(
        "ltiError",
      ),
      "LTI_LOGIN_STATE_INVALID",
    );

    const learnerLogin = await initiateLogin();
    const learnerLaunch = await launch({
      ...learnerLogin,
      roles: [
        "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner",
      ],
    });
    assert.equal(learnerLaunch.status, 303);
    assert.equal(
      new URL(learnerLaunch.headers.get("location")).searchParams.get(
        "ltiError",
      ),
      "LTI_INSTRUCTOR_ROLE_REQUIRED",
    );

    const invalidLogin = await initiateLogin();
    const { privateKey: wrongSigningKey } =
      await generateKeyPair("RS256");
    const invalidSignature = await launch({
      ...invalidLogin,
      signingKey: wrongSigningKey,
    });
    assert.equal(invalidSignature.status, 303);
    assert.equal(
      new URL(invalidSignature.headers.get("location")).searchParams.get(
        "ltiError",
      ),
      "LTI_TOKEN_INVALID",
    );

    const logout = await worker.fetch(
      new Request("https://tracechain.example/api/lti/v1/logout", {
        method: "POST",
        headers: {
          cookie,
          origin: "https://tracechain.example",
        },
      }),
      env,
    );
    assert.equal(logout.status, 204);
    const expiredSession = await worker.fetch(
      new Request("https://tracechain.example/api/v1/session", {
        headers: { cookie },
      }),
      env,
    );
    assert.equal(expiredSession.status, 401);
  } finally {
    database.close();
  }
});

test("rejects cross-origin state-changing API requests before authorization", async () => {
  const { env } = createAssetEnvironment();
  env.DB = createPrincipalDatabase([]);
  const response = await worker.fetch(
    new Request(
      "https://tracechain.example/api/v1/assignments/ASSIGNMENT_001/start-run",
      {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-email": "instructor@example.edu",
        origin: "https://attacker.example",
      },
      body: "{}",
      },
    ),
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

test("lets only administrators provision idempotent application access", async () => {
  const database = new SqliteD1Database();
  const { env } = createAssetEnvironment();
  env.DB = database;
  await worker.fetch(apiRequest("/api/v1/session"), env);
  seedUser(database, "USER_ADMIN_001", "admin@example.edu", [
    "administrator",
  ]);
  seedUser(
    database,
    "USER_INSTRUCTOR_001",
    "instructor@example.edu",
    ["instructor"],
  );
  try {
    const forbidden = await worker.fetch(
      apiRequest("/api/v1/admin/users", {
        email: "instructor@example.edu",
      }),
      env,
    );
    assert.equal(forbidden.status, 403);
    const forbiddenAudit = await worker.fetch(
      apiRequest("/api/v1/admin/access-audit", {
        email: "instructor@example.edu",
      }),
      env,
    );
    assert.equal(forbiddenAudit.status, 403);

    const command = {
      commandId: "COMMAND_PROVISION_ACCESS_001",
      email: " New.Learner@Example.edu ",
      status: "active",
      roles: ["rater", "learner"],
    };
    const created = await worker.fetch(
      apiRequest("/api/v1/admin/users", {
        method: "POST",
        email: "admin@example.edu",
        body: command,
      }),
      env,
    );
    assert.equal(created.status, 201, await created.clone().text());
    const createdBody = await created.json();
    assert.equal(createdBody.wasIdempotentReplay, false);
    assert.deepEqual(
      {
        ...createdBody.user,
        createdAt: "(verified separately)",
      },
      {
        schemaVersion: "1.0.0",
        userId: createdBody.user.userId,
        email: "new.learner@example.edu",
        status: "active",
        roles: ["learner", "rater"],
        createdAt: "(verified separately)",
      },
    );
    assert.equal(
      Number.isFinite(Date.parse(createdBody.user.createdAt)),
      true,
    );

    const replayed = await worker.fetch(
      apiRequest("/api/v1/admin/users", {
        method: "POST",
        email: "admin@example.edu",
        body: command,
      }),
      env,
    );
    assert.equal(replayed.status, 200);
    assert.equal((await replayed.json()).wasIdempotentReplay, true);

    const conflict = await worker.fetch(
      apiRequest("/api/v1/admin/users", {
        method: "POST",
        email: "admin@example.edu",
        body: {
          ...command,
          roles: ["learner"],
        },
      }),
      env,
    );
    assert.equal(conflict.status, 409);
    assert.equal(
      (await conflict.json()).error.code,
      "ACCESS_COMMAND_CONFLICT",
    );

    const listed = await worker.fetch(
      apiRequest("/api/v1/admin/users", {
        email: "admin@example.edu",
      }),
      env,
    );
    assert.equal(listed.status, 200);
    assert.deepEqual(
      (await listed.json()).users.map((user) => user.email),
      [
        "admin@example.edu",
        "instructor@example.edu",
        "new.learner@example.edu",
      ],
    );

    const auditResponse = await worker.fetch(
      apiRequest("/api/v1/admin/access-audit", {
        email: "admin@example.edu",
      }),
      env,
    );
    assert.equal(
      auditResponse.status,
      200,
      await auditResponse.clone().text(),
    );
    const audit = (await auditResponse.json()).audit;
    assert.equal(audit.length, 1);
    assert.deepEqual(
      {
        ...audit[0],
        performedAt: "(verified separately)",
      },
      {
        schemaVersion: "1.0.0",
        commandId: "COMMAND_PROVISION_ACCESS_001",
        targetUserId: createdBody.user.userId,
        targetEmail: "new.learner@example.edu",
        status: "active",
        roles: ["learner", "rater"],
        performedAt: "(verified separately)",
        performedByUserId: "USER_ADMIN_001",
        performedByEmail: "admin@example.edu",
      },
    );
    assert.equal(
      Number.isFinite(Date.parse(audit[0].performedAt)),
      true,
    );

    const selfRemoval = await worker.fetch(
      apiRequest("/api/v1/admin/users", {
        method: "POST",
        email: "admin@example.edu",
        body: {
          commandId: "COMMAND_REMOVE_SELF_ADMIN_001",
          email: "admin@example.edu",
          status: "active",
          roles: ["learner"],
        },
      }),
      env,
    );
    assert.equal(selfRemoval.status, 400);
    assert.equal(
      (await selfRemoval.json()).error.code,
      "SELF_ADMINISTRATION_FORBIDDEN",
    );

    const disabled = await worker.fetch(
      apiRequest("/api/v1/admin/users", {
        method: "POST",
        email: "admin@example.edu",
        body: {
          commandId: "COMMAND_DISABLE_ACCESS_001",
          email: "new.learner@example.edu",
          status: "disabled",
          roles: ["learner", "rater"],
        },
      }),
      env,
    );
    assert.equal(disabled.status, 201);
    assert.equal((await disabled.json()).user.status, "disabled");
    const disabledSession = await worker.fetch(
      apiRequest("/api/v1/session", {
        email: "new.learner@example.edu",
      }),
      env,
    );
    assert.equal(disabledSession.status, 403);
  } finally {
    database.close();
  }
});

test("supports validated immutable scenario-pack authoring lifecycle", async () => {
  const database = new SqliteD1Database();
  const { env } = createAssetEnvironment();
  env.DB = database;
  try {
    await worker.fetch(apiRequest("/api/v1/session"), env);
    seedUser(
      database,
      "USER_AUTHOR_LIFECYCLE",
      "author@example.edu",
      ["scenario-author"],
    );
    const pack = await standardCoffeePack();
    const invalid = structuredClone(pack);
    invalid.scenarios[0].entryNodeId = "MISSING_NODE";

    const validation = await worker.fetch(
      apiRequest("/api/v1/scenario-packs/validate", {
        method: "POST",
        email: "author@example.edu",
        body: { pack: invalid },
      }),
      env,
    );
    assert.equal(validation.status, 200);
    const invalidReport = (await validation.json()).report;
    assert.equal(invalidReport.valid, false);
    assert.equal(
      invalidReport.issues.some(
        (issue) => issue.code === "UNKNOWN_ENTRY_NODE",
      ),
      true,
    );

    const imported = await worker.fetch(
      apiRequest("/api/v1/scenario-packs/import", {
        method: "POST",
        email: "author@example.edu",
        body: { pack },
      }),
      env,
    );
    assert.equal(imported.status, 201, await imported.clone().text());
    assert.equal((await imported.json()).report.valid, true);

    const listedDraft = await worker.fetch(
      apiRequest("/api/v1/scenario-packs", {
        email: "author@example.edu",
      }),
      env,
    );
    assert.equal(listedDraft.status, 200);
    assert.deepEqual(
      (await listedDraft.json()).packs.map(
        ({ packId, version, status }) => ({ packId, version, status }),
      ),
      [{ packId: pack.packId, version: pack.version, status: "draft" }],
    );

    const previewPath =
      `/api/v1/scenario-packs/${encodeURIComponent(pack.packId)}` +
      `/versions/${encodeURIComponent(pack.version)}/preview` +
      `?scenarioId=${encodeURIComponent(pack.scenarios[0].scenarioId)}` +
      `&scenarioVersion=${encodeURIComponent(pack.scenarios[0].version)}` +
      "&locale=en&mode=standard&roleId=LOGISTICS_COORDINATOR";
    const preview = await worker.fetch(
      apiRequest(previewPath, { email: "author@example.edu" }),
      env,
    );
    assert.equal(preview.status, 200, await preview.clone().text());
    const previewBody = (await preview.json()).preview;
    assert.equal(previewBody.packId, pack.packId);
    assert.equal(previewBody.roleId, "LOGISTICS_COORDINATOR");
    assert.equal(previewBody.modeConfiguration.feedbackTiming, "final");
    assert.equal(Object.hasOwn(previewBody, "actualState"), false);

    const published = await worker.fetch(
      apiRequest(
        `/api/v1/scenario-packs/${encodeURIComponent(pack.packId)}` +
          `/versions/${encodeURIComponent(pack.version)}/publish`,
        {
          method: "POST",
          email: "author@example.edu",
          body: {},
        },
      ),
      env,
    );
    assert.equal(published.status, 201, await published.clone().text());
    const publication = await published.json();
    assert.equal(publication.status, "published");
    assert.match(publication.contentHash, /^[a-f0-9]{64}$/u);

    const next = structuredClone(pack);
    next.version = "2.0.0";
    next.manifest.domain = "supply-chain-governance";
    const nextImport = await worker.fetch(
      apiRequest("/api/v1/scenario-packs/import", {
        method: "POST",
        email: "author@example.edu",
        body: { pack: next },
      }),
      env,
    );
    assert.equal(nextImport.status, 201, await nextImport.clone().text());
    const comparison = await worker.fetch(
      apiRequest(
        `/api/v1/scenario-packs/${encodeURIComponent(pack.packId)}` +
          `/compare?fromVersion=${encodeURIComponent(pack.version)}` +
          "&toVersion=2.0.0",
        { email: "author@example.edu" },
      ),
      env,
    );
    assert.equal(comparison.status, 200, await comparison.clone().text());
    assert.deepEqual(
      (await comparison.json()).comparison.changedPaths,
      ["manifest.domain", "status", "version"],
    );

    const retirementPath =
      `/api/v1/scenario-packs/${encodeURIComponent(pack.packId)}` +
      `/versions/${encodeURIComponent(pack.version)}/retire`;
    const retirementBody = { commandId: "CMD_RETIRE_LIFECYCLE_001" };
    const retired = await worker.fetch(
      apiRequest(retirementPath, {
        method: "POST",
        email: "author@example.edu",
        body: retirementBody,
      }),
      env,
    );
    assert.equal(retired.status, 201, await retired.clone().text());
    const retiredBody = await retired.json();
    assert.equal(retiredBody.status, "retired");
    assert.equal(retiredBody.contentHash, publication.contentHash);
    assert.equal(retiredBody.wasIdempotentReplay, false);

    const replayed = await worker.fetch(
      apiRequest(retirementPath, {
        method: "POST",
        email: "author@example.edu",
        body: retirementBody,
      }),
      env,
    );
    assert.equal(replayed.status, 200, await replayed.clone().text());
    assert.equal((await replayed.json()).wasIdempotentReplay, true);
  } finally {
    database.close();
  }
});

test("imports and previews a self-localized disciplinary pack", async () => {
  const database = new SqliteD1Database();
  const { env } = createAssetEnvironment();
  env.DB = database;
  try {
    await worker.fetch(apiRequest("/api/v1/session"), env);
    seedUser(
      database,
      "USER_AUTHOR_PHARMA",
      "pharma-author@example.edu",
      ["scenario-author", "instructor"],
    );
    seedUser(
      database,
      "USER_LEARNER_PHARMA",
      "pharma-learner@example.edu",
      ["learner"],
    );
    seedUser(
      database,
      "USER_INSTRUCTOR_OUTSIDE_PHARMA",
      "pharma-outside-instructor@example.edu",
      ["instructor"],
    );
    const pack = await pharmaceuticalColdChainPack();
    const imported = await worker.fetch(
      apiRequest("/api/v1/scenario-packs/import", {
        method: "POST",
        email: "pharma-author@example.edu",
        body: { pack },
      }),
      env,
    );
    assert.equal(imported.status, 201, await imported.clone().text());
    assert.equal((await imported.json()).report.valid, true);

    const preview = await worker.fetch(
      apiRequest(
        `/api/v1/scenario-packs/${pack.packId}` +
          `/versions/${pack.version}/preview` +
          `?scenarioId=${pack.scenarios[0].scenarioId}` +
          `&scenarioVersion=${pack.scenarios[0].version}` +
          "&locale=vi&mode=tutorial&roleId=QUALITY_MANAGER",
        { email: "pharma-author@example.edu" },
      ),
      env,
    );
    assert.equal(preview.status, 200, await preview.clone().text());
    const body = (await preview.json()).preview;
    assert.equal(body.scenarioTitle, "Xem xét sai lệch nhiệt độ");
    assert.deepEqual(body.nodes[1].visibleEvidenceIds, [
      "EVID_PHARMA_SENSOR_SUMMARY",
    ]);
    assert.equal(Object.hasOwn(body, "actualState"), false);

    const publish = await worker.fetch(
      apiRequest(
        `/api/v1/scenario-packs/${pack.packId}` +
          `/versions/${pack.version}/publish`,
        {
          method: "POST",
          email: "pharma-author@example.edu",
          body: { commandId: "CMD_PUBLISH_PHARMA_001" },
        },
      ),
      env,
    );
    assert.equal(publish.status, 201, await publish.clone().text());

    const assignmentOptions = await worker.fetch(
      apiRequest("/api/v1/assignment-options", {
        email: "pharma-author@example.edu",
      }),
      env,
    );
    assert.equal(
      assignmentOptions.status,
      200,
      await assignmentOptions.clone().text(),
    );
    const options = (await assignmentOptions.json()).options;
    assert.deepEqual(
      options.map(({ scenarioId }) => scenarioId),
      [
        "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS",
        "SCN_PHARMA_COLD_CHAIN_STARTER",
        "SCN_PHARMA_COLD_CHAIN_TRANSFER",
      ],
    );

    const transferScenario = pack.scenarios.find(
      ({ scenarioId }) =>
        scenarioId === "SCN_PHARMA_COLD_CHAIN_TRANSFER",
    );
    assert.notEqual(transferScenario, undefined);
    const directorAssignment = await worker.fetch(
      apiRequest("/api/v1/assignments", {
        method: "POST",
        email: "pharma-author@example.edu",
        body: {
          commandId: "CMD_ASSIGN_PHARMA_DIRECTOR_001",
          assignmentId: "ASSIGNMENT_PHARMA_DIRECTOR_001",
          title: "Pharmaceutical incident review",
          packId: pack.packId,
          packVersion: pack.version,
          scenarioId: transferScenario.scenarioId,
          scenarioVersion: transferScenario.version,
          mode: "tutorial",
          counterfactualReplay:
            disabledCounterfactualReplay,
          research: { enabled: false },
          learnerUserIds: ["USER_LEARNER_PHARMA"],
        },
      }),
      env,
    );
    assert.equal(
      directorAssignment.status,
      201,
      await directorAssignment.clone().text(),
    );
    const directorRunId = "RUN_PHARMA_DIRECTOR_001";
    const directorStart = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_PHARMA_DIRECTOR_001/start-run",
        {
          method: "POST",
          email: "pharma-learner@example.edu",
          body: {
            commandId: "CMD_START_PHARMA_DIRECTOR_001",
            runId: directorRunId,
          },
        },
      ),
      env,
    );
    assert.equal(
      directorStart.status,
      201,
      await directorStart.clone().text(),
    );
    const directorAdvance = await worker.fetch(
      apiRequest(`/api/v1/runs/${directorRunId}/commands`, {
        method: "POST",
        email: "pharma-learner@example.edu",
        body: {
          commandType: "ADVANCE_WORKFLOW",
          commandId: "CMD_ADVANCE_PHARMA_DIRECTOR_001",
          runId: directorRunId,
          expectedRunVersion: 1,
        },
      }),
      env,
    );
    assert.equal(
      directorAdvance.status,
      200,
      await directorAdvance.clone().text(),
    );
    const directorTriage = await directorAdvance.json();

    const learnerDirectorDenied = await worker.fetch(
      apiRequest(
        `/api/v1/runs/${directorRunId}/instructor-incidents`,
        { email: "pharma-learner@example.edu" },
      ),
      env,
    );
    assert.equal(learnerDirectorDenied.status, 403);

    const directorStatus = await worker.fetch(
      apiRequest(
        `/api/v1/runs/${directorRunId}/instructor-incidents`,
        { email: "pharma-author@example.edu" },
      ),
      env,
    );
    assert.equal(
      directorStatus.status,
      200,
      await directorStatus.clone().text(),
    );
    const directorControl = (await directorStatus.json()).director;
    assert.equal(
      directorControl.runVersion,
      directorTriage.projection.version,
    );
    assert.deepEqual(
      directorControl.incidents.map(({ incidentId, status }) => ({
        incidentId,
        status,
      })),
      [
        {
          incidentId: "INCIDENT_PHARMA_CALIBRATION_REVIEW",
          status: "available",
        },
      ],
    );
    const outsideDirectorDenied = await worker.fetch(
      apiRequest(
        `/api/v1/runs/${directorRunId}/instructor-incidents`,
        { email: "pharma-outside-instructor@example.edu" },
      ),
      env,
    );
    assert.equal(outsideDirectorDenied.status, 403);

    const releaseBody = {
      commandId: "CMD_RELEASE_PHARMA_DIRECTOR_001",
      runId: directorRunId,
      expectedRunVersion: directorControl.runVersion,
      incidentId: "INCIDENT_PHARMA_CALIBRATION_REVIEW",
    };
    const releasedIncident = await worker.fetch(
      apiRequest(
        `/api/v1/runs/${directorRunId}/instructor-incidents`,
        {
          method: "POST",
          email: "pharma-author@example.edu",
          body: releaseBody,
        },
      ),
      env,
    );
    assert.equal(
      releasedIncident.status,
      200,
      await releasedIncident.clone().text(),
    );
    assert.equal(
      (await releasedIncident.json()).wasIdempotentReplay,
      false,
    );
    const repeatedIncident = await worker.fetch(
      apiRequest(
        `/api/v1/runs/${directorRunId}/instructor-incidents`,
        {
          method: "POST",
          email: "pharma-author@example.edu",
          body: releaseBody,
        },
      ),
      env,
    );
    assert.equal(repeatedIncident.status, 200);
    assert.equal(
      (await repeatedIncident.json()).wasIdempotentReplay,
      true,
    );
    const releasedProjectionResponse = await worker.fetch(
      apiRequest(`/api/v1/runs/${directorRunId}`, {
        email: "pharma-learner@example.edu",
      }),
      env,
    );
    assert.equal(releasedProjectionResponse.status, 200);
    const releasedProjection = (
      await releasedProjectionResponse.json()
    ).projection;
    assert.deepEqual(
      releasedProjection.presentation.instructorIncidents.map(
        ({ incidentId }) => incidentId,
      ),
      ["INCIDENT_PHARMA_CALIBRATION_REVIEW"],
    );
    assert.equal(
      releasedProjection.informationState.some(
        ({ recordId }) =>
          recordId === "EVID_PHARMA_TRANSFER_CALIBRATION",
      ),
      true,
    );
    assert.deepEqual(
      releasedProjection.presentation.professionalConsequences.map(
        ({ dimensionId, value }) => ({ dimensionId, value }),
      ),
      [
        { dimensionId: "DIM_PHARMA_BUSINESS_COST", value: 1 },
        {
          dimensionId: "DIM_PHARMA_OPERATIONAL_DELAY",
          value: 1,
        },
        { dimensionId: "DIM_PHARMA_EVIDENCE_QUALITY", value: 1 },
      ],
    );

    const assignment = await worker.fetch(
      apiRequest("/api/v1/assignments", {
        method: "POST",
        email: "pharma-author@example.edu",
        body: {
          commandId: "CMD_ASSIGN_PHARMA_001",
          assignmentId: "ASSIGNMENT_PHARMA_001",
          title: "Pharmaceutical cold-chain review",
          packId: pack.packId,
          packVersion: pack.version,
          scenarioId: pack.scenarios[0].scenarioId,
          scenarioVersion: pack.scenarios[0].version,
          mode: "tutorial",
          counterfactualReplay:
            disabledCounterfactualReplay,
          research: { enabled: false },
          learnerUserIds: ["USER_LEARNER_PHARMA"],
        },
      }),
      env,
    );
    assert.equal(
      assignment.status,
      201,
      await assignment.clone().text(),
    );
    const runId = "RUN_PHARMA_GENERIC_001";
    const started = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_PHARMA_001/start-run",
        {
          method: "POST",
          email: "pharma-learner@example.edu",
          body: {
            commandId: "CMD_START_PHARMA_001",
            runId,
          },
        },
      ),
      env,
    );
    assert.equal(started.status, 201, await started.clone().text());
    assert.equal((await started.json()).version, 1);

    const briefing = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}`, {
        email: "pharma-learner@example.edu",
      }),
      env,
    );
    assert.equal(briefing.status, 200, await briefing.clone().text());
    const briefingProjection = (await briefing.json()).projection;
    assert.equal(
      briefingProjection.presentation.currentNode.nodeType,
      "BRIEFING",
    );
    assert.equal(
      briefingProjection.presentation.currentNode.body.valuesByLocale.vi,
      "Hồ sơ chuyển giao đã ký còn nguyên vẹn, nhưng bản tóm tắt cảm biến ngoài chuỗi ghi nhận sai lệch nhiệt độ. Hãy quyết định có thể xuất lô hàng hay không.",
    );
    assert.equal(
      Object.hasOwn(briefingProjection, "actualState"),
      false,
    );

    const advanced = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "pharma-learner@example.edu",
        body: {
          commandType: "ADVANCE_WORKFLOW",
          commandId: "CMD_ADVANCE_PHARMA_001",
          runId,
          expectedRunVersion: 1,
        },
      }),
      env,
    );
    assert.equal(advanced.status, 200, await advanced.clone().text());
    const decisionProjection = (await advanced.json()).projection;
    assert.equal(decisionProjection.version, 4);
    assert.equal(
      decisionProjection.presentation.currentNode.nodeType,
      "DECISION",
    );
    assert.deepEqual(
      decisionProjection.informationState.map(
        (evidence) => evidence.recordId,
      ),
      ["EVID_PHARMA_SENSOR_SUMMARY"],
    );

    const inspected = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "pharma-learner@example.edu",
        body: {
          commandType: "INSPECT_EVIDENCE",
          commandId: "CMD_INSPECT_PHARMA_001",
          runId,
          expectedRunVersion: 4,
          evidenceId: "EVID_PHARMA_SENSOR_SUMMARY",
        },
      }),
      env,
    );
    assert.equal(inspected.status, 200, await inspected.clone().text());
    assert.equal((await inspected.json()).projection.version, 5);

    const decided = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "pharma-learner@example.edu",
        body: {
          commandType: "SUBMIT_STRUCTURED_DECISION",
          commandId: "CMD_DECIDE_PHARMA_001",
          runId,
          expectedRunVersion: 5,
          decisionId: "DECISION_PHARMA_RELEASE",
          responses: {
            shipmentAction: ["HOLD_AND_INVESTIGATE"],
          },
          justification:
            "Hold the shipment while the temperature excursion is investigated.",
        },
      }),
      env,
    );
    assert.equal(decided.status, 200, await decided.clone().text());
    const consequenceProjection = (await decided.json()).projection;
    assert.equal(consequenceProjection.version, 8);
    assert.equal(
      consequenceProjection.presentation.currentNode.nodeType,
      "CONSEQUENCE",
    );
    assert.equal(
      consequenceProjection.presentation.currentNode.message
        .valuesByLocale.vi,
      "Việc xuất hàng được tạm dừng trong khi điều tra sai lệch nhiệt độ. Quyết định này bảo vệ người bệnh và củng cố bằng chứng tuân thủ, nhưng gây chậm trễ vận hành.",
    );
    assert.deepEqual(
      consequenceProjection.workflowState.permittedActionIds,
      ["ADVANCE_WORKFLOW"],
    );

    const continued = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "pharma-learner@example.edu",
        body: {
          commandType: "ADVANCE_WORKFLOW",
          commandId: "CMD_CONTINUE_PHARMA_001",
          runId,
          expectedRunVersion: 8,
        },
      }),
      env,
    );
    assert.equal(continued.status, 200, await continued.clone().text());
    const completionProjection = (await continued.json()).projection;
    assert.equal(completionProjection.version, 11);
    assert.equal(
      completionProjection.presentation.currentNode.nodeType,
      "COMPLETION",
    );

    const replay = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/replay?sequence=11`, {
        email: "pharma-author@example.edu",
      }),
      env,
    );
    assert.equal(replay.status, 200, await replay.clone().text());
    assert.equal((await replay.json()).replay.totalEventCount, 11);

    const competency = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/competencies`, {
        email: "pharma-author@example.edu",
      }),
      env,
    );
    assert.equal(
      competency.status,
      200,
      await competency.clone().text(),
    );
    assert.deepEqual(
      (await competency.json()).competencies.map(
        (indicator) => indicator.indicatorId,
      ),
      ["PHARMA.COLD_CHAIN.PI1"],
    );

    const curriculumCrosswalkResponse = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_PHARMA_001/curriculum-crosswalks",
        { email: "pharma-author@example.edu" },
      ),
      env,
    );
    assert.equal(
      curriculumCrosswalkResponse.status,
      200,
      await curriculumCrosswalkResponse.clone().text(),
    );
    const curriculumCrosswalks = (
      await curriculumCrosswalkResponse.json()
    ).curriculumCrosswalks;
    assert.equal(curriculumCrosswalks.schemaVersion, "2.0.0");
    assert.equal(
      curriculumCrosswalks.interpretation,
      "EVIDENCE_CROSSWALK_NO_ATTAINMENT_INFERENCE",
    );
    assert.deepEqual(
      curriculumCrosswalks.competencyIndicators.map(
        (indicator) => ({
          competencyId: indicator.competencyId,
          competencyVersion: indicator.competencyVersion,
          indicatorId: indicator.indicatorId,
          indicatorVersion: indicator.indicatorVersion,
        }),
      ),
      [
        {
          competencyId: "PHARMA.COLD_CHAIN",
          competencyVersion: "1.2.0",
          indicatorId: "PHARMA.COLD_CHAIN.PI1",
          indicatorVersion: "1.1.0",
        },
      ],
    );
    assert.equal(curriculumCrosswalks.overlays.length, 2);
    const curriculumCrosswalk =
      curriculumCrosswalks.overlays.find(
        (overlay) => overlay.owner.ownerType === "COURSE",
      );
    assert.equal(
      curriculumCrosswalk.owner.ownerId,
      "TRACECHAIN_DEMO_COURSE",
    );
    assert.equal(
      curriculumCrosswalk.labelsByLocale.vi
        .externalFrameworkTitle,
      "Chuẩn đầu ra học phần dược phẩm thí điểm",
    );
    const evidenceOutcome =
      curriculumCrosswalk.classOutcomes.find(
        (outcome) =>
          outcome.outcomeId === "CLO_EVIDENCE_EVALUATION",
      );
    assert.deepEqual(evidenceOutcome.primaryIndicatorIds, [
      "PHARMA.COLD_CHAIN.PI1",
    ]);
    assert.equal(evidenceOutcome.learnersWithEvidence, 1);
    assert.equal(evidenceOutcome.evidenceObservationCount, 1);
    const learnerEvidence =
      curriculumCrosswalk.learners[0].outcomes.find(
        (outcome) =>
          outcome.outcomeId === "CLO_EVIDENCE_EVALUATION",
      );
    assert.equal(learnerEvidence.evidenceObservations.length, 1);
    assert.equal(
      learnerEvidence.evidenceObservations[0].sourceEventIds.length,
      1,
    );
    assert.equal(
      learnerEvidence.evidenceObservations[0].evidenceRuleVersion,
      "1.1.0",
    );
    assert.equal(
      typeof learnerEvidence.evidenceObservations[0]
        .sourceEventIds[0],
      "string",
    );
    assert.equal(Object.hasOwn(evidenceOutcome, "attainment"), false);
    assert.equal(Object.hasOwn(evidenceOutcome, "mastery"), false);
    const programOverlay = curriculumCrosswalks.overlays.find(
      (overlay) => overlay.owner.ownerType === "PROGRAM",
    );
    assert.equal(
      programOverlay.overlayId,
      "OVERLAY_PHARMA_PILOT_PROGRAM",
    );

    const curriculumCrosswalkDownload = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_PHARMA_001/curriculum-crosswalks.json",
        { email: "pharma-author@example.edu" },
      ),
      env,
    );
    assert.equal(
      curriculumCrosswalkDownload.status,
      200,
      await curriculumCrosswalkDownload.clone().text(),
    );
    assert.equal(
      curriculumCrosswalkDownload.headers.get(
        "content-disposition",
      ),
      'attachment; filename="TraceChain_ASSIGNMENT_PHARMA_001_curriculum_overlay_v2.json"',
    );

    const learnerCurriculumCrosswalk = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_PHARMA_001/curriculum-crosswalks",
        { email: "pharma-learner@example.edu" },
      ),
      env,
    );
    assert.equal(learnerCurriculumCrosswalk.status, 403);

    const withheldFeedback = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/feedback`, {
        email: "pharma-learner@example.edu",
      }),
      env,
    );
    assert.equal(withheldFeedback.status, 409);
    assert.equal(
      (await withheldFeedback.json()).error.code,
      "FEEDBACK_NOT_RELEASED",
    );

    const release = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_PHARMA_001/feedback-release",
        {
          method: "POST",
          email: "pharma-author@example.edu",
          body: {
            commandId: "CMD_RELEASE_PHARMA_FEEDBACK_001",
          },
        },
      ),
      env,
    );
    assert.equal(release.status, 200, await release.clone().text());

    const feedback = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/feedback`, {
        email: "pharma-learner@example.edu",
      }),
      env,
    );
    assert.equal(feedback.status, 200, await feedback.clone().text());
    const authoredFeedback = (await feedback.json()).authoredFeedback;
    assert.equal(authoredFeedback.length, 1);
    assert.equal(
      authoredFeedback[0].feedbackCode,
      "INTEGRITY_DOES_NOT_PROVE_STORAGE_CONDITIONS",
    );
    assert.match(
      authoredFeedback[0].message.valuesByLocale.en,
      /does not prove that storage conditions were acceptable/,
    );

    const outcomes = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_PHARMA_001/decision-outcomes",
        { email: "pharma-author@example.edu" },
      ),
      env,
    );
    assert.equal(outcomes.status, 200, await outcomes.clone().text());
    assert.deepEqual(
      (await outcomes.json()).decisionOutcomes.runs,
      [
        {
          runId,
          learnerUserId: "USER_LEARNER_PHARMA",
          status: "completed",
          decisionItems: [],
          realizedOutcome: null,
        },
      ],
    );

    const analyticsResponse = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_PHARMA_001/process-analytics",
        { email: "pharma-author@example.edu" },
      ),
      env,
    );
    assert.equal(
      analyticsResponse.status,
      200,
      await analyticsResponse.clone().text(),
    );
    const analytics = (await analyticsResponse.json()).analytics;
    assert.equal(
      analytics.interpretation,
      "DESCRIPTIVE_EVENT_LINKED_NO_LEARNER_TRAIT_INFERENCE",
    );
    assert.equal(analytics.summary.runCount, 1);
    assert.deepEqual(analytics.summary.evidenceInspectionCounts, {
      EVID_PHARMA_SENSOR_SUMMARY: 1,
    });
    assert.deepEqual(analytics.summary.decisionSubmissionCounts, {
      DECISION_PHARMA_RELEASE: 1,
    });
    assert.equal(
      typeof analytics.runs[0].evidenceInspectionOrder[0].eventId,
      "string",
    );
    assert.deepEqual(analytics.limitations, [
      "ELAPSED_INTERVAL_IS_NOT_ATTENTION",
      "NO_MOTIVATION_OR_ABILITY_INFERENCE",
      "NO_AUTOMATED_HIGH_STAKES_DECISION",
    ]);
    const learnerAnalyticsDenied = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_PHARMA_001/process-analytics",
        { email: "pharma-learner@example.edu" },
      ),
      env,
    );
    assert.equal(learnerAnalyticsDenied.status, 403);
    const outsideAnalyticsDenied = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_PHARMA_001/process-analytics",
        { email: "pharma-outside-instructor@example.edu" },
      ),
      env,
    );
    assert.equal(outsideAnalyticsDenied.status, 403);
  } finally {
    database.close();
  }
});

test("creates idempotent authenticated SCORM package jobs from generator artifacts", async () => {
  const database = new SqliteD1Database();
  const packageBytes = new TextEncoder().encode("verified-scorm-zip");
  const sha256 = createHash("sha256")
    .update(packageBytes)
    .digest("hex");
  const artifact = {
    presetId: "assessment",
    configurationSchemaVersion: "2",
    activityType: "OPERATIONS",
    supportProfile: "CHALLENGE",
    deliveryPurpose: "ASSESSMENT",
    outcomeStrategy: "FIXED",
    contentPackId: "PACK_SCORM_STANDARD_COFFEE",
    contentPackVersion: "2.3.0",
    scoringBlueprintId: "SCORING_COFFEE_100",
    scoringBlueprintVersion: "1.0.0",
    title: "TraceChain Assessment",
    filename: "TraceChain_Assessment_NON_RELEASE.zip",
    downloadPath: `/scorm-packages/${sha256}.zip`,
    sha256,
    sizeBytes: packageBytes.byteLength,
    release: false,
    configurationHash: "a".repeat(64),
    scenarioId: "SCN_COFFEE_001",
    scenarioVersion: "2.2.0",
    applicationBuildHash: "b".repeat(64),
    sourceCommit: "553f7c72f37b4dfcecc99ecce4b8c0678b23fa38",
    generatedAt: "2026-07-24T03:00:00.000Z",
    cryptographicEvidenceSchemaVersion: "2",
  };
  const { env } = createAssetEnvironment({
    "/scorm-packages/catalog.json": {
      body: JSON.stringify({
        schemaVersion: "2.0.0",
        generatedAt: artifact.generatedAt,
        sourceCommit: artifact.sourceCommit,
        applicationBuildHash: artifact.applicationBuildHash,
        release: false,
        packages: [artifact],
      }),
      contentType: "application/json",
    },
    [artifact.downloadPath]: {
      body: packageBytes,
      contentType: "application/zip",
    },
  });
  const bucket = createArtifactBucket();
  env.DB = database;
  env.ARTIFACTS = bucket;
  try {
    await worker.fetch(apiRequest("/api/v1/session"), env);
    seedUser(
      database,
      "USER_PACKAGE_INSTRUCTOR",
      "package-instructor@example.edu",
      ["instructor"],
    );
    const body = {
      commandId: "CMD_PACKAGE_ASSESSMENT_001",
      jobId: "JOB_PACKAGE_ASSESSMENT_001",
      presetId: "assessment",
    };
    const created = await worker.fetch(
      apiRequest("/api/v1/scorm-package-jobs", {
        method: "POST",
        email: "package-instructor@example.edu",
        body,
      }),
      env,
    );
    assert.equal(created.status, 201, await created.clone().text());
    const createdBody = await created.json();
    assert.equal(createdBody.wasIdempotentReplay, false);
    assert.deepEqual(
      {
        jobId: createdBody.job.jobId,
        presetId: createdBody.job.presetId,
        status: createdBody.job.status,
        release: createdBody.job.release,
        sha256: createdBody.job.sha256,
      },
      {
        jobId: body.jobId,
        presetId: "assessment",
        status: "completed",
        release: false,
        sha256,
      },
    );

    const replayed = await worker.fetch(
      apiRequest("/api/v1/scorm-package-jobs", {
        method: "POST",
        email: "package-instructor@example.edu",
        body,
      }),
      env,
    );
    assert.equal(replayed.status, 200, await replayed.clone().text());
    assert.equal((await replayed.json()).wasIdempotentReplay, true);

    const listed = await worker.fetch(
      apiRequest("/api/v1/scorm-package-jobs", {
        email: "package-instructor@example.edu",
      }),
      env,
    );
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).jobs.length, 1);

    const downloaded = await worker.fetch(
      apiRequest(
        `/api/v1/scorm-package-jobs/${body.jobId}/download`,
        { email: "package-instructor@example.edu" },
      ),
      env,
    );
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get("x-content-sha256"), sha256);
    assert.deepEqual(
      new Uint8Array(await downloaded.arrayBuffer()),
      packageBytes,
    );
    assert.equal(bucket.objects.size, 1);
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
    seedUser(
      database,
      "USER_LEARNER_UNASSIGNED",
      "unassigned-learner@example.edu",
      ["learner"],
    );
    seedUser(
      database,
      "USER_LEARNER_DISABLED",
      "disabled-learner@example.edu",
      ["learner"],
    );
    database.sqlite
      .prepare(
        "UPDATE application_users SET status = 'disabled' WHERE user_id = ?",
      )
      .run("USER_LEARNER_DISABLED");
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

    const assignmentOptions = await worker.fetch(
      apiRequest("/api/v1/assignment-options", {
        email: "assignment-instructor@example.edu",
      }),
      env,
    );
    assert.equal(
      assignmentOptions.status,
      200,
      await assignmentOptions.clone().text(),
    );
    const available = (await assignmentOptions.json()).options;
    assert.equal(available.length, 2);
    const coffeeOption = available.find(
      ({ scenarioId }) =>
        scenarioId === pack.scenarios[0].scenarioId,
    );
    assert.notEqual(coffeeOption, undefined);
    assert.deepEqual(
      {
        packId: coffeeOption.packId,
        packVersion: coffeeOption.packVersion,
        scenarioId: coffeeOption.scenarioId,
        scenarioVersion: coffeeOption.scenarioVersion,
        supportedModes: coffeeOption.supportedModes,
        modeConfigurations: coffeeOption.modeConfigurations,
      },
      {
        packId: pack.packId,
        packVersion: pack.version,
        scenarioId: pack.scenarios[0].scenarioId,
        scenarioVersion: pack.scenarios[0].version,
        supportedModes: pack.scenarios[0].supportedModes,
        modeConfigurations: pack.scenarios[0].modeConfigurations,
      },
    );
    assert.deepEqual(
      coffeeOption.counterfactualDecisionPoints.map((point) => ({
        nodeId: point.nodeId,
        decisionId: point.decisionId,
      })),
      [
        {
          nodeId: "NODE_CERTIFICATE_DECISION",
          decisionId: "INT_CERTIFICATE_INITIAL_SUBMITTED",
        },
        {
          nodeId: "NODE_DISCREPANCY_DECISION",
          decisionId: "INT_DISCREPANCY_INITIAL_SUBMITTED",
        },
        {
          nodeId: "NODE_RECALL_SCOPE_DECISION",
          decisionId: "INT_RECALL_SCOPE",
        },
      ],
    );
    assert.equal(Object.hasOwn(coffeeOption, "initialState"), false);

    const learnerOptions = await worker.fetch(
      apiRequest("/api/v1/assignment-learners", {
        email: "assignment-instructor@example.edu",
      }),
      env,
    );
    assert.equal(
      learnerOptions.status,
      200,
      await learnerOptions.clone().text(),
    );
    assert.deepEqual((await learnerOptions.json()).learners, [
      {
        schemaVersion: "1.0.0",
        userId: "USER_LEARNER_ASSIGNMENT",
        email: "assignment-learner@example.edu",
      },
      {
        schemaVersion: "1.0.0",
        userId: "USER_LEARNER_UNASSIGNED",
        email: "unassigned-learner@example.edu",
      },
    ]);
    const learnerRosterDenied = await worker.fetch(
      apiRequest("/api/v1/assignment-learners", {
        email: "assignment-learner@example.edu",
      }),
      env,
    );
    assert.equal(learnerRosterDenied.status, 403);
    assert.equal(
      (await learnerRosterDenied.json()).error.code,
      "APPLICATION_ROLE_REQUIRED",
    );

    const assignmentBody = {
      commandId: "COMMAND_ASSIGNMENT_CREATE_001",
      assignmentId: "ASSIGNMENT_COFFEE_001",
      title: "Coffee governance cohort",
      packId: pack.packId,
      packVersion: pack.version,
      scenarioId: pack.scenarios[0].scenarioId,
      scenarioVersion: pack.scenarios[0].version,
      mode: "standard",
      counterfactualReplay: disabledCounterfactualReplay,
      research: { enabled: false },
      runConfiguration: pack.scenarios[0].modeConfigurations.find(
        (configuration) => configuration.mode === "standard",
      ),
      availableFrom: "2020-01-01T00:00:00.000Z",
      availableUntil: "2999-01-01T00:00:00.000Z",
      learnerUserIds: ["USER_LEARNER_ASSIGNMENT"],
    };
    const unknownCounterfactualPoint = await worker.fetch(
      apiRequest("/api/v1/assignments", {
        method: "POST",
        email: "assignment-instructor@example.edu",
        body: {
          ...assignmentBody,
          commandId: "COMMAND_ASSIGNMENT_INVALID_COUNTERFACTUAL",
          assignmentId: "ASSIGNMENT_INVALID_COUNTERFACTUAL",
          mode: "sandbox",
          counterfactualReplay: {
            enabled: true,
            allowedDecisionNodeIds: ["NODE_NOT_IN_SCENARIO"],
            maximumBranchesPerLearner: 1,
            learnerAvailability: "AFTER_RUN_COMPLETION",
            requireReflection: false,
          },
        },
      }),
      env,
    );
    assert.equal(unknownCounterfactualPoint.status, 400);
    assert.equal(
      (await unknownCounterfactualPoint.json()).error.code,
      "INVALID_ASSIGNMENT",
    );
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
    assert.deepEqual(
      {
        configurationSchemaVersion:
          created.assignment.experienceConfiguration
            .configurationSchemaVersion,
        activityType:
          created.assignment.experienceConfiguration.activityType,
        supportProfile:
          created.assignment.experienceConfiguration.supportProfile,
        deliveryPurpose:
          created.assignment.experienceConfiguration.deliveryPurpose,
        outcomeStrategy:
          created.assignment.experienceConfiguration.outcomeStrategy,
      },
      {
        configurationSchemaVersion: "2",
        activityType: "OPERATIONS",
        supportProfile: "CHALLENGE",
        deliveryPurpose: "ASSESSMENT",
        outcomeStrategy: "FIXED",
      },
    );
    assert.match(
      created.assignment.experienceConfigurationHash,
      /^[a-f0-9]{64}$/u,
    );
    assert.deepEqual(created.assignment, {
      schemaVersion: "2.0.0",
      assignmentId: "ASSIGNMENT_COFFEE_001",
      title: "Coffee governance cohort",
      packId: pack.packId,
      packVersion: pack.version,
      scenarioId: pack.scenarios[0].scenarioId,
      scenarioVersion: pack.scenarios[0].version,
      mode: "standard",
      runConfiguration: assignmentBody.runConfiguration,
      experienceConfiguration:
        created.assignment.experienceConfiguration,
      experienceConfigurationHash:
        created.assignment.experienceConfigurationHash,
      counterfactualReplay: disabledCounterfactualReplay,
      research: { enabled: false },
      learnerUserIds: ["USER_LEARNER_ASSIGNMENT"],
      status: "active",
      availableFrom: assignmentBody.availableFrom,
      availableUntil: assignmentBody.availableUntil,
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

    const learnerAssignments = await worker.fetch(
      apiRequest("/api/v1/learner/assignments", {
        email: "assignment-learner@example.edu",
      }),
      env,
    );
    assert.equal(
      learnerAssignments.status,
      200,
      await learnerAssignments.clone().text(),
    );
    const learnerAssignmentBody = await learnerAssignments.json();
    assert.equal(learnerAssignmentBody.assignments.length, 1);
    assert.equal(
      learnerAssignmentBody.assignments[0].assignment.assignmentId,
      "ASSIGNMENT_COFFEE_001",
    );
    assert.equal(
      learnerAssignmentBody.assignments[0].startAvailability.status,
      "available",
    );
    assert.match(
      learnerAssignmentBody.assignments[0].startAvailability.observedAt,
      /^\d{4}-\d{2}-\d{2}T/u,
    );
    assert.deepEqual(learnerAssignmentBody.assignments[0].runs, []);

    const unassignedAssignments = await worker.fetch(
      apiRequest("/api/v1/learner/assignments", {
        email: "unassigned-learner@example.edu",
      }),
      env,
    );
    assert.equal(
      unassignedAssignments.status,
      200,
      await unassignedAssignments.clone().text(),
    );
    assert.deepEqual(
      (await unassignedAssignments.json()).assignments,
      [],
    );

    const rejectedStart = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_COFFEE_001/start-run",
        {
          method: "POST",
          email: "unassigned-learner@example.edu",
          body: {
            commandId: "COMMAND_UNASSIGNED_RUN_001",
            runId: "RUN_UNASSIGNED_COFFEE_001",
          },
        },
      ),
      env,
    );
    assert.equal(rejectedStart.status, 400);
    assert.equal(
      (await rejectedStart.json()).error.code,
      "INVALID_ASSIGNMENT",
    );

    const start = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_COFFEE_001/start-run",
        {
          method: "POST",
          email: "assignment-learner@example.edu",
          body: {
            commandId: "COMMAND_ASSIGNMENT_RUN_001",
            runId: "RUN_ASSIGNMENT_COFFEE_001",
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

    const closed = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_COFFEE_001/close",
        {
          method: "POST",
          email: "assignment-instructor@example.edu",
          body: {
            commandId: "COMMAND_ASSIGNMENT_CLOSE_001",
          },
        },
      ),
      env,
    );
    assert.equal(closed.status, 201, await closed.clone().text());
    const closedBody = await closed.json();
    assert.equal(closedBody.assignment.status, "closed");
    assert.equal(
      closedBody.assignment.closedByUserId,
      "USER_INSTRUCTOR_ASSIGNMENT",
    );
    assert.match(
      closedBody.assignment.closedAt,
      /^\d{4}-\d{2}-\d{2}T/u,
    );
    assert.equal(closedBody.wasIdempotentReplay, false);

    const repeatedClose = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_COFFEE_001/close",
        {
          method: "POST",
          email: "assignment-instructor@example.edu",
          body: {
            commandId: "COMMAND_ASSIGNMENT_CLOSE_001",
          },
        },
      ),
      env,
    );
    assert.equal(
      repeatedClose.status,
      200,
      await repeatedClose.clone().text(),
    );
    assert.equal(
      (await repeatedClose.json()).wasIdempotentReplay,
      true,
    );

    const conflictingClose = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_COFFEE_001/close",
        {
          method: "POST",
          email: "assignment-instructor@example.edu",
          body: {
            commandId: "COMMAND_ASSIGNMENT_CLOSE_CONFLICT",
          },
        },
      ),
      env,
    );
    assert.equal(conflictingClose.status, 409);
    assert.equal(
      (await conflictingClose.json()).error.code,
      "ASSIGNMENT_ALREADY_CLOSED",
    );

    const learnerClose = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_COFFEE_001/close",
        {
          method: "POST",
          email: "assignment-learner@example.edu",
          body: {
            commandId: "COMMAND_LEARNER_CLOSE_001",
          },
        },
      ),
      env,
    );
    assert.equal(learnerClose.status, 403);
    assert.equal(
      (await learnerClose.json()).error.code,
      "APPLICATION_ROLE_REQUIRED",
    );

    const closedStart = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_COFFEE_001/start-run",
        {
          method: "POST",
          email: "assignment-learner@example.edu",
          body: {
            commandId: "COMMAND_CLOSED_RUN_001",
            runId: "RUN_CLOSED_COFFEE_001",
          },
        },
      ),
      env,
    );
    assert.equal(closedStart.status, 409);
    assert.equal(
      (await closedStart.json()).error.code,
      "ASSIGNMENT_CLOSED",
    );

    const resumedAssignments = await worker.fetch(
      apiRequest("/api/v1/learner/assignments", {
        email: "assignment-learner@example.edu",
      }),
      env,
    );
    assert.equal(
      resumedAssignments.status,
      200,
      await resumedAssignments.clone().text(),
    );
    const resumedAssignmentBody = await resumedAssignments.json();
    assert.equal(
      resumedAssignmentBody.assignments[0].startAvailability.status,
      "closed",
    );
    assert.deepEqual(
      resumedAssignmentBody.assignments[0].runs.map(
        (run) => run.runId,
      ),
      ["RUN_ASSIGNMENT_COFFEE_001"],
    );

    const invalidAvailability = await worker.fetch(
      apiRequest("/api/v1/assignments", {
        method: "POST",
        email: "assignment-instructor@example.edu",
        body: {
          ...assignmentBody,
          commandId: "COMMAND_ASSIGNMENT_INVALID_WINDOW_001",
          assignmentId: "ASSIGNMENT_INVALID_WINDOW_001",
          availableFrom: "2999-01-01T00:00:00.000Z",
          availableUntil: "2020-01-01T00:00:00.000Z",
        },
      }),
      env,
    );
    assert.equal(invalidAvailability.status, 400);
    assert.equal(
      (await invalidAvailability.json()).error.code,
      "INVALID_ASSIGNMENT",
    );

    const futureAssignmentBody = {
      ...assignmentBody,
      commandId: "COMMAND_ASSIGNMENT_FUTURE_001",
      assignmentId: "ASSIGNMENT_FUTURE_001",
      title: "Future coffee cohort",
      availableFrom: "2999-01-01T00:00:00.000Z",
      availableUntil: undefined,
    };
    const futureAssignment = await worker.fetch(
      apiRequest("/api/v1/assignments", {
        method: "POST",
        email: "assignment-instructor@example.edu",
        body: futureAssignmentBody,
      }),
      env,
    );
    assert.equal(
      futureAssignment.status,
      201,
      await futureAssignment.clone().text(),
    );
    const assignmentsWithFuture = await worker.fetch(
      apiRequest("/api/v1/learner/assignments", {
        email: "assignment-learner@example.edu",
      }),
      env,
    );
    assert.equal(
      assignmentsWithFuture.status,
      200,
      await assignmentsWithFuture.clone().text(),
    );
    const futureLearnerAssignment = (
      await assignmentsWithFuture.json()
    ).assignments.find(
      ({ assignment }) =>
        assignment.assignmentId === "ASSIGNMENT_FUTURE_001",
    );
    assert.equal(
      futureLearnerAssignment.startAvailability.status,
      "not-yet-open",
    );
    const futureStart = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_FUTURE_001/start-run",
        {
          method: "POST",
          email: "assignment-learner@example.edu",
          body: {
            commandId: "COMMAND_FUTURE_RUN_001",
            runId: "RUN_FUTURE_COFFEE_001",
          },
        },
      ),
      env,
    );
    assert.equal(futureStart.status, 409);
    assert.equal(
      (await futureStart.json()).error.code,
      "ASSIGNMENT_NOT_YET_AVAILABLE",
    );

    const invalidResearchAssignment = await worker.fetch(
      apiRequest("/api/v1/assignments", {
        method: "POST",
        email: "assignment-instructor@example.edu",
        body: {
          ...assignmentBody,
          commandId: "COMMAND_ASSIGNMENT_RESEARCH_INVALID_001",
          assignmentId: "ASSIGNMENT_RESEARCH_INVALID_001",
          mode: "tutorial",
          research: {
            enabled: true,
            experimentalConditionId: "CONDITION_GUIDED",
            randomAssignmentRecordId: "RANDOMIZATION_001",
            fixedScenarioSeed: "SEED_RESEARCH_001",
            consentStatusReference: "CONSENT_RECORD_001",
            blindedRaters: true,
            interventionVersion: "1.0.0",
            retentionPolicyReference: "RETENTION_POLICY_001",
          },
          availableFrom: undefined,
          availableUntil: undefined,
        },
      }),
      env,
    );
    assert.equal(invalidResearchAssignment.status, 400);
    assert.equal(
      (await invalidResearchAssignment.json()).error.code,
      "INVALID_ASSIGNMENT",
    );

    const researchConfiguration = {
      enabled: true,
      experimentalConditionId: "CONDITION_STANDARD",
      randomAssignmentRecordId: "RANDOMIZATION_002",
      fixedScenarioSeed: "SEED_RESEARCH_002",
      consentStatusReference: "CONSENT_RECORD_002",
      preTestLinkageId: "PRETEST_002",
      postTestLinkageId: "POSTTEST_002",
      blindedRaters: true,
      interventionVersion: "1.0.0",
      retentionPolicyReference: "RETENTION_POLICY_001",
    };
    const researchAssignment = await worker.fetch(
      apiRequest("/api/v1/assignments", {
        method: "POST",
        email: "assignment-instructor@example.edu",
        body: {
          ...assignmentBody,
          commandId: "COMMAND_ASSIGNMENT_RESEARCH_001",
          assignmentId: "ASSIGNMENT_RESEARCH_001",
          title: "Controlled coffee condition",
          research: researchConfiguration,
          availableFrom: undefined,
          availableUntil: undefined,
        },
      }),
      env,
    );
    assert.equal(
      researchAssignment.status,
      201,
      await researchAssignment.clone().text(),
    );
    assert.deepEqual(
      (await researchAssignment.json()).assignment.research,
      researchConfiguration,
    );
    const researchRunId = "RUN_RESEARCH_COFFEE_001";
    const researchStart = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_RESEARCH_001/start-run",
        {
          method: "POST",
          email: "assignment-learner@example.edu",
          body: {
            commandId: "COMMAND_RESEARCH_RUN_001",
            runId: researchRunId,
          },
        },
      ),
      env,
    );
    assert.equal(
      researchStart.status,
      201,
      await researchStart.clone().text(),
    );
    const researchTimelineResponse = await worker.fetch(
      apiRequest(`/api/v1/runs/${researchRunId}/timeline`, {
        email: "assignment-instructor@example.edu",
      }),
      env,
    );
    assert.equal(researchTimelineResponse.status, 200);
    const researchTimeline = (
      await researchTimelineResponse.json()
    ).timeline;
    assert.equal(
      researchTimeline[0].payload.scenarioSeed,
      "SEED_RESEARCH_002",
    );
    const researchExportResponse = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_RESEARCH_001/export.json?identity=pseudonymous",
        { email: "assignment-instructor@example.edu" },
      ),
      env,
    );
    assert.equal(
      researchExportResponse.status,
      200,
      await researchExportResponse.clone().text(),
    );
    const researchExport = await researchExportResponse.json();
    assert.equal(researchExport.schemaVersion, "2.0.0");
    assert.equal(
      researchExport.researchMetadata.experimentalConditionId,
      "CONDITION_STANDARD",
    );
    assert.equal(researchExport.researchMetadata.deidentified, true);
    assert.match(
      researchExport.participants[0].researchParticipantId,
      /^LEARNER_[A-F0-9]{24}$/u,
    );
    assert.equal(
      JSON.stringify(researchExport).includes(
        "USER_LEARNER_ASSIGNMENT",
      ),
      false,
    );
  } finally {
    database.close();
  }
});

test("creates and resumes the built-in Technical Laboratory through hosted D1 APIs", async () => {
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
      "USER_INSTRUCTOR_TECHNICAL_LAB",
      "technical-lab-instructor@example.edu",
      ["instructor"],
    );
    seedUser(
      database,
      "USER_LEARNER_TECHNICAL_LAB",
      "technical-lab-learner@example.edu",
      ["learner"],
    );

    const optionsResponse = await worker.fetch(
      apiRequest("/api/v1/assignment-options", {
        email: "technical-lab-instructor@example.edu",
      }),
      env,
    );
    assert.equal(
      optionsResponse.status,
      200,
      await optionsResponse.clone().text(),
    );
    const technicalOption = (
      await optionsResponse.json()
    ).options.find(
      ({ packId }) =>
        packId === "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS",
    );
    assert.notEqual(technicalOption, undefined);
    assert.deepEqual(
      {
        scenarioId: technicalOption.scenarioId,
        supportedModes: technicalOption.supportedModes,
        runtimeId:
          technicalOption.experienceConfigurations[0]
            .configuration.activityType,
      },
      {
        scenarioId: "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS",
        supportedModes: ["tutorial"],
        runtimeId: "TECHNICAL_LAB",
      },
    );

    const assignmentId = "ASSIGNMENT_TECHNICAL_LAB_SITE";
    const createAssignment = await worker.fetch(
      apiRequest("/api/v1/assignments", {
        method: "POST",
        email: "technical-lab-instructor@example.edu",
        body: {
          commandId: "COMMAND_CREATE_TECHNICAL_LAB_ASSIGNMENT",
          assignmentId,
          title: "Permissioned blockchain foundations",
          packId: technicalOption.packId,
          packVersion: technicalOption.packVersion,
          scenarioId: technicalOption.scenarioId,
          scenarioVersion: technicalOption.scenarioVersion,
          mode: "tutorial",
          counterfactualReplay: disabledCounterfactualReplay,
          research: { enabled: false },
          availableFrom: "2020-01-01T00:00:00.000Z",
          availableUntil: "2999-01-01T00:00:00.000Z",
          learnerUserIds: ["USER_LEARNER_TECHNICAL_LAB"],
        },
      }),
      env,
    );
    assert.equal(
      createAssignment.status,
      201,
      await createAssignment.clone().text(),
    );
    const assignment = (await createAssignment.json()).assignment;
    assert.equal(
      assignment.experienceConfiguration.activityType,
      "TECHNICAL_LAB",
    );
    assert.equal(
      assignment.experienceConfiguration.delivery.channel,
      "HOSTED",
    );

    const runId = "RUN_TECHNICAL_LAB_SITE";
    const start = await worker.fetch(
      apiRequest(
        `/api/v1/assignments/${assignmentId}/start-run`,
        {
          method: "POST",
          email: "technical-lab-learner@example.edu",
          body: {
            commandId: "COMMAND_START_TECHNICAL_LAB_SITE",
            runId,
          },
        },
      ),
      env,
    );
    assert.equal(start.status, 201, await start.clone().text());
    assert.equal((await start.json()).version, 1);

    const loaded = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}`, {
        email: "technical-lab-learner@example.edu",
      }),
      env,
    );
    assert.equal(loaded.status, 200, await loaded.clone().text());
    const initialProjection = (await loaded.json()).projection;
    assert.equal(initialProjection.technicalLab.labPackVersion, "1.0.0");
    assert.equal(
      initialProjection.technicalLab.replay.modules[0].module.moduleId,
      "TL1",
    );
    assert.equal(
      initialProjection.technicalLab.replay.expectedAction.actionType,
      "VIEW_INPUT",
    );

    const action = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "technical-lab-learner@example.edu",
        body: {
          commandType: "PERFORM_TECHNICAL_LAB_ACTION",
          commandId: "COMMAND_TECHNICAL_LAB_VIEW_INPUT",
          runId,
          expectedRunVersion: 1,
          actionType: "VIEW_INPUT",
        },
      }),
      env,
    );
    assert.equal(action.status, 200, await action.clone().text());
    const progressedProjection = (await action.json()).projection;
    assert.equal(progressedProjection.version, 2);
    assert.equal(
      progressedProjection.technicalLab.replay.expectedAction
        .actionType,
      "HASH",
    );

    const resumed = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}`, {
        email: "technical-lab-learner@example.edu",
      }),
      env,
    );
    assert.equal(resumed.status, 200, await resumed.clone().text());
    assert.deepEqual(
      (await resumed.json()).projection.technicalLab.replay,
      progressedProjection.technicalLab.replay,
    );

    const timeline = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/timeline`, {
        email: "technical-lab-instructor@example.edu",
      }),
      env,
    );
    assert.equal(timeline.status, 200, await timeline.clone().text());
    assert.deepEqual(
      (await timeline.json()).timeline.map(
        ({ eventType }) => eventType,
      ),
      ["RUN_CREATED", "TECHNICAL_LAB_ACTION_PERFORMED"],
    );

    const report = await worker.fetch(
      apiRequest(
        `/api/v1/assignments/${assignmentId}/technical-lab-report`,
        {
          email: "technical-lab-instructor@example.edu",
        },
      ),
      env,
    );
    assert.equal(report.status, 200, await report.clone().text());
    const technicalLabReport = (
      await report.json()
    ).technicalLabReport;
    assert.equal(
      technicalLabReport.reportType,
      "TRACECHAIN_TECHNICAL_LAB_ASSIGNMENT_REPORT",
    );
    assert.equal(technicalLabReport.summary.runCount, 1);
    assert.equal(technicalLabReport.summary.completedRunCount, 0);
    assert.equal(technicalLabReport.runs[0].currentModuleId, "TL1");
    assert.equal(
      technicalLabReport.runs[0].modules[0].experimentComplete,
      false,
    );
  } finally {
    database.close();
  }
});

test("runs the fixed Guided Audit through published assignment, D1, and replay APIs", async () => {
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
      "USER_INSTRUCTOR_GUIDED_AUDIT",
      "guided-audit-instructor@example.edu",
      ["instructor", "scenario-author"],
    );
    seedUser(
      database,
      "USER_LEARNER_GUIDED_AUDIT",
      "guided-audit-learner@example.edu",
      ["learner"],
    );

    const pack = await guidedCoffeeAuditPack();
    const publish = await worker.fetch(
      apiRequest("/api/v1/scenario-packs/publish", {
        method: "POST",
        email: "guided-audit-instructor@example.edu",
        body: { pack },
      }),
      env,
    );
    assert.equal(publish.status, 201, await publish.clone().text());

    const assignmentId = "ASSIGNMENT_GUIDED_AUDIT_SITE";
    const createAssignment = await worker.fetch(
      apiRequest("/api/v1/assignments", {
        method: "POST",
        email: "guided-audit-instructor@example.edu",
        body: {
          commandId: "COMMAND_CREATE_GUIDED_AUDIT_ASSIGNMENT",
          assignmentId,
          title: "Guided coffee control audit",
          packId: pack.packId,
          packVersion: pack.version,
          scenarioId: pack.scenarios[0].scenarioId,
          scenarioVersion: pack.scenarios[0].version,
          mode: "tutorial",
          counterfactualReplay: disabledCounterfactualReplay,
          research: { enabled: false },
          availableFrom: "2020-01-01T00:00:00.000Z",
          availableUntil: "2999-01-01T00:00:00.000Z",
          learnerUserIds: ["USER_LEARNER_GUIDED_AUDIT"],
        },
      }),
      env,
    );
    assert.equal(
      createAssignment.status,
      201,
      await createAssignment.clone().text(),
    );

    const runId = "RUN_GUIDED_AUDIT_SITE";
    const start = await worker.fetch(
      apiRequest(
        `/api/v1/assignments/${assignmentId}/start-run`,
        {
          method: "POST",
          email: "guided-audit-learner@example.edu",
          body: {
            commandId: "COMMAND_START_GUIDED_AUDIT_SITE",
            runId,
          },
        },
      ),
      env,
    );
    assert.equal(start.status, 201, await start.clone().text());
    assert.equal((await start.json()).version, 2);

    const loaded = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}`, {
        email: "guided-audit-learner@example.edu",
      }),
      env,
    );
    assert.equal(loaded.status, 200, await loaded.clone().text());
    const initialProjection = (await loaded.json()).projection;
    assert.equal(
      initialProjection.audit.auditCaseId,
      "AUDIT_COFFEE_CONTROLS_001",
    );
    assert.equal(
      initialProjection.ledgerState.transactions.some(
        (transaction) =>
          transaction.transactionId === "ATTEMPT_RECALL_001",
      ),
      false,
    );
    assert.equal(
      initialProjection.audit.sourceRecords.some(
        (record) =>
          record.sourceRecordId === "ATTEMPT_RECALL_001" &&
          record.recordKind === "ATTEMPT_AUDIT",
      ),
      true,
    );

    const inspect = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "guided-audit-learner@example.edu",
        body: {
          commandType: "INSPECT_AUDIT_EVIDENCE",
          commandId: "COMMAND_INSPECT_GUIDED_AUDIT_SITE",
          runId,
          expectedRunVersion: 2,
          evidenceId: "EVID_AUD_CERTIFICATE",
        },
      }),
      env,
    );
    assert.equal(inspect.status, 200, await inspect.clone().text());
    const inspectedProjection = (await inspect.json()).projection;
    assert.equal(inspectedProjection.version, 3);
    assert.equal(
      inspectedProjection.audit.evidence.find(
        (evidence) =>
          evidence.evidenceId === "EVID_AUD_CERTIFICATE",
      ).inspected,
      true,
    );

    const replay = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/replay?sequence=3`, {
        email: "guided-audit-instructor@example.edu",
      }),
      env,
    );
    assert.equal(replay.status, 200, await replay.clone().text());
    assert.equal(
      (await replay.json()).replay.projection.audit.auditCaseId,
      "AUDIT_COFFEE_CONTROLS_001",
    );

    const classAuditReport = await worker.fetch(
      apiRequest(
        `/api/v1/assignments/${assignmentId}/audit-report`,
        {
          email: "guided-audit-instructor@example.edu",
        },
      ),
      env,
    );
    assert.equal(
      classAuditReport.status,
      200,
      await classAuditReport.clone().text(),
    );
    const auditReport = (await classAuditReport.json()).auditReport;
    assert.equal(
      auditReport.reportType,
      "TRACECHAIN_AUDIT_ASSIGNMENT_REPORT",
    );
    assert.equal(auditReport.reviewOnly, true);
    assert.equal(auditReport.officialScoresUnchanged, true);
    assert.equal(auditReport.summary.runCount, 1);
    assert.equal(auditReport.runs[0].auditCaseId, "AUDIT_COFFEE_CONTROLS_001");
    assert.equal(auditReport.calibration, null);
  } finally {
    database.close();
  }
});

test("runs the bounded Practice Audit with on-request hints through D1 and replay APIs", async () => {
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
      "USER_INSTRUCTOR_PRACTICE_AUDIT",
      "practice-audit-instructor@example.edu",
      ["instructor", "scenario-author"],
    );
    seedUser(
      database,
      "USER_LEARNER_PRACTICE_AUDIT",
      "practice-audit-learner@example.edu",
      ["learner"],
    );

    const pack = await practiceCoffeeAuditPack();
    const publish = await worker.fetch(
      apiRequest("/api/v1/scenario-packs/publish", {
        method: "POST",
        email: "practice-audit-instructor@example.edu",
        body: { pack },
      }),
      env,
    );
    assert.equal(publish.status, 201, await publish.clone().text());

    const assignmentId = "ASSIGNMENT_PRACTICE_AUDIT_SITE";
    const createAssignment = await worker.fetch(
      apiRequest("/api/v1/assignments", {
        method: "POST",
        email: "practice-audit-instructor@example.edu",
        body: {
          commandId: "COMMAND_CREATE_PRACTICE_AUDIT_ASSIGNMENT",
          assignmentId,
          title: "Practice coffee controls audit",
          packId: pack.packId,
          packVersion: pack.version,
          scenarioId: pack.scenarios[0].scenarioId,
          scenarioVersion: pack.scenarios[0].version,
          mode: "standard",
          counterfactualReplay: disabledCounterfactualReplay,
          research: { enabled: false },
          availableFrom: "2020-01-01T00:00:00.000Z",
          availableUntil: "2999-01-01T00:00:00.000Z",
          learnerUserIds: ["USER_LEARNER_PRACTICE_AUDIT"],
        },
      }),
      env,
    );
    assert.equal(
      createAssignment.status,
      201,
      await createAssignment.clone().text(),
    );

    const runId = "RUN_PRACTICE_AUDIT_SITE";
    const start = await worker.fetch(
      apiRequest(
        `/api/v1/assignments/${assignmentId}/start-run`,
        {
          method: "POST",
          email: "practice-audit-learner@example.edu",
          body: {
            commandId: "COMMAND_START_PRACTICE_AUDIT_SITE",
            runId,
          },
        },
      ),
      env,
    );
    assert.equal(start.status, 201, await start.clone().text());
    assert.equal((await start.json()).version, 2);

    const loaded = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}`, {
        email: "practice-audit-learner@example.edu",
      }),
      env,
    );
    assert.equal(loaded.status, 200, await loaded.clone().text());
    const initialProjection = (await loaded.json()).projection;
    assert.equal(
      initialProjection.audit.auditCaseId,
      "AUDIT_COFFEE_CONTROLS_PRACTICE_001",
    );
    assert.equal(initialProjection.audit.supportProfile, "PRACTICE");
    assert.equal(
      initialProjection.audit.inputLimits.maximumDraftRecords,
      1,
    );
    assert.equal(initialProjection.audit.hints.length, 3);
    assert.equal(
      initialProjection.audit.sourceRecords.some(
        (record) =>
          record.sourceRecordId === "TX_CUSTODY_204" &&
          record.recordKind === "ATTEMPT_AUDIT",
      ),
      true,
    );
    assert.equal(
      initialProjection.ledgerState.transactions.some(
        (transaction) =>
          transaction.transactionId === "TX_CUSTODY_204",
      ),
      false,
    );

    const hint = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/commands`, {
        method: "POST",
        email: "practice-audit-learner@example.edu",
        body: {
          commandType: "VIEW_AUDIT_HINT",
          commandId: "COMMAND_VIEW_PRACTICE_AUDIT_HINT",
          runId,
          expectedRunVersion: 2,
          hintId: "HINT_AUTHORIZATION_COMPARISON",
        },
      }),
      env,
    );
    assert.equal(hint.status, 200, await hint.clone().text());
    const hintedProjection = (await hint.json()).projection;
    assert.equal(hintedProjection.version, 3);
    assert.equal(
      hintedProjection.audit.hints.find(
        (item) =>
          item.hintId === "HINT_AUTHORIZATION_COMPARISON",
      ).viewed,
      true,
    );

    const replay = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/replay?sequence=3`, {
        email: "practice-audit-instructor@example.edu",
      }),
      env,
    );
    assert.equal(replay.status, 200, await replay.clone().text());
    const replayedProjection = (await replay.json()).replay.projection;
    assert.equal(replayedProjection.audit.supportProfile, "PRACTICE");
    assert.equal(
      replayedProjection.audit.hints.find(
        (item) =>
          item.hintId === "HINT_AUTHORIZATION_COMPARISON",
      ).viewed,
      true,
    );
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
    seedUser(
      database,
      "USER_INSTRUCTOR_OUTSIDE_ASSIGNMENT",
      "outside-instructor@example.edu",
      ["instructor"],
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
          counterfactualReplay:
            instructorCounterfactualReplay,
          research: { enabled: false },
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
      apiRequest("/api/v1/assignments/ASSIGNMENT_SITE_001/start-run", {
        method: "POST",
        email: "instructor@example.edu",
        body: {
          commandId: "COMMAND_SITE_CREATE_001",
          runId,
          learnerUserId: "USER_LEARNER_001",
          scenarioSeed: "site-stage3-seed-001",
          caseVariant: "authorized-certifier",
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

    const activeReportResponse = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/report",
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(
      activeReportResponse.status,
      200,
      await activeReportResponse.clone().text(),
    );
    const activeReportedRun = (
      await activeReportResponse.json()
    ).report.learners[0].runs[0];
    assert.equal(activeReportedRun.status, "active");
    assert.equal(activeReportedRun.completedAt, null);
    assert.equal(
      Date.parse(activeReportedRun.lastActivityAt) >=
        Date.parse(activeReportedRun.startedAt),
      true,
    );
    assert.equal(
      activeReportedRun.elapsedSeconds,
      Math.floor(
        (Date.parse(activeReportedRun.lastActivityAt) -
          Date.parse(activeReportedRun.startedAt)) /
          1_000,
      ),
    );
    assert.deepEqual(activeReportedRun.activity, {
      evidenceInspectionCount: 1,
      policyConsultationCount: 0,
      citedEvidenceCount: 0,
      decisionAttemptCount: 0,
      rejectedAttemptCount: 0,
      mitigationCount: 0,
      rejectionFindings: [],
    });
    const activeDecisionOutcomeResponse = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/decision-outcomes",
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(
      activeDecisionOutcomeResponse.status,
      200,
      await activeDecisionOutcomeResponse.clone().text(),
    );
    assert.deepEqual(
      (await activeDecisionOutcomeResponse.json()).decisionOutcomes,
      {
        schemaVersion: "1.0.0",
        interpretation:
          "DECISION_PROCESS_SEPARATE_FROM_REALIZED_OUTCOME",
        assignmentId: "ASSIGNMENT_SITE_001",
        packId: pack.packId,
        packVersion: pack.version,
        scenarioId: pack.scenarios[0].scenarioId,
        scenarioVersion: pack.scenarios[0].version,
        runs: [
          {
            runId,
            learnerUserId: "USER_LEARNER_001",
            status: "active",
            decisionItems: [],
            realizedOutcome: null,
          },
        ],
      },
    );

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
          citedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
          citedPolicyIds: ["AUTH_ISSUE_CERTIFICATE"],
          confidenceRating: 4,
          adverseEventProbabilityPercent: 20,
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

    const moderationBody = {
      commandId: "COMMAND_SITE_MODERATION_001",
      runId,
      rubricId: rated.rating.rubricId,
      criterionId: rated.rating.criterionId,
      levelValue: 3,
      comment:
        "The evidence-linked rating is retained as the resolved level.",
      sourceRatingIds: [rated.rating.ratingId],
      expectedRevision: 0,
    };
    const moderation = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/moderation`, {
        method: "POST",
        email: "instructor@example.edu",
        body: moderationBody,
      }),
      env,
    );
    assert.equal(
      moderation.status,
      201,
      await moderation.clone().text(),
    );
    const moderated = await moderation.json();
    assert.equal(moderated.resolution.revision, 1);
    assert.deepEqual(
      moderated.resolution.sourceRatingIds,
      [rated.rating.ratingId],
    );
    assert.equal(moderated.wasIdempotentReplay, false);

    const repeatedModeration = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/moderation`, {
        method: "POST",
        email: "instructor@example.edu",
        body: moderationBody,
      }),
      env,
    );
    assert.equal(
      repeatedModeration.status,
      200,
      await repeatedModeration.clone().text(),
    );
    assert.equal(
      (await repeatedModeration.json()).wasIdempotentReplay,
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
    const releasedFeedback = await learnerFeedback.json();
    assert.equal(releasedFeedback.ratings.length, 1);
    assert.deepEqual(releasedFeedback.moderationResolutions, [
      moderated.resolution,
    ]);
    assert.equal(
      releasedFeedback.competencyProfile.interpretation,
      "EVIDENCE_ONLY_NO_COMPETENCE_INFERENCE",
    );
    assert.equal(
      releasedFeedback.competencyProfile.learner.learnerUserId,
      "USER_LEARNER_001",
    );
    assert.ok(
      releasedFeedback.competencyProfile.learner.indicators.some(
        (indicator) => indicator.evidenceCount > 0,
      ),
    );
    assert.equal(
      Object.hasOwn(
        releasedFeedback.competencyProfile,
        "classIndicators",
      ),
      false,
    );

    const learnerPointsDenied = await worker.fetch(
      apiRequest(
        `/api/v1/runs/${runId}/counterfactual-points`,
        { email: "learner@example.edu" },
      ),
      env,
    );
    assert.equal(learnerPointsDenied.status, 403);
    assert.equal(
      (await learnerPointsDenied.json()).error.code,
      "RUN_ACCESS_DENIED",
    );

    const pointsResponse = await worker.fetch(
      apiRequest(
        `/api/v1/runs/${runId}/counterfactual-points`,
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(
      pointsResponse.status,
      200,
      await pointsResponse.clone().text(),
    );
    const availableCounterfactuals =
      await pointsResponse.json();
    const points = availableCounterfactuals.points;
    const conditionPoints =
      availableCounterfactuals.conditions;
    assert.deepEqual(
      points.map((point) => point.decisionId),
      ["INT_CERTIFICATE_INITIAL_SUBMITTED"],
    );
    assert.equal(
      points[0].configuration.maxBranchesPerLearner,
      1,
    );
    assert.equal(points[0].configuration.reflectionRequired, true);
    assert.equal(conditionPoints.length, 1);
    assert.equal(
      conditionPoints[0].configuration.conditionId,
      "CONDITION_CERTIFICATE_SIGNER_CONTEXT",
    );
    assert.equal(
      conditionPoints[0].originalConditionValueId,
      "AUTHORIZED_CERTIFIER",
    );
    const outsideAssignmentPoints = await worker.fetch(
      apiRequest(
        `/api/v1/runs/${runId}/counterfactual-points`,
        { email: "outside-instructor@example.edu" },
      ),
      env,
    );
    assert.equal(outsideAssignmentPoints.status, 403);
    assert.equal(
      (await outsideAssignmentPoints.json()).error.code,
      "RUN_ACCESS_DENIED",
    );
    const certificatePoint = points[0];
    assert.equal(certificatePoint.forkNodeId, "NODE_CERTIFICATE_DECISION");
    assert.deepEqual(certificatePoint.originalOptionIds, [
      "VALID",
      "RECOGNIZED_AUTHORIZED",
      "HASH_OFF_CHAIN",
      "CONTINUE",
    ]);

    const branchRunId = "RUN_SITE_STAGE3_COUNTERFACTUAL_001";
    const interventionId =
      "COMMAND_SITE_STAGE3_COUNTERFACTUAL_001";
    const branchCreate = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/counterfactuals`, {
        method: "POST",
        email: "instructor@example.edu",
        body: {
          counterfactualType: "DECISION",
          branchRunId,
          forkSequenceNumber:
            certificatePoint.forkSequenceNumber,
          forkNodeId: certificatePoint.forkNodeId,
          interventionId,
        },
      }),
      env,
    );
    assert.equal(
      branchCreate.status,
      201,
      await branchCreate.clone().text(),
    );
    const createdBranch = await branchCreate.json();
    assert.equal(
      createdBranch.counterfactual.sourceRunId,
      runId,
    );
    assert.equal(createdBranch.projection.runId, branchRunId);
    assert.equal(createdBranch.projection.version, 0);
    assert.equal(
      createdBranch.projection.workflowState.currentNodeId,
      "certificate-decision",
    );

    const unchangedAlternative = await worker.fetch(
      apiRequest(
        `/api/v1/counterfactuals/${branchRunId}/commands`,
        {
          method: "POST",
          email: "instructor@example.edu",
          body: {
            commandType: "SUBMIT_CERTIFICATE_DECISION",
            commandId: interventionId,
            runId: branchRunId,
            expectedRunVersion: 0,
            decision: {
              certificateAssessment: "VALID",
              issuerAssessment: "RECOGNIZED_AUTHORIZED",
              storageChoice: "HASH_OFF_CHAIN",
              lotDisposition: "CONTINUE",
            },
            justification:
              "This intentionally repeats the original and must be rejected.",
            citedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
            citedPolicyIds: ["AUTH_ISSUE_CERTIFICATE"],
            confidenceRating: 4,
            adverseEventProbabilityPercent: 20,
          },
        },
      ),
      env,
    );
    assert.equal(unchangedAlternative.status, 400);
    assert.equal(
      (await unchangedAlternative.json()).error.code,
      "INVALID_COMMAND",
    );

    const alternativeDecision = await worker.fetch(
      apiRequest(
        `/api/v1/counterfactuals/${branchRunId}/commands`,
        {
          method: "POST",
          email: "instructor@example.edu",
          body: {
            commandType: "SUBMIT_CERTIFICATE_DECISION",
            commandId: interventionId,
            runId: branchRunId,
            expectedRunVersion: 0,
            decision: {
              certificateAssessment: "EXPIRED",
              issuerAssessment: "UNRECOGNIZED",
              storageChoice: "FULL_DOCUMENT_ON_CHAIN",
              lotDisposition: "HOLD",
            },
            justification:
              "Explore the evidence and process effects of holding the lot.",
            citedEvidenceIds: ["EVID_CERTIFICATE_RECORD"],
            citedPolicyIds: ["AUTH_ISSUE_CERTIFICATE"],
            confidenceRating: 3,
            adverseEventProbabilityPercent: 60,
          },
        },
      ),
      env,
    );
    assert.equal(
      alternativeDecision.status,
      200,
      await alternativeDecision.clone().text(),
    );
    const explored = await alternativeDecision.json();
    assert.equal(explored.projection.runId, branchRunId);
    assert.equal(explored.projection.version, 2);
    assert.equal(
      explored.projection.workflowState.currentNodeId,
      "certificate-transaction",
    );
    assert.equal(explored.officialGradeChanged, false);
    assert.equal(
      database.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM hosted_run_events WHERE run_id = ?",
        )
        .get(runId).count,
      54,
    );
    assert.equal(
      database.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM hosted_run_events WHERE run_id = ?",
        )
        .get(branchRunId).count,
      2,
    );

    const branchRead = await worker.fetch(
      apiRequest(`/api/v1/counterfactuals/${branchRunId}`, {
        email: "instructor@example.edu",
      }),
      env,
    );
    assert.equal(
      branchRead.status,
      200,
      await branchRead.clone().text(),
    );
    assert.equal(
      (await branchRead.json()).projection.version,
      2,
    );

    const completedBranchResponse = await worker.fetch(
      apiRequest(
        `/api/v1/counterfactuals/${branchRunId}/complete`,
        {
          method: "POST",
          email: "instructor@example.edu",
          body: {},
        },
      ),
      env,
    );
    assert.equal(
      completedBranchResponse.status,
      200,
      await completedBranchResponse.clone().text(),
    );
    const completedBranch =
      await completedBranchResponse.json();
    assert.equal(completedBranch.status, "completed");
    assert.equal(
      completedBranch.classification,
      "SINGLE_INTERVENTION",
    );
    assert.equal(completedBranch.paused, null);
    assert.equal(
      completedBranch.projection.workflowState.currentNodeId,
      "complete",
    );
    assert.equal(
      completedBranch.originalAssessedResultPreserved,
      true,
    );
    assert.equal(completedBranch.officialGradeChanged, false);
    assert.equal(
      completedBranch.replayedCommandIds.length > 0,
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

    const comparisonResponse = await worker.fetch(
      apiRequest(
        `/api/v1/counterfactuals/${branchRunId}/comparison`,
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(
      comparisonResponse.status,
      200,
      await comparisonResponse.clone().text(),
    );
    const comparison =
      (await comparisonResponse.json()).comparison;
    assert.equal(
      comparison.interpretation,
      "ORIGINAL_ASSESSED_ALTERNATIVE_EXPLORATORY",
    );
    assert.equal(
      comparison.classification,
      "SINGLE_INTERVENTION",
    );
    assert.equal(
      comparison.originalAssessedResult.projection.runId,
      runId,
    );
    assert.equal(
      comparison.alternativeExploratoryResult.projection.runId,
      branchRunId,
    );
    assert.equal(
      comparison.originalAssessedResult.officialGradePreserved,
      true,
    );
    assert.equal(
      comparison.alternativeExploratoryResult
        .officialGradeChanged,
      false,
    );
    assert.deepEqual(
      comparison.originalAssessedResult.decision,
      {
        commandType: "SUBMIT_CERTIFICATE_DECISION",
        certificateAssessment: "VALID",
        issuerAssessment: "RECOGNIZED_AUTHORIZED",
        storageChoice: "HASH_OFF_CHAIN",
        lotDisposition: "CONTINUE",
      },
    );
    assert.equal(comparison.dimensions.length, 6);
    assert.equal(
      comparison.dimensions.every(
        (dimension) =>
          dimension.evaluationStatus === "EVALUATED" &&
          typeof dimension.originalValue === "number" &&
          typeof dimension.alternativeValue === "number",
      ),
      true,
    );
    assert.equal(
      comparison.informationAvailableWhenDecisionWasMade.some(
        (record) =>
          record.recordId === "EVID_CERTIFICATE_RECORD",
      ),
      true,
    );

    const reflectionBody = {
      reflectionId:
        "REFLECTION_SITE_STAGE3_COUNTERFACTUAL_001",
      response: {
        evidenceThatMattered:
          "The certificate status and issuer authorization mattered most.",
        reasonForDifference:
          "Holding the lot changed the immediate process decision while later actions were replayed.",
        foreseeableConsequences:
          "A processing delay was foreseeable at the original decision point.",
        laterInformation:
          "The final recall evidence was learned only later in the run.",
        revisedDecisionRule:
          "Pause the lot when certificate validity or issuer authority is unresolved.",
      },
    };
    const reflectionResponse = await worker.fetch(
      apiRequest(
        `/api/v1/counterfactuals/${branchRunId}/reflection`,
        {
          method: "POST",
          email: "instructor@example.edu",
          body: reflectionBody,
        },
      ),
      env,
    );
    assert.equal(
      reflectionResponse.status,
      201,
      await reflectionResponse.clone().text(),
    );
    const reflection = await reflectionResponse.json();
    assert.equal(
      reflection.reflection.branchRunId,
      branchRunId,
    );
    assert.equal(reflection.officialGradeChanged, false);

    const repeatedReflection = await worker.fetch(
      apiRequest(
        `/api/v1/counterfactuals/${branchRunId}/reflection`,
        {
          method: "POST",
          email: "instructor@example.edu",
          body: reflectionBody,
        },
      ),
      env,
    );
    assert.equal(
      repeatedReflection.status,
      200,
      await repeatedReflection.clone().text(),
    );
    assert.equal(
      (await repeatedReflection.json())
        .wasIdempotentReplay,
      true,
    );

    const counterfactualJsonExport = await worker.fetch(
      apiRequest(
        `/api/v1/counterfactuals/${branchRunId}/export.json`,
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(
      counterfactualJsonExport.status,
      200,
      await counterfactualJsonExport.clone().text(),
    );
    assert.equal(
      counterfactualJsonExport.headers.get("content-disposition"),
      `attachment; filename="TraceChain_${branchRunId}_counterfactual_v1.json"`,
    );
    const counterfactualExport =
      await counterfactualJsonExport.json();
    assert.equal(
      counterfactualExport.exportType,
      "TRACECHAIN_COUNTERFACTUAL_COMPARISON",
    );
    assert.equal(
      counterfactualExport.metadata.branchRunId,
      branchRunId,
    );
    assert.equal(
      counterfactualExport.comparison
        .originalAssessedResult.officialGradePreserved,
      true,
    );
    assert.equal(
      counterfactualExport.reflection.reflectionId,
      reflectionBody.reflectionId,
    );

    const counterfactualCsvExport = await worker.fetch(
      apiRequest(
        `/api/v1/counterfactuals/${branchRunId}/export.csv`,
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(
      counterfactualCsvExport.status,
      200,
      await counterfactualCsvExport.clone().text(),
    );
    const counterfactualCsv =
      await counterfactualCsvExport.text();
    assert.match(
      counterfactualCsv,
      /^export_schema_version,record_type,counterfactual_id,/u,
    );
    assert.match(counterfactualCsv, /comparison_dimension/u);
    assert.match(counterfactualCsv, /reflection/u);

    const conditionBranchRunId =
      "RUN_SITE_STAGE3_COUNTERFACTUAL_CONDITION_001";
    const conditionInterventionId =
      "COMMAND_SITE_STAGE3_COUNTERFACTUAL_CONDITION_001";
    const conditionCreate = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/counterfactuals`, {
        method: "POST",
        email: "instructor@example.edu",
        body: {
          counterfactualType: "CONDITION",
          branchRunId: conditionBranchRunId,
          forkSequenceNumber:
            conditionPoints[0].forkSequenceNumber,
          forkNodeId: conditionPoints[0].forkNodeId,
          interventionId: conditionInterventionId,
          conditionId:
            conditionPoints[0].configuration.conditionId,
          conditionValueId: "UNAUTHORIZED_TRANSPORTER",
        },
      }),
      env,
    );
    assert.equal(
      conditionCreate.status,
      201,
      await conditionCreate.clone().text(),
    );
    const conditionCreated = await conditionCreate.json();
    assert.equal(
      conditionCreated.counterfactual.counterfactualType,
      "CONDITION",
    );
    assert.equal(
      conditionCreated.counterfactual.conditionIntervention
        .alternativeValueId,
      "UNAUTHORIZED_TRANSPORTER",
    );
    assert.equal(conditionCreated.projection.version > 0, true);

    const conditionComplete = await worker.fetch(
      apiRequest(
        `/api/v1/counterfactuals/${conditionBranchRunId}/complete`,
        {
          method: "POST",
          email: "instructor@example.edu",
          body: {},
        },
      ),
      env,
    );
    assert.equal(
      conditionComplete.status,
      200,
      await conditionComplete.clone().text(),
    );
    assert.equal(
      (await conditionComplete.json()).status,
      "completed",
    );
    const conditionComparisonResponse = await worker.fetch(
      apiRequest(
        `/api/v1/counterfactuals/${conditionBranchRunId}/comparison`,
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(
      conditionComparisonResponse.status,
      200,
      await conditionComparisonResponse.clone().text(),
    );
    const conditionComparison =
      (await conditionComparisonResponse.json()).comparison;
    assert.equal(
      conditionComparison.counterfactualType,
      "CONDITION",
    );
    assert.deepEqual(
      conditionComparison.originalAssessedResult.decision,
      conditionComparison.alternativeExploratoryResult.decision,
    );
    assert.deepEqual(conditionComparison.conditionChange, {
      conditionId: "CONDITION_CERTIFICATE_SIGNER_CONTEXT",
      originalValueId: "AUTHORIZED_CERTIFIER",
      alternativeValueId: "UNAUTHORIZED_TRANSPORTER",
      affectsInformationBeforeFork: true,
    });
    assert.equal(
      conditionComparison.dimensions.some(
        (dimension) =>
          dimension.attribution ===
          "CONDITION_OVERRIDE_EFFECT",
      ),
      true,
    );

    const counterfactualReportResponse = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/counterfactual-report",
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(
      counterfactualReportResponse.status,
      200,
      await counterfactualReportResponse.clone().text(),
    );
    const counterfactualReport =
      (await counterfactualReportResponse.json()).report;
    assert.equal(
      counterfactualReport.reportType,
      "TRACECHAIN_ASSIGNMENT_COUNTERFACTUAL_REPORT",
    );
    assert.equal(counterfactualReport.branches.length, 2);
    assert.equal(counterfactualReport.summary.totalBranches, 2);
    assert.equal(
      counterfactualReport.summary.completedBranches,
      2,
    );
    assert.equal(
      counterfactualReport.summary.reflectedBranches,
      1,
    );
    assert.equal(counterfactualReport.summary.decisionBranches, 1);
    assert.equal(
      counterfactualReport.summary.conditionBranches,
      1,
    );
    assert.equal(
      counterfactualReport.summary.isolatedComparisons,
      2,
    );
    assert.equal(
      counterfactualReport.summary.compoundComparisons,
      0,
    );
    assert.deepEqual(
      counterfactualReport.summary.branchesByForkNode,
      [
        {
          forkNodeId: "NODE_CERTIFICATE_DECISION",
          branchCount: 2,
        },
      ],
    );
    assert.equal(
      typeof counterfactualReport.summary
        .averageAcademicScoreDifference,
      "number",
    );
    assert.equal(
      typeof counterfactualReport.summary
        .averageProcessScoreDifference,
      "number",
    );
    const decisionBranchReport =
      counterfactualReport.branches.find(
        (branch) =>
          branch.metadata.branchRunId === branchRunId,
      );
    assert.equal(
      decisionBranchReport.learnerUserId,
      "USER_LEARNER_001",
    );
    assert.equal(
      decisionBranchReport.branchStatus,
      "COMPLETED",
    );
    assert.equal(
      decisionBranchReport.originalOfficialGradeChanged,
      false,
    );
    assert.equal(
      decisionBranchReport.reflection.reflectionId,
      reflectionBody.reflectionId,
    );

    const learnerCounterfactualReport = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/counterfactual-report",
        { email: "learner@example.edu" },
      ),
      env,
    );
    assert.equal(learnerCounterfactualReport.status, 403);
    const outsideCounterfactualReport = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/counterfactual-report",
        { email: "outside-instructor@example.edu" },
      ),
      env,
    );
    assert.equal(outsideCounterfactualReport.status, 403);
    assert.equal(
      (await outsideCounterfactualReport.json()).error.code,
      "RUN_ACCESS_DENIED",
    );

    const activityTimelineResponse = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/timeline`, {
        email: "instructor@example.edu",
      }),
      env,
    );
    assert.equal(
      activityTimelineResponse.status,
      200,
      await activityTimelineResponse.clone().text(),
    );
    const activityTimeline = (
      await activityTimelineResponse.json()
    ).timeline;
    const rejectionEventTypes = new Set([
      "DECISION_REJECTED",
      "ENDORSEMENT_PROPOSAL_REJECTED",
      "ENDORSEMENT_REJECTED",
      "ENDORSED_TRANSACTION_REJECTED",
      "RUN_TIME_LIMIT_EXCEEDED",
      "TRANSACTION_REJECTED",
    ]);
    const rejectionFindingCounts = new Map();
    for (const event of activityTimeline) {
      if (!rejectionEventTypes.has(event.eventType)) continue;
      const summaryRules = event.payload.summary?.validationRuleIds;
      const findingCodes =
        Array.isArray(summaryRules) && summaryRules.length > 0
          ? summaryRules
          : event.eventType === "DECISION_REJECTED" &&
              typeof event.payload.decision?.commandType === "string"
            ? [
                `DECISION_REJECTED:${event.payload.decision.commandType}`,
              ]
            : [event.eventType];
      for (const findingCode of new Set(findingCodes)) {
        rejectionFindingCounts.set(
          findingCode,
          (rejectionFindingCounts.get(findingCode) ?? 0) + 1,
        );
      }
    }
    const expectedActivity = {
      evidenceInspectionCount: activityTimeline.filter(
        (event) => event.eventType === "EVIDENCE_INSPECTED",
      ).length,
      policyConsultationCount: activityTimeline.filter(
        (event) => event.eventType === "POLICY_CONSULTED",
      ).length,
      citedEvidenceCount: activityTimeline.reduce(
        (total, event) =>
          total +
          (Array.isArray(event.payload.citedEvidenceIds)
            ? event.payload.citedEvidenceIds.length
            : 0),
        0,
      ),
      decisionAttemptCount: activityTimeline.filter(
        (event) =>
          event.eventType === "DECISION_SUBMITTED" ||
          event.eventType === "DECISION_REJECTED",
      ).length,
      rejectedAttemptCount: activityTimeline.filter((event) =>
        rejectionEventTypes.has(event.eventType),
      ).length,
      mitigationCount: activityTimeline.filter(
        (event) => event.eventType === "MITIGATION_RECORDED",
      ).length,
      rejectionFindings: [...rejectionFindingCounts.entries()]
        .map(([findingCode, count]) => ({ findingCode, count }))
        .sort(
          (left, right) =>
            right.count - left.count ||
            left.findingCode.localeCompare(right.findingCode),
        ),
    };

    const report = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/report",
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(report.status, 200, await report.clone().text());
    const classReport = (await report.json()).report;
    assert.equal(classReport.schemaVersion, "2.0.0");
    assert.equal(classReport.learners.length, 1);
    const reportedRun = classReport.learners[0].runs[0];
    assert.deepEqual(
      {
        runId: reportedRun.runId,
        learnerUserId: reportedRun.learnerUserId,
        status: reportedRun.status,
        eventCount: reportedRun.eventCount,
        ratings: reportedRun.ratings,
        moderationResolutions: reportedRun.moderationResolutions,
      },
      {
        runId,
        learnerUserId: "USER_LEARNER_001",
        status: "completed",
        eventCount: 54,
        ratings: [rated.rating],
        moderationResolutions: [moderated.resolution],
      },
    );
    assert.equal(
      Number.isFinite(Date.parse(reportedRun.startedAt)),
      true,
    );
    assert.equal(
      Number.isFinite(Date.parse(reportedRun.lastActivityAt)),
      true,
    );
    assert.equal(
      Number.isFinite(Date.parse(reportedRun.completedAt)),
      true,
    );
    assert.equal(
      reportedRun.lastActivityAt === reportedRun.completedAt,
      true,
    );
    assert.equal(
      Number.isInteger(reportedRun.elapsedSeconds) &&
        reportedRun.elapsedSeconds >= 0,
      true,
    );
    assert.deepEqual(reportedRun.activity, expectedActivity);
    const decisionOutcomeResponse = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/decision-outcomes",
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(
      decisionOutcomeResponse.status,
      200,
      await decisionOutcomeResponse.clone().text(),
    );
    assert.deepEqual(
      (await decisionOutcomeResponse.json()).decisionOutcomes,
      {
        schemaVersion: "1.0.0",
        interpretation:
          "DECISION_PROCESS_SEPARATE_FROM_REALIZED_OUTCOME",
        assignmentId: "ASSIGNMENT_SITE_001",
        packId: pack.packId,
        packVersion: pack.version,
        scenarioId: pack.scenarios[0].scenarioId,
        scenarioVersion: pack.scenarios[0].version,
        runs: [
          {
            runId,
            learnerUserId: "USER_LEARNER_001",
            status: "completed",
            decisionItems: [
              {
                decisionItemId: "INT_CERTIFICATE_INITIAL_SUBMITTED",
                isAuthoredCorrect: true,
              },
              {
                decisionItemId: "INT_DISCREPANCY_INITIAL_SUBMITTED",
                isAuthoredCorrect: false,
              },
              {
                decisionItemId: "INT_TRANSFORMATION_PROVENANCE",
                isAuthoredCorrect: true,
              },
              {
                decisionItemId: "INT_TAMPER_DEMONSTRATION",
                isAuthoredCorrect: true,
              },
              {
                decisionItemId:
                  "INT_DATA_GOVERNANCE_CLASSIFICATION",
                isAuthoredCorrect: true,
              },
              {
                decisionItemId: "INT_RECALL_SCOPE",
                isAuthoredCorrect: true,
              },
              {
                decisionItemId: "INT_BLOCKCHAIN_NECESSITY",
                isAuthoredCorrect: true,
              },
            ],
            realizedOutcome: {
              outcomeModelId: "CERTIFICATE_CASE",
              strategy: "forced",
              outcomeCode: "authorized-certifier",
            },
          },
        ],
      },
    );

    const monitorResponse = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/monitor",
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(
      monitorResponse.status,
      200,
      await monitorResponse.clone().text(),
    );
    const monitor = (await monitorResponse.json()).monitor;
    assert.equal(monitor.schemaVersion, "1.0.0");
    assert.equal(monitor.assignmentId, "ASSIGNMENT_SITE_001");
    assert.equal(monitor.learners.length, 1);
    const monitoredRun = monitor.learners[0].runs[0];
    assert.equal(monitoredRun.runId, runId);
    assert.equal(
      monitoredRun.learnerUserId,
      "USER_LEARNER_001",
    );
    assert.equal(monitoredRun.status, "completed");
    assert.equal(monitoredRun.eventCount, 54);
    assert.equal(monitoredRun.currentStageId, "complete");
    assert.equal(monitoredRun.activeRoleId, "REGULATORY_AUDITOR");
    assert.equal(monitoredRun.elapsedSeconds >= 0, true);
    assert.equal(
      Number.isFinite(Date.parse(monitoredRun.lastActivityAt)),
      true,
    );
    assert.deepEqual(monitoredRun.pendingActionIds, []);
    assert.equal(monitoredRun.technicalStatus, "ok");

    const competencyReportResponse = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/competencies",
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(
      competencyReportResponse.status,
      200,
      await competencyReportResponse.clone().text(),
    );
    const assignmentCompetencies = (
      await competencyReportResponse.json()
    ).competencies;
    assert.equal(
      assignmentCompetencies.interpretation,
      "EVIDENCE_ONLY_NO_COMPETENCE_INFERENCE",
    );
    assert.deepEqual(assignmentCompetencies.frameworks, [
      {
        frameworkId: "TRACECHAIN_CORE",
        frameworkVersion: "1.0.0",
      },
    ]);
    assert.equal(assignmentCompetencies.learners.length, 1);
    const evidenceUseCompetency =
      assignmentCompetencies.learners[0].indicators.find(
        (indicator) => indicator.indicatorId === "PC2.PI1",
      );
    assert.equal(evidenceUseCompetency.evidenceCount > 0, true);
    assert.deepEqual(evidenceUseCompetency.currentRatings, [
      {
        runId,
        ratingId: rated.rating.ratingId,
        rubricId: rated.rating.rubricId,
        rubricVersion: rated.rating.rubricVersion,
        criterionId: rated.rating.criterionId,
        levelValue: rated.rating.levelValue,
        comment: rated.rating.comment,
        linkedEvidenceIds: rated.rating.linkedEvidenceIds,
        revision: rated.rating.revision,
        raterUserId: rated.rating.raterUserId,
        ratedAt: rated.rating.ratedAt,
      },
    ]);
    const classEvidenceUse =
      assignmentCompetencies.classIndicators.find(
        (indicator) => indicator.indicatorId === "PC2.PI1",
      );
    assert.deepEqual(classEvidenceUse.ratingDistribution, [
      { levelValue: 3, count: 1 },
    ]);

    const learnerCompetencyReport = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/competencies",
        { email: "learner@example.edu" },
      ),
      env,
    );
    assert.equal(learnerCompetencyReport.status, 403);

    const jsonExport = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/export.json",
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(jsonExport.status, 200, await jsonExport.clone().text());
    assert.equal(
      jsonExport.headers.get("content-type"),
      "application/json; charset=utf-8",
    );
    assert.equal(
      jsonExport.headers.get("content-disposition"),
      'attachment; filename="TraceChain_ASSIGNMENT_SITE_001_evidence_v2.json"',
    );
    const exportedEvidence = await jsonExport.json();
    assert.equal(exportedEvidence.schemaVersion, "2.0.0");
    assert.equal(exportedEvidence.dataDictionary.schemaVersion, "2.0.0");
    assert.equal(
      exportedEvidence.exportType,
      "TRACECHAIN_ASSIGNMENT_EVIDENCE",
    );
    assert.equal(exportedEvidence.identityMode, "identified");
    assert.equal(
      exportedEvidence.assignment.packVersion,
      pack.version,
    );
    assert.equal(
      exportedEvidence.assignment.scenarioVersion,
      pack.scenarios[0].version,
    );
    assert.equal(exportedEvidence.events.length, 54);
    assert.deepEqual(exportedEvidence.runs[0], {
      assignmentId: "ASSIGNMENT_SITE_001",
      runId,
      learnerUserId: "USER_LEARNER_001",
      status: "completed",
      eventCount: 54,
      startedAt: reportedRun.startedAt,
      lastActivityAt: reportedRun.lastActivityAt,
      completedAt: reportedRun.completedAt,
      elapsedSeconds: reportedRun.elapsedSeconds,
      activity: expectedActivity,
    });
    assert.deepEqual(
      exportedEvidence.dataDictionary.datasets
        .find((dataset) => dataset.id === "runs")
        .fields.map((field) => field.name)
        .filter((name) =>
          [
            "startedAt",
            "lastActivityAt",
            "completedAt",
            "elapsedSeconds",
            "activity",
          ].includes(name),
        ),
      [
        "startedAt",
        "lastActivityAt",
        "completedAt",
        "elapsedSeconds",
        "activity",
      ],
    );
    assert.deepEqual(exportedEvidence.ratingRevisions, [rated.rating]);
    assert.deepEqual(exportedEvidence.moderationResolutions, [
      moderated.resolution,
    ]);
    assert.deepEqual(
      exportedEvidence.dataDictionary.datasets.map(
        (dataset) => dataset.id,
      ),
      [
        "assignment",
        "participants",
        "runs",
        "events",
        "ratingRevisions",
        "moderationResolutions",
      ],
    );

    const pseudonymousJsonExport = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/export.json?identity=pseudonymous",
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(
      pseudonymousJsonExport.status,
      200,
      await pseudonymousJsonExport.clone().text(),
    );
    assert.equal(
      pseudonymousJsonExport.headers.get("content-disposition"),
      'attachment; filename="TraceChain_ASSIGNMENT_SITE_001_pseudonymous_evidence_v2.json"',
    );
    const pseudonymousJsonText =
      await pseudonymousJsonExport.text();
    assert.doesNotMatch(
      pseudonymousJsonText,
      /USER_LEARNER_001/u,
    );
    assert.match(
      pseudonymousJsonText,
      /LEARNER_[A-F0-9]{24}/u,
    );
    assert.match(
      pseudonymousJsonText,
      /USER_INSTRUCTOR_001/u,
    );
    assert.equal(
      JSON.parse(pseudonymousJsonText).identityMode,
      "pseudonymous",
    );
    const pseudonymousCsvExport = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/export.csv?identity=pseudonymous",
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(
      pseudonymousCsvExport.status,
      200,
      await pseudonymousCsvExport.clone().text(),
    );
    assert.equal(
      pseudonymousCsvExport.headers.get("content-disposition"),
      'attachment; filename="TraceChain_ASSIGNMENT_SITE_001_pseudonymous_evidence_v2.csv"',
    );
    const pseudonymousCsvText = await pseudonymousCsvExport.text();
    assert.doesNotMatch(
      pseudonymousCsvText,
      /USER_LEARNER_001/u,
    );
    assert.match(
      pseudonymousCsvText,
      /LEARNER_[A-F0-9]{24}/u,
    );
    assert.match(
      pseudonymousCsvText,
      /""exportIdentityMode"":""pseudonymous""/u,
    );
    const invalidIdentityExport = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/export.json?identity=anonymous",
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(invalidIdentityExport.status, 400);
    assert.equal(
      (await invalidIdentityExport.json()).error.code,
      "INVALID_COMMAND",
    );

    const csvExport = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/export.csv",
        { email: "instructor@example.edu" },
      ),
      env,
    );
    assert.equal(csvExport.status, 200, await csvExport.clone().text());
    assert.equal(
      csvExport.headers.get("content-type"),
      "text/csv; charset=utf-8",
    );
    assert.equal(
      csvExport.headers.get("content-disposition"),
      'attachment; filename="TraceChain_ASSIGNMENT_SITE_001_evidence_v2.csv"',
    );
    const exportedCsv = await csvExport.text();
    assert.match(
      exportedCsv,
      /^export_schema_version,record_type,assignment_id,/u,
    );
    assert.match(
      exportedCsv,
      /event,ASSIGNMENT_SITE_001,USER_LEARNER_001,/u,
    );
    assert.match(
      exportedCsv,
      /rating_revision,ASSIGNMENT_SITE_001,/u,
    );
    assert.match(
      exportedCsv,
      /moderation_resolution,ASSIGNMENT_SITE_001,/u,
    );
    assert.match(exportedCsv, /""elapsedSeconds"":\d+/u);
    assert.match(exportedCsv, /""rejectedAttemptCount"":3/u);

    const learnerExport = await worker.fetch(
      apiRequest(
        "/api/v1/assignments/ASSIGNMENT_SITE_001/export.json",
        { email: "learner@example.edu" },
      ),
      env,
    );
    assert.equal(learnerExport.status, 403);
    assert.equal(
      (await learnerExport.json()).error.code,
      "APPLICATION_ROLE_REQUIRED",
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
    assert.equal(timeline.length, 54);
    assert.equal(
      timeline.some(
        (event) =>
          event.eventType === "ENDORSEMENT_PROPOSAL_REJECTED",
      ),
      true,
    );

    const replayAtEvidenceRelease = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/replay?sequence=2`, {
        email: "instructor@example.edu",
      }),
      env,
    );
    assert.equal(
      replayAtEvidenceRelease.status,
      200,
      await replayAtEvidenceRelease.clone().text(),
    );
    const earlyReplay = (await replayAtEvidenceRelease.json()).replay;
    assert.deepEqual(
      {
        runId: earlyReplay.runId,
        throughSequenceNumber: earlyReplay.throughSequenceNumber,
        totalEventCount: earlyReplay.totalEventCount,
        packId: earlyReplay.packId,
        packVersion: earlyReplay.packVersion,
        scenarioId: earlyReplay.scenarioId,
        scenarioVersion: earlyReplay.scenarioVersion,
        projectionVersion: earlyReplay.projection.version,
        currentNodeId:
          earlyReplay.projection.workflowState.currentNodeId,
      },
      {
        runId,
        throughSequenceNumber: 2,
        totalEventCount: 54,
        packId: pack.packId,
        packVersion: pack.version,
        scenarioId: pack.scenarios[0].scenarioId,
        scenarioVersion: pack.scenarios[0].version,
        projectionVersion: 2,
        currentNodeId: "certificate-evidence",
      },
    );
    assert.equal(earlyReplay.selectedEvent.sequenceNumber, 2);
    assert.equal(earlyReplay.selectedEvent.eventType, "EVIDENCE_RELEASED");
    assert.equal(
      Object.hasOwn(earlyReplay.projection, "actualState"),
      false,
    );

    const repeatedReplay = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/replay?sequence=2`, {
        email: "instructor@example.edu",
      }),
      env,
    );
    assert.deepEqual(
      await repeatedReplay.json(),
      { replay: earlyReplay },
    );

    const invalidReplay = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/replay?sequence=0`, {
        email: "instructor@example.edu",
      }),
      env,
    );
    assert.equal(invalidReplay.status, 400);
    assert.equal(
      (await invalidReplay.json()).error.code,
      "INVALID_COMMAND",
    );

    const learnerReplay = await worker.fetch(
      apiRequest(`/api/v1/runs/${runId}/replay?sequence=2`, {
        email: "learner@example.edu",
      }),
      env,
    );
    assert.equal(learnerReplay.status, 403);
    assert.equal(
      (await learnerReplay.json()).error.code,
      "APPLICATION_ROLE_REQUIRED",
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
