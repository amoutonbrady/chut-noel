import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  Switch,
  useContext,
} from "solid-js";
import type { OwnerWishlistView, ThemeId } from "./shared/types";
import { createRouter, RouterContext } from "./lib/router";
import {
  isSoundEnabled,
  playBell,
  playClick,
  setSoundEnabled,
} from "./lib/sound";
import { generateThemeSpec, randomSeed } from "./lib/themes";
import { prefersReducedMotion } from "./lib/topLayer";
import { EasterEggs, triggerConfetti } from "./components/EasterEggs";
import { ProceduralBackdrop } from "./components/ProceduralBackdrop";
import { ToastContext, ToastProvider } from "./components/ToastHost";
import { TopBar } from "./components/TopBar";
import { GuestPage } from "./pages/GuestPage";
import { HomePage } from "./pages/HomePage";
import { OwnerPage } from "./pages/OwnerPage";

function AppShell() {
  const router = useContext(RouterContext);
  const toast = useContext(ToastContext);

  const [theme, setTheme] = createSignal<ThemeId>("lutins");
  const [seed, setSeed] = createSignal<number>(randomSeed());
  const [paused, setPaused] = createSignal<boolean>(prefersReducedMotion());
  const [soundOn, setSoundOn] = createSignal<boolean>(isSoundEnabled());
  const [blizzardBurst, setBlizzardBurst] = createSignal<number>(0);

  const themeSpec = createMemo(() => generateThemeSpec(theme(), seed()));

  // Apply CSS variables to :root so top-layer <dialog> and [popover] inherit the live theme
  createEffect(
    () => ({
      id: theme(),
      isDark: themeSpec().isDark,
      vars: themeSpec().cssVars,
    }),
    ({ id, isDark, vars }) => {
      const rootEl = document.documentElement;
      rootEl.setAttribute("data-theme", id);
      rootEl.setAttribute("data-color-scheme", isDark ? "dark" : "light");
      for (const [key, value] of Object.entries(vars)) {
        rootEl.style.setProperty(key, value);
      }
    },
  );

  createEffect(
    () => paused(),
    (isPaused) => {
      document.documentElement.setAttribute(
        "data-animations-paused",
        isPaused ? "true" : "false",
      );
    },
  );

  const handleToggleSound = () => {
    const next = !soundOn();
    setSoundEnabled(next);
    setSoundOn(next);
    if (next) {
      playBell();
      toast.push({ message: "Sons festifs activés 🔔", tone: "info" });
    } else {
      toast.push({ message: "Sons coupés 🔕", tone: "info" });
    }
  };

  const handleTogglePaused = () => {
    const next = !paused();
    setPaused(next);
    playClick();
  };

  const handleRemixSeed = () => {
    setSeed(randomSeed());
  };

  const handleSyncLoadedList = (list: OwnerWishlistView) => {
    setTheme(list.theme);
    setSeed(list.seed);
  };

  const handleTriggerBlizzard = () => {
    setBlizzardBurst((n) => n + 1);
  };

  const modeBadge = createMemo<
    { label: string; tone: "owner" | "guest" | "home" } | undefined
  >(() => {
    const current = router.route();
    if (current.kind === "owner") {
      return { label: "🙈 Atelier Anti-Spoil", tone: "owner" };
    }
    if (current.kind === "guest") {
      return { label: "🤫 Mode Lutins", tone: "guest" };
    }
    return undefined;
  });

  return (
    <div
      class={["app-shell", { "is-paused": paused() }]}
      data-theme={theme()}
    >
      <a href="#main-content" class="skip-link visually-hidden">
        Aller au contenu principal
      </a>

      <ProceduralBackdrop
        theme={theme()}
        seed={seed()}
        paused={paused()}
        blizzardBurst={blizzardBurst()}
        onTreeEasterEgg={() => {
          triggerConfetti();
          handleTriggerBlizzard();
          toast.push({
            message:
              "🎄 Bravo ! Le sapin magique a déclenché une tempête de neige !",
            tone: "festive",
          });
        }}
      />

      <EasterEggs
        theme={theme()}
        seed={seed()}
        paused={paused()}
        onTriggerBlizzard={handleTriggerBlizzard}
        onNotice={(message) => toast.push({ message, tone: "festive" })}
      />

      <TopBar
        paused={paused()}
        onTogglePaused={handleTogglePaused}
        soundEnabled={soundOn()}
        onToggleSound={handleToggleSound}
        showRemix={router.route().kind === "home"}
        onRemixSeed={handleRemixSeed}
        modeBadge={modeBadge()}
        onNavigateHome={() => {
          playClick();
          router.navigate("/");
        }}
      />

      <main id="main-content" class="app-main">
        <Switch>
          <Match when={router.route().kind === "home"}>
            <HomePage
              theme={theme()}
              seed={seed()}
              themeSpec={themeSpec()}
              onSelectTheme={(nextTheme) => setTheme(nextTheme)}
              onRemixSeed={handleRemixSeed}
              onListCreated={(res) => {
                setTheme(res.list.theme);
                setSeed(res.list.seed);
              }}
            />
          </Match>

          <Match
            when={
              router.route().kind === "owner"
                ? (router.route() as { kind: "owner"; token: string })
                : undefined
            }
          >
            {(ownerRoute) => (
              <OwnerPage
                token={ownerRoute().token}
                onListLoaded={handleSyncLoadedList}
              />
            )}
          </Match>

          <Match
            when={
              router.route().kind === "guest"
                ? (router.route() as { kind: "guest"; slug: string })
                : undefined
            }
          >
            {(guestRoute) => (
              <GuestPage
                slug={guestRoute().slug}
                onListLoaded={handleSyncLoadedList}
              />
            )}
          </Match>

          <Match when={true}>
            <section class="empty-state">
              <span class="empty-state-icon" aria-hidden="true">
                ⛄
              </span>
              <h1>Oups, ce sentier mène au Pôle Nord !</h1>
              <p class="text-muted">
                Cette page n'existe pas. Retourne à l'accueil pour créer ta liste de Noël anti-spoil.
              </p>
              <button
                type="button"
                class="btn btn-primary"
                onClick={() => router.navigate("/")}
              >
                Retour à l'accueil ✨
              </button>
            </section>
          </Match>
        </Switch>
      </main>

      <footer
        class="text-muted"
        style={{
          "text-align": "center",
          padding: "0.75rem var(--space-page) 1.5rem",
          "font-size": "0.86rem",
        }}
      >
        <p>
          Chut ! Noël — Fait avec magie de Noël &amp; zéro spoil. Astuce : appuie
          sur <kbd>S</kbd> ou clique 5 fois sur le petit sapin magique !
        </p>
      </footer>
    </div>
  );
}

export function App() {
  const router = createRouter();
  return (
    <RouterContext value={router}>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </RouterContext>
  );
}
