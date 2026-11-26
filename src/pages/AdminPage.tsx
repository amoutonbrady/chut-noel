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
import {
  AlertIcon,
  CopyIcon,
  ExternalLinkIcon,
  GiftIcon,
  LockIcon,
  LogOutIcon,
  PencilIcon,
  PlusIcon,
  SparkleLinkIcon,
  TrashIcon,
} from "../components/Icons";
import { ModalDialog } from "../components/ModalDialog";
import { ToastContext } from "../components/ToastHost";

const PUBLIC_SHARE_URL = "https://wish.amoutonbrady.dev";

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

  // Login form
  const [passwordInput, setPasswordInput] = createSignal("");
  const [loginBusy, setLoginBusy] = createSignal(false);
  const [loginError, setLoginError] = createSignal<string | null>(null);

  // Create form
  const [draft, setDraft] = createSignal<ItemDraft>(emptyDraft());
  const [scraping, setScraping] = createSignal(false);
  const [scrapeNotice, setScrapeNotice] = createSignal<string | null>(null);
  const [createBusy, setCreateBusy] = createSignal(false);
  const [createError, setCreateError] = createSignal<string | null>(null);

  // Edit modal
  const [editTarget, setEditTarget] = createSignal<WishItem | null>(null);
  const [editDraft, setEditDraft] = createSignal<ItemDraft>(emptyDraft());
  const [editBusy, setEditBusy] = createSignal(false);
  const [editError, setEditError] = createSignal<string | null>(null);

  // Delete confirm modal
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
          setLoginError("Session expirée — saisis ta clé d'accès.");
        } else {
          setLoginError(
            err instanceof ApiError
              ? err.message
              : "Impossible de joindre l'espace gestion.",
          );
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
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
      toast.show("Connecté en mode gestion.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setLoginError("Clé d'accès invalide.");
      } else {
        setLoginError(
          err instanceof ApiError
            ? err.message
            : "Connexion impossible pour le moment.",
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
    toast.show("Déconnecté.", "info");
  };

  const handleCopyShareUrl = async () => {
    const ok = await copyToClipboard(PUBLIC_SHARE_URL);
    if (ok) {
      toast.show("Lien copié : wish.amoutonbrady.dev");
    } else {
      toast.show("Copie impossible — sélectionnez l'adresse manuellement.", "error");
    }
  };

  const updateDraftField = <K extends keyof ItemDraft>(
    key: K,
    value: ItemDraft[K],
  ) => {
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
      setScrapeNotice("Saisis d'abord un lien valide commençant par https://");
      return;
    }

    setScraping(true);
    setScrapeNotice(null);
    setCreateError(null);

    try {
      const meta = await scrapeUrl(currentToken, rawUrl);
      const foundAny = Boolean(
        meta.title || meta.imageUrl || meta.priceHint || meta.note,
      );
      setDraft((prev) => ({
        ...prev,
        url: meta.url || prev.url,
        title: prev.title.trim() || meta.title || "",
        imageUrl: prev.imageUrl.trim() || meta.imageUrl || "",
        priceHint: prev.priceHint.trim() || meta.priceHint || "",
        siteName: meta.siteName || prev.siteName,
        note: prev.note.trim() || meta.note || "",
      }));
      setScrapeNotice(
        foundAny
          ? "Informations récupérées — tu peux ajuster avant d'ajouter."
          : "Lien reconnu mais le site bloque la lecture auto : complète simplement le titre.",
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleLogout();
        setLoginError("Clé d'accès expirée.");
        return;
      }
      setScrapeNotice(
        err instanceof ApiError
          ? err.message
          : "Lecture automatique indisponible pour ce lien.",
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
    if (!current.title.trim()) {
      setCreateError("Le titre est requis.");
      return;
    }
    if (current.url.trim() && !isHttpUrl(current.url)) {
      setCreateError("Le lien doit commencer par http:// ou https://.");
      return;
    }
    if (current.imageUrl.trim() && !isHttpUrl(current.imageUrl)) {
      setCreateError("L'URL de l'image doit commencer par http:// ou https://.");
      return;
    }

    setCreateBusy(true);
    setCreateError(null);
    try {
      const { item } = await createAdminItem(currentToken, toItemInput(current));
      setItems((prev) => [...prev, item]);
      setDraft(emptyDraft());
      setScrapeNotice(null);
      toast.show("Envie ajoutée à la liste.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleLogout();
        setLoginError("Clé d'accès invalide ou expirée.");
        return;
      }
      setCreateError(
        err instanceof ApiError
          ? err.message
          : "Impossible d'ajouter cette envie.",
      );
    } finally {
      setCreateBusy(false);
    }
  };

  const openEditModal = (item: WishItem) => {
    setEditTarget(item);
    setEditDraft(draftFromItem(item));
    setEditError(null);
  };

  const handleSaveEdit = async (e: SubmitEvent) => {
    e.preventDefault();
    const currentToken = token();
    const target = editTarget();
    if (!currentToken || !target || editBusy()) return;

    const current = editDraft();
    if (!current.title.trim()) {
      setEditError("Le titre est requis.");
      return;
    }
    if (current.url.trim() && !isHttpUrl(current.url)) {
      setEditError("Le lien doit commencer par http:// ou https://.");
      return;
    }
    if (current.imageUrl.trim() && !isHttpUrl(current.imageUrl)) {
      setEditError("L'URL de l'image doit commencer par http:// ou https://.");
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
      setEditTarget(null);
      toast.show("Envie mise à jour.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setEditTarget(null);
        handleLogout();
        setLoginError("Clé d'accès invalide ou expirée.");
        return;
      }
      setEditError(
        err instanceof ApiError
          ? err.message
          : "Impossible d'enregistrer les modifications.",
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
      setDeleteTarget(null);
      toast.show("Envie supprimée.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setDeleteTarget(null);
        handleLogout();
        setLoginError("Clé d'accès invalide ou expirée.");
        return;
      }
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "Impossible de supprimer cette envie.",
      );
    } finally {
      setDeleteBusy(false);
    }
  };

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
          <section class="auth-card reveal-soft" aria-labelledby="admin-auth-title">
            <div class="guard-icon" aria-hidden="true">
              <LockIcon size={20} />
            </div>
            <h1 id="admin-auth-title" class="guard-title">
              Espace gestion
            </h1>
            <p class="guard-desc">
              Saisis ta clé d'accès pour éditer tes envies sans jamais voir les
              réservations.
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
                  placeholder="••••••••"
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
              >
                {loginBusy() ? "Vérification…" : "Se connecter"}
              </button>
            </form>
          </section>
        }
      >
        <div class="admin-view reveal-soft">
          <section class="admin-header">
            <div>
              <div class="admin-title-row">
                <h1 class="hero-title">Gérer mes envies</h1>
                <span class="badge badge--neutral">
                  {items().length}{" "}
                  {items().length > 1 ? "envies" : "envie"}
                </span>
              </div>
              <p class="hero-subtitle">
                Mode sans spoiler — les réservations des proches restent
                masquées ici.
              </p>
            </div>

            <div class="admin-toolbar-actions">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick={() => void handleCopyShareUrl()}
              >
                <CopyIcon size={14} />
                <span>Copier le lien</span>
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onClick={handleLogout}
              >
                <LogOutIcon size={14} />
                <span>Déconnexion</span>
              </button>
            </div>
          </section>

          <section class="panel" aria-labelledby="add-wish-heading">
            <h2 id="add-wish-heading" class="panel-title">
              Ajouter une envie
            </h2>

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
                    onClick={() => void handleScrape()}
                  >
                    <SparkleLinkIcon size={14} />
                    <span>{scraping() ? "Lecture…" : "Remplir"}</span>
                  </button>
                </div>
                <Show when={scrapeNotice()}>
                  {(notice) => <span class="field-hint">{notice()}</span>}
                </Show>
              </div>

              <div class="form-row">
                <div class="field">
                  <label class="field-label" for={titleId}>
                    Titre *
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

                <div class="field field--price">
                  <label class="field-label" for={priceId}>
                    Prix indicatif
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
                  Note <span class="field-optional">(taille, couleur, préférence…)</span>
                </label>
                <textarea
                  id={noteId}
                  class="textarea"
                  rows={2}
                  maxlength={320}
                  placeholder="Ex. Version noir mat, prise européenne"
                  value={draft().note}
                  onInput={(e) =>
                    updateDraftField("note", e.currentTarget.value)
                  }
                />
              </div>

              <div class="field">
                <label class="field-label" for={imageId}>
                  Image (URL) <span class="field-optional">(facultatif)</span>
                </label>
                <input
                  id={imageId}
                  type="url"
                  class="input"
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
                >
                  <PlusIcon size={15} />
                  <span>{createBusy() ? "Ajout…" : "Ajouter à la liste"}</span>
                </button>
              </div>
            </form>
          </section>

          <section class="admin-list-section" aria-labelledby="wishes-list-heading">
            <h2 id="wishes-list-heading" class="section-heading">
              Envies enregistrées
            </h2>

            <Show
              when={items().length > 0}
              fallback={
                <div class="empty-card">
                  <span class="empty-icon" aria-hidden="true">
                    <GiftIcon size={22} />
                  </span>
                  <h3 class="empty-title">Aucune envie pour le moment</h3>
                  <p class="empty-desc">
                    Colle un lien ci-dessus ou saisis directement ta première
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
                              <span class="admin-item-initial">
                                {(item.title.trim()[0] || "A").toUpperCase()}
                              </span>
                            }
                          >
                            {(src) => (
                              <img
                                src={src()}
                                alt=""
                                loading="lazy"
                                decoding="async"
                              />
                            )}
                          </Show>
                        </div>

                        <div class="admin-item-content">
                          <div class="admin-item-top">
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
                                  </a>
                                )}
                              </Show>
                            </h3>
                          </div>

                          <Show when={item.priceHint || domain()}>
                            <div class="wish-meta">
                              <Show when={item.priceHint}>
                                {(price) => (
                                  <span class="wish-price">{price()}</span>
                                )}
                              </Show>
                              <Show when={item.priceHint && domain()}>
                                <span class="meta-dot" aria-hidden="true">
                                  ·
                                </span>
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
                            aria-label={`Modifier ${item.title}`}
                            onClick={() => openEditModal(item)}
                          >
                            <PencilIcon size={14} />
                            <span>Modifier</span>
                          </button>
                          <button
                            type="button"
                            class="btn btn-ghost btn-sm btn-ghost--danger"
                            aria-label={`Supprimer ${item.title}`}
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(item);
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

          {/* Edit Modal */}
          <ModalDialog
            open={Boolean(editTarget())}
            title="Modifier l'envie"
            onClose={() => {
              if (!editBusy()) setEditTarget(null);
            }}
          >
            <Show when={editTarget()}>
              <form class="stack" onSubmit={(e) => void handleSaveEdit(e)}>
                <div class="field">
                  <label class="field-label" for={editTitleId}>
                    Titre *
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
                      Lien
                    </label>
                    <input
                      id={editUrlId}
                      type="url"
                      class="input"
                      placeholder="https://…"
                      value={editDraft().url}
                      onInput={(e) =>
                        updateEditField("url", e.currentTarget.value)
                      }
                    />
                  </div>
                  <div class="field field--price">
                    <label class="field-label" for={editPriceId}>
                      Prix indicatif
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
                  <label class="field-label" for={editImageId}>
                    Image (URL)
                  </label>
                  <input
                    id={editImageId}
                    type="url"
                    class="input"
                    placeholder="https://…"
                    value={editDraft().imageUrl}
                    onInput={(e) =>
                      updateEditField("imageUrl", e.currentTarget.value)
                    }
                  />
                </div>

                <div class="field">
                  <label class="field-label" for={editNoteId}>
                    Note
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
                    onClick={() => setEditTarget(null)}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    class="btn btn-primary"
                    disabled={editBusy() || !editDraft().title.trim()}
                  >
                    {editBusy() ? "Enregistrement…" : "Enregistrer"}
                  </button>
                </div>
              </form>
            </Show>
          </ModalDialog>

          {/* Delete Confirm Modal */}
          <ModalDialog
            open={Boolean(deleteTarget())}
            title="Supprimer cette envie ?"
            subtitle={deleteTarget()?.title}
            size="sm"
            onClose={() => {
              if (!deleteBusy()) setDeleteTarget(null);
            }}
          >
            <Show when={deleteTarget()}>
              <div class="stack">
                <p class="modal-copy">
                  Cette idée sera retirée de ta liste publique. Cette action ne
                  peut pas être annulée.
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
                    onClick={() => setDeleteTarget(null)}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    class="btn btn-danger"
                    disabled={deleteBusy()}
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
