import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type { ContentPublication } from "../contracts/content";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import { validateScenarioPack } from "./validation";

export interface PublishScenarioPackMetadata {
  readonly publishedAt: string;
  readonly publishedBy: string;
}

export class ScenarioPackPublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenarioPackPublicationError";
  }
}

function deepFreeze<T>(value: T, visited = new Set<object>()): T {
  if (typeof value !== "object" || value === null || visited.has(value)) {
    return value;
  }
  visited.add(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested, visited);
  }
  return Object.freeze(value);
}

function publicationHashInput(
  pack: ScenarioPackV1,
): Omit<ScenarioPackV1, "publication"> & {
  readonly publication: Omit<ContentPublication, "contentHash">;
} {
  const { publication, ...content } = pack;
  if (publication === undefined) {
    throw new ScenarioPackPublicationError(
      "Published pack is missing publication metadata.",
    );
  }
  const { contentHash: _contentHash, ...metadata } = publication;
  return { ...content, publication: metadata };
}

export function calculateScenarioPackContentHash(
  pack: ScenarioPackV1,
): string {
  return sha256Hex(canonicalize(publicationHashInput(pack)));
}

export function publishScenarioPack(
  draft: ScenarioPackV1,
  metadata: PublishScenarioPackMetadata,
): ScenarioPackV1 {
  const validation = validateScenarioPack(draft);
  if (!validation.isValid) {
    const firstIssue = validation.issues[0];
    throw new ScenarioPackPublicationError(
      firstIssue === undefined
        ? "Scenario pack is invalid."
        : `${firstIssue.path}: ${firstIssue.message}`,
    );
  }
  if (draft.status === "published" || draft.status === "retired") {
    throw new ScenarioPackPublicationError(
      `Scenario pack ${draft.packId}@${draft.version} is already immutable.`,
    );
  }
  if (
    !Number.isFinite(Date.parse(metadata.publishedAt)) ||
    !metadata.publishedAt.endsWith("Z")
  ) {
    throw new ScenarioPackPublicationError(
      "Publication time must be an ISO 8601 UTC timestamp.",
    );
  }

  const withoutHash: ScenarioPackV1 = {
    ...structuredClone(draft),
    status: "published",
    publication: {
      contentHash: "0".repeat(64),
      publishedAt: new Date(metadata.publishedAt).toISOString(),
      publishedBy: metadata.publishedBy,
    },
  };
  const contentHash = calculateScenarioPackContentHash(withoutHash);
  const published: ScenarioPackV1 = {
    ...withoutHash,
    publication: {
      contentHash,
      publishedAt: new Date(metadata.publishedAt).toISOString(),
      publishedBy: metadata.publishedBy,
    },
  };
  const publishedValidation = validateScenarioPack(published);
  if (!publishedValidation.isValid) {
    const firstIssue = publishedValidation.issues[0];
    throw new ScenarioPackPublicationError(
      firstIssue === undefined
        ? "Published scenario pack is invalid."
        : `${firstIssue.path}: ${firstIssue.message}`,
    );
  }
  return deepFreeze(published);
}

export function verifyScenarioPackContentHash(pack: ScenarioPackV1): boolean {
  return (
    pack.publication !== undefined &&
    pack.publication.contentHash === calculateScenarioPackContentHash(pack)
  );
}

export interface ScenarioPackRepository {
  saveDraft(pack: ScenarioPackV1): Promise<void>;
  publish(
    packId: string,
    version: string,
    metadata: PublishScenarioPackMetadata,
  ): Promise<ScenarioPackV1>;
  find(packId: string, version: string): Promise<ScenarioPackV1 | null>;
}

export class MemoryScenarioPackRepository implements ScenarioPackRepository {
  private readonly versions = new Map<string, ScenarioPackV1>();

  async saveDraft(pack: ScenarioPackV1): Promise<void> {
    const validation = validateScenarioPack(pack);
    if (!validation.isValid) {
      const firstIssue = validation.issues[0];
      throw new ScenarioPackPublicationError(
        firstIssue === undefined
          ? "Scenario pack is invalid."
          : `${firstIssue.path}: ${firstIssue.message}`,
      );
    }
    if (pack.status === "published" || pack.status === "retired") {
      throw new ScenarioPackPublicationError(
        "Published content must enter the repository through publish().",
      );
    }
    const key = this.key(pack.packId, pack.version);
    const existing = this.versions.get(key);
    if (
      existing?.status === "published" ||
      existing?.status === "retired"
    ) {
      throw new ScenarioPackPublicationError(
        `Published scenario pack ${key} cannot be replaced.`,
      );
    }
    this.versions.set(key, deepFreeze(structuredClone(pack)));
  }

  async publish(
    packId: string,
    version: string,
    metadata: PublishScenarioPackMetadata,
  ): Promise<ScenarioPackV1> {
    const key = this.key(packId, version);
    const stored = this.versions.get(key);
    if (stored === undefined) {
      throw new ScenarioPackPublicationError(
        `Scenario pack ${key} does not exist.`,
      );
    }
    if (stored.status === "published" || stored.status === "retired") {
      throw new ScenarioPackPublicationError(
        `Published scenario pack ${key} cannot be replaced.`,
      );
    }
    const published = publishScenarioPack(stored, metadata);
    this.versions.set(key, published);
    return published;
  }

  async find(packId: string, version: string): Promise<ScenarioPackV1 | null> {
    return this.versions.get(this.key(packId, version)) ?? null;
  }

  private key(packId: string, version: string): string {
    return `${packId}@${version}`;
  }
}
