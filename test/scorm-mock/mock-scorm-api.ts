/**
 * An in-memory SCORM 1.2 API for automated testing.
 *
 * Its value depends entirely on being strict. A permissive mock would accept a
 * 6 000-character `suspend_data` happily and the overflow would surface for the
 * first time in Moodle, in front of students. So this mock enforces the actual
 * data model constraints:
 *
 *   - cmi.suspend_data          CMIString4096 -- error 405 beyond 4096 chars
 *   - cmi.core.lesson_location  CMIString255  -- error 405 beyond 255 chars
 *   - cmi.core.lesson_status    the six-term vocabulary, nothing else
 *   - cmi.core.session_time     HHHH:MM:SS.SS
 *   - cmi.core.score.raw        0-100
 *   - cmi.interactions._count   readable, derived collection size
 *   - read-only elements        error 403 on write
 *   - write-only elements       error 404 on read
 *   - any call before LMSInitialize  error 301
 */

import type { Scorm12Api } from "../../src/infrastructure/scorm/scorm12-api";

const SUSPEND_DATA_LIMIT = 4096;
const STRING_255_LIMIT = 255;

const LESSON_STATUS_VOCABULARY = new Set([
  "passed",
  "completed",
  "failed",
  "incomplete",
  "browsed",
  "not attempted",
]);

const EXIT_VOCABULARY = new Set(["time-out", "suspend", "logout", ""]);

const SESSION_TIME_PATTERN = /^\d{2,4}:[0-5]\d:[0-5]\d(\.\d{1,2})?$/;
const CLOCK_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

const READ_ONLY_ELEMENTS = new Set([
  "cmi.core.student_id",
  "cmi.core.student_name",
  "cmi.core.credit",
  "cmi.core.entry",
  "cmi.core.lesson_mode",
  "cmi.core.total_time",
  "cmi.interactions._count",
]);

/** SCORM 1.2 makes these write-only; reading them must fail. */
const WRITE_ONLY_ELEMENTS = new Set(["cmi.core.exit", "cmi.core.session_time"]);

export const MockErrorCode = {
  NO_ERROR: "0",
  GENERAL_EXCEPTION: "101",
  NOT_INITIALIZED: "301",
  ELEMENT_NOT_IMPLEMENTED: "401",
  ELEMENT_IS_READ_ONLY: "403",
  ELEMENT_IS_WRITE_ONLY: "404",
  INCORRECT_DATA_TYPE: "405",
} as const;

export interface MockScormOptions {
  /** Seed values, e.g. a prior attempt's suspend_data. */
  readonly initialValues?: Readonly<Record<string, string>>;
  /** Force LMSCommit to fail, exercising the communication-failure path. */
  readonly failCommit?: boolean;
}

/**
 * A SCORM 1.2 API implementation backed by a plain map, plus test-facing
 * accessors for asserting what the application wrote.
 */
export class MockScorm12Api implements Scorm12Api {
  private readonly values = new Map<string, string>();
  private lastError: string = MockErrorCode.NO_ERROR;
  private initialized = false;
  private finished = false;
  private readonly failCommit: boolean;

  /** Every LMSSetValue accepted, in order. Lets tests assert call sequences. */
  readonly writeLog: Array<{ element: string; value: string }> = [];
  commitCount = 0;

  constructor(options: MockScormOptions = {}) {
    this.failCommit = options.failCommit ?? false;

    this.values.set("cmi.core.student_id", "student-001");
    this.values.set("cmi.core.student_name", "Nguyen, Van A");
    this.values.set("cmi.core.lesson_status", "not attempted");
    this.values.set("cmi.core.lesson_location", "");
    this.values.set("cmi.core.credit", "credit");
    this.values.set("cmi.core.entry", "ab-initio");
    this.values.set("cmi.core.lesson_mode", "normal");
    this.values.set("cmi.core.total_time", "0000:00:00.00");
    this.values.set("cmi.core.score.raw", "");
    this.values.set("cmi.core.score.min", "");
    this.values.set("cmi.core.score.max", "");
    this.values.set("cmi.suspend_data", "");

    for (const [element, value] of Object.entries(options.initialValues ?? {})) {
      this.values.set(element, value);
    }
  }

  LMSInitialize(_parameter: ""): string {
    this.initialized = true;
    this.finished = false;
    this.lastError = MockErrorCode.NO_ERROR;
    return "true";
  }

  LMSFinish(_parameter: ""): string {
    if (!this.initialized) {
      this.lastError = MockErrorCode.NOT_INITIALIZED;
      return "false";
    }
    this.finished = true;
    this.initialized = false;
    this.lastError = MockErrorCode.NO_ERROR;
    return "true";
  }

  LMSGetValue(element: string): string {
    if (!this.initialized) {
      this.lastError = MockErrorCode.NOT_INITIALIZED;
      return "";
    }
    if (WRITE_ONLY_ELEMENTS.has(element)) {
      this.lastError = MockErrorCode.ELEMENT_IS_WRITE_ONLY;
      return "";
    }
    if (element === "cmi.interactions._count") {
      this.lastError = MockErrorCode.NO_ERROR;
      return String(this.interactionCount());
    }
    if (element.startsWith("cmi.interactions.")) {
      // The records are write-only; only their collection count is readable.
      this.lastError = MockErrorCode.ELEMENT_IS_WRITE_ONLY;
      return "";
    }
    this.lastError = MockErrorCode.NO_ERROR;
    return this.values.get(element) ?? "";
  }

  LMSSetValue(element: string, value: string): string {
    if (!this.initialized) {
      this.lastError = MockErrorCode.NOT_INITIALIZED;
      return "false";
    }
    if (READ_ONLY_ELEMENTS.has(element)) {
      this.lastError = MockErrorCode.ELEMENT_IS_READ_ONLY;
      return "false";
    }

    const rejection = this.validate(element, value);
    if (rejection !== null) {
      this.lastError = rejection;
      return "false";
    }

    this.values.set(element, value);
    this.writeLog.push({ element, value });
    this.lastError = MockErrorCode.NO_ERROR;
    return "true";
  }

  LMSCommit(_parameter: ""): string {
    if (!this.initialized) {
      this.lastError = MockErrorCode.NOT_INITIALIZED;
      return "false";
    }
    if (this.failCommit) {
      this.lastError = MockErrorCode.GENERAL_EXCEPTION;
      return "false";
    }
    this.commitCount += 1;
    this.lastError = MockErrorCode.NO_ERROR;
    return "true";
  }

  LMSGetLastError(): string {
    return this.lastError;
  }

  LMSGetErrorString(errorCode: string): string {
    const descriptions: Record<string, string> = {
      [MockErrorCode.NO_ERROR]: "No error",
      [MockErrorCode.GENERAL_EXCEPTION]: "General exception",
      [MockErrorCode.NOT_INITIALIZED]: "Not initialized",
      [MockErrorCode.ELEMENT_NOT_IMPLEMENTED]: "Not implemented error",
      [MockErrorCode.ELEMENT_IS_READ_ONLY]: "Element is read only",
      [MockErrorCode.ELEMENT_IS_WRITE_ONLY]: "Element is write only",
      [MockErrorCode.INCORRECT_DATA_TYPE]: "Incorrect data type",
    };
    return descriptions[errorCode] ?? "Unknown error";
  }

  LMSGetDiagnostic(errorCode: string): string {
    return `Mock diagnostic for ${errorCode}`;
  }

  /** Returns an error code when the write violates the data model, else null. */
  private validate(element: string, value: string): string | null {
    const interaction = /^cmi\.interactions\.(\d+)\.(.+)$/.exec(element);
    if (interaction !== null) {
      const index = Number(interaction[1]);
      const field = interaction[2];
      const count = this.interactionCount();
      if (index > count || (index === count && field !== "id")) {
        return MockErrorCode.GENERAL_EXCEPTION;
      }
      switch (field) {
        case "id":
        case "student_response":
          return value.length <= STRING_255_LIMIT
            ? null
            : MockErrorCode.INCORRECT_DATA_TYPE;
        case "type":
          return ["choice", "true-false", "matching", "sequencing"].includes(value)
            ? null
            : MockErrorCode.INCORRECT_DATA_TYPE;
        case "result":
          return value === "correct" || value === "wrong"
            ? null
            : MockErrorCode.INCORRECT_DATA_TYPE;
        case "time":
          return CLOCK_TIME_PATTERN.test(value)
            ? null
            : MockErrorCode.INCORRECT_DATA_TYPE;
        default:
          return MockErrorCode.ELEMENT_NOT_IMPLEMENTED;
      }
    }

    switch (element) {
      case "cmi.suspend_data":
        return value.length > SUSPEND_DATA_LIMIT ? MockErrorCode.INCORRECT_DATA_TYPE : null;

      case "cmi.core.lesson_location":
        return value.length > STRING_255_LIMIT ? MockErrorCode.INCORRECT_DATA_TYPE : null;

      case "cmi.core.lesson_status":
        return LESSON_STATUS_VOCABULARY.has(value) ? null : MockErrorCode.INCORRECT_DATA_TYPE;

      case "cmi.core.exit":
        return EXIT_VOCABULARY.has(value) ? null : MockErrorCode.INCORRECT_DATA_TYPE;

      case "cmi.core.session_time":
        return SESSION_TIME_PATTERN.test(value) ? null : MockErrorCode.INCORRECT_DATA_TYPE;

      case "cmi.core.score.raw":
      case "cmi.core.score.min":
      case "cmi.core.score.max": {
        if (value === "") return null;
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
          return MockErrorCode.INCORRECT_DATA_TYPE;
        }
        return null;
      }

      default:
        return null;
    }
  }

  private interactionCount(): number {
    let highestIndex = -1;
    for (const element of this.values.keys()) {
      const match = /^cmi\.interactions\.(\d+)\./.exec(element);
      if (match !== null) {
        highestIndex = Math.max(highestIndex, Number(match[1]));
      }
    }
    return highestIndex + 1;
  }

  // ---- Test-facing accessors -------------------------------------------

  /** Read a stored value without the write-only and initialization guards. */
  peek(element: string): string {
    return this.values.get(element) ?? "";
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /** Snapshot of persisted state, for simulating a relaunch. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.values);
  }
}

/**
 * Install a mock API on a window object so that discovery finds it, and return
 * a function that removes it again.
 */
export function installMockScormApi(
  api: MockScorm12Api,
  target: Window & { API?: unknown } = globalThis.window as Window,
): () => void {
  const previous = target.API;
  target.API = api;
  return () => {
    target.API = previous;
  };
}
