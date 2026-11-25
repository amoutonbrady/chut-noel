import type { Config, Context } from "@netlify/functions";
import type {
  CreateClaimResponse,
  StoredGuestClaim,
} from "../../src/shared/types";
import {
  errorResponse,
  generateId,
  generateSecretToken,
  getClaimsStore,
  getListsStore,
  getStoredClaimsMap,
  getStoredWishlistBySlug,
  hashToken,
  isValidClaimMode,
  jsonResponse,
  parseJsonBody,
  parseOptionalJsonBody,
  safeDecodeParam,
  sanitizeText,
  saveStoredClaimsMap,
  timingSafeEqual,
  toPublicClaim,
} from "./_lib/storage.mjs";

export const config: Config = {
  path: [
    "/api/lists/:slug/claims",
    "/api/lists/:slug/claims/:claimId",
  ],
};

interface ParsedClaimsRoute {
  slug?: string;
  claimId?: string;
}

function parseClaimsRoute(req: Request, context?: Context): ParsedClaimsRoute {
  const pathname = new URL(req.url).pathname.replace(/\/+$/, "");

  const claimMatch = pathname.match(/^\/api\/lists\/([^/]+)\/claims\/([^/]+)$/);
  if (claimMatch) {
    return {
      slug: safeDecodeParam(context?.params?.slug ?? claimMatch[1]),
      claimId: safeDecodeParam(context?.params?.claimId ?? claimMatch[2]),
    };
  }

  const collectionMatch = pathname.match(/^\/api\/lists\/([^/]+)\/claims$/);
  if (collectionMatch) {
    return {
      slug: safeDecodeParam(context?.params?.slug ?? collectionMatch[1]),
    };
  }

  return {
    slug: safeDecodeParam(context?.params?.slug),
    claimId: safeDecodeParam(context?.params?.claimId),
  };
}

export default async (req: Request, context: Context): Promise<Response> => {
  const route = parseClaimsRoute(req, context);
  if (!route.slug) {
    return errorResponse("Identifiant de liste manquant.", 404);
  }

  // DELETE /api/lists/:slug/claims/:claimId
  if (route.claimId) {
    if (req.method !== "DELETE") {
      return errorResponse("Méthode non autorisée.", 405);
    }

    const headerToken = req.headers.get("x-cancel-token")?.trim();
    const optionalBody = await parseOptionalJsonBody(req);
    const bodyToken =
      typeof optionalBody?.cancelToken === "string"
        ? optionalBody.cancelToken.trim()
        : undefined;
    const cancelToken = headerToken || bodyToken;
    const force = optionalBody?.force === true;

    const claimsStore = getClaimsStore();
    const claimsMap = await getStoredClaimsMap(route.slug, claimsStore);

    let foundItemId: string | null = null;
    let foundIndex = -1;
    let targetClaim: StoredGuestClaim | null = null;

    for (const [itemId, claims] of Object.entries(claimsMap)) {
      if (!Array.isArray(claims)) continue;
      const idx = claims.findIndex((c) => c.id === route.claimId);
      if (idx !== -1) {
        foundItemId = itemId;
        foundIndex = idx;
        targetClaim = claims[idx];
        break;
      }
    }

    if (!foundItemId || !targetClaim || foundIndex === -1) {
      return errorResponse("Réservation introuvable.", 404);
    }

    let authorized = force;
    if (!authorized && cancelToken) {
      const providedHash = await hashToken(cancelToken);
      authorized = timingSafeEqual(targetClaim.cancelCodeHash, providedHash);
    }

    if (!authorized) {
      return errorResponse(
        "Jeton d'annulation invalide ou manquant pour libérer ce cadeau.",
        403,
      );
    }

    const updatedList = [...claimsMap[foundItemId]];
    updatedList.splice(foundIndex, 1);
    if (updatedList.length === 0) {
      delete claimsMap[foundItemId];
    } else {
      claimsMap[foundItemId] = updatedList;
    }

    await saveStoredClaimsMap(route.slug, claimsMap, claimsStore);
    return jsonResponse({ ok: true }, 200);
  }

  // POST /api/lists/:slug/claims
  if (req.method !== "POST") {
    return errorResponse("Méthode non autorisée.", 405);
  }

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const body = parsed.data;
  const itemId = sanitizeText(body.itemId, 128);
  if (!itemId) {
    return errorResponse("L'identifiant du cadeau est requis.", 400);
  }

  if (!isValidClaimMode(body.mode)) {
    return errorResponse(
      'Mode de réservation invalide. Valeurs acceptées : "solo" ou "group".',
      400,
    );
  }

  const listsStore = getListsStore();
  const wishlist = await getStoredWishlistBySlug(route.slug, listsStore);
  if (!wishlist) {
    return errorResponse("Liste introuvable.", 404);
  }

  const itemExists = wishlist.items.some((item) => item.id === itemId);
  if (!itemExists) {
    return errorResponse("Cadeau introuvable dans cette liste.", 404);
  }

  const claimsStore = getClaimsStore();
  const claimsMap = await getStoredClaimsMap(route.slug, claimsStore);
  const existingClaims = Array.isArray(claimsMap[itemId])
    ? claimsMap[itemId]
    : [];

  const hasSolo = existingClaims.some((claim) => claim.mode === "solo");
  const hasGroup = existingClaims.some((claim) => claim.mode === "group");

  if (body.mode === "solo" && hasSolo) {
    return errorResponse("Déjà réservé par un autre lutin !", 409);
  }
  if (body.mode === "solo" && hasGroup) {
    return errorResponse(
      "Un cadeau groupé est déjà en cours pour ce souhait !",
      409,
    );
  }
  if (body.mode === "group" && hasSolo) {
    return errorResponse("Déjà réservé par un autre lutin !", 409);
  }

  const guestName = sanitizeText(body.guestName, 60) ?? "Un lutin mystère";
  const message = sanitizeText(body.message, 240, { allowNewlines: true });
  const cancelToken = generateSecretToken(24);
  const cancelCodeHash = await hashToken(cancelToken);
  const now = new Date().toISOString();

  const storedClaim: StoredGuestClaim = {
    id: generateId(),
    itemId,
    mode: body.mode,
    guestName,
    ...(message !== undefined ? { message } : {}),
    cancelCodeHash,
    createdAt: now,
  };

  claimsMap[itemId] = [...existingClaims, storedClaim];
  await saveStoredClaimsMap(route.slug, claimsMap, claimsStore);

  const responseBody: CreateClaimResponse = {
    claim: toPublicClaim(storedClaim),
    cancelToken,
  };

  return jsonResponse(responseBody, 201);
};
