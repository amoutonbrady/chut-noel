import {
  createMemo,
  createSignal,
  createUniqueId,
  Errored,
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

const VIEW_MODE_KEY = "wish:view";

function loadViewMode(): ViewMode {
  try {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "list" || saved === "grid") return saved;
  } catch {
    // Ignore storage errors
  }
  return "grid";
}

function saveViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // Ignore storage errors
  }
}

/** Smoothly morph cards on Grid/List or Filter/Sort updates when View Transitions are supported. */
function runListTransition(update: () => void): void {
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
  // Avoid overlapping with the circular theme reveal
  if (root.dataset.themeTransition) {
    update();
    return;
  }
  root.dataset.listTransition = "morph";
  const transition = document.startViewTransition(update);
  void transition.finished.finally(() => {
    delete root.dataset.listTransition;
  });
}

// Unpriced items always go last when sorting by price
function sortItems(list: WishItem[], key: SortKey): WishItem[] {
  if (key === "list") return list;
  if (key === "recent") {
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const dir = key === "price-asc" ? 1 : -1;
  return [...list].sort((a, b) => {
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
    runListTransition(() => {
      setFilter("all");
      setBudget(null);
    });
  };

  const handleFilterChange = (next: AvailabilityFilter) => {
    if (next === filter()) return;
    runListTransition(() => setFilter(next));
  };

  const handleSortChange = (next: SortKey) => {
    if (next === sort()) return;
    runListTransition(() => setSort(next));
  };

  const handleViewChange = (mode: ViewMode) => {
    if (mode === viewMode()) return;
    saveViewMode(mode);
    runListTransition(() => setViewMode(mode));
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
    <div class="wishlist-view">
      <section class="masthead reveal-soft">
        <div class="masthead-copy">
          <h1 class="hero-title">Liste d'envies</h1>
          <p class="hero-subtitle">
            Réserve une idée pour éviter les doublons. Alexandre ne voit pas qui
            offre quoi.
          </p>
        </div>

        <Show when={items().length > 0}>
          <div
            class="progress-meter"
            aria-label={`${totalReservedCount()} envies réservées sur ${items().length}`}
          >
            <div class="progress-meter-head">
              <span class="progress-meter-count">
                <strong class="num">{totalReservedCount()}</strong> sur{" "}
                <span class="num">{items().length}</span> réservées
              </span>
              <span class="progress-meter-pct num">{progressPct()}%</span>
            </div>
            <div class="progress-track" aria-hidden="true">
              <div
                class="progress-fill"
                style={{ width: `${progressPct()}%` }}
              />
            </div>
          </div>
        </Show>
      </section>

      <Show when={items().length > 0}>
        <div class="toolbar reveal-soft">
          <AvailabilityToggle
            value={filter()}
            counts={{
              all: budgetItems().length,
              available: availableCount(),
              reserved: reservedCount(),
            }}
            onChange={handleFilterChange}
          />
          <div class="toolbar-filters">
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
          <section class="empty-card reveal-soft">
            <span class="empty-icon" aria-hidden="true">
              <GiftIcon size={22} />
            </span>
            <h2 class="empty-title">{emptyCopy().title}</h2>
            <p class="empty-desc">{emptyCopy().desc}</p>
            <Show when={items().length > 0 && filtersActive()}>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick={resetFilters}
              >
                Voir toutes les envies
              </button>
            </Show>
          </section>
        }
      >
        <ul
          class={[
            "wish-collection",
            viewMode() === "list"
              ? "wish-collection--list"
              : "wish-collection--grid",
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
          <form class="stack" onSubmit={(e) => void handleSubmitClaim(e)}>
            <Show
              when={targetIsGroup()}
              fallback={
                <fieldset class="field-group">
                  <legend class="field-label">Comment veux-tu l'offrir&nbsp;?</legend>
                  <div class="mode-grid">
                    <label class="mode-option">
                      <input
                        type="radio"
                        name={modeName}
                        value="solo"
                        checked={reserveMode() === "solo"}
                        onChange={() => setReserveMode("solo")}
                      />
                      <span class="mode-option-title">Seul·e</span>
                      <span class="mode-option-desc">
                        Je m'en occupe. L'envie passe en «&nbsp;déjà réservé&nbsp;».
                      </span>
                    </label>
                    <label class="mode-option">
                      <input
                        type="radio"
                        name={modeName}
                        value="group"
                        checked={reserveMode() === "group"}
                        onChange={() => setReserveMode("group")}
                      />
                      <span class="mode-option-title">À plusieurs</span>
                      <span class="mode-option-desc">
                        D'autres proches pourront se joindre à toi.
                      </span>
                    </label>
                  </div>
                </fieldset>
              }
            >
              <div class="info-banner">
                <UsersIcon size={16} />
                <div>
                  <p class="info-banner-title">Cadeau groupé en cours</p>
                  <p class="info-banner-text">
                    Déjà partant·es&nbsp;:{" "}
                    <strong>{targetExistingClaims().map(guestLabel).join(", ")}</strong>
                  </p>
                </div>
              </div>
            </Show>

            <div class="field">
              <label class="field-label" for={nameInputId}>
                Ton prénom <span class="field-optional">(facultatif)</span>
              </label>
              <input
                id={nameInputId}
                type="text"
                class="input"
                maxlength={60}
                autocomplete="given-name"
                placeholder="Ex. Camille"
                autofocus={finePointer()}
                value={guestName()}
                onInput={(e) => setGuestName(e.currentTarget.value)}
              />
              <span class="field-hint">
                Seuls les autres proches le verront, jamais Alexandre.
              </span>
            </div>

            <div class="field">
              <label class="field-label" for={msgInputId}>
                Un mot pour les autres <span class="field-optional">(facultatif)</span>
              </label>
              <textarea
                id={msgInputId}
                class="textarea"
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
            </div>

            <Show when={formError()}>
              {(err) => (
                <div class="form-alert" role="alert">
                  <AlertIcon size={15} />
                  <span>{err()}</span>
                </div>
              )}
            </Show>

            <div class="modal-actions">
              <button
                type="button"
                class="btn btn-secondary"
                disabled={submitting()}
                onClick={() => setReserveOpen(false)}
              >
                Annuler
              </button>
              <button
                type="submit"
                class={["btn", groupChosen() ? "btn-group" : "btn-primary"]}
                disabled={submitting()}
                aria-busy={submitting() ? "true" : undefined}
              >
                {submitting()
                  ? "Envoi…"
                  : groupChosen()
                    ? "Participer"
                    : "Réserver"}
              </button>
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
            <div class="stack">
              <p class="modal-copy">
                Utile si tu as réservé depuis un autre appareil, ou si quelqu'un
                a changé d'avis.{" "}
                {target().claims.length > 1
                  ? "Choisis la participation à retirer."
                  : releaseFreesItem()
                    ? "Sa réservation sera supprimée."
                    : "Le cadeau groupé continue sans cette personne."}
              </p>

              <Show when={releaseError()}>
                {(err) => (
                  <div class="form-alert" role="alert">
                    <AlertIcon size={15} />
                    <span>{err()}</span>
                  </div>
                )}
              </Show>

              <Show
                when={target().claims.length > 1}
                fallback={
                  <div class="modal-actions">
                    <button
                      type="button"
                      class="btn btn-secondary"
                      autofocus
                      disabled={Boolean(releasingId())}
                      onClick={() => setReleaseOpen(false)}
                    >
                      Garder
                    </button>
                    <button
                      type="button"
                      class="btn btn-danger"
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
                    </button>
                  </div>
                }
              >
                <div class="release-list">
                  <For each={target().claims} keyed={(claim) => claim.id}>
                    {(claim) => (
                      <div class="release-row">
                        <span class="release-who">{guestLabel(claim())}</span>
                        <button
                          type="button"
                          class="btn btn-ghost btn-ghost--danger btn-sm"
                          disabled={Boolean(releasingId())}
                          aria-label={`Retirer la participation de ${guestLabel(claim())}`}
                          onClick={() => void handleForceRelease(claim().id)}
                        >
                          {releasingId() === claim().id ? "Un instant…" : "Retirer"}
                        </button>
                      </div>
                    )}
                  </For>
                </div>
                <div class="modal-actions">
                  <button
                    type="button"
                    class="btn btn-secondary"
                    autofocus
                    disabled={Boolean(releasingId())}
                    onClick={() => setReleaseOpen(false)}
                  >
                    Fermer
                  </button>
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
  <div class="skeleton-wrap" aria-busy="true" aria-label="Chargement de la liste">
    <div class="skeleton-hero" />
    <div class="skeleton-grid">
      <div class="skeleton-tile" />
      <div class="skeleton-tile" />
      <div class="skeleton-tile" />
    </div>
  </div>
);

function WishlistLoader() {
  const dataMemo = createMemo(() => fetchWishlist());

  return (
    <Errored
      fallback={(err, reset) => (
        <section class="empty-card" role="alert">
          <span class="empty-icon empty-icon--error" aria-hidden="true">
            <AlertIcon size={22} />
          </span>
          <h2 class="empty-title">La liste n'a pas pu se charger</h2>
          <p class="empty-desc">
            {err() instanceof ApiError
              ? (err() as ApiError).message
              : "Vérifie ta connexion, puis réessaie."}
          </p>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            onClick={reset}
          >
            Réessayer
          </button>
        </section>
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
        <section class="empty-card" role="alert">
          <span class="empty-icon empty-icon--error" aria-hidden="true">
            <AlertIcon size={22} />
          </span>
          <h2 class="empty-title">Ta liste n'a pas pu se charger</h2>
          <p class="empty-desc">
            {err() instanceof ApiError
              ? (err() as ApiError).message
              : "Vérifie ta connexion, puis reconnecte-toi."}
          </p>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            onClick={() => router.navigate("/admin")}
          >
            Se reconnecter
          </button>
        </section>
      )}
    >
      <Loading on="owner-items" fallback={<ListSkeleton />}>
        <div class="wishlist-view">
          <section class="masthead reveal-soft">
            <div class="masthead-copy">
              <h1 class="hero-title">Ta liste d'envies</h1>
              <p class="hero-subtitle">
                Telle que la voient tes proches, sans les réservations.
              </p>
            </div>
            <div class="masthead-actions">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                onClick={() => router.navigate("/admin")}
              >
                <PencilIcon size={14} />
                <span>Modifier ma liste</span>
              </button>
            </div>
          </section>

          <Show
            when={dataMemo().items.length > 0}
            fallback={
              <section class="empty-card reveal-soft">
                <span class="empty-icon" aria-hidden="true">
                  <GiftIcon size={22} />
                </span>
                <h2 class="empty-title">Ta liste est encore vide</h2>
                <p class="empty-desc">
                  Ajoute ta première envie&nbsp;: un lien suffit.
                </p>
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  onClick={() => router.navigate("/admin")}
                >
                  Ajouter une envie
                </button>
              </section>
            }
          >
            <ul class="wish-collection wish-collection--grid" aria-label="Mes envies">
              <For each={dataMemo().items} keyed={(item) => item.id}>
                {(item) => (
                  <WishCard
                    item={item()}
                    owner
                    layout="grid"
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
        <section class="gate-stage reveal-soft" aria-labelledby="gate-heading">
          <div class="gate-envelope" aria-hidden="true">
            <EnvelopeSealIllustration class="gate-envelope-svg" />
          </div>

          <h1 id="gate-heading" class="gate-title">
            Qui es-tu&nbsp;?
          </h1>
          <p class="gate-desc">
            Cette page montre qui offre quoi. Pour garder la surprise, Alexandre
            ne doit pas la voir.
          </p>

          <div class="gate-choices">
            <button
              type="button"
              class="gate-choice gate-choice--primary"
              onClick={() => {
                markProcheDevice();
                setIsProche(true);
              }}
            >
              <span class="gate-choice-icon" aria-hidden="true">
                <GiftIcon size={20} />
              </span>
              <span class="gate-choice-copy">
                <span class="gate-choice-title">Je suis un·e proche</span>
                <span class="gate-choice-hint">
                  Découvrir la liste et réserver en secret
                </span>
              </span>
              <ArrowRightIcon size={17} class="gate-choice-arrow" />
            </button>

            <button
              type="button"
              class="gate-choice gate-choice--owner"
              onClick={() => router.navigate("/admin")}
            >
              <span class="gate-choice-icon" aria-hidden="true">
                <LockIcon size={20} />
              </span>
              <span class="gate-choice-copy">
                <span class="gate-choice-title">Je suis Alexandre</span>
                <span class="gate-choice-hint">
                  Ouvrir l'espace gestion, sans aucun spoil
                </span>
              </span>
              <ArrowRightIcon size={17} class="gate-choice-arrow" />
            </button>
          </div>
        </section>
      }
    >
      <WishlistLoader />
    </Show>
  );
}
