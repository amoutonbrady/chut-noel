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

export type BudgetKey = "all" | "lt25" | "25to50" | "50to100" | "gte100";

export const BUDGETS: { key: BudgetKey; label: string; min: number; max: number }[] = [
  { key: "all", label: "Tous les budgets", min: 0, max: Infinity },
  { key: "lt25", label: "Moins de 25 €", min: 0, max: 25 },
  { key: "25to50", label: "25 à 50 €", min: 25, max: 50 },
  { key: "50to100", label: "50 à 100 €", min: 50, max: 100 },
  { key: "gte100", label: "100 € et plus", min: 100, max: Infinity },
];

/** Items without a readable price only show under "all". */
export function inBudget(hint: string | undefined, key: BudgetKey): boolean {
  if (key === "all") return true;
  const range = BUDGETS.find((b) => b.key === key);
  const price = parsePrice(hint);
  return Boolean(range) && price !== null && price >= range!.min && price < range!.max;
}
