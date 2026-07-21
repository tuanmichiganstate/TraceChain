import { describe, expect, it } from "vitest";
import { canonicalize, CanonicalizationError } from "./canonicalize";

describe("canonicalize", () => {
  describe("key ordering", () => {
    it("sorts object keys so that insertion order does not affect the hash input", () => {
      const insertedOneWay = { zebra: 1, alpha: 2, mango: 3 };
      const insertedAnother = { mango: 3, zebra: 1, alpha: 2 };
      expect(canonicalize(insertedOneWay)).toBe(canonicalize(insertedAnother));
      expect(canonicalize(insertedOneWay)).toBe('{"alpha":2,"mango":3,"zebra":1}');
    });

    it("sorts keys recursively through nested objects", () => {
      const value = { outer: { zulu: 1, alpha: 2 }, another: { yankee: 3, bravo: 4 } };
      expect(canonicalize(value)).toBe(
        '{"another":{"bravo":4,"yankee":3},"outer":{"alpha":2,"zulu":1}}',
      );
    });

    it("sorts keys inside objects nested within arrays", () => {
      const value = [{ b: 1, a: 2 }];
      expect(canonicalize(value)).toBe('[{"a":2,"b":1}]');
    });
  });

  describe("array handling", () => {
    it("preserves array order, which is meaningful", () => {
      expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
      expect(canonicalize([3, 1, 2])).not.toBe(canonicalize([1, 2, 3]));
    });

    it("serializes an empty array", () => {
      expect(canonicalize([])).toBe("[]");
    });

    it("preserves transaction ID order, which determines block hashes", () => {
      const forward = ["TX_000001", "TX_000002"];
      const reversed = ["TX_000002", "TX_000001"];
      expect(canonicalize(forward)).not.toBe(canonicalize(reversed));
    });
  });

  describe("undefined handling", () => {
    it("excludes undefined properties entirely", () => {
      expect(canonicalize({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
    });

    it("treats an absent property and an explicitly-undefined property identically", () => {
      // This matters because TransactionStatus advances by adding optional
      // timestamps; an absent `committedAt` must hash the same either way.
      expect(canonicalize({ a: 1, committedAt: undefined })).toBe(canonicalize({ a: 1 }));
    });

    it("rejects undefined inside an array, where position is meaningful", () => {
      expect(() => canonicalize([1, undefined, 3])).toThrow(CanonicalizationError);
    });
  });

  describe("date normalization", () => {
    it("normalizes Date objects to ISO 8601 strings", () => {
      const date = new Date("2026-06-16T09:30:00.000Z");
      expect(canonicalize(date)).toBe('"2026-06-16T09:30:00.000Z"');
    });

    it("hashes a Date and its ISO string form identically", () => {
      const iso = "2026-06-16T09:30:00.000Z";
      expect(canonicalize({ at: new Date(iso) })).toBe(canonicalize({ at: iso }));
    });

    it("rejects an Invalid Date rather than emitting null", () => {
      expect(() => canonicalize({ at: new Date("not a date") })).toThrow(CanonicalizationError);
    });
  });

  describe("rejecting values that would corrupt a hash input", () => {
    it("rejects NaN, which JSON.stringify would silently turn into null", () => {
      expect(() => canonicalize({ quantity: Number.NaN })).toThrow(CanonicalizationError);
    });

    it("rejects Infinity", () => {
      expect(() => canonicalize({ quantity: Number.POSITIVE_INFINITY })).toThrow(
        CanonicalizationError,
      );
    });

    it("rejects functions", () => {
      expect(() => canonicalize({ evaluate: () => true })).toThrow(CanonicalizationError);
    });

    it("rejects symbols", () => {
      expect(() => canonicalize({ marker: Symbol("x") })).toThrow(CanonicalizationError);
    });

    it("rejects bigint", () => {
      expect(() => canonicalize({ quantity: 10n })).toThrow(CanonicalizationError);
    });

    it("rejects circular references", () => {
      const circular: Record<string, unknown> = { assetId: "BAT_GREEN_COFFEE_001" };
      circular["self"] = circular;
      expect(() => canonicalize(circular)).toThrow(/Circular reference/);
    });

    it("reports the path of the offending value", () => {
      try {
        canonicalize({ command: { payload: { quantity: Number.NaN } } });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect((error as CanonicalizationError).path).toBe("command.payload.quantity");
      }
    });

    it("allows the same object to appear twice in a non-circular graph", () => {
      const shared = { organizationId: "ORG_PRODUCER_COOP" };
      expect(() => canonicalize({ owner: shared, custodian: shared })).not.toThrow();
    });
  });

  describe("primitive and Unicode handling", () => {
    it("serializes primitives", () => {
      expect(canonicalize(null)).toBe("null");
      expect(canonicalize(true)).toBe("true");
      expect(canonicalize(false)).toBe("false");
      expect(canonicalize(42)).toBe("42");
      expect(canonicalize("abc")).toBe('"abc"');
    });

    it("normalizes negative zero to zero", () => {
      expect(canonicalize(-0)).toBe(canonicalize(0));
    });

    it("preserves Vietnamese diacritics without escaping them", () => {
      const value = { productName: "Lô cà phê nhân Arabica Lâm Đồng" };
      const result = canonicalize(value);
      expect(result).toContain("Lô cà phê nhân Arabica Lâm Đồng");
    });

    it("escapes quotes and control characters in strings", () => {
      expect(canonicalize('say "hi"')).toBe('"say \\"hi\\""');
      expect(canonicalize("line\nbreak")).toBe('"line\\nbreak"');
    });

    it("produces output that parses as valid JSON", () => {
      const value = {
        transactionId: "TX_000001",
        quantity: 100,
        tags: ["a", "b"],
        nested: { deep: true },
      };
      expect(() => JSON.parse(canonicalize(value))).not.toThrow();
    });
  });
});
