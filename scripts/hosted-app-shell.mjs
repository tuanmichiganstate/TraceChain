const STRICT_SCRIPT_DIRECTIVE = "script-src 'self';";
const HOSTED_SCRIPT_DIRECTIVE =
  "script-src 'self' 'unsafe-inline';";

/**
 * Prepare the shared application shell for Cloudflare-hosted delivery.
 *
 * SCORM keeps the strict inline-script ban because it is a self-contained
 * package. Cloudflare may append its same-origin browser-verification loader
 * after the Worker response, and that loader begins with an inline bootstrap.
 * The hosted shell therefore permits that bootstrap while every executable
 * application asset remains restricted to this origin.
 */
export function prepareHostedAppShell(html) {
  if (!html.includes(STRICT_SCRIPT_DIRECTIVE)) {
    throw new Error(
      "The application shell no longer contains the expected script policy.",
    );
  }
  return html.replace(
    STRICT_SCRIPT_DIRECTIVE,
    HOSTED_SCRIPT_DIRECTIVE,
  );
}
