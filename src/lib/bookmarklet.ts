import { stripShopSuffix } from "../shared/title";

/**
 * Runs on the shop page, in Alexandre's own browser: no bot wall, fully rendered DOM.
 * Serialised with toString(), so it must stay self-contained (no imports, no outer variables).
 */
function grab(origin: string): void {
  const q = (selector: string) => document.querySelector(selector);
  const meta = (key: string) =>
    q(`meta[property="${key}"],meta[name="${key}"],meta[itemprop="${key}"]`)?.getAttribute("content") ??
    undefined;
  const first = (value: unknown) => ([] as any[]).concat(value ?? [])[0];

  let product: any;
  const walk = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const isProduct = /product|book|videogame/i.test(([] as unknown[]).concat(node["@type"]).join(" "));
    // Decathlon lists an empty ProductGroup first: prefer the node that carries the offer
    if (isProduct && (!product || (!product.offers && node.offers))) product = node;
    walk(node["@graph"]);
    walk(node.mainEntity);
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      walk(JSON.parse(script.textContent ?? ""));
    } catch {
      /* invalid JSON-LD */
    }
  });

  const offer = first(product?.offers) ?? {};
  const spec = first(offer.priceSpecification) ?? {};
  const amount =
    offer.price ??
    offer.lowPrice ??
    spec.price ??
    meta("product:price:amount") ??
    meta("og:price:amount") ??
    q('[itemprop="price"]')?.getAttribute("content");
  const currency =
    offer.priceCurrency ??
    spec.priceCurrency ??
    meta("product:price:currency") ??
    meta("og:price:currency") ??
    q('[itemprop="priceCurrency"]')?.getAttribute("content") ??
    "EUR";
  let price: string | undefined;
  try {
    const value = Number(String(amount).replace(",", "."));
    if (amount != null && value > 0) {
      price = new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(value);
    }
  } catch {
    /* unknown currency code */
  }
  price ??= q("#corePrice_feature_div .a-offscreen, .a-price .a-offscreen")?.textContent?.trim();

  const ldImage = first(product?.image);
  const landing = q("#landingImage");
  // `||` not `??`: empty attributes (content="") must fall through too
  const rawImage =
    meta("og:image") ||
    (typeof ldImage === "string" ? ldImage : ldImage?.url) ||
    landing?.getAttribute("data-old-hires") ||
    landing?.getAttribute("src");
  const canonical = q('link[rel="canonical"]')?.getAttribute("href");
  const canonicalUrl = canonical ? new URL(canonical, location.href) : null;

  const data = {
    url: canonicalUrl?.host === location.host ? canonicalUrl.href : location.href,
    title: meta("og:title") || product?.name || document.title,
    image: rawImage ? new URL(rawImage, location.href).href : undefined,
    price,
  };
  const target = `${origin}/admin?add=${encodeURIComponent(JSON.stringify(data))}`;
  if (!window.open(target, "_blank")) location.href = target;
}

export function bookmarkletHref(origin: string): string {
  return `javascript:${encodeURIComponent(`(${grab.toString()})(${JSON.stringify(origin)})`)}`;
}

export interface AddPayload {
  url: string;
  title: string;
  imageUrl: string;
  priceHint: string;
}

/** Reads `/admin?add=<json>`. Untrusted input: strings only, prefill only, the server re-validates on save. */
export function readAddParam(search: string): AddPayload | null {
  const raw = new URLSearchParams(search).get("add");
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const text = (value: unknown, max: number) =>
      typeof value === "string" ? value.trim().slice(0, max) : "";
    const url = text(data.url, 2048);
    let hostname = "";
    try {
      hostname = new URL(url).hostname;
    } catch {
      /* no usable URL: keep the title as is */
    }
    return {
      url,
      title: stripShopSuffix(text(data.title, 400), hostname).slice(0, 140),
      imageUrl: text(data.image, 2048),
      priceHint: text(data.price, 40),
    };
  } catch {
    return null;
  }
}
