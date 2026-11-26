import type { ScrapedMetadata } from "../../../src/shared/types";

const MAX_RESPONSE_BYTES = 350 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 4;

const REALISTIC_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  copy: "©",
  reg: "®",
  trade: "™",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  times: "×",
  deg: "°",
  middot: "·",
  bull: "•",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  agrave: "à",
  acirc: "â",
  auml: "ä",
  ccedil: "ç",
  icirc: "î",
  iuml: "ï",
  ocirc: "ô",
  ouml: "ö",
  ugrave: "ù",
  ucirc: "û",
  uuml: "ü",
  oelig: "œ",
  Eacute: "É",
  Egrave: "È",
  Ecirc: "Ê",
  Agrave: "À",
  Acirc: "Â",
  Ccedil: "Ç",
  Ocirc: "Ô",
  Ugrave: "Ù",
  Ucirc: "Û",
  OElig: "Œ",
};

const IGNORED_SLUG_SEGMENTS = new Set([
  "p",
  "dp",
  "gp",
  "pd",
  "pr",
  "s",
  "c",
  "d",
  "fr",
  "en",
  "de",
  "es",
  "it",
  "eu",
  "www",
  "shop",
  "store",
  "product",
  "products",
  "produit",
  "produits",
  "item",
  "items",
  "article",
  "articles",
  "catalogue",
  "catalog",
  "categorie",
  "category",
  "categories",
  "buy",
  "detail",
  "details",
  "view",
  "index",
  "html",
]);

export interface ScrapeOutcome extends ScrapedMetadata {
  ok: boolean;
  fallback: boolean;
  reason?: string;
}

export type ScrapeResult =
  | { blocked: true; error: string; reason: string }
  | { blocked: false; data: ScrapeOutcome };

export interface ScrapeOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

export function decodeHtmlEntities(input: string): string {
  return input.replace(
    /&(?:#x([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([a-zA-Z]{2,12}));/g,
    (match, hex: string | undefined, dec: string | undefined, named: string | undefined) => {
      if (hex) {
        const codePoint = Number.parseInt(hex, 16);
        if (Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
          try {
            return String.fromCodePoint(codePoint);
          } catch {
            return match;
          }
        }
        return match;
      }
      if (dec) {
        const codePoint = Number.parseInt(dec, 10);
        if (Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
          try {
            return String.fromCodePoint(codePoint);
          } catch {
            return match;
          }
        }
        return match;
      }
      if (named && named in NAMED_HTML_ENTITIES) {
        return NAMED_HTML_ENTITIES[named];
      }
      return match;
    },
  );
}

function parseIpv4Octets(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const num = Number.parseInt(part, 10);
    if (num < 0 || num > 255) {
      return null;
    }
    octets.push(num);
  }
  return [octets[0], octets[1], octets[2], octets[3]];
}

function isBlockedIpv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a >= 224) return true; // multicast & reserved
  return false;
}

function isBlockedIpv6(rawHost: string): boolean {
  const host = rawHost.toLowerCase();
  if (host === "::1" || host === "::" || host === "0:0:0:0:0:0:0:1" || host === "0:0:0:0:0:0:0:0") {
    return true;
  }

  // Unique local fc00::/7 (fc.. or fd..)
  if (/^f[cd][0-9a-f]{0,2}:/.test(host)) {
    return true;
  }

  // Link-local fe80::/10 (fe8., fe9., fea., feb.)
  if (/^fe[89ab][0-9a-f]:/.test(host)) {
    return true;
  }

  // IPv4-mapped IPv6 in dotted form, e.g. ::ffff:127.0.0.1
  const dottedMapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dottedMapped) {
    const octets = parseIpv4Octets(dottedMapped[1]);
    return octets ? isBlockedIpv4(octets) : true;
  }

  // IPv4-mapped IPv6 normalized to hex by WHATWG URL, e.g. ::ffff:7f00:1 or ::ffff:a9fe:a9fe
  const hexMapped = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = Number.parseInt(hexMapped[1], 16);
    const lo = Number.parseInt(hexMapped[2], 16);
    const octets: [number, number, number, number] = [
      (hi >> 8) & 0xff,
      hi & 0xff,
      (lo >> 8) & 0xff,
      lo & 0xff,
    ];
    return isBlockedIpv4(octets);
  }

  // Multicast ff00::/8
  if (/^ff[0-9a-f]{2}:/.test(host)) {
    return true;
  }

  return false;
}

export function isBlockedHostname(rawHostname: string): boolean {
  const stripped = rawHostname
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.+$/, "");

  if (!stripped) {
    return true;
  }

  if (
    stripped === "localhost" ||
    stripped.endsWith(".localhost") ||
    stripped.endsWith(".local") ||
    stripped.endsWith(".internal") ||
    stripped.endsWith(".localhost.localdomain") ||
    stripped === "0.0.0.0" ||
    stripped === "metadata"
  ) {
    return true;
  }

  // Check IPv6 literal
  if (stripped.includes(":")) {
    return isBlockedIpv6(stripped);
  }

  // Check IPv4 dotted address
  const octets = parseIpv4Octets(stripped);
  if (octets) {
    return isBlockedIpv4(octets);
  }

  // Reject single-label hostnames without a dot (internal intranet names)
  if (!stripped.includes(".")) {
    return true;
  }

  return false;
}

export function validatePublicScrapeUrl(
  rawUrl: string,
): { ok: true; url: URL } | { ok: false; reason: string; error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) {
    return {
      ok: false,
      reason: "invalid_url",
      error: "URL invalide.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: "invalid_url",
      error: "URL invalide (http:// ou https:// attendu).",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      reason: "unsupported_protocol",
      error: "Seules les URLs http:// et https:// sont autorisées.",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      reason: "credentials_disallowed",
      error: "Les URLs contenant des identifiants ne sont pas autorisées.",
    };
  }

  if (isBlockedHostname(parsed.hostname)) {
    return {
      ok: false,
      reason: "ssrf_blocked",
      error: "Cette adresse réseau n'est pas autorisée.",
    };
  }

  return { ok: true, url: parsed };
}

export function cleanSiteNameFromUrl(url: URL): string {
  return url.hostname.replace(/^www\./i, "");
}

export function guessTitleFromUrl(url: URL): string | undefined {
  const segments = url.pathname
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .filter(Boolean);

  let bestCandidate: string | undefined;
  let bestScore = -1;

  for (const rawSegment of segments) {
    const withoutExt = rawSegment.replace(/\.(html?|php|aspx?|jsp)$/i, "");
    const cleanedSlug = withoutExt
      .replace(/^(?:ref|pid|sku|id)=.*/i, "")
      .replace(/[-_](?:p|dp|id|sku)[-_]?\d{4,}$/i, "")
      .replace(/[-_]\d{6,}$/i, "");

    const lower = cleanedSlug.toLowerCase();
    if (!lower || IGNORED_SLUG_SEGMENTS.has(lower)) {
      continue;
    }
    // Skip pure IDs / ASINs / UUIDs
    if (/^[0-9]+$/.test(cleanedSlug)) {
      continue;
    }
    if (/^[A-Z0-9]{8,12}$/.test(cleanedSlug) && /\d/.test(cleanedSlug)) {
      continue;
    }
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(cleanedSlug)) {
      continue;
    }

    const words = cleanedSlug
      .replace(/[-_+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!words || !/[a-zA-ZÀ-ÿ]/.test(words)) {
      continue;
    }

    const wordCount = words.split(" ").length;
    const score = wordCount * 10 + Math.min(words.length, 60);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = words;
    }
  }

  if (!bestCandidate) {
    return undefined;
  }

  const trimmed = bestCandidate.slice(0, 140).trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function cleanExtractedText(raw: string | undefined, maxLength = 160): string | undefined {
  if (!raw) {
    return undefined;
  }
  const decoded = decodeHtmlEntities(raw)
    .replace(/\s+/g, " ")
    .trim();
  if (!decoded) {
    return undefined;
  }
  return decoded.slice(0, maxLength).trim() || undefined;
}

function resolvePublicImageUrl(raw: string | undefined, baseUrl: URL): string | undefined {
  if (!raw) {
    return undefined;
  }
  const cleaned = decodeHtmlEntities(raw).trim();
  if (!cleaned) {
    return undefined;
  }
  try {
    const resolved = new URL(cleaned, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return undefined;
    }
    return resolved.toString();
  } catch {
    return undefined;
  }
}

function formatPriceHint(rawPrice: string | number, rawCurrency?: string): string | undefined {
  const str = String(rawPrice)
    .trim()
    .replace(/\u00a0|\s/g, "")
    .replace(",", ".");

  const numeric = Number.parseFloat(str);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1_000_000) {
    return undefined;
  }

  const formattedNum = Number.isInteger(numeric)
    ? String(numeric)
    : numeric.toFixed(2).replace(".", ",");

  const currency = (rawCurrency ?? "").trim().toUpperCase();
  if (!currency || currency === "EUR" || currency === "€") {
    return `${formattedNum} €`;
  }
  if (currency === "USD" || currency === "$") {
    return `${formattedNum} $`;
  }
  if (currency === "GBP" || currency === "£") {
    return `${formattedNum} £`;
  }
  return `${formattedNum} ${currency}`;
}

function parseMetaTags(html: string): Map<string, string> {
  const metas = new Map<string, string>();
  const metaTagRegex = /<meta\b([^>]*?)\/?>/gi;
  const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = metaTagRegex.exec(html)) !== null) {
    const attrsText = tagMatch[1];
    let key: string | undefined;
    let content: string | undefined;

    attrRegex.lastIndex = 0;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrsText)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
      if (attrName === "property" || attrName === "name" || attrName === "itemprop") {
        key = attrVal.trim().toLowerCase();
      } else if (attrName === "content") {
        content = attrVal.trim();
      }
    }

    if (key && content && !metas.has(key)) {
      metas.set(key, content);
    }
  }

  return metas;
}

interface JsonLdExtracted {
  name?: string;
  image?: string;
  priceHint?: string;
}

function extractImageFromJsonLdValue(val: unknown): string | undefined {
  if (typeof val === "string") {
    return val;
  }
  if (Array.isArray(val)) {
    for (const entry of val) {
      const found = extractImageFromJsonLdValue(entry);
      if (found) return found;
    }
    return undefined;
  }
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (typeof obj.url === "string") return obj.url;
    if (typeof obj.contentUrl === "string") return obj.contentUrl;
  }
  return undefined;
}

function extractPriceFromJsonLdOffers(offers: unknown): string | undefined {
  if (!offers) {
    return undefined;
  }
  if (Array.isArray(offers)) {
    for (const offer of offers) {
      const found = extractPriceFromJsonLdOffers(offer);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof offers === "object") {
    const obj = offers as Record<string, unknown>;
    const rawPrice = obj.price ?? obj.lowPrice;
    const rawCurrency =
      typeof obj.priceCurrency === "string" ? obj.priceCurrency : undefined;
    if (typeof rawPrice === "number" || typeof rawPrice === "string") {
      const formatted = formatPriceHint(rawPrice, rawCurrency);
      if (formatted) return formatted;
    }
    if (obj.offers) {
      return extractPriceFromJsonLdOffers(obj.offers);
    }
  }
  return undefined;
}

function hasJsonLdType(node: Record<string, unknown>, targetTypes: string[]): boolean {
  const t = node["@type"];
  if (typeof t === "string") {
    return targetTypes.includes(t.toLowerCase());
  }
  if (Array.isArray(t)) {
    return t.some(
      (entry) => typeof entry === "string" && targetTypes.includes(entry.toLowerCase()),
    );
  }
  return false;
}

function collectJsonLdProducts(node: unknown, out: Record<string, unknown>[]): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      collectJsonLdProducts(entry, out);
    }
    return;
  }
  const obj = node as Record<string, unknown>;
  if (hasJsonLdType(obj, ["product", "book", "videogame", "movie", "musicrecording"])) {
    out.push(obj);
  }
  if (Array.isArray(obj["@graph"])) {
    collectJsonLdProducts(obj["@graph"], out);
  }
  if (obj.mainEntity && typeof obj.mainEntity === "object") {
    collectJsonLdProducts(obj.mainEntity, out);
  }
}

function parseJsonLd(html: string): JsonLdExtracted {
  const result: JsonLdExtracted = {};
  const scriptRegex =
    /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json[^"]*"|'application\/ld\+json[^']*')[^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const rawJson = match[1].trim();
    if (!rawJson) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      continue;
    }

    const products: Record<string, unknown>[] = [];
    collectJsonLdProducts(parsed, products);
    for (const product of products) {
      if (!result.name && typeof product.name === "string") {
        result.name = product.name;
      }
      if (!result.image && product.image) {
        result.image = extractImageFromJsonLdValue(product.image);
      }
      if (!result.priceHint && product.offers) {
        result.priceHint = extractPriceFromJsonLdOffers(product.offers);
      }
    }
  }

  return result;
}

function extractPriceFromHtmlText(html: string): string | undefined {
  const withoutScripts = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const decoded = decodeHtmlEntities(withoutScripts);

  const afterSymbol = decoded.match(
    /(?:^|[^\d])((?:\d{1,3}(?:[\s\u00a0]\d{3})+|\d{1,5})(?:[.,]\d{2})?)\s?(?:€|EUR\b)/i,
  );
  if (afterSymbol) {
    return formatPriceHint(afterSymbol[1], "EUR");
  }

  const beforeSymbol = decoded.match(
    /(?:€|EUR\b)\s?((?:\d{1,3}(?:[\s\u00a0]\d{3})+|\d{1,5})(?:[.,]\d{2})?)(?!\d)/i,
  );
  if (beforeSymbol) {
    return formatPriceHint(beforeSymbol[1], "EUR");
  }

  return undefined;
}

export function extractMetadataFromHtml(
  html: string,
  baseUrl: URL,
): {
  title?: string;
  imageUrl?: string;
  priceHint?: string;
  siteName?: string;
} {
  const metas = parseMetaTags(html);
  const jsonLd = parseJsonLd(html);

  const titleTagMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const titleTag = titleTagMatch ? titleTagMatch[1] : undefined;

  const title =
    cleanExtractedText(metas.get("og:title"), 160) ??
    cleanExtractedText(metas.get("twitter:title"), 160) ??
    cleanExtractedText(jsonLd.name, 160) ??
    cleanExtractedText(titleTag, 160);

  const imageUrl =
    resolvePublicImageUrl(metas.get("og:image:secure_url"), baseUrl) ??
    resolvePublicImageUrl(metas.get("og:image"), baseUrl) ??
    resolvePublicImageUrl(metas.get("twitter:image"), baseUrl) ??
    resolvePublicImageUrl(metas.get("twitter:image:src"), baseUrl) ??
    resolvePublicImageUrl(jsonLd.image, baseUrl);

  const metaPriceAmount =
    metas.get("product:price:amount") ?? metas.get("og:price:amount");
  const metaPriceCurrency =
    metas.get("product:price:currency") ?? metas.get("og:price:currency");
  const metaPrice = metaPriceAmount
    ? formatPriceHint(metaPriceAmount, metaPriceCurrency)
    : undefined;

  const priceHint =
    jsonLd.priceHint ?? metaPrice ?? extractPriceFromHtmlText(html);

  const siteName =
    cleanExtractedText(metas.get("og:site_name"), 80) ??
    cleanSiteNameFromUrl(baseUrl);

  return {
    ...(title ? { title } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(priceHint ? { priceHint } : {}),
    ...(siteName ? { siteName } : {}),
  };
}

async function readLimitedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  const charsetMatch = contentType.match(/charset=([a-zA-Z0-9_-]+)/i);
  const requestedCharset = charsetMatch ? charsetMatch[1].toLowerCase() : "utf-8";

  const decodeBytes = (bytes: Uint8Array): string => {
    try {
      return new TextDecoder(requestedCharset, { fatal: false }).decode(bytes);
    } catch {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }
  };

  if (!response.body) {
    const text = await response.text();
    return text.slice(0, maxBytes);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }
      const remaining = maxBytes - total;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return decodeBytes(combined);
}

function buildFallbackResponse(url: URL, reason: string): ScrapeOutcome {
  const guessedTitle = guessTitleFromUrl(url);
  return {
    ok: false,
    fallback: true,
    url: url.toString(),
    siteName: cleanSiteNameFromUrl(url),
    ...(guessedTitle ? { title: guessedTitle } : {}),
    reason,
  };
}

export async function scrapeProductUrl(
  rawUrl: string,
  options?: ScrapeOptions,
): Promise<ScrapeResult> {
  const validation = validatePublicScrapeUrl(rawUrl);
  if (!validation.ok) {
    return {
      blocked: true,
      error: validation.error,
      reason: validation.reason,
    };
  }

  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options?.maxBytes ?? MAX_RESPONSE_BYTES;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let currentUrl = validation.url;

  try {
    let response: Response | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      response = await fetchImpl(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": REALISTIC_USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        },
      });

      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get("location")
      ) {
        const location = response.headers.get("location")!;
        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          return {
            blocked: false,
            data: buildFallbackResponse(currentUrl, "invalid_redirect"),
          };
        }

        const nextValidation = validatePublicScrapeUrl(nextUrl.toString());
        if (!nextValidation.ok) {
          return {
            blocked: true,
            error: nextValidation.error,
            reason: "redirect_ssrf_blocked",
          };
        }

        currentUrl = nextValidation.url;
        if (hop === MAX_REDIRECTS) {
          return {
            blocked: false,
            data: buildFallbackResponse(currentUrl, "too_many_redirects"),
          };
        }
        continue;
      }

      break;
    }

    if (!response) {
      return {
        blocked: false,
        data: buildFallbackResponse(currentUrl, "no_response"),
      };
    }

    if (!response.ok) {
      return {
        blocked: false,
        data: buildFallbackResponse(currentUrl, `http_${response.status}`),
      };
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml") &&
      !contentType.includes("text/plain")
    ) {
      return {
        blocked: false,
        data: buildFallbackResponse(currentUrl, "non_html"),
      };
    }

    const html = await readLimitedText(response, maxBytes);
    const extracted = extractMetadataFromHtml(html, currentUrl);

    const hasUsefulData = Boolean(
      extracted.title || extracted.imageUrl || extracted.priceHint,
    );
    if (!hasUsefulData) {
      return {
        blocked: false,
        data: buildFallbackResponse(currentUrl, "no_metadata"),
      };
    }

    const fallbackTitle = guessTitleFromUrl(currentUrl);
    return {
      blocked: false,
      data: {
        ok: true,
        fallback: false,
        url: currentUrl.toString(),
        ...(extracted.title
          ? { title: extracted.title }
          : fallbackTitle
            ? { title: fallbackTitle }
            : {}),
        ...(extracted.imageUrl ? { imageUrl: extracted.imageUrl } : {}),
        ...(extracted.priceHint ? { priceHint: extracted.priceHint } : {}),
        siteName: extracted.siteName ?? cleanSiteNameFromUrl(currentUrl),
      },
    };
  } catch (err) {
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError");
    return {
      blocked: false,
      data: buildFallbackResponse(
        currentUrl,
        isAbort ? "timeout" : "network_error",
      ),
    };
  } finally {
    clearTimeout(timer);
  }
}
