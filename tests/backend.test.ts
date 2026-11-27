import { readFileSync } from "node:fs";
import type { Context } from "@netlify/functions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import adminHandler from "../netlify/functions/admin.mts";
import claimsHandler from "../netlify/functions/claims.mts";
import scrapeHandler from "../netlify/functions/scrape.mts";
import wishlistHandler from "../netlify/functions/wishlist.mts";
import {
  extractMetadataFromHtml,
  guessTitleFromUrl,
  isBlockedHostname,
  parsePriceNumber,
  scrapeProductUrl,
  validatePublicScrapeUrl,
} from "../netlify/functions/_lib/scraper.mts";
import {
  createMemoryBlobStore,
  getClaimsStoreName,
  getItemsStoreName,
  setStoreOverrides,
  timingSafeEqualStrings,
  type MemoryBlobStore,
} from "../netlify/functions/_lib/storage.mts";
import type {
  AdminItemsResponse,
  CreateClaimResponse,
  ScrapedMetadata,
  WishItem,
  WishlistPublicResponse,
} from "../src/shared/types";

function makeContext(params: Record<string, string> = {}): Context {
  return { params } as unknown as Context;
}

function req(
  url: string,
  method: string,
  options?: { body?: unknown; token?: string; headers?: Record<string, string> },
): Request {
  const headers: Record<string, string> = { ...(options?.headers ?? {}) };
  if (options?.token !== undefined) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  let bodyStr: string | undefined;
  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyStr = JSON.stringify(options.body);
  }
  return new Request(url, { method, headers, body: bodyStr });
}

describe("Personal Wishlist Backend", () => {
  let itemsStore: MemoryBlobStore;
  let claimsStore: MemoryBlobStore;
  const origOwnerToken = process.env.OWNER_TOKEN;
  const origContext = process.env.CONTEXT;

  beforeEach(() => {
    itemsStore = createMemoryBlobStore();
    claimsStore = createMemoryBlobStore();
    setStoreOverrides({ items: itemsStore, claims: claimsStore });
    delete process.env.OWNER_TOKEN;
    delete process.env.CONTEXT;
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    setStoreOverrides(null);
    if (origOwnerToken === undefined) delete process.env.OWNER_TOKEN;
    else process.env.OWNER_TOKEN = origOwnerToken;
    if (origContext === undefined) delete process.env.CONTEXT;
    else process.env.CONTEXT = origContext;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function createItem(
    body: Record<string, unknown>,
    token = "dev",
  ): Promise<WishItem> {
    const res = await adminHandler(
      req("https://wish.test/api/admin/items", "POST", { body, token }),
      makeContext(),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { item: WishItem };
    return data.item;
  }

  describe("Owner authentication", () => {
    it("accepts dev fallback token outside production and rejects missing/wrong tokens", async () => {
      expect(getItemsStoreName()).toBe("wishlist-items-dev");
      expect(getClaimsStoreName()).toBe("wishlist-claims-dev");

      const missing = await adminHandler(
        req("https://wish.test/api/admin/items", "GET"),
        makeContext(),
      );
      expect(missing.status).toBe(401);

      const wrong = await adminHandler(
        req("https://wish.test/api/admin/items", "GET", { token: "wrong-length-token" }),
        makeContext(),
      );
      expect(wrong.status).toBe(401);

      const ok = await adminHandler(
        req("https://wish.test/api/admin/items", "GET", { token: "dev" }),
        makeContext(),
      );
      expect(ok.status).toBe(200);
    });

    it("enforces configured OWNER_TOKEN via process.env or Netlify.env", async () => {
      process.env.OWNER_TOKEN = "super-secret-token";

      const devRejected = await adminHandler(
        req("https://wish.test/api/admin/items", "GET", { token: "dev" }),
        makeContext(),
      );
      expect(devRejected.status).toBe(401);

      const valid = await adminHandler(
        req("https://wish.test/api/admin/items", "GET", {
          token: "super-secret-token",
        }),
        makeContext(),
      );
      expect(valid.status).toBe(200);

      // Netlify.env takes precedence over process.env
      vi.stubGlobal("Netlify", {
        env: {
          get: (key: string) =>
            key === "OWNER_TOKEN" ? "netlify-secret" : undefined,
        },
      });
      const oldRejected = await adminHandler(
        req("https://wish.test/api/admin/items", "GET", {
          token: "super-secret-token",
        }),
        makeContext(),
      );
      expect(oldRejected.status).toBe(401);

      const netlifyOk = await adminHandler(
        req("https://wish.test/api/admin/items", "GET", {
          token: "netlify-secret",
        }),
        makeContext(),
      );
      expect(netlifyOk.status).toBe(200);
    });

    it("fails closed with 503 in production when OWNER_TOKEN is unset", async () => {
      process.env.CONTEXT = "production";
      expect(getItemsStoreName()).toBe("wishlist-items-prod");
      expect(getClaimsStoreName()).toBe("wishlist-claims-prod");

      const adminRes = await adminHandler(
        req("https://wish.test/api/admin/items", "GET", { token: "dev" }),
        makeContext(),
      );
      expect(adminRes.status).toBe(503);
      expect(await adminRes.json()).toEqual({ error: "OWNER_TOKEN non configuré" });

      const scrapeRes = await scrapeHandler(
        req("https://wish.test/api/scrape", "POST", {
          token: "dev",
          body: { url: "https://example.com" },
        }),
        makeContext(),
      );
      expect(scrapeRes.status).toBe(503);
    });

    it("compares different-length strings safely without throwing", () => {
      expect(timingSafeEqualStrings("short", "much-longer-secret")).toBe(false);
      expect(timingSafeEqualStrings("", "non-empty")).toBe(false);
      expect(timingSafeEqualStrings("exact-match", "exact-match")).toBe(true);
    });
  });

  describe("Admin CRUD & input validation", () => {
    it("creates, lists, updates, and deletes items", async () => {
      const created = await createItem({
        title: "  Lampe de bureau  ",
        url: "https://shop.example.com/lampe",
        imageUrl: "https://cdn.example.com/lampe.jpg",
        priceHint: "85 €",
        siteName: "Shop",
        note: "Couleur sable\nOu gris",
      });
      expect(created.title).toBe("Lampe de bureau");
      expect(created.url).toBe("https://shop.example.com/lampe");
      expect(created.note).toBe("Couleur sable\nOu gris");

      const listRes = await adminHandler(
        req("https://wish.test/api/admin/items", "GET", { token: "dev" }),
        makeContext(),
      );
      expect(listRes.status).toBe(200);
      expect(listRes.headers.get("cache-control")).toBe("no-store");
      const listData = (await listRes.json()) as AdminItemsResponse;
      expect(listData.items).toHaveLength(1);
      expect(listData.items[0].id).toBe(created.id);

      const patchRes = await adminHandler(
        req(`https://wish.test/api/admin/items/${created.id}`, "PATCH", {
          token: "dev",
          body: { title: "Lampe articulée", priceHint: "", note: null },
        }),
        makeContext({ id: created.id }),
      );
      expect(patchRes.status).toBe(200);
      const patched = (await patchRes.json()) as { item: WishItem };
      expect(patched.item.title).toBe("Lampe articulée");
      expect(patched.item.priceHint).toBeUndefined();
      expect(patched.item.note).toBeUndefined();

      const delRes = await adminHandler(
        req(`https://wish.test/api/admin/items/${created.id}`, "DELETE", {
          token: "dev",
        }),
        makeContext({ id: created.id }),
      );
      expect(delRes.status).toBe(200);
      expect(await delRes.json()).toEqual({ ok: true });

      const missingDel = await adminHandler(
        req(`https://wish.test/api/admin/items/${created.id}`, "DELETE", {
          token: "dev",
        }),
        makeContext({ id: created.id }),
      );
      expect(missingDel.status).toBe(404);
    });

    it("rejects empty titles and unsafe non-http(s) URLs", async () => {
      const noTitle = await adminHandler(
        req("https://wish.test/api/admin/items", "POST", {
          token: "dev",
          body: { title: "   " },
        }),
        makeContext(),
      );
      expect(noTitle.status).toBe(400);

      for (const badUrl of [
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "ftp://example.com/file",
        "not a url",
      ]) {
        const res = await adminHandler(
          req("https://wish.test/api/admin/items", "POST", {
            token: "dev",
            body: { title: "Objet", url: badUrl },
          }),
          makeContext(),
        );
        expect(res.status, `Expected 400 for ${badUrl}`).toBe(400);

        const imgRes = await adminHandler(
          req("https://wish.test/api/admin/items", "POST", {
            token: "dev",
            body: { title: "Objet", imageUrl: badUrl },
          }),
          makeContext(),
        );
        expect(imgRes.status, `Expected 400 for imageUrl ${badUrl}`).toBe(400);
      }
    });
  });

  describe("Anti-spoiler guarantee", () => {
    it("admin.mts never imports or accesses the claims store, and deleting an item hides orphan claims", async () => {
      const adminSource = readFileSync(
        new URL("../netlify/functions/admin.mts", import.meta.url),
        "utf-8",
      );
      expect(adminSource).not.toMatch(/getClaimsStore|getStoredClaimsMap|saveStoredClaimsMap/);

      const itemA = await createItem({ title: "Casque audio" });
      const itemB = await createItem({ title: "Moulin à café" });

      // Guest claims itemA
      const claimRes = await claimsHandler(
        req("https://wish.test/api/claims", "POST", {
          body: { itemId: itemA.id, mode: "solo", guestName: "Camille", message: "Chut !" },
        }),
        makeContext(),
      );
      expect(claimRes.status).toBe(201);

      const readsBefore = claimsStore.getReadCount();
      const writesBefore = claimsStore.getWriteCount();

      // Owner reads, edits, and deletes items — claims store count must NOT change
      const adminList = await adminHandler(
        req("https://wish.test/api/admin/items", "GET", { token: "dev" }),
        makeContext(),
      );
      const adminJson = JSON.stringify(await adminList.json());
      expect(adminJson).not.toContain("Camille");
      expect(adminJson).not.toContain("claims");

      await adminHandler(
        req(`https://wish.test/api/admin/items/${itemA.id}`, "PATCH", {
          token: "dev",
          body: { title: "Casque studio" },
        }),
        makeContext({ id: itemA.id }),
      );
      await adminHandler(
        req(`https://wish.test/api/admin/items/${itemA.id}`, "DELETE", {
          token: "dev",
        }),
        makeContext({ id: itemA.id }),
      );

      expect(claimsStore.getReadCount()).toBe(readsBefore);
      expect(claimsStore.getWriteCount()).toBe(writesBefore);

      // Public /api/wishlist hides orphan claims for deleted itemA and keeps itemB
      const publicRes = await wishlistHandler(
        req("https://wish.test/api/wishlist", "GET"),
        makeContext(),
      );
      expect(publicRes.status).toBe(200);
      const publicData = (await publicRes.json()) as WishlistPublicResponse;
      expect(publicData.items.map((i) => i.id)).toEqual([itemB.id]);
      expect(publicData.claimsByItem[itemA.id]).toBeUndefined();
      expect(Object.keys(publicData.claimsByItem)).toHaveLength(0);
    });
  });

  describe("Claims (solo, group, conflicts, cancelToken & force release)", () => {
    it("enforces solo vs group conflicts and strips cancelTokenHash from public view", async () => {
      const soloItem = await createItem({ title: "Carnet en lin" });
      const groupItem = await createItem({ title: "Machine espresso" });

      // Missing item -> 404
      const missingRes = await claimsHandler(
        req("https://wish.test/api/claims", "POST", {
          body: { itemId: "unknown-id", mode: "solo" },
        }),
        makeContext(),
      );
      expect(missingRes.status).toBe(404);

      // Solo claim succeeds
      const soloRes = await claimsHandler(
        req("https://wish.test/api/claims", "POST", {
          body: { itemId: soloItem.id, mode: "solo", guestName: "Léo" },
        }),
        makeContext(),
      );
      expect(soloRes.status).toBe(201);
      const soloData = (await soloRes.json()) as CreateClaimResponse;
      expect(soloData.cancelToken.length).toBeGreaterThanOrEqual(32);
      expect(soloData.claim.guestName).toBe("Léo");

      // Second solo or group on soloItem -> 409
      const dupSolo = await claimsHandler(
        req("https://wish.test/api/claims", "POST", {
          body: { itemId: soloItem.id, mode: "solo" },
        }),
        makeContext(),
      );
      expect(dupSolo.status).toBe(409);

      const groupAfterSolo = await claimsHandler(
        req("https://wish.test/api/claims", "POST", {
          body: { itemId: soloItem.id, mode: "group" },
        }),
        makeContext(),
      );
      expect(groupAfterSolo.status).toBe(409);

      // Multiple group claims allowed; solo after group -> 409
      const g1 = await claimsHandler(
        req("https://wish.test/api/claims", "POST", {
          body: { itemId: groupItem.id, mode: "group", guestName: "Marie" },
        }),
        makeContext(),
      );
      expect(g1.status).toBe(201);

      const g2 = await claimsHandler(
        req("https://wish.test/api/claims", "POST", {
          body: { itemId: groupItem.id, mode: "group", message: "Je participe !" },
        }),
        makeContext(),
      );
      expect(g2.status).toBe(201);

      const soloAfterGroup = await claimsHandler(
        req("https://wish.test/api/claims", "POST", {
          body: { itemId: groupItem.id, mode: "solo" },
        }),
        makeContext(),
      );
      expect(soloAfterGroup.status).toBe(409);

      // Public view returns claims without cancelTokenHash
      const publicRes = await wishlistHandler(
        req("https://wish.test/api/wishlist", "GET"),
        makeContext(),
      );
      const publicText = await publicRes.text();
      expect(publicText).not.toContain("cancelTokenHash");
      const publicData = JSON.parse(publicText) as WishlistPublicResponse;
      expect(publicData.claimsByItem[soloItem.id]).toHaveLength(1);
      expect(publicData.claimsByItem[groupItem.id]).toHaveLength(2);
    });

    it("releases a claim with matching cancelToken or force:true and rejects invalid tokens", async () => {
      const item = await createItem({ title: "Théière fonte" });

      const c1 = (await (
        await claimsHandler(
          req("https://wish.test/api/claims", "POST", {
            body: { itemId: item.id, mode: "group", guestName: "Alice" },
          }),
          makeContext(),
        )
      ).json()) as CreateClaimResponse;

      const c2 = (await (
        await claimsHandler(
          req("https://wish.test/api/claims", "POST", {
            body: { itemId: item.id, mode: "group", guestName: "Bob" },
          }),
          makeContext(),
        )
      ).json()) as CreateClaimResponse;

      // Wrong token -> 403
      const wrongDel = await claimsHandler(
        req(`https://wish.test/api/claims/${c1.claim.id}`, "DELETE", {
          body: { cancelToken: "wrong" },
        }),
        makeContext({ claimId: c1.claim.id }),
      );
      expect(wrongDel.status).toBe(403);

      // Matching token -> 200
      const okDel = await claimsHandler(
        req(`https://wish.test/api/claims/${c1.claim.id}`, "DELETE", {
          body: { cancelToken: c1.cancelToken },
        }),
        makeContext({ claimId: c1.claim.id }),
      );
      expect(okDel.status).toBe(200);
      expect(await okDel.json()).toEqual({ ok: true });

      // Already deleted -> 404
      const notFoundDel = await claimsHandler(
        req(`https://wish.test/api/claims/${c1.claim.id}`, "DELETE", {
          body: { cancelToken: c1.cancelToken },
        }),
        makeContext({ claimId: c1.claim.id }),
      );
      expect(notFoundDel.status).toBe(404);

      // Force release without token -> 200
      const forceDel = await claimsHandler(
        req(`https://wish.test/api/claims/${c2.claim.id}`, "DELETE", {
          body: { force: true },
        }),
        makeContext({ claimId: c2.claim.id }),
      );
      expect(forceDel.status).toBe(200);

      const publicData = (await (
        await wishlistHandler(req("https://wish.test/api/wishlist", "GET"), makeContext())
      ).json()) as WishlistPublicResponse;
      expect(publicData.claimsByItem[item.id]).toBeUndefined();
    });
  });

  describe("Link Scraper & SSRF hardening", () => {
    it("requires owner auth on POST /api/scrape", async () => {
      const unauth = await scrapeHandler(
        req("https://wish.test/api/scrape", "POST", {
          body: { url: "https://www.example.com/item" },
        }),
        makeContext(),
      );
      expect(unauth.status).toBe(401);
    });

    it("extracts OG, JSON-LD, and HTML metadata cleanly", () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Casque &amp; Micro &#39;Studio&#39;" />
            <meta property="og:image" content="/assets/casque.jpg" />
            <meta property="og:site_name" content="Boutique Son" />
            <script type="application/ld+json">
              { "@type": "Product", "offers": { "price": "149.9", "priceCurrency": "EUR" } }
            </script>
          </head>
        </html>
      `;
      const extracted = extractMetadataFromHtml(
        html,
        new URL("https://www.boutique-son.fr/p/casque-studio"),
      );
      expect(extracted).toEqual({
        title: "Casque & Micro 'Studio'",
        imageUrl: "https://www.boutique-son.fr/assets/casque.jpg",
        priceHint: "149,90 €",
        siteName: "Boutique Son",
      });
    });

    it("parses separators, microdata, Amazon images and shop title suffixes", () => {
      expect(parsePriceNumber("1.299,99")).toBe(1299.99);
      expect(parsePriceNumber("1,299.99")).toBe(1299.99);
      expect(parsePriceNumber("1 299,99")).toBe(1299.99);
      expect(parsePriceNumber("149.9")).toBe(149.9);
      expect(parsePriceNumber("1.299")).toBe(1299);
      expect(parsePriceNumber(12.5)).toBe(12.5);

      // Real Amazon shape: no og:image, image in data-old-hires, shipping threshold in text
      expect(
        extractMetadataFromHtml(
          `<title>LE PETIT PRINCE : Saint-Exupery, Antoine de: Amazon.fr: Livres</title>
           <p>Livraison gratuite dès 10 €</p>
           <img id="landingImage" data-old-hires="https://m.media-amazon.com/images/I/710.jpg">`,
          new URL("https://www.amazon.fr/dp/2070612759"),
        ),
      ).toEqual({
        title: "LE PETIT PRINCE : Saint-Exupery, Antoine de",
        imageUrl: "https://m.media-amazon.com/images/I/710.jpg",
        siteName: "amazon.fr",
      });

      const fnac = new URL("https://www.fnac.com/a1/casque");
      expect(
        extractMetadataFromHtml(
          `<title>Casque WH-1000XM5 | Fnac</title>
           <link rel="image_src" href="/casque.jpg">
           <span itemprop="price" content="1.299,99">1 299,99 €</span>
           <meta itemprop="priceCurrency" content="EUR">`,
          fnac,
        ),
      ).toEqual({
        title: "Casque WH-1000XM5",
        imageUrl: "https://www.fnac.com/casque.jpg",
        priceHint: "1299,99 €",
        siteName: "fnac.com",
      });

      expect(
        extractMetadataFromHtml(
          `<script type="application/ld+json">{"@type":"Product","name":"X",
            "offers":{"priceSpecification":{"price":59.9,"priceCurrency":"EUR"}}}</script>`,
          fnac,
        ).priceHint,
      ).toBe("59,90 €");
    });

    it("blocks private, loopback, metadata, local, internal, and non-http URLs (SSRF)", async () => {
      const blockedUrls = [
        "http://localhost/admin",
        "http://sub.localhost:3000/secret",
        "http://127.0.0.1/",
        "http://10.0.0.1/internal",
        "http://172.16.0.1/",
        "http://172.31.255.255/",
        "http://192.168.1.42/",
        "http://169.254.169.254/latest/meta-data/",
        "http://0.0.0.0/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://[::ffff:169.254.169.254]/",
        "http://nas.local/files",
        "http://metadata.google.internal/",
        "file:///etc/passwd",
        "ftp://example.com/file.txt",
        "javascript:alert(1)",
      ];

      const fetchSpy = vi.fn();
      for (const badUrl of blockedUrls) {
        expect(validatePublicScrapeUrl(badUrl).ok, `SSRF block ${badUrl}`).toBe(false);
        const result = await scrapeProductUrl(badUrl, {
          fetchImpl: fetchSpy as unknown as typeof fetch,
        });
        expect(result.blocked).toBe(true);
      }
      expect(fetchSpy).not.toHaveBeenCalled();

      expect(isBlockedHostname("172.15.0.1")).toBe(false);
      expect(isBlockedHostname("172.32.0.1")).toBe(false);

      const httpBlocked = await scrapeHandler(
        req("https://wish.test/api/scrape", "POST", {
          token: "dev",
          body: { url: "http://127.0.0.1:8080/secret" },
        }),
        makeContext(),
      );
      expect(httpBlocked.status).toBe(400);
    });

    it("blocks redirects targeting internal SSRF addresses", async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(null, {
          status: 302,
          headers: { Location: "http://169.254.169.254/latest/meta-data/" },
        });
      });

      const result = await scrapeProductUrl("https://shop.example.com/jump", {
        fetchImpl: mockFetch as unknown as typeof fetch,
      });
      expect(result.blocked).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns ScrapedMetadata fallback on 429/timeout and caps streamed reads", async () => {
      expect(
        guessTitleFromUrl(
          new URL("https://www.amazon.fr/Lego-Star-Wars-Faucon-Millenium/dp/B075SDMMMV"),
        ),
      ).toBe("Lego Star Wars Faucon Millenium");

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Too Many Requests", { status: 429 }),
      );
      const httpRes = await scrapeHandler(
        req("https://wish.test/api/scrape", "POST", {
          token: "dev",
          body: { url: "https://www.cultura.com/p/carnet-croquis-aquarelle-1234567" },
        }),
        makeContext(),
      );
      expect(httpRes.status).toBe(200);
      const meta = (await httpRes.json()) as ScrapedMetadata;
      expect(meta).toEqual({
        url: "https://www.cultura.com/p/carnet-croquis-aquarelle-1234567",
        siteName: "cultura.com",
        title: "Carnet croquis aquarelle",
      });

      const head =
        '<html><head><meta property="og:title" content="Objet Grand Format"></head><body>';
      const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
      let chunksSent = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (chunksSent === 0) controller.enqueue(new TextEncoder().encode(head));
          else if (chunksSent < 60) controller.enqueue(chunk);
          else controller.close();
          chunksSent += 1;
        },
      });
      const hugeRes = await scrapeProductUrl("https://www.huge-site.fr/item", {
        fetchImpl: vi.fn(
          async () =>
            new Response(stream, {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }),
        ) as unknown as typeof fetch,
      });
      expect(hugeRes.blocked).toBe(false);
      if (!hugeRes.blocked) {
        expect(hugeRes.data.title).toBe("Objet Grand Format");
      }
      // 2 MB cap = 32 chunks of 64 KB: the 3.75 MB stream must not be read to the end
      expect(chunksSent).toBeLessThan(40);
    });
  });
});
