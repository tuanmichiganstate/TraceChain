import { describe, expect, it } from "vitest";
import { QuantityUnit } from "../types/enums";
import {
  ConversionFailureReason,
  isConvertibleToGrams,
  isMassNotGreaterThan,
  toGrams,
} from "./convert";

describe("unit conversion", () => {
  describe("the scenario transformation chain", () => {
    it("normalizes the green coffee input", () => {
      const result = toGrams(100, QuantityUnit.KG, null);
      expect(result).toEqual({ ok: true, grams: 100_000 });
    });

    it("normalizes the roasted coffee output", () => {
      const result = toGrams(82, QuantityUnit.KG, null);
      expect(result).toEqual({ ok: true, grams: 82_000 });
    });

    it("normalizes the packaged lot using its package size", () => {
      const result = toGrams(820, QuantityUnit.UNIT, 100);
      expect(result).toEqual({ ok: true, grams: 82_000 });
    });

    /**
     * This is the regression test for the blocking defect. Read naively, 820 is
     * greater than 82 and the packaging transformation is rejected, which makes
     * stage 7 impossible to complete.
     */
    it("accepts packaging 82 KG into 820 UNIT of 100 g, which a raw numeric comparison rejects", () => {
      const input = toGrams(82, QuantityUnit.KG, null);
      const output = toGrams(820, QuantityUnit.UNIT, 100);
      expect(input.ok && output.ok).toBe(true);
      if (!input.ok || !output.ok) return;

      // The naive comparison the specification implied:
      expect(820 > 82).toBe(true);
      // The correct, mass-normalized comparison:
      expect(isMassNotGreaterThan(output.grams, input.grams)).toBe(true);
    });

    it("accepts roasting 100 KG into 82 KG", () => {
      const input = toGrams(100, QuantityUnit.KG, null);
      const output = toGrams(82, QuantityUnit.KG, null);
      expect(input.ok && output.ok).toBe(true);
      if (!input.ok || !output.ok) return;
      expect(isMassNotGreaterThan(output.grams, input.grams)).toBe(true);
    });

    it("still rejects a transformation that creates mass from nothing", () => {
      // 900 packages of 100 g is 90 kg out of 82 kg in -- physically impossible
      // and the rule must still catch it.
      const input = toGrams(82, QuantityUnit.KG, null);
      const output = toGrams(900, QuantityUnit.UNIT, 100);
      expect(input.ok && output.ok).toBe(true);
      if (!input.ok || !output.ok) return;
      expect(isMassNotGreaterThan(output.grams, input.grams)).toBe(false);
    });
  });

  describe("conversion factors", () => {
    it("converts kilograms", () => {
      expect(toGrams(1, QuantityUnit.KG, null)).toEqual({ ok: true, grams: 1000 });
    });

    it("converts grams as an identity", () => {
      expect(toGrams(250, QuantityUnit.GRAM, null)).toEqual({ ok: true, grams: 250 });
    });

    it("converts zero", () => {
      expect(toGrams(0, QuantityUnit.KG, null)).toEqual({ ok: true, grams: 0 });
    });
  });

  describe("failures", () => {
    it("fails when a UNIT quantity has no declared package size", () => {
      const result = toGrams(820, QuantityUnit.UNIT, null);
      expect(result).toEqual({
        ok: false,
        reason: ConversionFailureReason.PACKAGE_SIZE_UNKNOWN,
      });
    });

    it("fails when the package size is zero or negative", () => {
      expect(toGrams(820, QuantityUnit.UNIT, 0)).toEqual({
        ok: false,
        reason: ConversionFailureReason.PACKAGE_SIZE_INVALID,
      });
      expect(toGrams(820, QuantityUnit.UNIT, -100)).toEqual({
        ok: false,
        reason: ConversionFailureReason.PACKAGE_SIZE_INVALID,
      });
    });

    it("fails on a non-finite quantity rather than producing NaN grams", () => {
      expect(toGrams(Number.NaN, QuantityUnit.KG, null)).toEqual({
        ok: false,
        reason: ConversionFailureReason.QUANTITY_NOT_FINITE,
      });
    });
  });

  describe("isConvertibleToGrams", () => {
    it("reports mass units as always convertible", () => {
      expect(isConvertibleToGrams(QuantityUnit.KG, null)).toBe(true);
      expect(isConvertibleToGrams(QuantityUnit.GRAM, null)).toBe(true);
    });

    it("reports UNIT as convertible only with a package size", () => {
      expect(isConvertibleToGrams(QuantityUnit.UNIT, null)).toBe(false);
      expect(isConvertibleToGrams(QuantityUnit.UNIT, 100)).toBe(true);
    });
  });

  describe("mass comparison", () => {
    it("treats equal masses as not greater", () => {
      expect(isMassNotGreaterThan(82_000, 82_000)).toBe(true);
    });

    it("detects a genuine excess", () => {
      expect(isMassNotGreaterThan(82_001, 82_000)).toBe(false);
    });

    it("tolerates floating point noise", () => {
      expect(isMassNotGreaterThan(0.1 + 0.2, 0.3)).toBe(true);
    });
  });
});
