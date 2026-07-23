import type { LearningPlatformAdapter } from "../scorm/learning-platform-adapter";

/**
 * Persistence boundary used by the simulation orchestrator. SCORM reporting
 * remains on LearningPlatformAdapter; this interface owns only authoritative
 * compact attempt state.
 */
export interface SimulationPersistence {
  load(): Promise<string | null>;
  persistAndCommit(encodedState: string): Promise<void>;
}

export class MemorySimulationPersistence implements SimulationPersistence {
  private encodedState: string | null = null;
  private readonly writes: string[] = [];

  async load(): Promise<string | null> {
    return this.encodedState;
  }

  async persistAndCommit(encodedState: string): Promise<void> {
    this.encodedState = encodedState;
    this.writes.push(encodedState);
  }

  get writeHistory(): readonly string[] {
    return this.writes;
  }
}

export class LearningPlatformPersistenceBridge implements SimulationPersistence {
  constructor(private readonly platform: LearningPlatformAdapter) {}

  async load(): Promise<string | null> {
    return this.platform.loadAttemptState();
  }

  async persistAndCommit(encodedState: string): Promise<void> {
    await this.platform.saveAttemptState(encodedState);
    await this.platform.commit();
  }
}

/**
 * Publish is intentionally last. A failed encode or LMS commit leaves the
 * caller's previously published React state authoritative.
 */
export async function persistBeforePublish<TSnapshot, TPublished>(options: {
  readonly snapshot: TSnapshot;
  readonly encode: (snapshot: TSnapshot) => string;
  readonly persistence: SimulationPersistence;
  readonly publish: () => TPublished;
}): Promise<TPublished> {
  const encoded = options.encode(options.snapshot);
  await options.persistence.persistAndCommit(encoded);
  return options.publish();
}
