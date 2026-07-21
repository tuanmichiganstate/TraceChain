/**
 * Application-level configuration (specification section 39).
 *
 * WHAT BELONGS HERE, AND WHAT DOES NOT
 * ------------------------------------
 * Only settings that are genuinely about the *application*, not the activity.
 * Anything a content author would want to change -- passing score, point
 * allocation, estimated duration, block size, commit mode -- lives in the
 * scenario definition instead, and is read from there.
 *
 * Those four values used to be duplicated here. Nothing read the copies, so
 * changing the passing score in this file did exactly nothing, silently. Two
 * sources of truth where one is ignored is worse than either alone.
 */

import type { LocaleCode } from "../localization/i18n";

export const APP_VERSION = "1.0.0";
export const SCHEMA_VERSION = 1;

export interface AppConfiguration {
  readonly defaultLocale: LocaleCode;
  readonly allowRestart: boolean;
  readonly allowReviewAfterCompletion: boolean;
  readonly showEnglishTermsInParentheses: boolean;
  readonly autoSaveIntervalMs: number;
  readonly enableTamperDemo: boolean;
  readonly enableStandaloneMode: boolean;
  readonly enableDeveloperMode: boolean;
}

export const defaultAppConfiguration: AppConfiguration = {
  defaultLocale: "vi",
  allowRestart: true,
  allowReviewAfterCompletion: true,
  showEnglishTermsInParentheses: true,
  autoSaveIntervalMs: 30_000,
  enableTamperDemo: true,
  enableStandaloneMode: true,
  enableDeveloperMode: false,
};

/** Developer mode is opt-in via `?debug=true` and never alters scoring. */
export function isDeveloperMode(search: string = globalThis.location?.search ?? ""): boolean {
  return new URLSearchParams(search).get("debug") === "true";
}
