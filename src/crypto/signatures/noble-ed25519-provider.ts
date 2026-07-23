import { signAsync, verifyAsync } from "@noble/ed25519";
import {
  sha256Bytes,
  toHex,
} from "../../infrastructure/hashing/sha256";
import { decodeBase64Url } from "./base64url";
import type {
  EducationalPrivateKey,
  EducationalPublicKey,
  SignatureProvider,
} from "./types";

const PKCS8_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
  0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);
const SPKI_PREFIX = Uint8Array.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65,
  0x70, 0x03, 0x21, 0x00,
]);

function requireEd25519(algorithm: string): void {
  if (algorithm !== "Ed25519") {
    throw new Error(`Unsupported educational signature algorithm "${algorithm}"`);
  }
}

function unwrapDer(
  encoded: string,
  prefix: Uint8Array,
  rawLength: number,
  format: "PKCS#8" | "SPKI",
): Uint8Array {
  const der = decodeBase64Url(encoded);
  if (
    der.length !== prefix.length + rawLength ||
    prefix.some((byte, index) => der[index] !== byte)
  ) {
    throw new Error(`Educational Ed25519 key is not canonical ${format}`);
  }
  return der.slice(prefix.length);
}

/**
 * Cross-platform provider selected after native Web Crypto failed the
 * repository's WebKit and Mobile Safari compatibility gate.
 */
export class NobleEd25519Provider implements SignatureProvider {
  readonly algorithm = "Ed25519" as const;

  async sign(
    privateKey: EducationalPrivateKey,
    message: Uint8Array,
  ): Promise<Uint8Array> {
    requireEd25519(privateKey.algorithm);
    const seed = unwrapDer(
      privateKey.pkcs8Base64Url,
      PKCS8_PREFIX,
      32,
      "PKCS#8",
    );
    return Uint8Array.from(await signAsync(message, seed));
  }

  async verify(
    publicKey: EducationalPublicKey,
    message: Uint8Array,
    signature: Uint8Array,
  ): Promise<boolean> {
    requireEd25519(publicKey.algorithm);
    const rawPublicKey = unwrapDer(
      publicKey.spkiBase64Url,
      SPKI_PREFIX,
      32,
      "SPKI",
    );
    return verifyAsync(signature, message, rawPublicKey, { zip215: false });
  }

  async fingerprint(publicKey: EducationalPublicKey): Promise<string> {
    requireEd25519(publicKey.algorithm);
    const spki = decodeBase64Url(publicKey.spkiBase64Url);
    return `SHA-256:${toHex(sha256Bytes(spki))}`;
  }
}
