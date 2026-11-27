import { describe, expect, it } from "vitest";
import { inPriceRange, parsePrice, priceCeiling } from "../src/lib/price";

describe("parsePrice", () => {
  it.each([
    ["42 €", 42],
    ["99.9 €", 99.9],
    ["59,90 €", 59.9],
    ["1 299,00 €", 1299],
    ["1 299,00 €", 1299],
    ["1.299,00 €", 1299],
    ["$1,299.99", 1299.99],
    ["€49.5", 49.5],
    ["Ex. 120 €", 120],
  ])("%s → %d", (hint, expected) => {
    expect(parsePrice(hint)).toBe(expected);
  });

  it("returns null without a number", () => {
    expect(parsePrice(undefined)).toBeNull();
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("selon la taille")).toBeNull();
  });
});

describe("priceCeiling", () => {
  it("rounds the highest price up to a tidy step", () => {
    expect(priceCeiling(["42 €", "12 €"])).toBe(50);
    expect(priceCeiling(["99.9 €"])).toBe(100);
    expect(priceCeiling(["149 €"])).toBe(150);
    expect(priceCeiling(["1 299 €"])).toBe(1300);
  });

  it("never goes below 50 €, even without prices", () => {
    expect(priceCeiling([undefined, "selon taille"])).toBe(50);
  });
});

describe("inPriceRange", () => {
  it("uses inclusive bounds", () => {
    expect(inPriceRange("25 €", [0, 25])).toBe(true);
    expect(inPriceRange("25 €", [25, 50])).toBe(true);
    expect(inPriceRange("50,01 €", [25, 50])).toBe(false);
  });

  it("keeps unpriced items only without a range", () => {
    expect(inPriceRange(undefined, null)).toBe(true);
    expect(inPriceRange(undefined, [0, 100])).toBe(false);
  });
});
