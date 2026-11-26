import {
  createMemo,
  createSignal,
  createUniqueId,
  Errored,
  For,
  Loading,
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
  fetchWishlist,
  getOwnerToken,
  getSavedClaimTokens,
  removeClaimToken,
  saveClaimToken,
} from "../lib/api";
import type { SavedClaimToken } from "../lib/api";
import { RouterContext } from "../lib/router";
import { AlertIcon, GiftIcon, ShieldIcon, UsersIcon } from "../components/Icons";
import { ModalDialog } from "../components/ModalDialog";
import { ToastContext } from "../components/ToastHost";
import { WishCard } from "../components/WishCard";

type FilterMode = "all" | "available" | "reserved";

interface WishlistContentProps {
  data: WishlistPublicResponse;
  onRefresh: () => void;
}

function WishlistContent(props: WishlistContentProps) {
  const toast = useContext(ToastContext);

  const [filter, setFilter] = createSignal<FilterMode>("all");
  const [myTokens, setMyTokens] = createSignal<SavedClaimToken[]>(
    getSavedClaimTokens(),
  );
  const [justReservedId, setJustReservedId] = createSignal<string | null>(null);
  const [busyItemId, setBusyItemId] = createSignal<string | null>(null);

  // Reserve / participate modal state
  const [reserveTarget, setReserveTarget] = createSignal<WishItem | null>(null);
  const [reserveMode, setReserveMode] = createSignal<ClaimMode>("solo");
  const [guestName, setGuestName] = createSignal("");
  const [guestMessage, setGuestMessage] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [formError, setFormError] = createSignal<string | null>(null);

  // Force-release confirm modal state
  const [releaseTarget, setReleaseTarget] = createSignal<{
    item: WishItem;
    claims: PublicClaim[];
  } | null>(null);
  const [releasingId, setReleasingId] = createSignal<string | null>(null);
  const [releaseError, setReleaseError] = createSignal<string | null>(null);

  const nameInputId = createUniqueId();
  const msgInputId = createUniqueId();

  const items = createMemo(() => props.data.items);
  const claimsByItem = createMemo(() => props.data.claimsByItem);

  const reservedCount = createMemo(
    () =>
      items().filter((item) => (claimsByItem()[item.id]?.length ?? 0) > 0)
        .length,
  );
  const availableCount = createMemo(() => items().length - reservedCount());

  const filteredItems = createMemo(() => {
    const current = filter();
    const map = claimsByItem();
    if (current === "all") return items();
    if (current === "available") {
      return items().filter((item) => (map[item.id]?.length ?? 0) === 0);
    }
    return items().filter((item) => (map[item.id]?.length ?? 0) > 0);
  });

  const targetExistingClaims = createMemo(() => {
    const target = reserveTarget();
    if (!target) return [];
    return claimsByItem()[target.id] ?? [];
  });

  const targetIsGroup = createMemo(() =>
    targetExistingClaims().some((c) => c.mode === "group"),
  );

  const openReserveModal = (item: WishItem, mode: ClaimMode) => {
    const existing = claimsByItem()[item.id] ?? [];
    const lockedGroup = existing.some((c) => c.mode === "group");
    setReserveTarget(item);
    setReserveMode(lockedGroup ? "group" : mode);
    setGuestName("");
    setGuestMessage("");
    setFormError(null);
  };

  const closeReserveModal = () => {
    if (submitting()) return;
    setReserveTarget(null);
    setFormError(null);
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
      setReserveTarget(null);
      props.onRefresh();
      toast.show(
        mode === "group"
          ? "Participation enregistrée."
          : "Envie réservée — Alexandre n'en saura rien.",
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.status === 409) {
          props.onRefresh();
        }
      } else {
        setFormError("Impossible d'enregistrer la réservation pour le moment.");
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
      toast.show("Réservation annulée.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        removeClaimToken(claim.id);
        setMyTokens(getSavedClaimTokens());
        props.onRefresh();
        toast.show("Cette réservation avait déjà été libérée.", "info");
      } else {
        toast.show(
          err instanceof ApiError
            ? err.message
            : "Impossible d'annuler la réservation.",
          "error",
        );
      }
    } finally {
      setBusyItemId(null);
    }
  };

  const handleForceRelease = async (claimId: string) => {
    if (releasingId()) return;
    setReleasingId(claimId);
    setReleaseError(null);
    try {
      await deleteClaim(claimId, { force: true });
      removeClaimToken(claimId);
      setMyTokens(getSavedClaimTokens());
      setReleaseTarget(null);
      props.onRefresh();
      toast.show("Réservation libérée.");
    } catch (err) {
      setReleaseError(
        err instanceof ApiError
          ? err.message
          : "Impossible de libérer cette réservation.",
      );
    } finally {
      setReleasingId(null);
    }
  };

  return (
    <div class="wishlist-view">
      <section class="hero reveal-soft">
        <h1 class="hero-title">Liste d'envies</h1>
        <p class="hero-subtitle">
          Des idées pour toute l'année — réservez librement, Alexandre ne voit
          pas qui offre quoi.
        </p>
      </section>

      <Show when={items().length > 0}>
        <div class="toolbar reveal-soft">
          <div
            class="segmented"
            role="group"
            aria-label="Filtrer les envies"
          >
            <button
              type="button"
              class={["segmented-btn", { "is-active": filter() === "all" }]}
              aria-pressed={filter() === "all" ? "true" : "false"}
              onClick={() => setFilter("all")}
            >
              <span>Toutes</span>
              <span class="segmented-count">{items().length}</span>
            </button>
            <button
              type="button"
              class={[
                "segmented-btn",
                { "is-active": filter() === "available" },
              ]}
              aria-pressed={filter() === "available" ? "true" : "false"}
              onClick={() => setFilter("available")}
            >
              <span>Disponibles</span>
              <span class="segmented-count">{availableCount()}</span>
            </button>
            <button
              type="button"
              class={[
                "segmented-btn",
                { "is-active": filter() === "reserved" },
              ]}
              aria-pressed={filter() === "reserved" ? "true" : "false"}
              onClick={() => setFilter("reserved")}
            >
              <span>Réservées</span>
              <span class="segmented-count">{reservedCount()}</span>
            </button>
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
            <h2 class="empty-title">
              {items().length === 0
                ? "La liste est encore vide"
                : filter() === "available"
                  ? "Toutes les envies sont réservées"
                  : "Aucune envie réservée pour le moment"}
            </h2>
            <p class="empty-desc">
              {items().length === 0
                ? "Alexandre n'a pas encore ajouté d'idées. Revenez bientôt !"
                : filter() === "available"
                  ? "Vous pouvez afficher toutes les envies pour rejoindre une idée à plusieurs."
                  : "Choisissez une idée dans la liste pour la réserver en toute discrétion."}
            </p>
            <Show when={items().length > 0 && filter() !== "all"}>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick={() => setFilter("all")}
              >
                Voir toutes les envies
              </button>
            </Show>
          </section>
        }
      >
        <section class="wish-grid reveal-soft" aria-label="Liste des envies">
          <For each={filteredItems()}>
            {(item) => (
              <WishCard
                item={item}
                claims={claimsByItem()[item.id] ?? []}
                myTokens={myTokens().filter((t) => t.itemId === item.id)}
                justReserved={justReservedId() === item.id}
                busy={busyItemId() === item.id}
                onReserve={openReserveModal}
                onCancelMine={(it, claim, token) =>
                  void handleCancelMine(it, claim, token)
                }
                onRequestRelease={(it, claims) => {
                  setReleaseError(null);
                  setReleaseTarget({ item: it, claims });
                }}
              />
            )}
          </For>
        </section>
      </Show>

      {/* Reserve / Participate Modal */}
      <ModalDialog
        open={Boolean(reserveTarget())}
        title={
          targetIsGroup()
            ? "Participer à plusieurs"
            : "Réserver cette envie"
        }
        subtitle={reserveTarget()?.title}
        onClose={closeReserveModal}
      >
        <Show when={reserveTarget()}>
          <form class="stack" onSubmit={(e) => void handleSubmitClaim(e)}>
            <Show
              when={targetIsGroup()}
              fallback={
                <fieldset class="field-group">
                  <legend class="field-label">Mode de réservation</legend>
                  <div class="mode-grid">
                    <button
                      type="button"
                      class={[
                        "mode-option",
                        { "is-selected": reserveMode() === "solo" },
                      ]}
                      aria-pressed={reserveMode() === "solo" ? "true" : "false"}
                      onClick={() => setReserveMode("solo")}
                    >
                      <span class="mode-option-title">En solo</span>
                      <span class="mode-option-desc">
                        Je m'en occupe seul·e, l'idée est marquée réservée.
                      </span>
                    </button>
                    <button
                      type="button"
                      class={[
                        "mode-option",
                        { "is-selected": reserveMode() === "group" },
                      ]}
                      aria-pressed={
                        reserveMode() === "group" ? "true" : "false"
                      }
                      onClick={() => setReserveMode("group")}
                    >
                      <span class="mode-option-title">À plusieurs</span>
                      <span class="mode-option-desc">
                        D'autres proches pourront se joindre à moi.
                      </span>
                    </button>
                  </div>
                </fieldset>
              }
            >
              <div class="info-banner">
                <UsersIcon size={16} />
                <div>
                  <p class="info-banner-title">Déjà engagé à plusieurs</p>
                  <p class="info-banner-text">
                    Participants actuels :{" "}
                    <strong>
                      {targetExistingClaims()
                        .map((c) => c.guestName?.trim() || "Un proche")
                        .join(", ")}
                    </strong>
                  </p>
                </div>
              </div>
            </Show>

            <div class="field">
              <label class="field-label" for={nameInputId}>
                Prénom <span class="field-optional">(facultatif)</span>
              </label>
              <input
                id={nameInputId}
                type="text"
                class="input"
                maxlength={60}
                autocomplete="given-name"
                placeholder="Ex. Camille"
                autofocus
                value={guestName()}
                onInput={(e) => setGuestName(e.currentTarget.value)}
              />
              <span class="field-hint">
                Visible uniquement par les autres proches, jamais par Alexandre.
              </span>
            </div>

            <div class="field">
              <label class="field-label" for={msgInputId}>
                Petit mot <span class="field-optional">(facultatif)</span>
              </label>
              <textarea
                id={msgInputId}
                class="textarea"
                rows={2}
                maxlength={240}
                placeholder="Ex. Je passe commande cette semaine, écrivez-moi si vous voulez participer !"
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
                onClick={closeReserveModal}
              >
                Annuler
              </button>
              <button
                type="submit"
                class="btn btn-primary"
                disabled={submitting()}
              >
                {submitting()
                  ? "Enregistrement…"
                  : targetIsGroup() || reserveMode() === "group"
                    ? "Confirmer ma participation"
                    : "Confirmer la réservation"}
              </button>
            </div>
          </form>
        </Show>
      </ModalDialog>

      {/* Force-release Confirm Modal */}
      <ModalDialog
        open={Boolean(releaseTarget())}
        title="Libérer cette réservation ?"
        subtitle={releaseTarget()?.item.title}
        size="sm"
        onClose={() => {
          if (!releasingId()) setReleaseTarget(null);
        }}
      >
        <Show when={releaseTarget()}>
          {(target) => (
            <div class="stack">
              <p class="modal-copy">
                Utile si tu as réservé depuis un autre appareil ou si la
                personne a changé d'avis. L'envie redeviendra disponible.
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
                      onClick={() => setReleaseTarget(null)}
                    >
                      Garder
                    </button>
                    <button
                      type="button"
                      class="btn btn-danger"
                      disabled={Boolean(releasingId())}
                      onClick={() =>
                        void handleForceRelease(target().claims[0].id)
                      }
                    >
                      {releasingId() ? "Libération…" : "Libérer l'envie"}
                    </button>
                  </div>
                }
              >
                <div class="release-list">
                  <For each={target().claims}>
                    {(claim) => (
                      <div class="release-row">
                        <span class="release-who">
                          {claim.guestName?.trim() || "Un proche"}
                        </span>
                        <button
                          type="button"
                          class="btn btn-danger btn-sm"
                          disabled={Boolean(releasingId())}
                          onClick={() => void handleForceRelease(claim.id)}
                        >
                          {releasingId() === claim.id
                            ? "Libération…"
                            : "Libérer"}
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
                    onClick={() => setReleaseTarget(null)}
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

function WishlistLoader() {
  const dataMemo = createMemo(() => fetchWishlist());

  return (
    <Errored
      fallback={(err, reset) => (
        <section class="empty-card" role="alert">
          <span class="empty-icon empty-icon--error" aria-hidden="true">
            <AlertIcon size={22} />
          </span>
          <h2 class="empty-title">Impossible de charger la liste</h2>
          <p class="empty-desc">
            {err() instanceof ApiError
              ? (err() as ApiError).message
              : "Une erreur réseau est survenue. Réessayez dans un instant."}
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
      <Loading
        on="wishlist"
        fallback={
          <div class="skeleton-wrap" aria-busy="true" aria-label="Chargement">
            <div class="skeleton-hero" />
            <div class="wish-grid">
              <div class="skeleton-card" />
              <div class="skeleton-card" />
            </div>
          </div>
        }
      >
        <WishlistContent
          data={dataMemo()}
          onRefresh={() => refresh(dataMemo)}
        />
      </Loading>
    </Errored>
  );
}

export function WishlistPage() {
  const router = useContext(RouterContext);
  const [hasOwnerSession] = createSignal(Boolean(getOwnerToken()));
  const [bypassGuard, setBypassGuard] = createSignal(false);

  return (
    <Show
      when={!hasOwnerSession() || bypassGuard()}
      fallback={
        <section
          class="guard-card reveal-soft"
          aria-labelledby="anti-spoil-heading"
        >
          <div class="guard-icon" aria-hidden="true">
            <ShieldIcon size={22} />
          </div>
          <h1 id="anti-spoil-heading" class="guard-title">
            Tu es connecté en mode gestion
          </h1>
          <p class="guard-desc">
            Ouvre l'espace gestion pour ajouter ou modifier tes envies sans voir
            les réservations, ou continue vers la liste publique.
          </p>
          <div class="guard-actions">
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => router.navigate("/admin")}
            >
              Ouvrir /admin
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => setBypassGuard(true)}
            >
              Continuer vers la liste publique
            </button>
          </div>
        </section>
      }
    >
      <WishlistLoader />
    </Show>
  );
}
