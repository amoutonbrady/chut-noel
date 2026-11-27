import { createMemo, createSignal, Show } from "solid-js";
import type { ClaimMode, PublicClaim, WishItem } from "../shared/types";
import { extractDomain } from "../lib/api";
import type { SavedClaimToken } from "../lib/api";
import {
  CheckIcon,
  CircleDotIcon,
  ExternalLinkIcon,
  LockIcon,
  UsersIcon,
} from "./Icons";

export interface WishCardProps {
  item: WishItem;
  /** Alexandre's view: hide every status badge and action. */
  owner?: boolean;
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

/** Stable per-title hue so each placeholder gets its own wrapping paper. */
export function titleHue(title: string): number {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
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

  const participantsLabel = createMemo(() =>
    props.claims.map((c) => c.guestName?.trim() || "un proche").join(", "),
  );

  const notesFromGuests = createMemo(() =>
    props.claims
      .filter((c) => c.message?.trim())
      .map((c) => ({
        id: c.id,
        who: c.guestName?.trim() || "Un proche",
        text: c.message!.trim(),
      })),
  );

  return (
    <article
      class={[
        "wish-card",
        {
          "wish-card--reserved":
            !props.owner && isReserved() && !isGroup() && !myClaimEntry(),
          "wish-card--mine": Boolean(myClaimEntry()),
          "wish-card--celebrate": Boolean(props.justReserved),
        },
      ]}
    >
      <div class="wish-media">
        <Show
          when={props.item.imageUrl && !imgFailed()}
          fallback={
            <div
              class="wish-placeholder"
              style={{ "--hue": String(titleHue(props.item.title)) }}
              aria-hidden="true"
            >
              <span class="wish-monogram">{titleInitial(props.item.title)}</span>
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

        <Show when={!props.owner}>
          <div class="wish-status-overlay">
            <Show
              when={myClaimEntry()}
              fallback={
                <Show
                  when={isGroup()}
                  fallback={
                    <Show
                      when={isReserved()}
                      fallback={
                        <span class="badge badge--available">
                          <CircleDotIcon size={13} />
                          Disponible
                        </span>
                      }
                    >
                      <span class="badge badge--reserved">
                        <LockIcon size={13} />
                        Déjà réservé
                      </span>
                    </Show>
                  }
                >
                  <span class="badge badge--group">
                    <UsersIcon size={13} />
                    Cadeau groupé
                    <span class="badge-count">({props.claims.length})</span>
                  </span>
                </Show>
              }
            >
              <span class="badge badge--mine">
                <CheckIcon
                  size={13}
                  class={props.justReserved ? "check-draw" : undefined}
                />
                {isGroup() ? "Tu participes" : "Réservé par toi"}
              </span>
            </Show>
          </div>
        </Show>
      </div>

      <div class="wish-body">
        <div class="wish-head">
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
                  {props.item.title}
                  <ExternalLinkIcon size={13} class="wish-ext-icon" />
                  <span class="sr-only"> (nouvel onglet)</span>
                </a>
              )}
            </Show>
          </h3>

          <Show when={props.item.priceHint || domain()}>
            <div class="wish-meta">
              <Show when={props.item.priceHint}>
                {(price) => <span class="wish-price">{price()}</span>}
              </Show>
              <Show when={domain()}>
                {(host) => <span class="wish-domain">{host()}</span>}
              </Show>
            </div>
          </Show>
        </div>

        <Show when={props.item.note}>
          {(note) => <p class="wish-note">{note()}</p>}
        </Show>

        <Show when={!props.owner && isReserved()}>
          <div class="wish-claim-info">
            <p class="wish-participants">
              {isGroup() ? "Participent : " : "Réservé par "}
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

        <Show when={!props.owner}>
          <div class="wish-actions">
            <Show when={!isReserved()}>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                disabled={props.busy}
                onClick={() => props.onReserve(props.item, "solo")}
              >
                Réserver
              </button>
            </Show>

            <Show when={isGroup() && !myClaimEntry()}>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                disabled={props.busy}
                onClick={() => props.onReserve(props.item, "group")}
              >
                <UsersIcon size={14} />
                Participer
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
                class="btn btn-ghost btn-sm"
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
    </article>
  );
}
