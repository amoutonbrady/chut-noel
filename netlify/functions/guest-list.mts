import type { Config, Context } from "@netlify/functions";
import type { GuestWishlistView } from "../../src/shared/types";
import {
  errorResponse,
  getClaimsStore,
  getListsStore,
  getStoredClaimsMap,
  getStoredWishlistBySlug,
  jsonResponse,
  safeDecodeParam,
  toOwnerWishlistView,
  toPublicClaimsByItem,
} from "./_lib/storage.mjs";

export const config: Config = {
  path: "/api/lists/:slug",
  method: ["GET"],
};

function extractSlug(req: Request, context?: Context): string | undefined {
  if (context?.params?.slug) {
    return safeDecodeParam(context.params.slug);
  }
  const pathname = new URL(req.url).pathname.replace(/\/+$/, "");
  const match = pathname.match(/^\/api\/lists\/([^/]+)$/);
  return safeDecodeParam(match?.[1]);
}

export default async (req: Request, context: Context): Promise<Response> => {
  if (req.method !== "GET") {
    return errorResponse("Méthode non autorisée.", 405);
  }

  const slug = extractSlug(req, context);
  if (!slug) {
    return errorResponse("Identifiant de liste manquant.", 404);
  }

  const listsStore = getListsStore();
  const wishlist = await getStoredWishlistBySlug(slug, listsStore);
  if (!wishlist) {
    return errorResponse("Liste introuvable.", 404);
  }

  const claimsStore = getClaimsStore();
  const rawClaims = await getStoredClaimsMap(slug, claimsStore);

  const view: GuestWishlistView = {
    list: toOwnerWishlistView(wishlist),
    claimsByItem: toPublicClaimsByItem(rawClaims, wishlist.items),
  };

  return jsonResponse(view, 200);
};
