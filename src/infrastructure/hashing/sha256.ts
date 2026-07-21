/**
 * Synchronous SHA-256 (FIPS 180-4).
 *
 * WHY A VENDORED IMPLEMENTATION INSTEAD OF `crypto.subtle.digest`
 * ---------------------------------------------------------------
 * The specification (section 15.1) nominates `crypto.subtle.digest("SHA-256", data)`.
 * That API was rejected here for two concrete reasons, and the deviation is
 * deliberate and documented in docs/ARCHITECTURE.md:
 *
 *   1. `crypto.subtle` is asynchronous. Hashing is reachable from the ledger
 *      commit path, from attempt replay on load, and from integrity
 *      verification. Making it async forces `await` through those paths and
 *      into every test that touches them, for no behavioural benefit.
 *
 *   2. `crypto.subtle` is `undefined` outside a secure context. A Moodle
 *      instance served over plain HTTP -- which university intranet
 *      deployments frequently are -- would lose the entire ledger with no
 *      recovery path.
 *
 * This implementation produces byte-identical output to `crypto.subtle` and is
 * verified against the published FIPS 180-4 test vectors in sha256.test.ts.
 * `TextEncoder`, unlike `crypto.subtle`, carries no secure-context requirement.
 */

/** Round constants: first 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Initial hash values: first 32 bits of the fractional parts of the square roots of the first 8 primes. */
const INITIAL_HASH = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const BLOCK_SIZE_BYTES = 64;
const LENGTH_FIELD_BYTES = 8;

/** Rotate a 32-bit word right by `bits`, returning an unsigned result. */
function rotateRight(word: number, bits: number): number {
  return ((word >>> bits) | (word << (32 - bits))) >>> 0;
}

/**
 * Hash a byte sequence, returning the 32-byte digest.
 *
 * Every array index in the compression loop is provably within bounds (the
 * schedule is a fixed 64 words and the block loop is bounded by the padded
 * length), so the `as number` assertions below satisfy `noUncheckedIndexedAccess`
 * without weakening it for the rest of the codebase.
 */
export function sha256Bytes(message: Uint8Array): Uint8Array {
  const messageBitLength = message.length * 8;

  // Pad to the smallest multiple of 64 bytes that fits the message, the 0x80
  // terminator, and the 8-byte big-endian length field.
  const paddedLength =
    (((message.length + LENGTH_FIELD_BYTES) / BLOCK_SIZE_BYTES) | 0) * BLOCK_SIZE_BYTES +
    BLOCK_SIZE_BYTES;

  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;

  const view = new DataView(padded.buffer);
  // JavaScript numbers stay exact to 2^53, so the high word is a plain division.
  view.setUint32(paddedLength - 8, Math.floor(messageBitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, messageBitLength >>> 0, false);

  const hash = INITIAL_HASH.slice();
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += BLOCK_SIZE_BYTES) {
    for (let i = 0; i < 16; i += 1) {
      schedule[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const back15 = schedule[i - 15] as number;
      const back2 = schedule[i - 2] as number;
      const s0 = (rotateRight(back15, 7) ^ rotateRight(back15, 18) ^ (back15 >>> 3)) >>> 0;
      const s1 = (rotateRight(back2, 17) ^ rotateRight(back2, 19) ^ (back2 >>> 10)) >>> 0;
      schedule[i] =
        ((schedule[i - 16] as number) + s0 + (schedule[i - 7] as number) + s1) >>> 0;
    }

    let a = hash[0] as number;
    let b = hash[1] as number;
    let c = hash[2] as number;
    let d = hash[3] as number;
    let e = hash[4] as number;
    let f = hash[5] as number;
    let g = hash[6] as number;
    let h = hash[7] as number;

    for (let i = 0; i < 64; i += 1) {
      const sigma1 = (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) >>> 0;
      const choose = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 =
        (h + sigma1 + choose + (ROUND_CONSTANTS[i] as number) + (schedule[i] as number)) >>> 0;
      const sigma0 = (rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) >>> 0;
      const majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (sigma0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = ((hash[0] as number) + a) >>> 0;
    hash[1] = ((hash[1] as number) + b) >>> 0;
    hash[2] = ((hash[2] as number) + c) >>> 0;
    hash[3] = ((hash[3] as number) + d) >>> 0;
    hash[4] = ((hash[4] as number) + e) >>> 0;
    hash[5] = ((hash[5] as number) + f) >>> 0;
    hash[6] = ((hash[6] as number) + g) >>> 0;
    hash[7] = ((hash[7] as number) + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  for (let i = 0; i < 8; i += 1) {
    digestView.setUint32(i * 4, hash[i] as number, false);
  }
  return digest;
}

/** Render a byte sequence as lowercase hexadecimal. */
export function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

const textEncoder = new TextEncoder();

/**
 * Hash a UTF-8 string, returning a 64-character lowercase hex digest.
 * This is the entry point used by every hashing call site in the application.
 */
export function sha256Hex(input: string): string {
  return toHex(sha256Bytes(textEncoder.encode(input)));
}

/**
 * The port through which the domain receives hashing. Declared as a type so a
 * future ledger adapter (Tier 2 server, Tier 3 Fabric) can substitute a
 * different digest source without touching domain code.
 */
export type HashFunction = (input: string) => string;

export const defaultHashFunction: HashFunction = sha256Hex;
