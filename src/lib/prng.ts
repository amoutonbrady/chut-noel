/**
 * Deterministic PRNG & helpers for Chut ! Noël procedural art, themes, and decor.
 */

export type Rng = () => number;

/**
 * Mulberry32 fast 32-bit deterministic PRNG returning floats in [0, 1).
 */
export function mulberry32(seed: number): Rng {
  let state = (Number.isFinite(seed) ? Math.trunc(seed) : 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a 32-bit unsigned string hash.
 */
export function hashString(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministically pick an element from a non-empty array.
 */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) {
    throw new Error("pick() requires a non-empty array");
  }
  const index = Math.min(arr.length - 1, Math.floor(rng() * arr.length));
  return arr[index];
}

/**
 * Floating-point number in [min, max).
 */
export function range(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return min + rng() * (max - min);
}

/**
 * Integer in [min, max] inclusive.
 */
export function intRange(rng: Rng, min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}
