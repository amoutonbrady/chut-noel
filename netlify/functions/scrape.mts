import type { Config, Context } from "@netlify/functions";
import { scrapeProductUrl } from "./_lib/scraper.mjs";
import {
  errorResponse,
  jsonResponse,
  parseJsonBody,
} from "./_lib/storage.mjs";

export const config: Config = {
  path: "/api/scrape",
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

  const rawUrl = parsed.data.url;
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return errorResponse("Le champ url est requis.", 400);
  }

  const result = await scrapeProductUrl(rawUrl);
  if (result.blocked) {
    return errorResponse(result.error, 400);
  }

  return jsonResponse(result.data, 200);
};
