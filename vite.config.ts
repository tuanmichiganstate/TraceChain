import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { coffeeScenario } from "./src/scenarios/coffee-traceability/scenario";
import { GUIDED_PRESET } from "./src/config/presets";
import { embedConfiguration } from "./src/config/hash";
import { coffeeCryptographicRuntime } from "./src/scenarios/coffee-traceability/cryptographic-runtime";
import { createHash } from "node:crypto";

const cryptographicRuntimeFiles: Readonly<Record<string, string>> = {
  "identity-registry.json": `${JSON.stringify(coffeeCryptographicRuntime.identityRegistry, null, 2)}\n`,
  "educational-signing-keys.json": `${JSON.stringify(coffeeCryptographicRuntime.signingKeys, null, 2)}\n`,
  "authorization-policies.json": `${JSON.stringify(coffeeCryptographicRuntime.authorizationPolicies, null, 2)}\n`,
  "endorsement-policies.json": `${JSON.stringify(coffeeCryptographicRuntime.endorsementPolicies, null, 2)}\n`,
};
const cryptographicRuntimeHashes = Object.fromEntries(
  Object.entries(cryptographicRuntimeFiles).map(([fileName, source]) => [
    fileName,
    createHash("sha256").update(source, "utf8").digest("hex"),
  ]),
);
const developmentScenarioSource = `${JSON.stringify(coffeeScenario, null, 2)}\n`;
const DEVELOPMENT_RUNTIME_FILES: Readonly<Record<string, string>> = {
  "tracechain.config.json": `${JSON.stringify(embedConfiguration(GUIDED_PRESET), null, 2)}\n`,
  "scenario.json": developmentScenarioSource,
  ...cryptographicRuntimeFiles,
  "build-info.json": `${JSON.stringify(
    {
      scenarioHash: createHash("sha256")
        .update(developmentScenarioSource, "utf8")
        .digest("hex"),
      cryptographicEvidenceSchemaVersion: "2",
      cryptographicRuntimeHashes,
      cryptographicMechanisms: {
        signatureAlgorithm: "Ed25519",
        signatureProvider: "@noble/ed25519@3.1.0",
        signatureComputation: "REAL",
        endorsementSignatureComputation: "REAL",
        endorsementPolicyEvaluation:
          "CONSTRAINED_SERIALIZABLE_POLICY_TREE",
        organizationalIdentity: "EDUCATIONAL_SIMULATION",
        keyCustody: "STATIC_EDUCATIONAL_FIXTURE",
        certificateIssuance: "EDUCATIONAL_SIMULATION",
        networkAndConsensus: "EDUCATIONAL_SIMULATION",
      },
    },
    null,
    2,
  )}\n`,
};

function runtimeFilesPlugin(): Plugin {
  return {
    name: "tracechain-runtime-files",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.replace(/^\/+/, "").split("?")[0] ?? "";
        const source = DEVELOPMENT_RUNTIME_FILES[name];
        if (source === undefined) {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(source);
      });
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(DEVELOPMENT_RUNTIME_FILES)) {
        this.emitFile({ type: "asset", fileName, source });
      }
    },
  };
}

/**
 * All production asset paths must be relative so the build works when Moodle
 * unpacks the SCORM package to an arbitrary directory, and when the activity is
 * launched from an iframe or a popup window. See specification section 4.2.
 */
export default defineConfig({
  base: "./",
  plugins: [react(), runtimeFilesPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
    // The SCORM package must run without a network connection after loading, so
    // no asset may be emitted as an external URL reference.
    assetsInlineLimit: 0,
    sourcemap: false,
    target: "es2022",
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "test/**/*.test.ts"],
  },
});
