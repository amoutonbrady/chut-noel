import { describe, expect, it } from "vitest";
import { formatAgo, itemDates } from "../src/lib/dates";

const now = new Date(2026, 10, 27, 14, 0); // 27 nov. 2026, 14:00 local

describe("formatAgo", () => {
  it.each([
    [new Date(2026, 10, 27, 9, 0), "aujourd'hui"],
    [new Date(2026, 10, 26, 23, 59), "hier"],
    [new Date(2026, 10, 24, 12, 0), "il y a 3 jours"],
    [new Date(2026, 10, 12, 12, 0), "le 12 nov."],
    [new Date(2025, 0, 5, 12, 0), "le 5 janv. 2025"],
  ])("%s", (date, expected) => {
    expect(formatAgo(date.toISOString(), now)).toBe(expected);
  });

  it("returns empty text for an invalid date", () => {
    expect(formatAgo("nope", now)).toBe("");
  });
});

describe("itemDates", () => {
  it("skips the edit part when unchanged", () => {
    const iso = new Date(2026, 10, 26, 10, 0).toISOString();
    expect(itemDates(iso, iso, now)).toBe("Ajoutée hier");
  });

  it("adds the edit part when updated later", () => {
    const created = new Date(2026, 10, 12, 10, 0).toISOString();
    const updated = new Date(2026, 10, 27, 10, 0).toISOString();
    expect(itemDates(created, updated, now)).toBe(
      "Ajoutée le 12 nov., modifiée aujourd'hui",
    );
  });
});
