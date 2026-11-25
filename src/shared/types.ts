export type ThemeId = "lutins" | "chalet" | "neon" | "boule-a-neige";

export type GiftSize = "mini" | "moyen" | "geant";

export type ClaimMode = "solo" | "group";

export interface WishlistItem {
  id: string;
  title: string;
  url?: string;
  imageUrl?: string;
  priceHint?: string;
  siteName?: string;
  note?: string;
  size: GiftSize;
  wrapSeed: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Stored in Netlify Blobs store `chut-noel-lists-*`.
 * NEVER returned raw to clients because it contains `ownerTokenHash`.
 */
export interface StoredWishlist {
  slug: string;
  ownerTokenHash: string;
  title: string;
  ownerName: string;
  subtitle?: string;
  theme: ThemeId;
  seed: number;
  items: WishlistItem[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Safe view returned to the creator on `/api/owner/:token`.
 * GUARANTEED ANTI-SPOIL: never contains claims, claim counts, or guest data.
 */
export interface OwnerWishlistView {
  slug: string;
  title: string;
  ownerName: string;
  subtitle?: string;
  theme: ThemeId;
  seed: number;
  items: WishlistItem[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Stored in Netlify Blobs store `chut-noel-claims-*`.
 */
export interface StoredGuestClaim {
  id: string;
  itemId: string;
  mode: ClaimMode;
  guestName: string;
  message?: string;
  cancelCodeHash: string;
  createdAt: string;
}

export type StoredClaimsMap = Record<string, StoredGuestClaim[]>;

/**
 * Public claim shown ONLY on guest view `/api/lists/:slug`.
 */
export interface PublicGuestClaim {
  id: string;
  itemId: string;
  mode: ClaimMode;
  guestName: string;
  message?: string;
  createdAt: string;
}

export type PublicClaimsByItem = Record<string, PublicGuestClaim[]>;

/**
 * Guest view returned on `/api/lists/:slug`.
 */
export interface GuestWishlistView {
  list: OwnerWishlistView;
  claimsByItem: PublicClaimsByItem;
}

export interface CreateListPayload {
  ownerName: string;
  title: string;
  subtitle?: string;
  theme: ThemeId;
  seed?: number;
}

export interface CreateListResponse {
  slug: string;
  ownerToken: string;
  list: OwnerWishlistView;
}

export interface UpdateListPayload {
  ownerName?: string;
  title?: string;
  subtitle?: string;
  theme?: ThemeId;
  seed?: number;
}

export interface CreateItemPayload {
  title: string;
  url?: string;
  imageUrl?: string;
  priceHint?: string;
  siteName?: string;
  note?: string;
  size?: GiftSize;
}

export interface UpdateItemPayload {
  title?: string;
  url?: string;
  imageUrl?: string;
  priceHint?: string;
  siteName?: string;
  note?: string;
  size?: GiftSize;
}

export interface CreateClaimPayload {
  itemId: string;
  mode: ClaimMode;
  guestName?: string;
  message?: string;
}

export interface CreateClaimResponse {
  claim: PublicGuestClaim;
  cancelToken: string;
}

export interface ScrapeLinkResponse {
  ok: boolean;
  fallback: boolean;
  title?: string;
  imageUrl?: string;
  priceHint?: string;
  siteName?: string;
  reason?: string;
}

export interface OwnedListRecord {
  slug: string;
  ownerToken: string;
  title: string;
  ownerName: string;
  theme: ThemeId;
  updatedAt: string;
}

export interface SavedGuestClaimToken {
  claimId: string;
  itemId: string;
  cancelToken: string;
  mode: ClaimMode;
  guestName: string;
}
