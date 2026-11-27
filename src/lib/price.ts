/**
 * First amount in a free-text price hint ("99,90 €", "1 299 €", "€49.5", "1.299,00 €").
 * Returns null when the hint holds no number (e.g. "selon taille").
 */
export function parsePrice(hint?: string): number | null {
  if (!hint) return null;
  const compact = hint
    // Thousands separators as spaces: "1 299", "1 299"
    .replace(/(\d)[\s  ](?=\d{3}(?!\d))/g, "$1")
    // Thousands separators as . or , followed by a decimal part or the end: "1.299,00", "1,299"
    .replace(/(\d)[.,](?=\d{3}(?:[.,]\d{1,2})?(?!\d))/g, "$1");
  const match = compact.match(/\d+(?:[.,]\d{1,2})?/);
  return match ? Number(match[0].replace(",", ".")) : null;
}

/** Inclusive [min, max] in euros. */
export type PriceRange = readonly [number, number];

/** Slider ceiling: the highest price rounded up to a tidy step, never below 50 €. */
export function priceCeiling(hints: (string | undefined)[]): number {
  const prices = hints.map(parsePrice).filter((p): p is number => p !== null);
  const max = Math.max(0, ...prices);
  const step = max > 500 ? 100 : max > 100 ? 50 : 10;
  return Math.max(50, Math.ceil(max / step) * step);
}

/** One-tap ranges shown under the slider; the open end is clamped to the ceiling. */
export const PRICE_PRESETS: { label: string; range: PriceRange }[] = [
  { label: "Jusqu'à 25 €", range: [0, 25] },
  { label: "25 – 50 €", range: [25, 50] },
  { label: "50 – 100 €", range: [50, 100] },
  { label: "100 € et plus", range: [100, Infinity] },
];

/** null = no price filter, unpriced items included. A set range keeps priced items only. */
export function inPriceRange(hint: string | undefined, range: PriceRange | null): boolean {
  if (!range) return true;
  const price = parsePrice(hint);
  return price !== null && price >= range[0] && price <= range[1];
}
