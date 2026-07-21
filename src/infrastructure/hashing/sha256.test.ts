import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { sha256Bytes, sha256Hex, toHex } from "./sha256";

/**
 * The vendored SHA-256 is a documented deviation from specification section
 * 15.1, so it carries a correspondingly heavy burden of proof:
 *
 *   1. The published FIPS 180-4 vectors, which pin standards compliance.
 *   2. A differential test against Node's own OpenSSL-backed SHA-256, which
 *      catches padding and block-boundary errors the fixed vectors would miss.
 */
describe("sha256", () => {
  describe("FIPS 180-4 published test vectors", () => {
    it("hashes the empty string", () => {
      expect(sha256Hex("")).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
    });

    it("hashes the one-block message 'abc'", () => {
      expect(sha256Hex("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    });

    it("hashes the 448-bit two-block message", () => {
      const message = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
      expect(sha256Hex(message)).toBe(
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
      );
    });

    it("hashes the 896-bit multi-block message", () => {
      const message =
        "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmno" +
        "ijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu";
      expect(sha256Hex(message)).toBe(
        "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1",
      );
    });

    it("hashes one million repetitions of 'a'", () => {
      expect(sha256Hex("a".repeat(1_000_000))).toBe(
        "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
      );
    });
  });

  describe("differential test against Node crypto", () => {
    /**
     * Lengths clustered around the 64-byte block boundary and the 56-byte
     * threshold where the length field forces an extra block. These are where
     * hand-written padding logic fails.
     */
    const boundaryLengths = [0, 1, 2, 54, 55, 56, 57, 62, 63, 64, 65,
                             118, 119, 120, 127, 128, 129, 1000, 4096];

    it.each(boundaryLengths)("matches Node crypto at length %i", (length) => {
      const input = "x".repeat(length);
      const expected = createHash("sha256").update(input, "utf8").digest("hex");
      expect(sha256Hex(input)).toBe(expected);
    });

    it("matches Node crypto for Vietnamese text with stacked diacritics", () => {
      // Multi-byte UTF-8 makes the byte length differ from the character
      // length, which is exactly where a naive padding calculation breaks.
      const inputs = [
        "Lô cà phê nhân",
        "Chuyển đổi sản phẩm",
        "Truy xuất nguồn gốc",
        "Hợp tác xã Cà phê Cao nguyên",
        "Quyền sở hữu và quyền lưu giữ",
        "ế ộ ữ ừ ẫ ẩ ợ ạ",
      ];
      for (const input of inputs) {
        const expected = createHash("sha256").update(input, "utf8").digest("hex");
        expect(sha256Hex(input), `mismatch for "${input}"`).toBe(expected);
      }
    });

    it("matches Node crypto across pseudo-random byte sequences", () => {
      // A fixed seed keeps the test deterministic while still covering a wide
      // spread of lengths and byte values.
      let seed = 0x2f6e2b1;
      const nextByte = (): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return (seed >>> 16) & 0xff;
      };

      for (let trial = 0; trial < 200; trial += 1) {
        const length = trial * 3;
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i += 1) {
          bytes[i] = nextByte();
        }
        const expected = createHash("sha256").update(bytes).digest("hex");
        expect(toHex(sha256Bytes(bytes)), `mismatch at length ${length}`).toBe(expected);
      }
    });
  });

  describe("output shape", () => {
    it("always produces 64 lowercase hex characters", () => {
      for (const input of ["", "abc", "Lô cà phê", "x".repeat(500)]) {
        expect(sha256Hex(input)).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it("produces a 32-byte digest", () => {
      expect(sha256Bytes(new Uint8Array(0))).toHaveLength(32);
    });

    it("is deterministic across repeated calls", () => {
      const input = "BAT_GREEN_COFFEE_001";
      expect(sha256Hex(input)).toBe(sha256Hex(input));
    });

    it("produces different digests for single-character differences", () => {
      expect(sha256Hex("BAT_GREEN_COFFEE_001")).not.toBe(sha256Hex("BAT_GREEN_COFFEE_002"));
    });
  });
});
