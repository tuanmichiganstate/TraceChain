/* global Request, Response, URL */

import assert from "node:assert/strict";
import test from "node:test";

import worker from "./worker.mjs";

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
