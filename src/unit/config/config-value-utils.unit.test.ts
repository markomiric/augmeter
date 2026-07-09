import { describe, expect, it } from "vitest";
import { toRoundedNumber } from "../../core/config/config-value-utils";

describe("toRoundedNumber", () => {
  it("rounds finite numbers to the nearest integer", () => {
    expect(toRoundedNumber(2.4, 0)).toBe(2);
    expect(toRoundedNumber(2.5, 0)).toBe(3);
    expect(toRoundedNumber(-2.5, 0)).toBe(-2); // Math.round rounds toward +Infinity
    expect(toRoundedNumber(0, 99)).toBe(0);
    expect(toRoundedNumber(60, 0)).toBe(60);
  });

  it("returns the fallback for NaN", () => {
    expect(toRoundedNumber(NaN, 42)).toBe(42);
  });

  it("returns the fallback for Infinity and -Infinity", () => {
    expect(toRoundedNumber(Infinity, 10)).toBe(10);
    expect(toRoundedNumber(-Infinity, 10)).toBe(10);
  });

  it("returns the fallback for non-number types", () => {
    expect(toRoundedNumber("5", 7)).toBe(7);
    expect(toRoundedNumber(undefined, 7)).toBe(7);
    expect(toRoundedNumber(null, 7)).toBe(7);
    expect(toRoundedNumber({}, 7)).toBe(7);
    expect(toRoundedNumber(true, 7)).toBe(7);
  });
});
