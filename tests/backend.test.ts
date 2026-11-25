import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Context } from "@netlify/functions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import claimsHandler from "../netlify/functions/claims.mts";
import guestListHandler from "../netlify/functions/guest-list.mts";
import listsHandler from "../netlify/functions/lists.mts";
import ownerHandler from "../netlify/functions/owner.mts";
import scrapeHandler from "../netlify/functions/scrape.mts";
import {
  decodeHtmlEntities,
  extractMetadataFromHtml,
  guessTitleFromUrl,
  isBlockedHostname,
  scrapeProductUrl,
  validatePublicScrapeUrl,
} from "../netlify/functions/_lib/scraper.mts";
import {
  createMemoryBlobStore,
  getClaimsStoreName,
  getListsStoreName,
  setStoreOverrides,
  toOwnerWishlistView,
  toPublicClaim,
  toPublicClaimsByItem,
  type MemoryBlobStore,
} from "../netlify/functions/_lib/storage.mts";
import {
  ApiError,
  findOwnedListBySlug,
  getGuestClaimTokens,
  getOwnedLists,
  removeGuestClaimToken,
  saveGuestClaimToken,
  saveOwnedList,
} from "../src/lib/api";
import type {
  CreateClaimResponse,
  CreateListResponse,
  GuestWishlistView,
  OwnerWishlistView,
  ScrapeLinkResponse,
  StoredGuestClaim,
  StoredWishlist,
} from "../src/shared/types";

function makeContext(params: Record<string, string> = {}): Context {
  return { params } as unknown as Context;
}

function jsonReq(
  url: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>,
): Request {
  return new Request(url, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("Chut ! Noël — Backend & API", () => {
  let listsStore: MemoryBlobStore;
  let claimsStore: MemoryBlobStore;

  beforeEach(() => {
    listsStore = createMemoryBlobStore();
    claimsStore = createMemoryBlobStore();
    setStoreOverrides({ lists: listsStore, claims: claimsStore });
  });

  afterEach(() => {
    setStoreOverrides(null);
    vi.restoreAllMocks();
  });

  describe("Anti-spoil guarantees & store isolation", () => {
    it("uses isolated context-suffixed store names", () => {
      expect(getListsStoreName()).toBe("chut-noel-lists-dev");
      expect(getClaimsStoreName()).toBe("chut-noel-claims-dev");
    });

    it("lists.mts and owner.mts never reference or import the claims store", () => {
      const listsSource = readFileSync(
        resolve(process.cwd(), "netlify/functions/lists.mts"),
        "utf8",
      );
      const ownerSource = readFileSync(
        resolve(process.cwd(), "netlify/functions/owner.mts"),
        "utf8",
      );
      for (const source of [listsSource, ownerSource]) {
        expect(source).not.toContain("getClaimsStore");
        expect(source).not.toContain("getStoredClaimsMap");
        expect(source).not.toContain("saveStoredClaimsMap");
        expect(source).not.toContain("chut-noel-claims");
      }
    });

    it("toOwnerWishlistView strips ownerTokenHash and any extraneous claim fields", () => {
      const polluted = {
        slug: "noel-claire-1234",
        ownerTokenHash: "secret-sha256-hash",
        title: "Liste de Claire",
        ownerName: "Claire",
        subtitle: "Merci les lutins",
        theme: "lutins" as const,
        seed: 42,
        items: [],
        createdAt: "2026-12-01T10:00:00.000Z",
        updatedAt: "2026-12-01T10:00:00.000Z",
        claims: [{ id: "leaked" }],
        claimsByItem: { item1: [] },
        claimedCount: 3,
      } as unknown as StoredWishlist;

      const view = toOwnerWishlistView(polluted);
      expect(view).not.toHaveProperty("ownerTokenHash");
      expect(view).not.toHaveProperty("claims");
      expect(view).not.toHaveProperty("claimsByItem");
      expect(view).not.toHaveProperty("claimedCount");
      expect(Object.keys(view).sort()).toEqual([
        "createdAt",
        "items",
        "ownerName",
        "seed",
        "slug",
        "subtitle",
        "theme",
        "title",
        "updatedAt",
      ]);
    });

    it("owner endpoints NEVER touch the claims store even after guests reserve items", async () => {
      // 1. Create list
      const createRes = await listsHandler(
        jsonReq("https://example.test/api/lists", "POST", {
          ownerName: "Alexandre",
          title: "Noël d'Alexandre",
          subtitle: "Des idées pour les lutins",
          theme: "chalet",
          seed: 777,
        }),
        makeContext(),
      );
      expect(createRes.status).toBe(201);
      expect(createRes.headers.get("cache-control")).toBe("no-store");
      expect(createRes.headers.get("access-control-allow-origin")).toBeNull();

      const created = (await createRes.json()) as CreateListResponse;
      expect(created.slug).toMatch(/^noel-alexandre-\d{4}$/);
      expect(created.ownerToken.length).toBeGreaterThanOrEqual(32);
      expect(created.list).not.toHaveProperty("ownerTokenHash");
      expect(created.list).not.toHaveProperty("claims");
      expect(created.list).not.toHaveProperty("claimsByItem");
      expect(claimsStore.getReadCount()).toBe(0);
      expect(claimsStore.getWriteCount()).toBe(0);

      // 2. Owner adds an item
      const addRes = await ownerHandler(
        jsonReq(
          `https://example.test/api/owner/${created.ownerToken}/items`,
          "POST",
          {
            title: "Machine à espresso",
            url: "https://shop.example.com/espresso",
            priceHint: "189 €",
          },
        ),
        makeContext({ token: created.ownerToken }),
      );
      expect(addRes.status).toBe(201);
      const afterAdd = (await addRes.json()) as OwnerWishlistView;
      expect(afterAdd.items).toHaveLength(1);
      expect(afterAdd.items[0].size).toBe("moyen");
      expect(afterAdd.items[0].wrapSeed).toBeGreaterThan(0);
      const itemId = afterAdd.items[0].id;

      // 3. Guest claims the item
      const claimRes = await claimsHandler(
        jsonReq(
          `https://example.test/api/lists/${created.slug}/claims`,
          "POST",
          {
            itemId,
            mode: "solo",
            guestName: "Maman",
            message: "Chut, déjà commandé !",
          },
        ),
        makeContext({ slug: created.slug }),
      );
      expect(claimRes.status).toBe(201);

      const readsBeforeOwnerCalls = claimsStore.getReadCount();
      const writesBeforeOwnerCalls = claimsStore.getWriteCount();

      // 4. Owner fetches, updates list, updates item -> ZERO reads/writes on claims store
      const getOwnerRes = await ownerHandler(
        jsonReq(
          `https://example.test/api/owner/${created.ownerToken}`,
          "GET",
        ),
        makeContext({ token: created.ownerToken }),
      );
      expect(getOwnerRes.status).toBe(200);
      expect(getOwnerRes.headers.get("cache-control")).toBe("no-store");
      const ownerView = (await getOwnerRes.json()) as Record<string, unknown>;
      expect(ownerView).not.toHaveProperty("ownerTokenHash");
      expect(ownerView).not.toHaveProperty("claims");
      expect(ownerView).not.toHaveProperty("claimsByItem");
      expect(JSON.stringify(ownerView)).not.toContain("Maman");
      expect(JSON.stringify(ownerView)).not.toContain("commandé");

      const patchListRes = await ownerHandler(
        jsonReq(
          `https://example.test/api/owner/${created.ownerToken}`,
          "PATCH",
          { title: "Noël 2026 d'Alexandre", theme: "neon", seed: 999 },
        ),
        makeContext({ token: created.ownerToken }),
      );
      expect(patchListRes.status).toBe(200);
      const patchedList = (await patchListRes.json()) as OwnerWishlistView;
      expect(patchedList.theme).toBe("neon");
      expect(patchedList.seed).toBe(999);

      const patchItemRes = await ownerHandler(
        jsonReq(
          `https://example.test/api/owner/${created.ownerToken}/items/${itemId}`,
          "PATCH",
          { size: "geant", note: "Couleur inox si possible" },
        ),
        makeContext({ token: created.ownerToken, itemId }),
      );
      expect(patchItemRes.status).toBe(200);
      const patchedItemView = (await patchItemRes.json()) as OwnerWishlistView;
      expect(patchedItemView.items[0].size).toBe("geant");
      expect(patchedItemView.items[0].note).toBe("Couleur inox si possible");

      expect(claimsStore.getReadCount()).toBe(readsBeforeOwnerCalls);
      expect(claimsStore.getWriteCount()).toBe(writesBeforeOwnerCalls);
    });

    it("guest-list strips hashes and filters out claims for deleted items", async () => {
      const createRes = await listsHandler(
        jsonReq("https://example.test/api/lists", "POST", {
          ownerName: "Léa",
          title: "Liste de Léa",
          theme: "boule-a-neige",
        }),
        makeContext(),
      );
      const created = (await createRes.json()) as CreateListResponse;

      const add1 = (await (
        await ownerHandler(
          jsonReq(
            `https://example.test/api/owner/${created.ownerToken}/items`,
            "POST",
            { title: "Écharpe en laine" },
          ),
          makeContext({ token: created.ownerToken }),
        )
      ).json()) as OwnerWishlistView;
      const item1Id = add1.items[0].id;

      const add2 = (await (
        await ownerHandler(
          jsonReq(
            `https://example.test/api/owner/${created.ownerToken}/items`,
            "POST",
            { title: "Bougie sapin" },
          ),
          makeContext({ token: created.ownerToken }),
        )
      ).json()) as OwnerWishlistView;
      const item2Id = add2.items[1].id;

      await claimsHandler(
        jsonReq(
          `https://example.test/api/lists/${created.slug}/claims`,
          "POST",
          { itemId: item1Id, mode: "solo", guestName: "Paul" },
        ),
        makeContext({ slug: created.slug }),
      );
      await claimsHandler(
        jsonReq(
          `https://example.test/api/lists/${created.slug}/claims`,
          "POST",
          { itemId: item2Id, mode: "solo", guestName: "Julie" },
        ),
        makeContext({ slug: created.slug }),
      );

      // Owner deletes item1 (never touches claims store!)
      const delRes = await ownerHandler(
        jsonReq(
          `https://example.test/api/owner/${created.ownerToken}/items/${item1Id}`,
          "DELETE",
        ),
        makeContext({ token: created.ownerToken, itemId: item1Id }),
      );
      expect(delRes.status).toBe(200);

      // Guest view filters out item1's claim and strips hashes
      const guestRes = await guestListHandler(
        jsonReq(`https://example.test/api/lists/${created.slug}`, "GET"),
        makeContext({ slug: created.slug }),
      );
      expect(guestRes.status).toBe(200);
      expect(guestRes.headers.get("cache-control")).toBe("no-store");
      const guestView = (await guestRes.json()) as GuestWishlistView;

      expect(guestView.list).not.toHaveProperty("ownerTokenHash");
      expect(guestView.list.items.map((i) => i.id)).toEqual([item2Id]);
      expect(guestView.claimsByItem[item1Id]).toBeUndefined();
      expect(guestView.claimsByItem[item2Id]).toHaveLength(1);
      expect(guestView.claimsByItem[item2Id][0]).not.toHaveProperty(
        "cancelCodeHash",
      );
      expect(guestView.claimsByItem[item2Id][0].guestName).toBe("Julie");
    });

    it("toPublicClaim and toPublicClaimsByItem never expose cancelCodeHash", () => {
      const stored: StoredGuestClaim = {
        id: "c1",
        itemId: "i1",
        mode: "solo",
        guestName: "Lutin",
        cancelCodeHash: "top-secret-hash",
        createdAt: "2026-12-01T10:00:00.000Z",
      };
      const pub = toPublicClaim(stored);
      expect(pub).not.toHaveProperty("cancelCodeHash");
      const map = toPublicClaimsByItem(
        { i1: [stored], deletedItem: [stored] },
        [
          {
            id: "i1",
            title: "Livre",
            size: "mini",
            wrapSeed: 1,
            createdAt: "2026-12-01T10:00:00.000Z",
            updatedAt: "2026-12-01T10:00:00.000Z",
          },
        ],
      );
      expect(Object.keys(map)).toEqual(["i1"]);
      expect(map.i1[0]).not.toHaveProperty("cancelCodeHash");
    });
  });

  describe("Owner validation edge cases", () => {
    it("rejects invalid theme, missing fields, unknown tokens, and non-http item URLs", async () => {
      const badTheme = await listsHandler(
        jsonReq("https://example.test/api/lists", "POST", {
          ownerName: "Tom",
          title: "Liste",
          theme: "invalid-theme",
        }),
        makeContext(),
      );
      expect(badTheme.status).toBe(400);

      const unknownOwner = await ownerHandler(
        jsonReq("https://example.test/api/owner/does-not-exist", "GET"),
        makeContext({ token: "does-not-exist" }),
      );
      expect(unknownOwner.status).toBe(404);

      const created = (await (
        await listsHandler(
          jsonReq("https://example.test/api/lists", "POST", {
            ownerName: "Tom",
            title: "Liste de Tom",
            theme: "lutins",
          }),
          makeContext(),
        )
      ).json()) as CreateListResponse;

      const badUrlRes = await ownerHandler(
        jsonReq(
          `https://example.test/api/owner/${created.ownerToken}/items`,
          "POST",
          {
            title: "Mauvais lien",
            url: "javascript:alert(1)",
          },
        ),
        makeContext({ token: created.ownerToken }),
      );
      expect(badUrlRes.status).toBe(400);
    });
  });

  describe("Claims: solo vs group conflicts, cancelToken & force", () => {
    async function setupListWithTwoItems(): Promise<{
      slug: string;
      ownerToken: string;
      itemA: string;
      itemB: string;
    }> {
      const created = (await (
        await listsHandler(
          jsonReq("https://example.test/api/lists", "POST", {
            ownerName: "Camille",
            title: "Noël de Camille",
            theme: "lutins",
          }),
          makeContext(),
        )
      ).json()) as CreateListResponse;

      const v1 = (await (
        await ownerHandler(
          jsonReq(
            `https://example.test/api/owner/${created.ownerToken}/items`,
            "POST",
            { title: "Platine vinyle" },
          ),
          makeContext({ token: created.ownerToken }),
        )
      ).json()) as OwnerWishlistView;

      const v2 = (await (
        await ownerHandler(
          jsonReq(
            `https://example.test/api/owner/${created.ownerToken}/items`,
            "POST",
            { title: "Vélo de ville" },
          ),
          makeContext({ token: created.ownerToken }),
        )
      ).json()) as OwnerWishlistView;

      return {
        slug: created.slug,
        ownerToken: created.ownerToken,
        itemA: v1.items[0].id,
        itemB: v2.items[1].id,
      };
    }

    it("returns 404 when claiming an unknown item", async () => {
      const { slug } = await setupListWithTwoItems();
      const res = await claimsHandler(
        jsonReq(`https://example.test/api/lists/${slug}/claims`, "POST", {
          itemId: "non-existent-item",
          mode: "solo",
        }),
        makeContext({ slug }),
      );
      expect(res.status).toBe(404);
    });

    it("enforces solo vs solo, solo vs group, and allows multiple group claims", async () => {
      const { slug, itemA, itemB } = await setupListWithTwoItems();

      // Solo claim on itemA with default guestName
      const solo1 = await claimsHandler(
        jsonReq(`https://example.test/api/lists/${slug}/claims`, "POST", {
          itemId: itemA,
          mode: "solo",
        }),
        makeContext({ slug }),
      );
      expect(solo1.status).toBe(201);
      const solo1Data = (await solo1.json()) as CreateClaimResponse;
      expect(solo1Data.claim.guestName).toBe("Un lutin mystère");
      expect(solo1Data.cancelToken.length).toBeGreaterThanOrEqual(32);
      expect(solo1Data.claim).not.toHaveProperty("cancelCodeHash");

      // Second solo on itemA -> 409 with exact message
      const solo2 = await claimsHandler(
        jsonReq(`https://example.test/api/lists/${slug}/claims`, "POST", {
          itemId: itemA,
          mode: "solo",
          guestName: "Marc",
        }),
        makeContext({ slug }),
      );
      expect(solo2.status).toBe(409);
      expect(await solo2.json()).toEqual({
        error: "Déjà réservé par un autre lutin !",
      });

      // Group claim on itemA (already solo) -> 409
      const groupOnSolo = await claimsHandler(
        jsonReq(`https://example.test/api/lists/${slug}/claims`, "POST", {
          itemId: itemA,
          mode: "group",
          guestName: "Sophie",
        }),
        makeContext({ slug }),
      );
      expect(groupOnSolo.status).toBe(409);

      // Multiple group claims on itemB -> ALL succeed!
      const group1 = await claimsHandler(
        jsonReq(`https://example.test/api/lists/${slug}/claims`, "POST", {
          itemId: itemB,
          mode: "group",
          guestName: "Sophie",
          message: "Je mets 50 €",
        }),
        makeContext({ slug }),
      );
      expect(group1.status).toBe(201);

      const group2 = await claimsHandler(
        jsonReq(`https://example.test/api/lists/${slug}/claims`, "POST", {
          itemId: itemB,
          mode: "group",
          guestName: "Lucas",
          message: "Je participe aussi !",
        }),
        makeContext({ slug }),
      );
      expect(group2.status).toBe(201);

      // Solo claim on itemB (already has group) -> 409 with exact message
      const soloOnGroup = await claimsHandler(
        jsonReq(`https://example.test/api/lists/${slug}/claims`, "POST", {
          itemId: itemB,
          mode: "solo",
          guestName: "Oncle Bob",
        }),
        makeContext({ slug }),
      );
      expect(soloOnGroup.status).toBe(409);
      expect(await soloOnGroup.json()).toEqual({
        error: "Un cadeau groupé est déjà en cours pour ce souhait !",
      });

      // Verify guest-list shows both group claims
      const guestView = (await (
        await guestListHandler(
          jsonReq(`https://example.test/api/lists/${slug}`, "GET"),
          makeContext({ slug }),
        )
      ).json()) as GuestWishlistView;
      expect(guestView.claimsByItem[itemB]).toHaveLength(2);
    });

    it("validates cancelToken (header and body) and allows force deletion", async () => {
      const { slug, itemA, itemB } = await setupListWithTwoItems();

      const claimA = (await (
        await claimsHandler(
          jsonReq(`https://example.test/api/lists/${slug}/claims`, "POST", {
            itemId: itemA,
            mode: "solo",
            guestName: "Alice",
          }),
          makeContext({ slug }),
        )
      ).json()) as CreateClaimResponse;

      // No token and no force -> 403
      const noTokenRes = await claimsHandler(
        jsonReq(
          `https://example.test/api/lists/${slug}/claims/${claimA.claim.id}`,
          "DELETE",
        ),
        makeContext({ slug, claimId: claimA.claim.id }),
      );
      expect(noTokenRes.status).toBe(403);

      // Wrong token -> 403
      const wrongTokenRes = await claimsHandler(
        jsonReq(
          `https://example.test/api/lists/${slug}/claims/${claimA.claim.id}`,
          "DELETE",
          undefined,
          { "x-cancel-token": "wrong-token" },
        ),
        makeContext({ slug, claimId: claimA.claim.id }),
      );
      expect(wrongTokenRes.status).toBe(403);

      // Valid x-cancel-token header -> 200 { ok: true }
      const validHeaderRes = await claimsHandler(
        jsonReq(
          `https://example.test/api/lists/${slug}/claims/${claimA.claim.id}`,
          "DELETE",
          undefined,
          { "x-cancel-token": claimA.cancelToken },
        ),
        makeContext({ slug, claimId: claimA.claim.id }),
      );
      expect(validHeaderRes.status).toBe(200);
      expect(await validHeaderRes.json()).toEqual({ ok: true });

      // ItemA can now be claimed again!
      const reclaim = await claimsHandler(
        jsonReq(`https://example.test/api/lists/${slug}/claims`, "POST", {
          itemId: itemA,
          mode: "solo",
          guestName: "Bob",
        }),
        makeContext({ slug }),
      );
      expect(reclaim.status).toBe(201);
      const claimA2 = (await reclaim.json()) as CreateClaimResponse;

      // Valid cancelToken in JSON body -> 200 { ok: true }
      const validBodyRes = await claimsHandler(
        jsonReq(
          `https://example.test/api/lists/${slug}/claims/${claimA2.claim.id}`,
          "DELETE",
          { cancelToken: claimA2.cancelToken },
        ),
        makeContext({ slug, claimId: claimA2.claim.id }),
      );
      expect(validBodyRes.status).toBe(200);
      expect(await validBodyRes.json()).toEqual({ ok: true });

      // Force deletion without token -> 200 { ok: true }
      const claimB = (await (
        await claimsHandler(
          jsonReq(`https://example.test/api/lists/${slug}/claims`, "POST", {
            itemId: itemB,
            mode: "solo",
            guestName: "PerduSonTel",
          }),
          makeContext({ slug }),
        )
      ).json()) as CreateClaimResponse;

      const forceRes = await claimsHandler(
        jsonReq(
          `https://example.test/api/lists/${slug}/claims/${claimB.claim.id}`,
          "DELETE",
          { force: true },
        ),
        makeContext({ slug, claimId: claimB.claim.id }),
      );
      expect(forceRes.status).toBe(200);
      expect(await forceRes.json()).toEqual({ ok: true });

      // Deleting again -> 404
      const missingRes = await claimsHandler(
        jsonReq(
          `https://example.test/api/lists/${slug}/claims/${claimB.claim.id}`,
          "DELETE",
          { force: true },
        ),
        makeContext({ slug, claimId: claimB.claim.id }),
      );
      expect(missingRes.status).toBe(404);
    });
  });

  describe("Scraper: OG / JSON-LD / price / entities / SSRF / fallback", () => {
    it("decodes named, decimal, and hex HTML entities without double-decoding", () => {
      expect(
        decodeHtmlEntities(
          "Cafeti&egrave;re L&#x27;Or &amp; Tasses &quot;No&euml;l&quot; &#8364; &amp;lt;safe&amp;gt;",
        ),
      ).toBe('Cafetière L\'Or & Tasses "Noël" € &lt;safe&gt;');
    });

    it("extracts OG metadata, resolves relative image URLs, and prefers JSON-LD price", () => {
      const html = `
        <!doctype html>
        <html>
          <head>
            <title>Fallback Title</title>
            <meta content="Casque &amp; Micro &#x27;Studio&#x27;" property="og:title" />
            <meta property="og:image" content="/assets/casque.jpg" />
            <meta property="og:site_name" content="Boutique Son" />
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Casque JSON-LD",
                "image": "/assets/jsonld.jpg",
                "offers": {
                  "@type": "Offer",
                  "price": "149.90",
                  "priceCurrency": "EUR"
                }
              }
            </script>
          </head>
          <body><p>Prix public: 199,00 €</p></body>
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

    it("falls back through twitter -> JSON-LD -> title, and product:price:amount -> EUR regex", () => {
      const htmlJsonLdGraph = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@graph": [
                  { "@type": "Organization", "name": "Ignored Org" },
                  {
                    "@type": ["Product"],
                    "name": "Jeu de soci&eacute;t&eacute; Wingspan",
                    "image": ["https://cdn.example.com/wingspan.png"]
                  }
                ]
              }
            </script>
            <meta property="product:price:amount" content="54.5" />
            <meta property="product:price:currency" content="EUR" />
          </head>
        </html>
      `;

      const res1 = extractMetadataFromHtml(
        htmlJsonLdGraph,
        new URL("https://www.ludotheque.fr/wingspan"),
      );
      expect(res1.title).toBe("Jeu de société Wingspan");
      expect(res1.imageUrl).toBe("https://cdn.example.com/wingspan.png");
      expect(res1.priceHint).toBe("54,50 €");
      expect(res1.siteName).toBe("ludotheque.fr");

      const htmlRegexPrice = `
        <html>
          <head>
            <title>Pull de No&euml;l Tricot&eacute;</title>
            <meta name="twitter:image" content="https://img.example.com/pull.webp" />
          </head>
          <body>
            <script>const dummy = "9999 €";</script>
            <div class="price">Seulement 39,95 € en boutique</div>
          </body>
        </html>
      `;

      const res2 = extractMetadataFromHtml(
        htmlRegexPrice,
        new URL("https://www.tricot-hiver.fr/pull"),
      );
      expect(res2.title).toBe("Pull de Noël Tricoté");
      expect(res2.imageUrl).toBe("https://img.example.com/pull.webp");
      expect(res2.priceHint).toBe("39,95 €");
      expect(res2.siteName).toBe("tricot-hiver.fr");
    });

    it("blocks all private, loopback, metadata, local, internal, and non-http URLs (SSRF)", async () => {
      const blockedUrls = [
        "http://localhost/admin",
        "http://sub.localhost:3000/secret",
        "http://127.0.0.1/",
        "http://127.99.0.1:8080/",
        "http://10.0.0.1/internal",
        "http://172.16.0.1/",
        "http://172.24.10.5/",
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
        const validation = validatePublicScrapeUrl(badUrl);
        expect(validation.ok, `Expected SSRF block for ${badUrl}`).toBe(false);

        const result = await scrapeProductUrl(badUrl, {
          fetchImpl: fetchSpy as unknown as typeof fetch,
        });
        expect(result.blocked, `Expected scrape block for ${badUrl}`).toBe(true);
      }
      expect(fetchSpy).not.toHaveBeenCalled();

      // Public IPs outside 172.16-31.* and normal domains are allowed
      expect(isBlockedHostname("172.15.0.1")).toBe(false);
      expect(isBlockedHostname("172.32.0.1")).toBe(false);
      expect(validatePublicScrapeUrl("https://www.fnac.com/item").ok).toBe(true);
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

    it("returns a clean 200 fallback with guessed title from URL slug on 403/429/timeout", async () => {
      expect(
        guessTitleFromUrl(
          new URL(
            "https://www.amazon.fr/Lego-Star-Wars-Faucon-Millenium/dp/B075SDMMMV",
          ),
        ),
      ).toBe("Lego Star Wars Faucon Millenium");

      // 403 bot protection
      const forbiddenFetch = vi.fn(
        async () => new Response("Forbidden", { status: 403 }),
      );
      const res403 = await scrapeProductUrl(
        "https://www.boutique-bloque.fr/produits/bouilloire-electrique-vintage.html",
        { fetchImpl: forbiddenFetch as unknown as typeof fetch },
      );
      expect(res403.blocked).toBe(false);
      if (!res403.blocked) {
        expect(res403.data).toEqual({
          ok: false,
          fallback: true,
          siteName: "boutique-bloque.fr",
          title: "Bouilloire electrique vintage",
          reason: "http_403",
        });
      }

      // 429 rate limited via HTTP handler
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Too Many Requests", { status: 429 }),
      );
      const httpRes = await scrapeHandler(
        jsonReq("https://example.test/api/scrape", "POST", {
          url: "https://www.cultura.com/p/carnet-croquis-aquarelle-1234567",
        }),
        makeContext(),
      );
      expect(httpRes.status).toBe(200);
      expect(httpRes.headers.get("cache-control")).toBe("no-store");
      const httpData = (await httpRes.json()) as ScrapeLinkResponse;
      expect(httpData.ok).toBe(false);
      expect(httpData.fallback).toBe(true);
      expect(httpData.siteName).toBe("cultura.com");
      expect(httpData.title).toBe("Carnet croquis aquarelle");
      expect(httpData.reason).toBe("http_429");

      // Timeout abort -> fallback without throwing
      const slowFetch = vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("Aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      );
      const timeoutRes = await scrapeProductUrl(
        "https://www.slow-shop.fr/lampe-bureau-bois",
        {
          fetchImpl: slowFetch as unknown as typeof fetch,
          timeoutMs: 25,
        },
      );
      expect(timeoutRes.blocked).toBe(false);
      if (!timeoutRes.blocked) {
        expect(timeoutRes.data.ok).toBe(false);
        expect(timeoutRes.data.fallback).toBe(true);
        expect(timeoutRes.data.reason).toBe("timeout");
        expect(timeoutRes.data.title).toBe("Lampe bureau bois");
      }
    });

    it("caps streamed response reads at maxBytes (350 KB) without failing", async () => {
      const head =
        '<html><head><meta property="og:title" content="Objet Grand Format"></head><body>';
      const chunkBytes = new TextEncoder().encode("x".repeat(64 * 1024));
      let chunksSent = 0;

      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (chunksSent === 0) {
            controller.enqueue(new TextEncoder().encode(head));
          } else if (chunksSent < 20) {
            controller.enqueue(chunkBytes);
          } else {
            controller.close();
          }
          chunksSent += 1;
        },
      });

      const hugeFetch = vi.fn(
        async () =>
          new Response(stream, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
      );

      const res = await scrapeProductUrl("https://www.huge-site.fr/item", {
        fetchImpl: hugeFetch as unknown as typeof fetch,
      });
      expect(res.blocked).toBe(false);
      if (!res.blocked) {
        expect(res.data.ok).toBe(true);
        expect(res.data.title).toBe("Objet Grand Format");
      }
      // Stream cancelled well before all 20 * 64 KB (1.28 MB) chunks were sent
      expect(chunksSent).toBeLessThan(10);
    });

    it("rejects SSRF URLs with 400 on POST /api/scrape", async () => {
      const res = await scrapeHandler(
        jsonReq("https://example.test/api/scrape", "POST", {
          url: "http://127.0.0.1:8080/secret",
        }),
        makeContext(),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("Frontend API client helpers", () => {
    beforeEach(() => {
      const map = new Map<string, string>();
      const fakeStorage: Storage = {
        get length() {
          return map.size;
        },
        clear() {
          map.clear();
        },
        getItem(key: string) {
          return map.get(key) ?? null;
        },
        key(index: number) {
          return Array.from(map.keys())[index] ?? null;
        },
        removeItem(key: string) {
          map.delete(key);
        },
        setItem(key: string, value: string) {
          map.set(key, value);
        },
      };
      vi.stubGlobal("localStorage", fakeStorage);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("manages owned lists and guest claim tokens in localStorage and exports ApiError", () => {
      const err = new ApiError("Conflit", 409);
      expect(err).toBeInstanceOf(Error);
      expect(err.status).toBe(409);
      expect(err.message).toBe("Conflit");

      saveOwnedList({
        slug: "noel-alex-1001",
        ownerToken: "tok-1",
        title: "Liste 1",
        ownerName: "Alex",
        theme: "lutins",
        updatedAt: "2026-12-01T10:00:00.000Z",
      });
      saveOwnedList({
        slug: "noel-alex-1001",
        ownerToken: "tok-1",
        title: "Liste 1 Modifiée",
        ownerName: "Alex",
        theme: "neon",
        updatedAt: "2026-12-02T10:00:00.000Z",
      });

      expect(getOwnedLists()).toHaveLength(1);
      expect(findOwnedListBySlug("noel-alex-1001")?.title).toBe(
        "Liste 1 Modifiée",
      );

      saveGuestClaimToken("noel-claire-2002", {
        claimId: "claim-1",
        itemId: "item-1",
        cancelToken: "cancel-abc",
        mode: "group",
        guestName: "Alex",
      });
      expect(getGuestClaimTokens("noel-claire-2002")).toHaveLength(1);

      removeGuestClaimToken("noel-claire-2002", "claim-1");
      expect(getGuestClaimTokens("noel-claire-2002")).toEqual([]);
    });
  });
});
