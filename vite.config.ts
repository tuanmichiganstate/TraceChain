import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { coffeeScenario } from "./src/scenarios/coffee-traceability/scenario";
import { GUIDED_PRESET } from "./src/config/presets";
import { embedConfiguration } from "./src/config/hash";

const DEVELOPMENT_RUNTIME_FILES: Readonly<Record<string, string>> = {
  "tracechain.config.json": `${JSON.stringify(embedConfiguration(GUIDED_PRESET), null, 2)}\n`,
  "scenario.json": `${JSON.stringify(coffeeScenario, null, 2)}\n`,
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
