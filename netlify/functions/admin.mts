import type { Config, Context } from "@netlify/functions";
import type { AdminItemsResponse, WishItem } from "../../src/shared/types";
import {
  cloneSafeItem,
  errorResponse,
  generateId,
  getStoredItems,
  jsonResponse,
  parseJsonBody,
  requireOwnerAuth,
  safeDecodeParam,
  sanitizeOptionalUrl,
  sanitizeText,
  saveStoredItems,
} from "./_lib/storage.mjs";

// Architectural anti-spoiler guarantee: this module NEVER imports or accesses the claims store.

export const config: Config = {
  path: ["/api/admin/items", "/api/admin/items/:id"],
};

function extractItemId(req: Request, context?: Context): string | undefined {
  if (context?.params?.id) {
    return safeDecodeParam(context.params.id);
  }
  const pathname = new URL(req.url).pathname.replace(/\/+$/, "");
  const match = pathname.match(/^\/api\/admin\/items\/([^/]+)$/);
  return safeDecodeParam(match?.[1]);
}

export default async (req: Request, context: Context): Promise<Response> => {
  const authError = requireOwnerAuth(req);
  if (authError) {
    return authError;
  }

  const itemId = extractItemId(req, context);

  // /api/admin/items/:id
  if (itemId) {
    if (req.method !== "PATCH" && req.method !== "DELETE") {
      return errorResponse("Méthode non autorisée.", 405);
    }

    const items = await getStoredItems();
    const index = items.findIndex((item) => item.id === itemId);
    if (index === -1) {
      return errorResponse("Envie introuvable.", 404);
    }

    if (req.method === "DELETE") {
      items.splice(index, 1);
      await saveStoredItems(items);
      return jsonResponse({ ok: true }, 200);
    }

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = parsed.data;
    const updated: WishItem = { ...items[index] };

    if ("title" in body) {
      const title = sanitizeText(body.title, 160);
      if (!title) {
        return errorResponse("Le titre ne peut pas être vide.", 400);
      }
      updated.title = title;
    }

    if ("url" in body) {
      const check = sanitizeOptionalUrl(body.url);
      if (!check.ok) return errorResponse(check.error, 400);
      if (check.value === undefined) delete updated.url;
      else updated.url = check.value;
    }

    if ("imageUrl" in body) {
      const check = sanitizeOptionalUrl(body.imageUrl);
      if (!check.ok) return errorResponse(check.error, 400);
      if (check.value === undefined) delete updated.imageUrl;
      else updated.imageUrl = check.value;
    }

    if ("priceHint" in body) {
      const priceHint = sanitizeText(body.priceHint, 40);
      if (priceHint === undefined) delete updated.priceHint;
      else updated.priceHint = priceHint;
    }

    if ("siteName" in body) {
      const siteName = sanitizeText(body.siteName, 80);
      if (siteName === undefined) delete updated.siteName;
      else updated.siteName = siteName;
    }

    if ("note" in body) {
      const note = sanitizeText(body.note, 400, { allowNewlines: true });
      if (note === undefined) delete updated.note;
      else updated.note = note;
    }

    updated.updatedAt = new Date().toISOString();
    items[index] = updated;
    await saveStoredItems(items);
    return jsonResponse({ item: cloneSafeItem(updated) }, 200);
  }

  // /api/admin/items
  if (req.method === "GET") {
    const items = await getStoredItems();
    const response: AdminItemsResponse = { items: items.map(cloneSafeItem) };
    return jsonResponse(response, 200);
  }

  if (req.method === "POST") {
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = parsed.data;
    const title = sanitizeText(body.title, 160);
    if (!title) {
      return errorResponse("Le titre est requis.", 400);
    }

    const urlCheck = sanitizeOptionalUrl(body.url);
    if (!urlCheck.ok) return errorResponse(urlCheck.error, 400);

    const imageCheck = sanitizeOptionalUrl(body.imageUrl);
    if (!imageCheck.ok) return errorResponse(imageCheck.error, 400);

    const priceHint = sanitizeText(body.priceHint, 40);
    const siteName = sanitizeText(body.siteName, 80);
    const note = sanitizeText(body.note, 400, { allowNewlines: true });
    const now = new Date().toISOString();

    const newItem: WishItem = {
      id: generateId(),
      title,
      ...(urlCheck.value !== undefined ? { url: urlCheck.value } : {}),
      ...(imageCheck.value !== undefined ? { imageUrl: imageCheck.value } : {}),
      ...(priceHint !== undefined ? { priceHint } : {}),
      ...(siteName !== undefined ? { siteName } : {}),
      ...(note !== undefined ? { note } : {}),
      createdAt: now,
      updatedAt: now,
    };

    const items = await getStoredItems();
    items.push(newItem);
    await saveStoredItems(items);
    return jsonResponse({ item: cloneSafeItem(newItem) }, 201);
  }

  return errorResponse("Méthode non autorisée.", 405);
};
