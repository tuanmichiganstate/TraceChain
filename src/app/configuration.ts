/**
 * Application configuration (specification section 39).
 *
 * These values must stay changeable without architectural work, so nothing
 * below is read directly by domain code -- it is passed in.
 */

import type { LocaleCode } from "../localization/i18n";

export const APP_VERSION = "1.0.0";
export const SCENARIO_ID = "SCN_COFFEE_001";
export const SCHEMA_VERSION = 1;

export const DEFAULT_PASSING_SCORE = 70;

export interface AppConfiguration {
  readonly defaultLocale: LocaleCode;
  readonly passingScore: number;
  readonly allowRestart: boolean;
  readonly allowReviewAfterCompletion: boolean;
  readonly showEnglishTermsInParentheses: boolean;
  readonly maxInvalidAttemptPenalty: number;
  readonly hintPenaltyPercent: number;
  readonly autoSaveIntervalMs: number;
  readonly blockCommitMode: "IMMEDIATE" | "STAGE_BOUNDARY";
  readonly maxTransactionsPerBlock: number;
  readonly enableTamperDemo: boolean;
  readonly enableStandaloneMode: boolean;
  readonly enableDeveloperMode: boolean;
  readonly estimatedMinutes: number;
}

export const defaultAppConfiguration: AppConfiguration = {
  defaultLocale: "vi",
  passingScore: DEFAULT_PASSING_SCORE,
  allowRestart: true,
  allowReviewAfterCompletion: true,
  showEnglishTermsInParentheses: true,
  maxInvalidAttemptPenalty: 40,
  hintPenaltyPercent: 10,
  autoSaveIntervalMs: 30_000,
  blockCommitMode: "STAGE_BOUNDARY",
  maxTransactionsPerBlock: 2,
  enableTamperDemo: true,
  enableStandaloneMode: true,
  enableDeveloperMode: false,
  // Nine stages rather than ten, to protect this budget (section 2.4).
  estimatedMinutes: 40,
};

/** Developer mode is opt-in via `?debug=true` and never alters scoring. */
export function isDeveloperMode(search: string = globalThis.location?.search ?? ""): boolean {
  return new URLSearchParams(search).get("debug") === "true";
}
