/** Injectable deterministic environment services for the simulation core. */

export interface Clock {
  now(): string;
}

export interface RandomSource {
  next(): number;
}

export interface IdGenerator {
  nextId(prefix: string): string;
}

export interface SimulationEnvironment {
  readonly clock: Clock;
  readonly random: RandomSource;
  readonly ids: IdGenerator;
}

export class FixedClock implements Clock {
  constructor(private readonly instant: string) {
    if (!Number.isFinite(Date.parse(instant))) {
      throw new Error(`Invalid fixed-clock instant: "${instant}"`);
    }
  }

  now(): string {
    return new Date(this.instant).toISOString();
  }
}

/** FNV-1a turns an authored seed into a stable 32-bit PRNG state. */
function seedToUint32(seed: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(seed)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: compact, deterministic and sufficient for authored variation. */
export class SeededRandomSource implements RandomSource {
  private state: number;

  constructor(seed: string) {
    this.state = seedToUint32(seed);
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }
}

export class SequenceIdGenerator implements IdGenerator {
  private sequence: number;

  constructor(startAt = 1) {
    if (!Number.isInteger(startAt) || startAt < 0) {
      throw new Error(`Identifier sequence must be a non-negative integer: ${startAt}`);
    }
    this.sequence = startAt;
  }

  nextId(prefix: string): string {
    const id = `${prefix}_${String(this.sequence).padStart(6, "0")}`;
    this.sequence += 1;
    return id;
  }
}
