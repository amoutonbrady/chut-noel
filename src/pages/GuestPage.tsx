import {
  createEffect,
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
  GuestWishlistView,
  OwnerWishlistView,
  PublicGuestClaim,
  SavedGuestClaimToken,
  WishlistItem,
} from "../shared/types";
import {
  ApiError,
  createGuestClaim,
  deleteGuestClaim,
  fetchGuestList,
  findOwnedListBySlug,
  getGuestClaimTokens,
  removeGuestClaimToken,
  saveGuestClaimToken,
} from "../lib/api";
import { buildOwnerPath, RouterContext } from "../lib/router";
import {
  playAntiSpoilAlarm,
  playBell,
  playClick,
} from "../lib/sound";
import { triggerConfetti } from "../components/EasterEggs";
import { GiftCard } from "../components/GiftCard";
import { ModalDialog } from "../components/ModalDialog";
import { ProceduralMascot } from "../components/ProceduralGiftArt";
import { ToastContext } from "../components/ToastHost";

export interface GuestPageProps {
  slug: string;
  onListLoaded: (list: OwnerWishlistView) => void;
}

type GuestFilter = "all" | "free" | "taken";

interface GuestWorkspaceProps {
  slug: string;
  data: GuestWishlistView;
  onSyncList: (list: OwnerWishlistView) => void;
  onRefresh: () => void;
}

function GuestWorkspace(props: GuestWorkspaceProps) {
  const toast = useContext(ToastContext);

  const [filter, setFilter] = createSignal<GuestFilter>("all");
  const [myTokens, setMyTokens] = createSignal<SavedGuestClaimToken[]>(() =>
    getGuestClaimTokens(props.slug),
  );

  createEffect(
    () => props.data.list,
    (list) => {
      props.onSyncList(list);
    },
  );

  const items = createMemo(() => props.data.list.items);
  const claimsByItem = createMemo(() => props.data.claimsByItem);

  const coveredCount = createMemo(() => {
    const map = claimsByItem();
    return items().filter((item) => (map[item.id]?.length ?? 0) > 0).length;
  });

  const freeCount = createMemo(() => items().length - coveredCount());

  const coveragePercent = createMemo(() => {
    const total = items().length;
    if (total === 0) return 0;
    return Math.round((coveredCount() / total) * 100);
  });

  const filteredItems = createMemo(() => {
    const mode = filter();
    const map = claimsByItem();
    if (mode === "all") return items();
    if (mode === "free") {
      return items().filter((item) => (map[item.id]?.length ?? 0) === 0);
    }
    return items().filter((item) => (map[item.id]?.length ?? 0) > 0);
  });

  // --- Claim modal ---
  const [claimItem, setClaimItem] = createSignal<WishlistItem | null>(null);
  const [claimMode, setClaimMode] = createSignal<ClaimMode>("solo");
  const [guestName, setGuestName] = createSignal("");
  const [guestMessage, setGuestMessage] = createSignal("");
  const [submittingClaim, setSubmittingClaim] = createSignal(false);
  const [claimError, setClaimError] = createSignal<string | null>(null);

  const guestNameId = createUniqueId();
  const guestNameHintId = createUniqueId();
  const guestMsgId = createUniqueId();
  const guestMsgHintId = createUniqueId();

  const existingClaimsForModal = createMemo(() => {
    const target = claimItem();
    if (!target) return [];
    return claimsByItem()[target.id] ?? [];
  });

  const isGroupLocked = createMemo(() =>
    existingClaimsForModal().some((c) => c.mode === "group"),
  );

  const openClaimModal = (item: WishlistItem) => {
    const existing = claimsByItem()[item.id] ?? [];
    const hasGroup = existing.some((c) => c.mode === "group");
    setClaimItem(item);
    setClaimMode(hasGroup ? "group" : "solo");
    setGuestMessage("");
    setClaimError(null);
  };

  const handleSubmitClaim = async (e: SubmitEvent) => {
    e.preventDefault();
    const target = claimItem();
    if (!target) return;

    const finalMode: ClaimMode = isGroupLocked() ? "group" : claimMode();
    setSubmittingClaim(true);
    setClaimError(null);

    try {
      const response = await createGuestClaim(props.slug, {
        itemId: target.id,
        mode: finalMode,
        guestName: guestName().trim() || undefined,
        message: guestMessage().trim() || undefined,
      });

      saveGuestClaimToken(props.slug, {
        claimId: response.claim.id,
        itemId: target.id,
        cancelToken: response.cancelToken,
        mode: response.claim.mode,
        guestName: response.claim.guestName,
      });
      setMyTokens(getGuestClaimTokens(props.slug));

      setClaimItem(null);
      playBell();
      triggerConfetti();
      props.onRefresh();
      toast.push({
        message:
          finalMode === "group"
            ? `Tu as rejoint le cadeau groupé « ${target.title} » ! 🤝`
            : `Chut ! « ${target.title} » est réservé pour toi 🎁`,
        tone: "success",
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setClaimError(err.message);
        props.onRefresh();
      } else {
        setClaimError(
          err instanceof ApiError
            ? err.message
            : "Impossible de valider cette réservation. Réessaie !",
        );
      }
    } finally {
      setSubmittingClaim(false);
    }
  };

  // --- Release claim (1-click if owned token, else force-release modal) ---
  const [forceReleaseTarget, setForceReleaseTarget] = createSignal<{
    item: WishlistItem;
    claim: PublicGuestClaim;
  } | null>(null);
  const [releasingBusy, setReleasingBusy] = createSignal(false);

  const handleReleaseRequest = async (
    item: WishlistItem,
    claim: PublicGuestClaim,
    ownedToken?: SavedGuestClaimToken,
  ) => {
    if (!ownedToken) {
      setForceReleaseTarget({ item, claim });
      return;
    }

    try {
      await deleteGuestClaim(props.slug, claim.id, {
        cancelToken: ownedToken.cancelToken,
      });
      removeGuestClaimToken(props.slug, claim.id);
      setMyTokens(getGuestClaimTokens(props.slug));
      playClick();
      props.onRefresh();
      toast.push({
        message: `Réservation libérée pour « ${item.title} » !`,
        tone: "info",
      });
    } catch (err) {
      toast.push({
        message:
          err instanceof ApiError
            ? err.message
            : "Impossible de libérer cette réservation.",
        tone: "warning",
      });
    }
  };

  const handleConfirmForceRelease = async () => {
    const target = forceReleaseTarget();
    if (!target) return;
    setReleasingBusy(true);
    try {
      await deleteGuestClaim(props.slug, target.claim.id, { force: true });
      removeGuestClaimToken(props.slug, target.claim.id);
      setMyTokens(getGuestClaimTokens(props.slug));
      setForceReleaseTarget(null);
      playClick();
      props.onRefresh();
      toast.push({
        message: `« ${target.item.title} » a été libéré pour les autres lutins.`,
        tone: "info",
      });
    } catch (err) {
      toast.push({
        message:
          err instanceof ApiError
            ? err.message
            : "Impossible de libérer ce cadeau.",
        tone: "warning",
      });
    } finally {
      setReleasingBusy(false);
    }
  };

  return (
    <div class="page-stack">
      <section class="workshop-header">
        <div class="guest-banner" role="status">
          <ProceduralMascot
            theme={props.data.list.theme}
            seed={props.data.list.seed}
            mode="peeking"
            size={76}
          />
          <div>
            <strong>
              🤫 Chut ! Mode Lutins — Ne montre pas cet écran à{" "}
              {props.data.list.ownerName}
            </strong>
            <p class="text-muted">
              Réserve un cadeau seul(e) ou en groupe : {props.data.list.ownerName}{" "}
              ne verra jamais tes choix !
            </p>
          </div>
        </div>

        <div class="workshop-header-main">
          <div>
            <h1 class="workshop-title">{props.data.list.title}</h1>
            <Show when={props.data.list.subtitle}>
              {(sub) => <p class="workshop-subtitle">{sub()}</p>}
            </Show>
          </div>
        </div>

        <div class="guest-stats">
          <div class="remix-row">
            <span>
              <strong>{coveredCount()}</strong>{" "}
              {coveredCount() > 1
                ? "cadeaux pris ou en groupe"
                : "cadeau pris ou en groupe"}{" "}
              sur <strong>{items().length}</strong>
            </span>
            <span class="badge">{coveragePercent()} %</span>
          </div>
          <div
            class="progress-bar"
            role="progressbar"
            aria-valuenow={coveredCount()}
            aria-valuemin={0}
            aria-valuemax={items().length}
            aria-label="Progression des cadeaux réservés"
          >
            <div
              class="progress-fill"
              style={{ width: `${coveragePercent()}%` }}
            />
          </div>
        </div>

        <div class="filter-bar">
          <div class="form-actions" role="group" aria-label="Filtrer les cadeaux">
            <button
              type="button"
              class={["chip", { "chip--active": filter() === "all" }]}
              aria-pressed={filter() === "all" ? "true" : "false"}
              onClick={() => {
                playClick();
                setFilter("all");
              }}
            >
              Tous ({items().length})
            </button>
            <button
              type="button"
              class={["chip", { "chip--active": filter() === "free" }]}
              aria-pressed={filter() === "free" ? "true" : "false"}
              onClick={() => {
                playClick();
                setFilter("free");
              }}
            >
              Encore libres ({freeCount()})
            </button>
            <button
              type="button"
              class={["chip", { "chip--active": filter() === "taken" }]}
              aria-pressed={filter() === "taken" ? "true" : "false"}
              onClick={() => {
                playClick();
                setFilter("taken");
              }}
            >
              Déjà pris ({coveredCount()})
            </button>
          </div>
        </div>
      </section>

      <Show
        when={filteredItems().length > 0}
        fallback={
          <section class="empty-state">
            <span class="empty-state-icon" aria-hidden="true">
              {items().length === 0 ? "🎅" : "✨"}
            </span>
            <h2>
              {items().length === 0
                ? `${props.data.list.ownerName} n'a pas encore rempli sa liste !`
                : filter() === "free"
                  ? "Tous les cadeaux ont déjà trouvé un lutin !"
                  : "Aucun cadeau réservé pour l'instant."}
            </h2>
            <p class="text-muted">
              {items().length === 0
                ? "Reviens un peu plus tard, les idées arrivent bientôt."
                : filter() === "free"
                  ? "Tu peux quand même rejoindre un cadeau groupé en affichant tous les souhaits."
                  : "Sois le premier lutin à réserver une surprise !"}
            </p>
            <Show when={items().length > 0 && filter() !== "all"}>
              <button
                type="button"
                class="btn btn-secondary"
                onClick={() => setFilter("all")}
              >
                Afficher tous les cadeaux
              </button>
            </Show>
          </section>
        }
      >
        <div class="gift-grid">
          <For each={filteredItems()} keyed={(item) => item.id}>
            {(item) => (
              <GiftCard
                mode="guest"
                item={item()}
                theme={props.data.list.theme}
                claims={claimsByItem()[item().id] ?? []}
                myClaimTokens={myTokens()}
                onOpenClaim={openClaimModal}
                onReleaseClaim={(it, cl, tok) =>
                  void handleReleaseRequest(it, cl, tok)
                }
              />
            )}
          </For>
        </div>
      </Show>

      {/* Modal: Réserver ce cadeau */}
      <ModalDialog
        open={Boolean(claimItem())}
        title={
          isGroupLocked() ? "Rejoindre ce cadeau groupé" : "Réserver ce cadeau"
        }
        subtitle={claimItem()?.title}
        onClose={() => setClaimItem(null)}
      >
        <form class="form-stack" onSubmit={handleSubmitClaim}>
          <fieldset
            class="field"
            style={{ border: "0", padding: "0", margin: "0" }}
          >
            <legend class="field-label">Comment veux-tu participer ?</legend>
            <Show when={isGroupLocked()}>
              <p class="field-hint">
                Un cadeau groupé est déjà ouvert sur ce souhait : tu rejoins l'équipe des lutins !
              </p>
            </Show>

            <div class="choice-cards">
              <button
                type="button"
                class={[
                  "choice-card",
                  {
                    "choice-card--selected":
                      !isGroupLocked() && claimMode() === "solo",
                  },
                ]}
                disabled={isGroupLocked()}
                aria-pressed={
                  !isGroupLocked() && claimMode() === "solo" ? "true" : "false"
                }
                onClick={() => {
                  playClick();
                  setClaimMode("solo");
                }}
              >
                <strong>🎁 Je le prends seul(e)</strong>
                <span class="text-muted">
                  Le cadeau sera réservé rien que pour toi.
                </span>
              </button>

              <button
                type="button"
                class={[
                  "choice-card",
                  {
                    "choice-card--selected":
                      isGroupLocked() || claimMode() === "group",
                  },
                ]}
                aria-pressed={
                  isGroupLocked() || claimMode() === "group" ? "true" : "false"
                }
                onClick={() => {
                  playClick();
                  setClaimMode("group");
                }}
              >
                <strong>🤝 On s'y met à plusieurs</strong>
                <span class="text-muted">
                  Cadeau groupé : d'autres proches pourront te rejoindre !
                </span>
              </button>
            </div>
          </fieldset>

          <div class="field">
            <label for={guestNameId} class="field-label">
              Ton prénom ou surnom (optionnel)
            </label>
            <p id={guestNameHintId} class="field-hint">
              Visible uniquement entre proches, jamais par {props.data.list.ownerName}. Par défaut : « Un lutin mystère ».
            </p>
            <input
              id={guestNameId}
              type="text"
              maxlength={60}
              placeholder="Ex : Tonton Marc"
              class="field-input"
              value={guestName()}
              aria-invalid="false"
              aria-describedby={guestNameHintId}
              onInput={(e) => setGuestName(e.currentTarget.value)}
            />
          </div>

          <div class="field">
            <label for={guestMsgId} class="field-label">
              Petit mot pour les autres lutins (optionnel)
            </label>
            <p id={guestMsgHintId} class="field-hint">
              Pratique pour s'organiser (ex : « Je l'achète ce week-end ! »).
            </p>
            <input
              id={guestMsgId}
              type="text"
              maxlength={180}
              placeholder="Ex : Je l'achète ce week-end !"
              class="field-input"
              value={guestMessage()}
              aria-invalid="false"
              aria-describedby={guestMsgHintId}
              onInput={(e) => setGuestMessage(e.currentTarget.value)}
            />
          </div>

          <Show when={claimError()}>
            {(err) => (
              <p class="field-error" data-visible="true" role="alert">
                {err()}
              </p>
            )}
          </Show>

          <div class="form-actions" style={{ "justify-content": "flex-end" }}>
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => setClaimItem(null)}
            >
              Annuler
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              disabled={submittingClaim()}
            >
              {submittingClaim()
                ? "Validation…"
                : isGroupLocked() || claimMode() === "group"
                  ? "Rejoindre le groupe 🤝"
                  : "Confirmer ma réservation 🎁"}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal: Forcer la libération (autre appareil) */}
      <ModalDialog
        open={Boolean(forceReleaseTarget())}
        title="Forcer la libération ?"
        size="sm"
        onClose={() => setForceReleaseTarget(null)}
      >
        <p>
          Ce cadeau a été réservé par{" "}
          <strong>{forceReleaseTarget()?.claim.guestName ?? "un lutin"}</strong>{" "}
          depuis un autre appareil. Veux-tu vraiment libérer{" "}
          <strong>« {forceReleaseTarget()?.item.title ?? ""} »</strong> ?
        </p>
        <div class="form-actions" style={{ "justify-content": "flex-end" }}>
          <button
            type="button"
            class="btn btn-secondary"
            autofocus
            onClick={() => setForceReleaseTarget(null)}
          >
            Garder la réservation
          </button>
          <button
            type="button"
            class="btn btn-danger"
            disabled={releasingBusy()}
            onClick={() => void handleConfirmForceRelease()}
          >
            {releasingBusy() ? "Libération…" : "Forcer la libération"}
          </button>
        </div>
      </ModalDialog>
    </div>
  );
}

interface GuestLoaderProps {
  slug: string;
  onListLoaded: (list: OwnerWishlistView) => void;
}

function GuestLoader(props: GuestLoaderProps) {
  const router = useContext(RouterContext);
  const guestDataMemo = createMemo(() => fetchGuestList(props.slug));

  return (
    <Errored
      fallback={(err, reset) => (
        <section class="error-state" role="alert">
          <span class="empty-state-icon" aria-hidden="true">
            🧭
          </span>
          <h1>Liste introuvable dans la neige !</h1>
          <p class="text-muted">
            {err() instanceof ApiError
              ? (err() as ApiError).message
              : "Impossible de charger cette liste de Noël pour le moment."}
          </p>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onClick={reset}>
              Réessayer
            </button>
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => router.navigate("/")}
            >
              Créer ma propre liste ✨
            </button>
          </div>
        </section>
      )}
    >
      <Loading
        on={props.slug}
        fallback={
          <section class="loading-state" aria-live="polite">
            <div class="loading-spinner" aria-hidden="true" />
            <h1>Accès au QG secret des lutins…</h1>
            <p class="text-muted">
              On vérifie qui a déjà réservé quoi sans faire de bruit !
            </p>
          </section>
        }
      >
        <GuestWorkspace
          slug={props.slug}
          data={guestDataMemo()}
          onSyncList={(list) => props.onListLoaded(list)}
          onRefresh={() => refresh(guestDataMemo)}
        />
      </Loading>
    </Errored>
  );
}

export function GuestPage(props: GuestPageProps) {
  const router = useContext(RouterContext);

  const ownedRecord = createMemo(() => findOwnedListBySlug(props.slug));
  const [bypassStep, setBypassStep] = createSignal<0 | 1 | 2>(() => {
    void props.slug;
    return 0 as 0 | 1 | 2;
  });

  const isShielded = createMemo(
    () => Boolean(ownedRecord()) && bypassStep() < 2,
  );

  createEffect(
    () => isShielded(),
    (shielded) => {
      if (shielded) {
        playAntiSpoilAlarm();
      }
    },
  );

  return (
    <Show
      when={!isShielded()}
      fallback={
        <Show when={ownedRecord()}>
          {(rec) => (
            <section
              class="anti-spoil-shield"
              aria-labelledby="anti-spoil-shield-title"
            >
              <div class="anti-spoil-shield-card">
                <ProceduralMascot
                  theme={rec().theme}
                  seed={2512}
                  mode="blindfolded"
                  size={140}
                />

                <span class="badge badge-price">
                  🚨 Alerte Bouclier Anti-Spoil
                </span>
                <h1 id="anti-spoil-shield-title">
                  Halte-là, {rec().ownerName} ! Ferme vite les yeux !
                </h1>
                <p class="text-muted">
                  Ce navigateur a créé la liste{" "}
                  <strong>« {rec().title} »</strong>. Si tu entres sur la page
                  des proches, tu verras qui t'offre quoi… et la magie de Noël
                  partira en fumée !
                </p>

                <div class="anti-spoil-shield-actions">
                  <button
                    type="button"
                    class="btn btn-primary btn-lg"
                    onClick={() => {
                      playBell();
                      router.navigate(buildOwnerPath(rec().ownerToken));
                    }}
                  >
                    Retourner à mon atelier (sans me spoiler)
                  </button>

                  <Show
                    when={bypassStep() === 0}
                    fallback={
                      <div class="anti-spoil-confirm-box" role="alert">
                        <p>
                          <strong>Dernière chance !</strong> Tu prêtes vraiment
                          cet appareil à un proche ? Les réservations secrètes
                          vont apparaître tout de suite.
                        </p>
                        <div
                          class="form-actions"
                          style={{ "justify-content": "center" }}
                        >
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            onClick={() => {
                              playClick();
                              router.navigate(buildOwnerPath(rec().ownerToken));
                            }}
                          >
                            Oups, ramène-moi à mon atelier !
                          </button>
                          <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            onClick={() => {
                              playClick();
                              setBypassStep(2);
                            }}
                          >
                            Je ne suis vraiment pas le créateur, montrer les
                            réservations
                          </button>
                        </div>
                      </div>
                    }
                  >
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      onClick={() => {
                        playClick();
                        setBypassStep(1);
                      }}
                    >
                      Je prête mon appareil à un proche…
                    </button>
                  </Show>
                </div>
              </div>
            </section>
          )}
        </Show>
      }
    >
      <GuestLoader
        slug={props.slug}
        onListLoaded={(list) => props.onListLoaded(list)}
      />
    </Show>
  );
}
