import type {
  CreateClaimPayload,
  CreateClaimResponse,
  CreateItemPayload,
  CreateListPayload,
  CreateListResponse,
  GuestWishlistView,
  OwnedListRecord,
  OwnerWishlistView,
  SavedGuestClaimToken,
  ScrapeLinkResponse,
  UpdateItemPayload,
  UpdateListPayload,
} from "../shared/types";

const OWNED_LISTS_KEY = "chut-noel:owned-lists";
const GUEST_CLAIMS_KEY = "chut-noel:guest-claims";

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

export function createList(
  payload: CreateListPayload,
): Promise<CreateListResponse> {
  return requestJson<CreateListResponse>("/api/lists", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchOwnerList(ownerToken: string): Promise<OwnerWishlistView> {
  return requestJson<OwnerWishlistView>(
    `/api/owner/${encodeURIComponent(ownerToken)}`,
    { method: "GET" },
  );
}

export function updateOwnerList(
  ownerToken: string,
  payload: UpdateListPayload,
): Promise<OwnerWishlistView> {
  return requestJson<OwnerWishlistView>(
    `/api/owner/${encodeURIComponent(ownerToken)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export function addOwnerItem(
  ownerToken: string,
  payload: CreateItemPayload,
): Promise<OwnerWishlistView> {
  return requestJson<OwnerWishlistView>(
    `/api/owner/${encodeURIComponent(ownerToken)}/items`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function updateOwnerItem(
  ownerToken: string,
  itemId: string,
  payload: UpdateItemPayload,
): Promise<OwnerWishlistView> {
  return requestJson<OwnerWishlistView>(
    `/api/owner/${encodeURIComponent(ownerToken)}/items/${encodeURIComponent(itemId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export function deleteOwnerItem(
  ownerToken: string,
  itemId: string,
): Promise<OwnerWishlistView> {
  return requestJson<OwnerWishlistView>(
    `/api/owner/${encodeURIComponent(ownerToken)}/items/${encodeURIComponent(itemId)}`,
    {
      method: "DELETE",
    },
  );
}

export function fetchGuestList(slug: string): Promise<GuestWishlistView> {
  return requestJson<GuestWishlistView>(
    `/api/lists/${encodeURIComponent(slug)}`,
    { method: "GET" },
  );
}

export function createGuestClaim(
  slug: string,
  payload: CreateClaimPayload,
): Promise<CreateClaimResponse> {
  return requestJson<CreateClaimResponse>(
    `/api/lists/${encodeURIComponent(slug)}/claims`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function deleteGuestClaim(
  slug: string,
  claimId: string,
  options?: { cancelToken?: string; force?: boolean },
): Promise<{ ok: true }> {
  const headers: Record<string, string> = {};
  if (options?.cancelToken) {
    headers["x-cancel-token"] = options.cancelToken;
  }

  const bodyPayload: { cancelToken?: string; force?: boolean } = {};
  if (options?.cancelToken) {
    bodyPayload.cancelToken = options.cancelToken;
  }
  if (options?.force) {
    bodyPayload.force = true;
  }

  return requestJson<{ ok: true }>(
    `/api/lists/${encodeURIComponent(slug)}/claims/${encodeURIComponent(claimId)}`,
    {
      method: "DELETE",
      headers,
      body:
        Object.keys(bodyPayload).length > 0
          ? JSON.stringify(bodyPayload)
          : undefined,
    },
  );
}

export function scrapeLink(url: string): Promise<ScrapeLinkResponse> {
  return requestJson<ScrapeLinkResponse>("/api/scrape", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

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

export function getOwnedLists(): OwnedListRecord[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(OWNED_LISTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return (parsed as OwnedListRecord[]).filter(
      (entry) =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof entry.slug === "string" &&
        typeof entry.ownerToken === "string",
    );
  } catch {
    return [];
  }
}

export function saveOwnedList(record: OwnedListRecord): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  const existing = getOwnedLists().filter((entry) => entry.slug !== record.slug);
  const next = [record, ...existing];
  try {
    storage.setItem(OWNED_LISTS_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private browsing storage failures.
  }
}

export function findOwnedListBySlug(
  slug: string,
): OwnedListRecord | undefined {
  return getOwnedLists().find((entry) => entry.slug === slug);
}

function readAllGuestClaims(): Record<string, SavedGuestClaimToken[]> {
  const storage = getStorage();
  if (!storage) {
    return {};
  }
  try {
    const raw = storage.getItem(GUEST_CLAIMS_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, SavedGuestClaimToken[]>;
  } catch {
    return {};
  }
}

function writeAllGuestClaims(
  all: Record<string, SavedGuestClaimToken[]>,
): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(GUEST_CLAIMS_KEY, JSON.stringify(all));
  } catch {
    // Ignore quota / private browsing storage failures.
  }
}

export function getGuestClaimTokens(slug: string): SavedGuestClaimToken[] {
  const all = readAllGuestClaims();
  const entries = all[slug];
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.filter(
    (entry) =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof entry.claimId === "string" &&
      typeof entry.cancelToken === "string",
  );
}

export function saveGuestClaimToken(
  slug: string,
  token: SavedGuestClaimToken,
): void {
  const all = readAllGuestClaims();
  const current = Array.isArray(all[slug]) ? all[slug] : [];
  const filtered = current.filter((entry) => entry.claimId !== token.claimId);
  all[slug] = [...filtered, token];
  writeAllGuestClaims(all);
}

export function removeGuestClaimToken(slug: string, claimId: string): void {
  const all = readAllGuestClaims();
  const current = Array.isArray(all[slug]) ? all[slug] : [];
  const next = current.filter((entry) => entry.claimId !== claimId);
  if (next.length === 0) {
    delete all[slug];
  } else {
    all[slug] = next;
  }
  writeAllGuestClaims(all);
}
