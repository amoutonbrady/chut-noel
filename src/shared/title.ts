/**
 * Drops a trailing shop suffix such as " | Fnac" or ": Amazon.fr: Livres" from a page title.
 * The shop is recognised by the domain label before the TLD (amazon.fr -> "amazon").
 */
export function stripShopSuffix(title: string, hostname: string): string {
  const brand = hostname.toLowerCase().split(".").at(-2) ?? "";
  if (brand.length < 3 || !/^[a-z0-9-]+$/.test(brand)) {
    return title;
  }
  // Cut at the last separator before the brand, keeping everything ahead of it
  const match = title.match(
    new RegExp(`^(.+?)\\s*[|:–—-]\\s*[^|:–—-]*\\b${brand}\\b`, "i"),
  );
  return match?.[1].trim() || title;
}
