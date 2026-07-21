/**
 * SCORM 1.2 API surface and discovery (specification section 21.2).
 *
 * The API object is named `API` in SCORM 1.2. (SCORM 2004 uses `API_1484_11`;
 * this package targets 1.2 only.) Moodle places it on the window that hosts the
 * SCO's frameset, which may be several ancestors up, or on the opener window
 * when the activity is launched in a popup.
 */

export interface Scorm12Api {
  LMSInitialize(parameter: ""): string;
  LMSFinish(parameter: ""): string;
  LMSGetValue(element: string): string;
  LMSSetValue(element: string, value: string): string;
  LMSCommit(parameter: ""): string;
  LMSGetLastError(): string;
  LMSGetErrorString(errorCode: string): string;
  LMSGetDiagnostic(errorCode: string): string;
}

/**
 * Ancestor windows are walked to a bounded depth. An unbounded loop can hang
 * on unusual frame arrangements, and no real LMS nests the SCO this deeply.
 */
export const MAX_PARENT_TRAVERSAL_DEPTH = 10;

/** SCORM 1.2 error codes that the adapter reacts to specifically. */
export const ScormErrorCode = {
  NO_ERROR: "0",
  GENERAL_EXCEPTION: "101",
  INVALID_ARGUMENT: "201",
  ELEMENT_IS_READ_ONLY: "403",
  ELEMENT_IS_WRITE_ONLY: "404",
  INCORRECT_DATA_TYPE: "405",
} as const;

interface WindowWithApi extends Window {
  API?: Scorm12Api | null;
}

/**
 * Read `API` from a window, tolerating the SecurityError thrown when the window
 * belongs to another origin. A cross-origin ancestor is simply not the LMS
 * frame we are looking for.
 */
function readApi(candidate: Window | null): Scorm12Api | null {
  if (candidate === null) {
    return null;
  }
  try {
    const api = (candidate as WindowWithApi).API;
    return api ?? null;
  } catch {
    return null;
  }
}

/** Walk up the ancestor chain from `startWindow`, looking for `API`. */
function findApiInAncestors(startWindow: Window | null): Scorm12Api | null {
  let current = startWindow;
  let depth = 0;

  while (current !== null && depth <= MAX_PARENT_TRAVERSAL_DEPTH) {
    const api = readApi(current);
    if (api !== null) {
      return api;
    }

    let parent: Window | null;
    try {
      parent = current.parent;
    } catch {
      return null;
    }
    // The topmost window is its own parent; stop rather than loop forever.
    if (parent === null || parent === current) {
      return null;
    }
    current = parent;
    depth += 1;
  }

  return null;
}

export interface ApiDiscoveryResult {
  readonly api: Scorm12Api | null;
  readonly diagnostics: readonly string[];
}

/**
 * Locate the SCORM 1.2 API: first up the frame ancestors, then up the opener's
 * ancestors for popup launches. Never throws -- an absent API is a supported
 * outcome that puts the application into standalone mode.
 */
export function discoverScorm12Api(rootWindow: Window | null = globalThis.window ?? null): ApiDiscoveryResult {
  const diagnostics: string[] = [];

  if (rootWindow === null) {
    return { api: null, diagnostics: ["No window object; running outside a browser."] };
  }

  const fromAncestors = findApiInAncestors(rootWindow);
  if (fromAncestors !== null) {
    diagnostics.push("SCORM 1.2 API found in the window ancestor chain.");
    return { api: fromAncestors, diagnostics };
  }
  diagnostics.push(
    `No SCORM API within ${MAX_PARENT_TRAVERSAL_DEPTH} ancestor windows.`,
  );

  let opener: Window | null = null;
  try {
    opener = rootWindow.opener as Window | null;
  } catch {
    diagnostics.push("Opener window is not accessible (cross-origin).");
  }

  if (opener !== null && opener !== undefined) {
    const fromOpener = findApiInAncestors(opener);
    if (fromOpener !== null) {
      diagnostics.push("SCORM 1.2 API found via the opener window.");
      return { api: fromOpener, diagnostics };
    }
    diagnostics.push("No SCORM API in the opener chain either.");
  } else {
    diagnostics.push("No opener window.");
  }

  return { api: null, diagnostics };
}

/**
 * Format a duration as SCORM 1.2 CMITimespan (HHHH:MM:SS.SS).
 * Hours occupy at least two digits and are capped at four, per the data type.
 */
export function formatSessionTime(milliseconds: number): string {
  const safeMilliseconds = Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : 0;
  const totalSeconds = safeMilliseconds / 1000;

  const hours = Math.min(Math.floor(totalSeconds / 3600), 9999);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hoursText = String(hours).padStart(2, "0");
  const minutesText = String(minutes).padStart(2, "0");
  const secondsText = seconds.toFixed(2).padStart(5, "0");

  return `${hoursText}:${minutesText}:${secondsText}`;
}
