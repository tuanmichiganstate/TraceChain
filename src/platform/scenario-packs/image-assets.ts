import {
  sha256Bytes,
  toHex,
} from "../../infrastructure/hashing/sha256";
import type {
  ScenarioImageMimeTypeV2,
  ScenarioImagePurposeV2,
} from "../contracts/scenario-pack";

export const MAXIMUM_SCENARIO_IMAGE_BYTES = 5 * 1024 * 1024;

export interface InspectedScenarioImage {
  readonly originalFileName: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  readonly mimeType: ScenarioImageMimeTypeV2;
  readonly extension: "webp" | "png" | "jpg" | "jpeg";
}

export class ScenarioImageError extends Error {
  constructor(
    readonly code:
      | "IMAGE_FILE_NAME_INVALID"
      | "IMAGE_TOO_LARGE"
      | "IMAGE_FORMAT_UNSUPPORTED"
      | "IMAGE_EXTENSION_MISMATCH"
      | "IMAGE_DIMENSIONS_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "ScenarioImageError";
  }
}

function bytesMatch(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
): boolean {
  return expected.every(
    (value, index) => bytes[offset + index] === value,
  );
}

function pngDimensions(bytes: Uint8Array): {
  readonly width: number;
  readonly height: number;
} | null {
  if (
    bytes.length < 24 ||
    !bytesMatch(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10]) ||
    !bytesMatch(bytes, 12, [73, 72, 68, 82])
  ) {
    return null;
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  };
}

function jpegDimensions(bytes: Uint8Array): {
  readonly width: number;
  readonly height: number;
} | null {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8
  ) {
    return null;
  }
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    const high = bytes[offset];
    const low = bytes[offset + 1];
    if (high === undefined || low === undefined) break;
    const segmentLength = (high << 8) | low;
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      const heightHigh = bytes[offset + 3];
      const heightLow = bytes[offset + 4];
      const widthHigh = bytes[offset + 5];
      const widthLow = bytes[offset + 6];
      if (
        heightHigh === undefined ||
        heightLow === undefined ||
        widthHigh === undefined ||
        widthLow === undefined
      ) {
        break;
      }
      return {
        width: (widthHigh << 8) | widthLow,
        height: (heightHigh << 8) | heightLow,
      };
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): {
  readonly width: number;
  readonly height: number;
} | null {
  if (
    bytes.length < 30 ||
    !bytesMatch(bytes, 0, [82, 73, 70, 70]) ||
    !bytesMatch(bytes, 8, [87, 69, 66, 80])
  ) {
    return null;
  }
  const chunk = String.fromCharCode(
    bytes[12] ?? 0,
    bytes[13] ?? 0,
    bytes[14] ?? 0,
    bytes[15] ?? 0,
  );
  if (chunk === "VP8X") {
    const width =
      1 +
      ((bytes[24] ?? 0) |
        ((bytes[25] ?? 0) << 8) |
        ((bytes[26] ?? 0) << 16));
    const height =
      1 +
      ((bytes[27] ?? 0) |
        ((bytes[28] ?? 0) << 8) |
        ((bytes[29] ?? 0) << 16));
    return { width, height };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const b1 = bytes[21] ?? 0;
    const b2 = bytes[22] ?? 0;
    const b3 = bytes[23] ?? 0;
    const b4 = bytes[24] ?? 0;
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
    };
  }
  if (chunk === "VP8 ") {
    for (let index = 20; index + 9 < bytes.length; index += 1) {
      if (!bytesMatch(bytes, index + 3, [0x9d, 0x01, 0x2a])) continue;
      const width =
        ((bytes[index + 6] ?? 0) | ((bytes[index + 7] ?? 0) << 8)) &
        0x3fff;
      const height =
        ((bytes[index + 8] ?? 0) | ((bytes[index + 9] ?? 0) << 8)) &
        0x3fff;
      return { width, height };
    }
  }
  return null;
}

function safeFileName(fileName: string): string {
  const normalized = fileName.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 180 ||
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new ScenarioImageError(
      "IMAGE_FILE_NAME_INVALID",
      "The image must use a bounded base file name.",
    );
  }
  return normalized;
}

export function inspectScenarioImage(
  bytes: Uint8Array,
  fileName: string,
): InspectedScenarioImage {
  const originalFileName = safeFileName(fileName);
  if (bytes.byteLength > MAXIMUM_SCENARIO_IMAGE_BYTES) {
    throw new ScenarioImageError(
      "IMAGE_TOO_LARGE",
      "Scenario images must not exceed 5 MiB.",
    );
  }
  const extension = originalFileName
    .split(".")
    .at(-1)
    ?.toLowerCase();
  if (
    extension !== "webp" &&
    extension !== "png" &&
    extension !== "jpg" &&
    extension !== "jpeg"
  ) {
    throw new ScenarioImageError(
      "IMAGE_FORMAT_UNSUPPORTED",
      "Only WebP, PNG, and JPEG images are supported.",
    );
  }
  const png = pngDimensions(bytes);
  const jpeg = png === null ? jpegDimensions(bytes) : null;
  const webp = png === null && jpeg === null ? webpDimensions(bytes) : null;
  const detected =
    png === null
      ? jpeg === null
        ? webp === null
          ? null
          : { ...webp, mimeType: "image/webp" as const }
        : { ...jpeg, mimeType: "image/jpeg" as const }
      : { ...png, mimeType: "image/png" as const };
  if (detected === null) {
    throw new ScenarioImageError(
      "IMAGE_FORMAT_UNSUPPORTED",
      "The uploaded bytes are not a supported image.",
    );
  }
  const extensionMatches =
    (detected.mimeType === "image/webp" && extension === "webp") ||
    (detected.mimeType === "image/png" && extension === "png") ||
    (detected.mimeType === "image/jpeg" &&
      (extension === "jpg" || extension === "jpeg"));
  if (!extensionMatches) {
    throw new ScenarioImageError(
      "IMAGE_EXTENSION_MISMATCH",
      "The file extension does not match the image bytes.",
    );
  }
  if (
    !Number.isInteger(detected.width) ||
    !Number.isInteger(detected.height) ||
    detected.width < 1 ||
    detected.height < 1 ||
    detected.width > 8192 ||
    detected.height > 8192
  ) {
    throw new ScenarioImageError(
      "IMAGE_DIMENSIONS_INVALID",
      "Image dimensions must be between 1 and 8192 pixels.",
    );
  }
  return {
    originalFileName,
    sha256: toHex(sha256Bytes(bytes)),
    byteLength: bytes.byteLength,
    width: detected.width,
    height: detected.height,
    mimeType: detected.mimeType,
    extension,
  };
}

export function scenarioImageFilePath(
  purpose: ScenarioImagePurposeV2,
  inspected: InspectedScenarioImage,
): string {
  const directory =
    purpose === "STAFF_PORTRAIT"
      ? "staff"
      : purpose === "SCENE_ILLUSTRATION"
        ? "scenes"
        : "evidence";
  const stem = inspected.originalFileName
    .replace(/\.[^.]+$/u, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80) || "image";
  return `media/${directory}/${stem}-${inspected.sha256.slice(0, 12)}.${inspected.extension}`;
}
