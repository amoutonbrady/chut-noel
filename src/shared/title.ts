/**
 * Drops a trailing shop suffix such as " | Fnac" or ": Amazon.fr: Livres" from a page title.
 * The shop is recognised by the domain label before the TLD (amazon.fr -> "amazon").
 */
export function stripShopSuffix(title: string, hostname: string): string {
  const brand = hostname.toLowerCase().split(".").at(-2) ?? "";
  if (brand.length < 3 || !/^[a-z0-9-]+$/.test(brand)) {
    return title;
  }
  // Separators kept at odd indexes; dashes only count with spaces around ("T-shirt" stays whole)
  const parts = title.split(/(\s+[-–—]\s+|\s*[|:]\s*)/);
  const brandRegex = new RegExp(`\\b${brand}\\b`, "i");
  for (let i = 2; i < parts.length; i += 2) {
    if (brandRegex.test(parts[i])) {
      return parts.slice(0, i - 1).join("").trim() || title;
    }
  }
  return title;
}
