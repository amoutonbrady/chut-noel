import type { Config, Context } from "@netlify/functions";
import type { WishlistItem } from "../../src/shared/types";
import {
  errorResponse,
  generateId,
  getListsStore,
  getStoredWishlistByOwnerToken,
  isValidGiftSize,
  isValidTheme,
  jsonResponse,
  parseJsonBody,
  safeDecodeParam,
  sanitizeOptionalUrl,
  sanitizeSeed,
  sanitizeText,
  saveStoredWishlist,
  toOwnerWishlistView,
} from "./_lib/storage.mjs";

export const config: Config = {
  path: [
    "/api/owner/:token",
    "/api/owner/:token/items",
    "/api/owner/:token/items/:itemId",
  ],
};

interface ParsedOwnerRoute {
  token?: string;
  itemId?: string;
  isItemsCollection: boolean;
}

function parseOwnerRoute(req: Request, context?: Context): ParsedOwnerRoute {
  const pathname = new URL(req.url).pathname.replace(/\/+$/, "");

  const itemMatch = pathname.match(/^\/api\/owner\/([^/]+)\/items\/([^/]+)$/);
  if (itemMatch) {
    return {
      token: safeDecodeParam(context?.params?.token ?? itemMatch[1]),
      itemId: safeDecodeParam(context?.params?.itemId ?? itemMatch[2]),
      isItemsCollection: false,
    };
  }

  const itemsMatch = pathname.match(/^\/api\/owner\/([^/]+)\/items$/);
  if (itemsMatch) {
    return {
      token: safeDecodeParam(context?.params?.token ?? itemsMatch[1]),
      isItemsCollection: true,
    };
  }

  const listMatch = pathname.match(/^\/api\/owner\/([^/]+)$/);
  if (listMatch) {
    return {
      token: safeDecodeParam(context?.params?.token ?? listMatch[1]),
      isItemsCollection: false,
    };
  }

  return {
    token: safeDecodeParam(context?.params?.token),
    itemId: safeDecodeParam(context?.params?.itemId),
    isItemsCollection: pathname.endsWith("/items"),
  };
}

export default async (req: Request, context: Context): Promise<Response> => {
  const route = parseOwnerRoute(req, context);
  if (!route.token) {
    return errorResponse("Jeton éditeur manquant.", 404);
  }

  const listsStore = getListsStore();
  const wishlist = await getStoredWishlistByOwnerToken(route.token, listsStore);
  if (!wishlist) {
    return errorResponse("Liste introuvable ou lien éditeur invalide.", 404);
  }

  // /api/owner/:token/items/:itemId
  if (route.itemId) {
    const itemIndex = wishlist.items.findIndex(
      (item) => item.id === route.itemId,
    );
    if (itemIndex === -1) {
      return errorResponse("Cadeau introuvable dans cette liste.", 404);
    }

    if (req.method === "DELETE") {
      wishlist.items.splice(itemIndex, 1);
      wishlist.updatedAt = new Date().toISOString();
      await saveStoredWishlist(wishlist, listsStore);
      return jsonResponse(toOwnerWishlistView(wishlist), 200);
    }

    if (req.method === "PATCH") {
      const parsed = await parseJsonBody(req);
      if (!parsed.ok) {
        return parsed.response;
      }

      const body = parsed.data;
      const existing = wishlist.items[itemIndex];
      const updated: WishlistItem = { ...existing };

      if ("title" in body) {
        const title = sanitizeText(body.title, 160);
        if (!title) {
          return errorResponse("Le titre du cadeau ne peut pas être vide.", 400);
        }
        updated.title = title;
      }

      if ("url" in body) {
        const urlCheck = sanitizeOptionalUrl(body.url);
        if (!urlCheck.ok) {
          return errorResponse(urlCheck.error, 400);
        }
        if (urlCheck.value === undefined) {
          delete updated.url;
        } else {
          updated.url = urlCheck.value;
        }
      }

      if ("imageUrl" in body) {
        const imageCheck = sanitizeOptionalUrl(body.imageUrl);
        if (!imageCheck.ok) {
          return errorResponse(imageCheck.error, 400);
        }
        if (imageCheck.value === undefined) {
          delete updated.imageUrl;
        } else {
          updated.imageUrl = imageCheck.value;
        }
      }

      if ("priceHint" in body) {
        const priceHint = sanitizeText(body.priceHint, 40);
        if (priceHint === undefined) {
          delete updated.priceHint;
        } else {
          updated.priceHint = priceHint;
        }
      }

      if ("siteName" in body) {
        const siteName = sanitizeText(body.siteName, 80);
        if (siteName === undefined) {
          delete updated.siteName;
        } else {
          updated.siteName = siteName;
        }
      }

      if ("note" in body) {
        const note = sanitizeText(body.note, 400, { allowNewlines: true });
        if (note === undefined) {
          delete updated.note;
        } else {
          updated.note = note;
        }
      }

      if ("size" in body) {
        if (!isValidGiftSize(body.size)) {
          return errorResponse(
            'Taille invalide. Valeurs acceptées : "mini", "moyen", "geant".',
            400,
          );
        }
        updated.size = body.size;
      }

      const now = new Date().toISOString();
      updated.updatedAt = now;
      wishlist.items[itemIndex] = updated;
      wishlist.updatedAt = now;

      await saveStoredWishlist(wishlist, listsStore);
      return jsonResponse(toOwnerWishlistView(wishlist), 200);
    }

    return errorResponse("Méthode non autorisée.", 405);
  }

  // /api/owner/:token/items
  if (route.isItemsCollection) {
    if (req.method !== "POST") {
      return errorResponse("Méthode non autorisée.", 405);
    }

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = parsed.data;
    const title = sanitizeText(body.title, 160);
    if (!title) {
      return errorResponse("Le titre du cadeau est requis.", 400);
    }

    const urlCheck = sanitizeOptionalUrl(body.url);
    if (!urlCheck.ok) {
      return errorResponse(urlCheck.error, 400);
    }

    const imageCheck = sanitizeOptionalUrl(body.imageUrl);
    if (!imageCheck.ok) {
      return errorResponse(imageCheck.error, 400);
    }

    let size: WishlistItem["size"] = "moyen";
    if (body.size !== undefined) {
      if (!isValidGiftSize(body.size)) {
        return errorResponse(
          'Taille invalide. Valeurs acceptées : "mini", "moyen", "geant".',
          400,
        );
      }
      size = body.size;
    }

    const priceHint = sanitizeText(body.priceHint, 40);
    const siteName = sanitizeText(body.siteName, 80);
    const note = sanitizeText(body.note, 400, { allowNewlines: true });
    const now = new Date().toISOString();

    const newItem: WishlistItem = {
      id: generateId(),
      title,
      ...(urlCheck.value !== undefined ? { url: urlCheck.value } : {}),
      ...(imageCheck.value !== undefined ? { imageUrl: imageCheck.value } : {}),
      ...(priceHint !== undefined ? { priceHint } : {}),
      ...(siteName !== undefined ? { siteName } : {}),
      ...(note !== undefined ? { note } : {}),
      size,
      wrapSeed: sanitizeSeed(undefined),
      createdAt: now,
      updatedAt: now,
    };

    wishlist.items.push(newItem);
    wishlist.updatedAt = now;

    await saveStoredWishlist(wishlist, listsStore);
    return jsonResponse(toOwnerWishlistView(wishlist), 201);
  }

  // /api/owner/:token
  if (req.method === "GET") {
    return jsonResponse(toOwnerWishlistView(wishlist), 200);
  }

  if (req.method === "PATCH") {
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = parsed.data;

    if ("title" in body) {
      const title = sanitizeText(body.title, 120);
      if (!title) {
        return errorResponse("Le titre de la liste ne peut pas être vide.", 400);
      }
      wishlist.title = title;
    }

    if ("ownerName" in body) {
      const ownerName = sanitizeText(body.ownerName, 80);
      if (!ownerName) {
        return errorResponse("Le nom du créateur ne peut pas être vide.", 400);
      }
      wishlist.ownerName = ownerName;
    }

    if ("subtitle" in body) {
      const subtitle = sanitizeText(body.subtitle, 200);
      if (subtitle === undefined) {
        delete wishlist.subtitle;
      } else {
        wishlist.subtitle = subtitle;
      }
    }

    if ("theme" in body) {
      if (!isValidTheme(body.theme)) {
        return errorResponse(
          'Thème invalide. Valeurs acceptées : "lutins", "chalet", "neon", "boule-a-neige".',
          400,
        );
      }
      wishlist.theme = body.theme;
    }

    if ("seed" in body) {
      if (typeof body.seed !== "number" || !Number.isFinite(body.seed)) {
        return errorResponse("Le seed doit être un nombre valide.", 400);
      }
      wishlist.seed = sanitizeSeed(body.seed);
    }

    wishlist.updatedAt = new Date().toISOString();
    await saveStoredWishlist(wishlist, listsStore);
    return jsonResponse(toOwnerWishlistView(wishlist), 200);
  }

  return errorResponse("Méthode non autorisée.", 405);
};
