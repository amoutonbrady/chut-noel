import { createMemo, createSignal, Show } from "solid-js";
import type { ClaimMode, PublicClaim, WishItem } from "../shared/types";
import { extractDomain } from "../lib/api";
import type { SavedClaimToken } from "../lib/api";
import {
  CheckIcon,
  CircleDotIcon,
  ExternalLinkIcon,
  GiftIcon,
  LockIcon,
  UsersIcon,
} from "./Icons";

export interface WishCardProps {
  item: WishItem;
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

export function WishCard(props: WishCardProps) {
  const [imgFailed, setImgFailed] = createSignal(() => {
    void props.item.imageUrl;
    return false;
  });

  const domain = createMemo(
    () => props.item.siteName || extractDomain(props.item.url),
  );

  const initial = createMemo(() => {
    const clean = props.item.title.trim();
    return clean ? clean[0].toUpperCase() : "A";
  });

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
    if (props.claims.length === 0) return "";
    const names = props.claims.map((c) => c.guestName?.trim() || "Un proche");
    return names.join(", ");
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

  // Subtle Solid Bits cursor spotlight sheen (disabled on touch & reduced-motion in CSS)
  const handlePointerMove = (e: PointerEvent & { currentTarget: HTMLElement }) => {
    if (e.pointerType === "touch") return;
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  return (
    <article
      class={[
        "wish-card",
        {
          "wish-card--reserved": isReserved() && !isGroup() && !myClaimEntry(),
          "wish-card--mine": Boolean(myClaimEntry()),
        },
      ]}
      onPointerMove={handlePointerMove}
    >
      <div class="wish-media">
        <Show
          when={props.item.imageUrl && !imgFailed()}
          fallback={
            <div class="wish-placeholder" aria-hidden="true">
              <span class="wish-monogram">{initial()}</span>
              <Show
                when={domain()}
                fallback={
                  <span class="wish-placeholder-sub">
                    <GiftIcon size={13} />
                    Idée cadeau
                  </span>
                }
              >
                {(host) => <span class="wish-placeholder-sub">{host()}</span>}
              </Show>
            </div>
          }
        >
          <img
            src={props.item.imageUrl}
            alt={props.item.title}
            class="wish-img"
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        </Show>

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
                      Réservé
                    </span>
                  </Show>
                }
              >
                <span class="badge badge--group">
                  <UsersIcon size={13} />
                  À plusieurs ({props.claims.length})
                </span>
              </Show>
            }
          >
            <span class="badge badge--mine">
              <CheckIcon
                size={13}
                class={props.justReserved ? "check-draw" : undefined}
              />
              {isGroup()
                ? `Tu participes (${props.claims.length})`
                : "Réservé par toi"}
            </span>
          </Show>
        </div>
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
                  <span>{props.item.title}</span>
                  <ExternalLinkIcon size={13} class="wish-ext-icon" />
                </a>
              )}
            </Show>
          </h3>

          <Show when={props.item.priceHint || domain()}>
            <div class="wish-meta">
              <Show when={props.item.priceHint}>
                {(price) => <span class="wish-price">{price()}</span>}
              </Show>
              <Show when={props.item.priceHint && domain()}>
                <span class="meta-dot" aria-hidden="true">
                  ·
                </span>
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

        <Show when={isReserved()}>
          <div class="wish-claim-info">
            <p class="wish-participants">
              {isGroup() ? "Participants : " : "Réservé par "}
              <strong>{participantsLabel()}</strong>
            </p>
            <Show when={notesFromGuests().length > 0}>
              <div class="wish-guest-notes">
                {notesFromGuests().map((n) => (
                  <p class="wish-guest-note">
                    <span class="wish-guest-who">{n.who} :</span> « {n.text} »
                  </p>
                ))}
              </div>
            </Show>
          </div>
        </Show>

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
              Participer
            </button>
          </Show>

          <Show when={myClaimEntry()}>
            {(mine) => (
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                disabled={props.busy}
                onClick={() =>
                  props.onCancelMine(
                    props.item,
                    mine().claim,
                    mine().saved.cancelToken,
                  )
                }
              >
                {isGroup() ? "Me retirer" : "Annuler ma réservation"}
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
              Libérer
            </button>
          </Show>
        </div>
      </div>
    </article>
  );
}
