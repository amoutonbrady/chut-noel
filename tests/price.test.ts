import { describe, expect, it } from "vitest";
import { inBudget, parsePrice } from "../src/lib/price";

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

describe("inBudget", () => {
  it("uses [min, max) ranges", () => {
    expect(inBudget("25 €", "lt25")).toBe(false);
    expect(inBudget("25 €", "25to50")).toBe(true);
    expect(inBudget("99.9 €", "50to100")).toBe(true);
    expect(inBudget("100 €", "gte100")).toBe(true);
  });

  it("keeps unpriced items only under all", () => {
    expect(inBudget(undefined, "all")).toBe(true);
    expect(inBudget(undefined, "lt25")).toBe(false);
  });
});
