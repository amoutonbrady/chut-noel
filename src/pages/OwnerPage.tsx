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
  GiftSize,
  OwnerWishlistView,
  ThemeId,
  WishlistItem,
} from "../shared/types";
import {
  addOwnerItem,
  ApiError,
  deleteOwnerItem,
  fetchOwnerList,
  saveOwnedList,
  scrapeLink,
  updateOwnerItem,
  updateOwnerList,
} from "../lib/api";
import {
  buildAbsoluteUrl,
  buildGuestPath,
  buildOwnerPath,
  RouterContext,
} from "../lib/router";
import {
  playBell,
  playClick,
  playPaperRustle,
} from "../lib/sound";
import { randomSeed, THEME_LIST } from "../lib/themes";
import { triggerConfetti } from "../components/EasterEggs";
import { GiftCard } from "../components/GiftCard";
import { ModalDialog } from "../components/ModalDialog";
import { ProceduralMascot } from "../components/ProceduralGiftArt";
import { ToastContext } from "../components/ToastHost";

export interface OwnerPageProps {
  token: string;
  onListLoaded: (list: OwnerWishlistView) => void;
}

const SIZE_OPTIONS: ReadonlyArray<{ value: GiftSize; label: string; emoji: string }> = [
  { value: "mini", label: "Mini", emoji: "🎀" },
  { value: "moyen", label: "Moyen", emoji: "🎁" },
  { value: "geant", label: "Géant", emoji: "🎄" },
];

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function isHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

interface OwnerWorkspaceProps {
  token: string;
  list: OwnerWishlistView;
  onSyncList: (list: OwnerWishlistView) => void;
  onRefresh: () => void;
}

function OwnerWorkspace(props: OwnerWorkspaceProps) {
  const toast = useContext(ToastContext);

  // Immediate patched list that resets cleanly whenever server list refreshes
  const [patchedList, setPatchedList] = createSignal<OwnerWishlistView | null>(
    () => {
      void props.list;
      return null;
    },
  );
  const currentList = createMemo(() => patchedList() ?? props.list);

  createEffect(
    () => ({ token: props.token, list: currentList() }),
    ({ token, list }) => {
      props.onSyncList(list);
      saveOwnedList({
        slug: list.slug,
        ownerToken: token,
        title: list.title,
        ownerName: list.ownerName,
        theme: list.theme,
        updatedAt: list.updatedAt,
      });
    },
  );

  // --- Quick-add gift form state ---
  let addFormRef: HTMLFormElement | undefined;
  const urlId = createUniqueId();
  const urlHintId = createUniqueId();
  const urlErrId = createUniqueId();
  const itemTitleId = createUniqueId();
  const itemTitleHintId = createUniqueId();
  const itemTitleErrId = createUniqueId();
  const priceId = createUniqueId();
  const noteId = createUniqueId();

  const [itemUrl, setItemUrl] = createSignal("");
  const [urlTouched, setUrlTouched] = createSignal(false);
  const [itemTitle, setItemTitle] = createSignal("");
  const [titleTouched, setTitleTouched] = createSignal(false);
  const [titleAutoFilled, setTitleAutoFilled] = createSignal(false);
  const [itemImageUrl, setItemImageUrl] = createSignal("");
  const [itemPrice, setItemPrice] = createSignal("");
  const [itemSiteName, setItemSiteName] = createSignal("");
  const [itemNote, setItemNote] = createSignal("");
  const [itemSize, setItemSize] = createSignal<GiftSize>("moyen");

  const [scraping, setScraping] = createSignal(false);
  const [lastScrapedUrl, setLastScrapedUrl] = createSignal("");
  const [scrapeNotice, setScrapeNotice] = createSignal<string | null>(null);
  const [addingItem, setAddingItem] = createSignal(false);
  const [addError, setAddError] = createSignal<string | null>(null);

  const urlError = createMemo(() => {
    if (!urlTouched()) return "";
    const trimmed = itemUrl().trim();
    if (!trimmed) return "";
    if (!isHttpUrl(trimmed)) {
      return "Ce lien doit commencer par https:// ou http://.";
    }
    return "";
  });

  const itemTitleError = createMemo(() => {
    if (!titleTouched()) return "";
    if (!itemTitle().trim()) {
      return "Indique au moins le nom de ton cadeau !";
    }
    return "";
  });

  const runScrape = async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed || !isHttpUrl(trimmed)) {
      return;
    }
    if (trimmed === lastScrapedUrl() && !scrapeNotice()) {
      return;
    }
    setScraping(true);
    setLastScrapedUrl(trimmed);
    setScrapeNotice(null);
    try {
      const res = await scrapeLink(trimmed);
      if (res.title && (!itemTitle().trim() || titleAutoFilled())) {
        setItemTitle(res.title);
        setTitleAutoFilled(true);
      }
      if (res.imageUrl) {
        setItemImageUrl(res.imageUrl);
      }
      if (res.priceHint && !itemPrice().trim()) {
        setItemPrice(res.priceHint);
      }
      if (res.siteName) {
        setItemSiteName(res.siteName);
      }
      if (res.fallback) {
        setScrapeNotice(
          "Emballé à la main par nos lutins ! Ce site protège ses infos — complète le titre ou le prix si besoin.",
        );
      } else {
        setScrapeNotice(
          `Infos récupérées${res.siteName ? ` depuis ${res.siteName}` : ""} ! Tu peux tout ajuster avant d'ajouter.`,
        );
      }
    } catch {
      setScrapeNotice(
        "Emballé à la main par nos lutins ! Complète simplement le titre ci-dessous.",
      );
    } finally {
      setScraping(false);
    }
  };

  const resetAddForm = () => {
    addFormRef?.reset();
    setItemUrl("");
    setUrlTouched(false);
    setItemTitle("");
    setTitleTouched(false);
    setTitleAutoFilled(false);
    setItemImageUrl("");
    setItemPrice("");
    setItemSiteName("");
    setItemNote("");
    setItemSize("moyen");
    setLastScrapedUrl("");
    setScrapeNotice(null);
    setAddError(null);
  };

  const handleAddSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setTitleTouched(true);
    setUrlTouched(true);
    setAddError(null);

    const cleanTitle = itemTitle().trim();
    const cleanUrl = itemUrl().trim();
    if (!cleanTitle || (cleanUrl && !isHttpUrl(cleanUrl))) {
      return;
    }

    setAddingItem(true);
    try {
      const updated = await addOwnerItem(props.token, {
        title: cleanTitle,
        url: cleanUrl || undefined,
        imageUrl: itemImageUrl().trim() || undefined,
        priceHint: itemPrice().trim() || undefined,
        siteName: itemSiteName().trim() || undefined,
        note: itemNote().trim() || undefined,
        size: itemSize(),
      });
      setPatchedList(updated);
      props.onRefresh();
      resetAddForm();
      playPaperRustle();
      triggerConfetti();
      toast.push({
        message: `« ${cleanTitle} » a été glissé dans ta liste ! 🎁`,
        tone: "success",
      });
    } catch (err) {
      setAddError(
        err instanceof ApiError
          ? err.message
          : "Impossible d'ajouter ce cadeau pour le moment.",
      );
    } finally {
      setAddingItem(false);
    }
  };

  // --- Copy share links ---
  const handleCopyGuestLink = async () => {
    const url = buildAbsoluteUrl(buildGuestPath(currentList().slug));
    const ok = await copyText(url);
    if (ok) {
      playBell();
      toast.push({
        message: "Lien pour tes proches copié ! Partage-le sans crainte 🎄",
        tone: "success",
      });
    } else {
      toast.push({
        message: `Copie ce lien : ${url}`,
        tone: "info",
      });
    }
  };

  const handleCopyOwnerLink = async () => {
    const url = buildAbsoluteUrl(buildOwnerPath(props.token));
    const ok = await copyText(url);
    if (ok) {
      playClick();
      toast.push({
        message:
          "Ton lien secret éditeur est copié ! Garde-le rien que pour toi 🔑",
        tone: "info",
      });
    } else {
      toast.push({
        message: `Lien secret : ${url}`,
        tone: "info",
      });
    }
  };

  // --- Theme & settings modal ---
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [draftTitle, setDraftTitle] = createSignal("");
  const [draftOwnerName, setDraftOwnerName] = createSignal("");
  const [draftSubtitle, setDraftSubtitle] = createSignal("");
  const [draftTheme, setDraftTheme] = createSignal<ThemeId>("lutins");
  const [draftSeed, setDraftSeed] = createSignal(2512);
  const [savingSettings, setSavingSettings] = createSignal(false);

  const settingsTitleId = createUniqueId();
  const settingsNameId = createUniqueId();
  const settingsSubId = createUniqueId();

  const openSettingsModal = () => {
    const list = currentList();
    setDraftTitle(list.title);
    setDraftOwnerName(list.ownerName);
    setDraftSubtitle(list.subtitle ?? "");
    setDraftTheme(list.theme);
    setDraftSeed(list.seed);
    setSettingsOpen(true);
  };

  const handleSaveSettings = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!draftTitle().trim() || !draftOwnerName().trim()) return;
    setSavingSettings(true);
    try {
      const updated = await updateOwnerList(props.token, {
        title: draftTitle().trim(),
        ownerName: draftOwnerName().trim(),
        subtitle: draftSubtitle().trim(),
        theme: draftTheme(),
        seed: draftSeed(),
      });
      setPatchedList(updated);
      props.onRefresh();
      setSettingsOpen(false);
      playBell();
      toast.push({
        message: "Décor et infos de ta liste mis à jour ! ✨",
        tone: "success",
      });
    } catch (err) {
      toast.push({
        message:
          err instanceof ApiError
            ? err.message
            : "Impossible de mettre à jour la liste.",
        tone: "warning",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  // --- Edit item modal ---
  const [editingItem, setEditingItem] = createSignal<WishlistItem | null>(null);
  const [editTitle, setEditTitle] = createSignal("");
  const [editUrl, setEditUrl] = createSignal("");
  const [editImageUrl, setEditImageUrl] = createSignal("");
  const [editPrice, setEditPrice] = createSignal("");
  const [editNote, setEditNote] = createSignal("");
  const [editSize, setEditSize] = createSignal<GiftSize>("moyen");
  const [savingEdit, setSavingEdit] = createSignal(false);

  const editTitleId = createUniqueId();
  const editUrlId = createUniqueId();
  const editPriceId = createUniqueId();
  const editNoteId = createUniqueId();

  const openEditModal = (item: WishlistItem) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditUrl(item.url ?? "");
    setEditImageUrl(item.imageUrl ?? "");
    setEditPrice(item.priceHint ?? "");
    setEditNote(item.note ?? "");
    setEditSize(item.size);
  };

  const handleSaveEdit = async (e: SubmitEvent) => {
    e.preventDefault();
    const target = editingItem();
    if (!target || !editTitle().trim()) return;
    const cleanUrl = editUrl().trim();
    if (cleanUrl && !isHttpUrl(cleanUrl)) return;

    setSavingEdit(true);
    try {
      const updated = await updateOwnerItem(props.token, target.id, {
        title: editTitle().trim(),
        url: cleanUrl,
        imageUrl: editImageUrl().trim(),
        priceHint: editPrice().trim(),
        note: editNote().trim(),
        size: editSize(),
      });
      setPatchedList(updated);
      props.onRefresh();
      setEditingItem(null);
      playClick();
      toast.push({
        message: "Souhait modifié avec succès !",
        tone: "success",
      });
    } catch (err) {
      toast.push({
        message:
          err instanceof ApiError
            ? err.message
            : "Impossible de modifier ce souhait.",
        tone: "warning",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  // --- Delete confirmation modal ---
  const [deletingItem, setDeletingItem] = createSignal<WishlistItem | null>(null);
  const [deletingBusy, setDeletingBusy] = createSignal(false);

  const handleConfirmDelete = async () => {
    const target = deletingItem();
    if (!target) return;
    setDeletingBusy(true);
    try {
      const updated = await deleteOwnerItem(props.token, target.id);
      setPatchedList(updated);
      props.onRefresh();
      setDeletingItem(null);
      playClick();
      toast.push({
        message: `« ${target.title} » a été retiré de ta liste.`,
        tone: "info",
      });
    } catch (err) {
      toast.push({
        message:
          err instanceof ApiError
            ? err.message
            : "Impossible de supprimer ce souhait.",
        tone: "warning",
      });
    } finally {
      setDeletingBusy(false);
    }
  };

  return (
    <div class="page-stack">
      <section class="workshop-header">
        <div class="anti-spoil-badge" role="status">
          <ProceduralMascot
            theme={currentList().theme}
            seed={currentList().seed}
            mode="blindfolded"
            size={74}
          />
          <div>
            <strong>🙈 Yeux bandés !</strong>{" "}
            <span>
              Tu peux tout modifier ici sans JAMAIS voir qui a pris quoi.
            </span>
          </div>
        </div>

        <div class="workshop-header-main">
          <div>
            <h1 class="workshop-title">{currentList().title}</h1>
            <Show when={currentList().subtitle}>
              {(sub) => <p class="workshop-subtitle">{sub()}</p>}
            </Show>
          </div>
        </div>

        <div class="share-panel-actions">
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => void handleCopyGuestLink()}
          >
            <span aria-hidden="true">📋</span>
            Copier le lien pour mes proches
          </button>

          <button
            type="button"
            class="btn btn-secondary"
            onClick={() => void handleCopyOwnerLink()}
          >
            <span aria-hidden="true">🔑</span>
            Copier mon lien secret éditeur
          </button>

          <button
            type="button"
            class="btn btn-ghost"
            onClick={openSettingsModal}
          >
            <span aria-hidden="true">🎨</span>
            Changer de thème / remixer
          </button>
        </div>
      </section>

      <section class="quick-add-card" aria-labelledby="quick-add-heading">
        <form
          ref={(el) => {
            addFormRef = el;
          }}
          class="form-stack"
          novalidate
          onSubmit={handleAddSubmit}
        >
          <div>
            <h2 id="quick-add-heading">Ajouter un cadeau à ma liste</h2>
            <p class="text-muted">
              Colle un lien pour pré-remplir automatiquement, ou écris directement ton idée à la main !
            </p>
          </div>

          <div class="field">
            <label for={urlId} class="field-label">
              Lien vers l'article (optionnel)
            </label>
            <p id={urlHintId} class="field-hint">
              Dès que tu colles une adresse, nos lutins essaient de récupérer le titre, la photo et le prix.
            </p>
            <div class="url-fetch-row">
              <div class="field">
                <input
                  id={urlId}
                  name="url"
                  type="url"
                  placeholder="https://..."
                  class={[
                    "field-input",
                    { "user-invalid-fallback": Boolean(urlError()) },
                  ]}
                  value={itemUrl()}
                  aria-invalid={urlError() ? "true" : "false"}
                  aria-describedby={
                    urlError() ? `${urlHintId} ${urlErrId}` : urlHintId
                  }
                  onInput={(e) => setItemUrl(e.currentTarget.value)}
                  onBlur={() => {
                    setUrlTouched(true);
                    const val = itemUrl().trim();
                    if (val && isHttpUrl(val) && val !== lastScrapedUrl()) {
                      void runScrape(val);
                    }
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData?.getData("text")?.trim();
                    if (pasted && isHttpUrl(pasted)) {
                      setItemUrl(pasted);
                      void runScrape(pasted);
                    }
                  }}
                />
                <p id={urlErrId} class="field-error">
                  {urlError() ||
                    "Ce lien doit commencer par https:// ou http://."}
                </p>
              </div>
              <button
                type="button"
                class="btn btn-secondary"
                disabled={scraping() || !isHttpUrl(itemUrl().trim())}
                onClick={() => void runScrape(itemUrl())}
              >
                {scraping() ? "Analyse…" : "🔍 Analyser le lien"}
              </button>
            </div>
          </div>

          <Show when={scraping()}>
            <p class="scrape-feedback" role="status">
              <span aria-hidden="true">🧝</span> Nos lutins inspectent ce lien…
            </p>
          </Show>

          <Show when={!scraping() && scrapeNotice()}>
            {(msg) => (
              <Show
                when={itemImageUrl()}
                fallback={
                  <p class="scrape-feedback" role="status">
                    {msg()}
                  </p>
                }
              >
                {(img) => (
                  <div class="scrape-preview" role="status">
                    <img
                      src={img()}
                      alt="Aperçu récupéré"
                      referrerpolicy="no-referrer"
                      onError={() => setItemImageUrl("")}
                    />
                    <div class="field">
                      <p class="hand-note">{msg()}</p>
                      <div>
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm"
                          onClick={() => setItemImageUrl("")}
                        >
                          Utiliser un paquet illustré
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </Show>
            )}
          </Show>

          <div class="field">
            <label for={itemTitleId} class="field-label">
              Nom du cadeau <span aria-hidden="true">*</span>
            </label>
            <p id={itemTitleHintId} class="field-hint">
              Fonctionne aussi sans lien : un livre, un atelier poterie, un week-end surprise…
            </p>
            <input
              id={itemTitleId}
              name="title"
              type="text"
              required
              maxlength={120}
              placeholder="Ex : Plaid ultra doux vert sapin"
              class={[
                "field-input",
                { "user-invalid-fallback": Boolean(itemTitleError()) },
              ]}
              value={itemTitle()}
              aria-invalid={itemTitleError() ? "true" : "false"}
              aria-describedby={
                itemTitleError()
                  ? `${itemTitleHintId} ${itemTitleErrId}`
                  : itemTitleHintId
              }
              onInput={(e) => {
                setTitleAutoFilled(false);
                setItemTitle(e.currentTarget.value);
              }}
              onBlur={() => setTitleTouched(true)}
            />
            <p id={itemTitleErrId} class="field-error">
              {itemTitleError() || "Indique au moins le nom de ton cadeau !"}
            </p>
          </div>

          <div class="form-grid">
            <div class="field">
              <label for={priceId} class="field-label">
                Prix indicatif (optionnel)
              </label>
              <p class="field-hint">Ex : 35 € — juste un ordre d'idée.</p>
              <input
                id={priceId}
                name="priceHint"
                type="text"
                maxlength={32}
                placeholder="Ex : 35 €"
                class="field-input"
                value={itemPrice()}
                aria-invalid="false"
                onInput={(e) => setItemPrice(e.currentTarget.value)}
              />
            </div>

            <div class="field">
              <span class="field-label" id="gift-size-label">
                Taille du paquet
              </span>
              <p class="field-hint">Change la forme du paquet illustré !</p>
              <div
                class="size-picker"
                role="group"
                aria-labelledby="gift-size-label"
              >
                <For each={SIZE_OPTIONS}>
                  {(opt) => (
                    <button
                      type="button"
                      class={[
                        "chip",
                        { "chip--active": itemSize() === opt.value },
                      ]}
                      aria-pressed={itemSize() === opt.value ? "true" : "false"}
                      onClick={() => {
                        playClick();
                        setItemSize(opt.value);
                      }}
                    >
                      <span aria-hidden="true">{opt.emoji}</span>
                      <span>{opt.label}</span>
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class="field">
              <label for={noteId} class="field-label">
                Petite note / raison (optionnel)
              </label>
              <p class="field-hint">Ex : Pour mes soirées plaid.</p>
              <input
                id={noteId}
                name="note"
                type="text"
                maxlength={180}
                placeholder="Ex : Pour mes soirées plaid"
                class="field-input"
                value={itemNote()}
                aria-invalid="false"
                onInput={(e) => setItemNote(e.currentTarget.value)}
              />
            </div>
          </div>

          <Show when={addError()}>
            {(err) => (
              <p class="field-error" data-visible="true" role="alert">
                {err()}
              </p>
            )}
          </Show>

          <div class="form-actions">
            <button
              type="submit"
              class="btn btn-primary"
              disabled={addingItem()}
            >
              {addingItem() ? "Emballage en cours…" : "Ajouter à ma liste 🎁"}
            </button>
          </div>
        </form>
      </section>

      <section class="page-stack" aria-labelledby="owner-items-heading">
        <div class="remix-row">
          <h2 id="owner-items-heading">
            Mes souhaits ({currentList().items.length})
          </h2>
          <span class="text-muted">
            Aucune donnée de réservation n'existe sur cette page.
          </span>
        </div>

        <Show
          when={currentList().items.length > 0}
          fallback={
            <div class="empty-state">
              <span class="empty-state-icon" aria-hidden="true">
                🎄
              </span>
              <h3>Ta hotte est encore toute vide !</h3>
              <p class="text-muted">
                Ajoute ta première idée de cadeau juste au-dessus, puis copie le lien pour tes proches.
              </p>
            </div>
          }
        >
          <div class="gift-grid">
            <For each={currentList().items} keyed={(item) => item.id}>
              {(item) => (
                <GiftCard
                  mode="owner"
                  item={item()}
                  theme={currentList().theme}
                  onEdit={openEditModal}
                  onDelete={(it) => setDeletingItem(it)}
                />
              )}
            </For>
          </div>
        </Show>
      </section>

      {/* Modal: Personnaliser le thème et la liste */}
      <ModalDialog
        open={settingsOpen()}
        title="Personnaliser mon atelier"
        subtitle="Change le titre, le thème ou remixe le décor à volonté."
        onClose={() => setSettingsOpen(false)}
      >
        <form class="form-stack" onSubmit={handleSaveSettings}>
          <div class="field">
            <label for={settingsNameId} class="field-label">
              Ton prénom
            </label>
            <input
              id={settingsNameId}
              type="text"
              required
              maxlength={60}
              class="field-input"
              value={draftOwnerName()}
              aria-invalid={!draftOwnerName().trim() ? "true" : "false"}
              onInput={(e) => setDraftOwnerName(e.currentTarget.value)}
            />
          </div>

          <div class="field">
            <label for={settingsTitleId} class="field-label">
              Titre de la liste
            </label>
            <input
              id={settingsTitleId}
              type="text"
              required
              maxlength={90}
              class="field-input"
              value={draftTitle()}
              aria-invalid={!draftTitle().trim() ? "true" : "false"}
              onInput={(e) => setDraftTitle(e.currentTarget.value)}
            />
          </div>

          <div class="field">
            <label for={settingsSubId} class="field-label">
              Petit mot pour tes proches
            </label>
            <input
              id={settingsSubId}
              type="text"
              maxlength={160}
              class="field-input"
              value={draftSubtitle()}
              aria-invalid="false"
              onInput={(e) => setDraftSubtitle(e.currentTarget.value)}
            />
          </div>

          <fieldset
            class="field"
            style={{ border: "0", padding: "0", margin: "0" }}
          >
            <legend class="field-label">Thème visuel</legend>
            <div class="theme-grid">
              <For each={THEME_LIST}>
                {(themeMeta) => (
                  <button
                    type="button"
                    class={[
                      "theme-card",
                      { "theme-card--active": draftTheme() === themeMeta.id },
                    ]}
                    aria-pressed={
                      draftTheme() === themeMeta.id ? "true" : "false"
                    }
                    onClick={() => {
                      playClick();
                      setDraftTheme(themeMeta.id);
                    }}
                  >
                    <div class="theme-swatch" aria-hidden="true">
                      <span
                        class="theme-swatch-dot"
                        style={{ background: themeMeta.swatch[0] }}
                      />
                      <span
                        class="theme-swatch-dot"
                        style={{ background: themeMeta.swatch[1] }}
                      />
                      <span
                        class="theme-swatch-dot"
                        style={{ background: themeMeta.swatch[2] }}
                      />
                    </div>
                    <strong class="theme-card-name">
                      <span aria-hidden="true">{themeMeta.emoji}</span>
                      <span>{themeMeta.shortName}</span>
                    </strong>
                  </button>
                )}
              </For>
            </div>
          </fieldset>

          <div class="remix-row">
            <span class="badge">Graine du décor : #{draftSeed()}</span>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              onClick={() => {
                playBell();
                setDraftSeed(randomSeed());
              }}
            >
              <span aria-hidden="true">🎲</span>
              Remixer la graine
            </button>
          </div>

          <div class="form-actions" style={{ "justify-content": "flex-end" }}>
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => setSettingsOpen(false)}
            >
              Annuler
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              disabled={savingSettings()}
            >
              {savingSettings() ? "Enregistrement…" : "Enregistrer ✨"}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal: Modifier un souhait */}
      <ModalDialog
        open={Boolean(editingItem())}
        title="Modifier ce souhait"
        onClose={() => setEditingItem(null)}
      >
        <form class="form-stack" onSubmit={handleSaveEdit}>
          <div class="field">
            <label for={editTitleId} class="field-label">
              Nom du cadeau
            </label>
            <input
              id={editTitleId}
              type="text"
              required
              maxlength={120}
              class="field-input"
              value={editTitle()}
              aria-invalid={!editTitle().trim() ? "true" : "false"}
              onInput={(e) => setEditTitle(e.currentTarget.value)}
            />
          </div>

          <div class="field">
            <label for={editUrlId} class="field-label">
              Lien produit (optionnel)
            </label>
            <input
              id={editUrlId}
              type="url"
              placeholder="https://..."
              class="field-input"
              value={editUrl()}
              aria-invalid="false"
              onInput={(e) => setEditUrl(e.currentTarget.value)}
            />
          </div>

          <div class="form-grid">
            <div class="field">
              <label for={editPriceId} class="field-label">
                Prix indicatif
              </label>
              <input
                id={editPriceId}
                type="text"
                maxlength={32}
                placeholder="Ex : 35 €"
                class="field-input"
                value={editPrice()}
                aria-invalid="false"
                onInput={(e) => setEditPrice(e.currentTarget.value)}
              />
            </div>

            <div class="field">
              <span class="field-label" id="edit-size-label">
                Taille du paquet
              </span>
              <div
                class="size-picker"
                role="group"
                aria-labelledby="edit-size-label"
              >
                <For each={SIZE_OPTIONS}>
                  {(opt) => (
                    <button
                      type="button"
                      class={[
                        "chip",
                        { "chip--active": editSize() === opt.value },
                      ]}
                      aria-pressed={editSize() === opt.value ? "true" : "false"}
                      onClick={() => setEditSize(opt.value)}
                    >
                      <span>{opt.label}</span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </div>

          <div class="field">
            <label for={editNoteId} class="field-label">
              Petite note
            </label>
            <input
              id={editNoteId}
              type="text"
              maxlength={180}
              class="field-input"
              value={editNote()}
              aria-invalid="false"
              onInput={(e) => setEditNote(e.currentTarget.value)}
            />
          </div>

          <div class="form-actions" style={{ "justify-content": "flex-end" }}>
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => setEditingItem(null)}
            >
              Annuler
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              disabled={savingEdit()}
            >
              {savingEdit() ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal: Confirmation de suppression (Annuler en autofocus) */}
      <ModalDialog
        open={Boolean(deletingItem())}
        title="Retirer ce cadeau ?"
        size="sm"
        onClose={() => setDeletingItem(null)}
      >
        <p>
          Veux-tu vraiment retirer{" "}
          <strong>« {deletingItem()?.title ?? ""} »</strong> de ta liste ?
        </p>
        <div class="form-actions" style={{ "justify-content": "flex-end" }}>
          <button
            type="button"
            class="btn btn-secondary"
            autofocus
            onClick={() => setDeletingItem(null)}
          >
            Annuler
          </button>
          <button
            type="button"
            class="btn btn-danger"
            disabled={deletingBusy()}
            onClick={() => void handleConfirmDelete()}
          >
            {deletingBusy() ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </ModalDialog>
    </div>
  );
}

export function OwnerPage(props: OwnerPageProps) {
  const router = useContext(RouterContext);
  const listMemo = createMemo(() => fetchOwnerList(props.token));

  return (
    <Errored
      fallback={(err, reset) => (
        <section class="error-state" role="alert">
          <span class="empty-state-icon" aria-hidden="true">
            🔑
          </span>
          <h1>Oups, atelier introuvable !</h1>
          <p class="text-muted">
            {err() instanceof ApiError
              ? (err() as ApiError).message
              : "Impossible de charger ta liste secrète pour le moment."}
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
              Créer une nouvelle liste ✨
            </button>
          </div>
        </section>
      )}
    >
      <Loading
        on={props.token}
        fallback={
          <section class="loading-state" aria-live="polite">
            <div class="loading-spinner" aria-hidden="true" />
            <h1>Ouverture de ton atelier secret…</h1>
            <p class="text-muted">
              Nos lutins mettent le bandeau sur les yeux avant d'ouvrir la porte !
            </p>
          </section>
        }
      >
        <OwnerWorkspace
          token={props.token}
          list={listMemo()}
          onSyncList={(list) => props.onListLoaded(list)}
          onRefresh={() => refresh(listMemo)}
        />
      </Loading>
    </Errored>
  );
}
