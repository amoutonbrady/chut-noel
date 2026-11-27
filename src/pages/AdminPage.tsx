import {
  createSignal,
  createUniqueId,
  For,
  onSettled,
  Show,
  useContext,
} from "solid-js";
import type { CreateItemInput, WishItem } from "../shared/types";
import {
  ApiError,
  clearOwnerToken,
  copyToClipboard,
  createAdminItem,
  deleteAdminItem,
  extractDomain,
  fetchAdminItems,
  getOwnerToken,
  isHttpUrl,
  scrapeUrl,
  setOwnerToken,
  updateAdminItem,
} from "../lib/api";
import { bookmarkletHref, readAddParam } from "../lib/bookmarklet";
import {
  AlertIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  GiftIcon,
  LockIcon,
  LogOutIcon,
  PencilIcon,
  PlusIcon,
  RibbonBowIcon,
  SparkleLinkIcon,
  TrashIcon,
} from "../components/Icons";
import { ModalDialog } from "../components/ModalDialog";
import { ToastContext } from "../components/ToastHost";
import {
  titleHue,
  titleInitial,
  titlePattern,
} from "../components/WishCard";

// `?proche` marks the guest's device so they skip the "who are you?" gate
const PUBLIC_SHARE_URL = "https://wish.amoutonbrady.dev/?proche";

interface ItemDraft {
  title: string;
  url: string;
  priceHint: string;
  siteName: string;
  imageUrl: string;
  note: string;
}

const emptyDraft = (): ItemDraft => ({
  title: "",
  url: "",
  priceHint: "",
  siteName: "",
  imageUrl: "",
  note: "",
});

const draftFromItem = (item: WishItem): ItemDraft => ({
  title: item.title,
  url: item.url ?? "",
  priceHint: item.priceHint ?? "",
  siteName: item.siteName ?? "",
  imageUrl: item.imageUrl ?? "",
  note: item.note ?? "",
});

const toItemInput = (draft: ItemDraft): CreateItemInput => ({
  title: draft.title.trim(),
  url: draft.url.trim() || undefined,
  priceHint: draft.priceHint.trim() || undefined,
  siteName: draft.siteName.trim() || undefined,
  imageUrl: draft.imageUrl.trim() || undefined,
  note: draft.note.trim() || undefined,
});

const validateDraft = (draft: ItemDraft): string | null => {
  if (!draft.title.trim()) return "Donne un titre à ton envie.";
  if (draft.url.trim() && !isHttpUrl(draft.url)) {
    return "Le lien doit commencer par http:// ou https://.";
  }
  if (draft.imageUrl.trim() && !isHttpUrl(draft.imageUrl)) {
    return "L'adresse de l'image doit commencer par http:// ou https://.";
  }
  return null;
};

// Send empty strings on PATCH so cleared optional fields are removed server-side
const toUpdateInput = (draft: ItemDraft): CreateItemInput => ({
  title: draft.title.trim(),
  url: draft.url.trim(),
  priceHint: draft.priceHint.trim(),
  siteName: draft.siteName.trim(),
  imageUrl: draft.imageUrl.trim(),
  note: draft.note.trim(),
});

export function AdminPage() {
  const toast = useContext(ToastContext);

  const [token, setToken] = createSignal<string | null>(null);
  const [items, setItems] = createSignal<WishItem[]>([]);
  const [checkingSession, setCheckingSession] = createSignal(
    Boolean(getOwnerToken()),
  );
  const [copiedShare, setCopiedShare] = createSignal(false);
  let copyTimer: number | undefined;

  // Login form
  const [passwordInput, setPasswordInput] = createSignal("");
  const [loginBusy, setLoginBusy] = createSignal(false);
  const [loginError, setLoginError] = createSignal<string | null>(null);

  // Create form, prefilled by the bookmarklet (`/admin?add=<json>`)
  const added = readAddParam(window.location.search);
  if (added) window.history.replaceState(null, "", "/admin");
  const [draft, setDraft] = createSignal<ItemDraft>({ ...emptyDraft(), ...added });
  const [previewImgFailed, setPreviewImgFailed] = createSignal(false);
  const [scraping, setScraping] = createSignal(false);
  const [scrapeNotice, setScrapeNotice] = createSignal<string | null>(null);
  const [scrapeOk, setScrapeOk] = createSignal(false);
  const [createBusy, setCreateBusy] = createSignal(false);
  const [createError, setCreateError] = createSignal<string | null>(null);

  // Edit dialog (`open` kept apart from the target so content survives the fade-out)
  const [editOpen, setEditOpen] = createSignal(false);
  const [editTarget, setEditTarget] = createSignal<WishItem | null>(null);
  const [editDraft, setEditDraft] = createSignal<ItemDraft>(emptyDraft());
  const [editBusy, setEditBusy] = createSignal(false);
  const [editError, setEditError] = createSignal<string | null>(null);

  // Delete confirm dialog
  const [deleteOpen, setDeleteOpen] = createSignal(false);
  const [deleteTarget, setDeleteTarget] = createSignal<WishItem | null>(null);
  const [deleteBusy, setDeleteBusy] = createSignal(false);
  const [deleteError, setDeleteError] = createSignal<string | null>(null);

  const pwdId = createUniqueId();
  const urlId = createUniqueId();
  const titleId = createUniqueId();
  const priceId = createUniqueId();
  const imageId = createUniqueId();
  const noteId = createUniqueId();
  const editTitleId = createUniqueId();
  const editUrlId = createUniqueId();
  const editPriceId = createUniqueId();
  const editImageId = createUniqueId();
  const editNoteId = createUniqueId();

  // Verify existing localStorage token on mount (strictly via /api/admin/items)
  onSettled(() => {
    const saved = getOwnerToken();
    if (!saved) {
      setCheckingSession(false);
      return;
    }
    let active = true;
    void fetchAdminItems(saved)
      .then((res) => {
        if (!active) return;
        setToken(saved);
        setItems(res.items);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          clearOwnerToken();
          setLoginError("Ta session a expiré. Entre à nouveau ta clé d'accès.");
        } else {
          setLoginError(
            err instanceof ApiError
              ? err.message
              : "L'espace gestion ne répond pas. Vérifie ta connexion et réessaie.",
          );
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
      window.clearTimeout(copyTimer);
    };
  });

  const handleLogin = async (e: SubmitEvent) => {
    e.preventDefault();
    const candidate = passwordInput().trim();
    if (!candidate || loginBusy()) return;

    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await fetchAdminItems(candidate);
      setOwnerToken(candidate);
      setToken(candidate);
      setItems(res.items);
      setPasswordInput("");
      toast.show("Connecté. Tu peux modifier ta liste.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setLoginError("Cette clé n'est pas la bonne. Vérifie-la et réessaie.");
      } else {
        setLoginError(
          err instanceof ApiError
            ? err.message
            : "Connexion impossible pour le moment. Réessaie dans un instant.",
        );
      }
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = () => {
    clearOwnerToken();
    setToken(null);
    setItems([]);
    setPasswordInput("");
    setLoginError(null);
    toast.show("Tu es déconnecté.", "info");
  };

  const handleCopyShareUrl = async () => {
    const ok = await copyToClipboard(PUBLIC_SHARE_URL);
    if (ok) {
      setCopiedShare(true);
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => setCopiedShare(false), 2200);
      toast.show("Lien copié. Envoie-le à tes proches.");
    } else {
      toast.show(
        `Copie impossible. Partage cette adresse\u00A0: ${PUBLIC_SHARE_URL}`,
        "error",
      );
    }
  };

  const updateDraftField = <K extends keyof ItemDraft>(
    key: K,
    value: ItemDraft[K],
  ) => {
    if (key === "imageUrl") setPreviewImgFailed(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const updateEditField = <K extends keyof ItemDraft>(
    key: K,
    value: ItemDraft[K],
  ) => {
    setEditDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleScrape = async () => {
    const currentToken = token();
    const rawUrl = draft().url.trim();
    if (!currentToken || scraping()) return;
    if (!isHttpUrl(rawUrl)) {
      setScrapeOk(false);
      setScrapeNotice("Colle d'abord un lien complet, qui commence par https://");
      return;
    }

    setScraping(true);
    setScrapeNotice(null);
    setScrapeOk(false);
    setCreateError(null);

    try {
      const meta = await scrapeUrl(currentToken, rawUrl);
      const foundAny = Boolean(
        meta.title || meta.imageUrl || meta.priceHint || meta.note,
      );
      setPreviewImgFailed(false);
      setDraft((prev) => ({
        ...prev,
        url: meta.url || prev.url,
        title: prev.title.trim() || meta.title || "",
        imageUrl: prev.imageUrl.trim() || meta.imageUrl || "",
        priceHint: prev.priceHint.trim() || meta.priceHint || "",
        siteName: meta.siteName || prev.siteName,
        note: prev.note.trim() || meta.note || "",
      }));
      setScrapeOk(foundAny);
      setScrapeNotice(
        foundAny
          ? "Infos récupérées. Vérifie-les avant d'ajouter."
          : "Ce site bloque la lecture automatique. Écris simplement le titre, ou utilise le bouton «\u00A0Ma liste\u00A0» ci-dessus.",
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleLogout();
        setLoginError("Ta session a expiré. Entre à nouveau ta clé d'accès.");
        return;
      }
      setScrapeNotice(
        err instanceof ApiError
          ? err.message
          : "Lecture automatique indisponible pour ce lien. Remplis le titre à la main.",
      );
    } finally {
      setScraping(false);
    }
  };

  const handleCreateItem = async (e: SubmitEvent) => {
    e.preventDefault();
    const currentToken = token();
    if (!currentToken || createBusy()) return;

    const current = draft();
    const invalid = validateDraft(current);
    if (invalid) {
      setCreateError(invalid);
      return;
    }

    setCreateBusy(true);
    setCreateError(null);
    try {
      const { item } = await createAdminItem(currentToken, toItemInput(current));
      setItems((prev) => [...prev, item]);
      setDraft(emptyDraft());
      setPreviewImgFailed(false);
      setScrapeNotice(null);
      toast.show("Envie ajoutée. Tes proches la voient déjà.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleLogout();
        setLoginError("Ta session a expiré. Entre à nouveau ta clé d'accès.");
        return;
      }
      setCreateError(
        err instanceof ApiError
          ? err.message
          : "L'envie n'a pas pu être ajoutée. Réessaie dans un instant.",
      );
    } finally {
      setCreateBusy(false);
    }
  };

  const openEditModal = (item: WishItem) => {
    setEditTarget(item);
    setEditDraft(draftFromItem(item));
    setEditError(null);
    setEditOpen(true);
  };

  const handleSaveEdit = async (e: SubmitEvent) => {
    e.preventDefault();
    const currentToken = token();
    const target = editTarget();
    if (!currentToken || !target || editBusy()) return;

    const current = editDraft();
    const invalid = validateDraft(current);
    if (invalid) {
      setEditError(invalid);
      return;
    }

    setEditBusy(true);
    setEditError(null);
    try {
      const { item } = await updateAdminItem(
        currentToken,
        target.id,
        toUpdateInput(current),
      );
      setItems((prev) => prev.map((it) => (it.id === item.id ? item : it)));
      setEditOpen(false);
      toast.show("Modifications enregistrées.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setEditOpen(false);
        handleLogout();
        setLoginError("Ta session a expiré. Entre à nouveau ta clé d'accès.");
        return;
      }
      setEditError(
        err instanceof ApiError
          ? err.message
          : "Les modifications n'ont pas pu être enregistrées. Réessaie dans un instant.",
      );
    } finally {
      setEditBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    const currentToken = token();
    const target = deleteTarget();
    if (!currentToken || !target || deleteBusy()) return;

    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteAdminItem(currentToken, target.id);
      setItems((prev) => prev.filter((it) => it.id !== target.id));
      setDeleteOpen(false);
      toast.show("Envie supprimée.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setDeleteOpen(false);
        handleLogout();
        setLoginError("Ta session a expiré. Entre à nouveau ta clé d'accès.");
        return;
      }
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "L'envie n'a pas pu être supprimée. Réessaie dans un instant.",
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  const previewTitle = () => draft().title.trim() || "Nouvelle envie";
  const previewDomain = () =>
    draft().siteName.trim() || extractDomain(draft().url.trim());
  const previewImageOk = () =>
    Boolean(draft().imageUrl.trim()) &&
    isHttpUrl(draft().imageUrl.trim()) &&
    !previewImgFailed();

  return (
    <Show
      when={!checkingSession()}
      fallback={
        <div class="skeleton-wrap" aria-busy="true" aria-label="Chargement">
          <div class="skeleton-hero" />
          <div class="skeleton-card" />
        </div>
      }
    >
      <Show
        when={token()}
        fallback={
          <section class="auth-stage reveal-soft" aria-labelledby="admin-auth-title">
            <div class="auth-seal" aria-hidden="true">
              <LockIcon size={22} />
            </div>
            <h1 id="admin-auth-title" class="gate-title">
              Espace gestion
            </h1>
            <p class="gate-desc">
              Entre ta clé d'accès pour modifier ta liste. Les réservations
              restent cachées ici aussi.
            </p>

            <form class="stack auth-form" onSubmit={(e) => void handleLogin(e)}>
              <div class="field">
                <label class="field-label" for={pwdId}>
                  Clé d'accès
                </label>
                <input
                  id={pwdId}
                  type="password"
                  class="input"
                  autocomplete="current-password"
                  autofocus
                  required
                  value={passwordInput()}
                  onInput={(e) => setPasswordInput(e.currentTarget.value)}
                />
              </div>

              <Show when={loginError()}>
                {(err) => (
                  <div class="form-alert" role="alert">
                    <AlertIcon size={15} />
                    <span>{err()}</span>
                  </div>
                )}
              </Show>

              <button
                type="submit"
                class="btn btn-primary"
                disabled={loginBusy() || !passwordInput().trim()}
                aria-busy={loginBusy() ? "true" : undefined}
              >
                {loginBusy() ? "Vérification…" : "Se connecter"}
              </button>
            </form>
          </section>
        }
      >
        <div class="admin-view reveal-soft">
          <section class="masthead">
            <div class="masthead-copy">
              <h1 class="hero-title">Gérer mes envies</h1>
              <p class="hero-subtitle">
                Ajoute, modifie ou retire tes idées. Les réservations de tes
                proches n'apparaissent jamais ici.
              </p>
            </div>

            <div class="admin-toolbar-actions">
              <button
                type="button"
                class={["btn btn-secondary btn-sm", { "is-copied": copiedShare() }]}
                onClick={() => void handleCopyShareUrl()}
              >
                <Show when={copiedShare()} fallback={<CopyIcon size={14} />}>
                  <CheckIcon size={14} class="check-draw" />
                </Show>
                <span>
                  {copiedShare() ? "Lien copié" : "Copier le lien de partage"}
                </span>
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onClick={handleLogout}
              >
                <LogOutIcon size={14} />
                <span>Se déconnecter</span>
              </button>
            </div>
          </section>

          <section class="panel" aria-labelledby="add-wish-heading">
            <div class="panel-head">
              <h2 id="add-wish-heading" class="panel-title">
                Ajouter une envie
              </h2>
            </div>

            <div class="callout">
              <div>
                <p class="callout-title">Ajoute depuis n'importe quel site</p>
                <p class="callout-text">
                  Glisse ce bouton dans ta barre de favoris. Sur une page
                  produit, clique dessus&nbsp;: ce formulaire se remplit tout seul.
                </p>
              </div>
              {/* Must stay a draggable javascript: link, not a button */}
              <a
                class="btn btn-secondary btn-sm bookmarklet"
                href={bookmarkletHref(window.location.origin)}
                title="Glisse ce bouton dans ta barre de favoris"
                onClick={(e) => {
                  e.preventDefault();
                  toast.show(
                    "Glisse ce bouton vers ta barre de favoris plutôt que de cliquer dessus.",
                    "info",
                  );
                }}
              >
                <RibbonBowIcon size={14} />
                <span>Ma liste</span>
              </a>
            </div>

            <div class="composer-grid">
              <form class="stack" onSubmit={(e) => void handleCreateItem(e)}>
                <div class="field">
                  <label class="field-label" for={urlId}>
                    Lien du produit <span class="field-optional">(facultatif)</span>
                  </label>
                  <div class="input-with-action">
                    <input
                      id={urlId}
                      type="url"
                      class="input"
                      inputmode="url"
                      placeholder="https://…"
                      value={draft().url}
                      onInput={(e) => {
                        updateDraftField("url", e.currentTarget.value);
                        if (scrapeNotice()) setScrapeNotice(null);
                      }}
                    />
                    <button
                      type="button"
                      class="btn btn-secondary"
                      disabled={scraping() || !draft().url.trim()}
                      aria-busy={scraping() ? "true" : undefined}
                      title="Récupérer le titre, le prix et l'image depuis le lien"
                      onClick={() => void handleScrape()}
                    >
                      <SparkleLinkIcon size={14} />
                      <span>{scraping() ? "Lecture…" : "Remplir"}</span>
                    </button>
                  </div>
                  <Show when={scrapeNotice()}>
                    {(notice) => (
                      <span
                        class={["field-hint", { "field-hint--success": scrapeOk() }]}
                        role="status"
                      >
                        {notice()}
                      </span>
                    )}
                  </Show>
                </div>

                <div class="form-row">
                  <div class="field">
                    <label class="field-label" for={titleId}>
                      Titre
                    </label>
                    <input
                      id={titleId}
                      type="text"
                      class="input"
                      required
                      maxlength={140}
                      placeholder="Ex. Bouilloire col de cygne Fellow"
                      value={draft().title}
                      onInput={(e) =>
                        updateDraftField("title", e.currentTarget.value)
                      }
                    />
                  </div>

                  <div class="field">
                    <label class="field-label" for={priceId}>
                      Prix <span class="field-optional">(facultatif)</span>
                    </label>
                    <input
                      id={priceId}
                      type="text"
                      class="input"
                      maxlength={40}
                      placeholder="Ex. 120 €"
                      value={draft().priceHint}
                      onInput={(e) =>
                        updateDraftField("priceHint", e.currentTarget.value)
                      }
                    />
                  </div>
                </div>

                <div class="field">
                  <label class="field-label" for={noteId}>
                    Précisions <span class="field-optional">(facultatif)</span>
                  </label>
                  <textarea
                    id={noteId}
                    class="textarea"
                    rows={2}
                    maxlength={320}
                    placeholder="Ex. Taille M, coloris noir mat"
                    value={draft().note}
                    onInput={(e) =>
                      updateDraftField("note", e.currentTarget.value)
                    }
                  />
                </div>

                <div class="field">
                  <label class="field-label" for={imageId}>
                    Adresse de l'image <span class="field-optional">(facultatif)</span>
                  </label>
                  <input
                    id={imageId}
                    type="url"
                    class="input"
                    inputmode="url"
                    placeholder="https://…/photo.jpg"
                    value={draft().imageUrl}
                    onInput={(e) =>
                      updateDraftField("imageUrl", e.currentTarget.value)
                    }
                  />
                </div>

                <Show when={createError()}>
                  {(err) => (
                    <div class="form-alert" role="alert">
                      <AlertIcon size={15} />
                      <span>{err()}</span>
                    </div>
                  )}
                </Show>

                <div class="form-footer">
                  <button
                    type="submit"
                    class="btn btn-primary"
                    disabled={createBusy() || !draft().title.trim()}
                    aria-busy={createBusy() ? "true" : undefined}
                  >
                    <PlusIcon size={15} />
                    <span>{createBusy() ? "Ajout…" : "Ajouter à la liste"}</span>
                  </button>
                </div>
              </form>

              <aside class="live-preview" aria-label="Aperçu de la carte">
                <p class="live-preview-label">Aperçu pour tes proches</p>
                <div class="live-preview-card">
                  <div class="live-preview-media">
                    <Show
                      when={previewImageOk()}
                      fallback={
                        <div
                          class="wish-placeholder"
                          data-pattern={titlePattern(previewTitle())}
                          style={{ "--hue": String(titleHue(previewTitle())) }}
                          aria-hidden="true"
                        >
                          <div class="wish-tag">
                            <span class="wish-tag-bow">
                              <RibbonBowIcon size={13} />
                            </span>
                            <span class="wish-monogram">
                              {titleInitial(previewTitle())}
                            </span>
                          </div>
                        </div>
                      }
                    >
                      <img
                        src={draft().imageUrl.trim()}
                        alt=""
                        class="wish-img"
                        referrerpolicy="no-referrer"
                        onError={() => setPreviewImgFailed(true)}
                      />
                    </Show>
                  </div>
                  <div class="live-preview-body">
                    <Show when={previewDomain()}>
                      {(host) => <span class="wish-domain">{host()}</span>}
                    </Show>
                    <p
                      class={[
                        "live-preview-title",
                        { "is-placeholder": !draft().title.trim() },
                      ]}
                    >
                      {previewTitle()}
                    </p>
                    <Show when={draft().note.trim()}>
                      {(note) => <p class="live-preview-note">{note()}</p>}
                    </Show>
                    <Show when={draft().priceHint.trim()}>
                      {(price) => (
                        <p class="live-preview-price">{price()}</p>
                      )}
                    </Show>
                  </div>
                </div>
              </aside>
            </div>
          </section>

          <section class="admin-list-section" aria-labelledby="wishes-list-heading">
            <h2 id="wishes-list-heading" class="section-heading">
              <span>Dans ta liste</span>
              <span class="section-count num">({items().length})</span>
            </h2>

            <Show
              when={items().length > 0}
              fallback={
                <div class="empty-card">
                  <span class="empty-icon" aria-hidden="true">
                    <GiftIcon size={22} />
                  </span>
                  <h3 class="empty-title">Ta liste est vide</h3>
                  <p class="empty-desc">
                    Colle un lien ci-dessus, ou écris directement ta première
                    idée.
                  </p>
                </div>
              }
            >
              <ul class="admin-list">
                <For each={items()}>
                  {(item) => {
                    const domain = () =>
                      item.siteName || extractDomain(item.url);
                    return (
                      <li class="admin-item">
                        <div class="admin-item-thumb" aria-hidden="true">
                          <Show
                            when={item.imageUrl}
                            fallback={
                              <span
                                class="wish-placeholder"
                                data-pattern={titlePattern(item.title)}
                                style={{ "--hue": String(titleHue(item.title)) }}
                              >
                                <span class="admin-item-initial">
                                  {titleInitial(item.title)}
                                </span>
                              </span>
                            }
                          >
                            {(src) => (
                              <img
                                src={src()}
                                alt=""
                                referrerpolicy="no-referrer"
                                loading="lazy"
                                decoding="async"
                              />
                            )}
                          </Show>
                        </div>

                        <div class="admin-item-content">
                          <h3 class="admin-item-title">
                            <Show
                              when={item.url}
                              fallback={<span>{item.title}</span>}
                            >
                              {(href) => (
                                <a
                                  href={href()}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  class="wish-title-link"
                                >
                                  <span>{item.title}</span>
                                  <ExternalLinkIcon
                                    size={13}
                                    class="wish-ext-icon"
                                  />
                                  <span class="sr-only"> (nouvel onglet)</span>
                                </a>
                              )}
                            </Show>
                          </h3>

                          <Show when={item.priceHint || domain()}>
                            <div class="wish-meta">
                              <Show when={item.priceHint}>
                                {(price) => (
                                  <span class="admin-item-price">{price()}</span>
                                )}
                              </Show>
                              <Show when={item.priceHint && domain()}>
                                <span class="meta-sep" aria-hidden="true">·</span>
                              </Show>
                              <Show when={domain()}>
                                {(host) => (
                                  <span class="wish-domain">{host()}</span>
                                )}
                              </Show>
                            </div>
                          </Show>

                          <Show when={item.note}>
                            {(note) => <p class="admin-item-note">{note()}</p>}
                          </Show>
                        </div>

                        <div class="admin-item-actions">
                          <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            aria-label={`Modifier «\u00A0${item.title}\u00A0»`}
                            onClick={() => openEditModal(item)}
                          >
                            <PencilIcon size={14} />
                            <span>Modifier</span>
                          </button>
                          <button
                            type="button"
                            class="btn btn-ghost btn-sm btn-ghost--danger"
                            aria-label={`Supprimer «\u00A0${item.title}\u00A0»`}
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(item);
                              setDeleteOpen(true);
                            }}
                          >
                            <TrashIcon size={14} />
                            <span>Supprimer</span>
                          </button>
                        </div>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
          </section>

          {/* Edit dialog */}
          <ModalDialog
            open={editOpen()}
            dismissible={!editBusy()}
            title="Modifier l'envie"
            subtitle={editTarget()?.title}
            onClose={() => setEditOpen(false)}
          >
            <Show when={editTarget()}>
              <form class="stack" onSubmit={(e) => void handleSaveEdit(e)}>
                <div class="field">
                  <label class="field-label" for={editTitleId}>
                    Titre
                  </label>
                  <input
                    id={editTitleId}
                    type="text"
                    class="input"
                    required
                    maxlength={140}
                    autofocus
                    value={editDraft().title}
                    onInput={(e) =>
                      updateEditField("title", e.currentTarget.value)
                    }
                  />
                </div>

                <div class="form-row">
                  <div class="field">
                    <label class="field-label" for={editUrlId}>
                      Lien du produit
                    </label>
                    <input
                      id={editUrlId}
                      type="url"
                      class="input"
                      inputmode="url"
                      placeholder="https://…"
                      value={editDraft().url}
                      onInput={(e) =>
                        updateEditField("url", e.currentTarget.value)
                      }
                    />
                  </div>
                  <div class="field">
                    <label class="field-label" for={editPriceId}>
                      Prix
                    </label>
                    <input
                      id={editPriceId}
                      type="text"
                      class="input"
                      maxlength={40}
                      value={editDraft().priceHint}
                      onInput={(e) =>
                        updateEditField("priceHint", e.currentTarget.value)
                      }
                    />
                  </div>
                </div>

                <div class="field">
                  <label class="field-label" for={editNoteId}>
                    Précisions
                  </label>
                  <textarea
                    id={editNoteId}
                    class="textarea"
                    rows={3}
                    maxlength={320}
                    value={editDraft().note}
                    onInput={(e) =>
                      updateEditField("note", e.currentTarget.value)
                    }
                  />
                </div>

                <div class="field">
                  <label class="field-label" for={editImageId}>
                    Adresse de l'image
                  </label>
                  <input
                    id={editImageId}
                    type="url"
                    class="input"
                    inputmode="url"
                    placeholder="https://…"
                    value={editDraft().imageUrl}
                    onInput={(e) =>
                      updateEditField("imageUrl", e.currentTarget.value)
                    }
                  />
                </div>

                <Show when={editError()}>
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
                    disabled={editBusy()}
                    onClick={() => setEditOpen(false)}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    class="btn btn-primary"
                    disabled={editBusy() || !editDraft().title.trim()}
                    aria-busy={editBusy() ? "true" : undefined}
                  >
                    {editBusy() ? "Enregistrement…" : "Enregistrer"}
                  </button>
                </div>
              </form>
            </Show>
          </ModalDialog>

          {/* Delete confirm dialog */}
          <ModalDialog
            open={deleteOpen()}
            dismissible={!deleteBusy()}
            title="Supprimer cette envie\u00A0?"
            subtitle={deleteTarget()?.title}
            size="sm"
            onClose={() => setDeleteOpen(false)}
          >
            <Show when={deleteTarget()}>
              <div class="stack">
                <p class="modal-copy">
                  Elle disparaîtra de la liste de tes proches. Tu ne pourras pas
                  la récupérer.
                </p>

                <Show when={deleteError()}>
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
                    autofocus
                    disabled={deleteBusy()}
                    onClick={() => setDeleteOpen(false)}
                  >
                    Garder
                  </button>
                  <button
                    type="button"
                    class="btn btn-danger"
                    disabled={deleteBusy()}
                    aria-busy={deleteBusy() ? "true" : undefined}
                    onClick={() => void handleConfirmDelete()}
                  >
                    {deleteBusy() ? "Suppression…" : "Supprimer"}
                  </button>
                </div>
              </div>
            </Show>
          </ModalDialog>
        </div>
      </Show>
    </Show>
  );
}
