import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type { ContentPublication } from "../contracts/content";
import type { ScenarioPackListItemV1 } from "../contracts/scenario-authoring";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import { validateScenarioPack } from "./validation";

export interface PublishScenarioPackMetadata {
  readonly publishedAt: string;
  readonly publishedBy: string;
}

export interface RetireScenarioPackMetadata {
  readonly commandId: string;
  readonly retiredAt: string;
  readonly retiredBy: string;
}

export interface RetireScenarioPackResult {
  readonly pack: ScenarioPackV1;
  readonly wasIdempotentReplay: boolean;
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
  return {
    ...content,
    // Retirement is repository lifecycle metadata, not a content change.
    status: pack.status === "retired" ? "published" : pack.status,
    publication: metadata,
  };
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
  list(): Promise<readonly ScenarioPackListItemV1[]>;
  retire(
    packId: string,
    version: string,
    metadata: RetireScenarioPackMetadata,
  ): Promise<RetireScenarioPackResult>;
}

export class MemoryScenarioPackRepository implements ScenarioPackRepository {
  private readonly versions = new Map<string, ScenarioPackV1>();
  private readonly metadata = new Map<
    string,
    {
      updatedAt: string;
      updatedBy: string;
      retirementCommandId?: string;
      retiredAt?: string;
      retiredBy?: string;
    }
  >();

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
    this.metadata.set(key, {
      updatedAt: "1970-01-01T00:00:00.000Z",
      updatedBy: "memory",
    });
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
    this.metadata.set(key, {
      updatedAt: metadata.publishedAt,
      updatedBy: metadata.publishedBy,
    });
    return published;
  }

  async find(packId: string, version: string): Promise<ScenarioPackV1 | null> {
    return this.versions.get(this.key(packId, version)) ?? null;
  }

  async list(): Promise<readonly ScenarioPackListItemV1[]> {
    return [...this.versions.entries()]
      .map(([key, pack]) => {
        const metadata = this.metadata.get(key);
        return {
          schemaVersion: "1.0.0" as const,
          packId: pack.packId,
          version: pack.version,
          status: pack.status,
          domain: pack.manifest.domain,
          titleKey: pack.manifest.title.localizationKey,
          supportedLocales: pack.supportedLocales,
          scenarioCount: pack.scenarios.length,
          ...(pack.publication === undefined
            ? {}
            : { contentHash: pack.publication.contentHash }),
          updatedAt:
            metadata?.updatedAt ?? "1970-01-01T00:00:00.000Z",
          updatedByUserId: metadata?.updatedBy ?? "memory",
          ...(metadata?.retiredAt === undefined
            ? {}
            : { retiredAt: metadata.retiredAt }),
          ...(metadata?.retiredBy === undefined
            ? {}
            : { retiredByUserId: metadata.retiredBy }),
        };
      })
      .sort(
        (left, right) =>
          left.packId.localeCompare(right.packId) ||
          left.version.localeCompare(right.version),
      );
  }

  async retire(
    packId: string,
    version: string,
    metadata: RetireScenarioPackMetadata,
  ): Promise<RetireScenarioPackResult> {
    if (
      metadata.commandId.trim().length === 0 ||
      metadata.retiredBy.trim().length === 0 ||
      !Number.isFinite(Date.parse(metadata.retiredAt)) ||
      !metadata.retiredAt.endsWith("Z")
    ) {
      throw new ScenarioPackPublicationError(
        "Retirement requires a command ID, actor, and ISO 8601 UTC timestamp.",
      );
    }
    const key = this.key(packId, version);
    for (const [otherKey, value] of this.metadata) {
      if (
        value.retirementCommandId === metadata.commandId &&
        otherKey !== key
      ) {
        throw new ScenarioPackPublicationError(
          "Retirement command ID is already bound to another scenario pack.",
        );
      }
    }
    const stored = this.versions.get(key);
    const storedMetadata = this.metadata.get(key);
    if (
      stored?.status === "retired" &&
      storedMetadata?.retirementCommandId === metadata.commandId
    ) {
      return { pack: stored, wasIdempotentReplay: true };
    }
    if (stored === undefined || stored.status !== "published") {
      throw new ScenarioPackPublicationError(
        `Only a published scenario pack may be retired: ${key}.`,
      );
    }
    const retired = deepFreeze({
      ...structuredClone(stored),
      status: "retired" as const,
    });
    if (!verifyScenarioPackContentHash(retired)) {
      throw new ScenarioPackPublicationError(
        `Scenario pack ${key} failed integrity validation before retirement.`,
      );
    }
    this.versions.set(key, retired);
    this.metadata.set(key, {
      updatedAt: metadata.retiredAt,
      updatedBy: metadata.retiredBy,
      retirementCommandId: metadata.commandId,
      retiredAt: metadata.retiredAt,
      retiredBy: metadata.retiredBy,
    });
    return { pack: retired, wasIdempotentReplay: false };
  }

  private key(packId: string, version: string): string {
    return `${packId}@${version}`;
  }
}
