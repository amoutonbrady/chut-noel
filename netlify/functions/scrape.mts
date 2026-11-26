import type { Config, Context } from "@netlify/functions";
import type { ScrapedMetadata } from "../../src/shared/types";
import { scrapeProductUrl } from "./_lib/scraper.mjs";
import {
  errorResponse,
  jsonResponse,
  parseJsonBody,
  requireOwnerAuth,
} from "./_lib/storage.mjs";

export const config: Config = {
  path: "/api/scrape",
  method: ["POST"],
};

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") {
    return errorResponse("Méthode non autorisée.", 405);
  }

  const authError = requireOwnerAuth(req);
  if (authError) {
    return authError;
  }

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const rawUrl = parsed.data.url;
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return errorResponse("Le champ url est requis.", 400);
  }

  const result = await scrapeProductUrl(rawUrl);
  if (result.blocked) {
    return errorResponse(result.error, 400);
  }

  const metadata: ScrapedMetadata = {
    url: result.data.url,
    ...(result.data.title ? { title: result.data.title } : {}),
    ...(result.data.imageUrl ? { imageUrl: result.data.imageUrl } : {}),
    ...(result.data.priceHint ? { priceHint: result.data.priceHint } : {}),
    ...(result.data.siteName ? { siteName: result.data.siteName } : {}),
  };

  return jsonResponse(metadata, 200);
};
