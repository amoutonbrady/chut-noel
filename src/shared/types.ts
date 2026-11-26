export type ClaimMode = "solo" | "group";

export interface WishItem {
  id: string;
  title: string;
  url?: string;
  imageUrl?: string;
  priceHint?: string;
  siteName?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicClaim {
  id: string;
  itemId: string;
  mode: ClaimMode;
  guestName?: string;
  message?: string;
  createdAt: string;
}

export interface WishlistPublicResponse {
  items: WishItem[];
  claimsByItem: Record<string, PublicClaim[]>;
}

export interface AdminItemsResponse {
  items: WishItem[];
}

export interface CreateItemInput {
  title: string;
  url?: string;
  imageUrl?: string;
  priceHint?: string;
  siteName?: string;
  note?: string;
}

export type UpdateItemInput = Partial<CreateItemInput>;

export interface CreateClaimInput {
  itemId: string;
  mode: ClaimMode;
  guestName?: string;
  message?: string;
}

export interface CreateClaimResponse {
  claim: PublicClaim;
  cancelToken: string;
}

export interface ScrapedMetadata {
  url: string;
  title?: string;
  imageUrl?: string;
  priceHint?: string;
  siteName?: string;
  note?: string;
}
