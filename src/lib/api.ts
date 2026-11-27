import type {
  AdminItemsResponse,
  ClaimMode,
  CreateClaimInput,
  CreateClaimResponse,
  CreateItemInput,
  ScrapedMetadata,
  UpdateItemInput,
  WishItem,
  WishlistPublicResponse,
} from "../shared/types";

const OWNER_TOKEN_KEY = "wish:owner-token";
const GUEST_CLAIMS_KEY = "wish:guest-claims";
const PROCHE_DEVICE_KEY = "wish:proche";

export interface SavedClaimToken {
  claimId: string;
  itemId: string;
  cancelToken: string;
  mode: ClaimMode;
  guestName?: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers,
  });

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Erreur réseau (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

// --- Public Wishlist API ---

export function fetchWishlist(): Promise<WishlistPublicResponse> {
  return requestJson<WishlistPublicResponse>("/api/wishlist", {
    method: "GET",
  });
}

export function createClaim(
  input: CreateClaimInput,
): Promise<CreateClaimResponse> {
  return requestJson<CreateClaimResponse>("/api/claims", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteClaim(
  claimId: string,
  options?: { cancelToken?: string; force?: boolean },
): Promise<{ ok: true }> {
  const body: { cancelToken?: string; force?: boolean } = {};
  if (options?.cancelToken) body.cancelToken = options.cancelToken;
  if (options?.force) body.force = true;

  return requestJson<{ ok: true }>(
    `/api/claims/${encodeURIComponent(claimId)}`,
    {
      method: "DELETE",
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
    },
  );
}

// --- Owner Admin API (never touches claims) ---

export function fetchAdminItems(token: string): Promise<AdminItemsResponse> {
  return requestJson<AdminItemsResponse>("/api/admin/items", {
    method: "GET",
    headers: authHeaders(token),
  });
}

export function createAdminItem(
  token: string,
  input: CreateItemInput,
): Promise<{ item: WishItem }> {
  return requestJson<{ item: WishItem }>("/api/admin/items", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export function updateAdminItem(
  token: string,
  id: string,
  input: UpdateItemInput,
): Promise<{ item: WishItem }> {
  return requestJson<{ item: WishItem }>(
    `/api/admin/items/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function deleteAdminItem(
  token: string,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/items/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
  );
}

export function scrapeUrl(token: string, url: string): Promise<ScrapedMetadata> {
  return requestJson<ScrapedMetadata>("/api/scrape", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ url }),
  });
}

// --- Safe localStorage helpers ---

function getStorage(): Storage | null {
  try {
    if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
      return null;
    }
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function getOwnerToken(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const val = storage.getItem(OWNER_TOKEN_KEY);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

export function setOwnerToken(token: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(OWNER_TOKEN_KEY, token.trim());
  } catch {
    // Ignore private browsing / quota errors
  }
}

export function clearOwnerToken(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(OWNER_TOKEN_KEY);
  } catch {
    // Ignore storage errors
  }
}

/** Device explicitly marked as belonging to a guest (gate answered or `?proche` link). */
export function isProcheDevice(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return storage.getItem(PROCHE_DEVICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markProcheDevice(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(PROCHE_DEVICE_KEY, "1");
  } catch {
    // Ignore storage errors: the gate will simply show again next visit
  }
}

export function getSavedClaimTokens(): SavedClaimToken[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(GUEST_CLAIMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as SavedClaimToken[]).filter(
      (entry) =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof entry.claimId === "string" &&
        typeof entry.itemId === "string" &&
        typeof entry.cancelToken === "string",
    );
  } catch {
    return [];
  }
}

export function saveClaimToken(entry: SavedClaimToken): void {
  const storage = getStorage();
  if (!storage) return;
  const next = [
    ...getSavedClaimTokens().filter((c) => c.claimId !== entry.claimId),
    entry,
  ];
  try {
    storage.setItem(GUEST_CLAIMS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors
  }
}

export function removeClaimToken(claimId: string): void {
  const storage = getStorage();
  if (!storage) return;
  const next = getSavedClaimTokens().filter((c) => c.claimId !== claimId);
  try {
    if (next.length === 0) {
      storage.removeItem(GUEST_CLAIMS_KEY);
    } else {
      storage.setItem(GUEST_CLAIMS_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage errors
  }
}

// --- Small URL & clipboard helpers ---

export function extractDomain(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const host = new URL(raw).hostname.replace(/^www\./i, "");
    return host || undefined;
  } catch {
    return undefined;
  }
}

export function isHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
