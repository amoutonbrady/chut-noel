import { describe, expect, it } from "vitest";
import { hashString, intRange, mulberry32, pick, range } from "../src/lib/prng";
import {
  generateThemeSpec,
  randomSeed,
  THEME_LIST,
} from "../src/lib/themes";
import {
  isSoundEnabled,
  playAntiSpoilAlarm,
  playBell,
  playClick,
  playConfettiPop,
  playPaperRustle,
  playSecretJingle,
  setSoundEnabled,
} from "../src/lib/sound";
import type { ThemeId } from "../src/shared/types";

const REQUIRED_CSS_VARS = [
  "--text",
  "--text-muted",
  "--surface",
  "--surface-elevated",
  "--primary",
  "--primary-ink",
  "--accent",
  "--accent-ink",
  "--border",
  "--bg-start",
  "--bg-end",
  "--font-display",
  "--font-hand",
  "--font-body",
  "--card-tilt",
  "--radius-card",
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  const num = Number.parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("PRNG utilities", () => {
  it("mulberry32 is 100% deterministic for identical seeds", () => {
    const a = mulberry32(25122026);
    const b = mulberry32(25122026);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("hashString produces distinct unsigned hashes for distinct strings", () => {
    expect(hashString("lutins")).toBe(hashString("lutins"));
    expect(hashString("lutins")).not.toBe(hashString("chalet"));
    expect(hashString("neon")).not.toBe(hashString("boule-a-neige"));
  });

  it("pick, range and intRange stay within bounds deterministically", () => {
    const rng = mulberry32(4242);
    const arr = ["a", "b", "c", "d"] as const;
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(pick(rng, arr));
      const r = range(rng, 10, 20);
      expect(r).toBeGreaterThanOrEqual(10);
      expect(r).toBeLessThan(20);
      const n = intRange(rng, 3, 7);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });
});

describe("Procedural themes engine", () => {
  const allThemes: ThemeId[] = ["lutins", "chalet", "neon", "boule-a-neige"];

  it("exports metadata for all 4 themes", () => {
    expect(THEME_LIST.map((t) => t.id)).toEqual(allThemes);
    for (const meta of THEME_LIST) {
      expect(meta.name.length).toBeGreaterThan(2);
      expect(meta.description.length).toBeGreaterThan(10);
      expect(meta.swatch).toHaveLength(3);
    }
  });

  it("is 100% deterministic for the same (theme, seed)", () => {
    for (const theme of allThemes) {
      const first = generateThemeSpec(theme, 77421);
      const second = generateThemeSpec(theme, 77421);
      expect(first).toEqual(second);
    }
  });

  it("varies tagline, mascotName, and visual geometry across seeds", () => {
    for (const theme of allThemes) {
      const specs = Array.from({ length: 16 }, (_, idx) =>
        generateThemeSpec(theme, 1000 + idx * 7919),
      );
      const uniqueTaglines = new Set(specs.map((s) => s.tagline));
      const uniqueMascots = new Set(specs.map((s) => s.mascotName));
      const uniqueTilts = new Set(specs.map((s) => s.cssVars["--card-tilt"]));
      expect(uniqueTaglines.size).toBeGreaterThan(2);
      expect(uniqueMascots.size).toBeGreaterThan(4);
      expect(uniqueTilts.size).toBeGreaterThan(4);
    }
  });

  it("generates all required CSS tokens and WCAG AA contrast across every theme and seed", () => {
    const seeds = [1001, 2512, 4242, 9999, 31415, 77777, 123456, 888888];
    for (const theme of allThemes) {
      for (const seed of seeds) {
        const spec = generateThemeSpec(theme, seed);
        for (const token of REQUIRED_CSS_VARS) {
          expect(spec.cssVars[token]).toBeTruthy();
        }
        expect(["snow", "embers", "neon-bits", "blizzard"]).toContain(
          spec.particleMode,
        );

        // WCAG AA (>= 4.5:1) for text on surface, textMuted on surface, text on bgStart,
        // primaryInk on primary, and accentInk on accent
        expect(contrastRatio(spec.palette.text, spec.palette.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(spec.palette.textMuted, spec.palette.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(spec.palette.text, spec.palette.bgStart)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(spec.palette.primaryInk, spec.palette.primary)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(spec.palette.accentInk, spec.palette.accent)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("randomSeed generates valid positive integer seeds", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const s = randomSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(1000);
      seen.add(s);
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe("Procedural Web Audio synthesizer safety", () => {
  it("starts muted by default and never throws without AudioContext", () => {
    expect(isSoundEnabled()).toBe(false);
    expect(() => playBell()).not.toThrow();
    expect(() => playPaperRustle()).not.toThrow();
    expect(() => playConfettiPop()).not.toThrow();
    expect(() => playAntiSpoilAlarm()).not.toThrow();
    expect(() => playSecretJingle()).not.toThrow();
    expect(() => playClick()).not.toThrow();

    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
    expect(() => playBell()).not.toThrow();
    expect(() => playSecretJingle()).not.toThrow();

    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
  });
});
