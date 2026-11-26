import type { Config, Context } from "@netlify/functions";
import type { CreateClaimResponse } from "../../src/shared/types";
import {
  errorResponse,
  generateId,
  generateSecretToken,
  getStoredClaimsMap,
  getStoredItems,
  hashToken,
  isValidClaimMode,
  jsonResponse,
  parseJsonBody,
  parseOptionalJsonBody,
  safeDecodeParam,
  sanitizeText,
  saveStoredClaimsMap,
  timingSafeEqualStrings,
  toPublicClaim,
  type StoredClaim,
} from "./_lib/storage.mjs";

export const config: Config = {
  path: ["/api/claims", "/api/claims/:claimId"],
};

function extractClaimId(req: Request, context?: Context): string | undefined {
  if (context?.params?.claimId) {
    return safeDecodeParam(context.params.claimId);
  }
  const pathname = new URL(req.url).pathname.replace(/\/+$/, "");
  const match = pathname.match(/^\/api\/claims\/([^/]+)$/);
  return safeDecodeParam(match?.[1]);
}

export default async (req: Request, context: Context): Promise<Response> => {
  const claimId = extractClaimId(req, context);

  // DELETE /api/claims/:claimId
  if (claimId) {
    if (req.method !== "DELETE") {
      return errorResponse("Méthode non autorisée.", 405);
    }

    const headerToken = req.headers.get("x-cancel-token")?.trim();
    const body = await parseOptionalJsonBody(req);
    const bodyToken =
      typeof body?.cancelToken === "string" ? body.cancelToken.trim() : undefined;
    const cancelToken = headerToken || bodyToken;
    const force = body?.force === true;

    const claimsMap = await getStoredClaimsMap();
    let foundItemId: string | null = null;
    let foundIndex = -1;
    let targetClaim: StoredClaim | null = null;

    for (const [itemId, claims] of Object.entries(claimsMap)) {
      if (!Array.isArray(claims)) continue;
      const idx = claims.findIndex((c) => c.id === claimId);
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

    const authorized =
      force ||
      Boolean(
        cancelToken &&
          timingSafeEqualStrings(targetClaim.cancelTokenHash, hashToken(cancelToken)),
      );

    if (!authorized) {
      return errorResponse("Jeton d'annulation invalide ou manquant.", 403);
    }

    const updated = [...claimsMap[foundItemId]];
    updated.splice(foundIndex, 1);
    if (updated.length === 0) {
      delete claimsMap[foundItemId];
    } else {
      claimsMap[foundItemId] = updated;
    }

    await saveStoredClaimsMap(claimsMap);
    return jsonResponse({ ok: true }, 200);
  }

  // POST /api/claims
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
    return errorResponse("L'identifiant de l'envie est requis.", 400);
  }

  if (!isValidClaimMode(body.mode)) {
    return errorResponse(
      'Mode de réservation invalide. Valeurs acceptées : "solo" ou "group".',
      400,
    );
  }

  const items = await getStoredItems();
  if (!items.some((item) => item.id === itemId)) {
    return errorResponse("Envie introuvable.", 404);
  }

  const claimsMap = await getStoredClaimsMap();
  const existing = Array.isArray(claimsMap[itemId]) ? claimsMap[itemId] : [];
  const hasSolo = existing.some((claim) => claim.mode === "solo");
  const hasGroup = existing.some((claim) => claim.mode === "group");

  if (hasSolo) {
    return errorResponse("Cette envie est déjà réservée.", 409);
  }
  if (body.mode === "solo" && hasGroup) {
    return errorResponse(
      "Un cadeau groupé est déjà en cours pour cette envie.",
      409,
    );
  }

  const guestName = sanitizeText(body.guestName, 60);
  const message = sanitizeText(body.message, 240, { allowNewlines: true });
  const cancelToken = generateSecretToken(24);
  const storedClaim: StoredClaim = {
    id: generateId(),
    itemId,
    mode: body.mode,
    ...(guestName !== undefined ? { guestName } : {}),
    ...(message !== undefined ? { message } : {}),
    cancelTokenHash: hashToken(cancelToken),
    createdAt: new Date().toISOString(),
  };

  claimsMap[itemId] = [...existing, storedClaim];
  await saveStoredClaimsMap(claimsMap);

  const response: CreateClaimResponse = {
    claim: toPublicClaim(storedClaim),
    cancelToken,
  };

  return jsonResponse(response, 201);
};
