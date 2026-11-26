import type { Config, Context } from "@netlify/functions";
import type { WishlistPublicResponse } from "../../src/shared/types";
import {
  cloneSafeItem,
  errorResponse,
  getStoredClaimsMap,
  getStoredItems,
  jsonResponse,
  toPublicClaimsByItem,
} from "./_lib/storage.mjs";

export const config: Config = {
  path: "/api/wishlist",
  method: ["GET"],
};

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") {
    return errorResponse("Méthode non autorisée.", 405);
  }

  const [items, rawClaims] = await Promise.all([
    getStoredItems(),
    getStoredClaimsMap(),
  ]);

  const response: WishlistPublicResponse = {
    items: items.map(cloneSafeItem),
    claimsByItem: toPublicClaimsByItem(rawClaims, items),
  };

  return jsonResponse(response, 200);
};
