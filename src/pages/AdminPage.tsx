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
import { MarkdownNote } from "../components/MarkdownNote";
import { ModalDialog } from "../components/ModalDialog";
import { ToastContext } from "../components/ToastHost";
import {
  titleHue,
  titleInitial,
  titlePattern,
} from "../components/WishCard";
import { Button, ButtonLink } from "../components/ui/Button";
import { Field, FieldHint, FieldLabel, FormAlert, Input, Textarea } from "../components/ui/Form";
import { EmptyState, Panel } from "../components/ui/Surface";

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
        <div class="flex flex-col gap-6" aria-busy="true" aria-label="Chargement">
          <div class="h-19 max-w-skeleton rounded-sm bg-well skeleton-pulse" />
          <div class="h-75 rounded-lg bg-card shadow-card skeleton-pulse" />
        </div>
      }
    >
      <Show
        when={token()}
        fallback={
          <section
            class="reveal-soft max-w-auth mt-gate mx-auto mb-8 px-7 py-9 bg-card rounded-lg shadow-card flex flex-col items-center text-center contrast-more:border contrast-more:border-line-strong forced-colors:border forced-colors:border-canvas-text"
            aria-labelledby="admin-auth-title"
          >
            <div
              class="size-13 rounded-full inline-grid place-items-center bg-accent-soft text-accent-soft-foreground shadow-auth-seal mb-4"
              aria-hidden="true"
            >
              <LockIcon size={22} />
            </div>
            <h1
              id="admin-auth-title"
              class="m-0 font-display text-auth font-semibold tracking-tight leading-tight text-balance font-soft-gate"
            >
              Espace gestion
            </h1>
            <p class="mt-3 mb-0 text-body text-ink-muted max-w-gate-desc text-pretty">
              Entre ta clé d'accès pour modifier ta liste. Les réservations
              restent cachées ici aussi.
            </p>

            <form
              class="flex flex-col gap-4 w-full mt-5 text-left"
              onSubmit={(e) => void handleLogin(e)}
            >
              <Field>
                <FieldLabel for={pwdId}>Clé d'accès</FieldLabel>
                <Input
                  id={pwdId}
                  type="password"
                  autocomplete="current-password"
                  autofocus
                  required
                  value={passwordInput()}
                  onInput={(e) => setPasswordInput(e.currentTarget.value)}
                />
              </Field>

              <Show when={loginError()}>
                {(err) => <FormAlert>{err()}</FormAlert>}
              </Show>

              <Button
                type="submit"
                variant="primary"
                class="w-full"
                disabled={loginBusy() || !passwordInput().trim()}
                aria-busy={loginBusy() ? "true" : undefined}
              >
                {loginBusy() ? "Vérification…" : "Se connecter"}
              </Button>
            </form>
          </section>
        }
      >
        <div class="reveal-soft flex flex-col gap-8">
          <section class="flex items-end justify-between flex-wrap gap-x-8 gap-y-4">
            <div class="min-w-0 flex-1 basis-72">
              <h1 class="m-0 font-display text-hero font-semibold tracking-tight leading-none text-ink text-balance font-soft-hero">
                Gérer mes envies
              </h1>
              <p class="mt-2.5 mb-0 text-body text-ink-muted max-w-copy text-pretty">
                Ajoute, modifie ou retire tes idées. Les réservations de tes
                proches n'apparaissent jamais ici.
              </p>
            </div>

            <div class="flex items-center flex-wrap gap-2">
              <Button
                variant={copiedShare() ? "copied" : "secondary"}
                size="sm"
                onClick={() => void handleCopyShareUrl()}
              >
                <Show when={copiedShare()} fallback={<CopyIcon size={14} class="shrink-0" />}>
                  <CheckIcon size={14} class="shrink-0 check-draw" />
                </Show>
                <span>
                  {copiedShare() ? "Lien copié" : "Copier le lien de partage"}
                </span>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOutIcon size={14} class="shrink-0" />
                <span>Se déconnecter</span>
              </Button>
            </div>
          </section>

          <Panel aria-labelledby="add-wish-heading">
            <div class="mb-4">
              <h2
                id="add-wish-heading"
                class="m-0 font-display text-heading font-semibold tracking-tight"
              >
                Ajouter une envie
              </h2>
            </div>

            <div class="flex items-center justify-between gap-x-5 gap-y-3.5 flex-wrap mb-6 px-4.5 py-4 rounded-sm bg-well border border-dashed border-line-strong">
              <div>
                <p class="m-0 text-body font-semibold text-ink">
                  Ajoute depuis n'importe quel site
                </p>
                <p class="mt-1 mb-0 text-sm text-ink-muted max-w-copy">
                  Glisse ce bouton dans ta barre de favoris. Sur une page
                  produit, clique dessus&nbsp;: ce formulaire se remplit tout seul.
                </p>
              </div>
              {/* Must stay a draggable javascript: link, not a button */}
              <ButtonLink
                variant="bookmarklet"
                size="sm"
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
                <RibbonBowIcon size={14} class="shrink-0" />
                <span>Ma liste</span>
              </ButtonLink>
            </div>

            <div class="grid grid-cols-1 md:grid-composer gap-7 items-start">
              <form
                class="flex flex-col gap-4"
                onSubmit={(e) => void handleCreateItem(e)}
              >
                <Field>
                  <FieldLabel for={urlId} optional="(facultatif)">
                    Lien du produit
                  </FieldLabel>
                  <div class="flex gap-2">
                    <Input
                      id={urlId}
                      type="url"
                      class="flex-1 min-w-0"
                      inputmode="url"
                      placeholder="https://…"
                      value={draft().url}
                      onInput={(e) => {
                        updateDraftField("url", e.currentTarget.value);
                        if (scrapeNotice()) setScrapeNotice(null);
                      }}
                    />
                    <Button
                      variant="secondary"
                      disabled={scraping() || !draft().url.trim()}
                      aria-busy={scraping() ? "true" : undefined}
                      title="Récupérer le titre, le prix et l'image depuis le lien"
                      onClick={() => void handleScrape()}
                    >
                      <SparkleLinkIcon size={14} class="shrink-0" />
                      <span>{scraping() ? "Lecture…" : "Remplir"}</span>
                    </Button>
                  </div>
                  <Show when={scrapeNotice()}>
                    {(notice) => (
                      <FieldHint tone={scrapeOk() ? "success" : "default"} role="status">
                        {notice()}
                      </FieldHint>
                    )}
                  </Show>
                </Field>

                <div class="grid grid-cols-1 sm:grid-form-price gap-4">
                  <Field>
                    <FieldLabel for={titleId}>Titre</FieldLabel>
                    <Input
                      id={titleId}
                      type="text"
                      required
                      maxlength={140}
                      placeholder="Ex. Bouilloire col de cygne Fellow"
                      value={draft().title}
                      onInput={(e) =>
                        updateDraftField("title", e.currentTarget.value)
                      }
                    />
                  </Field>

                  <Field>
                    <FieldLabel for={priceId} optional="(facultatif)">
                      Prix
                    </FieldLabel>
                    <Input
                      id={priceId}
                      type="text"
                      maxlength={40}
                      placeholder="Ex. 120 €"
                      value={draft().priceHint}
                      onInput={(e) =>
                        updateDraftField("priceHint", e.currentTarget.value)
                      }
                    />
                  </Field>
                </div>

                <Field>
                  <FieldLabel
                    for={noteId}
                    optional="(facultatif, Markdown accepté)"
                  >
                    Précisions
                  </FieldLabel>
                  <Textarea
                    id={noteId}
                    rows={2}
                    maxlength={400}
                    placeholder="Ex. Taille **M**, coloris noir mat — [guide des tailles](https://…)"
                    value={draft().note}
                    onInput={(e) =>
                      updateDraftField("note", e.currentTarget.value)
                    }
                  />
                </Field>

                <Field>
                  <FieldLabel for={imageId} optional="(facultatif)">
                    Adresse de l'image
                  </FieldLabel>
                  <Input
                    id={imageId}
                    type="url"
                    inputmode="url"
                    placeholder="https://…/photo.jpg"
                    value={draft().imageUrl}
                    onInput={(e) =>
                      updateDraftField("imageUrl", e.currentTarget.value)
                    }
                  />
                </Field>

                <Show when={createError()}>
                  {(err) => <FormAlert>{err()}</FormAlert>}
                </Show>

                <div class="flex justify-end pt-1">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={createBusy() || !draft().title.trim()}
                    aria-busy={createBusy() ? "true" : undefined}
                  >
                    <PlusIcon size={15} class="shrink-0" />
                    <span>{createBusy() ? "Ajout…" : "Ajouter à la liste"}</span>
                  </Button>
                </div>
              </form>

              <aside class="flex flex-col gap-2" aria-label="Aperçu de la carte">
                <p class="m-0 text-sm font-semibold text-ink-muted">
                  Aperçu pour tes proches
                </p>
                <div class="rounded-md bg-canvas border border-line-subtle overflow-hidden">
                  <div class="aspect-video bg-well border-b border-line-subtle overflow-hidden">
                    <Show
                      when={previewImageOk()}
                      fallback={
                        <div
                          class="wish-placeholder"
                          data-pattern={titlePattern(previewTitle())}
                          style={{ "--hue": String(titleHue(previewTitle())) }}
                          aria-hidden="true"
                        >
                          <div class="relative min-w-13 min-h-13 px-3 py-1.5 rounded-sm inline-flex flex-col items-center justify-center bg-card shadow-wish-tag -rotate-4">
                            <span class="wish-placeholder-ink absolute -top-2 inline-flex">
                              <RibbonBowIcon size={13} />
                            </span>
                            <span class="wish-placeholder-ink font-display text-monogram font-semibold leading-none tracking-tight">
                              {titleInitial(previewTitle())}
                            </span>
                          </div>
                        </div>
                      }
                    >
                      <img
                        src={draft().imageUrl.trim()}
                        alt=""
                        class="w-full h-full object-contain p-2.5 bg-media"
                        referrerpolicy="no-referrer"
                        onError={() => setPreviewImgFailed(true)}
                      />
                    </Show>
                  </div>
                  <div class="p-4 flex flex-col gap-1.5">
                    <Show when={previewDomain()}>
                      {(host) => (
                        <span class="flex-auto min-w-0 truncate text-sm text-ink-muted">
                          {host()}
                        </span>
                      )}
                    </Show>
                    <p
                      class={[
                        "m-0 font-display text-heading font-semibold tracking-tight leading-snug break-words",
                        draft().title.trim()
                          ? "text-ink"
                          : "text-ink-muted italic",
                      ]}
                    >
                      {previewTitle()}
                    </p>
                    <Show when={draft().note.trim()}>
                      {(note) => (
                        <MarkdownNote
                          value={note()}
                          class="m-0 text-sm text-ink-secondary line-clamp-2"
                          streaming
                        />
                      )}
                    </Show>
                    <Show when={draft().priceHint.trim()}>
                      {(price) => (
                        <p class="mt-1 mb-0 font-display text-heading font-semibold text-ink tabular-nums">
                          {price()}
                        </p>
                      )}
                    </Show>
                  </div>
                </div>
              </aside>
            </div>
          </Panel>

          <section aria-labelledby="wishes-list-heading">
            <h2
              id="wishes-list-heading"
              class="flex items-baseline gap-2 m-0 mb-4 font-display text-heading font-semibold tracking-tight text-ink"
            >
              <span>Dans ta liste</span>
              <span class="font-sans text-body font-medium text-ink-muted tabular-nums">
                ({items().length})
              </span>
            </h2>

            <Show
              when={items().length > 0}
              fallback={
                <EmptyState
                  headingLevel="h3"
                  icon={<GiftIcon size={22} />}
                  title="Ta liste est vide"
                  description="Colle un lien ci-dessus, ou écris directement ta première idée."
                />
              }
            >
              <ul class="list-none m-0 p-0 bg-card rounded-md shadow-card overflow-hidden divide-y divide-line-subtle contrast-more:border contrast-more:border-line-strong forced-colors:border forced-colors:border-canvas-text">
                <For each={items()}>
                  {(item) => {
                    const domain = () =>
                      item.siteName || extractDomain(item.url);
                    return (
                      <li class="grid grid-admin-row sm:grid-admin-row-wide gap-4 items-start sm:items-center p-4 sm:px-5 sm:py-4.5 transition-colors duration-150 ease-atelier">
                        <div
                          class="size-15 rounded-sm bg-media overflow-hidden flex items-center justify-center shrink-0 outline-1 -outline-offset-1 outline-image-outline"
                          aria-hidden="true"
                        >
                          <Show
                            when={item.imageUrl}
                            fallback={
                              <span
                                class="wish-placeholder"
                                data-pattern={titlePattern(item.title)}
                                style={{ "--hue": String(titleHue(item.title)) }}
                              >
                                <span class="wish-placeholder-ink font-display text-heading font-semibold">
                                  {titleInitial(item.title)}
                                </span>
                              </span>
                            }
                          >
                            {(src) => (
                              <img
                                src={src()}
                                alt=""
                                class="w-full h-full object-contain p-1 dark:brightness-90"
                                referrerpolicy="no-referrer"
                                loading="lazy"
                                decoding="async"
                              />
                            )}
                          </Show>
                        </div>

                        <div class="min-w-0 flex flex-col gap-1">
                          <h3 class="m-0 font-display text-heading font-semibold tracking-tight leading-snug">
                            <Show
                              when={item.url}
                              fallback={<span>{item.title}</span>}
                            >
                              {(href) => (
                                <a
                                  href={href()}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  class="group/link no-underline text-inherit rounded-xs transition-colors duration-150 ease-atelier hover:text-accent"
                                >
                                  <span>{item.title}</span>
                                  <ExternalLinkIcon
                                    size={13}
                                    class="inline-block ms-1.5 align-text-top opacity-52 transition duration-150 ease-atelier group-hover/link:opacity-100 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                                  />
                                  <span class="sr-only"> (nouvel onglet)</span>
                                </a>
                              )}
                            </Show>
                          </h3>

                          <Show when={item.priceHint || domain()}>
                            <div class="flex items-center flex-nowrap gap-2 min-w-0 text-sm text-ink-muted">
                              <Show when={item.priceHint}>
                                {(price) => (
                                  <span class="text-sm font-semibold text-ink tabular-nums">
                                    {price()}
                                  </span>
                                )}
                              </Show>
                              <Show when={item.priceHint && domain()}>
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

                          <Show when={item.note}>
                            {(note) => (
                              <MarkdownNote
                                value={note()}
                                class="mt-0.5 mb-0 text-sm text-ink-muted line-clamp-2"
                              />
                            )}
                          </Show>
                        </div>

                        <div class="col-span-full sm:col-span-1 flex items-center justify-end gap-1.5 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-line-subtle">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Modifier «\u00A0${item.title}\u00A0»`}
                            onClick={() => openEditModal(item)}
                          >
                            <PencilIcon size={14} class="shrink-0" />
                            <span>Modifier</span>
                          </Button>
                          <Button
                            variant="ghost-danger"
                            size="sm"
                            aria-label={`Supprimer «\u00A0${item.title}\u00A0»`}
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(item);
                              setDeleteOpen(true);
                            }}
                          >
                            <TrashIcon size={14} class="shrink-0" />
                            <span>Supprimer</span>
                          </Button>
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
              <form
                class="flex flex-col gap-4"
                onSubmit={(e) => void handleSaveEdit(e)}
              >
                <Field>
                  <FieldLabel for={editTitleId}>Titre</FieldLabel>
                  <Input
                    id={editTitleId}
                    type="text"
                    required
                    maxlength={140}
                    autofocus
                    value={editDraft().title}
                    onInput={(e) =>
                      updateEditField("title", e.currentTarget.value)
                    }
                  />
                </Field>

                <div class="grid grid-cols-1 sm:grid-form-price gap-4">
                  <Field>
                    <FieldLabel for={editUrlId}>Lien du produit</FieldLabel>
                    <Input
                      id={editUrlId}
                      type="url"
                      inputmode="url"
                      placeholder="https://…"
                      value={editDraft().url}
                      onInput={(e) =>
                        updateEditField("url", e.currentTarget.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel for={editPriceId}>Prix</FieldLabel>
                    <Input
                      id={editPriceId}
                      type="text"
                      maxlength={40}
                      value={editDraft().priceHint}
                      onInput={(e) =>
                        updateEditField("priceHint", e.currentTarget.value)
                      }
                    />
                  </Field>
                </div>

                <Field>
                  <FieldLabel for={editNoteId} optional="(Markdown accepté)">
                    Précisions
                  </FieldLabel>
                  <Textarea
                    id={editNoteId}
                    rows={3}
                    maxlength={400}
                    value={editDraft().note}
                    onInput={(e) =>
                      updateEditField("note", e.currentTarget.value)
                    }
                  />
                </Field>

                <Field>
                  <FieldLabel for={editImageId}>Adresse de l'image</FieldLabel>
                  <Input
                    id={editImageId}
                    type="url"
                    inputmode="url"
                    placeholder="https://…"
                    value={editDraft().imageUrl}
                    onInput={(e) =>
                      updateEditField("imageUrl", e.currentTarget.value)
                    }
                  />
                </Field>

                <Show when={editError()}>
                  {(err) => <FormAlert>{err()}</FormAlert>}
                </Show>

                <div class="flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-end gap-2 pt-2">
                  <Button
                    variant="secondary"
                    disabled={editBusy()}
                    onClick={() => setEditOpen(false)}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={editBusy() || !editDraft().title.trim()}
                    aria-busy={editBusy() ? "true" : undefined}
                  >
                    {editBusy() ? "Enregistrement…" : "Enregistrer"}
                  </Button>
                </div>
              </form>
            </Show>
          </ModalDialog>

          {/* Delete confirm dialog */}
          <ModalDialog
            open={deleteOpen()}
            dismissible={!deleteBusy()}
            title={"Supprimer cette envie\u00A0?"}
            subtitle={deleteTarget()?.title}
            size="sm"
            onClose={() => setDeleteOpen(false)}
          >
            <Show when={deleteTarget()}>
              <div class="flex flex-col gap-4">
                <p class="m-0 text-body text-ink-secondary leading-normal">
                  Elle disparaîtra de la liste de tes proches. Tu ne pourras pas
                  la récupérer.
                </p>

                <Show when={deleteError()}>
                  {(err) => <FormAlert>{err()}</FormAlert>}
                </Show>

                <div class="flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-end gap-2 pt-2">
                  <Button
                    variant="secondary"
                    autofocus
                    disabled={deleteBusy()}
                    onClick={() => setDeleteOpen(false)}
                  >
                    Garder
                  </Button>
                  <Button
                    variant="danger"
                    disabled={deleteBusy()}
                    aria-busy={deleteBusy() ? "true" : undefined}
                    onClick={() => void handleConfirmDelete()}
                  >
                    {deleteBusy() ? "Suppression…" : "Supprimer"}
                  </Button>
                </div>
              </div>
            </Show>
          </ModalDialog>
        </div>
      </Show>
    </Show>
  );
}
