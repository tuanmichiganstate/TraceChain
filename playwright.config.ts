import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * These tests run against the built bundle rather than the dev server: the
 * artefact that ships to Moodle is `dist/`, and a Vite dev build differs from
 * it in module loading, minification and asset paths. Testing the thing that
 * ships is the point.
 *
 * The unit and component suites already drive all nine stages in jsdom. What
 * only a real browser can answer is layout, focus, real event ordering, and
 * whether the three engines agree -- so these scenarios deliberately favour
 * those over re-asserting domain behaviour.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 2 : 0,
  timeout: 90_000,
  /*
   * WORKER COUNT IS LEFT AT PLAYWRIGHT'S DEFAULT, AND THAT IS MEASURED.
   *
   * The GitHub-hosted runner is 2-core / 7 GB -- the `Runner size` step in the
   * workflow prints it -- and Playwright's default is ceil(cores / 2), so the
   * suite runs on a single worker in CI. That is genuinely most of the job's
   * duration: 535s, 665s and 729s across three runs, against 36s locally on
   * eight cores.
   *
   * Two workers, one per core, was tried on real CI and was worse on both
   * counts: 887s, and 3 failed plus 1 flaky with 90-second click timeouts --
   * two browsers starving each other on two cores. Retries then pay for the
   * contention twice. The default stays until the runner does not.
   */
  // On CI, an HTML report so a failure is inspectable after the fact. The first
  // attempt failed to upload anything because "line" writes no report directory
  // -- a red job with no evidence is barely better than no job.
  reporter: process.env["CI"]
    ? [["line"], ["html", { open: "never" }]]
    : [["list"]],

  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    // The activity is Vietnamese; a browser negotiating another locale must not
    // change what renders.
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },

  // Every ordinary test has a 90s budget. Only the two full WebKit-family
  // walkthroughs opt into 240s inside activity.spec.ts; a hung short Safari
  // test therefore fails on the normal budget instead of inheriting a broad
  // project-level exception.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    // A real phone profile, not a resized desktop window: touch, device pixel
    // ratio and viewport all differ, and section 26 requires 320 px reflow.
    { name: "mobile-safari", use: { ...devices["iPhone SE"] } },
  ],

  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
