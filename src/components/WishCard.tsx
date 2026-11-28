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
import { MarkdownNote } from "./MarkdownNote";
import { Button } from "./ui/Button";

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
                <span class="inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-ok-foreground">
                  <CircleDotIcon size={14} />
                  <span>Disponible</span>
                </span>
              }
            >
              <span class="inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-ink-muted">
                <LockIcon size={14} />
                <span>Déjà réservé</span>
              </span>
            </Show>
          }
        >
          <span class="inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-group-soft-foreground">
            <UsersIcon size={14} />
            <span>
              Cadeau groupé · <span class="tabular-nums">{props.claims.length}</span>
            </span>
          </span>
        </Show>
      }
    >
      <span class="inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-accent-soft-foreground">
        <CheckIcon
          size={14}
          class={props.justReserved ? "check-draw" : undefined}
        />
        <span>{isGroup() ? "Tu participes" : "Réservé par toi"}</span>
      </span>
    </Show>
  );

  const isList = () => props.layout === "list";
  const isMine = () => !props.owner && Boolean(myClaimEntry());
  const isGroupOnly = () => !props.owner && isGroup() && !myClaimEntry();
  const isTakenByOther = () =>
    !props.owner && isReserved() && !isGroup() && !myClaimEntry();

  // Valid CSS <custom-ident> per item so Grid/List & filter View Transitions morph cleanly
  const vtName = () => `wish-${props.item.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const cardSurfaceClass = () => {
    if (isList()) {
      return [
        "grid grid-wish-list sm:grid-wish-list-wide items-start gap-x-4.5 sm:gap-x-5.5 gap-y-3.5 p-4.5 sm:px-5.5 sm:py-5 transition-colors duration-150 ease-atelier motion-safe:hover:bg-card-list-hover",
        isMine()
          ? "bg-card-mine shadow-list-mine"
          : isGroupOnly()
            ? "bg-card shadow-list-group"
            : isTakenByOther()
              ? "bg-card-reserved"
              : "bg-card",
      ];
    }
    return [
      "flex flex-col rounded-md shadow-card transition duration-240 ease-atelier motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-card-hover contrast-more:border contrast-more:border-line-strong forced-colors:border forced-colors:border-canvas-text",
      isMine()
        ? "bg-card-mine border-t-3 border-t-accent"
        : isGroupOnly()
          ? "bg-card border-t-3 border-t-group"
          : isTakenByOther()
            ? "bg-card-reserved"
            : "bg-card",
    ];
  };

  return (
    <li
      style={{ "--vt-name": vtName() }}
      class={[
        "wish-card group/card relative overflow-hidden",
        cardSurfaceClass(),
        {
          "wish-card-reserved": isTakenByOther(),
          "wish-card-celebrate": Boolean(props.justReserved),
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

      <div
        class={[
          "relative overflow-hidden bg-well",
          isList()
            ? "aspect-square rounded-sm outline-1 -outline-offset-1 outline-image-outline"
            : "wish-media-grid aspect-video max-h-51 border-b border-line-subtle",
        ]}
      >
        <Show
          when={props.item.imageUrl && !imgFailed()}
          fallback={
            <div
              class="wish-placeholder"
              data-pattern={titlePattern(props.item.title)}
              style={{ "--hue": String(titleHue(props.item.title)) }}
              aria-hidden="true"
            >
              <div
                class={[
                  "relative inline-flex flex-col items-center justify-center bg-card shadow-wish-tag -rotate-4 transition-transform duration-280 ease-atelier",
                  isList()
                    ? "min-w-10 min-h-10 px-2 py-1 rounded-btn motion-safe:group-hover/card:rotate-0 motion-safe:group-hover/card:scale-106"
                    : "min-w-13 min-h-13 px-3 py-1.5 rounded-sm motion-safe:group-hover/card:-translate-y-0.75 motion-safe:group-hover/card:rotate-0 motion-safe:group-hover/card:scale-108 motion-safe:group-hover/card:shadow-wish-tag-hover",
                ]}
              >
                <span
                  class={[
                    "wish-placeholder-ink absolute -top-2 inline-flex transition-transform duration-260 ease-atelier motion-safe:group-hover/card:-translate-y-0.25 motion-safe:group-hover/card:scale-112",
                    { hidden: isList() },
                  ]}
                >
                  <RibbonBowIcon size={13} />
                </span>
                <span
                  class={[
                    "wish-placeholder-ink font-display font-semibold leading-none tracking-tight",
                    isList() ? "text-heading" : "text-monogram",
                  ]}
                >
                  {titleInitial(props.item.title)}
                </span>
              </div>
            </div>
          }
        >
          <img
            src={props.item.imageUrl}
            alt=""
            class={[
              "wish-img w-full h-full object-contain bg-media transition-transform duration-360 ease-atelier",
              isList()
                ? "p-1 dark:brightness-90"
                : "p-2.5 motion-safe:group-hover/card:scale-104",
            ]}
            // Shops block hotlinking by Referer; without one most of them serve the image
            referrerpolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        </Show>
      </div>

      <div
        class={[
          "min-w-0 flex flex-col gap-2",
          { "flex-1 pt-4 px-5 pb-3.5": !isList() },
        ]}
      >
        <Show when={!props.owner || domain()}>
          <div class="flex items-center flex-nowrap gap-2 min-w-0 text-sm text-ink-muted">
            <Show when={!props.owner}>{statusIndicator()}</Show>
            <Show when={!props.owner && domain()}>
              <span class="shrink-0 opacity-45" aria-hidden="true">·</span>
            </Show>
            <Show when={domain()}>
              {(host) => (
                <span class="flex-auto min-w-0 truncate text-sm text-ink-muted">
                  {host()}
                </span>
              )}
            </Show>
          </div>
        </Show>

        <h3
          class={[
            "m-0 font-display text-heading font-semibold tracking-tight leading-snug text-pretty break-words",
            isTakenByOther() ? "text-ink-muted" : "text-ink",
          ]}
        >
          <Show
            when={props.item.url}
            fallback={<span>{props.item.title}</span>}
          >
            {(href) => (
              <a
                href={href()}
                target="_blank"
                rel="noopener noreferrer"
                class="group/link no-underline text-inherit rounded-xs transition-colors duration-150 ease-atelier hover:text-accent"
              >
                <span>{props.item.title}</span>
                <ExternalLinkIcon
                  size={14}
                  class="inline-block ms-1.5 align-text-top opacity-52 transition duration-150 ease-atelier group-hover/link:opacity-100 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                />
                <span class="sr-only"> (nouvel onglet)</span>
              </a>
            )}
          </Show>
        </h3>

        <Show when={props.item.note}>
          {(note) => (
            <MarkdownNote
              value={note()}
              class="m-0 text-body text-ink-secondary leading-normal max-w-note"
            />
          )}
        </Show>

        <Show when={showClaimInfo()}>
          <div
            class={[
              "mt-0.5 px-3 py-2 border-l-3 bg-claim-slip rounded-r-xs flex flex-col gap-1",
              isMine()
                ? "border-l-accent"
                : isGroupOnly()
                  ? "border-l-group"
                  : "border-l-line-strong",
            ]}
          >
            <p class="m-0 text-sm text-ink-muted">
              {isGroup() ? "Participent\u00A0: " : "Réservé par "}
              <strong class="text-ink font-semibold">{participantsLabel()}</strong>
            </p>
            <Show when={notesFromGuests().length > 0}>
              <div class="flex flex-col gap-1">
                {notesFromGuests().map((n) => (
                  <p class="m-0 text-sm text-ink-secondary leading-snug italic">
                    <span class="not-italic font-semibold text-ink">{n.who}&nbsp;:</span> «&nbsp;{n.text}&nbsp;»
                  </p>
                ))}
              </div>
            </Show>
          </div>
        </Show>

        <Show when={dates()}>
          <p
            class="inline-flex items-center gap-1.5 mt-auto mb-0 pt-1 text-sm text-ink-muted"
            title={fullDates()}
          >
            <ClockIcon size={13} />
            <span>{dates()}</span>
          </p>
        </Show>
      </div>

      <Show when={props.item.priceHint || !props.owner}>
        <div
          class={[
            "flex items-center justify-between gap-2.5",
            isList()
              ? "col-span-full sm:col-span-1 sm:col-start-3 sm:self-stretch sm:flex-col sm:items-end sm:min-w-36 sm:text-right"
              : "flex-wrap pt-3.5 px-5 pb-4.5 border-t border-line-subtle",
          ]}
        >
          <Show when={props.item.priceHint}>
            {(price) => (
              <span class="font-display text-heading font-semibold tracking-tight leading-tight text-ink tabular-nums whitespace-nowrap">
                {price()}
              </span>
            )}
          </Show>

          <Show when={!props.owner}>
            <div
              class={[
                "flex items-center justify-end flex-wrap gap-2 ms-auto",
                { "sm:flex-col sm:items-end sm:gap-1.5": isList() },
              ]}
            >
              <Show when={!isReserved()}>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={props.busy}
                  onClick={() => props.onReserve(props.item, "solo")}
                >
                  <GiftIcon size={14} class="shrink-0" />
                  <span>Réserver</span>
                </Button>
              </Show>

              <Show when={isGroup() && !myClaimEntry()}>
                <Button
                  variant="group"
                  size="sm"
                  disabled={props.busy}
                  onClick={() => props.onReserve(props.item, "group")}
                >
                  <UsersIcon size={14} class="shrink-0" />
                  <span>Participer</span>
                </Button>
              </Show>

              <Show when={myClaimEntry()}>
                {(mine) => (
                  <Button
                    variant="secondary"
                    size="sm"
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
                  </Button>
                )}
              </Show>

              <Show when={otherClaims().length > 0}>
                <Button
                  variant="subtle"
                  size="sm"
                  disabled={props.busy}
                  onClick={() => props.onRequestRelease(props.item, otherClaims())}
                >
                  {/* Only promise "available" when releasing really frees the item */}
                  {props.claims.length === 1 && !myClaimEntry()
                    ? "Rendre disponible"
                    : "Gérer les participants"}
                </Button>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </li>
  );
}
