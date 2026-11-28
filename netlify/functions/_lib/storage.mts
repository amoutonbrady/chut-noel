import { createHash, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import "@netlify/functions";
import type { ClaimMode, PublicClaim, WishItem } from "../../../src/shared/types";

export const VALID_CLAIM_MODES: readonly ClaimMode[] = ["solo", "group"] as const;

export interface StoredClaim {
  id: string;
  itemId: string;
  mode: ClaimMode;
  guestName?: string;
  message?: string;
  cancelTokenHash: string;
  createdAt: string;
}

export type StoredClaimsMap = Record<string, StoredClaim[]>;

export interface JsonBlobStore {
  get(key: string, options: { type: "json" }): Promise<unknown>;
  setJSON(key: string, value: unknown): Promise<unknown>;
}

export interface MemoryBlobStore extends JsonBlobStore {
  clear(): void;
  getReadCount(): number;
  getWriteCount(): number;
  keys(): string[];
}

const ITEMS_KEY = "items";
const CLAIMS_KEY = "claims";

let itemsStoreOverride: JsonBlobStore | null = null;
let claimsStoreOverride: JsonBlobStore | null = null;

export function setStoreOverrides(
  overrides: {
    items?: JsonBlobStore | null;
    claims?: JsonBlobStore | null;
  } | null,
): void {
  if (overrides === null) {
    itemsStoreOverride = null;
    claimsStoreOverride = null;
    return;
  }
  if ("items" in overrides) {
    itemsStoreOverride = overrides.items ?? null;
  }
  if ("claims" in overrides) {
    claimsStoreOverride = overrides.claims ?? null;
  }
}

export function createMemoryBlobStore(): MemoryBlobStore {
  const data = new Map<string, string>();
  let reads = 0;
  let writes = 0;

  return {
    async get(key: string, _options: { type: "json" }): Promise<unknown> {
      reads += 1;
      const raw = data.get(key);
      return raw === undefined ? null : (JSON.parse(raw) as unknown);
    },
    async setJSON(key: string, value: unknown): Promise<void> {
      writes += 1;
      data.set(key, JSON.stringify(value));
    },
    clear(): void {
      data.clear();
      reads = 0;
      writes = 0;
    },
    getReadCount(): number {
      return reads;
    },
    getWriteCount(): number {
      return writes;
    },
    keys(): string[] {
      return Array.from(data.keys());
    },
  };
}

export function getEnv(key: string): string | undefined {
  if (typeof Netlify !== "undefined" && Netlify.env) {
    const val = Netlify.env.get(key);
    if (val !== undefined) {
      return val;
    }
  }
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[key];
}

export function getEnvSuffix(): "prod" | "dev" {
  return getEnv("CONTEXT") === "production" ? "prod" : "dev";
}

export function getItemsStoreName(): string {
  return `wishlist-items-${getEnvSuffix()}`;
}

export function getClaimsStoreName(): string {
  return `wishlist-claims-${getEnvSuffix()}`;
}

/**
 * Isolated store dedicated strictly to wishlist items.
 * NEVER holds reservation or claim data.
 */
export function getItemsStore(): JsonBlobStore {
  if (itemsStoreOverride) {
    return itemsStoreOverride;
  }
  return getStore({
    name: getItemsStoreName(),
    consistency: "strong",
  });
}

/**
 * Isolated store dedicated strictly to guest claims.
 * MUST NEVER be imported or accessed by `admin.mts`.
 */
export function getClaimsStore(): JsonBlobStore {
  if (claimsStoreOverride) {
    return claimsStoreOverride;
  }
  return getStore({
    name: getClaimsStoreName(),
    consistency: "strong",
  });
}

export async function getStoredItems(
  store: JsonBlobStore = getItemsStore(),
): Promise<WishItem[]> {
  const raw = await store.get(ITEMS_KEY, { type: "json" });
  return Array.isArray(raw) ? (raw as WishItem[]) : [];
}

export async function saveStoredItems(
  items: WishItem[],
  store: JsonBlobStore = getItemsStore(),
): Promise<void> {
  await store.setJSON(ITEMS_KEY, items);
}

export async function getStoredClaimsMap(
  store: JsonBlobStore = getClaimsStore(),
): Promise<StoredClaimsMap> {
  const raw = await store.get(CLAIMS_KEY, { type: "json" });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as StoredClaimsMap;
}

export async function saveStoredClaimsMap(
  claimsMap: StoredClaimsMap,
  store: JsonBlobStore = getClaimsStore(),
): Promise<void> {
  await store.setJSON(CLAIMS_KEY, claimsMap);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function generateSecretToken(byteLength = 24): string {
  const bytes = new Uint8Array(Math.max(24, Math.floor(byteLength)));
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time string comparison via fixed-length SHA-256 digests so
 * `crypto.timingSafeEqual` never throws on length mismatch or leaks length.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return cryptoTimingSafeEqual(digestA, digestB);
}

export function requireOwnerAuth(req: Request): Response | null {
  const isProd = getEnv("CONTEXT") === "production";
  const configuredToken = getEnv("OWNER_TOKEN")?.trim();

  if (isProd && !configuredToken) {
    return errorResponse("OWNER_TOKEN non configuré", 503);
  }

  // shortcut: dev fallback token "dev" when OWNER_TOKEN is unset outside production; set OWNER_TOKEN in Netlify env
  const expectedToken = configuredToken || "dev";

  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const providedToken = match?.[1]?.trim();

  if (!providedToken || !timingSafeEqualStrings(providedToken, expectedToken)) {
    return errorResponse("Accès non autorisé.", 401);
  }

  return null;
}

export function isValidClaimMode(value: unknown): value is ClaimMode {
  return (
    typeof value === "string" &&
    (VALID_CLAIM_MODES as readonly string[]).includes(value)
  );
}

export function sanitizeText(
  value: unknown,
  maxLength: number,
  options?: { allowNewlines?: boolean },
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const cleaned = (
    options?.allowNewlines
      ? value
          .replace(/\r\n?/g, "\n")
          // oxlint-disable-next-line no-control-regex -- intentionally stripping ASCII control characters
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      : // oxlint-disable-next-line no-control-regex -- intentionally replacing ASCII control characters
        value.replace(/[\u0000-\u001F\u007F]+/g, " ")
  ).trim();
  if (!cleaned) {
    return undefined;
  }
  return cleaned.slice(0, maxLength).trim() || undefined;
}

export function sanitizeOptionalUrl(
  value: unknown,
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "L'URL doit être une chaîne de caractères." };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  if (trimmed.length > 2048) {
    return { ok: false, error: "L'URL est trop longue." };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "URL invalide (http:// ou https:// attendu)." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      error: "Seules les URLs http:// et https:// sont autorisées.",
    };
  }
  return { ok: true, value: parsed.toString() };
}

/** Explicit field allowlist so item payloads never carry unexpected or claim fields. */
export function cloneSafeItem(item: WishItem): WishItem {
  const safe: WishItem = {
    id: item.id,
    title: item.title,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
  if (item.url !== undefined) safe.url = item.url;
  if (item.imageUrl !== undefined) safe.imageUrl = item.imageUrl;
  if (item.priceHint !== undefined) safe.priceHint = item.priceHint;
  if (item.siteName !== undefined) safe.siteName = item.siteName;
  if (item.note !== undefined) safe.note = item.note;
  return safe;
}

/** Strips `cancelTokenHash` before sending claims to public clients. */
export function toPublicClaim(stored: StoredClaim): PublicClaim {
  const pub: PublicClaim = {
    id: stored.id,
    itemId: stored.itemId,
    mode: stored.mode,
    createdAt: stored.createdAt,
  };
  if (stored.guestName !== undefined) pub.guestName = stored.guestName;
  if (stored.message !== undefined) pub.message = stored.message;
  return pub;
}

/** Filters claims to existing item IDs only and strips sensitive token hashes. */
export function toPublicClaimsByItem(
  rawClaims: StoredClaimsMap | null | undefined,
  items: readonly WishItem[],
): Record<string, PublicClaim[]> {
  const result: Record<string, PublicClaim[]> = {};
  if (!rawClaims || typeof rawClaims !== "object") {
    return result;
  }
  const validItemIds = new Set(items.map((item) => item.id));
  for (const [itemId, claims] of Object.entries(rawClaims)) {
    if (!validItemIds.has(itemId) || !Array.isArray(claims)) {
      continue;
    }
    const publicClaims = claims.map(toPublicClaim);
    if (publicClaims.length > 0) {
      result[itemId] = publicClaims;
    }
  }
  return result;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

export async function parseJsonBody(
  req: Request,
): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false; response: Response }
> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: errorResponse("Corps JSON invalide.", 400) };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      response: errorResponse("Un objet JSON est attendu.", 400),
    };
  }
  return { ok: true, data: raw as Record<string, unknown> };
}

export async function parseOptionalJsonBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  const text = await req.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function safeDecodeParam(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
