import { canonicalize } from "../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../infrastructure/hashing/sha256";
import type { TechnicalLabPackBundle } from "./contracts";

function publicationHashInput(
  bundle: TechnicalLabPackBundle,
): TechnicalLabPackBundle {
  const publication = bundle.pack.publication;
  if (publication === undefined) {
    throw new Error(
      "Published Technical Laboratory content is missing publication metadata",
    );
  }
  return {
    ...bundle,
    pack: {
      ...bundle.pack,
      status:
        bundle.pack.status === "retired"
          ? "published"
          : bundle.pack.status,
      publication: {
        contentHash: "",
        publishedAt: publication.publishedAt,
        publishedBy: publication.publishedBy,
      },
    },
  };
}

export function calculateTechnicalLabContentHash(
  bundle: TechnicalLabPackBundle,
): string {
  return sha256Hex(canonicalize(publicationHashInput(bundle)));
}

export function verifyTechnicalLabContentHash(
  bundle: TechnicalLabPackBundle,
): boolean {
  return (
    bundle.pack.publication !== undefined &&
    bundle.pack.publication.contentHash ===
      calculateTechnicalLabContentHash(bundle)
  );
}
