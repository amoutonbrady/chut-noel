import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import type {
  GiftSize,
  PublicGuestClaim,
  SavedGuestClaimToken,
  ThemeId,
  WishlistItem,
} from "../shared/types";
import { ProceduralGiftArt } from "./ProceduralGiftArt";

export interface GiftCardProps {
  mode: "owner" | "guest";
  item: WishlistItem;
  theme: ThemeId;
  onEdit?: (item: WishlistItem) => void;
  onDelete?: (item: WishlistItem) => void;
  claims?: PublicGuestClaim[];
  myClaimTokens?: SavedGuestClaimToken[];
  onOpenClaim?: (item: WishlistItem) => void;
  onReleaseClaim?: (
    item: WishlistItem,
    claim: PublicGuestClaim,
    ownedToken?: SavedGuestClaimToken,
  ) => void;
}

const SIZE_LABELS: Record<GiftSize, string> = {
  mini: "🎀 Mini",
  moyen: "🎁 Moyen",
  geant: "🎄 Géant",
};

function formatHost(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function GiftCard(props: GiftCardProps) {
  // Writable derived signal: resets automatically if imageUrl changes
  const [imgFailed, setImgFailed] = createSignal(() => {
    void props.item.imageUrl;
    return false;
  });

  const claims = createMemo(() => props.claims ?? []);
  const soloClaim = createMemo(() =>
    claims().find((claim) => claim.mode === "solo"),
  );
  const groupClaims = createMemo(() =>
    claims().filter((claim) => claim.mode === "group"),
  );
  const isSolo = createMemo(
    () => props.mode === "guest" && Boolean(soloClaim()),
  );
  const isGroup = createMemo(
    () => props.mode === "guest" && !soloClaim() && groupClaims().length > 0,
  );

  const findOwnedToken = (claimId: string): SavedGuestClaimToken | undefined =>
    props.myClaimTokens?.find((entry) => entry.claimId === claimId);

  const siteLabel = createMemo(
    () => props.item.siteName || formatHost(props.item.url),
  );

  return (
    <article
      class={[
        "gift-card",
        {
          "gift-card--solo": isSolo(),
          "gift-card--group": isGroup(),
        },
      ]}
    >
      <div class="gift-card-media">
        <Show
          when={props.item.imageUrl && !imgFailed()}
          fallback={
            <ProceduralGiftArt
              wrapSeed={props.item.wrapSeed}
              theme={props.theme}
              size={props.item.size}
              siteName={siteLabel()}
            />
          }
        >
          <img
            class="gift-card-img"
            src={props.item.imageUrl}
            alt={props.item.title}
            loading="lazy"
            referrerpolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
        </Show>
      </div>

      <div class="gift-card-body">
        <div class="gift-card-top">
          <h3 class="gift-card-title">{props.item.title}</h3>
          <Show when={props.item.priceHint}>
            {(price) => <span class="badge badge-price">{price()}</span>}
          </Show>
        </div>

        <div class="gift-card-meta">
          <span class="badge badge-size">{SIZE_LABELS[props.item.size]}</span>
          <Show when={siteLabel()}>
            {(site) => <span class="gift-card-site">{site()}</span>}
          </Show>
        </div>

        <Show when={props.item.note}>
          {(note) => <p class="gift-card-note">« {note()} »</p>}
        </Show>

        <Show when={props.item.url}>
          {(url) => (
            <a
              class="gift-card-link"
              href={url()}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>Voir sur {siteLabel() ?? "le site"}</span>
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </Show>

        <Switch>
          <Match when={props.mode === "owner"}>
            <div class="gift-card-actions">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick={() => props.onEdit?.(props.item)}
              >
                <span aria-hidden="true">✏️</span>
                Modifier
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onClick={() => props.onDelete?.(props.item)}
              >
                <span aria-hidden="true">🗑️</span>
                Supprimer
              </button>
            </div>
          </Match>

          <Match when={props.mode === "guest" && isSolo()}>
            <Show when={soloClaim()}>
              {(claim) => (
                <>
                  <div class="gift-card-status">
                    <span class="gift-card-stamp">
                      <span aria-hidden="true">🎁</span>
                      Déjà pris par {claim().guestName} !
                    </span>
                    <Show when={claim().message}>
                      {(msg) => <p class="claim-message">« {msg()} »</p>}
                    </Show>
                  </div>
                  <div class="gift-card-actions">
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      onClick={() =>
                        props.onReleaseClaim?.(
                          props.item,
                          claim(),
                          findOwnedToken(claim().id),
                        )
                      }
                    >
                      Oups, je libère
                    </button>
                  </div>
                </>
              )}
            </Show>
          </Match>

          <Match when={props.mode === "guest" && isGroup()}>
            <div class="gift-card-status">
              <span class="gift-card-stamp">
                <span aria-hidden="true">🤝</span>
                Cadeau groupé ({groupClaims().length}{" "}
                {groupClaims().length > 1 ? "lutins" : "lutin"})
              </span>

              <ul class="gift-card-claims">
                <For each={groupClaims()} keyed={(c) => c.id}>
                  {(claim) => (
                    <li class="claim-pill">
                      <div>
                        <strong>{claim().guestName}</strong>
                        <Show when={claim().message}>
                          {(msg) => (
                            <p class="claim-message">« {msg()} »</p>
                          )}
                        </Show>
                      </div>
                      <Show
                        when={findOwnedToken(claim().id)}
                        fallback={
                          <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            aria-label={`Retirer la participation de ${claim().guestName}`}
                            onClick={() =>
                              props.onReleaseClaim?.(
                                props.item,
                                claim(),
                                undefined,
                              )
                            }
                          >
                            Retirer
                          </button>
                        }
                      >
                        {(owned) => (
                          <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            onClick={() =>
                              props.onReleaseClaim?.(
                                props.item,
                                claim(),
                                owned(),
                              )
                            }
                          >
                            Je me retire
                          </button>
                        )}
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </div>

            <div class="gift-card-actions">
              <button
                type="button"
                class="btn btn-accent btn-sm btn-block"
                onClick={() => props.onOpenClaim?.(props.item)}
              >
                Rejoindre le groupe 🤝
              </button>
            </div>
          </Match>

          <Match when={props.mode === "guest"}>
            <div class="gift-card-actions">
              <button
                type="button"
                class="btn btn-primary btn-block"
                onClick={() => props.onOpenClaim?.(props.item)}
              >
                Je le prends ! 🎁
              </button>
            </div>
          </Match>
        </Switch>
      </div>
    </article>
  );
}
