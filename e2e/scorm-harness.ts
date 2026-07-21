import type { Page } from "@playwright/test";

/**
 * A SCORM 1.2 API installed on `window` before the application boots.
 *
 * It has to be an init script rather than an ordinary `evaluate`: the adapter
 * looks for `window.API` during its first effect, so anything injected after
 * load arrives too late and the application has already fallen back to
 * standalone mode.
 *
 * Deliberately strict about the two constraints that bite in production --
 * `suspend_data` is refused past 4096 characters with error 405, and every call
 * after `LMSFinish` is refused -- because a permissive mock would let exactly
 * the bugs this exists to catch reach a classroom. Writes are logged so a test
 * can assert that review mode wrote nothing at all.
 */
export interface ScormHarnessOptions {
  readonly initialValues?: Readonly<Record<string, string>>;
}

export async function installScormApi(
  page: Page,
  options: ScormHarnessOptions = {},
): Promise<void> {
  await page.addInitScript((initial: Record<string, string>) => {
    const values: Record<string, string> = {
      "cmi.core.student_id": "student-001",
      "cmi.core.student_name": "Nguyen, Van A",
      "cmi.core.lesson_status": "not attempted",
      "cmi.core.lesson_location": "",
      "cmi.core.credit": "credit",
      "cmi.core.entry": "ab-initio",
      "cmi.core.lesson_mode": "normal",
      "cmi.core.score.raw": "",
      "cmi.suspend_data": "",
      ...initial,
    };

    const writes: string[] = [];
    let finished = false;
    let lastError = "0";

    const api = {
      LMSInitialize: () => "true",
      LMSFinish: () => {
        finished = true;
        return "true";
      },
      LMSGetValue: (key: string) => {
        if (finished) {
          lastError = "101";
          return "";
        }
        return values[key] ?? "";
      },
      LMSSetValue: (key: string, value: string) => {
        if (finished) {
          lastError = "101";
          return "false";
        }
        // CMIString4096. Real Moodle enforces this exactly, and returns 405.
        if (key === "cmi.suspend_data" && value.length > 4096) {
          lastError = "405";
          return "false";
        }
        values[key] = value;
        writes.push(`${key}=${value}`);
        lastError = "0";
        return "true";
      },
      LMSCommit: () => "true",
      LMSGetLastError: () => lastError,
      LMSGetErrorString: () => "",
      LMSGetDiagnostic: () => "",
    };

    const target = window as unknown as Record<string, unknown>;
    target["API"] = api;
    // Out-of-band inspection, so a test can read state that LMSGetValue would
    // refuse after LMSFinish -- the same role `peek` plays in the unit mock.
    target["__scormPeek"] = (key: string) => values[key] ?? "";
    target["__scormWrites"] = () => writes;
  }, options.initialValues ?? {});
}

export async function peek(page: Page, element: string): Promise<string> {
  return page.evaluate(
    (key) => (window as unknown as { __scormPeek(k: string): string }).__scormPeek(key),
    element,
  );
}

export async function writes(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __scormWrites(): string[] }).__scormWrites(),
  );
}
