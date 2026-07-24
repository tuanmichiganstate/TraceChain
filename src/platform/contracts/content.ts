export interface LocalizedText {
  readonly localizationKey: string;
}

export type VersionLifecycleStatus =
  | "draft"
  | "validated"
  | "published"
  | "retired";

export interface VersionedReference {
  readonly id: string;
  readonly version: string;
}

export interface ContentPublication {
  readonly contentHash: string;
  readonly publishedAt: string;
  readonly publishedBy: string;
}
