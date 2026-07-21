import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

/**
 * All production asset paths must be relative so the build works when Moodle
 * unpacks the SCORM package to an arbitrary directory, and when the activity is
 * launched from an iframe or a popup window. See specification section 4.2.
 */
export default defineConfig({
  base: "./",
  plugins: [react()],
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
