import {
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Show,
  useContext,
} from "solid-js";
import type {
  CreateListResponse,
  OwnedListRecord,
  ThemeId,
} from "../shared/types";
import {
  ApiError,
  createList,
  getOwnedLists,
  saveOwnedList,
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
  playConfettiPop,
} from "../lib/sound";
import {
  THEME_LIST,
  type ProceduralThemeSpec,
} from "../lib/themes";
import { triggerConfetti } from "../components/EasterEggs";
import { ProceduralMascot } from "../components/ProceduralGiftArt";
import { ToastContext } from "../components/ToastHost";

export interface HomePageProps {
  theme: ThemeId;
  seed: number;
  themeSpec: ProceduralThemeSpec;
  onSelectTheme: (theme: ThemeId) => void;
  onRemixSeed: () => void;
  onListCreated: (response: CreateListResponse) => void;
}

const THEME_LABELS: Record<ThemeId, string> = {
  lutins: "Atelier des Lutins",
  chalet: "Chalet Cosy",
  neon: "Pôle Nord Néon",
  "boule-a-neige": "Boule à Neige",
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand fallback
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

const FRENCH_ELISION_RE = /^[aeiouyhàâäéèêëîïôöùûüÿœæ]/i;

function buildDefaultWishlistTitle(rawName: string): string {
  const clean = rawName.trim();
  if (!clean) return "";
  return FRENCH_ELISION_RE.test(clean)
    ? `La liste de Noël d'${clean}`
    : `La liste de Noël de ${clean}`;
}

export function HomePage(props: HomePageProps) {
  const router = useContext(RouterContext);
  const toast = useContext(ToastContext);
  let createFormRef: HTMLFormElement | undefined;

  const nameId = createUniqueId();
  const nameHintId = createUniqueId();
  const nameErrId = createUniqueId();
  const titleId = createUniqueId();
  const titleHintId = createUniqueId();
  const titleErrId = createUniqueId();
  const subtitleId = createUniqueId();
  const subtitleHintId = createUniqueId();

  const [ownerName, setOwnerName] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [titleEdited, setTitleEdited] = createSignal(false);
  const [subtitle, setSubtitle] = createSignal("");
  const [nameTouched, setNameTouched] = createSignal(false);
  const [titleTouched, setTitleTouched] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [submitError, setSubmitError] = createSignal<string | null>(null);
  const [ownedLists, setOwnedLists] = createSignal<OwnedListRecord[]>(
    getOwnedLists(),
  );

  const nameError = createMemo(() => {
    if (!nameTouched()) return "";
    if (!ownerName().trim()) {
      return "Indique ton prénom pour signer ta liste de Noël.";
    }
    return "";
  });

  const titleError = createMemo(() => {
    if (!titleTouched()) return "";
    if (!title().trim()) {
      return "Donne un joli titre à ta liste de souhaits.";
    }
    return "";
  });

  const handleNameInput = (nextName: string) => {
    setOwnerName(nextName);
    if (!titleEdited()) {
      setTitle(buildDefaultWishlistTitle(nextName));
    }
  };

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setNameTouched(true);
    setTitleTouched(true);
    setSubmitError(null);

    const cleanName = ownerName().trim();
    const cleanTitle = title().trim();
    const cleanSubtitle = subtitle().trim();

    if (!cleanName || !cleanTitle) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await createList({
        ownerName: cleanName,
        title: cleanTitle,
        subtitle: cleanSubtitle || undefined,
        theme: props.theme,
        seed: props.seed,
      });

      saveOwnedList({
        slug: response.slug,
        ownerToken: response.ownerToken,
        title: response.list.title,
        ownerName: response.list.ownerName,
        theme: response.list.theme,
        updatedAt: response.list.updatedAt,
      });
      setOwnedLists(getOwnedLists());

      playConfettiPop();
      triggerConfetti();
      createFormRef?.reset();
      props.onListCreated(response);
      toast.push({
        message: "Ta liste magique est prête ! À toi de remplir la hotte 🎁",
        tone: "success",
      });
      router.navigate(buildOwnerPath(response.ownerToken));
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Impossible de créer ta liste pour le moment. Réessaie !";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyGuestLink = async (record: OwnedListRecord) => {
    const url = buildAbsoluteUrl(buildGuestPath(record.slug));
    const ok = await copyText(url);
    if (ok) {
      playBell();
      toast.push({
        message: `Lien invités copié pour « ${record.title} » !`,
        tone: "success",
      });
    } else {
      toast.push({
        message:
          "Impossible de copier automatiquement, ouvre ton atelier pour copier le lien.",
        tone: "warning",
      });
    }
  };

  return (
    <div class="page-stack">
      <section class="hero-card" aria-labelledby="home-hero-title">
        <div class="hero-grid">
          <div class="hero-copy">
            <p class="hero-kicker">
              <span aria-hidden="true">🤫</span> 100 % anti-spoil · Zéro compte requis
            </p>
            <h1 id="home-hero-title" class="hero-title">
              Ta liste de Noël magique, sans jamais te gâcher la surprise !
            </h1>
            <p class="hero-subtitle">
              Ajoute tes envies avec ou sans lien, partage l'adresse à tes proches :
              ils réservent seuls ou à plusieurs pendant que ton atelier garde les yeux bandés.
            </p>
            <p class="hero-tagline">« {props.themeSpec.tagline} »</p>
          </div>

          <div class="hero-mascot">
            <ProceduralMascot
              theme={props.theme}
              seed={props.seed}
              mode="happy"
              size={128}
              onClick={() => {
                playBell();
                triggerConfetti();
                props.onRemixSeed();
                toast.push({
                  message: `${props.themeSpec.mascotName} a secoué le décor ! ✨`,
                  tone: "festive",
                });
              }}
            />
            <span class="hero-mascot-name">{props.themeSpec.mascotName}</span>
          </div>
        </div>
      </section>

      <section class="create-card" aria-labelledby="create-list-heading">
        <form
          ref={(el) => {
            createFormRef = el;
          }}
          class="create-form"
          novalidate
          onSubmit={handleSubmit}
        >
          <div class="remix-row">
            <div>
              <h2 id="create-list-heading">Ouvrir mon atelier de Noël</h2>
              <p class="text-muted">
                En 20 secondes chrono : ton prénom, ton ambiance, et c'est parti !
              </p>
            </div>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              onClick={() => {
                playBell();
                props.onRemixSeed();
              }}
            >
              <span aria-hidden="true">🎲</span>
              Remixer le décor
            </button>
          </div>

          <div class="form-grid">
            <div class="field">
              <label for={nameId} class="field-label">
                Ton prénom <span aria-hidden="true">*</span>
              </label>
              <p id={nameHintId} class="field-hint">
                Pour que tes proches sachent à qui ils font plaisir.
              </p>
              <input
                id={nameId}
                name="ownerName"
                type="text"
                required
                maxlength={60}
                autocomplete="given-name"
                placeholder="Ex : Camille"
                class={[
                  "field-input",
                  { "user-invalid-fallback": Boolean(nameError()) },
                ]}
                value={ownerName()}
                aria-invalid={nameError() ? "true" : "false"}
                aria-describedby={
                  nameError() ? `${nameHintId} ${nameErrId}` : nameHintId
                }
                onInput={(e) => handleNameInput(e.currentTarget.value)}
                onBlur={() => setNameTouched(true)}
              />
              <p id={nameErrId} class="field-error">
                {nameError() || "Indique ton prénom pour signer ta liste de Noël."}
              </p>
            </div>

            <div class="field">
              <label for={titleId} class="field-label">
                Titre de ta liste <span aria-hidden="true">*</span>
              </label>
              <p id={titleHintId} class="field-hint">
                Pré-rempli automatiquement, mais tu peux le personnaliser !
              </p>
              <input
                id={titleId}
                name="title"
                type="text"
                required
                maxlength={90}
                placeholder="Ex : La liste de Noël de Camille"
                class={[
                  "field-input",
                  { "user-invalid-fallback": Boolean(titleError()) },
                ]}
                value={title()}
                aria-invalid={titleError() ? "true" : "false"}
                aria-describedby={
                  titleError() ? `${titleHintId} ${titleErrId}` : titleHintId
                }
                onInput={(e) => {
                  setTitleEdited(true);
                  setTitle(e.currentTarget.value);
                }}
                onBlur={() => setTitleTouched(true)}
              />
              <p id={titleErrId} class="field-error">
                {titleError() || "Donne un joli titre à ta liste de souhaits."}
              </p>
            </div>
          </div>

          <div class="field">
            <label for={subtitleId} class="field-label">
              Un petit mot pour tes lutins (optionnel)
            </label>
            <p id={subtitleHintId} class="field-hint">
              Glisse un indice sur ta taille, tes couleurs préférées ou tes envies du moment.
            </p>
            <input
              id={subtitleId}
              name="subtitle"
              type="text"
              maxlength={160}
              placeholder="Ex : Taille M, team chocolat chaud, j'adore les livres et les jeux de société !"
              class="field-input"
              value={subtitle()}
              aria-invalid="false"
              aria-describedby={subtitleHintId}
              onInput={(e) => setSubtitle(e.currentTarget.value)}
            />
          </div>

          <fieldset
            class="field"
            style={{ border: "0", padding: "0", margin: "0" }}
          >
            <legend class="field-label">
              Choisis ton univers magique (aperçu en direct !)
            </legend>
            <p class="field-hint">
              Clique sur un thème pour transformer le décor instantanément, ou clique sur « Remixer le décor » pour une variante unique.
            </p>
            <div class="theme-grid">
              <For each={THEME_LIST}>
                {(themeMeta) => (
                  <button
                    type="button"
                    class={[
                      "theme-card",
                      { "theme-card--active": props.theme === themeMeta.id },
                    ]}
                    aria-pressed={props.theme === themeMeta.id ? "true" : "false"}
                    onClick={() => {
                      playClick();
                      props.onSelectTheme(themeMeta.id);
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
                      <span>{themeMeta.name}</span>
                    </strong>
                    <span class="theme-card-desc">{themeMeta.description}</span>
                  </button>
                )}
              </For>
            </div>
          </fieldset>

          <Show when={submitError()}>
            {(err) => (
              <p class="field-error" data-visible="true" role="alert">
                {err()}
              </p>
            )}
          </Show>

          <div class="form-actions">
            <button
              type="submit"
              class="btn btn-primary btn-lg"
              disabled={submitting()}
            >
              {submitting()
                ? "Préparation du traîneau…"
                : "Créer ma liste magique ✨"}
            </button>
          </div>
        </form>
      </section>

      <Show when={ownedLists().length > 0}>
        <section
          class="owned-lists-card"
          aria-labelledby="owned-lists-heading"
        >
          <h2 id="owned-lists-heading">Mes ateliers secrets</h2>
          <p class="text-muted">
            Retrouve tes listes créées sur cet appareil en un clic.
          </p>

          <div class="owned-list-grid">
            <For each={ownedLists()} keyed={(rec) => rec.slug}>
              {(rec) => (
                <div class="owned-list-item">
                  <div class="owned-list-meta">
                    <strong>{rec().title}</strong>
                    <span class="text-muted">
                      {rec().ownerName} · {THEME_LABELS[rec().theme]}
                    </span>
                  </div>
                  <div class="owned-list-actions">
                    <button
                      type="button"
                      class="btn btn-primary btn-sm"
                      onClick={() => {
                        playClick();
                        router.navigate(buildOwnerPath(rec().ownerToken));
                      }}
                    >
                      Ouvrir mon atelier
                    </button>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      onClick={() => void handleCopyGuestLink(rec())}
                    >
                      <span aria-hidden="true">📋</span>
                      Lien proches
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </section>
      </Show>
    </div>
  );
}
