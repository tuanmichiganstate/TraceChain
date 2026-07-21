/**
 * Persistence for when no SCORM API is reachable: local development, a plain
 * static web server, or a preview outside Moodle (specification section 21.12).
 *
 * The same 4096-character discipline is applied here even though localStorage
 * has no such limit, so that a state size problem cannot hide in standalone
 * mode and then appear only in Moodle.
 */

import {
  type LearnerContext,
  type LearningPlatformAdapter,
  type PlatformInitializationResult,
  type PlatformInteraction,
  CompletionStatus,
  CreditMode,
  LessonMode,
  PlatformMode,
} from "../scorm/learning-platform-adapter";

const SUSPEND_DATA_LIMIT = 4096;

interface StoredAttempt {
  encodedState: string;
  location: string;
  score: number | null;
  status: CompletionStatus;
}

export class StandalonePersistenceAdapter implements LearningPlatformAdapter {
  private readonly storageKey: string;
  private readonly storage: Storage | null;
  private readonly diagnostics: string[] = [];

  constructor(options: { appVersion: string; scenarioId: string; storage?: Storage | null }) {
    // Keyed by version and scenario so an older build's state is never
    // misinterpreted by a newer one.
    this.storageKey = `tracechain:${options.appVersion}:${options.scenarioId}`;
    this.storage = options.storage !== undefined ? options.storage : safeLocalStorage();
  }

  async initialize(): Promise<PlatformInitializationResult> {
    if (this.storage === null) {
      this.diagnostics.push("localStorage is unavailable; progress will not persist.");
    }
    return {
      mode: PlatformMode.STANDALONE,
      isConnected: this.storage !== null,
      diagnostics: [...this.diagnostics],
    };
  }

  async getLearnerContext(): Promise<LearnerContext> {
    // No learner identity exists outside an LMS, and none is invented.
    return {
      learnerId: null,
      learnerName: null,
      lessonMode: LessonMode.NORMAL,
      credit: CreditMode.CREDIT,
      isResumed: this.read() !== null,
      previousStatus: this.read()?.status ?? CompletionStatus.NOT_ATTEMPTED,
    };
  }

  async loadAttemptState(): Promise<string | null> {
    const stored = this.read();
    return stored?.encodedState ?? null;
  }

  async saveAttemptState(encodedState: string): Promise<void> {
    if (encodedState.length > SUSPEND_DATA_LIMIT) {
      // Deliberately loud: this would be a silent data-loss bug in Moodle.
      this.diagnostics.push(
        `Encoded state is ${encodedState.length} characters, over the ${SUSPEND_DATA_LIMIT} ` +
          "character SCORM limit. It would be rejected by a real LMS.",
      );
    }
    this.write({ ...this.readOrDefault(), encodedState });
  }

  async setLocation(location: string): Promise<void> {
    this.write({ ...this.readOrDefault(), location });
  }

  async setScore(score: number): Promise<void> {
    this.write({ ...this.readOrDefault(), score });
  }

  async setCompletion(status: CompletionStatus): Promise<void> {
    this.write({ ...this.readOrDefault(), status });
  }

  async recordInteraction(_interaction: PlatformInteraction): Promise<void> {
    // Interactions exist for LMS reporting; there is no consumer in standalone
    // mode, and storing them would waste the state budget.
  }

  async commit(): Promise<void> {
    // Writes are already synchronous.
  }

  async finish(): Promise<void> {
    // Nothing to close.
  }

  getDiagnostics(): readonly string[] {
    return [...this.diagnostics];
  }

  /** Clear stored progress, for the "Bắt đầu lại" restart path. */
  clear(): void {
    try {
      this.storage?.removeItem(this.storageKey);
    } catch {
      this.diagnostics.push("Could not clear stored progress.");
    }
  }

  private readOrDefault(): StoredAttempt {
    return (
      this.read() ?? {
        encodedState: "",
        location: "",
        score: null,
        status: CompletionStatus.NOT_ATTEMPTED,
      }
    );
  }

  private read(): StoredAttempt | null {
    if (this.storage === null) return null;
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return null;
      return parsed as StoredAttempt;
    } catch {
      // Corrupt local state is discarded rather than crashing the load; the
      // learner is offered a restart by the caller.
      this.diagnostics.push("Stored progress could not be parsed and was ignored.");
      return null;
    }
  }

  private write(attempt: StoredAttempt): void {
    if (this.storage === null) return;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(attempt));
    } catch {
      this.diagnostics.push("Could not write progress to localStorage (quota or privacy mode).");
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    // Safari private browsing throws on access rather than on write.
    const probe = "__tracechain_probe__";
    globalThis.localStorage.setItem(probe, "1");
    globalThis.localStorage.removeItem(probe);
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
