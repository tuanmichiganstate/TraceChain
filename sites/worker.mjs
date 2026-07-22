/* global Headers, Request, Response, URL */

/**
 * Cloudflare Worker entry point for the standalone Sites deployment.
 *
 * The learner application remains the same Vite bundle used by the SCORM
 * package. Sites supplies the ASSETS binding; navigation requests that do not
 * name a static file fall back to index.html so the application can load from
 * a bookmarked URL.
 */

const securityHeaders = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
};

function withSecurityHeaders(response) {
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

function acceptsHtml(request) {
  return request.headers.get("accept")?.includes("text/html") ?? false;
}

function shouldServeAppShell(request) {
  if (request.method !== "GET") return false;

  const pathname = new URL(request.url).pathname;
  return pathname === "/" || acceptsHtml(request);
}

const worker = {
  async fetch(request, env) {
    const assetResponse = await env.ASSETS.fetch(request);

    if (
      assetResponse.status !== 404 ||
      !shouldServeAppShell(request)
    ) {
      return withSecurityHeaders(assetResponse);
    }

    const indexUrl = new URL("/index.html", request.url);
    const indexRequest = new Request(indexUrl, request);
    return withSecurityHeaders(await env.ASSETS.fetch(indexRequest));
  },
};

export default worker;
