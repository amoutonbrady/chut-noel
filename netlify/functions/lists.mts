import type { Config, Context } from "@netlify/functions";
import type {
  CreateListResponse,
  StoredWishlist,
} from "../../src/shared/types";
import {
  errorResponse,
  generateSecretToken,
  generateUniqueSlug,
  getListsStore,
  hashToken,
  isValidTheme,
  jsonResponse,
  parseJsonBody,
  sanitizeSeed,
  sanitizeText,
  saveOwnerTokenLookup,
  saveStoredWishlist,
  toOwnerWishlistView,
} from "./_lib/storage.mjs";

export const config: Config = {
  path: "/api/lists",
  method: ["POST"],
};

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") {
    return errorResponse("Méthode non autorisée.", 405);
  }

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const body = parsed.data;
  const ownerName = sanitizeText(body.ownerName, 80);
  if (!ownerName) {
    return errorResponse("Le prénom ou nom du créateur est requis.", 400);
  }

  const title = sanitizeText(body.title, 120);
  if (!title) {
    return errorResponse("Le titre de la liste est requis.", 400);
  }

  if (!isValidTheme(body.theme)) {
    return errorResponse(
      'Thème invalide. Valeurs acceptées : "lutins", "chalet", "neon", "boule-a-neige".',
      400,
    );
  }

  const subtitle = sanitizeText(body.subtitle, 200);
  const seed = sanitizeSeed(body.seed);

  const listsStore = getListsStore();
  const slug = await generateUniqueSlug(ownerName, listsStore);
  const ownerToken = generateSecretToken(24);
  const ownerTokenHash = await hashToken(ownerToken);
  const now = new Date().toISOString();

  const stored: StoredWishlist = {
    slug,
    ownerTokenHash,
    title,
    ownerName,
    ...(subtitle !== undefined ? { subtitle } : {}),
    theme: body.theme,
    seed,
    items: [],
    createdAt: now,
    updatedAt: now,
  };

  await saveStoredWishlist(stored, listsStore);
  await saveOwnerTokenLookup(ownerTokenHash, slug, listsStore);

  const responseBody: CreateListResponse = {
    slug,
    ownerToken,
    list: toOwnerWishlistView(stored),
  };

  return jsonResponse(responseBody, 201);
};
