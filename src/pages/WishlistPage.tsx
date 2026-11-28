import {
  createMemo,
  createSignal,
  createUniqueId,
  Errored,
  flush,
  For,
  Loading,
  onSettled,
  refresh,
  Show,
  useContext,
} from "solid-js";
import type {
  ClaimMode,
  PublicClaim,
  WishItem,
  WishlistPublicResponse,
} from "../shared/types";
import {
  ApiError,
  createClaim,
  deleteClaim,
  fetchAdminItems,
  fetchWishlist,
  getOwnerToken,
  getSavedClaimTokens,
  isProcheDevice,
  markProcheDevice,
  removeClaimToken,
  saveClaimToken,
} from "../lib/api";
import type { SavedClaimToken } from "../lib/api";
import { RouterContext } from "../lib/router";
import { inPriceRange, parsePrice, priceCeiling } from "../lib/price";
import type { PriceRange } from "../lib/price";
import {
  AvailabilityToggle,
  BudgetFilter,
  SortSelect,
  ViewModeToggle,
} from "../components/WishFilters";
import type {
  AvailabilityFilter,
  SortKey,
  ViewMode,
} from "../components/WishFilters";
import {
  AlertIcon,
  ArrowRightIcon,
  EnvelopeSealIllustration,
  GiftIcon,
  LockIcon,
  PencilIcon,
  UsersIcon,
} from "../components/Icons";
import { ModalDialog } from "../components/ModalDialog";
import { ToastContext } from "../components/ToastHost";
import { WishCard } from "../components/WishCard";
import { Button } from "../components/ui/Button";
import { Field, FieldHint, FieldLabel, FormAlert, Input, Textarea } from "../components/ui/Form";
import { EmptyState } from "../components/ui/Surface";

const VIEW_MODE_KEY = "wish:view";

function loadViewMode(): ViewMode {
  try {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "list" || saved === "grid") return saved;
  } catch {
    // Ignore storage errors
  }
  return "list";
}

function saveViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // Ignore storage errors
  }
}

let listTransitionSeq = 0;

/**
 * Smoothly glides cards when sorting or filtering within the same layout.
 * Solid 2 batches signal updates asynchronously, so `flush()` commits the new DOM
 * synchronously before the View Transition captures its "new" snapshot.
 */
function runReorderTransition(update: () => void): void {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (
    reduce ||
    typeof document === "undefined" ||
    typeof document.startViewTransition !== "function"
  ) {
    update();
    return;
  }
  const root = document.documentElement;
  if (root.dataset.themeTransition) {
    update();
    return;
  }
  const seq = ++listTransitionSeq;
  root.dataset.listTransition = "reorder";
  const transition = document.startViewTransition(() => {
    update();
    flush();
  });
  void transition.finished.finally(() => {
    if (listTransitionSeq === seq) {
      delete root.dataset.listTransition;
    }
  });
}

// Unpriced items always go last when sorting by price
function sortItems(list: WishItem[], key: SortKey): WishItem[] {
  if (key === "list") return list;
  if (key === "recent") {
    return list.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const dir = key === "price-asc" ? 1 : -1;
  return list.toSorted((a, b) => {
    const pa = parsePrice(a.priceHint);
    const pb = parsePrice(b.priceHint);
    if (pa === null || pb === null) return pa === pb ? 0 : pa === null ? 1 : -1;
    return (pa - pb) * dir;
  });
}

// Opening the keyboard on a phone hides half the dialog: autofocus only with a mouse
const finePointer = () =>
  typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;

const guestLabel = (claim: PublicClaim) => claim.guestName?.trim() || "Un proche";

interface WishlistContentProps {
  data: WishlistPublicResponse;
  onRefresh: () => void;
}

function WishlistContent(props: WishlistContentProps) {
  const toast = useContext(ToastContext);

  const [filter, setFilter] = createSignal<AvailabilityFilter>("all");
  const [budget, setBudget] = createSignal<PriceRange | null>(null);
  const [sort, setSort] = createSignal<SortKey>("list");
  const [viewMode, setViewMode] = createSignal<ViewMode>(loadViewMode());
  const [myTokens, setMyTokens] = createSignal<SavedClaimToken[]>(
    getSavedClaimTokens(),
  );
  const [justReservedId, setJustReservedId] = createSignal<string | null>(null);
  const [busyItemId, setBusyItemId] = createSignal<string | null>(null);
  let celebrateTimer: number | undefined;

  onSettled(() => () => {
    window.clearTimeout(celebrateTimer);
  });

  // Reserve / participate dialog. `open` is separate from the target so the
  // content stays put while the dialog fades out.
  const [reserveOpen, setReserveOpen] = createSignal(false);
  const [reserveTarget, setReserveTarget] = createSignal<WishItem | null>(null);
  const [reserveMode, setReserveMode] = createSignal<ClaimMode>("solo");
  const [guestName, setGuestName] = createSignal("");
  const [guestMessage, setGuestMessage] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [formError, setFormError] = createSignal<string | null>(null);

  // Release dialog
  const [releaseOpen, setReleaseOpen] = createSignal(false);
  const [releaseTarget, setReleaseTarget] = createSignal<{
    item: WishItem;
    claims: PublicClaim[];
  } | null>(null);
  const [releasingId, setReleasingId] = createSignal<string | null>(null);
  const [releaseError, setReleaseError] = createSignal<string | null>(null);

  const nameInputId = createUniqueId();
  const msgInputId = createUniqueId();
  const modeName = createUniqueId();

  const items = createMemo(() => props.data.items);
  const claimsByItem = createMemo(() => props.data.claimsByItem);

  const totalReservedCount = createMemo(
    () =>
      items().filter((item) => (claimsByItem()[item.id]?.length ?? 0) > 0)
        .length,
  );
  const progressPct = createMemo(() =>
    items().length > 0
      ? Math.round((totalReservedCount() / items().length) * 100)
      : 0,
  );

  const prices = createMemo(() =>
    items()
      .map((item) => parsePrice(item.priceHint))
      .filter((p): p is number => p !== null),
  );
  const ceiling = createMemo(() => priceCeiling(items().map((item) => item.priceHint)));

  // Budget narrows first, so the availability counts match what is shown
  const budgetItems = createMemo(() =>
    items().filter((item) => inPriceRange(item.priceHint, budget())),
  );

  const reservedCount = createMemo(
    () =>
      budgetItems().filter((item) => (claimsByItem()[item.id]?.length ?? 0) > 0)
        .length,
  );
  const availableCount = createMemo(() => budgetItems().length - reservedCount());

  const filteredItems = createMemo(() => {
    const current = filter();
    const map = claimsByItem();
    const list =
      current === "all"
        ? budgetItems()
        : budgetItems().filter((item) =>
            current === "available"
              ? (map[item.id]?.length ?? 0) === 0
              : (map[item.id]?.length ?? 0) > 0,
          );
    return sortItems(list, sort());
  });

  const filtersActive = () => filter() !== "all" || budget() !== null;
  const resetFilters = () => {
    runReorderTransition(() => {
      setFilter("all");
      setBudget(null);
    });
  };

  const handleFilterChange = (next: AvailabilityFilter) => {
    if (next === filter()) return;
    runReorderTransition(() => setFilter(next));
  };

  const handleSortChange = (next: SortKey) => {
    if (next === sort()) return;
    runReorderTransition(() => setSort(next));
  };

  const handleViewChange = (mode: ViewMode) => {
    if (mode === viewMode()) return;
    saveViewMode(mode);
    // Instant crisp layout switch: avoids stretching portrait cards into wide rows
    setViewMode(mode);
  };

  const targetExistingClaims = createMemo(() => {
    const target = reserveTarget();
    if (!target) return [];
    return claimsByItem()[target.id] ?? [];
  });

  // Frozen while closed, so the closing dialog does not swap its title mid-fade
  const targetIsGroup = createMemo<boolean>((prev) =>
    reserveOpen()
      ? targetExistingClaims().some((c) => c.mode === "group")
      : (prev ?? false),
  );

  const groupChosen = () => targetIsGroup() || reserveMode() === "group";

  const openReserveModal = (item: WishItem, mode: ClaimMode) => {
    const existing = claimsByItem()[item.id] ?? [];
    const lockedGroup = existing.some((c) => c.mode === "group");
    setReserveTarget(item);
    setReserveMode(lockedGroup ? "group" : mode);
    setGuestName("");
    setGuestMessage("");
    setFormError(null);
    setReserveOpen(true);
  };

  const handleSubmitClaim = async (e: SubmitEvent) => {
    e.preventDefault();
    const target = reserveTarget();
    if (!target || submitting()) return;

    const mode: ClaimMode = targetIsGroup() ? "group" : reserveMode();
    setSubmitting(true);
    setFormError(null);

    try {
      const res = await createClaim({
        itemId: target.id,
        mode,
        guestName: guestName().trim() || undefined,
        message: guestMessage().trim() || undefined,
      });

      saveClaimToken({
        claimId: res.claim.id,
        itemId: target.id,
        cancelToken: res.cancelToken,
        mode: res.claim.mode,
        guestName: res.claim.guestName,
      });
      setMyTokens(getSavedClaimTokens());
      setJustReservedId(target.id);
      window.clearTimeout(celebrateTimer);
      celebrateTimer = window.setTimeout(() => {
        setJustReservedId((current) => (current === target.id ? null : current));
      }, 1600);
      setReserveOpen(false);
      props.onRefresh();
      toast.show(
        mode === "group"
          ? "Tu participes au cadeau groupé."
          : "C'est réservé. Alexandre n'en saura rien.",
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.status === 409) {
          props.onRefresh();
        }
      } else {
        setFormError(
          "La réservation n'a pas pu être enregistrée. Vérifie ta connexion et réessaie.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelMine = async (
    item: WishItem,
    claim: PublicClaim,
    cancelToken: string,
  ) => {
    if (busyItemId()) return;
    setBusyItemId(item.id);
    try {
      await deleteClaim(claim.id, { cancelToken });
      removeClaimToken(claim.id);
      setMyTokens(getSavedClaimTokens());
      if (justReservedId() === item.id) setJustReservedId(null);
      props.onRefresh();
      toast.show(
        claim.mode === "group"
          ? "Tu ne participes plus à ce cadeau."
          : "Réservation annulée. L'envie est de nouveau disponible.",
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        removeClaimToken(claim.id);
        setMyTokens(getSavedClaimTokens());
        props.onRefresh();
        toast.show("Cette réservation avait déjà été annulée.", "info");
      } else {
        toast.show(
          err instanceof ApiError
            ? err.message
            : "L'annulation n'a pas abouti. Réessaie dans un instant.",
          "error",
        );
      }
    } finally {
      setBusyItemId(null);
    }
  };

  const handleForceRelease = async (claimId: string) => {
    if (releasingId()) return;
    const target = releaseTarget();
    setReleasingId(claimId);
    setReleaseError(null);
    try {
      await deleteClaim(claimId, { force: true });
      removeClaimToken(claimId);
      setMyTokens(getSavedClaimTokens());
      // Pre-refresh data: the item is free only if this was its last claim
      const freed = target
        ? (claimsByItem()[target.item.id]?.length ?? 0) <= 1
        : false;
      // Several participants: drop the released row and keep the dialog open
      const remaining = target?.claims.filter((c) => c.id !== claimId) ?? [];
      if (target && remaining.length > 0) {
        setReleaseTarget({ item: target.item, claims: remaining });
      } else {
        setReleaseOpen(false);
      }
      props.onRefresh();
      toast.show(
        freed ? "L'envie est de nouveau disponible." : "Participation retirée.",
      );
    } catch (err) {
      setReleaseError(
        err instanceof ApiError
          ? err.message
          : "Impossible de retirer cette réservation. Réessaie dans un instant.",
      );
    } finally {
      setReleasingId(null);
    }
  };

  // Live: true when releasing every listed claim leaves the item with none
  const releaseFreesItem = () => {
    const t = releaseTarget();
    return t ? t.claims.length >= (claimsByItem()[t.item.id]?.length ?? 0) : false;
  };

  const emptyCopy = () => {
    if (items().length === 0) {
      return {
        title: "La liste est encore vide",
        desc: "Alexandre n'a pas encore ajouté d'idées. Repasse bientôt\u00A0!",
      };
    }
    if (budgetItems().length === 0) {
      return {
        title: "Rien dans ce budget",
        desc: "Essaie une autre tranche de prix, ou affiche toute la liste.",
      };
    }
    if (filter() === "available") {
      return {
        title: "Tout est déjà réservé",
        desc: "Affiche toutes les envies pour rejoindre un cadeau groupé.",
      };
    }
    return {
      title: "Rien n'est réservé pour l'instant",
      desc: "Choisis une envie\u00A0: une fois réservée, personne d'autre ne pourra la prendre.",
    };
  };

  return (
    <div>
      <section class="reveal-soft flex items-end justify-between flex-wrap gap-x-8 gap-y-4 mb-5.5">
        <div class="min-w-0 flex-1 basis-72">
          <h1 class="m-0 font-display text-hero font-semibold tracking-tight leading-none text-ink text-balance font-soft-hero">
            Liste d'envies
          </h1>
          <p class="mt-2.5 mb-0 text-body text-ink-muted max-w-copy text-pretty">
            Réserve une idée pour éviter les doublons. Alexandre ne voit pas qui
            offre quoi.
          </p>
        </div>

        <Show when={items().length > 0}>
          <div
            class="min-w-52 flex-1 sm:flex-initial sm:w-62 flex flex-col gap-2 px-4 py-3 rounded-sm bg-card shadow-card contrast-more:border contrast-more:border-line-strong forced-colors:border forced-colors:border-canvas-text"
            aria-label={`${totalReservedCount()} envies réservées sur ${items().length}`}
          >
            <div class="flex items-baseline justify-between gap-3 text-sm text-ink-muted">
              <span>
                <strong class="tabular-nums text-ink font-semibold">
                  {totalReservedCount()}
                </strong>{" "}
                sur <span class="tabular-nums">{items().length}</span> réservées
              </span>
              <span class="font-semibold text-accent-soft-foreground tabular-nums">
                {progressPct()}%
              </span>
            </div>
            <div class="h-1.5 rounded-full bg-well overflow-hidden" aria-hidden="true">
              <div
                class="progress-gradient h-full rounded-full transition-all duration-380 ease-atelier"
                style={{ "--progress": `${progressPct()}%` }}
              />
            </div>
          </div>
        </Show>
      </section>

      <Show when={items().length > 0}>
        <div class="reveal-soft flex items-center justify-between flex-wrap gap-3 mb-5">
          <AvailabilityToggle
            value={filter()}
            counts={{
              all: budgetItems().length,
              available: availableCount(),
              reserved: reservedCount(),
            }}
            onChange={handleFilterChange}
          />
          <div class="grid grid-cols-2 w-full sm:flex sm:w-auto items-center gap-2">
            <BudgetFilter
              value={budget()}
              ceiling={ceiling()}
              prices={prices()}
              matchCount={budgetItems().length}
              unpricedCount={items().length - prices().length}
              onChange={setBudget}
            />
            <SortSelect value={sort()} onChange={handleSortChange} />
            <ViewModeToggle value={viewMode()} onChange={handleViewChange} />
          </div>
        </div>
      </Show>

      <Show
        when={filteredItems().length > 0}
        fallback={
          <EmptyState
            reveal
            icon={<GiftIcon size={22} />}
            title={emptyCopy().title}
            description={emptyCopy().desc}
            action={
              <Show when={items().length > 0 && filtersActive()}>
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Voir toutes les envies
                </Button>
              </Show>
            }
          />
        }
      >
        <ul
          class={[
            "list-none m-0 p-0",
            viewMode() === "list"
              ? "flex flex-col divide-y divide-line-subtle bg-card rounded-md shadow-card overflow-hidden contrast-more:border contrast-more:border-line-strong forced-colors:border forced-colors:border-canvas-text"
              : "grid grid-wishes gap-5 items-stretch",
          ]}
          aria-label="Envies"
        >
          {/* Keyed by id: a refresh after reserving keeps each card mounted */}
          <For each={filteredItems()} keyed={(item) => item.id}>
            {(item) => (
              <WishCard
                item={item()}
                layout={viewMode()}
                claims={claimsByItem()[item().id] ?? []}
                myTokens={myTokens().filter((t) => t.itemId === item().id)}
                justReserved={justReservedId() === item().id}
                busy={busyItemId() === item().id}
                onReserve={openReserveModal}
                onCancelMine={(it, claim, token) =>
                  void handleCancelMine(it, claim, token)
                }
                onRequestRelease={(it, claims) => {
                  setReleaseError(null);
                  setReleaseTarget({ item: it, claims });
                  setReleaseOpen(true);
                }}
              />
            )}
          </For>
        </ul>
      </Show>

      {/* Reserve / Participate dialog */}
      <ModalDialog
        open={reserveOpen()}
        dismissible={!submitting()}
        title={targetIsGroup() ? "Rejoindre le cadeau groupé" : "Réserver cette envie"}
        subtitle={reserveTarget()?.title}
        onClose={() => {
          setReserveOpen(false);
          setFormError(null);
        }}
      >
        <Show when={reserveTarget()}>
          <form class="flex flex-col gap-4" onSubmit={(e) => void handleSubmitClaim(e)}>
            <Show
              when={targetIsGroup()}
              fallback={
                <fieldset class="flex flex-col gap-2 border-0 p-0 m-0 min-w-0">
                  <legend class="mb-2 p-0 text-sm font-semibold text-ink-secondary">
                    Comment veux-tu l'offrir&nbsp;?
                  </legend>
                  <div class="grid grid-cols-1 xs:grid-cols-2 gap-2.5">
                    <label class="group relative flex items-start gap-2.5 px-3.5 py-3.5 pointer-coarse:py-4 rounded-sm border border-line bg-card cursor-pointer transition duration-150 ease-atelier hover:border-line-strong has-checked:border-accent has-checked:bg-accent-soft forced-colors:has-checked:border-2 forced-colors:has-checked:border-highlight">
                      <input
                        type="radio"
                        name={modeName}
                        value="solo"
                        class="shrink-0 mt-1 size-4 accent-accent focus-visible:outline-offset-3"
                        checked={reserveMode() === "solo"}
                        onChange={() => setReserveMode("solo")}
                      />
                      <span class="min-w-0 flex flex-col gap-0.5">
                        <span class="text-body font-semibold text-ink">
                          Seul·e
                        </span>
                        <span class="text-sm text-ink-muted leading-snug group-has-checked:text-ink-secondary">
                          Je m'en occupe. L'envie passe en «&nbsp;déjà réservé&nbsp;».
                        </span>
                      </span>
                    </label>
                    <label class="group relative flex items-start gap-2.5 px-3.5 py-3.5 pointer-coarse:py-4 rounded-sm border border-line bg-card cursor-pointer transition duration-150 ease-atelier hover:border-line-strong has-checked:border-group has-checked:bg-group-soft forced-colors:has-checked:border-2 forced-colors:has-checked:border-highlight">
                      <input
                        type="radio"
                        name={modeName}
                        value="group"
                        class="shrink-0 mt-1 size-4 accent-group focus-visible:outline-offset-3"
                        checked={reserveMode() === "group"}
                        onChange={() => setReserveMode("group")}
                      />
                      <span class="min-w-0 flex flex-col gap-0.5">
                        <span class="text-body font-semibold text-ink">
                          À plusieurs
                        </span>
                        <span class="text-sm text-ink-muted leading-snug group-has-checked:text-ink-secondary">
                          D'autres proches pourront se joindre à toi.
                        </span>
                      </span>
                    </label>
                  </div>
                </fieldset>
              }
            >
              <div class="flex items-start gap-2.5 px-4 py-3 rounded-sm bg-group-soft border border-group-border text-group-soft-foreground">
                <UsersIcon size={16} class="shrink-0 mt-0.5" />
                <div>
                  <p class="m-0 text-body font-semibold">Cadeau groupé en cours</p>
                  <p class="mt-0.5 mb-0 text-sm">
                    Déjà partant·es&nbsp;:{" "}
                    <strong>{targetExistingClaims().map(guestLabel).join(", ")}</strong>
                  </p>
                </div>
              </div>
            </Show>

            <Field>
              <FieldLabel for={nameInputId} optional="(facultatif)">
                Ton prénom
              </FieldLabel>
              <Input
                id={nameInputId}
                type="text"
                maxlength={60}
                autocomplete="given-name"
                placeholder="Ex. Camille"
                autofocus={finePointer()}
                value={guestName()}
                onInput={(e) => setGuestName(e.currentTarget.value)}
              />
              <FieldHint>
                Seuls les autres proches le verront, jamais Alexandre.
              </FieldHint>
            </Field>

            <Field>
              <FieldLabel for={msgInputId} optional="(facultatif)">
                Un mot pour les autres
              </FieldLabel>
              <Textarea
                id={msgInputId}
                rows={2}
                maxlength={240}
                placeholder={
                  groupChosen()
                    ? "Ex. Je commande dimanche, dites-moi si vous participez\u00A0!"
                    : "Ex. Je le commande cette semaine."
                }
                value={guestMessage()}
                onInput={(e) => setGuestMessage(e.currentTarget.value)}
              />
            </Field>

            <Show when={formError()}>
              {(err) => <FormAlert>{err()}</FormAlert>}
            </Show>

            <div class="flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                disabled={submitting()}
                onClick={() => setReserveOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                variant={groupChosen() ? "group" : "primary"}
                disabled={submitting()}
                aria-busy={submitting() ? "true" : undefined}
              >
                {submitting()
                  ? "Envoi…"
                  : groupChosen()
                    ? "Participer"
                    : "Réserver"}
              </Button>
            </div>
          </form>
        </Show>
      </ModalDialog>

      {/* Release dialog: free a reservation made elsewhere */}
      <ModalDialog
        open={releaseOpen()}
        dismissible={!releasingId()}
        title={
          releaseFreesItem()
            ? "Rendre cette envie disponible\u00A0?"
            : "Retirer une participation\u00A0?"
        }
        subtitle={releaseTarget()?.item.title}
        size="sm"
        onClose={() => setReleaseOpen(false)}
      >
        <Show when={releaseTarget()}>
          {(target) => (
            <div class="flex flex-col gap-4">
              <p class="m-0 text-body text-ink-secondary leading-normal">
                Utile si tu as réservé depuis un autre appareil, ou si quelqu'un
                a changé d'avis.{" "}
                {target().claims.length > 1
                  ? "Choisis la participation à retirer."
                  : releaseFreesItem()
                    ? "Sa réservation sera supprimée."
                    : "Le cadeau groupé continue sans cette personne."}
              </p>

              <Show when={releaseError()}>
                {(err) => <FormAlert>{err()}</FormAlert>}
              </Show>

              <Show
                when={target().claims.length > 1}
                fallback={
                  <div class="flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-end gap-2 pt-2">
                    <Button
                      variant="secondary"
                      autofocus
                      disabled={Boolean(releasingId())}
                      onClick={() => setReleaseOpen(false)}
                    >
                      Garder
                    </Button>
                    <Button
                      variant="danger"
                      disabled={Boolean(releasingId())}
                      aria-busy={releasingId() ? "true" : undefined}
                      onClick={() =>
                        void handleForceRelease(target().claims[0].id)
                      }
                    >
                      {releasingId()
                        ? "Un instant…"
                        : releaseFreesItem()
                          ? "Rendre disponible"
                          : "Retirer sa participation"}
                    </Button>
                  </div>
                }
              >
                <div class="flex flex-col gap-2">
                  <For each={target().claims} keyed={(claim) => claim.id}>
                    {(claim) => (
                      <div class="flex items-center justify-between gap-3 py-2 pr-2 pl-3.5 rounded-sm bg-well border border-line-subtle">
                        <span class="text-body font-medium">{guestLabel(claim())}</span>
                        <Button
                          variant="ghost-danger"
                          size="sm"
                          disabled={Boolean(releasingId())}
                          aria-label={`Retirer la participation de ${guestLabel(claim())}`}
                          onClick={() => void handleForceRelease(claim().id)}
                        >
                          {releasingId() === claim().id ? "Un instant…" : "Retirer"}
                        </Button>
                      </div>
                    )}
                  </For>
                </div>
                <div class="flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-end gap-2 pt-2">
                  <Button
                    variant="secondary"
                    autofocus
                    disabled={Boolean(releasingId())}
                    onClick={() => setReleaseOpen(false)}
                  >
                    Fermer
                  </Button>
                </div>
              </Show>
            </div>
          )}
        </Show>
      </ModalDialog>
    </div>
  );
}

const ListSkeleton = () => (
  <div class="flex flex-col gap-6" aria-busy="true" aria-label="Chargement de la liste">
    <div class="h-19 max-w-skeleton rounded-sm bg-well skeleton-pulse" />
    <div class="grid grid-wishes gap-5">
      <div class="h-85 rounded-md skeleton-tile-bg shadow-card skeleton-pulse" />
      <div class="h-85 rounded-md skeleton-tile-bg shadow-card skeleton-pulse" />
      <div class="h-85 rounded-md skeleton-tile-bg shadow-card skeleton-pulse" />
    </div>
  </div>
);

function WishlistLoader() {
  const dataMemo = createMemo(() => fetchWishlist());

  return (
    <Errored
      fallback={(err, reset) => (
        <EmptyState
          role="alert"
          tone="error"
          icon={<AlertIcon size={22} />}
          title="La liste n'a pas pu se charger"
          description={
            err() instanceof ApiError
              ? (err() as ApiError).message
              : "Vérifie ta connexion, puis réessaie."
          }
          action={
            <Button variant="secondary" size="sm" onClick={reset}>
              Réessayer
            </Button>
          }
        />
      )}
    >
      <Loading on="wishlist" fallback={<ListSkeleton />}>
        <WishlistContent
          data={dataMemo()}
          onRefresh={() => refresh(dataMemo)}
        />
      </Loading>
    </Errored>
  );
}

const noop = () => {};

/** Alexandre's view: items only, read through the admin API which never touches claims. */
function OwnerLoader(props: { token: string }) {
  const router = useContext(RouterContext);
  const dataMemo = createMemo(() => fetchAdminItems(props.token));

  return (
    <Errored
      fallback={(err) => (
        <EmptyState
          role="alert"
          tone="error"
          icon={<AlertIcon size={22} />}
          title="Ta liste n'a pas pu se charger"
          description={
            err() instanceof ApiError
              ? (err() as ApiError).message
              : "Vérifie ta connexion, puis reconnecte-toi."
          }
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.navigate("/admin")}
            >
              Se reconnecter
            </Button>
          }
        />
      )}
    >
      <Loading on="owner-items" fallback={<ListSkeleton />}>
        <div>
          <section class="reveal-soft flex items-end justify-between flex-wrap gap-x-8 gap-y-4 mb-5.5">
            <div class="min-w-0 flex-1 basis-72">
              <h1 class="m-0 font-display text-hero font-semibold tracking-tight leading-none text-ink text-balance font-soft-hero">
                Ta liste d'envies
              </h1>
              <p class="mt-2.5 mb-0 text-body text-ink-muted max-w-copy text-pretty">
                Telle que la voient tes proches, sans les réservations.
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => router.navigate("/admin")}
              >
                <PencilIcon size={14} class="shrink-0" />
                <span>Modifier ma liste</span>
              </Button>
            </div>
          </section>

          <Show
            when={dataMemo().items.length > 0}
            fallback={
              <EmptyState
                reveal
                icon={<GiftIcon size={22} />}
                title="Ta liste est encore vide"
                description={"Ajoute ta première envie\u00A0: un lien suffit."}
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => router.navigate("/admin")}
                  >
                    Ajouter une envie
                  </Button>
                }
              />
            }
          >
            <ul
              class="list-none m-0 p-0 flex flex-col divide-y divide-line-subtle bg-card rounded-md shadow-card overflow-hidden contrast-more:border contrast-more:border-line-strong forced-colors:border forced-colors:border-canvas-text"
              aria-label="Mes envies"
            >
              <For each={dataMemo().items} keyed={(item) => item.id}>
                {(item) => (
                  <WishCard
                    item={item()}
                    owner
                    layout="list"
                    claims={[]}
                    myTokens={[]}
                    onReserve={noop}
                    onCancelMine={noop}
                    onRequestRelease={noop}
                  />
                )}
              </For>
            </ul>
          </Show>
        </div>
      </Loading>
    </Errored>
  );
}

export function WishlistPage() {
  const router = useContext(RouterContext);
  // Owner session always wins: Alexandre never sees claims, even via a `?proche` link
  const ownerToken = getOwnerToken();
  if (ownerToken) {
    return <OwnerLoader token={ownerToken} />;
  }

  // The shared link carries `?proche` so guests skip the gate
  if (new URLSearchParams(window.location.search).has("proche")) {
    markProcheDevice();
  }
  const [isProche, setIsProche] = createSignal(isProcheDevice());

  return (
    <Show
      when={isProche()}
      fallback={
        <section
          class="gate-stage reveal-soft max-w-gate mt-gate mx-auto mb-8 flex flex-col items-center text-center"
          aria-labelledby="gate-heading"
        >
          <div class="mb-5" aria-hidden="true">
            <EnvelopeSealIllustration class="drop-shadow-envelope" />
          </div>

          <h1
            id="gate-heading"
            class="m-0 font-display text-hero font-semibold tracking-tight leading-tight text-balance font-soft-gate"
          >
            Qui es-tu&nbsp;?
          </h1>
          <p class="mt-3 mb-0 text-body text-ink-muted max-w-gate-desc text-pretty">
            Cette page montre qui offre quoi. Pour garder la surprise, Alexandre
            ne doit pas la voir.
          </p>

          <div class="mt-8 w-full grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <button
              type="button"
              class="gate-choice-primary group flex items-center gap-3.5 w-full px-5 py-4.5 rounded-md border border-transparent text-left cursor-pointer bg-accent text-accent-foreground shadow-gate-primary transition duration-220 ease-atelier motion-safe:hover:-translate-y-0.5 hover:bg-accent-hover motion-safe:active:scale-97 forced-colors:border-canvas-text"
              onClick={() => {
                markProcheDevice();
                setIsProche(true);
              }}
            >
              <span
                class="size-10.5 rounded-sm inline-grid place-items-center shrink-0 bg-gate-icon-primary"
                aria-hidden="true"
              >
                <GiftIcon size={20} />
              </span>
              <span class="flex-1 min-w-0 flex flex-col gap-0.5">
                <span class="font-display text-heading font-semibold tracking-tight leading-tight">
                  Je suis un·e proche
                </span>
                <span class="text-sm leading-snug opacity-90">
                  Découvrir la liste et réserver en secret
                </span>
              </span>
              <ArrowRightIcon
                size={17}
                class="shrink-0 opacity-78 transition duration-220 ease-atelier motion-safe:group-hover:translate-x-1 group-hover:opacity-100"
              />
            </button>

            <button
              type="button"
              class="group flex items-center gap-3.5 w-full px-5 py-4.5 rounded-md border border-transparent text-left cursor-pointer bg-card text-ink shadow-card transition duration-220 ease-atelier motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-card-hover motion-safe:active:scale-97 contrast-more:border-line-strong forced-colors:border-canvas-text"
              onClick={() => router.navigate("/admin")}
            >
              <span
                class="size-10.5 rounded-sm inline-grid place-items-center shrink-0 bg-well text-ink-secondary"
                aria-hidden="true"
              >
                <LockIcon size={20} />
              </span>
              <span class="flex-1 min-w-0 flex flex-col gap-0.5">
                <span class="font-display text-heading font-semibold tracking-tight leading-tight">
                  Je suis Alexandre
                </span>
                <span class="text-sm leading-snug text-ink-muted">
                  Ouvrir l'espace gestion, sans aucun spoil
                </span>
              </span>
              <ArrowRightIcon
                size={17}
                class="shrink-0 opacity-78 transition duration-220 ease-atelier motion-safe:group-hover:translate-x-1 group-hover:opacity-100"
              />
            </button>
          </div>
        </section>
      }
    >
      <WishlistLoader />
    </Show>
  );
}
