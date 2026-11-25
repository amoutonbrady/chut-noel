import { getStore } from "@netlify/blobs";
import "@netlify/functions";
import type {
  ClaimMode,
  GiftSize,
  OwnerWishlistView,
  PublicClaimsByItem,
  PublicGuestClaim,
  StoredClaimsMap,
  StoredGuestClaim,
  StoredWishlist,
  ThemeId,
  WishlistItem,
} from "../../../src/shared/types";

export const VALID_THEMES: readonly ThemeId[] = [
  "lutins",
  "chalet",
  "neon",
  "boule-a-neige",
] as const;

export const VALID_GIFT_SIZES: readonly GiftSize[] = [
  "mini",
  "moyen",
  "geant",
] as const;

export const VALID_CLAIM_MODES: readonly ClaimMode[] = [
  "solo",
  "group",
] as const;

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

export interface TokenLookupRecord {
  slug: string;
}

let listsStoreOverride: JsonBlobStore | null = null;
let claimsStoreOverride: JsonBlobStore | null = null;

export function setStoreOverrides(
  overrides: {
    lists?: JsonBlobStore | null;
    claims?: JsonBlobStore | null;
  } | null,
): void {
  if (overrides === null) {
    listsStoreOverride = null;
    claimsStoreOverride = null;
    return;
  }
  if ("lists" in overrides) {
    listsStoreOverride = overrides.lists ?? null;
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
      if (raw === undefined) {
        return null;
      }
      return JSON.parse(raw) as unknown;
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

export function getNetlifyEnv(key: string): string | undefined {
  if (typeof Netlify !== "undefined" && Netlify.env) {
    return Netlify.env.get(key);
  }
  return undefined;
}

export function getEnvSuffix(): "prod" | "dev" {
  return getNetlifyEnv("CONTEXT") === "production" ? "prod" : "dev";
}

export function getListsStoreName(): string {
  return `chut-noel-lists-${getEnvSuffix()}`;
}

export function getClaimsStoreName(): string {
  return `chut-noel-claims-${getEnvSuffix()}`;
}

/**
 * Store dedicated strictly to wishlists and owner token lookups.
 * NEVER holds any reservation / claim data.
 */
export function getListsStore(): JsonBlobStore {
  if (listsStoreOverride) {
    return listsStoreOverride;
  }
  return getStore({
    name: getListsStoreName(),
    consistency: "strong",
  });
}

/**
 * Store dedicated strictly to guest reservations / claims.
 * MUST NEVER be opened, imported, or read by `lists.mts` or `owner.mts`.
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

export function listKey(slug: string): string {
  return `list:${slug}`;
}

export function tokenKey(ownerTokenHash: string): string {
  return `token:${ownerTokenHash}`;
}

export function claimsKey(slug: string): string {
  return `claims:${slug}`;
}

export async function getStoredWishlistBySlug(
  slug: string,
  store: JsonBlobStore = getListsStore(),
): Promise<StoredWishlist | null> {
  const result = await store.get(listKey(slug), { type: "json" });
  if (!result || typeof result !== "object") {
    return null;
  }
  return result as StoredWishlist;
}

export async function saveStoredWishlist(
  wishlist: StoredWishlist,
  store: JsonBlobStore = getListsStore(),
): Promise<void> {
  await store.setJSON(listKey(wishlist.slug), wishlist);
}

export async function saveOwnerTokenLookup(
  ownerTokenHash: string,
  slug: string,
  store: JsonBlobStore = getListsStore(),
): Promise<void> {
  const record: TokenLookupRecord = { slug };
  await store.setJSON(tokenKey(ownerTokenHash), record);
}

export async function getStoredWishlistByOwnerToken(
  ownerToken: string,
  store: JsonBlobStore = getListsStore(),
): Promise<StoredWishlist | null> {
  const cleaned = ownerToken.trim();
  if (!cleaned) {
    return null;
  }
  const tokenHash = await hashToken(cleaned);
  const lookup = await store.get(tokenKey(tokenHash), { type: "json" });
  if (
    !lookup ||
    typeof lookup !== "object" ||
    typeof (lookup as TokenLookupRecord).slug !== "string"
  ) {
    return null;
  }
  const wishlist = await getStoredWishlistBySlug(
    (lookup as TokenLookupRecord).slug,
    store,
  );
  if (!wishlist) {
    return null;
  }
  if (!timingSafeEqual(wishlist.ownerTokenHash, tokenHash)) {
    return null;
  }
  return wishlist;
}

export async function getStoredClaimsMap(
  slug: string,
  store: JsonBlobStore = getClaimsStore(),
): Promise<StoredClaimsMap> {
  const raw = await store.get(claimsKey(slug), { type: "json" });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as StoredClaimsMap;
}

export async function saveStoredClaimsMap(
  slug: string,
  claimsMap: StoredClaimsMap,
  store: JsonBlobStore = getClaimsStore(),
): Promise<void> {
  await store.setJSON(claimsKey(slug), claimsMap);
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

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function generateSecretToken(byteLength = 24): string {
  const safeLength = Math.max(24, Math.floor(byteLength));
  const bytes = new Uint8Array(safeLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return bytesToHex(new Uint8Array(digest));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function randomUint32(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function sanitizeSeed(input: unknown): number {
  if (typeof input === "number" && Number.isFinite(input)) {
    const normalized = Math.abs(Math.floor(input)) % 2_147_483_647;
    return normalized > 0 ? normalized : 1;
  }
  return (randomUint32() % 999_999_999) + 1;
}

export function slugifySegment(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");

  return normalized || "lutin";
}

export async function generateUniqueSlug(
  ownerName: string,
  store: JsonBlobStore = getListsStore(),
): Promise<string> {
  const base = slugifySegment(ownerName);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const digits = 1000 + (randomUint32() % 9000);
    const candidate = `noel-${base}-${digits}`;
    const existing = await store.get(listKey(candidate), { type: "json" });
    if (existing === null) {
      return candidate;
    }
  }

  const fallbackSuffix = bytesToHex(
    crypto.getRandomValues(new Uint8Array(4)),
  );
  return `noel-${base}-${fallbackSuffix}`;
}

export function isValidTheme(value: unknown): value is ThemeId {
  return (
    typeof value === "string" &&
    (VALID_THEMES as readonly string[]).includes(value)
  );
}

export function isValidGiftSize(value: unknown): value is GiftSize {
  return (
    typeof value === "string" &&
    (VALID_GIFT_SIZES as readonly string[]).includes(value)
  );
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
  let cleaned = value;
  if (options?.allowNewlines) {
    cleaned = cleaned.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  } else {
    cleaned = cleaned.replace(/[\u0000-\u001F\u007F]+/g, " ");
  }
  cleaned = cleaned.trim();
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

function cloneSafeItem(item: WishlistItem): WishlistItem {
  const safe: WishlistItem = {
    id: item.id,
    title: item.title,
    size: item.size,
    wrapSeed: item.wrapSeed,
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

/**
 * STRICT ANTI-SPOIL SERIALIZER.
 * Uses an explicit field allowlist so `ownerTokenHash`, `claims`,
 * `claimsByItem`, or reservation counts can NEVER leak to the owner.
 */
export function toOwnerWishlistView(stored: StoredWishlist): OwnerWishlistView {
  const view: OwnerWishlistView = {
    slug: stored.slug,
    title: stored.title,
    ownerName: stored.ownerName,
    theme: stored.theme,
    seed: stored.seed,
    items: Array.isArray(stored.items) ? stored.items.map(cloneSafeItem) : [],
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
  if (stored.subtitle !== undefined) {
    view.subtitle = stored.subtitle;
  }
  return view;
}

/**
 * Strips `cancelCodeHash` before sending claims to guests.
 */
export function toPublicClaim(stored: StoredGuestClaim): PublicGuestClaim {
  const pub: PublicGuestClaim = {
    id: stored.id,
    itemId: stored.itemId,
    mode: stored.mode,
    guestName: stored.guestName,
    createdAt: stored.createdAt,
  };
  if (stored.message !== undefined) {
    pub.message = stored.message;
  }
  return pub;
}

/**
 * Filters claims to ONLY existing item IDs in the list and strips sensitive hashes.
 */
export function toPublicClaimsByItem(
  rawClaims: StoredClaimsMap | null | undefined,
  items: readonly WishlistItem[],
): PublicClaimsByItem {
  const result: PublicClaimsByItem = {};
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
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
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
