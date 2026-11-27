import { createMemo, createSignal, Show } from "solid-js";
import type { ClaimMode, PublicClaim, WishItem } from "../shared/types";
import { extractDomain } from "../lib/api";
import { itemDates } from "../lib/dates";
import type { SavedClaimToken } from "../lib/api";
import type { ViewMode } from "./WishFilters";
import {
  CheckIcon,
  CircleDotIcon,
  ClockIcon,
  ExternalLinkIcon,
  GiftIcon,
  LockIcon,
  RibbonBowIcon,
  UsersIcon,
} from "./Icons";

export interface WishCardProps {
  item: WishItem;
  /** Alexandre's view: hide every status and action. */
  owner?: boolean;
  layout?: ViewMode;
  claims: PublicClaim[];
  myTokens: SavedClaimToken[];
  justReserved?: boolean;
  busy?: boolean;
  onReserve: (item: WishItem, mode: ClaimMode) => void;
  onCancelMine: (
    item: WishItem,
    claim: PublicClaim,
    cancelToken: string,
  ) => void;
  onRequestRelease: (item: WishItem, claims: PublicClaim[]) => void;
}

const WRAP_PATTERNS = ["ribbon", "stripe", "dots", "check"] as const;
export type WrapPattern = (typeof WRAP_PATTERNS)[number];

function titleHash(title: string): number {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash);
}

/** Curated stationery hues so every placeholder feels part of the same palette. */
const WRAP_HUES = [18, 36, 152, 185, 224, 265, 342, 72];

export function titleHue(title: string): number {
  const h = titleHash(title);
  return WRAP_HUES[h % WRAP_HUES.length];
}

export function titlePattern(title: string): WrapPattern {
  const h = titleHash(title);
  return WRAP_PATTERNS[(h >> 3) % WRAP_PATTERNS.length];
}

export function titleInitial(title: string): string {
  const clean = title.trim();
  return clean ? clean[0].toUpperCase() : "?";
}

export function WishCard(props: WishCardProps) {
  const [imgFailed, setImgFailed] = createSignal(() => {
    void props.item.imageUrl;
    return false;
  });

  const dates = () => itemDates(props.item.createdAt, props.item.updatedAt);
  const fullDates = () => {
    const long = (iso: string) =>
      new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
    const added = `Ajoutée le ${long(props.item.createdAt)}`;
    const edited = Date.parse(props.item.updatedAt) - Date.parse(props.item.createdAt) > 60_000;
    return edited ? `${added}, modifiée le ${long(props.item.updatedAt)}` : added;
  };

  const domain = createMemo(
    () => props.item.siteName || extractDomain(props.item.url),
  );

  const myClaimEntry = createMemo(() => {
    const tokenByClaimId = new Map(
      props.myTokens.map((t) => [t.claimId, t] as const),
    );
    for (const claim of props.claims) {
      const saved = tokenByClaimId.get(claim.id);
      if (saved) return { claim, saved };
    }
    return null;
  });

  const isGroup = createMemo(() =>
    props.claims.some((c) => c.mode === "group"),
  );
  const isReserved = createMemo(() => props.claims.length > 0);

  const otherClaims = createMemo(() => {
    const mine = myClaimEntry()?.claim.id;
    return props.claims.filter((c) => c.id !== mine);
  });

  const participantsLabel = createMemo(() => {
    const mine = myClaimEntry()?.claim.id;
    return props.claims
      .map((c) => (c.id === mine ? "toi" : c.guestName?.trim() || "un proche"))
      .join(", ");
  });

  const notesFromGuests = createMemo(() =>
    props.claims
      .filter((c) => c.message?.trim())
      .map((c) => ({
        id: c.id,
        who: c.guestName?.trim() || "Un proche",
        text: c.message!.trim(),
      })),
  );

  // My own solo reservation without notes: the status line already says it all
  const showClaimInfo = () =>
    !props.owner &&
    isReserved() &&
    !(myClaimEntry() && !isGroup() && notesFromGuests().length === 0);

  const statusIndicator = () => (
    <Show
      when={myClaimEntry()}
      fallback={
        <Show
          when={isGroup()}
          fallback={
            <Show
              when={isReserved()}
              fallback={
                <span class="wish-status wish-status--available">
                  <CircleDotIcon size={14} />
                  <span>Disponible</span>
                </span>
              }
            >
              <span class="wish-status wish-status--reserved">
                <LockIcon size={14} />
                <span>Déjà réservé</span>
              </span>
            </Show>
          }
        >
          <span class="wish-status wish-status--group">
            <UsersIcon size={14} />
            <span>
              Cadeau groupé · <span class="num">{props.claims.length}</span>
            </span>
          </span>
        </Show>
      }
    >
      <span class="wish-status wish-status--mine">
        <CheckIcon
          size={14}
          class={props.justReserved ? "check-draw" : undefined}
        />
        <span>{isGroup() ? "Tu participes" : "Réservé par toi"}</span>
      </span>
    </Show>
  );

  const isTakenByOther = () =>
    !props.owner && isReserved() && !isGroup() && !myClaimEntry();

  // Valid CSS <custom-ident> per item so Grid/List & filter View Transitions morph cleanly
  const vtName = () => `wish-${props.item.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <li
      style={{ "--vt-name": vtName() }}
      class={[
        "wish-card",
        props.layout === "list" ? "wish-card--list" : "wish-card--grid",
        {
          "wish-card--reserved": isTakenByOther(),
          "wish-card--group": !props.owner && isGroup() && !myClaimEntry(),
          "wish-card--mine": !props.owner && Boolean(myClaimEntry()),
          "wish-card--celebrate": Boolean(props.justReserved),
        },
      ]}
    >
      <Show when={props.justReserved}>
        <div class="confetti-burst" aria-hidden="true">
          <span class="confetti-piece" />
          <span class="confetti-piece" />
          <span class="confetti-piece" />
          <span class="confetti-piece" />
          <span class="confetti-piece" />
          <span class="confetti-piece" />
          <span class="confetti-piece" />
          <span class="confetti-piece" />
        </div>
      </Show>

      <div class="wish-media">
        <Show
          when={props.item.imageUrl && !imgFailed()}
          fallback={
            <div
              class="wish-placeholder"
              data-pattern={titlePattern(props.item.title)}
              style={{ "--hue": String(titleHue(props.item.title)) }}
              aria-hidden="true"
            >
              <div class="wish-tag">
                <span class="wish-tag-bow">
                  <RibbonBowIcon size={13} />
                </span>
                <span class="wish-monogram">{titleInitial(props.item.title)}</span>
              </div>
            </div>
          }
        >
          <img
            src={props.item.imageUrl}
            alt=""
            class="wish-img"
            // Shops block hotlinking by Referer; without one most of them serve the image
            referrerpolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        </Show>
      </div>

      <div class="wish-body">
        <Show when={!props.owner || domain()}>
          <div class="wish-meta">
            <Show when={!props.owner}>{statusIndicator()}</Show>
            <Show when={!props.owner && domain()}>
              <span class="meta-sep" aria-hidden="true">·</span>
            </Show>
            <Show when={domain()}>
              {(host) => <span class="wish-domain">{host()}</span>}
            </Show>
          </div>
        </Show>

        <h3 class="wish-title">
          <Show
            when={props.item.url}
            fallback={<span>{props.item.title}</span>}
          >
            {(href) => (
              <a
                href={href()}
                target="_blank"
                rel="noopener noreferrer"
                class="wish-title-link"
              >
                <span>{props.item.title}</span>
                <ExternalLinkIcon size={14} class="wish-ext-icon" />
                <span class="sr-only"> (nouvel onglet)</span>
              </a>
            )}
          </Show>
        </h3>

        <Show when={props.item.note}>
          {(note) => <p class="wish-note">{note()}</p>}
        </Show>

        <Show when={showClaimInfo()}>
          <div class="wish-claim-slip">
            <p class="wish-participants">
              {isGroup() ? "Participent\u00A0: " : "Réservé par "}
              <strong>{participantsLabel()}</strong>
            </p>
            <Show when={notesFromGuests().length > 0}>
              <div class="wish-guest-notes">
                {notesFromGuests().map((n) => (
                  <p class="wish-guest-note">
                    <span class="wish-guest-who">{n.who}&nbsp;:</span> «&nbsp;{n.text}&nbsp;»
                  </p>
                ))}
              </div>
            </Show>
          </div>
        </Show>

        <Show when={dates()}>
          <p class="wish-dates" title={fullDates()}>
            <ClockIcon size={13} />
            <span>{dates()}</span>
          </p>
        </Show>
      </div>

      <Show when={props.item.priceHint || !props.owner}>
        <div class="wish-aside">
          <Show when={props.item.priceHint}>
            {(price) => <span class="wish-price">{price()}</span>}
          </Show>

          <Show when={!props.owner}>
            <div class="wish-actions">
              <Show when={!isReserved()}>
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  disabled={props.busy}
                  onClick={() => props.onReserve(props.item, "solo")}
                >
                  <GiftIcon size={14} />
                  <span>Réserver</span>
                </button>
              </Show>

              <Show when={isGroup() && !myClaimEntry()}>
                <button
                  type="button"
                  class="btn btn-group btn-sm"
                  disabled={props.busy}
                  onClick={() => props.onReserve(props.item, "group")}
                >
                  <UsersIcon size={14} />
                  <span>Participer</span>
                </button>
              </Show>

              <Show when={myClaimEntry()}>
                {(mine) => (
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    disabled={props.busy}
                    aria-busy={props.busy ? "true" : undefined}
                    onClick={() =>
                      props.onCancelMine(
                        props.item,
                        mine().claim,
                        mine().saved.cancelToken,
                      )
                    }
                  >
                    {props.busy
                      ? "Annulation…"
                      : isGroup()
                        ? "Ne plus participer"
                        : "Annuler ma réservation"}
                  </button>
                )}
              </Show>

              <Show when={otherClaims().length > 0}>
                <button
                  type="button"
                  class="btn btn-subtle btn-sm"
                  disabled={props.busy}
                  onClick={() => props.onRequestRelease(props.item, otherClaims())}
                >
                  {/* Only promise "available" when releasing really frees the item */}
                  {props.claims.length === 1 && !myClaimEntry()
                    ? "Rendre disponible"
                    : "Gérer les participants"}
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </li>
  );
}
